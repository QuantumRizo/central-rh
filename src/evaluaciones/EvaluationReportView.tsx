import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, LoaderCircle } from "lucide-react";
import { sb } from "../lib/supabase";
import { buildParticipants, loadCycleData, participantStatus, type CycleData, type Participant } from './cycleData';
import { buildEvaluationSummary } from './evaluationSummary';
import { EvaluationResultsTable } from './EvaluationResultsTable';
import { formatScore } from "./format";
import type { EvaluationComment, EvaluationCycle, EvaluationEmployee, EvaluationFinalReport, EvaluationQuestion, EvaluationResponse } from './types';

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
    <div className="evaluation-print-header">
      <h1>Central de Negocios</h1>
      <dl>
        <div><dt>Colaborador:</dt><dd>{employee?.full_name ?? '—'}</dd></div>
        <div><dt>Área:</dt><dd>{employee?.department ?? '—'}</dd></div>
        <div><dt>Puesto:</dt><dd>{employee?.position ?? '—'}</dd></div>
        <div><dt>Ciclo:</dt><dd>{cycle?.name ?? '—'}</dd></div>
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
      <section className="evaluation-report-card evaluation-admin-editor">
        <div className="evaluation-report-card-heading"><div><h2>Dictamen y Retroalimentación Administrativa</h2><p>Estructura el reporte final del colaborador separando fortalezas, oportunidades detectadas en los reactivos y la síntesis administrativa.</p></div></div>
        <label>Fortalezas y Competencias Destacadas<textarea rows={5} value={strengths} onChange={(event) => { setStrengths(event.target.value); setSaved(false); }} placeholder="Describe las principales fortalezas, habilidades destacadas y logros del colaborador durante este ciclo..." /></label>
        <label>Áreas de Oportunidad y Mejora<textarea rows={5} value={opportunities} onChange={(event) => { setOpportunities(event.target.value); setSaved(false); }} placeholder="Detalla las áreas prioritarias de desarrollo identificadas a partir de las calificaciones más bajas y conductas observadas..." /></label>
        <label>Síntesis Administrativa / Conclusión<textarea rows={5} value={adminSummary} onChange={(event) => { setAdminSummary(event.target.value); setSaved(false); }} placeholder="Redacta el análisis consolidado, conclusión ejecutiva y acuerdos de seguimiento con el colaborador..." /></label>
        <label className="evaluation-final-score">Calificación final (%)<input type="number" min={0} max={100} step={1} value={finalPercent} onChange={(event) => { setFinalPercent(event.target.value); setSaved(false); }} placeholder="0–100" aria-invalid={percentInvalid} /></label>
        {percentInvalid && <p className="error" role="alert">La calificación final debe estar entre 0 y 100.</p>}
        <div className="evaluation-form-actions"><p>{saved ? 'Reporte guardado.' : 'Los cambios se incluyen al exportar a Excel.'}</p><button type="button" onClick={() => void saveReport()} disabled={saving || percentInvalid}>{saving ? 'Guardando…' : 'Guardar reporte'}</button></div>
      </section>
      <section className="evaluation-print-dictamen">
        {current.strengths && <div><h3>Fortalezas y competencias destacadas</h3><p>{current.strengths}</p></div>}
        {current.opportunities && <div><h3>Áreas de oportunidad y mejora</h3><p>{current.opportunities}</p></div>}
        <div><h3>Síntesis administrativa / conclusión</h3><p>{current.admin_summary || 'Sin síntesis administrativa.'}</p></div>
        {current.final_score !== null && <div className="evaluation-print-final"><h3>Calificación final asignada</h3><strong>{formatScore(current.final_score)}</strong></div>}
      </section>
      <EvaluatorDetails participants={participants} questions={data?.questions ?? []} responses={data?.responses ?? []} comments={comments} evaluatedId={report.employee_id} />
      <div className="evaluation-print-signatures">
        <div><span>Firma del administrador</span></div>
        <div><span>Firma del colaborador</span></div>
        <p>Documento generado el {new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })} — Central de Negocios</p>
      </div>
    </>}
  </div>;
}

function EvaluatorDetails({ participants, questions, responses, comments, evaluatedId }: { participants: Participant[]; questions: EvaluationQuestion[]; responses: EvaluationResponse[]; comments: EvaluationComment[]; evaluatedId: string }) {
  const entries = participants
    .filter((participant) => participant.started)
    .sort((a, b) => Number(b.assignment.evaluator_id === evaluatedId) - Number(a.assignment.evaluator_id === evaluatedId) || (a.employee?.full_name ?? '').localeCompare(b.employee?.full_name ?? '', 'es'));
  if (!entries.length) return null;
  return <section className="evaluation-evaluator-details">
    <h2>Detalle de evaluadores y comentarios</h2>
    {entries.map(({ assignment, employee }) => {
      const own = responses.filter((response) => response.evaluator_id === assignment.evaluator_id && response.evaluated_id === evaluatedId);
      const comment = comments.find((item) => item.evaluator_id === assignment.evaluator_id);
      const isSelf = assignment.evaluator_id === evaluatedId;
      return <article className="evaluation-report-card evaluation-evaluator-card" key={assignment.id}>
        <header>
          <span className="evaluation-avatar">{(employee?.full_name ?? '?').charAt(0).toUpperCase()}</span>
          <div><h3>{employee?.full_name || 'Colaborador'}{isSelf && <em>Autoevaluación</em>}</h3><p>{employee?.position || 'Sin puesto'} • {employee?.department || 'Sin área'}</p></div>
        </header>
        {(comment?.comment || comment?.strengths || comment?.opportunities) && <div className="evaluation-evaluator-comments">
          {comment.comment && <div><span>Comentario general</span><p>{comment.comment}</p></div>}
          {comment.strengths && <div><span>Fortalezas</span><p>{comment.strengths}</p></div>}
          {comment.opportunities && <div><span>Oportunidades de mejora</span><p>{comment.opportunities}</p></div>}
        </div>}
        <span className="evaluation-evaluator-label">Respuestas del evaluador (0% a 100%)</span>
        <div className="evaluation-evaluator-answers">
          {questions.map((question, index) => {
            const response = own.find((item) => item.question_id === question.id);
            if (!response) return null;
            const score = Number(response.score);
            return <div key={question.id}><small>{index + 1}.</small><p>{question.question_text}</p><strong className={score >= 0.75 ? 'good' : score >= 0.5 ? 'warn' : 'bad'}>{formatScore(score)}</strong></div>;
          })}
        </div>
      </article>;
    })}
  </section>;
}
