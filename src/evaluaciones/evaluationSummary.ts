import { averageNumber } from './format';
import { CATEGORY_LABELS } from './types';
import type { EvaluationComment, EvaluationCycle, EvaluationEmployee, EvaluationFinalReport, EvaluationQuestion, EvaluationResponse } from './types';

export type CategorySummary = {
  key: string;
  label: string;
  questions: EvaluationQuestion[];
  selfScore: number | null;
  collectiveScore: number | null;
};

export function buildEvaluationSummary(
  questions: EvaluationQuestion[],
  responses: EvaluationResponse[],
  completedEvaluatorIds: Set<string>,
  evaluatedId: string | null,
) {
  const eligible = responses.filter((response) => response.evaluated_id === evaluatedId && completedEvaluatorIds.has(response.evaluator_id));
  const self = eligible.filter((response) => response.evaluator_id === evaluatedId);
  const peer = eligible.filter((response) => response.evaluator_id !== evaluatedId);
  const categoryKeys = [...new Set(questions.map((question) => question.category))]
    .sort((a, b) => {
      const known = Object.keys(CATEGORY_LABELS);
      return (known.indexOf(a) < 0 ? known.length : known.indexOf(a)) - (known.indexOf(b) < 0 ? known.length : known.indexOf(b));
    });
  const categories: CategorySummary[] = categoryKeys.map((key) => {
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

type ExportParticipant = { evaluatorId: string; employee?: EvaluationEmployee; status: string };

export function downloadEvaluationSummaryCsv({ cycle, evaluated, participants, questions, responses, comments, report, selfScore, collectiveScore, fileLabel }: {
  cycle: EvaluationCycle;
  evaluated?: EvaluationEmployee;
  participants: ExportParticipant[];
  questions: EvaluationQuestion[];
  responses: EvaluationResponse[];
  comments: EvaluationComment[];
  report?: EvaluationFinalReport;
  selfScore: number | null;
  collectiveScore: number | null;
  fileLabel?: string;
}) {
  const categories = [...new Set(questions.map((question) => question.category))];
  const headers = [
    'Ciclo', 'Evaluado', 'Área del evaluado', 'Evaluador', 'Área del evaluador', 'Tipo de evaluación', 'Estado',
    ...questions.map((question) => question.question_text),
    'Top 1 fortaleza', 'Top 2 fortaleza', 'Top 3 fortaleza',
    'Top 1 oportunidad', 'Top 2 oportunidad', 'Top 3 oportunidad',
    ...categories.map((category) => CATEGORY_LABELS[category] ?? category),
    'Comentario general', 'Fortalezas', 'Oportunidades',
    'Autoevaluación consolidada', 'Evaluación colectiva consolidada', 'Resultado final', 'Resumen administrativo',
  ];
  const rows = participants.map(({ evaluatorId, employee, status }) => {
    const ownResponses = responses.filter((response) => response.evaluator_id === evaluatorId && response.evaluated_id === cycle.evaluated_employee_id);
    const byQuestion = new Map(ownResponses.map((response) => [response.question_id, Number(response.score)]));
    const scored = questions.filter((question) => byQuestion.has(question.id));
    const top = (descending: boolean) => [...scored]
      .sort((a, b) => (descending ? 1 : -1) * ((byQuestion.get(b.id) ?? 0) - (byQuestion.get(a.id) ?? 0)))
      .slice(0, 3)
      .map((question) => `${question.question_text} (${Math.round((byQuestion.get(question.id) ?? 0) * 100)}%)`);
    const strengths = top(true);
    const opportunities = top(false);
    const comment = comments.find((item) => item.evaluator_id === evaluatorId && item.evaluated_id === cycle.evaluated_employee_id);
    return [
      cycle.name, evaluated?.full_name ?? '', evaluated?.department ?? '', employee?.full_name ?? '', employee?.department ?? '',
      evaluatorId === cycle.evaluated_employee_id ? 'Autoevaluación' : 'Colectiva', status,
      ...questions.map((question) => byQuestion.has(question.id) ? Math.round((byQuestion.get(question.id) ?? 0) * 100) + '%' : ''),
      ...Array.from({ length: 3 }, (_, index) => strengths[index] ?? ''),
      ...Array.from({ length: 3 }, (_, index) => opportunities[index] ?? ''),
      ...categories.map((category) => {
        const values = questions.filter((question) => question.category === category && byQuestion.has(question.id))
          .map((question) => byQuestion.get(question.id) ?? 0);
        const score = averageNumber(values);
        return score === null ? '' : `${Math.round(score * 100)}%`;
      }),
      comment?.comment ?? '', comment?.strengths ?? '', comment?.opportunities ?? '',
      selfScore === null ? '' : `${Math.round(selfScore * 100)}%`,
      collectiveScore === null ? '' : `${Math.round(collectiveScore * 100)}%`,
      report?.final_score === null || report?.final_score === undefined ? '' : `${Math.round(Number(report.final_score) * 100)}%`,
      report?.admin_summary ?? '',
    ];
  });
  const csv = '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  const slug = (fileLabel || cycle.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase() || 'ciclo';
  link.download = `resumen_evaluacion_${slug}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function csvCell(value: string) {
  const plain = value.replace(/\r\n?/g, '\n');
  const safe = /^[\s]*[=+\-@\t\r]/.test(plain) ? `'${plain}` : plain;
  return `"${safe.replace(/"/g, '""')}"`;
}
