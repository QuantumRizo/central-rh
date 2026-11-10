import { useState } from 'react';
import { CalendarPlus, LoaderCircle, X } from 'lucide-react';
import { sb } from '../lib/supabase';
import { formatDate } from './format';
import type { EvaluationCycle } from './types';

const QUICK_OPTIONS = [
  { label: '+3 días', days: 3 },
  { label: '+1 semana', days: 7 },
  { label: '+2 semanas', days: 14 },
];

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function addDays(isoDay: string, days: number) {
  const date = new Date(`${isoDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Amplía la fecha de fin de un ciclo sin pasar por el editor completo. */
export function DeadlineExtender({ cycle, onSaved }: { cycle: EvaluationCycle; onSaved: (notice: string) => void }) {
  const currentEnd = cycle.end_date?.slice(0, 10) ?? '';
  const today = todayIso();
  // Las ampliaciones rápidas parten de la fecha vigente o de hoy si ya venció.
  const base = currentEnd && currentEnd > today ? currentEnd : today;
  const minDate = cycle.start_date?.slice(0, 10) || undefined;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => addDays(base, 7));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (cycle.status === 'closed') return null;

  const save = async (nextEnd: string) => {
    if (!nextEnd) { setError('Elige una fecha.'); return; }
    if (minDate && nextEnd < minDate) { setError('La fecha límite debe ser igual o posterior al inicio.'); return; }
    setSaving(true); setError('');
    const { error: updateError } = await sb.from('evaluation_cycles').update({ end_date: nextEnd }).eq('id', cycle.id);
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    setOpen(false);
    onSaved(`Fecha límite actualizada al ${formatDate(nextEnd)}.`);
  };

  if (!open) return <button type="button" className="secondary evaluation-deadline-toggle" onClick={() => { setValue(addDays(base, 7)); setError(''); setOpen(true); }}>
    <CalendarPlus size={15} /> {currentEnd ? 'Ampliar fecha límite' : 'Definir fecha límite'}
  </button>;

  return <div className="evaluation-deadline-extender" role="group" aria-label="Ampliar fecha límite">
    <div className="evaluation-deadline-quick">
      {QUICK_OPTIONS.map((option) => <button key={option.days} type="button" className="secondary" disabled={saving} onClick={() => void save(addDays(base, option.days))} title={`Nueva fecha: ${formatDate(addDays(base, option.days))}`}>{option.label}</button>)}
    </div>
    <div className="evaluation-deadline-custom">
      <input type="date" aria-label="Nueva fecha límite" value={value} min={minDate} onChange={(event) => setValue(event.target.value)} disabled={saving} />
      <button type="button" onClick={() => void save(value)} disabled={saving || !value}>{saving ? <><LoaderCircle className="spin" size={15} /> Guardando…</> : 'Guardar'}</button>
      <button type="button" className="icon" onClick={() => setOpen(false)} disabled={saving} aria-label="Cancelar"><X size={16} /></button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
