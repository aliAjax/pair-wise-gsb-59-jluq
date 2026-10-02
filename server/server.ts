import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { createHash } from "node:crypto";
import {
  activeReviewerCount,
  buildSubmissionFingerprint,
  hasDuplicateSubmission,
  hasReviewDifference,
  hasVetoConsensus,
  latestOpinionsByReviewer,
} from "./aggregation";
import {
  createAudit,
  createClarificationId,
  createOpinionId,
  reviewDataStore,
} from "./data";
import { typeDefs } from "./schema";
import type {
  AssessmentInput,
  ClarificationInput,
  ClarificationResponseInput,
  Clause,
  DashboardStats,
  FinalizeVersionInput,
  ReviewDatabase,
  ReviewRole,
  SupplierResponse,
} from "./types";

const VETO_CLAUSE_TYPES = new Set(["mandatory", "evidence"]);

const getDashboard = (database: ReviewDatabase): DashboardStats => {
  const clauseById = new Map(
    database.clauses.map((clause) => [clause.id, clause]),
  );
  const differences = database.responses.filter((response) => {
    const clause = clauseById.get(response.clauseId);
    return clause ? hasReviewDifference(response, clause) : false;
  }).length;
  const proofCounts = database.responses.reduce<Record<string, number>>(
    (counts, response) => {
      if (response.proofFingerprint) {
        counts[response.proofFingerprint] =
          (counts[response.proofFingerprint] ?? 0) + 1;
      }
      return counts;
    },
    {},
  );
  const activeVersion =
    database.versions.find((version) => version.status === "draft") ??
    database.versions[0];

  return {
    totalClauses: database.clauses.length,
    mandatoryCount: database.clauses.filter(
      (clause) => clause.type === "mandatory",
    ).length,
    pendingReviews: database.responses.filter(
      // 澄清回复后旧意见失效，不足两名评审员当前批次结论即回到待复核。
      (response) => activeReviewerCount(response) < 2,
    ).length,
    differences,
    overdueClarifications: database.responses.reduce(
      (count, response) =>
        count +
        response.clarifications.filter(
          (clarification) => clarification.status === "overdue",
        ).length,
      0,
    ),
    reusedProofs: Object.values(proofCounts).filter((count) => count > 1)
      .length,
    activeVersion: activeVersion
      ? `${activeVersion.version} ${activeVersion.label}`
      : "未建立版本",
  };
};

const requireRole = (role: ReviewRole, allowed: ReviewRole[]): void => {
  if (!allowed.includes(role)) {
    throw new Error("当前角色无权执行此操作。");
  }
};

// 根据当前批次各评审员最新意见重算响应状态。
// 不足两名评审员有效结论时回到待复核；结论一致时采用该结论，否则保持待评审由小组复核。
const recomputeResponseStatus = (response: SupplierResponse): void => {
  const decided = latestOpinionsByReviewer(response).filter(
    (review) => review.decision !== "clarification",
  );
  const reviewers = new Set(decided.map((review) => review.reviewer));
  if (reviewers.size < 2) {
    response.status = "pending";
    return;
  }
  const decisions = new Set(decided.map((review) => review.decision));
  response.status = decisions.size === 1 ? decided[0].decision : "pending";
};

