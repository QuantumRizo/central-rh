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
import { AdminEvaluacionesPanel } from "./AdminEvaluacionesPanel";
import { EvaluationForm, EvaluationTaskRow } from "./EvaluationForm";
import { hasAllResponses, hasRequiredComments } from "./taskUtils";

type Props = { employeeId: string; isAdmin: boolean };
type ModuleView = { type: 'home' } | { type: 'form'; task: EvaluationTask };

const employeeFields = 'id,full_name,position,department';

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
      <div className="page-header">
        <div>
          <p className="eyebrow">EVALUACIONES</p>
          <h1>{employee ? `Hola, ${getFirstName(employee.full_name)}` : 'Evaluaciones'}</h1>
          <p>Consulta y completa tus evaluaciones de desempeño.</p>
        </div>
        {isAdmin && <button className="secondary" onClick={() => setAdminView(true)}>Panel admin</button>}
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
