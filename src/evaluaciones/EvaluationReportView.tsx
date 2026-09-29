import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ClipboardCheck, LoaderCircle, Send } from "lucide-react";
import { sb } from "../lib/supabase";
import {
  CATEGORY_LABELS,
  SCORE_OPTIONS,
  type EvaluationAssignment,
  type EvaluationComment,
  type EvaluationCycle,
  type EvaluationEmployee,
  type EvaluationQuestion,
  type EvaluationResponse,
  type EvaluationFinalReport,
  type EvaluationTask,
  type EvaluationType,
} from './types';
import { formatScore, formatAverage } from "./format";

export function EvaluationReportView({ report, cycle, employee, onBack }: { report: EvaluationFinalReport; cycle?: EvaluationCycle; employee?: EvaluationEmployee; onBack: () => void }) {
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
  const [responses, setResponses] = useState<EvaluationResponse[]>([]);
  const [comments, setComments] = useState<EvaluationComment[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [questionsResult, responsesResult, commentsResult] = await Promise.all([
          sb.from('evaluation_questions').select('*').order('question_order'),
          sb.from('evaluation_responses').select('*').eq('cycle_id', report.cycle_id).eq('evaluated_id', report.employee_id),
          sb.from('evaluation_comments').select('*').eq('cycle_id', report.cycle_id).eq('evaluated_id', report.employee_id),
        ]);
        const failure = [questionsResult, responsesResult, commentsResult].find((result) => result.error);
        if (failure?.error) throw failure.error;
        if (!live) return;
        setQuestions((questionsResult.data ?? []) as EvaluationQuestion[]);
        setResponses((responsesResult.data ?? []) as EvaluationResponse[]);
        setComments((commentsResult.data ?? []) as EvaluationComment[]);
      } catch (loadError) {
        if (live) setError((loadError as Error).message);
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [report.cycle_id, report.employee_id]);

  const categories = useMemo(() => {
    const result = new Map<string, { self: number[]; peer: number[] }>();
    for (const question of questions) {
      const values = result.get(question.category) ?? { self: [], peer: [] };
      for (const response of responses.filter((item) => item.question_id === question.id)) values[response.evaluation_type].push(Number(response.score));
      result.set(question.category, values);
    }
    return [...result.entries()];
  }, [questions, responses]);

  return <div className="evaluation-module evaluation-report-view"><header className="page-header evaluation-report-hero"><div><button className="back-link" onClick={onBack}><ArrowLeft size={17} /> Volver al panel</button><p className="eyebrow">REPORTE FINAL</p><h1>{employee?.full_name || 'Persona evaluada'}</h1><p className="evaluation-report-meta"><span>{cycle?.name || 'Ciclo histórico'}</span>{employee?.position && <><i />{employee.position}</>}</p></div></header>{error && <p className="error" role="alert">{error}</p>}{busy ? <div className="evaluation-loading"><LoaderCircle className="spin" size={22} /> Cargando reporte…</div> : <><section className="evaluation-report-summary"><div><span>Autoevaluación</span><strong>{formatScore(report.self_score)}</strong><small>Percepción propia</small></div><div><span>Evaluación colectiva</span><strong>{formatScore(report.collective_score)}</strong><small>Percepción del equipo</small></div><div className={report.final_score === null ? 'is-pending' : ''}><span>Resultado final</span><strong>{formatScore(report.final_score)}</strong><small>{report.final_score === null ? 'Pendiente de cierre' : 'Resultado consolidado'}</small></div></section><section className="evaluation-report-card"><div className="evaluation-report-card-heading"><div><h2>Resultados por categoría</h2></div></div><div className="evaluation-category-results">{categories.map(([category, values]) => <div className="evaluation-category-result" key={category}><div className="evaluation-category-title"><strong>{CATEGORY_LABELS[category] ?? category}</strong></div><div className="evaluation-category-scores"><div><span>Autoevaluación</span><strong>{formatAverage(values.self)}</strong></div><div><span>Evaluación colectiva</span><strong>{formatAverage(values.peer)}</strong></div></div></div>)}</div></section><section className="evaluation-report-comments"><article><div className="evaluation-comment-heading"><span className="evaluation-comment-icon positive"><Check size={16} /></span><div><p className="evaluation-kicker">LO QUE DESTACA</p><h2>Fortalezas</h2></div></div><p className="evaluation-report-text">{report.strengths || comments.find((comment) => comment.strengths)?.strengths || 'Sin información registrada.'}</p></article><article><div className="evaluation-comment-heading"><span className="evaluation-comment-icon opportunity">↗</span><div><p className="evaluation-kicker">SIGUIENTE PASO</p><h2>Oportunidades</h2></div></div><p className="evaluation-report-text">{report.opportunities || comments.find((comment) => comment.opportunities)?.opportunities || 'Sin información registrada.'}</p></article></section>{report.admin_summary && <section className="evaluation-report-card evaluation-admin-summary"><div className="evaluation-report-card-heading"><div><p className="evaluation-kicker">NOTA DE ADMINISTRACIÓN</p><h2>Resumen administrativo</h2></div></div><p className="evaluation-report-text">{report.admin_summary}</p></section>}</>}</div>;
}
