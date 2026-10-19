import { ArrowLeft, Download } from 'lucide-react';
import { formatAverage, formatScore } from './format';
import { CATEGORY_LABELS, SCORE_OPTIONS } from './types';
import type { EvaluationComment, EvaluationCycle, EvaluationEmployee, EvaluationQuestion, EvaluationResponse } from './types';

export function EvaluationResponseDetail({ cycle, evaluator, evaluated, questions, responses, comment, onBack, onDownload }: {
  cycle: EvaluationCycle;
  evaluator?: EvaluationEmployee;
  evaluated?: EvaluationEmployee;
  questions: EvaluationQuestion[];
  responses: EvaluationResponse[];
  comment?: EvaluationComment;
  onBack: () => void;
  onDownload: () => void;
}) {
  const byQuestion = new Map(responses.map((response) => [response.question_id, Number(response.score)]));
  const categories = [...new Set(questions.map((question) => question.category))];
  return <div className="evaluation-module evaluation-response-detail">
    <div className="page-header"><div><button type="button" className="back-link" onClick={onBack}><ArrowLeft size={17} /> Volver al resumen</button><p className="eyebrow">RESPUESTA INDIVIDUAL</p><h1>{evaluator?.full_name || 'Colaborador'}</h1><p>{evaluator?.id === cycle.evaluated_employee_id ? 'Autoevaluación' : 'Evaluación colectiva'} de {evaluated?.full_name || 'la persona evaluada'} · {cycle.name}</p></div><button type="button" className="secondary" onClick={onDownload}><Download size={16} /> Descargar respuesta Excel</button></div>
    <section className="evaluation-report-summary"><div><span>Preguntas respondidas</span><strong>{byQuestion.size} / {questions.length}</strong></div><div><span>Promedio de respuestas</span><strong>{formatAverage([...byQuestion.values()])}</strong></div><div><span>Tipo</span><strong className="evaluation-response-type">{evaluator?.id === cycle.evaluated_employee_id ? 'Autoevaluación' : 'Colectiva'}</strong></div></section>
    {(comment?.comment || comment?.strengths || comment?.opportunities) && <section className="evaluation-report-card"><div className="evaluation-report-card-heading"><h2>Comentarios</h2></div><div className="evaluation-response-comments">{comment.comment && <div><h3>Comentario general</h3><p>{comment.comment}</p></div>}{comment.strengths && <div><h3>Fortalezas</h3><p>{comment.strengths}</p></div>}{comment.opportunities && <div><h3>Oportunidades</h3><p>{comment.opportunities}</p></div>}</div></section>}
    <section className="evaluation-report-card"><div className="evaluation-report-card-heading"><div><h2>Todas las respuestas</h2><p>{questions.length} reactivos del cuestionario</p></div></div>{categories.map((category) => {
      const categoryQuestions = questions.filter((question) => question.category === category);
      return <div className="evaluation-response-category" key={category}><h3>{CATEGORY_LABELS[category] ?? category}</h3><div className="evaluation-response-questions">{categoryQuestions.map((question) => {
        const score = byQuestion.get(question.id);
        const selectedValue = score === undefined ? undefined : question.is_inverted ? 1.25 - score : score;
        const answer = SCORE_OPTIONS.find((option) => Math.abs(option.value - (selectedValue ?? -1)) < 0.001)?.label;
        return <div className="evaluation-response-question" key={question.id}><span>{question.question_order ?? '·'}</span><div><strong>{question.question_text}</strong><small>{score === undefined ? 'Sin respuesta' : answer ?? 'Respuesta registrada'}</small></div><b>{score === undefined ? '—' : formatScore(score)}</b></div>;
      })}</div></div>;
    })}</section>
  </div>;
}
