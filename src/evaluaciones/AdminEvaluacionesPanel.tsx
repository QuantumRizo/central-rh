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
import { CycleEditor } from "./CycleEditor";
import { EvaluationReportView } from "./EvaluationReportView";
import { averageNumber, formatDate, formatScore } from "./format";
import { hasAllResponses, hasRequiredComments } from "./taskUtils";

const employeeFields = "id,full_name,position,department";

export function AdminEvaluacionesPanel({ onViewMine }: { onViewMine: () => void }) {
  const [cycles, setCycles] = useState<EvaluationCycle[]>([]);
  const [employees, setEmployees] = useState<EvaluationEmployee[]>([]);
  const [responseCount, setResponseCount] = useState(0);
  const [reports, setReports] = useState<EvaluationFinalReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<EvaluationFinalReport | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<EvaluationCycle | null>(null);
  const [busy, setBusy] = useState(true);
  const [closingCycleId, setClosingCycleId] = useState<string | null>(null);
  const [notifyingCycleId, setNotifyingCycleId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [cyclesResult, employeesResult, responsesResult, reportsResult] = await Promise.all([
        sb.from('evaluation_cycles').select('*').order('created_at', { ascending: false }),
        sb.from('employees').select(employeeFields).eq('status', 'Activo').order('full_name'),
        sb.from('evaluation_responses').select('id', { count: 'exact', head: true }),
        sb.from('evaluation_final_reports').select('*').order('created_at', { ascending: false }),
      ]);
      const failure = [cyclesResult, employeesResult, responsesResult, reportsResult].find((result) => result.error);
      if (failure?.error) throw failure.error;
      setCycles((cyclesResult.data ?? []) as EvaluationCycle[]);
      setEmployees((employeesResult.data ?? []) as EvaluationEmployee[]);
      setResponseCount(responsesResult.count ?? 0);
      setReports((reportsResult.data ?? []) as EvaluationFinalReport[]);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (selectedReport) {
    const cycle = cycles.find((item) => item.id === selectedReport.cycle_id);
    const reportEmployee = employees.find((item) => item.id === selectedReport.employee_id);
    return <EvaluationReportView report={selectedReport} cycle={cycle} employee={reportEmployee} onBack={() => setSelectedReport(null)} />;
  }

  if (showCreate || selectedCycle) return <CycleEditor
    key={selectedCycle?.id ?? 'new'}
    cycle={selectedCycle}
    employees={employees}
    onBack={() => { setShowCreate(false); setSelectedCycle(null); void load(); }}
    onSaved={(notice) => { setShowCreate(false); setSelectedCycle(null); setMessage(notice); void load(); }}
  />;

  const closeCycle = async (cycle: EvaluationCycle) => {
    if (!cycle.evaluated_employee_id || closingCycleId) return;
    if (!window.confirm(`¿Cerrar el ciclo “${cycle.name}”? Se generará el resultado final y ya no se podrán editar sus evaluaciones.`)) return;
    setClosingCycleId(cycle.id); setError(''); setMessage('');
    try {
      const [assignmentsResult, responsesResult, commentsResult, questionsResult] = await Promise.all([
        sb.from('evaluation_assignments').select('*').eq('cycle_id', cycle.id).eq('evaluated_id', cycle.evaluated_employee_id),
        sb.from('evaluation_responses').select('*').eq('cycle_id', cycle.id).eq('evaluated_id', cycle.evaluated_employee_id),
        sb.from('evaluation_comments').select('*').eq('cycle_id', cycle.id).eq('evaluated_id', cycle.evaluated_employee_id),
        sb.from('evaluation_questions').select('*').order('question_order'),
      ]);
      const failure = [assignmentsResult, responsesResult, commentsResult, questionsResult].find((result) => result.error);
      if (failure?.error) throw failure.error;
      const assignments = (assignmentsResult.data ?? []) as EvaluationAssignment[];
      const responses = (responsesResult.data ?? []) as EvaluationResponse[];
      const comments = (commentsResult.data ?? []) as EvaluationComment[];
      const questions = (questionsResult.data ?? []) as EvaluationQuestion[];
      const pending = assignments.filter((assignment) => {
        const assignmentResponses = responses.filter((response) => response.evaluator_id === assignment.evaluator_id);
        const assignmentComment = comments.find((comment) => comment.evaluator_id === assignment.evaluator_id);
        return !hasAllResponses(assignmentResponses, questions) || !hasRequiredComments(assignmentComment);
      });
      if (pending.length) throw new Error(`No se puede cerrar: faltan ${pending.length} evaluación${pending.length === 1 ? '' : 'es'} por completar.`);
      const selfValues = responses.filter((response) => response.evaluation_type === 'self').map((response) => Number(response.score));
      const collectiveValues = responses.filter((response) => response.evaluation_type === 'peer').map((response) => Number(response.score));
      const selfScore = averageNumber(selfValues);
      const collectiveScore = averageNumber(collectiveValues);
      if (selfScore === null || collectiveScore === null) throw new Error('No se puede cerrar: se necesitan autoevaluación y evaluación colectiva.');
      const strengths = [...new Set(comments.map((comment) => comment.strengths?.trim()).filter(Boolean))].join('\n\n') || null;
      const opportunities = [...new Set(comments.map((comment) => comment.opportunities?.trim()).filter(Boolean))].join('\n\n') || null;
      const existingReport = reports.find((report) => report.cycle_id === cycle.id && report.employee_id === cycle.evaluated_employee_id);
      const { error: reportError } = await sb.from('evaluation_final_reports').upsert({
        cycle_id: cycle.id,
        employee_id: cycle.evaluated_employee_id,
        self_score: selfScore,
        collective_score: collectiveScore,
        final_score: (selfScore + collectiveScore) / 2,
        strengths,
        opportunities,
        admin_summary: existingReport?.admin_summary ?? 'Resultado consolidado con promedio 50% autoevaluación y 50% evaluación colectiva.',
        is_exported: existingReport?.is_exported ?? false,
      }, { onConflict: 'cycle_id,employee_id' });
      if (reportError) throw reportError;
      const { error: cycleError } = await sb.from('evaluation_cycles').update({ status: 'closed' }).eq('id', cycle.id);
      if (cycleError) throw cycleError;
      await load();
    } catch (closeError) {
      setError((closeError as Error).message);
    } finally {
      setClosingCycleId(null);
    }
  };

  const notifyCycle = async (cycle: EvaluationCycle) => {
    if (notifyingCycleId) return;
    if (!window.confirm(`¿Enviar avisos por correo a las personas pendientes de “${cycle.name}”?`)) return;
    setNotifyingCycleId(cycle.id); setError(''); setMessage('');
    try {
      const { data, error: functionError } = await sb.functions.invoke('send-assignment-email', { body: { cycle_id: cycle.id } });
      if (functionError) throw functionError;
      if (!data?.success) throw new Error(data?.message || 'No se pudieron enviar los avisos.');
      setMessage(data.message || 'Avisos enviados correctamente.');
    } catch (notifyError) {
      setError((notifyError as Error).message);
    } finally {
      setNotifyingCycleId(null);
    }
  };

  return <div className="evaluation-module evaluation-admin-panel">
    <div className="page-header"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Panel de evaluaciones</h1><p>Gestiona ciclos y consulta el avance de las evaluaciones.</p></div><div className="page-header-actions"><button className="secondary" onClick={onViewMine}>Mis evaluaciones</button><button onClick={() => { setMessage(''); setShowCreate(true); }}>Nuevo ciclo</button></div></div>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="success" role="status">{message}</p>}
    {busy ? <div className="evaluation-loading"><LoaderCircle className="spin" size={22} /> Cargando panel…</div> : <><div className="evaluation-admin-metrics"><div><span>Ciclos</span><strong>{cycles.length}</strong></div><div><span>Activos</span><strong>{cycles.filter((cycle) => cycle.status === 'active').length}</strong></div><div><span>Respuestas</span><strong>{responseCount}</strong></div></div><section className="evaluation-task-card evaluation-table-card"><div className="evaluation-card-heading"><div><h2>Evaluaciones</h2><p>Consulta el estado, los resultados y el reporte de cada ciclo.</p></div><span>{cycles.length} registradas</span></div>{cycles.length ? <div className="evaluation-table-wrap"><table className="evaluation-table"><thead><tr><th>Evaluación</th><th>Persona evaluada</th><th>Estado</th><th>Autoevaluación</th><th>Evaluación colectiva</th><th>Resultado final</th><th aria-label="Acciones" /></tr></thead><tbody>{cycles.map((cycle) => { const report = reports.find((item) => item.cycle_id === cycle.id); const evaluatedEmployee = employees.find((employee) => employee.id === cycle.evaluated_employee_id); return <tr key={cycle.id}><td><strong>{cycle.name}</strong><small>{cycle.description || 'Sin descripción'}{cycle.start_date ? ` · ${formatDate(cycle.start_date)}` : ''}</small></td><td>{evaluatedEmployee?.full_name || 'Sin persona asignada'}</td><td><span className={`evaluation-cycle-status ${cycle.status}`}>{cycle.status === 'active' ? 'En evaluación' : cycle.status === 'closed' ? 'Cerrada' : 'Borrador'}</span></td><td>{report ? formatScore(report.self_score) : '—'}</td><td>{report ? formatScore(report.collective_score) : '—'}</td><td className="evaluation-final-cell">{report ? report.final_score === null ? 'Pendiente' : formatScore(report.final_score) : '—'}</td><td><div className="evaluation-table-actions"><button className="secondary" onClick={() => setSelectedCycle(cycle)}>Evaluadores</button>{report && <button className="secondary" onClick={() => setSelectedReport(report)}>Ver reporte</button>}{cycle.status === 'active' && cycle.evaluated_employee_id && <><button className="secondary" onClick={() => notifyCycle(cycle)} disabled={notifyingCycleId !== null}>{notifyingCycleId === cycle.id ? 'Enviando…' : 'Enviar avisos'}</button><button className="secondary" onClick={() => closeCycle(cycle)} disabled={closingCycleId !== null}>{closingCycleId === cycle.id ? 'Cerrando…' : 'Cerrar ciclo'}</button></>}</div></td></tr>; })}</tbody></table></div> : <div className="evaluation-empty"><ClipboardCheck size={30} /><strong>Aún no hay evaluaciones</strong><p>Crea el primer ciclo para comenzar.</p></div>}</section></>}
  </div>;
}
