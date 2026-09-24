import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { attendanceLabel } from './timesheets/attendance';

export function downloadReport(headers: string[], rows: unknown[][], filename: string) {
  const cell = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const url = URL.createObjectURL(new Blob(['\ufeff' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PendingDays({ employees, sheets, from, to, today, db, canEdit = false, onRefresh }: any) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const dates: string[] = [];
  for (let d = new Date(from + 'T12:00:00'); d <= new Date((to < today ? to : today) + 'T12:00:00'); d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }
  const captured = new Set(sheets.map((s: any) => s.employee_id + ':' + s.work_date));
  const rows = employees.filter((e: any) => e.full_name.toLowerCase().includes(query.toLowerCase())).map((e: any) => ({ ...e, days: dates.filter(d => (!e.start_date || d >= e.start_date) && !captured.has(e.id + ':' + d)) }));
  return <section className="admin-card report-detail">
    <h2>Pendientes por fecha</h2>
    <p className="report-note">Lunes a viernes, hasta hoy. No descuenta festivos. Sin fecha de ingreso se considera todo el período seleccionado.</p>
    <div className="detail-filters"><input aria-label="Buscar pendientes" placeholder="Buscar persona…" value={query} onChange={e => setQuery(e.target.value)} /><button className="secondary" onClick={() => downloadReport(['Persona','Fecha pendiente','Fecha de ingreso'], rows.flatMap((r: any) => r.days.map((d: string) => [r.full_name,d,r.start_date || 'Sin definir'])), 'pendientes.csv')}>Exportar pendientes</button></div>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="pending-rows">{rows.map((r: any) => <details key={r.id}><summary>{r.full_name} <span>{r.days.length} pendientes</span></summary>
      {canEdit ? <label>Fecha de ingreso <input type="date" aria-label={`Fecha de ingreso de ${r.full_name}`} defaultValue={r.start_date || ''} disabled={saving === r.id} onBlur={async e => {
        const value = e.target.value || null;
        if (value === r.start_date) return;
        setSaving(r.id); setError('');
        const { error } = await db.rpc('set_employee_start_date', { employee: r.id, start_date: value });
        if (error) setError(error.message); else onRefresh();
        setSaving('');
      }} /></label> : <p>Fecha de ingreso: {r.start_date || 'Sin definir'}</p>}
      <p>{r.days.join(' · ') || 'Sin días pendientes en este período.'}</p>
    </details>)}</div>
  </section>;
}

export function ReportDetails({ sheets, selection, onClose, db }: { sheets: any[]; selection: { type: 'person' | 'client'; name: string }; onClose: () => void; db: SupabaseClient }) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => { section.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [selection.name]);
  const [client, setClient] = useState('');
  const [activity, setActivity] = useState('');
  const [person, setPerson] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyBusy, setHistoryBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const all = sheets.flatMap(s => (s.timesheet_entries || []).map((e: any) => ({date:s.work_date, person:s.employee?.full_name || 'Sin nombre', employeeId:s.employee_id, client:e.client?.name || 'Sin cliente', activity:e.activity?.name || 'Sin actividad', percentage:Number(e.percentage)})));
  const own = all.filter(r => selection.type === 'person' ? r.person === selection.name : r.client === selection.name);
  const rows = own.filter(r => (!client || r.client===client) && (!activity || r.activity===activity) && (!person || r.person===person));
  const options = (key: 'client'|'activity'|'person') => [...new Set(own.map(r => r[key]))].sort();
  const baseDays = new Set(sheets.filter(s => s.attendance==='worked' && (selection.type==='client' || s.employee?.full_name===selection.name)).map(s => s.employee_id+':'+s.work_date)).size;
  const total = rows.reduce((sum,r) => sum+r.percentage,0);
  useEffect(() => {
    if (!showHistory) return;
    let live = true;
    setHistoryBusy(true); setHistoryError('');
    (async () => {
      const ids = sheets.filter(s => selection.type === 'person' ? s.employee?.full_name === selection.name : s.timesheet_entries?.some((e: any) => e.client?.name===selection.name)).map(s=>s.employee_id);
      if (!ids.length) { if(live){setHistory([]);setHistoryBusy(false);} return; }
      const dates = sheets.map(s=>s.work_date).sort();
      const collected: any[] = [];
      for(let offset=0;;offset+=500) {
        const {data,error} = await db.from('timesheet_history').select('*').in('employee_id',[...new Set(ids)]).gte('work_date',dates[0]).lte('work_date',dates[dates.length-1]).order('changed_at',{ascending:false}).order('id').range(offset,offset+499);
        if(error) {if(live){setHistoryError(error.message);setHistoryBusy(false);}return;}
        collected.push(...(data||[])); if((data?.length||0)<500) break;
      }
      if(live){setHistory(collected);setHistoryBusy(false);}
    })();
    return () => {live=false;};
  },[showHistory,sheets,selection,db]);
  const summary = (snapshot: any) => snapshot ? `${attendanceLabel(snapshot.day.attendance)} · ${snapshot.day.entry_time || '—'} a ${snapshot.day.exit_time || '—'}${snapshot.day.permission_entry_time ? ` · Permiso ${snapshot.day.permission_entry_time} a ${snapshot.day.permission_exit_time}` : ''}` : 'Sin captura anterior';
  const entryLabel = (entry: any) => {
    const ref = sheets.flatMap(s=>s.timesheet_entries || []).find((e: any)=>e.client?.id===entry.client_id && e.activity?.id===entry.activity_id);
    return `${entry.client_name || ref?.client?.name || entry.client_id} · ${entry.activity_name || ref?.activity?.name || entry.activity_id}: ${entry.percentage}%`;
  };
  return <section ref={section} className="admin-card report-detail">
    <div className="card-heading"><div><h2>{selection.name}</h2><p>Detalle del período seleccionado arriba.</p></div><button className="secondary" onClick={onClose}>Cerrar detalle</button></div>
    <div className="detail-filters">{(['person','client','activity'] as const).filter(k => k !== (selection.type==='person' ? 'person' : 'client')).map(k => <label key={k}>{k==='person'?'Persona':k==='client'?'Cliente':'Actividad'}<select value={k==='person'?person:k==='client'?client:activity} onChange={e => (k==='person'?setPerson:k==='client'?setClient:setActivity)(e.target.value)}><option value="">Todos</option>{options(k).map(o=><option key={o}>{o}</option>)}</select></label>)}</div>
    <p className="report-note">{new Set(rows.map(r=>r.employeeId)).size} personas · {(total/100).toFixed(2)} días equivalentes · {baseDays ? (total/baseDays).toFixed(1) : '0'}% de {selection.type==='person'?'los días trabajados registrados de esta persona':'todos los días trabajados registrados del equipo'} en el período. Cada porcentaje de la tabla corresponde a un día; no representa horas exactas.</p>
    <button className="secondary" onClick={()=>downloadReport(['Fecha','Persona','Cliente','Actividad','Porcentaje del día'],rows.map(r=>[r.date,r.person,r.client,r.activity,r.percentage]),'detalle-actividades.csv')}>Exportar detalle filtrado</button>
    <div className="table-wrap"><table><thead><tr>{['Fecha','Persona','Cliente','Actividad','% del día'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{r.date}</td><td>{r.person}</td><td>{r.client}</td><td>{r.activity}</td><td>{r.percentage}%</td></tr>)}</tbody></table></div>
    {!rows.length && <p>Sin actividades para estos filtros.</p>}
    {selection.type==='person' && <><button className="secondary" onClick={()=>setShowHistory(!showHistory)}>{showHistory?'Ocultar historial':'Ver historial de cambios'}</button>
    {showHistory && <div><p className="report-note">Historial de esta persona en el período. Disponible desde la activación; incluye cambios de horario y actividades.</p>{historyBusy?<div className="skeleton skeleton-row" aria-label="Cargando historial"/>:historyError?<p className="error" role="alert">{historyError}</p>:history.length?history.map(h=><details className="history-row" key={h.id}><summary>{new Date(h.changed_at).toLocaleString('es-MX')} · {h.actor_name} · Día {h.work_date}</summary><p>Antes: {summary(h.before_data)}</p><ul>{h.before_data?.entries?.map((e:any,i:number)=><li key={i}>{entryLabel(e)}</li>)}</ul><p>Después: {summary(h.after_data)}</p><ul>{h.after_data.entries.map((e:any,i:number)=><li key={i}>{entryLabel(e)}</li>)}</ul></details>):<p>Sin cambios registrados.</p>}</div>}</>}
  </section>;
}
