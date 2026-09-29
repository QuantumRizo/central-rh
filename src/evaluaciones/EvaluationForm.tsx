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

export function EvaluationTaskRow({ task, onOpen }: { task: EvaluationTask; onOpen: () => void }) {
  return <div className="evaluation-task-row"><div className={`evaluation-task-icon ${task.completed ? 'done' : ''}`}>{task.completed ? <Check size={18} /> : <ClipboardCheck size={18} />}</div><div className="evaluation-task-copy"><strong>{task.type === 'self' ? 'Autoevaluación' : `Evaluación de ${task.target.full_name}`}</strong><span>{task.cycle.name}{task.target.position ? ` · ${task.target.position}` : ''}</span></div><span className={`evaluation-task-status ${task.completed ? 'done' : ''}`}>{task.completed ? 'Completada' : task.hasResponses ? 'Falta comentario' : 'Pendiente'}</span><button className={task.completed ? 'secondary' : ''} onClick={onOpen}>{task.completed ? 'Consultar' : 'Abrir'}</button></div>;
}

export function EvaluationForm({ task, employeeId, onBack, onSaved }: { task: EvaluationTask; employeeId: string; onBack: () => void; onSaved: () => void }) {
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

  return <div className="evaluation-module evaluation-form"><div className="page-header"><div><button className="back-link" onClick={onBack}><ArrowLeft size={17} /> Volver a evaluaciones</button><p className="eyebrow">{task.type === 'self' ? 'AUTOEVALUACIÓN' : 'EVALUACIÓN A TERCERO'}</p><h1>{task.type === 'self' ? 'Tu evaluación' : task.target.full_name}</h1><p>{task.cycle.name}{task.target.position ? ` · ${task.target.position}` : ''}</p></div></div>{error && <p className="error" role="alert">{error}</p>}{busy ? <div className="evaluation-loading"><LoaderCircle className="spin" size={22} /> Cargando formulario…</div> : <><section className="evaluation-form-card"><p className="evaluation-form-note">Selecciona la frecuencia que mejor describa el desempeño observado.</p>{Object.entries(grouped).map(([category, categoryQuestions]) => <fieldset className="evaluation-category" key={category}><legend>{CATEGORY_LABELS[category] ?? category}</legend>{categoryQuestions.map((question) => <div className="evaluation-question" key={question.id}><p>{question.question_text}</p><div className="evaluation-options">{SCORE_OPTIONS.map((option) => { const storedValue = question.is_inverted ? 1.25 - option.value : option.value; return <label key={option.value} className={answers[question.id] === storedValue ? 'selected' : ''}><input type="radio" name={question.id} checked={answers[question.id] === storedValue} onChange={() => setAnswers((current) => ({ ...current, [question.id]: storedValue }))} />{option.label}</label>; })}</div></div>)}</fieldset>)}<div className="evaluation-comments"><label>Fortalezas<textarea value={strengths} onChange={(event) => setStrengths(event.target.value)} placeholder="¿Qué hace bien?" rows={4} /></label><label>Oportunidades<textarea value={opportunities} onChange={(event) => setOpportunities(event.target.value)} placeholder="¿Qué puede mejorar?" rows={4} /></label></div></section><div className="evaluation-form-actions"><p>{!allAnswered ? 'Responde todas las preguntas para continuar.' : !strengths.trim() || !opportunities.trim() ? 'Completa fortalezas y oportunidades.' : ''}</p><button onClick={save} disabled={!canSave || saving}>{saving ? <><LoaderCircle className="spin" size={17} /> Guardando…</> : <><Send size={17} /> Guardar evaluación</>}</button></div></>}</div>;
}
