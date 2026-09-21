import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ClipboardCheck, LoaderCircle, Send } from 'lucide-react';
import { sb } from '../lib/supabase';
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

type Props = { employeeId: string; isAdmin: boolean };
type ModuleView = { type: 'home' } | { type: 'form'; task: EvaluationTask };

const employeeFields = 'id,full_name,position';

function hasRequiredComments(comment?: EvaluationComment) {
  return Boolean(comment?.strengths?.trim() && comment?.opportunities?.trim());
}

function hasAllResponses(responses: EvaluationResponse[], questions: EvaluationQuestion[]) {
  if (!questions.length) return false;
  const answered = new Set(responses.map((response) => response.question_id));
  return questions.every((question) => answered.has(question.id));
}

function getFirstName(name: string) {
  return name.split(' ')[0] || 'colaborador';
}

export function EvaluacionesModule({ employeeId, isAdmin }: Props) {
  const [view, setView] = useState<ModuleView>({ type: 'home' });
  const [adminView, setAdminView] = useState(isAdmin);
  const [tasks, setTasks] = useState<EvaluationTask[]>([]);
  const [employee, setEmployee] = useState<EvaluationEmployee | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  const loadTasks = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [employeeResult, cyclesResult, evaluatorAssignmentsResult, evaluatedAssignmentsResult, responseResult, commentResult, questionsResult] = await Promise.all([
        sb.from('employees').select(employeeFields).eq('id', employeeId).single(),
        sb.from('evaluation_cycles').select('*').eq('status', 'active').order('start_date', { ascending: false }),
        sb.from('evaluation_assignments').select('*').eq('evaluator_id', employeeId),
        sb.from('evaluation_assignments').select('*').eq('evaluated_id', employeeId),
        sb.from('evaluation_responses').select('*').eq('evaluator_id', employeeId),
        sb.from('evaluation_comments').select('*').eq('evaluator_id', employeeId),
        sb.from('evaluation_questions').select('*').order('question_order'),
      ]);
      const failure = [employeeResult, cyclesResult, evaluatorAssignmentsResult, evaluatedAssignmentsResult, responseResult, commentResult, questionsResult].find((result) => result.error);
      if (failure?.error) throw failure.error;

      const current = employeeResult.data as EvaluationEmployee;
      const cycles = (cyclesResult.data ?? []) as EvaluationCycle[];
      const asEvaluator = (evaluatorAssignmentsResult.data ?? []) as EvaluationAssignment[];
      const asEvaluated = (evaluatedAssignmentsResult.data ?? []) as EvaluationAssignment[];
      const responses = (responseResult.data ?? []) as EvaluationResponse[];
      const comments = (commentResult.data ?? []) as EvaluationComment[];
      const questions = (questionsResult.data ?? []) as EvaluationQuestion[];
      const peerIds = [...new Set(asEvaluator.filter((assignment) => assignment.evaluated_id !== employeeId).map((assignment) => assignment.evaluated_id))];
      const peersResult = peerIds.length ? await sb.from('employees').select(employeeFields).in('id', peerIds) : { data: [], error: null };
      if (peersResult.error) throw peersResult.error;
      const targets = new Map<string, EvaluationEmployee>();
      targets.set(employeeId, current);
      for (const peer of (peersResult.data ?? []) as EvaluationEmployee[]) targets.set(peer.id, peer);
      const nextTasks: EvaluationTask[] = [];

      for (const cycle of cycles) {
        const selfAssignment = asEvaluated.find((assignment) => assignment.cycle_id === cycle.id);
        if (selfAssignment) nextTasks.push(buildTask('self', cycle, current, responses, comments, questions, employeeId));
        for (const assignment of asEvaluator.filter((item) => item.cycle_id === cycle.id && item.evaluated_id !== employeeId)) {
          const target = targets.get(assignment.evaluated_id);
          if (target) nextTasks.push(buildTask('peer', cycle, target, responses, comments, questions, assignment.evaluated_id));
        }
      }
      setEmployee(current);
      setTasks(nextTasks);
    } catch (loadError) {
      setError((loadError as Error).message);
      setTasks([]);
    } finally {
      setBusy(false);
    }
  }, [employeeId]);

  useEffect(() => { if (!isAdmin || !adminView) void loadTasks(); }, [loadTasks, revision, isAdmin, adminView]);

  if (isAdmin && adminView) return <AdminEvaluacionesPanel onViewMine={() => setAdminView(false)} />;

  if (view.type === 'form') {
    return <EvaluationForm task={view.task} employeeId={employeeId} onBack={() => setView({ type: 'home' })} onSaved={() => { setView({ type: 'home' }); setRevision((value) => value + 1); }} />;
  }

  const completed = tasks.filter((task) => task.completed).length;
  const pending = tasks.length - completed;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  return (
    <div className="evaluation-module">
      <div className="evaluation-heading">
        <div>
          <p className="eyebrow">EVALUACIONES</p>
          <h1>{employee ? `Hola, ${getFirstName(employee.full_name)}` : 'Evaluaciones'}</h1>
          <p>Consulta y completa tus evaluaciones de desempeño.</p>
        </div>
        {isAdmin && <button className="secondary evaluation-admin-note" onClick={() => setAdminView(true)}>Panel admin</button>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {busy ? <div className="evaluation-loading"><LoaderCircle className="spin" size={22} /> Cargando evaluaciones…</div> : (
        <>
          <section className="evaluation-progress-card">
            <div>
              <p className="evaluation-kicker">Progreso general</p>
              <strong>{progress}%</strong>
              <p>{completed} de {tasks.length} tareas completadas</p>
            </div>
            <div className="evaluation-progress-stats"><span><strong>{completed}</strong>Completadas</span><span><strong>{pending}</strong>Pendientes</span></div>
            <div className="evaluation-progress-track"><span style={{ width: `${progress}%` }} /></div>
          </section>
          <section className="evaluation-task-card">
            <div className="evaluation-card-heading"><h2>Tus evaluaciones</h2><span>{tasks.length} tareas</span></div>
            {tasks.length ? tasks.map((task) => <EvaluationTaskRow key={task.id} task={task} onOpen={() => setView({ type: 'form', task })} />) : <div className="evaluation-empty"><ClipboardCheck size={30} /><strong>Todo al día</strong><p>No tienes evaluaciones asignadas en este momento.</p></div>}
          </section>
        </>
      )}
    </div>
  );
}

