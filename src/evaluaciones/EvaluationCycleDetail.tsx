import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ClipboardCheck, LoaderCircle } from 'lucide-react';
import { sb } from '../lib/supabase';
import { formatDate, formatScore } from './format';
import { hasAllResponses, hasRequiredComments } from './taskUtils';
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

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [assignmentResult, responseResult, commentResult, questionResult] = await Promise.all([
        sb.from('evaluation_assignments').select('*').eq('cycle_id', cycle.id),
        sb.from('evaluation_responses').select('*').eq('cycle_id', cycle.id),
        sb.from('evaluation_comments').select('*').eq('cycle_id', cycle.id),
        sb.from('evaluation_questions').select('*').order('question_order'),
      ]);
      const failure = [assignmentResult, responseResult, commentResult, questionResult].find((result) => result.error);
      if (failure?.error) throw failure.error;
      const rows = (assignmentResult.data ?? []) as EvaluationAssignment[];
      const ids = [...new Set([...rows.map((row) => row.evaluator_id), cycle.evaluated_employee_id].filter((id): id is string => Boolean(id)))];
      const employeeResult = ids.length
        ? await sb.from('employees').select('id,full_name,position,department').in('id', ids)
        : { data: [], error: null };
      if (employeeResult.error) throw employeeResult.error;
      setAssignments(rows);
      setEmployees((employeeResult.data ?? []) as EvaluationEmployee[]);
      setResponses((responseResult.data ?? []) as EvaluationResponse[]);
      setComments((commentResult.data ?? []) as EvaluationComment[]);
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

  return <div className="evaluation-module evaluation-cycle-detail">
    <div className="page-header"><div><button type="button" className="back-link" onClick={onBack}><ArrowLeft size={17} /> Volver al panel</button><p className="eyebrow">DETALLE DE EVALUACIÓN</p><h1>{cycle.name}</h1><p>{cycle.description || 'Seguimiento de respuestas y participantes de este ciclo.'}</p></div><div className="page-header-actions"><button className="secondary" onClick={onEdit}>{cycle.status === 'closed' ? 'Ver evaluadores' : 'Editar evaluadores'}</button>{report && <button className="secondary" onClick={onReport}>Ver reporte final</button>}{cycle.status === 'active' && <button onClick={onNotify} disabled={notifying}>{notifying ? 'Enviando…' : 'Enviar avisos'}</button>}</div></div>
    {error && <div role="alert" className="error">{error} <button type="button" className="secondary" onClick={() => void load()}>Reintentar</button></div>}
    {busy ? <div className="evaluation-loading"><LoaderCircle className="spin" size={22} /> Cargando evaluación…</div> : <>
      <section className="evaluation-detail-overview evaluation-report-card"><div className="evaluation-detail-overview-heading"><div><p className="evaluation-kicker">RESUMEN DEL CICLO</p><h2>{evaluated?.full_name || 'Persona evaluada'}</h2><p>{[evaluated?.position, evaluated?.department].filter(Boolean).join(' · ') || 'Sin puesto o área registrada'}</p></div><span className={`evaluation-cycle-status ${cycle.status}`}>{cycle.status === 'active' ? 'En evaluación' : cycle.status === 'closed' ? 'Cerrada' : 'Borrador'}</span></div><div className="evaluation-detail-dates"><span>Inicio: <strong>{cycle.start_date ? formatDate(cycle.start_date) : 'Sin fecha'}</strong></span><span>Fin: <strong>{cycle.end_date ? formatDate(cycle.end_date) : 'Sin fecha'}</strong></span></div></section>
      <section className="evaluation-detail-progress evaluation-report-card"><div className="evaluation-detail-progress-heading"><div><p className="evaluation-kicker">AVANCE</p><h2>{completed} de {participants.length} evaluaciones completas</h2><p>{pending} sin completar{inProgress > 0 ? ` · ${inProgress} en curso` : ''}</p></div><strong>{progress}%</strong></div><div className="evaluation-progress-track" role="progressbar" aria-label="Evaluaciones completas" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={participants.length}><span style={{ width: `${progress}%` }} /></div></section>
      {report && <section className="evaluation-report-summary" aria-label="Resultados finales"><div><span>Autoevaluación</span><strong>{formatScore(report.self_score)}</strong></div><div><span>Evaluación colectiva</span><strong>{formatScore(report.collective_score)}</strong></div><div><span>Resultado final</span><strong>{formatScore(report.final_score)}</strong></div></section>}
      <section className="evaluation-task-card"><div className="evaluation-card-heading"><div><h2>Quién ha respondido</h2><p>Una evaluación cuenta como completa cuando tiene todas las respuestas, fortalezas y oportunidades.</p></div><span>{participants.length} participantes</span></div>{participants.length ? <div className="evaluation-detail-list">{participants.map(({ assignment, employee, answered, complete, started }) => <div className="evaluation-detail-participant" key={assignment.id}><div className={`evaluation-task-icon ${complete ? 'done' : ''}`}>{complete ? <Check size={18} /> : <ClipboardCheck size={18} />}</div><div className="evaluation-task-copy"><strong>{employee?.full_name || 'Colaborador no disponible'}</strong><span>{assignment.evaluator_id === cycle.evaluated_employee_id ? 'Autoevaluación' : 'Evaluación colectiva'}{employee?.department ? ` · ${employee.department}` : ''}</span></div><div className="evaluation-detail-response"><span className={`evaluation-task-status ${complete ? 'done' : ''}`}>{complete ? 'Respondió' : started ? 'En curso' : 'Sin responder'}</span>{!complete && started && <small>{answered} de {questions.length} preguntas respondidas</small>}</div></div>)}</div> : <div className="evaluation-empty"><ClipboardCheck size={30} /><strong>Sin participantes asignados</strong><p>Agrega evaluadores para empezar el seguimiento.</p></div>}</section>
      {cycle.status === 'active' && participants.length > 0 && <div className="evaluation-detail-footer"><span>{pending > 0 ? `Faltan ${pending} evaluación${pending === 1 ? '' : 'es'} por completar para cerrar el ciclo.` : 'Todas las evaluaciones están completas.'}</span><button type="button" className="secondary" onClick={onClose} disabled={closing || pending > 0}>{closing ? 'Cerrando…' : 'Cerrar ciclo'}</button></div>}
    </>}
  </div>;
}
