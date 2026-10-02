import { createFeatureSelector, createSelector } from "@ngrx/store";
import type {
  Clause,
  ClauseTreeNode,
  ComplianceStatus,
  ReviewState,
  ReviewerOpinion,
  SupplierResponse,
} from "../models/review.models";

export const selectReviewState =
  createFeatureSelector<ReviewState>("review");

export const selectClauses = createSelector(
  selectReviewState,
  (state) => state.clauses,
);

export const selectVersions = createSelector(
  selectReviewState,
  (state) => state.versions,
);

export const selectAuditLogs = createSelector(
  selectReviewState,
  (state) => state.auditLogs,
);

export const selectDashboard = createSelector(
  selectReviewState,
  (state) => state.dashboard,
);

export const selectSuppliers = createSelector(
  selectReviewState,
  (state) => state.suppliers,
);

export const selectFilters = createSelector(
  selectReviewState,
  (state) => state.filters,
);

export const selectRole = createSelector(
  selectReviewState,
  (state) => state.role,
);

export const selectSelectedSupplierIds = createSelector(
  selectReviewState,
  (state) => state.selectedSupplierIds,
);

export const selectLoading = createSelector(
  selectReviewState,
  (state) => state.loading,
);

export const selectSaving = createSelector(
  selectReviewState,
  (state) => state.saving,
);

export const selectError = createSelector(
  selectReviewState,
  (state) => state.error,
);

export const selectToast = createSelector(
  selectReviewState,
  (state) => state.toast,
);

/**
 * 现行评审批次规则：
 * - 只有 reviewRound 与响应当前批次一致的意见有效；
 * - 同一评审员在批次内多次提交时，只保留最新一条。
 */
export const effectiveReviews = (
  response: SupplierResponse,
): ReviewerOpinion[] => {
  const latestByReviewer = new Map<string, ReviewerOpinion>();
  response.reviews
    .filter((review) => review.reviewRound === response.reviewRound)
    .forEach((review) => {
      const existing = latestByReviewer.get(review.reviewer);
      if (
        !existing ||
        Date.parse(review.createdAt) > Date.parse(existing.createdAt)
      ) {
        latestByReviewer.set(review.reviewer, review);
      }
    });
  return [...latestByReviewer.values()].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
};

/**
 * 复核分歧：
 * - 符合性结论不同（“待澄清”是流程状态，不与其它结论对立）；
 * - 评分项两名评审员评分相差超过 5 分时，即使结论相同也构成分歧；
 * 结论相同但 18 分与 10 分的评分项同样进入分歧队列。
 */
export const hasReviewDifference = (
  response: SupplierResponse,
  clause?: Clause,
): boolean => {
  const reviews = effectiveReviews(response);
  const decisions = new Set(
    reviews
      .filter((review) => review.decision !== "clarification")
      .map((review) => review.decision),
  );
  if (decisions.size > 1) {
    return true;
  }
  if (clause?.type === "scoring" && reviews.length >= 2) {
    const scores = reviews.map((review) => review.score);
    return Math.max(...scores) - Math.min(...scores) > 5;
  }
  return false;
};

/** 否决项需评审员 A、B 在现行批次各自给出结论，单一意见不能进入定稿清单。 */
export const hasDualReviewerConclusions = (
  response: SupplierResponse,
): boolean => {
  const roles = new Set(effectiveReviews(response).map((review) => review.role));
  return roles.has("reviewer_a") && roles.has("reviewer_b");
};

/** 评分区间（仅取现行批次有效意见）。 */
export const scoreRange = (
  response: SupplierResponse,
): { min: number; max: number } => {
  const scores = effectiveReviews(response).map((review) => review.score);
  return {
    min: scores.length ? Math.min(...scores) : 0,
    max: scores.length ? Math.max(...scores) : 0,
  };
};

export const findResponse = (
  clause: Clause,
  supplierId: string,
): SupplierResponse | undefined =>
  clause.responses.find((response) => response.supplierId === supplierId);

