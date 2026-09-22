import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Plus, Sparkles, Trash2, X } from "lucide-react";
import { sb } from "./lib/supabase";

type DateRange = { start: string; end: string };
type SpecialDay = { date: string; entry: string; exit: string };
type FormInput = {
  periodStart: string; periodEnd: string; entry: string; exit: string; mealHours: number;
  modality: "office" | "home_office" | "hybrid"; homeOfficeDays: number[];
  vacations: DateRange[]; absences: DateRange[]; workedHolidays: SpecialDay[];
  workedWeekends: SpecialDay[]; distributionText: string;
};
type Preview = {
  summary: { total: number; worked: number; vacations: number; absences: number; holidays: number; new: number; existing: number; overwrite: boolean };
  plan: unknown;
  monthSummary: Array<{ month: string; workedDays: number; productiveHours: number; allocations: Array<{ client: string; activity: string; hours: number; percentage: number }> }>;
  days: Array<{ date: string; attendance: string; mode: string | null; entry: string | null; exit: string | null; entries: Array<{ client: string; activity: string; percentage: number }> }>;
};

const initialInput: FormInput = {
  periodStart: "2026-01-01", periodEnd: "2026-08-31", entry: "09:00", exit: "18:00", mealHours: 1,
  modality: "office", homeOfficeDays: [], vacations: [], absences: [], workedHolidays: [], workedWeekends: [], distributionText: "",
};
const MAX_GENERATION_DATE = "2026-08-31";
const weekdays = [{ value: 1, label: "L" }, { value: 2, label: "M" }, { value: 3, label: "M" }, { value: 4, label: "J" }, { value: 5, label: "V" }];
const attendanceLabel: Record<string, string> = { worked: "Trabajado", vacation: "Vacaciones", absence: "Ausencia", holiday: "Festivo" };

function RangeList({ title, hint, rows, onChange }: { title: string; hint: string; rows: DateRange[]; onChange: (rows: DateRange[]) => void }) {
  return <div className="ai-field-card"><strong>{title}</strong><small>{hint}</small>{rows.map((row, index) => <div className="ai-range-row" key={index}>
    <input aria-label={`${title}, inicio`} type="date" max={MAX_GENERATION_DATE} value={row.start} onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, start: event.target.value } : item))} />
    <span>a</span><input aria-label={`${title}, fin`} type="date" max={MAX_GENERATION_DATE} value={row.end} onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, end: event.target.value } : item))} />
    <button type="button" className="icon" aria-label={`Eliminar ${title}`} onClick={() => onChange(rows.filter((_, i) => i !== index))}><Trash2 size={15} /></button>
  </div>)}<button type="button" className="ai-add" onClick={() => onChange([...rows, { start: "", end: "" }])}><Plus size={14} /> Agregar periodo</button></div>;
}

function SpecialDays({ title, hint, rows, schedule, onChange }: { title: string; hint: string; rows: SpecialDay[]; schedule: { entry: string; exit: string }; onChange: (rows: SpecialDay[]) => void }) {
  return <div className="ai-field-card"><strong>{title}</strong><small>{hint}</small>{rows.map((row, index) => <div className="ai-special-row" key={index}>
    <input aria-label={`${title}, fecha`} type="date" max={MAX_GENERATION_DATE} value={row.date} onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, date: event.target.value } : item))} />
    <input aria-label={`${title}, entrada`} type="time" value={row.entry} onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, entry: event.target.value } : item))} />
    <input aria-label={`${title}, salida`} type="time" value={row.exit} onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, exit: event.target.value } : item))} />
    <button type="button" className="icon" aria-label={`Eliminar ${title}`} onClick={() => onChange(rows.filter((_, i) => i !== index))}><Trash2 size={15} /></button>
  </div>)}<button type="button" className="ai-add" onClick={() => onChange([...rows, { date: "", entry: schedule.entry, exit: schedule.exit }])}><Plus size={14} /> Agregar día</button></div>;
}

