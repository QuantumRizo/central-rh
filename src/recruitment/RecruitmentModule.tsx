import { useEffect, useState, type FormEvent } from 'react';
import { BriefcaseBusiness, FileText, RefreshCw } from 'lucide-react';
import { sb } from '../lib/supabase';

type Position = { id: string; title: string; description: string; required_criteria: string; preferred_criteria: string; status: 'open' | 'closed' };
type Candidate = { id: string; full_name: string; email: string | null; phone: string | null; summary: string; experience_summary: string; skills: string[]; document_path: string | null; document_name: string | null; processing_status: string; processing_error: string | null; stage: string; admin_notes: string; received_at: string; sender_email: string | null };
type Match = { candidate_id: string; position_id: string; score: number; rationale: string; matched_criteria: string[]; missing_criteria: string[] };

const stages: Record<string, string> = { new: 'Nuevo', reviewing: 'En revisión', interview: 'Entrevista', rejected: 'Descartado', hired: 'Contratado' };
const date = (value: string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));

export function RecruitmentModule() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedPosition, setSelectedPosition] = useState('all');
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', required_criteria: '', preferred_criteria: '' });
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    const [positionResult, candidateResult, matchResult] = await Promise.all([
      sb.from('recruitment_positions').select('*').order('created_at', { ascending: false }),
      sb.from('recruitment_candidates').select('*').order('received_at', { ascending: false }).limit(200),
      sb.from('recruitment_matches').select('*'),
    ]);
    for (const result of [positionResult, candidateResult, matchResult]) if (result.error) throw result.error;
    setPositions(positionResult.data || []);
    setCandidates(candidateResult.data || []);
    setMatches(matchResult.data || []);
  };
  useEffect(() => { let live = true; load().catch((cause) => { if (live) setError(cause.message); }).finally(() => { if (live) setBusy(false); }); return () => { live = false; }; }, []);

  const createPosition = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const { error: saveError } = await sb.from('recruitment_positions').insert(form);
      if (saveError) throw saveError;
      setForm({ title: '', description: '', required_criteria: '', preferred_criteria: '' });
      setFormOpen(false);
      await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  };

  const sync = async () => {
    setSyncing(true); setError(''); setNotice('');
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw Error('Tu sesión expiró');
      const response = await fetch('/api/recruitment-sync', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'No se pudo revisar el buzón');
      setNotice(`${result.processed} CV procesados; ${result.review} requieren revisión.`);
      await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setSyncing(false); }
  };

  const updateCandidate = async (id: string, patch: Partial<Candidate>) => {
    setError('');
    const { error: saveError } = await sb.from('recruitment_candidates').update(patch).eq('id', id);
    if (saveError) setError(saveError.message);
    else setCandidates((current) => current.map((candidate) => candidate.id === id ? { ...candidate, ...patch } : candidate));
  };

  const openCv = async (path: string) => {
    const { data, error: downloadError } = await sb.storage.from('recruitment-cvs').createSignedUrl(path, 60);
    if (downloadError) setError(downloadError.message);
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const scoreFor = (id: string) => selectedPosition === 'all'
    ? matches.filter((match) => match.candidate_id === id).sort((a, b) => b.score - a.score)[0]
    : matches.find((match) => match.candidate_id === id && match.position_id === selectedPosition);
  const visible = candidates.filter((candidate) => selectedPosition === 'all' || Boolean(scoreFor(candidate.id)))
    .sort((a, b) => (scoreFor(b.id)?.score ?? -1) - (scoreFor(a.id)?.score ?? -1));
  const current = candidates.find((candidate) => candidate.id === selectedCandidate);
  const currentMatches = matches.filter((match) => match.candidate_id === selectedCandidate).sort((a, b) => b.score - a.score);

  return <div className="recruitment-module">
    <header className="page-header"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Reclutamiento</h1><p>Currículums recibidos en Outlook y coincidencias con tus vacantes.</p></div><button type="button" className="secondary" onClick={() => void sync()} disabled={syncing}><RefreshCw size={16} /> {syncing ? 'Revisando…' : 'Revisar buzón'}</button></header>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="success" role="status">{notice}</p>}
    <section className="recruitment-card"><div className="recruitment-section-title"><div><BriefcaseBusiness size={20} /><h2>Vacantes y perfiles</h2></div><button type="button" onClick={() => setFormOpen((value) => !value)}>{formOpen ? 'Cancelar' : 'Nueva vacante'}</button></div>
      {formOpen && <form className="recruitment-form" onSubmit={(event) => void createPosition(event)}><label>Nombre del puesto<input required minLength={2} maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ejecutivo comercial" /></label><label>Descripción<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} /></label><label>Requisitos indispensables<textarea required value={form.required_criteria} onChange={(event) => setForm({ ...form, required_criteria: event.target.value })} rows={3} placeholder="Experiencia en ventas B2B; manejo de CRM…" /></label><label>Deseables<textarea value={form.preferred_criteria} onChange={(event) => setForm({ ...form, preferred_criteria: event.target.value })} rows={2} /></label><button disabled={saving}>{saving ? 'Guardando…' : 'Guardar vacante'}</button></form>}
      <div className="recruitment-position-list">{positions.length ? positions.map((position) => <div key={position.id}><div><strong>{position.title}</strong><small>{position.required_criteria || 'Sin criterios definidos'}</small></div><select aria-label={`Estado de ${position.title}`} value={position.status} onChange={async (event) => { const status = event.target.value; const { error: saveError } = await sb.from('recruitment_positions').update({ status }).eq('id', position.id); if (saveError) setError(saveError.message); else await load(); }}><option value="open">Abierta</option><option value="closed">Cerrada</option></select></div>) : <p>Aún no hay vacantes. Agrega una para comparar los CV que lleguen al buzón.</p>}</div>
    </section>
    <section className="recruitment-card"><div className="recruitment-section-title"><div><FileText size={20} /><h2>Candidatos</h2></div><span>{candidates.length} recibidos</span></div><div className="recruitment-toolbar"><label>Filtrar por vacante<select value={selectedPosition} onChange={(event) => setSelectedPosition(event.target.value)}><option value="all">Todas las vacantes</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</select></label><p>La puntuación es orientativa y requiere revisión humana.</p></div>
      {busy ? <p>Cargando candidatos…</p> : visible.length ? <div className="recruitment-list">{visible.map((candidate) => { const match = scoreFor(candidate.id); const position = positions.find((item) => item.id === match?.position_id); return <button className="recruitment-candidate-row" key={candidate.id} onClick={() => setSelectedCandidate(candidate.id)}><div><strong>{candidate.full_name}</strong><small>{candidate.email || candidate.sender_email || 'Correo no identificado'} · {date(candidate.received_at)}</small><span>{candidate.summary || (candidate.processing_status === 'processed' ? 'Sin resumen' : 'Pendiente de análisis')}</span></div><div className="recruitment-candidate-side">{match && <strong>{match.score}/100</strong>}<small>{position?.title || (candidate.processing_status === 'needs_review' ? 'Requiere revisión' : 'Sin vacante evaluada')}</small><em>{stages[candidate.stage] || candidate.stage}</em></div></button>; })}</div> : <p className="recruitment-empty">No hay candidatos para mostrar.</p>}
    </section>
    {current && <div className="recruitment-overlay" role="presentation" onMouseDown={() => setSelectedCandidate(null)}><section className="recruitment-detail" role="dialog" aria-modal="true" aria-label={`Candidato ${current.full_name}`} onMouseDown={(event) => event.stopPropagation()}><div className="recruitment-detail-head"><div><p className="eyebrow">CANDIDATO</p><h2>{current.full_name}</h2><p>{current.email || current.sender_email || 'Sin correo'}{current.phone ? ` · ${current.phone}` : ''}</p></div><button className="secondary" onClick={() => setSelectedCandidate(null)}>Cerrar</button></div><div className="recruitment-detail-body"><div className="recruitment-detail-actions"><label>Etapa<select value={current.stage} onChange={(event) => void updateCandidate(current.id, { stage: event.target.value })}>{Object.entries(stages).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>{current.document_path && <button className="secondary" onClick={() => void openCv(current.document_path!)}>Abrir CV</button>}</div>{current.processing_error && <p className="error">{current.processing_error}</p>}<section><h3>Resumen</h3><p>{current.summary || 'Sin información extraída.'}</p><p>{current.experience_summary}</p>{current.skills?.length > 0 && <div className="recruitment-skills">{current.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>}</section><section><h3>Coincidencias por puesto</h3>{currentMatches.length ? currentMatches.map((match) => <article className="recruitment-match" key={match.position_id}><div><strong>{positions.find((position) => position.id === match.position_id)?.title || 'Vacante'}</strong><b>{match.score}/100</b></div><p>{match.rationale}</p><small>Con evidencia: {match.matched_criteria.join('; ') || 'ninguno'}</small><small>Sin evidencia: {match.missing_criteria.join('; ') || 'ninguno'}</small></article>) : <p>Sin coincidencias. Define una vacante abierta antes de analizar nuevos CV.</p>}</section><section><h3>Notas de administración</h3><textarea rows={4} defaultValue={current.admin_notes} key={current.id} onBlur={(event) => { if (event.target.value !== current.admin_notes) void updateCandidate(current.id, { admin_notes: event.target.value }); }} /></section></div></section></div>}
  </div>;
}
