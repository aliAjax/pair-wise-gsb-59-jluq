import type {
  Clause,
  ReviewDatabase,
  ReviewerOpinion,
  SupplierResponse,
} from "./types";

/**
 * 现行评审批次规则：
 * - 每条供应商响应只有当前 reviewRound 内的意见有效，澄清回复后轮次加一，旧意见失效。
 * - 同一评审员在同一批次内多次提交时，只保留批次内最新一条意见。
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
 * 分歧判定：
 * - 符合性结论不同（“待澄清”为流程状态，不参与结论对立比较）；
 * - 评分项中两名评审员的评分相差超过 5 分，即使结论一致也构成分歧。
 */
export const hasBatchDifference = (
  response: SupplierResponse,
  clause: Clause | undefined,
): boolean => {
  const reviews = effectiveReviews(response);
  const conclusions = new Set(
    reviews
      .filter((review) => review.decision !== "clarification")
      .map((review) => review.decision),
  );
  if (conclusions.size > 1) {
    return true;
  }
  if (clause?.type === "scoring" && reviews.length >= 2) {
    const scores = reviews.map((review) => review.score);
    if (Math.max(...scores) - Math.min(...scores) > 5) {
      return true;
    }
  }
  return false;
};

/** 否决项必须由评审员 A、B 两名评审员在当前批次各自给出结论。 */
export const hasDualReviewerConclusions = (
  response: SupplierResponse,
): boolean => {
  const roles = new Set(effectiveReviews(response).map((review) => review.role));
  return roles.has("reviewer_a") && roles.has("reviewer_b");
};

export const clauseById = (
  database: ReviewDatabase,
  clauseId: string,
): Clause | undefined =>
  database.clauses.find((clause) => clause.id === clauseId);
