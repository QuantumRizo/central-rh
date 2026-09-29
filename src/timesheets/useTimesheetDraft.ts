import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { day, workedHours } from "./utils";
import { mergeDuplicateEntries, sheetSnapshot, type Entry } from "./model";

export function useTimesheetDraft(employee: string) {
  const [baseline, setBaseline] = useState<string | null>(null);
  const [savedSheetDate, setSavedSheetDate] = useState<string | null>(null);
  const [date, setDate] = useState(day()),
    [attendance, setAttendance] = useState("worked"),
    [mode, setMode] = useState("office"),
    [entry, setEntry] = useState("09:00"),
    [exit, setExit] = useState("18:00"),
    [permissionEntry, setPermissionEntry] = useState("09:00"),
    [permissionExit, setPermissionExit] = useState("18:00"),
    [rows, setRows] = useState<Entry[]>([]),
    [busy, setBusy] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [aiCompletionMessage, setAiCompletionMessage] = useState(""),
    [importRevision, setImportRevision] = useState(0),
    [sheetRevision, setSheetRevision] = useState(0);
  const draft = sheetSnapshot({attendance,mode,entry,exit,permissionEntry,permissionExit,rows});
  const dirty = baseline !== null && draft !== baseline;
  const canLeave = () => !dirty || window.confirm('Tienes cambios sin guardar. ¿Quieres continuar sin guardarlos?');
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!employee) return;
    let live = true;
    setBusy(true);
    setBaseline(null);
    setSavedSheetDate(null);
    setError("");
    setMessage("");
    (async () => {
      try {
        const { data, error } = await sb
          .from("timesheets")
          .select("*,timesheet_entries(client_id,activity_id,percentage)")
          .eq("employee_id", employee)
          .eq("work_date", date)
          .maybeSingle();
        if (error) throw error;
        if (!live) return;
        setSavedSheetDate(data ? date : null);
        setAttendance(data?.attendance || "worked");
        setMode(data?.mode || "office");
        setEntry(data?.entry_time?.slice(0, 5) || "09:00");
        setExit(data?.exit_time?.slice(0, 5) || "18:00");
        setPermissionEntry(data?.permission_entry_time?.slice(0, 5) || "09:00");
        setPermissionExit(data?.permission_exit_time?.slice(0, 5) || "18:00");
        const loadedHours = workedHours(
          data?.entry_time?.slice(0, 5) || "09:00",
          data?.exit_time?.slice(0, 5) || "18:00",
        );
        const loadedRows = (data?.timesheet_entries || []).map((row: Entry) => ({
          ...row,
          hours: Number(((Number(row.percentage) || 0) * loadedHours / 100).toFixed(2)),
        }));
        setRows(loadedRows);
        setBaseline(sheetSnapshot({
          attendance: data?.attendance || 'worked',
          mode: data?.mode || 'office',
          entry: data?.entry_time?.slice(0,5) || '09:00',
          exit: data?.exit_time?.slice(0,5) || '18:00',
          permissionEntry: data?.permission_entry_time?.slice(0,5) || '09:00',
          permissionExit: data?.permission_exit_time?.slice(0,5) || '18:00',
          rows: loadedRows,
        }));
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [employee, date, importRevision]);
  const workdayHours = workedHours(entry, exit);
  const totalHours = rows.reduce((sum, row) => sum + (Number(row.hours) || 0), 0);
  const total = workdayHours ? (totalHours / workdayHours) * 100 : 0;
  const hoursAreComplete = Math.abs(totalHours - workdayHours) < 0.01;
  const scheduleReady =
    mode !== "schedule_permission" ||
    (permissionEntry && permissionExit && permissionExit > permissionEntry);
  const isWeekend = (() => {
    const d = new Date(date + 'T12:00:00');
    const dow = d.getDay();
    return dow === 0 || dow === 6;
  })();
  const weekendDayName = (() => {
    const d = new Date(date + 'T12:00:00');
    return d.getDay() === 6 ? 'sábado' : 'domingo';
  })();
  const [deleting, setDeleting] = useState(false);
  const deleteSheet = async () => {
    if (deleting || saving || savedSheetDate !== date) return;
    if (!window.confirm(`¿Eliminar el registro de este ${weekendDayName}? Esta acción no se puede deshacer.${dirty ? ' También se perderán los cambios sin guardar.' : ''}`)) return;
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      const { error } = await sb.rpc('delete_timesheet', {
        p_employee_id: employee,
        p_work_date: date,
      });
      if (error) throw error;
      setAttendance('worked');
      setMode('office');
      setEntry('09:00');
      setExit('18:00');
      setPermissionEntry('09:00');
      setPermissionExit('18:00');
      setRows([]);
      setSavedSheetDate(null);
      setBaseline(sheetSnapshot({ attendance: 'worked', mode: 'office', entry: '09:00', exit: '18:00', permissionEntry: '09:00', permissionExit: '18:00', rows: [] }));
      setMessage('Registro eliminado correctamente.');
      setSheetRevision((value) => value + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };
  const save = async () => {
    if (baseline === null || busy || saving || deleting) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const mergedRows = attendance === "worked" ? mergeDuplicateEntries(rows) : [];
      const saveRows = mergedRows.map((row) => ({
        client_id: row.client_id,
        activity_id: row.activity_id,
        percentage: Number(((Number(row.hours) || 0) / workdayHours * 100).toFixed(2)),
      }));
      if (saveRows.length) {
        const previousTotal = saveRows
          .slice(0, -1)
          .reduce((sum, row) => sum + row.percentage, 0);
        saveRows[saveRows.length - 1].percentage = Number((100 - previousTotal).toFixed(2));
      }
      const { error } = await sb.rpc("save_timesheet", {
        payload: {
          employee_id: employee,
          work_date: date,
          attendance,
          mode,
          entry_time: entry,
          exit_time: exit,
          permission_entry_time:
            mode === "schedule_permission" ? permissionEntry : "",
          permission_exit_time:
            mode === "schedule_permission" ? permissionExit : "",
          entries: attendance === "worked" ? saveRows : [],
        },
      });
      if (error) throw error;
      setSavedSheetDate(date);
      setSheetRevision((value) => value + 1);
      const savedRows = mergedRows.map((row, index) => ({
        ...row,
        percentage: saveRows[index].percentage,
      }));
      setRows(savedRows);
      setBaseline(sheetSnapshot({attendance,mode,entry,exit,permissionEntry,permissionExit,rows:attendance === 'worked' ? savedRows : []}));
      setMessage(mergedRows.length < rows.length
        ? "Día guardado. Se sumaron las horas de las actividades repetidas."
        : "Día guardado correctamente");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const update = (i: number, patch: Partial<Entry>) =>
    setRows((prev) => prev.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  return { baseline, savedSheetDate, date, setDate, attendance, setAttendance, mode, setMode, entry, setEntry, exit, setExit, permissionEntry, setPermissionEntry, permissionExit, setPermissionExit, rows, setRows, busy, setBusy, saving, error, setError, message, aiCompletionMessage, setAiCompletionMessage, importRevision, setImportRevision, sheetRevision, deleting, dirty, canLeave, workdayHours, totalHours, total, hoursAreComplete, scheduleReady, isWeekend, weekendDayName, deleteSheet, save, update };
}