function buildTask(type: EvaluationType, cycle: EvaluationCycle, target: EvaluationEmployee, responses: EvaluationResponse[], comments: EvaluationComment[], questions: EvaluationQuestion[], evaluatedId: string): EvaluationTask {
  const ownResponses = responses.filter((response) => response.cycle_id === cycle.id && response.evaluated_id === evaluatedId);
  const ownComment = comments.find((comment) => comment.cycle_id === cycle.id && comment.evaluated_id === evaluatedId);
  const hasResponses = hasAllResponses(ownResponses, questions);
  const hasComment = hasRequiredComments(ownComment);
  return { id: `${type}-${cycle.id}-${evaluatedId}`, type, cycle, target, completed: hasResponses && hasComment, hasResponses, hasComment };
}

function AdminEvaluacionesPanel({ onViewMine }: { onViewMine: () => void }) {
  const [cycles, setCycles] = useState<EvaluationCycle[]>([]);
  const [employees, setEmployees] = useState<EvaluationEmployee[]>([]);
  const [responseCount, setResponseCount] = useState(0);
  const [reports, setReports] = useState<EvaluationFinalReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<EvaluationFinalReport | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [evaluatedEmployeeId, setEvaluatedEmployeeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
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

  const createCycle = async () => {
    if (!name.trim() || saving) return;
    setSaving(true); setError('');
    try {
      const { error: insertError } = await sb.from('evaluation_cycles').insert({
        name: name.trim(),
        description: description.trim() || null,
        status: 'draft',
        evaluated_employee_id: evaluatedEmployeeId || null,
        start_date: startDate || null,
        end_date: endDate || null,
      });
      if (insertError) throw insertError;
      setName(''); setDescription(''); setEvaluatedEmployeeId(''); setStartDate(''); setEndDate(''); setShowCreate(false);
      await load();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  };

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
    <div className="evaluation-heading"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Panel de evaluaciones</h1><p>Gestiona ciclos y consulta el avance de las evaluaciones.</p></div><div className="evaluation-admin-actions"><button className="secondary" onClick={onViewMine}>Mis evaluaciones</button><button onClick={() => setShowCreate((visible) => !visible)}>{showCreate ? 'Cancelar' : 'Nuevo ciclo'}</button></div></div>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="success" role="status">{message}</p>}
    {showCreate && <section className="evaluation-form-card evaluation-cycle-form"><h2>Crear ciclo</h2><div className="evaluation-cycle-grid"><label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Evaluación semestral" /></label><label>Persona evaluada<select value={evaluatedEmployeeId} onChange={(event) => setEvaluatedEmployeeId(event.target.value)}><option value="">Selecciona una persona</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label><label>Inicio<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>Fin<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div><label className="evaluation-cycle-description">Descripción<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label><div className="evaluation-form-actions"><button onClick={createCycle} disabled={!name.trim() || saving}>{saving ? 'Guardando…' : 'Crear ciclo'}</button></div></section>}
    {busy ? <div className="evaluation-loading"><LoaderCircle className="spin" size={22} /> Cargando panel…</div> : <><div className="evaluation-admin-metrics"><div><span>Ciclos</span><strong>{cycles.length}</strong></div><div><span>Activos</span><strong>{cycles.filter((cycle) => cycle.status === 'active').length}</strong></div><div><span>Respuestas</span><strong>{responseCount}</strong></div></div><section className="evaluation-task-card evaluation-table-card"><div className="evaluation-card-heading"><div><h2>Evaluaciones</h2><p>Consulta el estado, los resultados y el reporte de cada ciclo.</p></div><span>{cycles.length} registradas</span></div>{cycles.length ? <div className="evaluation-table-wrap"><table className="evaluation-table"><thead><tr><th>Evaluación</th><th>Persona evaluada</th><th>Estado</th><th>Autoevaluación</th><th>Evaluación colectiva</th><th>Resultado final</th><th aria-label="Acciones" /></tr></thead><tbody>{cycles.map((cycle) => { const report = reports.find((item) => item.cycle_id === cycle.id); const evaluatedEmployee = employees.find((employee) => employee.id === cycle.evaluated_employee_id); return <tr key={cycle.id}><td><strong>{cycle.name}</strong><small>{cycle.description || 'Sin descripción'}{cycle.start_date ? ` · ${formatDate(cycle.start_date)}` : ''}</small></td><td>{evaluatedEmployee?.full_name || 'Sin persona asignada'}</td><td><span className={`evaluation-cycle-status ${cycle.status}`}>{cycle.status === 'active' ? 'En evaluación' : cycle.status === 'closed' ? 'Cerrada' : 'Borrador'}</span></td><td>{report ? formatScore(report.self_score) : '—'}</td><td>{report ? formatScore(report.collective_score) : '—'}</td><td className="evaluation-final-cell">{report ? report.final_score === null ? 'Pendiente' : formatScore(report.final_score) : '—'}</td><td><div className="evaluation-table-actions">{report && <button className="secondary" onClick={() => setSelectedReport(report)}>Ver reporte</button>}{cycle.status === 'active' && cycle.evaluated_employee_id && <><button className="secondary" onClick={() => notifyCycle(cycle)} disabled={notifyingCycleId !== null}>{notifyingCycleId === cycle.id ? 'Enviando…' : 'Enviar avisos'}</button><button className="secondary" onClick={() => closeCycle(cycle)} disabled={closingCycleId !== null}>{closingCycleId === cycle.id ? 'Cerrando…' : 'Cerrar ciclo'}</button></>}</div></td></tr>; })}</tbody></table></div> : <div className="evaluation-empty"><ClipboardCheck size={30} /><strong>Aún no hay evaluaciones</strong><p>Crea el primer ciclo para comenzar.</p></div>}</section></>}
  </div>;
}

function EvaluationReportView({ report, cycle, employee, onBack }: { report: EvaluationFinalReport; cycle?: EvaluationCycle; employee?: EvaluationEmployee; onBack: () => void }) {
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

  return <div className="evaluation-module evaluation-report-view"><button className="back-link" onClick={onBack}><ArrowLeft size={17} /> Volver al panel</button><header className="evaluation-report-hero"><div><p className="eyebrow">REPORTE FINAL</p><h1>{employee?.full_name || 'Persona evaluada'}</h1><p className="evaluation-report-meta"><span>{cycle?.name || 'Ciclo histórico'}</span>{employee?.position && <><i />{employee.position}</>}</p></div></header>{error && <p className="error" role="alert">{error}</p>}{busy ? <div className="evaluation-loading"><LoaderCircle className="spin" size={22} /> Cargando reporte…</div> : <><section className="evaluation-report-summary"><div><span>Autoevaluación</span><strong>{formatScore(report.self_score)}</strong><small>Percepción propia</small></div><div><span>Evaluación colectiva</span><strong>{formatScore(report.collective_score)}</strong><small>Percepción del equipo</small></div><div className={report.final_score === null ? 'is-pending' : ''}><span>Resultado final</span><strong>{formatScore(report.final_score)}</strong><small>{report.final_score === null ? 'Pendiente de cierre' : 'Resultado consolidado'}</small></div></section><section className="evaluation-report-card"><div className="evaluation-report-card-heading"><div><h2>Resultados por categoría</h2></div></div><div className="evaluation-category-results">{categories.map(([category, values]) => <div className="evaluation-category-result" key={category}><div className="evaluation-category-title"><strong>{CATEGORY_LABELS[category] ?? category}</strong></div><div className="evaluation-category-scores"><div><span>Autoevaluación</span><strong>{formatAverage(values.self)}</strong></div><div><span>Evaluación colectiva</span><strong>{formatAverage(values.peer)}</strong></div></div></div>)}</div></section><section className="evaluation-report-comments"><article><div className="evaluation-comment-heading"><span className="evaluation-comment-icon positive"><Check size={16} /></span><div><p className="evaluation-kicker">LO QUE DESTACA</p><h2>Fortalezas</h2></div></div><p className="evaluation-report-text">{report.strengths || comments.find((comment) => comment.strengths)?.strengths || 'Sin información registrada.'}</p></article><article><div className="evaluation-comment-heading"><span className="evaluation-comment-icon opportunity">↗</span><div><p className="evaluation-kicker">SIGUIENTE PASO</p><h2>Oportunidades</h2></div></div><p className="evaluation-report-text">{report.opportunities || comments.find((comment) => comment.opportunities)?.opportunities || 'Sin información registrada.'}</p></article></section>{report.admin_summary && <section className="evaluation-report-card evaluation-admin-summary"><div className="evaluation-report-card-heading"><div><p className="evaluation-kicker">NOTA DE ADMINISTRACIÓN</p><h2>Resumen administrativo</h2></div></div><p className="evaluation-report-text">{report.admin_summary}</p></section>}</>}</div>;
}

function formatScore(value: number | null) {
  return value === null || value === undefined ? '—' : `${(Number(value) * 100).toFixed(0)}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function formatAverage(values: number[]) {
  return values.length ? `${(values.reduce((sum, value) => sum + value, 0) / values.length * 100).toFixed(0)}%` : '—';
}

function averageNumber(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function EvaluationTaskRow({ task, onOpen }: { task: EvaluationTask; onOpen: () => void }) {
  return <div className="evaluation-task-row"><div className={`evaluation-task-icon ${task.completed ? 'done' : ''}`}>{task.completed ? <Check size={18} /> : <ClipboardCheck size={18} />}</div><div className="evaluation-task-copy"><strong>{task.type === 'self' ? 'Autoevaluación' : `Evaluación de ${task.target.full_name}`}</strong><span>{task.cycle.name}{task.target.position ? ` · ${task.target.position}` : ''}</span></div><span className={`evaluation-task-status ${task.completed ? 'done' : ''}`}>{task.completed ? 'Completada' : task.hasResponses ? 'Falta comentario' : 'Pendiente'}</span><button className={task.completed ? 'secondary' : ''} onClick={onOpen}>{task.completed ? 'Consultar' : 'Abrir'}</button></div>;
}

function EvaluationForm({ task, employeeId, onBack, onSaved }: { task: EvaluationTask; employeeId: string; onBack: () => void; onSaved: () => void }) {
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [strengths, setStrengths] = useState('');
  const [opportunities, setOpportunities] = useState('');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [questionResult, responseResult, commentResult] = await Promise.all([
          sb.from('evaluation_questions').select('*').order('question_order'),
          sb.from('evaluation_responses').select('*').eq('cycle_id', task.cycle.id).eq('evaluator_id', employeeId).eq('evaluated_id', task.target.id),
          sb.from('evaluation_comments').select('*').eq('cycle_id', task.cycle.id).eq('evaluator_id', employeeId).eq('evaluated_id', task.target.id).maybeSingle(),
        ]);
        if (questionResult.error) throw questionResult.error;
        if (responseResult.error) throw responseResult.error;
        if (commentResult.error) throw commentResult.error;
        if (!live) return;
        setQuestions((questionResult.data ?? []) as EvaluationQuestion[]);
        setAnswers(Object.fromEntries(((responseResult.data ?? []) as EvaluationResponse[]).map((response) => [response.question_id, Number(response.score)])));
        const comment = commentResult.data as EvaluationComment | null;
        setStrengths(comment?.strengths ?? '');
        setOpportunities(comment?.opportunities ?? '');
      } catch (loadError) {
        if (live) setError((loadError as Error).message);
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [employeeId, task.cycle.id, task.target.id]);

  const grouped = useMemo(() => questions.reduce<Record<string, EvaluationQuestion[]>>((groups, question) => { (groups[question.category] ??= []).push(question); return groups; }, {}), [questions]);
  const allAnswered = questions.length > 0 && questions.every((question) => answers[question.id] !== undefined);
  const canSave = allAnswered && strengths.trim().length > 0 && opportunities.trim().length > 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true); setError('');
    try {
      const rows = questions.map((question) => ({ cycle_id: task.cycle.id, question_id: question.id, evaluator_id: employeeId, evaluated_id: task.target.id, score: answers[question.id], evaluation_type: task.type }));
      const { error: responseError } = await sb.from('evaluation_responses').upsert(rows, { onConflict: 'cycle_id,question_id,evaluator_id,evaluated_id' });
      if (responseError) throw responseError;
      const { error: commentError } = await sb.from('evaluation_comments').upsert({ cycle_id: task.cycle.id, evaluator_id: employeeId, evaluated_id: task.target.id, evaluation_type: task.type, strengths: strengths.trim(), opportunities: opportunities.trim(), comment: null }, { onConflict: 'cycle_id,evaluator_id,evaluated_id,evaluation_type' });
      if (commentError) throw commentError;
      onSaved();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="evaluation-module evaluation-form"><button className="back-link" onClick={onBack}><ArrowLeft size={17} /> Volver a evaluaciones</button><div className="evaluation-heading"><div><p className="eyebrow">{task.type === 'self' ? 'AUTOEVALUACIÓN' : 'EVALUACIÓN A TERCERO'}</p><h1>{task.type === 'self' ? 'Tu evaluación' : task.target.full_name}</h1><p>{task.cycle.name}{task.target.position ? ` · ${task.target.position}` : ''}</p></div></div>{error && <p className="error" role="alert">{error}</p>}{busy ? <div className="evaluation-loading"><LoaderCircle className="spin" size={22} /> Cargando formulario…</div> : <><section className="evaluation-form-card"><p className="evaluation-form-note">Selecciona la frecuencia que mejor describa el desempeño observado.</p>{Object.entries(grouped).map(([category, categoryQuestions]) => <fieldset className="evaluation-category" key={category}><legend>{CATEGORY_LABELS[category] ?? category}</legend>{categoryQuestions.map((question) => <div className="evaluation-question" key={question.id}><p>{question.question_text}</p><div className="evaluation-options">{SCORE_OPTIONS.map((option) => { const storedValue = question.is_inverted ? 1.25 - option.value : option.value; return <label key={option.value} className={answers[question.id] === storedValue ? 'selected' : ''}><input type="radio" name={question.id} checked={answers[question.id] === storedValue} onChange={() => setAnswers((current) => ({ ...current, [question.id]: storedValue }))} />{option.label}</label>; })}</div></div>)}</fieldset>)}<div className="evaluation-comments"><label>Fortalezas<textarea value={strengths} onChange={(event) => setStrengths(event.target.value)} placeholder="¿Qué hace bien?" rows={4} /></label><label>Oportunidades<textarea value={opportunities} onChange={(event) => setOpportunities(event.target.value)} placeholder="¿Qué puede mejorar?" rows={4} /></label></div></section><div className="evaluation-form-actions"><p>{!allAnswered ? 'Responde todas las preguntas para continuar.' : !strengths.trim() || !opportunities.trim() ? 'Completa fortalezas y oportunidades.' : ''}</p><button onClick={save} disabled={!canSave || saving}>{saving ? <><LoaderCircle className="spin" size={17} /> Guardando…</> : <><Send size={17} /> Guardar evaluación</>}</button></div></>}</div>;
}
