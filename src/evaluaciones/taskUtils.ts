import type { EvaluationComment, EvaluationQuestion, EvaluationResponse } from "./types";

export function hasRequiredComments(comment?: EvaluationComment) {
  return Boolean(comment?.strengths?.trim() && comment?.opportunities?.trim());
}

export function hasAllResponses(responses: EvaluationResponse[], questions: EvaluationQuestion[]) {
  if (!questions.length) return false;
  const answered = new Set(responses.map((response) => response.question_id));
  return questions.every((question) => answered.has(question.id));
}
