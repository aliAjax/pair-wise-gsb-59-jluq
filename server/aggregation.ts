import type {
  Clause,
  ReviewerOpinion,
  SupplierResponse,
} from "./types";

// 评分相差超过该阈值（不含）即判定为评分分歧。
export const SCORE_DIFFERENCE_THRESHOLD = 5;

// 否决项进入定稿清单所需的独立评审结论人数。
export const REQUIRED_VETO_REVIEWERS = 2;

// 取响应当前批次内每名评审员最新的一条意见。
// 澄清回复会开启新批次，旧批次意见保留用于审计但不再参与复核汇总。
export const latestOpinionsByReviewer = (
  response: SupplierResponse,
): ReviewerOpinion[] => {
  const batch = response.reviewRound;
  const latest = new Map<string, ReviewerOpinion>();
  response.reviews
    .filter((review) => review.batch === batch)
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

// 提交指纹：同一评审员在同一批次提交完全相同的结论/评分/意见视为重复提交。
// 不同评审员即使结论一致也保留各自意见，不参与相互去重。
export const buildSubmissionFingerprint = (
  response: SupplierResponse,
  input: { reviewer: string; decision: string; score: number; comment: string },
): string =>
  [
    response.id,
    response.reviewRound,
    input.reviewer.trim(),
    input.decision,
    input.score,
    input.comment.trim(),
  ].join("|");

export const hasDuplicateSubmission = (
  response: SupplierResponse,
  fingerprint: string,
): boolean =>
  response.reviews.some(
    (review) =>
      review.batch === response.reviewRound &&
      review.submissionFingerprint === fingerprint,
  );

// 评分项：结论不同（非待澄清）或评分相差超过 5 分即显示分歧；
// 否决项/证明项：两名评审员的符合性结论不同即分歧。
// 组长不再只看“结论是否相同”，例如同判符合但 18 分与 10 分也会暴露分差。
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

// 否决项必须有两名评审员各自在当前批次给出明确（非待澄清）结论才能进定稿清单。
export const hasVetoConsensus = (response: SupplierResponse): boolean => {
  const decided = latestOpinionsByReviewer(response).filter(
    (review) => review.decision !== "clarification",
  );
  const reviewers = new Set(decided.map((review) => review.reviewer));
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
