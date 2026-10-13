import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, ClipboardCheck, Download, LoaderCircle } from 'lucide-react';
import { sb } from '../lib/supabase';
import { formatDate, formatScore } from './format';
import { hasAllResponses, hasRequiredComments } from './taskUtils';
import { buildEvaluationSummary, downloadEvaluationSummaryCsv } from './evaluationSummary';
import { EvaluationResponseDetail } from './EvaluationResponseDetail';
import type { EvaluationAssignment, EvaluationComment, EvaluationCycle, EvaluationEmployee, EvaluationQuestion, EvaluationResponse, EvaluationFinalReport } from './types';

type Participant = {
  assignment: EvaluationAssignment;
  employee?: EvaluationEmployee;
  answered: number;
  complete: boolean;
  started: boolean;
};

export function EvaluationCycleDetail({ cycle, report, onBack, onEdit, onReport, onNotify, onClose, notifying, closing }: {
  cycle: EvaluationCycle;
  report?: EvaluationFinalReport;
  onBack: () => void;
  onEdit: () => void;
  onReport: () => void;
  onNotify: () => void;
  onClose: () => void;
  notifying: boolean;
  closing: boolean;
}) {
  const [assignments, setAssignments] = useState<EvaluationAssignment[]>([]);
  const [employees, setEmployees] = useState<EvaluationEmployee[]>([]);
  const [responses, setResponses] = useState<EvaluationResponse[]>([]);
  const [comments, setComments] = useState<EvaluationComment[]>([]);
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [assignmentRows, responseRows, commentRows, questionResult] = await Promise.all([
        fetchCycleRows<EvaluationAssignment>('evaluation_assignments', cycle.id),
        fetchCycleRows<EvaluationResponse>('evaluation_responses', cycle.id),
        fetchCycleRows<EvaluationComment>('evaluation_comments', cycle.id),
        sb.from('evaluation_questions').select('*').order('question_order'),
      ]);
      if (questionResult.error) throw questionResult.error;
      const ids = [...new Set([...assignmentRows.map((row) => row.evaluator_id), cycle.evaluated_employee_id].filter((id): id is string => Boolean(id)))];
      const employeeResult = ids.length
        ? await sb.from('employees').select('id,full_name,position,department').in('id', ids)
        : { data: [], error: null };
      if (employeeResult.error) throw employeeResult.error;
      setAssignments(assignmentRows);
      setEmployees((employeeResult.data ?? []) as EvaluationEmployee[]);
      setResponses(responseRows);
      setComments(commentRows);
      setQuestions((questionResult.data ?? []) as EvaluationQuestion[]);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setBusy(false);
    }
  }, [cycle.id, cycle.evaluated_employee_id]);

  useEffect(() => { void load(); }, [load]);

  const participants = useMemo<Participant[]>(() => assignments
    .filter((assignment) => assignment.evaluated_id === cycle.evaluated_employee_id)
    .map((assignment) => {
      const ownResponses = responses.filter((response) => response.evaluator_id === assignment.evaluator_id && response.evaluated_id === assignment.evaluated_id);
      const comment = comments.find((item) => item.evaluator_id === assignment.evaluator_id && item.evaluated_id === assignment.evaluated_id);
      const answered = new Set(ownResponses.map((response) => response.question_id)).size;
      return {
        assignment,
        employee: employees.find((employee) => employee.id === assignment.evaluator_id),
        answered,
        complete: hasAllResponses(ownResponses, questions) && hasRequiredComments(comment),
        started: answered > 0 || Boolean(comment?.strengths?.trim() || comment?.opportunities?.trim()),
      };
    }).sort((a, b) => Number(a.complete) - Number(b.complete) || Number(a.started) - Number(b.started) || (a.employee?.full_name ?? '').localeCompare(b.employee?.full_name ?? '', 'es')),
  [assignments, comments, cycle.evaluated_employee_id, employees, questions, responses]);
  const completed = participants.filter((participant) => participant.complete).length;
  const inProgress = participants.filter((participant) => participant.started && !participant.complete).length;
  const pending = participants.length - completed;
  const progress = participants.length ? Math.round(completed / participants.length * 100) : 0;
  const evaluated = employees.find((employee) => employee.id === cycle.evaluated_employee_id);
  const completedIds = new Set(participants.filter((participant) => participant.complete).map((participant) => participant.assignment.evaluator_id));
  const summary = buildEvaluationSummary(questions, responses, completedIds, cycle.evaluated_employee_id);
  const selected = participants.find((participant) => participant.assignment.evaluator_id === selectedEvaluatorId);

  if (selected) return <EvaluationResponseDetail
    cycle={cycle} evaluator={selected.employee} evaluated={evaluated} questions={questions}
    responses={responses.filter((response) => response.evaluator_id === selectedEvaluatorId && response.evaluated_id === cycle.evaluated_employee_id)}
    comment={comments.find((comment) => comment.evaluator_id === selectedEvaluatorId && comment.evaluated_id === cycle.evaluated_employee_id)}
    onBack={() => setSelectedEvaluatorId(null)}
    onDownload={() => downloadEvaluationSummaryCsv({
      cycle, evaluated, questions, responses, comments, report,
      selfScore: summary.selfScore, collectiveScore: summary.collectiveScore,
      participants: [{ evaluatorId: selected.assignment.evaluator_id, employee: selected.employee, status: selected.complete ? 'Respondió' : 'En curso' }],
      fileLabel: `${cycle.name}_${selected.employee?.full_name || 'colaborador'}`,
    })}
  />;

  const completedComments = participants.filter((participant) => participant.complete).map((participant) => ({
    id: participant.assignment.evaluator_id,
    name: participant.employee?.full_name || 'Colaborador',
    comment: comments.find((item) => item.evaluator_id === participant.assignment.evaluator_id && item.evaluated_id === cycle.evaluated_employee_id),
  }));

  return <div className="evaluation-module evaluation-cycle-detail">
    <div className="page-header">
      <div><button type="button" className="back-link" onClick={onBack}><ArrowLeft size={17} /> Volver al panel</button><p className="eyebrow">DETALLE DE EVALUACIÓN</p><h1>{cycle.name}</h1><p>{cycle.description || 'Seguimiento de respuestas y participantes de este ciclo.'}</p></div>
      <div className="page-header-actions">
        <button className="secondary" onClick={onEdit}>{cycle.status === 'closed' ? 'Ver evaluadores' : 'Editar evaluadores'}</button>
        {report && <button className="secondary" onClick={onReport}>Ver reporte final</button>}
        <button className="secondary" onClick={() => downloadEvaluationSummaryCsv({
          cycle, evaluated, questions, responses, comments, report,
          selfScore: summary.selfScore, collectiveScore: summary.collectiveScore,
          participants: participants.map((participant) => ({
            evaluatorId: participant.assignment.evaluator_id,
            employee: participant.employee,
            status: participant.complete ? 'Respondió' : participant.started ? 'En curso' : 'Sin responder',
          })),
        })} disabled={busy || Boolean(error) || !participants.length}><Download size={16} /> Descargar resumen CSV</button>
        {cycle.status === 'active' && <button onClick={onNotify} disabled={notifying}>{notifying ? 'Enviando…' : 'Enviar avisos'}</button>}
      </div>
    </div>
    {error && <div role="alert" className="error">{error} <button type="button" className="secondary" onClick={() => void load()}>Reintentar</button></div>}
    {busy ? <div className="evaluation-loading"><LoaderCircle className="spin" size={22} /> Cargando evaluación…</div> : error ? null : <>
      <section className="evaluation-detail-overview evaluation-report-card"><div className="evaluation-detail-overview-heading"><div><p className="evaluation-kicker">RESUMEN DEL CICLO</p><h2>{evaluated?.full_name || 'Persona evaluada'}</h2><p>{[evaluated?.position, evaluated?.department].filter(Boolean).join(' · ') || 'Sin puesto o área registrada'}</p></div><span className={`evaluation-cycle-status ${cycle.status}`}>{cycle.status === 'active' ? 'En evaluación' : cycle.status === 'closed' ? 'Cerrada' : 'Borrador'}</span></div><div className="evaluation-detail-dates"><span>Inicio: <strong>{cycle.start_date ? formatDate(cycle.start_date) : 'Sin fecha'}</strong></span><span>Fin: <strong>{cycle.end_date ? formatDate(cycle.end_date) : 'Sin fecha'}</strong></span></div></section>
      <section className="evaluation-detail-progress evaluation-report-card"><div className="evaluation-detail-progress-heading"><div><p className="evaluation-kicker">AVANCE</p><h2>{completed} de {participants.length} evaluaciones completas</h2><p>{pending} sin completar{inProgress > 0 ? ` · ${inProgress} en curso` : ''}</p></div><strong>{progress}%</strong></div><div className="evaluation-progress-track" role="progressbar" aria-label="Evaluaciones completas" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={participants.length}><span style={{ width: `${progress}%` }} /></div></section>
      <section className="evaluation-report-summary" aria-label="Resumen de resultados"><div><span>Autoevaluación</span><strong>{formatScore(summary.selfScore)}</strong><small>{summary.selfScore === null ? 'Pendiente' : 'Evaluación completa'}</small></div><div><span>Evaluación colectiva</span><strong>{formatScore(summary.collectiveScore)}</strong><small>{summary.peerCount} evaluador{summary.peerCount === 1 ? '' : 'es'} con respuesta completa</small></div><div><span>Resultado final</span><strong>{formatScore(report?.final_score ?? null)}</strong><small>{report?.final_score == null ? 'Disponible al cerrar el ciclo' : 'Resultado consolidado'}</small></div></section>
      <section className="evaluation-report-card evaluation-detail-results"><div className="evaluation-report-card-heading"><div><h2>Resultados por categoría y reactivo</h2><p>Promedios de evaluaciones completas. Abre una categoría para comparar las preguntas.</p></div></div>{summary.categories.length ? summary.categories.map((category) => <details className="evaluation-summary-category" key={category.key}><summary><strong>{category.label}</strong><span>Autoevaluación {formatScore(category.selfScore)} · Colectiva {formatScore(category.collectiveScore)}</span></summary><div className="evaluation-summary-questions">{category.questions.map((question) => { const scores = summary.questionScores.get(question.id); return <div className="evaluation-summary-question" key={question.id}><span>{question.question_text}</span><span>Auto {formatScore(scores?.self ?? null)}</span><span>Colectiva {formatScore(scores?.collective ?? null)}</span></div>; })}</div></details>) : <p className="evaluation-form-note">No hay preguntas configuradas.</p>}</section>
      {completedComments.length > 0 && <section className="evaluation-detail-comments"><article><h2>Fortalezas observadas</h2>{completedComments.filter((entry) => entry.comment?.strengths?.trim()).map((entry) => <div key={entry.id}><strong>{entry.name}</strong><p>{entry.comment?.strengths}</p></div>)}</article><article><h2>Oportunidades observadas</h2>{completedComments.filter((entry) => entry.comment?.opportunities?.trim()).map((entry) => <div key={entry.id}><strong>{entry.name}</strong><p>{entry.comment?.opportunities}</p></div>)}</article></section>}
      {report && (report.strengths || report.opportunities || report.admin_summary) && <section className="evaluation-report-card evaluation-detail-dictamen"><div className="evaluation-report-card-heading"><h2>Dictamen y retroalimentación administrativa</h2></div>{report.strengths && <div><h3>Fortalezas</h3><p>{report.strengths}</p></div>}{report.opportunities && <div><h3>Oportunidades</h3><p>{report.opportunities}</p></div>}{report.admin_summary && <div><h3>Síntesis administrativa</h3><p>{report.admin_summary}</p></div>}</section>}
      <section className="evaluation-task-card"><div className="evaluation-card-heading"><div><h2>Quién ha respondido</h2><p>Abre una respuesta para ver todas las preguntas y comentarios. Los promedios incluyen solo evaluaciones completas.</p></div><span>{participants.length} participantes</span></div>{participants.length ? <div className="evaluation-detail-list">{participants.map(({ assignment, employee, answered, complete, started }) => {
        const content = <><div className={`evaluation-task-icon ${complete ? 'done' : ''}`}>{complete ? <Check size={18} /> : <ClipboardCheck size={18} />}</div><div className="evaluation-task-copy"><strong>{employee?.full_name || 'Colaborador no disponible'}</strong><span>{assignment.evaluator_id === cycle.evaluated_employee_id ? 'Autoevaluación' : 'Evaluación colectiva'}{employee?.department ? ` · ${employee.department}` : ''}</span></div><div className="evaluation-detail-response"><span className={`evaluation-task-status ${complete ? 'done' : ''}`}>{complete ? 'Respondió' : started ? 'En curso' : 'Sin responder'}</span>{!complete && started && <small>{answered} de {questions.length} preguntas respondidas</small>}{started && <small className="evaluation-detail-open">Ver respuesta <ChevronRight size={16} /></small>}</div></>;
        return started ? <button type="button" className="evaluation-detail-participant evaluation-detail-participant-link" key={assignment.id} onClick={() => setSelectedEvaluatorId(assignment.evaluator_id)} aria-label={`Ver respuesta de ${employee?.full_name || 'colaborador'}`}>{content}</button> : <div className="evaluation-detail-participant" key={assignment.id}>{content}</div>;
      })}</div> : <div className="evaluation-empty"><ClipboardCheck size={30} /><strong>Sin participantes asignados</strong><p>Agrega evaluadores para empezar el seguimiento.</p></div>}</section>
      {cycle.status === 'active' && participants.length > 0 && <div className="evaluation-detail-footer"><span>{pending > 0 ? `Faltan ${pending} evaluación${pending === 1 ? '' : 'es'} por completar para cerrar el ciclo.` : 'Todas las evaluaciones están completas.'}</span><button type="button" className="secondary" onClick={onClose} disabled={closing || pending > 0}>{closing ? 'Cerrando…' : 'Cerrar ciclo'}</button></div>}
    </>}
  </div>;
}

async function fetchCycleRows<T>(table: 'evaluation_assignments' | 'evaluation_responses' | 'evaluation_comments', cycleId: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.from(table).select('*').eq('cycle_id', cycleId).order('id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []) as T[]);
    if ((data?.length ?? 0) < 1000) return rows;
  }
}
