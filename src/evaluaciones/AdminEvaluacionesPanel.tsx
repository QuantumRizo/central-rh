import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ClipboardCheck, LoaderCircle, Search, Send } from "lucide-react";
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
import { EvaluationCycleDetail } from "./EvaluationCycleDetail";
import { averageNumber, formatDate, formatScore } from "./format";
import type { CloseCycleInput } from "./CloseCycleDialog";
import { hasAllResponses, hasRequiredComments } from "./taskUtils";
import { Segmented } from "../components/Segmented";

const employeeFields = "id,full_name,position,department,status";

type CycleFilter = 'all' | 'open' | 'closed';
const CYCLE_FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'open', label: 'Activas' },
  { value: 'closed', label: 'Cerradas' },
] as const satisfies readonly { value: CycleFilter; label: string }[];

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function AdminEvaluacionesPanel({ employeeId, onViewMine }: { employeeId: string; onViewMine: () => void }) {
  const [cycles, setCycles] = useState<EvaluationCycle[]>([]);
  // Todas las personas (incluidas las dadas de baja) para conservar el nombre en el histórico.
  const [employees, setEmployees] = useState<EvaluationEmployee[]>([]);
  const activeEmployees = useMemo(() => employees.filter((employee) => employee.status === 'Activo'), [employees]);
  const [filter, setFilter] = useState<CycleFilter>('all');
  const [query, setQuery] = useState('');
  const [responseCount, setResponseCount] = useState(0);
  const [reports, setReports] = useState<EvaluationFinalReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<EvaluationFinalReport | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<EvaluationCycle | null>(null);
  const [detailCycle, setDetailCycle] = useState<EvaluationCycle | null>(null);
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
        sb.from('employees').select(employeeFields).order('full_name'),
        sb.from('evaluation_responses').select('id', { count: 'exact', head: true }),
        sb.from('evaluation_final_reports').select('*').order('created_at', { ascending: false }),
      ]);
      const failure = [cyclesResult, employeesResult, responsesResult, reportsResult].find((result) => result.error);
      if (failure?.error) throw failure.error;
      setCycles(((cyclesResult.data ?? []) as EvaluationCycle[]).filter((cycle) => cycle.evaluated_employee_id !== employeeId));
      setEmployees((employeesResult.data ?? []) as EvaluationEmployee[]);
      setResponseCount(responsesResult.count ?? 0);
      setReports(((reportsResult.data ?? []) as EvaluationFinalReport[]).filter((report) => report.employee_id !== employeeId));
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setBusy(false);
    }
  }, [employeeId]);

  useEffect(() => { void load(); }, [load]);

  const employeeNames = useMemo(() => new Map(employees.map((employee) => [employee.id, employee.full_name])), [employees]);
  const visibleCycles = useMemo(() => {
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    return cycles.filter((cycle) => {
      if (filter === 'open' && cycle.status === 'closed') return false;
      if (filter === 'closed' && cycle.status !== 'closed') return false;
      if (!terms.length) return true;
      const haystack = normalize(`${cycle.name} ${cycle.description ?? ''} ${cycle.evaluated_employee_id ? employeeNames.get(cycle.evaluated_employee_id) ?? '' : ''}`);
      return terms.every((term) => haystack.includes(term));
    });
  }, [cycles, employeeNames, filter, query]);

  if (selectedReport) {
    const cycle = cycles.find((item) => item.id === selectedReport.cycle_id);
    const reportEmployee = employees.find((item) => item.id === selectedReport.employee_id);
    return <EvaluationReportView report={selectedReport} cycle={cycle} employee={reportEmployee} onBack={() => { setSelectedReport(null); void load(); }} />;
  }

  if (showCreate || selectedCycle) return <CycleEditor
    key={selectedCycle?.id ?? 'new'}
    cycle={selectedCycle}
    employees={selectedCycle?.evaluated_employee_id && !activeEmployees.some((employee) => employee.id === selectedCycle.evaluated_employee_id)
      ? [...activeEmployees.filter((employee) => employee.id !== employeeId), ...employees.filter((employee) => employee.id === selectedCycle.evaluated_employee_id)]
      : activeEmployees.filter((employee) => employee.id !== employeeId)}
    onBack={() => { setShowCreate(false); setSelectedCycle(null); void load(); }}
    onSaved={(notice) => { setShowCreate(false); setSelectedCycle(null); setMessage(notice); void load(); }}
  />;

  const closeCycle = async (cycle: EvaluationCycle, input: CloseCycleInput) => {
    if (!cycle.evaluated_employee_id || closingCycleId) return;
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
      const completedIds = new Set(assignments.filter((assignment) => {
        const assignmentResponses = responses.filter((response) => response.evaluator_id === assignment.evaluator_id);
        const assignmentComment = comments.find((comment) => comment.evaluator_id === assignment.evaluator_id);
        return hasAllResponses(assignmentResponses, questions) && hasRequiredComments(assignmentComment);
      }).map((assignment) => assignment.evaluator_id));
      const completed = responses.filter((response) => completedIds.has(response.evaluator_id));
      const selfScore = averageNumber(completed.filter((response) => response.evaluation_type === 'self').map((response) => Number(response.score)));
      const collectiveScore = averageNumber(completed.filter((response) => response.evaluation_type === 'peer').map((response) => Number(response.score)));
      const existingReport = reports.find((report) => report.cycle_id === cycle.id && report.employee_id === cycle.evaluated_employee_id);
      const automaticScore = selfScore !== null && collectiveScore !== null ? (selfScore + collectiveScore) / 2 : null;
      const { error: reportError } = await sb.from('evaluation_final_reports').upsert({
        cycle_id: cycle.id,
        employee_id: cycle.evaluated_employee_id,
        self_score: selfScore,
        collective_score: collectiveScore,
        final_score: input.finalPercent === null ? automaticScore : input.finalPercent / 100,
        strengths: input.strengths || null,
        opportunities: input.opportunities || null,
        admin_summary: input.adminSummary || existingReport?.admin_summary || (automaticScore === null ? null : 'Resultado consolidado con promedio 50% autoevaluación y 50% evaluación colectiva.'),
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

  if (detailCycle) {
    const currentCycle = cycles.find((cycle) => cycle.id === detailCycle.id) ?? detailCycle;
    const report = reports.find((item) => item.cycle_id === currentCycle.id);
    return <><EvaluationCycleDetail key={currentCycle.id} cycle={currentCycle} report={report}
      onBack={() => { setDetailCycle(null); setError(''); setMessage(''); void load(); }}
      onEdit={() => setSelectedCycle(currentCycle)}
      onReport={() => { if (report) setSelectedReport(report); }}
      onNotify={() => void notifyCycle(currentCycle)}
      onClose={(input) => void closeCycle(currentCycle, input)}
      onReportSaved={() => void load()}
      onDeadlineSaved={(notice) => { setError(''); setMessage(notice); void load(); }}
      notifying={notifyingCycleId === currentCycle.id} closing={closingCycleId === currentCycle.id}
    />{error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}</>;
  }

  return <div className="evaluation-module evaluation-admin-panel">
    <div className="page-header"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Panel de evaluaciones</h1><p>Gestiona ciclos y consulta el avance de las evaluaciones.</p></div><div className="page-header-actions"><button className="secondary" onClick={onViewMine}>Mis evaluaciones</button><button onClick={() => { setMessage(''); setShowCreate(true); }}>Nuevo ciclo</button></div></div>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="success" role="status">{message}</p>}
    {busy ? <div className="evaluation-loading"><LoaderCircle className="spin" size={22} /> Cargando panel…</div> : <><div className="evaluation-admin-metrics"><div><span>Ciclos</span><strong>{cycles.length}</strong></div><div><span>Activos</span><strong>{cycles.filter((cycle) => cycle.status === 'active').length}</strong></div><div><span>Respuestas</span><strong>{responseCount}</strong></div></div><section className="evaluation-task-card evaluation-table-card"><div className="evaluation-card-heading"><div><h2>Evaluaciones</h2><p>Abre una evaluación para ver el resumen y quién ha respondido.</p></div><span>{visibleCycles.length === cycles.length ? `${cycles.length} registradas` : `${visibleCycles.length} de ${cycles.length}`}</span></div>{cycles.length ? <div className="evaluation-list-toolbar"><Segmented label="Estado de la evaluación" options={CYCLE_FILTERS} value={filter} onChange={setFilter} /><label className="search"><Search size={17} /><input type="search" aria-label="Buscar por persona o evaluación" placeholder="Buscar persona o evaluación…" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div> : null}{!cycles.length ? null : visibleCycles.length ? <div className="evaluation-table-wrap"><table className="evaluation-table"><thead><tr><th>Evaluación</th><th>Persona evaluada</th><th>Estado</th><th>Autoevaluación</th><th>Evaluación colectiva</th><th>Resultado final</th><th aria-label="Acciones" /></tr></thead><tbody>{visibleCycles.map((cycle) => { const report = reports.find((item) => item.cycle_id === cycle.id); const evaluatedEmployee = employees.find((employee) => employee.id === cycle.evaluated_employee_id); return <tr key={cycle.id}><td><button type="button" className="evaluation-cycle-link" onClick={() => setDetailCycle(cycle)}>{cycle.name}</button><small>{cycle.description || 'Sin descripción'}{cycle.start_date ? ` · ${formatDate(cycle.start_date)}` : ''}</small></td><td>{evaluatedEmployee ? <>{evaluatedEmployee.full_name}{evaluatedEmployee.status === 'Baja' && <small>Baja</small>}</> : 'Sin persona asignada'}</td><td><span className={`evaluation-cycle-status ${cycle.status}`}>{cycle.status === 'active' ? 'En evaluación' : cycle.status === 'closed' ? 'Cerrada' : 'Borrador'}</span></td><td>{report ? formatScore(report.self_score) : '—'}</td><td>{report ? formatScore(report.collective_score) : '—'}</td><td className="evaluation-final-cell">{report ? report.final_score === null ? 'Pendiente' : formatScore(report.final_score) : '—'}</td><td><div className="evaluation-table-actions"><button className="secondary" onClick={() => setDetailCycle(cycle)}>Ver detalle</button></div></td></tr>; })}</tbody></table></div> : <div className="evaluation-empty"><Search size={30} /><strong>Sin resultados</strong><p>Ninguna evaluación coincide con el filtro o la búsqueda.</p></div>}{cycles.length ? null : <div className="evaluation-empty"><ClipboardCheck size={30} /><strong>Aún no hay evaluaciones</strong><p>Crea el primer ciclo para comenzar.</p></div>}</section></>}
  </div>;
}