const resolvers = {
  Query: {
    workspace: () => {
      const database = reviewDataStore.snapshot();
      return {
        ...database,
        dashboard: getDashboard(database),
      };
    },
    dashboard: () => getDashboard(reviewDataStore.snapshot()),
  },
  Clause: {
    responses: (clause: Clause, _args: unknown, context: { database: ReviewDatabase }) =>
      context.database.responses.filter(
        (response) => response.clauseId === clause.id,
      ),
  },
  Mutation: {
    submitAssessment: (
      _parent: unknown,
      { input }: { input: AssessmentInput },
    ) => {
      requireRole(input.role, ["reviewer_a", "reviewer_b", "chair"]);
      if (input.comment.trim().length < 6) {
        throw new Error("评审意见至少需要 6 个字符。");
      }
      return reviewDataStore.mutate((database) => {
        const response = database.responses.find(
          (item) => item.id === input.responseId,
        );
        if (!response) {
          throw new Error("供应商响应不存在。");
        }
        const clause = database.clauses.find(
          (item) => item.id === response.clauseId,
        );
        if (!clause) {
          throw new Error("对应技术条款不存在。");
        }
        if (input.score < 0 || input.score > clause.weight) {
          throw new Error(`评分必须在 0 至 ${clause.weight} 之间。`);
        }
        if (
          clause.type === "scoring" &&
          input.decision === "compliant" &&
          input.score === 0
        ) {
          throw new Error("评分项判定为符合时必须填写评分。");
        }
        const reviewer = input.reviewer.trim();
        const fingerprint = buildSubmissionFingerprint(response, {
          ...input,
          reviewer,
        });
        // 同一评审员在当前批次重复提交完全相同的响应，按提交指纹去重，不再写入。
        if (hasDuplicateSubmission(response, fingerprint)) {
          throw new Error("与最近一次提交完全相同，已按提交指纹去重。");
        }
        // 每名评审员在当前批次只保留最新一条意见；旧批次（澄清前）意见保留审计。
        response.reviews = response.reviews.filter(
          (review) =>
            !(
              review.batch === response.reviewRound &&
              review.reviewer === reviewer
            ),
        );
        const opinion = {
          id: createOpinionId(),
          responseId: response.id,
          reviewer,
          role: input.role,
          decision: input.decision,
          score: input.score,
          comment: input.comment.trim(),
          createdAt: new Date().toISOString(),
          batch: response.reviewRound,
          submissionFingerprint: fingerprint,
        };
        response.reviews.push(opinion);
        recomputeResponseStatus(response);
        createAudit(
          database,
          opinion.reviewer,
          "提交独立意见",
          response.id,
          `${clause.code} ${clause.title} 第 ${response.reviewRound} 批次判定为 ${input.decision}，评分 ${input.score}。`,
        );
        return opinion;
      });
    },
    requestClarification: (
      _parent: unknown,
      { input }: { input: ClarificationInput },
    ) =>
      reviewDataStore.mutate((database) => {
        const response = database.responses.find(
          (item) => item.id === input.responseId,
        );
        if (!response) {
          throw new Error("供应商响应不存在。");
        }
        if (input.requestText.trim().length < 6) {
          throw new Error("澄清要求至少需要 6 个字符。");
        }
        const requestedAt = new Date();
        const dueAt = new Date(input.dueAt);
        if (Number.isNaN(dueAt.getTime()) || dueAt <= requestedAt) {
          throw new Error("澄清截止时间必须晚于当前时间。");
        }
        const maximumDueAt = new Date(requestedAt);
        maximumDueAt.setDate(maximumDueAt.getDate() + 7);
        if (dueAt > maximumDueAt) {
          throw new Error("澄清期限不得超过 7 个自然日。");
        }
        const round =
          Math.max(
            0,
            ...response.clarifications.map((item) => item.round),
          ) + 1;
        const clarification = {
          id: createClarificationId(),
          responseId: response.id,
          clauseId: response.clauseId,
          round,
          requestText: input.requestText.trim(),
          requestedAt: requestedAt.toISOString(),
          dueAt: dueAt.toISOString(),
          status: "open" as const,
        };
        response.clarifications.push(clarification);
        response.status = "clarification";
        createAudit(
          database,
          input.actor,
          "发起澄清",
          clarification.id,
          `${response.supplierName} ${response.clauseId} 第 ${round} 轮澄清已发起。`,
        );
        return clarification;
      }),
    respondClarification: (
      _parent: unknown,
      { input }: { input: ClarificationResponseInput },
    ) =>
      reviewDataStore.mutate((database) => {
        const clarification = database.responses
          .flatMap((response) => response.clarifications)
          .find((item) => item.id === input.clarificationId);
        if (!clarification) {
          throw new Error("澄清记录不存在。");
        }
        if (input.responseText.trim().length < 6) {
          throw new Error("澄清回复至少需要 6 个字符。");
        }
        clarification.supplierResponse = input.responseText.trim();
        clarification.respondedAt = new Date().toISOString();
        clarification.status = "responded";
        const response = database.responses.find(
          (item) => item.id === clarification.responseId,
        );
        if (response) {
          // 澄清记录更新后开启新批次：受影响供应商的既有评审结论失效并回到待复核。
          // 旧意见保留在历史批次供审计，但不再计入当前批次的复核汇总。
          response.reviewRound += 1;
          response.status = "pending";
          createAudit(
            database,
            input.actor,
            "澄清触发重新复核",
            response.id,
            `第 ${clarification.round} 轮澄清已回复，第 ${response.reviewRound} 批次评审重新计票，前序 ${response.reviews.length} 条意见失效待复核。`,
          );
        }
        createAudit(
          database,
          input.actor,
          "回复澄清",
          clarification.id,
          `第 ${clarification.round} 轮澄清已回复，等待两名评审员重新复核。`,
        );
        return clarification;
      }),
    finalizeVersion: (
      _parent: unknown,
      { input }: { input: FinalizeVersionInput },
    ) =>
      reviewDataStore.mutate((database) => {
        requireRole(input.role, ["chair"]);
        if (input.label.trim().length < 4) {
          throw new Error("版本名称至少需要 4 个字符。");
        }
        const blockingClarifications = database.responses
          .flatMap((response) => response.clarifications)
          .filter(
            (clarification) =>
              clarification.status === "open" ||
              clarification.status === "overdue",
          );
        if (blockingClarifications.length > 0) {
          throw new Error(
            `仍有 ${blockingClarifications.length} 项未完成澄清，不能定稿。`,
          );
        }
        // 否决项/证明项必须有两名评审员在当前批次给出一致结论才能进入定稿清单，
        // 任一名评审员的单一意见不足以定稿。
        const clauseById = new Map(
          database.clauses.map((clause) => [clause.id, clause]),
        );
        const vetoResponses = database.responses.filter((response) => {
          const clause = clauseById.get(response.clauseId);
          return clause ? VETO_CLAUSE_TYPES.has(clause.type) : false;
        });
        const unresolvedVetoes = vetoResponses.filter(
          (response) =>
            !hasVetoConsensus(response) || hasReviewDifference(response, {
              type: clauseById.get(response.clauseId)?.type ?? "mandatory",
            }),
        );
        if (unresolvedVetoes.length > 0) {
          throw new Error(
            `${unresolvedVetoes.length} 项否决/证明项尚需两名评审员在当前批次给出一致结论，不能定稿。`,
          );
        }
        const maxVersion =
          database.versions.reduce((maximum, version) => {
            const numeric = Number(version.version.replace(/\D/g, ""));
            return Number.isFinite(numeric)
              ? Math.max(maximum, numeric)
              : maximum;
          }, 0) + 1;
        database.versions.forEach((version) => {
          version.status = "finalized";
        });
        const hashInput = JSON.stringify({
          clauses: database.clauses.map((clause) => [
            clause.id,
            clause.code,
            clause.order,
          ]),
          responses: database.responses.map((response) => [
            response.id,
            response.status,
            response.reviewRound,
            latestOpinionsByReviewer(response).map((review) => [
              review.reviewer,
              review.decision,
              review.score,
              review.batch,
            ]),
          ]),
        });
        const contentHash = createHash("sha256").update(hashInput).digest("hex").slice(0, 8);
        const version = {
          id: `VER-${Date.now()}`,
          version: `V${maxVersion}`,
          label: input.label.trim(),
          status: "finalized" as const,
          createdAt: new Date().toISOString(),
          createdBy: input.actor,
          signedBy: [input.actor],
          clauseCount: database.clauses.length,
          responseCount: database.responses.length,
          contentHash,
        };
        database.versions.unshift(version);
        createAudit(
          database,
          input.actor,
          "汇总签字定稿",
          version.id,
          `${version.version} ${version.label} 已锁定，签署人 ${input.actor}。`,
        );
        return version;
      }),
    resetReviewData: () => {
      reviewDataStore.reset();
      return true;
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

async function startServer(): Promise<void> {
  const { url } = await startStandaloneServer(server, {
    listen: { port: 18462, host: "0.0.0.0" },
    context: async () => ({
      database: reviewDataStore.snapshot(),
    }),
  });
  console.log(`GraphQL mock server ready at ${url}`);
}

void startServer();
