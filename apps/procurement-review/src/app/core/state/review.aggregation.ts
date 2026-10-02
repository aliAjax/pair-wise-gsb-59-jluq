import type {
  Clause,
  ReviewerOpinion,
  SupplierResponse,
} from "../models/review.models";

// 与 server/aggregation.ts 保持一致：评分相差超过该阈值（不含）即分歧。
export const SCORE_DIFFERENCE_THRESHOLD = 5;
export const REQUIRED_VETO_REVIEWERS = 2;

// 取响应当前批次内每名评审员最新的一条意见；
// 澄清回复开启新批次后，旧批次意见保留审计但不再参与小组复核汇总。
export const latestOpinionsByReviewer = (
  response: SupplierResponse,
): ReviewerOpinion[] => {
  const latest = new Map<string, ReviewerOpinion>();
  response.reviews
    .filter((review) => review.batch === response.reviewRound)
    .forEach((review) => {
      const existing = latest.get(review.reviewer);
      if (
        !existing ||
        Date.parse(review.createdAt) >= Date.parse(existing.createdAt)
      ) {
        latest.set(review.reviewer, review);
      }
    });
  return Array.from(latest.values());
};

// 评分项：结论不同（非待澄清）或评分相差超过 5 分即显示分歧；
// 否决项/证明项：两名评审员的符合性结论不同即分歧。
export const hasReviewDifference = (
  response: SupplierResponse,
  clause: Pick<Clause, "type">,
): boolean => {
  const opinions = latestOpinionsByReviewer(response).filter(
    (review) => review.decision !== "clarification",
  );
  if (opinions.length < 2) {
    return false;
  }
  const decisions = new Set(opinions.map((review) => review.decision));
  if (decisions.size > 1) {
    return true;
  }
  if (clause.type === "scoring") {
    const scores = opinions.map((review) => review.score);
    return Math.max(...scores) - Math.min(...scores) > SCORE_DIFFERENCE_THRESHOLD;
  }
  return false;
};

// 否决项/证明项是否已有两名评审员在当前批次给出明确（非待澄清）结论。
export const hasVetoConsensus = (response: SupplierResponse): boolean => {
  const reviewers = new Set(
    latestOpinionsByReviewer(response)
      .filter((review) => review.decision !== "clarification")
      .map((review) => review.reviewer),
  );
  return reviewers.size >= REQUIRED_VETO_REVIEWERS;
};

// 当前批次已给出有效结论的不同评审员人数。
export const activeReviewerCount = (response: SupplierResponse): number =>
  new Set(
    latestOpinionsByReviewer(response)
      .filter((review) => review.decision !== "clarification")
      .map((review) => review.reviewer),
  ).size;

export const scoreRange = (
  response: SupplierResponse,
): { min: number; max: number } | null => {
  const scores = latestOpinionsByReviewer(response).map((review) => review.score);
  if (scores.length === 0) {
    return null;
  }
  return { min: Math.min(...scores), max: Math.max(...scores) };
};
