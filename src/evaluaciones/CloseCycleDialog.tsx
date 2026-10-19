import { useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';

export type CloseCycleInput = { strengths: string; opportunities: string; adminSummary: string; finalPercent: number | null };

export function CloseCycleDialog({ pending, busy, onCancel, onConfirm }: {
  pending: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (input: CloseCycleInput) => void;
}) {
  const [strengths, setStrengths] = useState('');
  const [opportunities, setOpportunities] = useState('');
  const [adminSummary, setAdminSummary] = useState('');
  const [finalPercent, setFinalPercent] = useState('');
  const percent = finalPercent.trim() === '' ? null : Number(finalPercent);
  const invalid = percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100);

  return <div className="ai-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <div className="evaluation-close-dialog" role="dialog" aria-modal="true" aria-labelledby="close-cycle-title">
      <div className="evaluation-close-header">
        <div><h2 id="close-cycle-title">Cerrar ciclo</h2><p>Se generará el reporte final y ya no se podrán editar las evaluaciones.</p></div>
        <button type="button" className="icon" onClick={onCancel} disabled={busy} aria-label="Cancelar"><X size={18} /></button>
      </div>
      {pending > 0 && <p className="evaluation-close-warning" role="alert">Faltan {pending} evaluación{pending === 1 ? '' : 'es'} por completar. Si cierras ahora, no se incluirán en los promedios.</p>}
      <label>Fortalezas y Competencias Destacadas<textarea rows={4} value={strengths} onChange={(event) => setStrengths(event.target.value)} placeholder="Describe las principales fortalezas, habilidades destacadas y logros del colaborador durante este ciclo..." /></label>
      <label>Áreas de Oportunidad y Mejora<textarea rows={4} value={opportunities} onChange={(event) => setOpportunities(event.target.value)} placeholder="Detalla las áreas prioritarias de desarrollo identificadas a partir de las calificaciones más bajas y conductas observadas..." /></label>
      <label>Síntesis Administrativa / Conclusión<textarea rows={4} value={adminSummary} onChange={(event) => setAdminSummary(event.target.value)} placeholder="Redacta el análisis consolidado, conclusión ejecutiva y acuerdos de seguimiento con el colaborador..." /></label>
      <label className="evaluation-final-score">Calificación final (%) — opcional<input type="number" min={0} max={100} step={1} value={finalPercent} onChange={(event) => setFinalPercent(event.target.value)} placeholder="Vacío = promedio" aria-invalid={invalid} /></label>
      {invalid && <p className="error" role="alert">La calificación final debe estar entre 0 y 100.</p>}
      <div className="evaluation-form-actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button type="button" onClick={() => onConfirm({ strengths: strengths.trim(), opportunities: opportunities.trim(), adminSummary: adminSummary.trim(), finalPercent: percent })} disabled={busy || invalid}>{busy ? <><LoaderCircle className="spin" size={16} /> Cerrando…</> : 'Cerrar ciclo'}</button>
      </div>
    </div>
  </div>;
}
