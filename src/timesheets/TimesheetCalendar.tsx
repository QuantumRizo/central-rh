import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import { sb } from "../lib/supabase";
import { attendanceLabel } from "./attendance";

type Sheet = { work_date: string; attendance: string; entry_time: string | null; exit_time: string | null };
type Kind = "worked" | "missing" | "absence" | "vacation" | "personal_day" | "sick_leave" | "holiday" | "off" | "future" | "before";
type Day = { date: string; kind: Kind; label: string };

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthShort = new Intl.DateTimeFormat("es-MX", { month: "short" });
const longDate = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });
const DAY_LABELS = ["Lun", "", "Mié", "", "Vie", "", ""];

const minutes = (time: string | null) => {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const workedHours = (sheet: Sheet) => {
  const start = minutes(sheet.entry_time);
  const end = minutes(sheet.exit_time);
  return start === null || end === null || end <= start ? null : (end - start) / 60;
};

const formatHours = (hours: number) => `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;

/** Year heatmap of captured, pending and absence days. Clicking a day opens it for capture. */
export function TimesheetCalendar({
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
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [joined, setJoined] = useState("");
  const [error, setError] = useState("");
  const [hover, setHover] = useState<{ day: Day; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const joinedYear = joined ? Number(joined.slice(0, 4)) : currentYear;

  useEffect(() => {
    if (!employeeId) return;
    let live = true;
    (async () => {
      const [employee, rows] = await Promise.all([
        sb.from("employees").select("start_date,hire_date").eq("id", employeeId).maybeSingle(),
        sb
          .from("timesheets")
          .select("work_date,attendance,entry_time,exit_time")
          .eq("employee_id", employeeId)
          .gte("work_date", `${year}-01-01`)
          .lte("work_date", `${year}-12-31`),
      ]);
      if (!live) return;
      if (employee.error || rows.error) {
        setError((employee.error || rows.error)!.message);
        return;
      }
      setError("");
      setJoined(employee.data?.start_date || employee.data?.hire_date || "");
      setSheets((rows.data || []) as Sheet[]);
    })();
    return () => {
      live = false;
    };
  }, [employeeId, refreshKey, year]);

  const { weeks, months, stats } = useMemo(() => {
    const today = isoDate(new Date());
    const byDate = new Map((sheets || []).map((sheet) => [sheet.work_date, sheet]));
    // Start on the Monday on or before 1 January so rows line up Mon–Sun.
    const cursor = new Date(year, 0, 1, 12);
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    const weeks: (Day | null)[][] = [];
    const months: { label: string; week: number }[] = [];
    const stats = { worked: 0, missing: 0, absences: 0, oldestMissing: "", streak: 0 };
    const workdays: Day[] = [];

    while (cursor.getFullYear() <= year) {
      const week: (Day | null)[] = [];
      for (let i = 0; i < 7; i++, cursor.setDate(cursor.getDate() + 1)) {
        if (cursor.getFullYear() !== year) {
          week.push(null);
          continue;
        }
        const date = isoDate(cursor);
        if (cursor.getDate() === 1) months.push({ label: monthShort.format(cursor).replace(".", ""), week: weeks.length });
        const weekend = cursor.getDay() === 0 || cursor.getDay() === 6;
        const sheet = byDate.get(date);
        const pretty = longDate.format(cursor);
        let day: Day;
        if (sheet?.attendance === "worked") {
          const hours = workedHours(sheet);
          const range = sheet.entry_time && sheet.exit_time ? ` · ${sheet.entry_time.slice(0, 5)}–${sheet.exit_time.slice(0, 5)}` : "";
          day = { date, kind: "worked", label: `${pretty} · Capturado${range}${hours ? ` (${formatHours(hours)})` : ""}` };
          stats.worked++;
        } else if (sheet) {
          day = { date, kind: sheet.attendance as Kind, label: `${pretty} · ${attendanceLabel(sheet.attendance)}` };
          stats.absences++;
        } else if (date > today) {
          day = { date, kind: "future", label: pretty };
        } else if (joined && date < joined) {
          day = { date, kind: "before", label: `${pretty} · Antes de tu ingreso` };
        } else if (weekend) {
          day = { date, kind: "off", label: `${pretty} · Fin de semana` };
        } else if (date === today) {
          day = { date, kind: "off", label: `${pretty} · Hoy, aún sin capturar` };
        } else {
          day = { date, kind: "missing", label: `${pretty} · Sin capturar` };
          stats.missing++;
          if (!stats.oldestMissing) stats.oldestMissing = date;
        }
        if (!weekend && date <= today && day.kind !== "before") workdays.push(day);
        week.push(day);
      }
      weeks.push(week);
    }

    // Streak: consecutive captured workdays, counting back from the latest one (today may still be open).
    for (let i = workdays.length - 1; i >= 0; i--) {
      const day = workdays[i];
      if (day.date === today && day.kind === "off") continue;
      if (day.kind === "missing") break;
      stats.streak++;
    }
    return { weeks, months, stats };
  }, [sheets, joined, year]);

  // On narrow screens, scroll so today sits near the right edge.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const todayCell = el?.querySelector<HTMLElement>(`[data-date="${isoDate(new Date())}"]`);
    if (el && todayCell) el.scrollLeft = todayCell.offsetLeft - el.clientWidth + todayCell.offsetWidth * 4;
  }, [weeks]);

  if (error) return <p className="error">No se pudo cargar tu calendario: {error}</p>;

  const showHover = (day: Day, target: HTMLElement) => {
    const box = target.getBoundingClientRect();
    const host = target.closest(".ts-calendar")!.getBoundingClientRect();
    setHover({ day, x: box.left - host.left + box.width / 2, y: box.top - host.top });
  };

  const shortDate = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });
  const summary = [
    `${stats.worked} ${stats.worked === 1 ? "día capturado" : "días capturados"}`,
    stats.absences ? `${stats.absences} ${stats.absences === 1 ? "ausencia" : "ausencias"}` : "",
    stats.streak > 1 ? `racha de ${stats.streak} días` : "",
  ].filter(Boolean).join(" · ");

  return (
    <section className="panel ts-calendar">
      <div className="ts-calendar-head">
        <span className="ts-calendar-icon"><CalendarDays size={18} /></span>
        <div>
          <h2>Tu año en timesheets</h2>
          <p>{sheets === null ? "Cargando tus días…" : summary}</p>
        </div>
        <div className="ts-calendar-year">
          <button type="button" className="icon" title="Año anterior" disabled={year <= joinedYear} onClick={() => setYear(year - 1)}>
            <ChevronLeft size={16} />
          </button>
          <strong>{year}</strong>
          <button type="button" className="icon" title="Año siguiente" disabled={year >= currentYear} onClick={() => setYear(year + 1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="ts-calendar-scroll" ref={scrollRef}>
        <div className="ts-calendar-grid" style={{ ["--weeks" as string]: weeks.length }} key={year}>
          <div className="ts-calendar-months">
            {months.map((month) => (
              <span key={month.label} style={{ gridColumn: month.week + 2 }}>{month.label}</span>
            ))}
          </div>
          <div className="ts-calendar-days">
            {DAY_LABELS.map((label, i) => <span key={i}>{label}</span>)}
          </div>
          {weeks.map((week, w) => (
            <div className="ts-calendar-week" key={w} style={{ ["--w" as string]: w, gridColumn: w + 2 }}>
              {week.map((day, i) =>
                day ? (
                  <button
                    type="button"
                    key={day.date}
                    data-date={day.date}
                    className={`ts-day ${day.kind}${day.date === selectedDate ? " selected" : ""}`}
                    aria-label={day.label}
                    disabled={day.kind === "future" || day.kind === "before"}
                    onClick={() => onPick(day.date)}
                    onMouseEnter={(event) => showHover(day, event.currentTarget)}
                    onFocus={(event) => showHover(day, event.currentTarget)}
                    onMouseLeave={() => setHover(null)}
                    onBlur={() => setHover(null)}
                  />
                ) : (
                  <span key={i} className="ts-day empty" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      {hover && (
        <div className="ts-calendar-tip" style={{ left: hover.x, top: hover.y }} role="tooltip">
          {hover.day.label}
        </div>
      )}

      <div className="ts-calendar-foot">
        {sheets === null ? <span /> : stats.missing ? (
          <p className="ts-calendar-status pending">
            <CircleAlert size={15} />
            {stats.missing === 1 ? "1 día pendiente" : `${stats.missing} días pendientes`}
            <button type="button" className="detail-link" onClick={() => onPick(stats.oldestMissing)}>
              Capturar el {shortDate.format(new Date(`${stats.oldestMissing}T12:00:00`)).replace(".", "")}
            </button>
          </p>
        ) : (
          <p className="ts-calendar-status done" role="status">
            <CheckCircle2 size={15} /> Estás al día{year === currentYear ? "" : ` en ${year}`}
          </p>
        )}
        <div className="ts-calendar-legend">
          <span><i className="ts-day worked" /> Trabajado</span>
          <span><i className="ts-day missing" /> Pendiente</span>
          <span><i className="ts-day absence" /> Falta</span>
          <span><i className="ts-day vacation" /> Vacaciones</span>
          <span><i className="ts-day holiday" /> Feriado</span>
          <span><i className="ts-day personal_day" /> Día personal</span>
          <span><i className="ts-day sick_leave" /> Incapacidad</span>
        </div>
      </div>
    </section>
  );
}
