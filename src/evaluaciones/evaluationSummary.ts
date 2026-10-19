import { averageNumber } from './format';
import { CATEGORY_LABELS } from './types';
import type { EvaluationQuestion, EvaluationResponse } from './types';

export type CategorySummary = {
  key: string;
  label: string;
  questions: EvaluationQuestion[];
  selfScore: number | null;
  collectiveScore: number | null;
};

export function categoryKeys(questions: EvaluationQuestion[]) {
  const known = Object.keys(CATEGORY_LABELS);
  const rank = (key: string) => (known.indexOf(key) < 0 ? known.length : known.indexOf(key));
  return [...new Set(questions.map((question) => question.category))].sort((a, b) => rank(a) - rank(b));
}

export function buildEvaluationSummary(
  questions: EvaluationQuestion[],
  responses: EvaluationResponse[],
  completedEvaluatorIds: Set<string>,
  evaluatedId: string | null,
) {
  const eligible = responses.filter((response) => response.evaluated_id === evaluatedId && completedEvaluatorIds.has(response.evaluator_id));
  const self = eligible.filter((response) => response.evaluator_id === evaluatedId);
  const peer = eligible.filter((response) => response.evaluator_id !== evaluatedId);
  const categories: CategorySummary[] = categoryKeys(questions).map((key) => {
    const categoryQuestions = questions.filter((question) => question.category === key);
    const ids = new Set(categoryQuestions.map((question) => question.id));
    return {
      key,
      label: CATEGORY_LABELS[key] ?? key,
      questions: categoryQuestions,
      selfScore: averageNumber(self.filter((response) => ids.has(response.question_id)).map((response) => Number(response.score))),
      collectiveScore: averageNumber(peer.filter((response) => ids.has(response.question_id)).map((response) => Number(response.score))),
    };
  });
  const questionScores = new Map(questions.map((question) => [question.id, {
    self: averageNumber(self.filter((response) => response.question_id === question.id).map((response) => Number(response.score))),
    collective: averageNumber(peer.filter((response) => response.question_id === question.id).map((response) => Number(response.score))),
  }]));
  return {
    selfScore: averageNumber(self.map((response) => Number(response.score))),
    collectiveScore: averageNumber(peer.map((response) => Number(response.score))),
    peerCount: new Set(peer.map((response) => response.evaluator_id)).size,
    categories,
    questionScores,
  };
}
