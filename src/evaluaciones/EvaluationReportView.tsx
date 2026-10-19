import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, LoaderCircle } from "lucide-react";
import { sb } from "../lib/supabase";
import { buildParticipants, loadCycleData, participantStatus, type CycleData } from './cycleData';
import { buildEvaluationSummary } from './evaluationSummary';
import { EvaluationResultsTable } from './EvaluationResultsTable';
import { formatScore } from "./format";
import type { EvaluationCycle, EvaluationEmployee, EvaluationFinalReport } from './types';

export function EvaluationReportView({ report, cycle, employee, onBack }: { report: EvaluationFinalReport; cycle?: EvaluationCycle; employee?: EvaluationEmployee; onBack: () => void }) {
  const [data, setData] = useState<CycleData | null>(null);
  const [busy, setBusy] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [strengths, setStrengths] = useState(report.strengths ?? '');
  const [opportunities, setOpportunities] = useState(report.opportunities ?? '');
  const [adminSummary, setAdminSummary] = useState(report.admin_summary ?? '');
  const [finalPercent, setFinalPercent] = useState(report.final_score === null ? '' : String(Math.round(Number(report.final_score) * 100)));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const loaded = await loadCycleData(report.cycle_id, report.employee_id);
        if (live) setData(loaded);
      } catch (loadError) {
        if (live) setError((loadError as Error).message);
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [report.cycle_id, report.employee_id]);

  const participants = useMemo(() => data ? buildParticipants(data, report.employee_id) : [], [data, report.employee_id]);
  const summary = useMemo(() => buildEvaluationSummary(
    data?.questions ?? [], data?.responses ?? [],
    new Set(participants.filter((participant) => participant.complete).map((participant) => participant.assignment.evaluator_id)),
    report.employee_id,
  ), [data, participants, report.employee_id]);
  const comments = (data?.comments ?? []).filter((comment) => comment.evaluated_id === report.employee_id);
  const selfScore = report.self_score ?? summary.selfScore;
  const collectiveScore = report.collective_score ?? summary.collectiveScore;

  const percentValue = finalPercent.trim() === '' ? null : Number(finalPercent);
  const percentInvalid = percentValue !== null && (!Number.isFinite(percentValue) || percentValue < 0 || percentValue > 100);
  const current: EvaluationFinalReport = { ...report, strengths: strengths.trim() || null, opportunities: opportunities.trim() || null, admin_summary: adminSummary.trim() || null, final_score: percentValue === null || percentInvalid ? report.final_score : percentValue / 100 };

  const saveReport = async () => {
    if (percentInvalid) return;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const { error: saveError } = await sb.from('evaluation_final_reports').update({
        strengths: current.strengths,
        opportunities: current.opportunities,
        admin_summary: current.admin_summary,
        final_score: percentValue === null ? null : percentValue / 100,
      }).eq('id', report.id);
      if (saveError) throw saveError;
      setSaved(true);
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const exportExcel = async () => {
    if (!data || !cycle) return;
    setExporting(true);
    setError('');
    try {
      const { downloadEvaluationWorkbook } = await import('./evaluationExcel');
      await downloadEvaluationWorkbook({
        cycle: { ...cycle, evaluated_employee_id: report.employee_id },
        evaluated: employee,
        questions: data.questions, responses: data.responses, comments: data.comments, report: current, selfScore, collectiveScore,
        participants: participants.map((participant) => ({ evaluatorId: participant.assignment.evaluator_id, employee: participant.employee, status: participantStatus(participant) })),
      });
    } catch (exportError) {
      setError((exportError as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return <div className="evaluation-module evaluation-report-view">
    <header className="page-header evaluation-report-hero">
      <div>
        <button className="back-link" onClick={onBack}><ArrowLeft size={17} /> Volver al panel</button>
        <p className="eyebrow">REPORTE FINAL</p>
        <h1>Reporte: {employee?.full_name || 'Persona evaluada'}</h1>
        <p className="evaluation-report-meta"><span>Ciclo: {cycle?.name || 'Ciclo histórico'}</span>{employee?.position && <><i />{employee.position}</>}</p>
      </div>
      <button className="secondary" onClick={() => void exportExcel()} disabled={busy || exporting || !data || !cycle || !participants.length}>
        {exporting ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />} Exportar Excel
      </button>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    {busy ? <div className="evaluation-loading"><LoaderCircle className="spin" size={22} /> Cargando reporte…</div> : <>
      <section className="evaluation-report-summary">
        <div><span>Autoevaluación</span><strong>{formatScore(selfScore)}</strong><small>Calificación personal</small></div>
        <div><span>Calificación colectiva</span><strong>{formatScore(collectiveScore)}</strong><small>{summary.peerCount ? `Promedio de ${summary.peerCount} evaluador${summary.peerCount === 1 ? '' : 'es'}` : 'Promedio del equipo'}</small></div>
        <div className={current.final_score === null ? 'is-pending' : ''}><span>Calificación final</span><strong>{formatScore(current.final_score)}</strong><small>{current.final_score === null ? 'Definida por el administrador' : 'Resultado consolidado'}</small></div>
      </section>
      <section className="evaluation-report-card">
        <div className="evaluation-report-card-heading"><div><h2>Resultados por categoría</h2></div></div>
        {summary.categories.length
          ? <EvaluationResultsTable categories={summary.categories} questionScores={summary.questionScores} />
          : <p className="evaluation-form-note">Sin respuestas registradas para este reporte.</p>}
      </section>
      <section className="evaluation-report-card evaluation-admin-editor">
        <div className="evaluation-report-card-heading"><div><p className="evaluation-kicker">DICTAMEN DEL ADMINISTRADOR</p><h2>Comentarios finales</h2></div></div>
        <label>Fortalezas<textarea rows={5} value={strengths} onChange={(event) => { setStrengths(event.target.value); setSaved(false); }} placeholder="Principales fortalezas y logros durante este ciclo…" /></label>
        <label>Oportunidades de mejora<textarea rows={5} value={opportunities} onChange={(event) => { setOpportunities(event.target.value); setSaved(false); }} placeholder="Áreas prioritarias de desarrollo…" /></label>
        <label>Síntesis administrativa<textarea rows={5} value={adminSummary} onChange={(event) => { setAdminSummary(event.target.value); setSaved(false); }} placeholder="Conclusión ejecutiva y acuerdos de seguimiento…" /></label>
        <label className="evaluation-final-score">Calificación final (%)<input type="number" min={0} max={100} step={1} value={finalPercent} onChange={(event) => { setFinalPercent(event.target.value); setSaved(false); }} placeholder="0–100" aria-invalid={percentInvalid} /></label>
        {percentInvalid && <p className="error" role="alert">La calificación final debe estar entre 0 y 100.</p>}
        <div className="evaluation-form-actions"><p>{saved ? 'Reporte guardado.' : 'Los cambios se incluyen al exportar a Excel.'}</p><button type="button" onClick={() => void saveReport()} disabled={saving || percentInvalid}>{saving ? 'Guardando…' : 'Guardar reporte'}</button></div>
      </section>
    </>}
  </div>;
}
