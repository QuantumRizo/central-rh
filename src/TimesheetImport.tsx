import { useState } from "react";
import { FileUp, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { sb } from "./lib/supabase";

type ImportResult = {
  summary?: { total: number; new: number; existing: number; overwrite: boolean };
  result?: { created: number; updated: number; skipped: number; total: number };
  period?: { start: string; end: string };
  holidays?: string[];
  vacations?: string[];
  absences?: string[];
  workedHolidays?: string[];
  workedWeekends?: string[];
};

type DateRange = { start: string; end: string };

const expandRanges = (ranges: DateRange[]) => {
  const dates = new Set<string>();
  for (const range of ranges) {
    if (!range.start && !range.end) continue;
    if (!range.start) throw Error("Selecciona la fecha inicial del periodo");
    const end = range.end || range.start;
    if (end < range.start) throw Error(`El periodo ${range.start} a ${end} es inválido`);
    const cursor = new Date(`${range.start}T12:00:00Z`);
    const last = new Date(`${end}T12:00:00Z`);
    while (cursor <= last) {
      dates.add(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return [...dates].sort();
};

function RangeEditor({ title, hint, value, onChange }: { title: string; hint: string; value: DateRange[]; onChange: (value: DateRange[]) => void }) {
  return (
    <div className="import-exception-card">
      <strong>{title}</strong><small>{hint}</small>
      {value.map((range, index) => (
        <div className="import-date-row" key={index}>
          <input aria-label={`${title}, fecha inicial`} type="date" value={range.start} onChange={(event) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item))} />
          <span>a</span>
          <input aria-label={`${title}, fecha final`} type="date" value={range.end} onChange={(event) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item))} />
          <button className="icon" type="button" aria-label={`Eliminar periodo de ${title}`} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button>
        </div>
      ))}
      <button className="import-add" type="button" onClick={() => onChange([...value, { start: "", end: "" }])}><Plus size={14} /> Agregar periodo</button>
    </div>
  );
}

function DateEditor({ title, hint, value, onChange }: { title: string; hint: string; value: string[]; onChange: (value: string[]) => void }) {
  return (
    <div className="import-exception-card">
      <strong>{title}</strong><small>{hint}</small>
      {value.map((date, index) => (
        <div className="import-date-row single" key={index}>
          <input aria-label={`${title}, fecha`} type="date" value={date} onChange={(event) => onChange(value.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />
          <button className="icon" type="button" aria-label={`Eliminar fecha de ${title}`} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button>
        </div>
      ))}
      <button className="import-add" type="button" onClick={() => onChange([...value, ""])}><Plus size={14} /> Agregar fecha</button>
    </div>
  );
}

export function TimesheetImport({ isAdmin, onImported }: { isAdmin: boolean; onImported: () => void }) {
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [vacations, setVacations] = useState<DateRange[]>([]);
  const [absences, setAbsences] = useState<DateRange[]>([]);
  const [workedHolidays, setWorkedHolidays] = useState<string[]>([]);
  const [workedWeekends, setWorkedWeekends] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const callApi = async (dryRun: boolean) => {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    const response = await fetch("/api/import-timesheets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        csv,
        dryRun,
        overwrite,
        vacationDates: expandRanges(vacations),
        absenceDates: expandRanges(absences),
        workedHolidayDates: workedHolidays.filter(Boolean),
        workedWeekendDates: workedWeekends.filter(Boolean),
      }),
    });
    const body = await response.json();
    if (!response.ok) throw Error(body.error || "No se pudo procesar el CSV");
    return body as ImportResult;
  };

  const selectFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setMessage("");
    setPreview(null);
    try {
      setFileName(file.name);
      setCsv(await file.text());
    } catch {
      setError("No se pudo leer el archivo.");
    }
  };

  const validate = async () => {
    if (!csv) return;
    setBusy(true); setError(""); setMessage("");
    try { setPreview(await callApi(true)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const importFile = async () => {
    if (!preview) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await callApi(false);
      setMessage(`Carga completada: ${result.result?.created || 0} nuevos, ${result.result?.updated || 0} actualizados y ${result.result?.skipped || 0} existentes omitidos.`);
      setPreview(null);
      onImported();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <section className="panel timesheet-import">
      <div className="section-head import-heading">
        <div>
          <h2>Cargar horas desde CSV</h2>
          <p className="section-help">El sistema exige que cada día hábil quede como trabajado, vacaciones, ausencia o festivo.</p>
        </div>
        <FileUp size={22} aria-hidden="true" />
      </div>
      <div className="import-controls">
        <label className="file-picker">
          Archivo CSV
          <input type="file" accept=".csv,text/csv" onChange={(event) => selectFile(event.target.files?.[0])} disabled={busy} />
          {fileName && <span>{fileName}</span>}
        </label>
        {isAdmin && (
          <label className="import-check">
            <input type="checkbox" checked={overwrite} onChange={(event) => { setOverwrite(event.target.checked); setPreview(null); }} disabled={busy} />
            Sobrescribir días existentes
          </label>
        )}
        <button type="button" onClick={validate} disabled={!csv || busy}>
          {busy ? <LoaderCircle className="import-spinner" size={16} /> : "Validar archivo"}
        </button>
      </div>
      <div className="import-exceptions">
        <div className="import-exceptions-heading">
          <strong>Excepciones del periodo</strong>
          <span>Déjalo vacío cuando la respuesta sea “ninguno”. Los días trabajados deben venir con sus actividades y horas en el CSV.</span>
        </div>
        <div className="import-exceptions-grid">
          <RangeEditor title="Vacaciones" hint="Periodos completos que no trabajaste." value={vacations} onChange={(value) => { setVacations(value); setPreview(null); }} />
          <RangeEditor title="Incapacidades o permisos" hint="Ausencias que deben aparecer en reportes." value={absences} onChange={(value) => { setAbsences(value); setPreview(null); }} />
          <DateEditor title="Festivos que sí trabajaste" hint="Cada fecha debe existir con horas en el CSV." value={workedHolidays} onChange={(value) => { setWorkedHolidays(value); setPreview(null); }} />
          <DateEditor title="Fines de semana que sí trabajaste" hint="Cada fecha debe existir con horas en el CSV." value={workedWeekends} onChange={(value) => { setWorkedWeekends(value); setPreview(null); }} />
        </div>
      </div>
      {preview?.summary && (
        <div className="import-preview">
          <strong>{preview.summary.total} días listos para revisar</strong>
          {preview.period && <span>Periodo comprobado: {preview.period.start} a {preview.period.end}</span>}
          <span>{preview.summary.new} nuevos · {preview.summary.existing} ya existentes{preview.summary.overwrite ? " y se actualizarán" : " y se conservarán"}</span>
          {!!preview.holidays?.length && <small>Festivos a registrar: {preview.holidays.join(", ")}</small>}
          {!!preview.vacations?.length && <small>Vacaciones: {preview.vacations.join(", ")}</small>}
          {!!preview.absences?.length && <small>Ausencias: {preview.absences.join(", ")}</small>}
          {!!preview.workedHolidays?.length && <small>Festivos trabajados: {preview.workedHolidays.join(", ")}</small>}
          {!!preview.workedWeekends?.length && <small>Fines de semana trabajados: {preview.workedWeekends.join(", ")}</small>}
          <button type="button" onClick={importFile} disabled={busy}>Confirmar carga</button>
        </div>
      )}
      {error && <p className="error import-status">{error}</p>}
      {message && <p className="success import-status">{message}</p>}
    </section>
  );
}
