import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, LoaderCircle } from "lucide-react";
import { AdminDictamenEditor, dictamenFromReport, parsePercent } from './AdminDictamenEditor';
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
  const comments = (data?.comments ?? []).filter((comment) => comment.evaluated_id === report.employee_id);
  const selfScore = report.self_score ?? summary.selfScore;
  const collectiveScore = report.collective_score ?? summary.collectiveScore;

  const { percent: percentValue, invalid: percentInvalid } = parsePercent(draft.finalPercent);
  const current: EvaluationFinalReport = { ...report, strengths: draft.strengths.trim() || null, opportunities: draft.opportunities.trim() || null, admin_summary: draft.adminSummary.trim() || null, final_score: percentValue === null || percentInvalid ? report.final_score : percentValue / 100 };

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
      <div className="evaluation-admin-editor-wrap"><AdminDictamenEditor cycleId={report.cycle_id} employeeId={report.employee_id} report={report} draft={false} onChange={setDraft} /></div>
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
