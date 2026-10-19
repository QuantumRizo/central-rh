import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, ClipboardCheck, Download, LoaderCircle } from 'lucide-react';
import { formatDate, formatScore } from './format';
import { buildParticipants, loadCycleData, participantStatus } from './cycleData';
import { buildEvaluationSummary } from './evaluationSummary';
import { EvaluationResultsTable } from './EvaluationResultsTable';
import { CloseCycleDialog, type CloseCycleInput } from './CloseCycleDialog';
import { EvaluationResponseDetail } from './EvaluationResponseDetail';
import type { EvaluationAssignment, EvaluationComment, EvaluationCycle, EvaluationEmployee, EvaluationQuestion, EvaluationResponse, EvaluationFinalReport } from './types';

export function EvaluationCycleDetail({ cycle, report, onBack, onEdit, onReport, onNotify, onClose, notifying, closing }: {
  cycle: EvaluationCycle;
  report?: EvaluationFinalReport;
  onBack: () => void;
  onEdit: () => void;
  onReport: () => void;
  onNotify: () => void;
  onClose: (input: CloseCycleInput) => void;
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
  const [closeOpen, setCloseOpen] = useState(false);
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<string | null>(null);

  const exportWorkbook = (args: Parameters<typeof import('./evaluationExcel').downloadEvaluationWorkbook>[0]) => { void import('./evaluationExcel').then(({ downloadEvaluationWorkbook }) => downloadEvaluationWorkbook(args)).catch((exportError: Error) => setError(exportError.message)); };

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await loadCycleData(cycle.id, cycle.evaluated_employee_id);
      setAssignments(data.assignments);
      setEmployees(data.employees);
      setResponses(data.responses);
      setComments(data.comments);
      setQuestions(data.questions);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setBusy(false);
    }
  }, [cycle.id, cycle.evaluated_employee_id]);

  useEffect(() => { void load(); }, [load]);

  const participants = useMemo(() => buildParticipants({ assignments, employees, responses, comments, questions }, cycle.evaluated_employee_id),
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
    onDownload={() => exportWorkbook({
      cycle, evaluated, questions, responses, comments, report,
      selfScore: summary.selfScore, collectiveScore: summary.collectiveScore,
      participants: [{ evaluatorId: selected.assignment.evaluator_id, employee: selected.employee, status: participantStatus(selected) }],
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
        <button className="secondary" onClick={() => exportWorkbook({
          cycle, evaluated, questions, responses, comments, report,
          selfScore: summary.selfScore, collectiveScore: summary.collectiveScore,
          participants: participants.map((participant) => ({
            evaluatorId: participant.assignment.evaluator_id,
            employee: participant.employee,
            status: participantStatus(participant),
          })),
        })} disabled={busy || Boolean(error) || !participants.length}><Download size={16} /> Descargar resumen Excel</button>
        {cycle.status === 'active' && participants.length > 0 && <button className="secondary" onClick={() => setCloseOpen(true)} disabled={busy || Boolean(error) || closing}>Cerrar ciclo</button>}
        {cycle.status === 'active' && <button onClick={onNotify} disabled={notifying}>{notifying ? 'Enviando…' : 'Enviar avisos'}</button>}
      </div>
    </div>
    {error && <div role="alert" className="error">{error} <button type="button" className="secondary" onClick={() => void load()}>Reintentar</button></div>}
    {busy ? <div className="evaluation-loading"><LoaderCircle className="spin" size={22} /> Cargando evaluación…</div> : error ? null : <>
      <section className="evaluation-detail-overview evaluation-report-card"><div className="evaluation-detail-overview-heading"><div><p className="evaluation-kicker">RESUMEN DEL CICLO</p><h2>{evaluated?.full_name || 'Persona evaluada'}</h2><p>{[evaluated?.position, evaluated?.department].filter(Boolean).join(' · ') || 'Sin puesto o área registrada'}</p></div><span className={`evaluation-cycle-status ${cycle.status}`}>{cycle.status === 'active' ? 'En evaluación' : cycle.status === 'closed' ? 'Cerrada' : 'Borrador'}</span></div><div className="evaluation-detail-dates"><span>Inicio: <strong>{cycle.start_date ? formatDate(cycle.start_date) : 'Sin fecha'}</strong></span><span>Fin: <strong>{cycle.end_date ? formatDate(cycle.end_date) : 'Sin fecha'}</strong></span></div></section>
      <section className="evaluation-detail-progress evaluation-report-card"><div className="evaluation-detail-progress-heading"><div><p className="evaluation-kicker">AVANCE</p><h2>{completed} de {participants.length} evaluaciones completas</h2><p>{pending} sin completar{inProgress > 0 ? ` · ${inProgress} en curso` : ''}</p></div><strong>{progress}%</strong></div><div className="evaluation-progress-track" role="progressbar" aria-label="Evaluaciones completas" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={participants.length}><span style={{ width: `${progress}%` }} /></div></section>
      <section className="evaluation-report-summary" aria-label="Resumen de resultados"><div><span>Autoevaluación</span><strong>{formatScore(summary.selfScore)}</strong><small>{summary.selfScore === null ? 'Pendiente' : 'Evaluación completa'}</small></div><div><span>Evaluación colectiva</span><strong>{formatScore(summary.collectiveScore)}</strong><small>{summary.peerCount} evaluador{summary.peerCount === 1 ? '' : 'es'} con respuesta completa</small></div><div><span>Resultado final</span><strong>{formatScore(report?.final_score ?? null)}</strong><small>{report?.final_score == null ? 'Disponible al cerrar el ciclo' : 'Resultado consolidado'}</small></div></section>
      <section className="evaluation-report-card evaluation-detail-results"><div className="evaluation-report-card-heading"><div><h2>Resultados por categoría y reactivo</h2><p>Promedios de evaluaciones completas. Abre una categoría para comparar las preguntas.</p></div></div>{summary.categories.length ? <EvaluationResultsTable categories={summary.categories} questionScores={summary.questionScores} /> : <p className="evaluation-form-note">No hay preguntas configuradas.</p>}</section>
      {completedComments.length > 0 && <section className="evaluation-detail-comments"><article><h2>Fortalezas observadas</h2>{completedComments.filter((entry) => entry.comment?.strengths?.trim()).map((entry) => <div key={entry.id}><strong>{entry.name}</strong><p>{entry.comment?.strengths}</p></div>)}</article><article><h2>Oportunidades observadas</h2>{completedComments.filter((entry) => entry.comment?.opportunities?.trim()).map((entry) => <div key={entry.id}><strong>{entry.name}</strong><p>{entry.comment?.opportunities}</p></div>)}</article></section>}
      {report && (report.strengths || report.opportunities || report.admin_summary) && <section className="evaluation-report-card evaluation-detail-dictamen"><div className="evaluation-report-card-heading"><h2>Dictamen y retroalimentación administrativa</h2></div>{report.strengths && <div><h3>Fortalezas</h3><p>{report.strengths}</p></div>}{report.opportunities && <div><h3>Oportunidades</h3><p>{report.opportunities}</p></div>}{report.admin_summary && <div><h3>Síntesis administrativa</h3><p>{report.admin_summary}</p></div>}</section>}
      <section className="evaluation-task-card"><div className="evaluation-card-heading"><div><h2>Quién ha respondido</h2><p>Abre una respuesta para ver todas las preguntas y comentarios. Los promedios incluyen solo evaluaciones completas.</p></div><span>{participants.length} participantes</span></div>{participants.length ? <div className="evaluation-detail-list">{participants.map(({ assignment, employee, answered, complete, started }) => {
        const content = <><div className={`evaluation-task-icon ${complete ? 'done' : ''}`}>{complete ? <Check size={18} /> : <ClipboardCheck size={18} />}</div><div className="evaluation-task-copy"><strong>{employee?.full_name || 'Colaborador no disponible'}</strong><span>{assignment.evaluator_id === cycle.evaluated_employee_id ? 'Autoevaluación' : 'Evaluación colectiva'}{employee?.department ? ` · ${employee.department}` : ''}</span></div><div className="evaluation-detail-response"><span className={`evaluation-task-status ${complete ? 'done' : ''}`}>{complete ? 'Respondió' : started ? 'En curso' : 'Sin responder'}</span>{!complete && started && <small>{answered} de {questions.length} preguntas respondidas</small>}{started && <small className="evaluation-detail-open">Ver respuesta <ChevronRight size={16} /></small>}</div></>;
        return started ? <button type="button" className="evaluation-detail-participant evaluation-detail-participant-link" key={assignment.id} onClick={() => setSelectedEvaluatorId(assignment.evaluator_id)} aria-label={`Ver respuesta de ${employee?.full_name || 'colaborador'}`}>{content}</button> : <div className="evaluation-detail-participant" key={assignment.id}>{content}</div>;
      })}</div> : <div className="evaluation-empty"><ClipboardCheck size={30} /><strong>Sin participantes asignados</strong><p>Agrega evaluadores para empezar el seguimiento.</p></div>}</section>
    </>}
    {closeOpen && <CloseCycleDialog pending={pending} busy={closing} onCancel={() => setCloseOpen(false)} onConfirm={(input) => { setCloseOpen(false); onClose(input); }} />}
  </div>;
}
