import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, FileText, LoaderCircle } from "lucide-react";
import { AdminDictamenEditor, dictamenFromReport, parsePercent } from './AdminDictamenEditor';
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
  const [draft, setDraft] = useState(() => dictamenFromReport(report));

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
  const selfScore = report.self_score ?? summary.selfScore;
  const collectiveScore = report.collective_score ?? summary.collectiveScore;

  const { percent: percentValue, invalid: percentInvalid } = parsePercent(draft.finalPercent);
  const current: EvaluationFinalReport = { ...report, strengths: draft.strengths.trim() || null, opportunities: draft.opportunities.trim() || null, admin_summary: draft.adminSummary.trim() || null, final_score: percentValue === null || percentInvalid ? report.final_score : percentValue / 100 };

  // El PDF es la impresión del navegador (Guardar como PDF); el título del documento sirve de nombre de archivo.
  const downloadPdf = () => {
    const previous = document.title;
    const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
    document.title = `Reporte_${slug(employee?.full_name || 'evaluacion')}_${slug(cycle?.name || 'ciclo')}`;
    const restore = () => { document.title = previous; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
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
      <div className="page-header-actions">
      <button className="secondary" onClick={downloadPdf} disabled={busy}><FileText size={16} /> Descargar PDF</button>
      <button className="secondary" onClick={() => void exportExcel()} disabled={busy || exporting || !data || !cycle || !participants.length}>
        {exporting ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />} Exportar Excel
      </button>
      </div>
    </header>
    <div className="evaluation-print-header">
      <img src="/Logo_CN_2025_Negro.webp" alt="Central" />
      <h1>Reporte de evaluación de desempeño</h1>
      <dl>
        <div><dt>Colaborador:</dt><dd>{employee?.full_name ?? '—'}</dd></div>
        <div><dt>Puesto:</dt><dd>{employee?.position ?? '—'}</dd></div>
        <div><dt>Ciclo:</dt><dd>{cycle?.name ?? '—'}</dd></div>
        <div><dt>Fecha:</dt><dd>{new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</dd></div>
      </dl>
    </div>
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
      <div className="evaluation-admin-editor-wrap"><AdminDictamenEditor cycleId={report.cycle_id} employeeId={report.employee_id} report={report} draft={false} onChange={setDraft} /></div>
      <section className="evaluation-print-dictamen">
        {current.strengths && <div><h3>Fortalezas y competencias destacadas</h3><p>{current.strengths}</p></div>}
        {current.opportunities && <div><h3>Áreas de oportunidad y mejora</h3><p>{current.opportunities}</p></div>}
        <div><h3>Síntesis administrativa / conclusión</h3><p>{current.admin_summary || 'Sin síntesis administrativa.'}</p></div>
        {current.final_score !== null && <div className="evaluation-print-final"><h3>Calificación final asignada</h3><strong>{formatScore(current.final_score)}</strong></div>}
      </section>
    </>}
  </div>;
}