const filteredClauses = createSelector(
  selectClauses,
  selectFilters,
  (clauses, filters) => {
    const keyword = filters.keyword.trim().toLowerCase();
    return clauses.filter((clause) => {
      const matchesKeyword =
        !keyword ||
        [
          clause.code,
          clause.title,
          clause.category,
          clause.requirement,
          ...clause.responses.map((response) => response.supplierName),
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      const matchesCategory =
        !filters.category || clause.category === filters.category;
      const matchesType =
        filters.type === "all" || clause.type === filters.type;
      const matchesDifference =
        !filters.differencesOnly ||
        clause.responses.some((response) =>
          hasReviewDifference(response, clause),
        );
      return (
        matchesKeyword &&
        matchesCategory &&
        matchesType &&
        matchesDifference
      );
    });
  },
);

export const selectFilteredClauses = filteredClauses;

export const selectClauseTree = createSelector(
  selectClauses,
  filteredClauses,
  (allClauses, matchingClauses): ClauseTreeNode[] => {
    if (matchingClauses.length === 0) {
      return [];
    }
    const includedIds = new Set<string>();
    const byId = new Map(allClauses.map((clause) => [clause.id, clause]));
    matchingClauses.forEach((clause) => {
      includedIds.add(clause.id);
      let parentId = clause.parentId;
      while (parentId && !includedIds.has(parentId)) {
        includedIds.add(parentId);
        parentId = byId.get(parentId)?.parentId;
      }
    });
    const selected = allClauses
      .filter((clause) => includedIds.has(clause.id))
      .sort((a, b) => a.order - b.order);
    const nodeMap = new Map<string, ClauseTreeNode>();
    selected.forEach((clause) => {
      nodeMap.set(clause.id, { ...clause, children: [] });
    });
    const roots: ClauseTreeNode[] = [];
    selected.forEach((clause) => {
      const node = nodeMap.get(clause.id);
      if (!node) {
        return;
      }
      if (clause.parentId && nodeMap.has(clause.parentId)) {
        nodeMap.get(clause.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  },
);

export const selectDifferences = createSelector(
  selectClauses,
  (clauses) =>
    clauses.flatMap((clause) =>
      clause.responses
        .filter((response) => hasReviewDifference(response, clause))
        .map((response) => ({ clause, response })),
    ),
);

export const selectPendingClarifications = createSelector(
  selectClauses,
  (clauses) =>
    clauses.flatMap((clause) =>
      clause.responses.flatMap((response) =>
        response.clarifications
          .filter(
            (clarification) =>
              clarification.status === "open" ||
              clarification.status === "overdue",
          )
          .map((clarification) => ({
            clause,
            response,
            clarification,
          })),
      ),
    ),
);

export const selectReusedProofs = createSelector(
  selectClauses,
  (clauses) => {
    const counts = new Map<
      string,
      Array<{ clause: Clause; response: SupplierResponse }>
    >();
    clauses.forEach((clause) => {
      clause.responses.forEach((response) => {
        const current = counts.get(response.proofFingerprint) ?? [];
        current.push({ clause, response });
        counts.set(response.proofFingerprint, current);
      });
    });
    return Array.from(counts.entries())
      .filter(([, entries]) => entries.length > 1)
      .map(([fingerprint, entries]) => ({ fingerprint, entries }));
  },
);

/** 否决项缺少两名评审员当前批次结论的响应清单。 */
export const selectMandatoryPending = createSelector(
  selectClauses,
  (clauses) =>
    clauses
      .filter((clause) => clause.type === "mandatory")
      .flatMap((clause) =>
        clause.responses
          .filter((response) => !hasDualReviewerConclusions(response))
          .map((response) => ({ clause, response })),
      ),
);

export const responseDecisionSummary = (
  response: SupplierResponse,
): ComplianceStatus[] =>
  Array.from(new Set(effectiveReviews(response).map((review) => review.decision)));
