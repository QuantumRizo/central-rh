import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Download, UserCheck, Umbrella } from 'lucide-react';
import { sb } from '../lib/supabase';
import { Metric } from './admin/SummaryComponents';
import { attendanceLabel } from './attendance';
import { day, workedHours } from './utils';
import { summarizeActivities, type ActivityBreakdown, type ReportSheet } from './reportData';

const yearStart = () => `${day().slice(0, 4)}-01-01`;

function Breakdown({ title, rows }: { title: string; rows: ActivityBreakdown[] }) {
  return <section className="admin-card my-report-breakdown">
    <div className="card-heading"><div><h2>{title}</h2><p>Días equivalentes según el porcentaje capturado.</p></div></div>
    {rows.length ? <div className="table-wrap"><table><thead><tr><th>{title === 'Por cliente' ? 'Cliente' : 'Tarea'}</th><th>Días</th><th>Días equivalentes</th><th>% de actividad</th></tr></thead><tbody>{rows.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.days}</td><td>{row.equivalent.toFixed(2)}</td><td>{(row.share * 100).toFixed(1)}%</td></tr>)}</tbody></table></div> : <p className="report-note">Sin actividades en este período.</p>}
  </section>;
}

export function MyTimesheetReport({ employeeId, onCapture }: { employeeId: string; onCapture: () => void }) {
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(day);
  const [name, setName] = useState('');
  const [sheets, setSheets] = useState<ReportSheet[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    let live = true;
    const load = async () => {
      setBusy(true);
      setError('');
      if (from > to) {
        setSheets([]);
        setError('La fecha inicial debe ser anterior a la fecha final.');
        setBusy(false);
        return;
      }
      try {
        const personRequest = sb.from('employees').select('full_name').eq('id', employeeId).single();
        const collected: ReportSheet[] = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error: queryError } = await sb.from('timesheets')
            .select('id,employee_id,work_date,attendance,mode,entry_time,exit_time,permission_entry_time,permission_exit_time,position_snapshot,timesheet_entries(id,percentage,client:clients(id,name),activity:activities(id,name))')
            .eq('employee_id', employeeId).gte('work_date', from).lte('work_date', to)
            .order('work_date', { ascending: false }).range(offset, offset + 499);
          if (queryError) throw queryError;
          collected.push(...(data || []) as unknown as ReportSheet[]);
          if ((data?.length || 0) < 500) break;
        }
        const person = await personRequest;
        if (person.error) throw person.error;
        if (live) {
          setName(person.data.full_name);
          setSheets(collected);
        }
      } catch (failure) {
        if (live) {
          setSheets([]);
          setError((failure as Error).message);
        }
      } finally {
        if (live) setBusy(false);
      }
    };
    void load();
    return () => { live = false; };
  }, [employeeId, from, to]);

  const breakdown = useMemo(() => summarizeActivities(sheets), [sheets]);
  const worked = sheets.filter(sheet => sheet.attendance === 'worked');
  const hours = worked.reduce((sum, sheet) => sum + workedHours(sheet.entry_time || undefined, sheet.exit_time || undefined), 0);
  const exportExcel = () => {
    setExportBusy(true);
    setExportError('');
    void import('./admin/timesheetExcel').then(({ downloadTimesheetWorkbook }) => downloadTimesheetWorkbook(sheets, employeeId, name, from, to, true))
      .catch((failure: Error) => setExportError(failure.message)).finally(() => setExportBusy(false));
  };

  return <div className="my-timesheet-report">
    <div className="page-header"><div><p className="eyebrow">MI HOJA DE TIEMPO</p><h1>Mi reporte</h1><p>Consulta tus capturas y cómo distribuiste tus días.</p></div><button className="secondary" onClick={exportExcel} disabled={busy || !!error || !sheets.length || exportBusy}><Download size={17} /> {exportBusy ? 'Preparando Excel…' : 'Descargar Excel'}</button></div>
    <nav className="admin-tabs" aria-label="Vistas de Timesheets"><button onClick={onCapture}>Captura diaria</button><button className="active" aria-current="page">Mi reporte</button></nav>
    <section className="admin-card my-report-filters"><div className="date-filter"><label>Desde<input type="date" value={from} max={day()} onChange={event => event.target.value && setFrom(event.target.value)} /></label><span>—</span><label>Hasta<input type="date" value={to} max={day()} onChange={event => event.target.value && setTo(event.target.value)} /></label></div><button className="secondary" onClick={() => { setFrom(yearStart()); setTo(day()); }}>Año a la fecha</button></section>
    {error && <p role="alert" className="error">{error}</p>}
    {exportError && <p role="alert" className="error">No se pudo generar el Excel: {exportError}</p>}
    {busy ? <section className="admin-card" role="status">Cargando tu reporte…</section> : !error && <>
      <div className="metrics"><Metric icon={<CalendarDays />} label="Capturas" value={sheets.length} /><Metric icon={<UserCheck />} label="Días trabajados" value={worked.length} /><Metric icon={<Umbrella />} label="Ausencias y feriados" value={sheets.length - worked.length} /><Metric icon={<Clock3 />} label="Horas registradas" value={hours.toFixed(1)} /></div>
      {!sheets.length ? <section className="admin-card"><h2>Sin capturas en este período</h2><p>Prueba con otras fechas o vuelve a Captura diaria.</p></section> : <>
        <p className="report-note"><Clock3 size={16} /> {breakdown.totalEquivalent.toFixed(2)} días equivalentes distribuidos. Los porcentajes son partes del día; no indican horas exactas por cliente o tarea.</p>
        <div className="my-report-grid"><Breakdown title="Por cliente" rows={breakdown.clients} /><Breakdown title="Por tarea" rows={breakdown.tasks} /></div>
        <section className="admin-card my-report-captures"><div className="card-heading"><div><h2>Capturas diarias</h2><p>Incluye días trabajados, ausencias y feriados.</p></div></div><div className="table-wrap"><table><thead><tr>{['Fecha','Asistencia','Modalidad','Entrada','Salida','Horas','Actividades'].map(heading => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{sheets.map(sheet => <tr key={sheet.id}><td>{sheet.work_date}</td><td>{attendanceLabel(sheet.attendance)}</td><td>{({ office: 'Presencial', home_office: 'Home Office', schedule_permission: 'Permiso de horario' } as Record<string, string>)[sheet.mode || ''] || '—'}</td><td>{sheet.entry_time || '—'}</td><td>{sheet.exit_time || '—'}</td><td>{sheet.attendance === 'worked' ? workedHours(sheet.entry_time || undefined, sheet.exit_time || undefined).toFixed(1) : '—'}</td><td>{sheet.timesheet_entries?.length || 0}</td></tr>)}</tbody></table></div></section>
      </>}
    </>}
  </div>;
}