export function AiTimesheetGenerator({ isAdmin, onImported }: { isAdmin: boolean; onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<FormInput>(initialInput);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setOpen(false); };
    document.addEventListener("keydown", close); document.body.classList.add("modal-open");
    return () => { document.removeEventListener("keydown", close); document.body.classList.remove("modal-open"); };
  }, [open, busy]);
  const change = <K extends keyof FormInput>(key: K, value: FormInput[K]) => { setInput((current) => ({ ...current, [key]: value })); setPreview(null); setError(""); setMessage(""); };
  const request = async (action: "preview" | "commit") => {
    const { data } = await sb.auth.getSession();
    if (!data.session?.access_token) throw Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    const response = await fetch("/api/generate-timesheets", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ action, input, plan: action === "commit" ? preview?.plan : undefined, overwrite }),
    });
    const body = await response.json();
    if (!response.ok) throw Error(body.error || "No se pudieron generar las horas");
    return body;
  };
  const generate = async () => {
    setBusy(true); setError(""); setMessage("");
    try { setPreview(await request("preview")); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const commit = async () => {
    if (!preview) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await request("commit");
      setMessage(`Carga completada: ${result.result?.created || 0} nuevos, ${result.result?.updated || 0} actualizados y ${result.result?.skipped || 0} existentes conservados.`);
      onImported();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  return <>
    <section className="panel ai-generator-card">
      <div className="ai-generator-icon"><Sparkles size={24} /></div><div><h2>Subir horas con IA</h2><p>Responde unas preguntas, revisa la propuesta y carga todo el periodo sin preparar un CSV.</p></div>
      <button type="button" onClick={() => setOpen(true)}><Sparkles size={17} /> Generar horas</button>
    </section>
    {open && <div className="ai-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section className="ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-modal-title">
        <header><div><h2 id="ai-modal-title">Generar mis horas</h2><p>La IA interpreta la distribución; Central RH calcula y valida cada día.</p></div><button type="button" className="icon" aria-label="Cerrar" disabled={busy} onClick={() => setOpen(false)}><X size={20} /></button></header>
        <div className="ai-modal-body">
          <section className="ai-step"><div className="ai-step-title"><span>1</span><div><h3>Periodo y jornada</h3><p>Define qué fechas y horario deben generarse.</p></div></div><div className="ai-form-grid four">
            <label>Desde<input type="date" max={MAX_GENERATION_DATE} value={input.periodStart} onChange={(event) => change("periodStart", event.target.value)} /></label>
            <label>Hasta<input type="date" max={MAX_GENERATION_DATE} value={input.periodEnd} onChange={(event) => change("periodEnd", event.target.value)} /></label>
            <label>Entrada<input type="time" value={input.entry} onChange={(event) => change("entry", event.target.value)} /></label>
            <label>Salida<input type="time" value={input.exit} onChange={(event) => change("exit", event.target.value)} /></label>
            <label>Horas de comida<input type="number" min="0" max="4" step="0.25" value={input.mealHours} onChange={(event) => change("mealHours", Number(event.target.value))} /></label>
            <label>Modalidad<select value={input.modality} onChange={(event) => change("modality", event.target.value as FormInput["modality"])}><option value="office">Presencial</option><option value="home_office">Home office</option><option value="hybrid">Híbrido</option></select></label>
            {input.modality === "hybrid" && <div className="ai-weekdays"><span>Días de home office</span><div>{weekdays.map((day) => <button type="button" key={day.value} className={input.homeOfficeDays.includes(day.value) ? "active" : ""} onClick={() => change("homeOfficeDays", input.homeOfficeDays.includes(day.value) ? input.homeOfficeDays.filter((value) => value !== day.value) : [...input.homeOfficeDays, day.value])}>{day.label}</button>)}</div></div>}
          </div><p className="ai-period-notice">La generación automática llega hasta el <strong>31 de agosto de 2026</strong>. Septiembre deberá capturarse manualmente para que el periodo reciente quede completo e integral.</p></section>
          <section className="ai-step"><div className="ai-step-title"><span>2</span><div><h3>Días especiales</h3><p>Déjalos vacíos cuando no existan. Así ningún día queda sin rastro.</p></div></div><div className="ai-special-grid">
            <RangeList title="Vacaciones" hint="Días completos que no trabajaste." rows={input.vacations} onChange={(value) => change("vacations", value)} />
            <RangeList title="Incapacidades o permisos" hint="Se registrarán como ausencias en reportes." rows={input.absences} onChange={(value) => change("absences", value)} />
            <SpecialDays title="Festivos que sí trabajaste" hint="Indica también el horario real." rows={input.workedHolidays} schedule={input} onChange={(value) => change("workedHolidays", value)} />
            <SpecialDays title="Fines de semana trabajados" hint="Sólo se generarán los que agregues." rows={input.workedWeekends} schedule={input} onChange={(value) => change("workedWeekends", value)} />
          </div></section>
          <section className="ai-step"><div className="ai-step-title"><span>3</span><div><h3>Distribución por cliente</h3><p>Puedes escribir porcentajes por mes, rangos de meses u horas fijas.</p></div></div>
            <label className="ai-distribution">Describe tu distribución<textarea rows={8} value={input.distributionText} onChange={(event) => change("distributionText", event.target.value)} placeholder={"Enero a marzo: Sika 60% Diseño, Sansui 40% Diseño.\nAbril a agosto: Sika 40% Diseño, Dongfeng 35% Diseño y Senosiain 25% Monitoreo y seguimiento de campañas.\nLa comida es de 1 hora diaria y ya se agrega automáticamente."} /></label>
            <p className="ai-privacy">La IA recibe únicamente esta distribución y los nombres válidos del catálogo. Los cálculos diarios y la escritura en Supabase se realizan en Central RH.</p>
          </section>
          {preview && <section className="ai-preview"><div className="ai-preview-heading"><div><CheckCircle2 size={20} /><div><h3>Vista previa lista</h3><p>Revisa el resumen antes de confirmar.</p></div></div><span>{preview.summary.total} días</span></div>
            <div className="ai-preview-metrics"><div><strong>{preview.summary.worked}</strong><span>Trabajados</span></div><div><strong>{preview.summary.vacations}</strong><span>Vacaciones</span></div><div><strong>{preview.summary.absences}</strong><span>Ausencias</span></div><div><strong>{preview.summary.holidays}</strong><span>Festivos</span></div></div>
            <div className="ai-months">{preview.monthSummary.map((month) => <article key={month.month}><header><strong>{month.month}</strong><span>{month.workedDays} días · {month.productiveHours.toFixed(2)} h productivas</span></header>{month.allocations.map((row, index) => <div key={`${row.client}-${row.activity}-${index}`}><span>{row.client} · {row.activity}</span><strong>{row.hours.toFixed(2)} h · {row.percentage.toFixed(1)}%</strong></div>)}</article>)}</div>
            <div className="ai-days-table"><table><thead><tr><th>Fecha</th><th>Estado</th><th>Horario</th><th>Actividades</th></tr></thead><tbody>{preview.days.slice(0, 20).map((day) => <tr key={day.date}><td>{day.date}</td><td>{attendanceLabel[day.attendance] || day.attendance}</td><td>{day.entry ? `${day.entry}–${day.exit}` : "—"}</td><td>{day.entries.length ? day.entries.map((entry) => `${entry.client} · ${entry.activity} ${entry.percentage}%`).join("; ") : "—"}</td></tr>)}</tbody></table>{preview.days.length > 20 && <p>Mostrando 20 de {preview.days.length} días. El resumen mensual incluye el periodo completo.</p>}</div>
            <p className={preview.summary.existing ? "notice" : "success"}>{preview.summary.new} días nuevos · {preview.summary.existing} ya existentes y {preview.summary.overwrite ? "se sobrescribirán" : "se conservarán"}.</p>
          </section>}
          {isAdmin && <label className="ai-overwrite"><input type="checkbox" checked={overwrite} onChange={(event) => { setOverwrite(event.target.checked); setPreview(null); }} /> Sobrescribir días que ya tengan captura</label>}
          {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
        </div>
        <footer><button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)}>Cerrar</button>{preview ? <button type="button" disabled={busy || Boolean(message)} onClick={commit}>{busy ? <><LoaderCircle className="import-spinner" size={16} /> Guardando…</> : "Confirmar y subir horas"}</button> : <button type="button" disabled={busy || !input.distributionText.trim()} onClick={generate}>{busy ? <><LoaderCircle className="import-spinner" size={16} /> Interpretando…</> : <><Sparkles size={16} /> Generar vista previa</>}</button>}</footer>
      </section>
    </div>}
  </>;
}
