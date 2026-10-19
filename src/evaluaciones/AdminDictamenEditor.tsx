import { useState } from 'react';
import { sb } from '../lib/supabase';
import type { EvaluationFinalReport } from './types';

export type DictamenValues = { strengths: string; opportunities: string; adminSummary: string; finalPercent: string };

export function dictamenFromReport(report?: EvaluationFinalReport | null): DictamenValues {
  return {
    strengths: report?.strengths ?? '',
    opportunities: report?.opportunities ?? '',
    adminSummary: report?.admin_summary ?? '',
    finalPercent: report?.final_score == null ? '' : String(Math.round(Number(report.final_score) * 100)),
  };
}

export function parsePercent(value: string) {
  const percent = value.trim() === '' ? null : Number(value);
  return { percent, invalid: percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100) };
}

export function AdminDictamenEditor({ cycleId, employeeId, report, draft, onChange, onSaved }: {
  cycleId: string;
  employeeId: string;
  report?: EvaluationFinalReport | null;
  draft: boolean;
  onChange?: (values: DictamenValues) => void;
  onSaved?: () => void;
}) {
  const [values, setValues] = useState(() => dictamenFromReport(report));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const { percent, invalid } = parsePercent(values.finalPercent);

  const update = (patch: Partial<DictamenValues>) => {
    const next = { ...values, ...patch };
    setValues(next);
    setSaved(false);
    onChange?.(next);
  };

  const save = async () => {
    if (invalid) return;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const { error: saveError } = await sb.from('evaluation_final_reports').upsert({
        cycle_id: cycleId,
        employee_id: employeeId,
        strengths: values.strengths.trim() || null,
        opportunities: values.opportunities.trim() || null,
        admin_summary: values.adminSummary.trim() || null,
        final_score: percent === null ? null : percent / 100,
      }, { onConflict: 'cycle_id,employee_id' });
      if (saveError) throw saveError;
      setSaved(true);
      onSaved?.();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return <section className="evaluation-report-card evaluation-admin-editor">
    <div className="evaluation-report-card-heading"><div><h2>Dictamen y Retroalimentación Administrativa</h2><p>Estructura el reporte final del colaborador separando fortalezas, oportunidades detectadas en los reactivos y la síntesis administrativa.</p></div></div>
    <label>Fortalezas y Competencias Destacadas<textarea rows={5} value={values.strengths} onChange={(event) => update({ strengths: event.target.value })} placeholder="Describe las principales fortalezas, habilidades destacadas y logros del colaborador durante este ciclo..." /></label>
    <label>Áreas de Oportunidad y Mejora<textarea rows={5} value={values.opportunities} onChange={(event) => update({ opportunities: event.target.value })} placeholder="Detalla las áreas prioritarias de desarrollo identificadas a partir de las calificaciones más bajas y conductas observadas..." /></label>
    <label>Síntesis Administrativa / Conclusión<textarea rows={5} value={values.adminSummary} onChange={(event) => update({ adminSummary: event.target.value })} placeholder="Redacta el análisis consolidado, conclusión ejecutiva y acuerdos de seguimiento con el colaborador..." /></label>
    <label className="evaluation-final-score">Calificación final (%)<input type="number" min={0} max={100} step={1} value={values.finalPercent} onChange={(event) => update({ finalPercent: event.target.value })} placeholder="0–100" aria-invalid={invalid} /></label>
    {invalid && <p className="error" role="alert">La calificación final debe estar entre 0 y 100.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="evaluation-form-actions">
      <p>{saved ? (draft ? 'Borrador guardado.' : 'Reporte guardado.') : draft ? 'Es un borrador: el colaborador no lo verá hasta que cierres el ciclo.' : 'Los cambios se incluyen al exportar a Excel.'}</p>
      <button type="button" onClick={() => void save()} disabled={saving || invalid}>{saving ? 'Guardando…' : draft ? 'Guardar borrador' : 'Guardar reporte'}</button>
    </div>
  </section>;
}
