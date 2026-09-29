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

export function CycleEditor({ cycle, employees, onBack, onSaved }: {
  cycle: EvaluationCycle | null;
  employees: EvaluationEmployee[];
  onBack: () => void;
  onSaved: (notice: string) => void;
}) {
  const [name, setName] = useState(cycle?.name ?? '');
  const [description, setDescription] = useState(cycle?.description ?? '');
  const [evaluatedId, setEvaluatedId] = useState(cycle?.evaluated_employee_id ?? '');
  const [startDate, setStartDate] = useState(cycle?.start_date?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(cycle?.end_date?.slice(0, 10) ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<EvaluationAssignment[]>([]);
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(Boolean(cycle));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const evaluated = employees.find((employee) => employee.id === evaluatedId);
  const peers = [...selectedIds].filter((id) => id !== evaluatedId);
  const candidates = employees.filter((employee) => employee.id !== evaluatedId &&
    `${employee.full_name} ${employee.department ?? ''} ${employee.position ?? ''}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es').trim()));
  candidates.sort((a, b) => Number(selectedIds.has(b.id)) - Number(selectedIds.has(a.id)) || a.full_name.localeCompare(b.full_name, 'es'));

  useEffect(() => {
    if (!cycle) return;
    let live = true;
    (async () => {
      const [assignmentResult, responseResult, commentResult] = await Promise.all([
        sb.from('evaluation_assignments').select('*').eq('cycle_id', cycle.id).eq('evaluated_id', cycle.evaluated_employee_id),
        sb.from('evaluation_responses').select('evaluator_id').eq('cycle_id', cycle.id).eq('evaluated_id', cycle.evaluated_employee_id),
        sb.from('evaluation_comments').select('evaluator_id').eq('cycle_id', cycle.id).eq('evaluated_id', cycle.evaluated_employee_id),
      ]);
      if (!live) return;
      const failure = [assignmentResult, responseResult, commentResult].find((result) => result.error);
      if (failure?.error) setError(failure.error.message);
      else {
        const rows = (assignmentResult.data ?? []) as EvaluationAssignment[];
        setAssignments(rows);
        setSelectedIds(new Set(rows.map((row) => row.evaluator_id)));
        setLockedIds(new Set([...(responseResult.data ?? []), ...(commentResult.data ?? [])].map((row) => row.evaluator_id)));
      }
      setBusy(false);
    })();
    return () => { live = false; };
  }, [cycle]);

  const toggle = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const save = async () => {
    if (saving || !name.trim() || !evaluatedId || peers.length === 0) return;
    if (startDate && endDate && endDate < startDate) { setError('La fecha de fin debe ser igual o posterior al inicio.'); return; }
    setSaving(true); setError('');
    let createdId: string | null = null;
    try {
      const desiredIds = [...new Set([evaluatedId, ...peers])];
      const previousIds = new Set(assignments.map((row) => row.evaluator_id));
      const addedIds = desiredIds.filter((id) => !previousIds.has(id));
      const removed = assignments.filter((row) => !desiredIds.includes(row.evaluator_id));
      if (removed.some((row) => lockedIds.has(row.evaluator_id))) throw new Error('No se puede quitar a un evaluador que ya respondió.');
      let cycleId = cycle?.id;
      if (!cycleId) {
        const { data, error: createError } = await sb.from('evaluation_cycles').insert({
          name: name.trim(), description: description.trim() || null, status: 'draft',
          evaluated_employee_id: evaluatedId, start_date: startDate || null, end_date: endDate || null,
        }).select('id').single();
        if (createError) throw createError;
        cycleId = data.id;
        createdId = data.id;
      } else {
        if (cycle?.status === 'closed') throw new Error('Un ciclo cerrado no se puede modificar.');
        if (cycle?.evaluated_employee_id && cycle.evaluated_employee_id !== evaluatedId) throw new Error('La persona evaluada de un ciclo existente no se puede cambiar.');
        const { error: updateError } = await sb.from('evaluation_cycles').update({
          name: name.trim(), description: description.trim() || null,
          evaluated_employee_id: evaluatedId, start_date: startDate || null, end_date: endDate || null,
        }).eq('id', cycleId);
        if (updateError) throw updateError;
      }

      if (addedIds.length) {
        const { error: insertError } = await sb.from('evaluation_assignments').upsert(addedIds.map((id) => ({
          cycle_id: cycleId, evaluated_id: evaluatedId, evaluator_id: id,
        })), { onConflict: 'cycle_id,evaluated_id,evaluator_id' });
        if (insertError) throw insertError;
      }
      if (removed.length) {
        const { error: removeError } = await sb.from('evaluation_assignments').delete().in('id', removed.map((row) => row.id));
        if (removeError) throw removeError;
      }
      if (!cycle || cycle.status === 'draft') {
        const { error: activateError } = await sb.from('evaluation_cycles').update({ status: 'active' }).eq('id', cycleId);
        if (activateError) throw activateError;
      }

      let notice = cycle ? 'Ciclo y evaluadores actualizados.' : 'Ciclo creado y evaluadores asignados.';
      if (sendEmail && addedIds.length) {
        try {
          const { data, error: emailError } = await sb.functions.invoke('send-assignment-email', {
            body: { cycle_id: cycleId, evaluator_ids: addedIds },
          });
          if (emailError) throw emailError;
          if (!data?.success) throw new Error(data?.message || 'No se pudieron enviar los correos.');
          notice += ` ${data.message}`;
          if (data.skippedCount) notice += ` ${data.skippedCount} sin enviar.`;
        } catch (emailError) {
          notice += ` No se pudieron enviar los correos: ${(emailError as Error).message}. Puedes usar “Enviar avisos” desde el panel.`;
        }
      }
      onSaved(notice);
    } catch (saveError) {
      if (createdId) {
        const { error: cleanupError } = await sb.from('evaluation_cycles').delete().eq('id', createdId);
        if (cleanupError) setError(`No se terminó de crear el ciclo: ${(saveError as Error).message}. El borrador quedó guardado; vuelve al panel para revisarlo.`);
        else setError((saveError as Error).message);
      } else setError((saveError as Error).message);
    } finally { setSaving(false); }
  };

  return <div className="evaluation-module evaluation-cycle-editor">
    <div className="page-header"><div><button type="button" className="back-link" onClick={onBack}><ArrowLeft size={16} /> Volver al panel</button><p className="eyebrow">GESTIÓN DE CICLOS</p><h1>{cycle ? cycle.name : 'Nuevo ciclo de evaluación'}</h1><p>Define a quién se evalúa y quiénes participarán antes de iniciar.</p></div></div>
    {error && <p className="error" role="alert">{error}</p>}
    {busy ? <div className="evaluation-loading"><LoaderCircle className="spin" size={20} /> Cargando asignaciones…</div> : <div className="evaluation-setup-layout">
      <section className="evaluation-form-card evaluation-cycle-form">
        <div><p className="evaluation-kicker">01 · Datos del ciclo</p><h2>Persona y periodo</h2></div>
        <label>¿A quién se evalúa?<select value={evaluatedId} disabled={Boolean(cycle?.evaluated_employee_id) || cycle?.status === 'closed'} onChange={(event) => { setEvaluatedId(event.target.value); setSelectedIds(new Set()); }}><option value="">Selecciona una persona</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label>
        {evaluated && <div className="evaluation-evaluatee"><strong>{evaluated.full_name}</strong><span>{evaluated.department || evaluated.position || 'Sin área'}</span><small>Su autoevaluación se asigna automáticamente.</small></div>}
        <label>Nombre del ciclo<input value={name} disabled={cycle?.status === 'closed'} onChange={(event) => setName(event.target.value)} placeholder="Ej. 1er Semestre 2026" /></label>
        <div className="evaluation-cycle-dates"><label>Inicio<input type="date" value={startDate} disabled={cycle?.status === 'closed'} onChange={(event) => setStartDate(event.target.value)} /></label><label>Fin<input type="date" value={endDate} disabled={cycle?.status === 'closed'} onChange={(event) => setEndDate(event.target.value)} /></label></div>
        <label>Descripción (opcional)<textarea rows={3} value={description} disabled={cycle?.status === 'closed'} onChange={(event) => setDescription(event.target.value)} /></label>
      </section>
      <section className="evaluation-form-card evaluation-cycle-form">
        <div><p className="evaluation-kicker">02 · Participantes</p><h2>Selecciona a los evaluadores</h2><p className="evaluation-form-note">{peers.length} evaluador{peers.length === 1 ? '' : 'es'} seleccionado{peers.length === 1 ? '' : 's'} + autoevaluación</p></div>
        <input type="search" aria-label="Buscar evaluador" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, área o puesto…" />
        <div className="evaluation-evaluator-list">{candidates.map((employee) => <label key={employee.id} className={`evaluation-evaluator ${selectedIds.has(employee.id) ? 'selected' : ''}`}><input type="checkbox" checked={selectedIds.has(employee.id)} disabled={cycle?.status === 'closed' || (lockedIds.has(employee.id) && selectedIds.has(employee.id))} onChange={() => toggle(employee.id)} /><span><strong>{employee.full_name}</strong><small>{employee.department || employee.position || 'Sin área'}{lockedIds.has(employee.id) ? ' · Ya respondió' : ''}</small></span></label>)}{candidates.length === 0 && <p className="evaluation-form-note">No se encontraron colaboradores.</p>}</div>
        {cycle?.status !== 'closed' && <><label className="evaluation-email-choice"><input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} /> Enviar correo a participantes recién asignados, incluida la autoevaluación</label><div className="evaluation-form-actions"><button type="button" className="secondary" onClick={onBack}>Cancelar</button><button type="button" disabled={saving || !name.trim() || !evaluatedId || peers.length === 0} onClick={() => void save()}>{saving ? 'Guardando…' : cycle ? 'Guardar asignaciones' : 'Crear ciclo y asignar'}</button></div></>}
      </section>
    </div>}
  </div>;
}
