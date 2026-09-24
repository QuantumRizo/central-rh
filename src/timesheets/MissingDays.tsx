import { useEffect, useState } from "react";
import { CalendarX2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { sb } from "../lib/supabase";

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthName = new Intl.DateTimeFormat("es-MX", { month: "long" });
const chipLabel = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric" });

/** Weekdays from the start of the year (or the employee's start date) through yesterday without a capture. */
export function MissingDays({
  employeeId,
  selectedDate,
  refreshKey,
  onPick,
}: {
  employeeId: string;
  selectedDate: string;
  refreshKey: number;
  onPick: (date: string) => void;
}) {
  const [missing, setMissing] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (!employeeId) return;
    let live = true;
    (async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const [employee, sheets] = await Promise.all([
        sb.from("employees").select("start_date,hire_date").eq("id", employeeId).maybeSingle(),
        sb
          .from("timesheets")
          .select("work_date")
          .eq("employee_id", employeeId)
          .gte("work_date", `${year}-01-01`)
          .lte("work_date", isoDate(yesterday)),
      ]);
      if (!live) return;
      if (employee.error || sheets.error) {
        setError((employee.error || sheets.error)!.message);
        return;
      }
      const joined = employee.data?.start_date || employee.data?.hire_date || "";
      const captured = new Set((sheets.data || []).map((row) => row.work_date));
      const days: string[] = [];
      for (let d = new Date(year, 0, 1, 12); d <= yesterday; d.setDate(d.getDate() + 1)) {
        const value = isoDate(d);
        if (d.getDay() !== 0 && d.getDay() !== 6 && value >= joined && !captured.has(value)) days.push(value);
      }
      setError("");
      setMissing(days);
    })();
    return () => {
      live = false;
    };
  }, [employeeId, refreshKey, year]);

  if (error) return <p className="error">No se pudieron revisar los días pendientes: {error}</p>;
  if (!missing) return null;

  if (!missing.length)
    return (
      <p className="missing-days-done" role="status">
        <CheckCircle2 size={16} /> Estás al día: capturaste todos los días hábiles de {year}.
      </p>
    );

  const months = new Map<string, string[]>();
  for (const value of missing) {
    const key = value.slice(0, 7);
    months.set(key, [...(months.get(key) || []), value]);
  }

  return (
    <section className="panel missing-days">
      <div className="missing-days-head">
        <span className="missing-days-icon"><CalendarX2 size={18} /></span>
        <div>
          <h2>{missing.length === 1 ? "Te falta 1 día" : `Te faltan ${missing.length} días`} por capturar</h2>
          <p>Días hábiles de {year} hasta ayer. Elige uno para capturarlo.</p>
        </div>
        <button type="button" className="secondary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {open ? "Ocultar" : "Ver días"}
        </button>
      </div>
      {open && (
        <div className="missing-days-months">
          {[...months].map(([key, days]) => (
            <div className="missing-days-month" key={key}>
              <span>
                {monthName.format(new Date(`${key}-01T12:00:00`))} <small>{days.length}</small>
              </span>
              <div>
                {days.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={value === selectedDate ? "selected" : ""}
                    onClick={() => onPick(value)}
                  >
                    {chipLabel.format(new Date(`${value}T12:00:00`))}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
