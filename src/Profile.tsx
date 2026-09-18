import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Area } from 'react-easy-crop';
import { ArrowLeft, Camera, ClipboardCheck, Clock3, LoaderCircle, Mail, UserRound } from 'lucide-react';
import { sb } from './lib/supabase';
import { cropProfilePhoto, PhotoCropper } from './profile/PhotoCropper';

type Employee = {
  id: string;
  full_name: string;
  position: string;
  department: string | null;
  email: string | null;
  status: string;
  created_at: string;
  avatar_path: string | null;
};
type Sheet = { work_date: string; attendance: string; entry_time: string | null; exit_time: string | null };
type Report = { id: string; created_at: string; final_score: number | null; self_score: number | null; collective_score: number | null };

const monthLabel = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
const dateLabel = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
const score = (value: number | null) => value === null ? '—' : `${Math.round(Number(value) * 100)}%`;
const localDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const hoursIn = (sheet: Sheet) => {
  if (sheet.attendance !== 'worked' || !sheet.entry_time || !sheet.exit_time) return 0;
  const [startHour, startMinute] = sheet.entry_time.split(':').map(Number);
  const [endHour, endMinute] = sheet.exit_time.split(':').map(Number);
  return Math.max(0, (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60);
};

export function Profile({ session, employeeId, viewerEmployeeId, onBack, backLabel = 'Volver a perfiles', onEvaluations }: { session: Session; employeeId: string; viewerEmployeeId: string; onBack?: () => void; backLabel?: string; onEvaluations: () => void }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!employeeId) { setBusy(false); return; }
    setBusy(true);
    setError('');
    const today = new Date();
    const from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    try {
      const [employeeResult, sheetsResult, reportsResult] = await Promise.all([
        sb.from('employees').select('id,full_name,position,department,email,status,created_at,avatar_path').eq('id', employeeId).single(),
        sb.from('timesheets').select('work_date,attendance,entry_time,exit_time').eq('employee_id', employeeId).gte('work_date', from).lte('work_date', localDate(today)).order('work_date', { ascending: false }),
        sb.from('evaluation_final_reports').select('id,created_at,final_score,self_score,collective_score').eq('employee_id', employeeId).order('created_at', { ascending: false }).limit(3),
      ]);
      const failure = [employeeResult, sheetsResult, reportsResult].find((result) => result.error);
      if (failure?.error) throw failure.error;
      const person = employeeResult.data as Employee;
      setEmployee(person);
      setSheets((sheetsResult.data ?? []) as Sheet[]);
      setReports((reportsResult.data ?? []) as Report[]);
      if (person.avatar_path) {
        const { data, error: photoError } = await sb.storage.from('profile-photos').createSignedUrl(person.avatar_path, 3600);
        if (photoError) throw photoError;
        setPhotoUrl(data.signedUrl);
      } else setPhotoUrl(null);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setBusy(false);
    }
  }, [employeeId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (selectedPhoto) URL.revokeObjectURL(selectedPhoto); }, [selectedPhoto]);

  const preparePhoto = async (file?: File) => {
    if (!file) return;
    setError(''); setMessage(''); setPreparing(true);
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('La imagen original debe pesar menos de 50 MB.');
      const heic = /\.hei[cf]$/i.test(file.name) || /^image\/hei[cf]$/i.test(file.type);
      if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') throw new Error('Selecciona una fotografía, no un archivo SVG.');
      if (!heic && file.type && !file.type.startsWith('image/')) throw new Error('Selecciona una fotografía compatible.');
      const source = heic ? await import('heic-to').then(({ heicTo }) => heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 })) : file;
      const url = URL.createObjectURL(source);
      try {
        const preview = new Image();
        preview.src = url;
        await preview.decode();
        setSelectedPhoto(url);
      } catch {
        URL.revokeObjectURL(url);
        throw new Error('No se pudo abrir esta imagen. Prueba con otra foto.');
      }
    } catch (prepareError) {
      setError((prepareError as Error).message);
    } finally {
      setPreparing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const uploadPhoto = async (area: Area) => {
    if (!selectedPhoto || !employeeId) return;
    setUploading(true); setError(''); setMessage('');
    try {
      const photo = await cropProfilePhoto(selectedPhoto, area);
      const path = `${session.user.id}/avatar-${Date.now()}.jpg`;
      const { error: uploadError } = await sb.storage.from('profile-photos').upload(path, photo, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;
      const { error: updateError } = await sb.from('employees').update({ avatar_path: path }).eq('id', employeeId);
      if (updateError) {
        await sb.storage.from('profile-photos').remove([path]);
        throw updateError;
      }
      if (employee?.avatar_path) await sb.storage.from('profile-photos').remove([employee.avatar_path]);
      setMessage('Foto actualizada.');
      setSelectedPhoto(null);
      await load();
    } catch (uploadError) {
      setError((uploadError as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const today = new Date();
  const isOwn = employeeId === viewerEmployeeId;
  const worked = sheets.filter((sheet) => sheet.attendance === 'worked');
  const totalHours = worked.reduce((sum, sheet) => sum + hoursIn(sheet), 0);
  const initials = employee?.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';

  return <div className="profile-page">
    <div className="profile-heading">{onBack && <button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17} /> {backLabel}</button>}<p className="eyebrow">{isOwn ? 'MI ESPACIO' : 'EQUIPO'}</p><h1>{isOwn ? 'Mi perfil' : 'Perfil del colaborador'}</h1><p>{isOwn ? 'Tu información laboral y un resumen de actividad.' : 'Datos laborales y actividad registrada en el sistema.'}</p></div>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="success" role="status">{message}</p>}
    {busy && !employee ? <div className="evaluation-loading"><LoaderCircle className="spin" size={20} /> Cargando perfil…</div> : employee && <>
      <section className="profile-hero">
        <div className="profile-avatar" aria-label={`Foto de ${employee.full_name}`}>
          {photoUrl ? <img src={photoUrl} alt="" /> : <span>{initials}</span>}
        </div>
        <div className="profile-identity"><span className="profile-status">{employee.status}</span><h2>{employee.full_name}</h2><p>{employee.position || 'Puesto por asignar'}{employee.department ? ` · ${employee.department}` : ''}</p></div>
        {isOwn && <div className="profile-photo-action"><input ref={inputRef} type="file" accept="image/*,.heic,.heif" aria-label="Seleccionar foto de perfil" onChange={(event) => void preparePhoto(event.target.files?.[0])} hidden /><button className="secondary" type="button" disabled={preparing || uploading} onClick={() => inputRef.current?.click()}><Camera size={17} /> {preparing ? 'Preparando…' : photoUrl ? 'Cambiar foto' : 'Agregar foto'}</button><small>Elige una foto, recórtala y la comprimimos automáticamente.</small></div>}
      </section>
      <div className="profile-grid">
        <section className="profile-card"><div className="profile-card-title"><UserRound size={19} /><h2>Datos del sistema</h2></div><dl className="profile-details"><div><dt>Nombre</dt><dd>{employee.full_name}</dd></div><div><dt>Correo</dt><dd><Mail size={14} /> {employee.email || (isOwn ? session.user.email : null) || 'Sin registrar'}</dd></div><div><dt>Puesto</dt><dd>{employee.position || 'Por asignar'}</dd></div><div><dt>Área</dt><dd>{employee.department || 'Por asignar'}</dd></div><div><dt>Estado</dt><dd>{employee.status}</dd></div><div><dt>En la plataforma desde</dt><dd>{dateLabel.format(new Date(employee.created_at))}</dd></div></dl></section>
        <section className="profile-card"><div className="profile-card-title"><Clock3 size={19} /><h2>Horas y asistencia</h2></div><p className="profile-period">{monthLabel.format(today)}</p><div className="profile-stat"><strong>{totalHours.toLocaleString('es-MX', { maximumFractionDigits: 1 })} h</strong><span>registradas según horario de entrada y salida</span></div><div className="profile-mini-stats"><div><strong>{worked.length}</strong><span>días trabajados</span></div><div><strong>{sheets.filter((sheet) => sheet.attendance === 'vacation').length}</strong><span>vacaciones</span></div><div><strong>{sheets.filter((sheet) => sheet.attendance === 'absence').length}</strong><span>faltas</span></div></div></section>
      </div>
      <section className="profile-card profile-evaluations"><div className="profile-card-title"><ClipboardCheck size={19} /><h2>Evaluaciones</h2></div>{reports.length ? <div className="profile-report-list">{reports.map((report) => <div className="profile-report" key={report.id}><div><strong>Resultado final</strong><span>{dateLabel.format(new Date(report.created_at))}</span></div><strong className="profile-report-score">{score(report.final_score)}</strong><small>Autoevaluación {score(report.self_score)} · Equipo {score(report.collective_score)}</small></div>)}</div> : <p className="profile-empty">Aún no hay resultados finales de evaluaciones.</p>}<button className="secondary" type="button" onClick={onEvaluations}>{isOwn ? 'Ir a evaluaciones' : 'Ir al panel de evaluaciones'}</button></section>
    </>}
    {selectedPhoto && <PhotoCropper imageUrl={selectedPhoto} busy={uploading} error={error} onCancel={() => setSelectedPhoto(null)} onSave={(area) => void uploadPhoto(area)} />}
  </div>;
}
