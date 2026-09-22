import { createClient } from "@supabase/supabase-js";

const HOLIDAYS_2026 = new Map([
  ["2026-01-01", "Año Nuevo"],
  ["2026-02-02", "Día de la Constitución"],
  ["2026-03-16", "Natalicio de Benito Juárez"],
  ["2026-05-01", "Día del Trabajo"],
  ["2026-09-16", "Día de la Independencia"],
]);

type CatalogRow = { id: string; name: string };
type CsvRow = {
  date: string;
  worked: string;
  mode: string;
  entry: string;
  exit: string;
  client: string;
  activity: string;
  hours: number;
};

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase();

const parseCsv = (source: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (char !== "\r") cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((item) => item.some((value) => value.trim() !== ""));
};

const parseDate = (value: string) => {
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error(`Fecha inválida: ${value}`);
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw Error(`Fecha inválida: ${value}`);
  }
  return date;
};

const resolveCatalog = (value: string, catalog: CatalogRow[], kind: string) => {
  const wanted = normalize(value);
  const exact = catalog.filter((item) => normalize(item.name) === wanted);
  const matches = exact.length ? exact : catalog.filter((item) => {
    const name = normalize(item.name);
    return name.startsWith(wanted) || wanted.startsWith(name);
  });
  if (matches.length !== 1) {
    throw Error(`${kind} no reconocido o ambiguo: ${value}`);
  }
  return matches[0];
};

const parseHours = (value: string) => {
  const hours = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw Error(`Horas inválidas: ${value}`);
  return hours;
};

const modeValue = (value: string) => {
  const mode = normalize(value);
  if (mode.includes("home")) return "home_office";
  if (mode.includes("permiso")) return "schedule_permission";
  return "office";
};

const todayMexico = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const parseBodyDates = (value: unknown, label: string) => {
  if (!Array.isArray(value)) throw Error(`${label}: formato inválido`);
  return [...new Set(value.map((item) => parseDate(String(item))))].sort();
};

const isWeekend = (date: string) => {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
};

const datesBetween = (start: string, end: string) => {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const json = (res: any, status: number, body: unknown) => res.status(status).json(body);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return json(res, 405, { error: "Método no permitido" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !supabaseKey) return json(res, 500, { error: "Configuración del servidor incompleta" });

  const sb = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const body = req.body || {};
  const csv = typeof body.csv === "string" ? body.csv : "";
  const dryRun = body.dryRun !== false;
  const overwrite = body.overwrite === true;
  if (!csv.trim()) return json(res, 400, { error: "Selecciona un archivo CSV" });

  try {
    const vacationDates = parseBodyDates(body.vacationDates || [], "Vacaciones");
    const absenceDates = parseBodyDates(body.absenceDates || [], "Incapacidades o permisos");
    const workedHolidayDates = parseBodyDates(body.workedHolidayDates || [], "Festivos trabajados");
    const workedWeekendDates = parseBodyDates(body.workedWeekendDates || [], "Fines de semana trabajados");
    const [{ data: employeeId, error: employeeError }, { data: role }] = await Promise.all([
      sb.rpc("my_employee_id"),
      sb.from("user_roles").select("role").eq("user_id", (await sb.auth.getUser(token)).data.user?.id || "").maybeSingle(),
    ]);
    if (employeeError) throw employeeError;
    if (!employeeId) throw Error("Tu cuenta no tiene un colaborador vinculado");
    const isAdmin = role?.role === "admin";
    const canOverwrite = isAdmin && overwrite;

    const rows = parseCsv(csv);
    const header = rows.shift()?.map((item) => item.replace(/^\uFEFF/, "").trim()) || [];
    const expected = ["Fecha", "Trabajaste", "Modalidad", "Entrada", "Salida", "Cliente", "Actividad", "Horas"];
    if (header.length !== expected.length || expected.some((value, index) => normalize(header[index]) !== normalize(value))) {
      throw Error(`El CSV debe tener las columnas: ${expected.join(",")}`);
    }
    const parsed: CsvRow[] = rows.map((values, index) => {
      if (values.length !== expected.length) throw Error(`Fila ${index + 2}: número de columnas inválido`);
      const [date, worked, mode, entry, exit, client, activity, hours] = values;
      return { date: parseDate(date), worked, mode, entry, exit, client, activity, hours: normalize(worked).startsWith("no") ? 0 : parseHours(hours) };
    });
    if (!parsed.length) throw Error("El CSV no tiene filas de datos");
    const maxDate = todayMexico();
    const future = parsed.find((item) => item.date > maxDate);
    if (future) throw Error(`El CSV contiene una fecha futura: ${future.date}`);

    const periodEnd = parsed.map((item) => item.date).sort().at(-1)!;
    const firstYear = Math.min(...parsed.map((item) => Number(item.date.slice(0, 4))));
    const yearStart = `${firstYear}-01-01`;
    const [{ data: clients, error: clientsError }, { data: activities, error: activitiesError }, { data: employeeRow, error: employeeRowError }] = await Promise.all([
      sb.from("clients").select("id,name").eq("active", true),
      sb.from("activities").select("id,name").eq("active", true),
      sb.from("employees").select("start_date").eq("id", employeeId).single(),
    ]);
    if (clientsError) throw clientsError;
    if (activitiesError) throw activitiesError;
    if (employeeRowError) throw employeeRowError;
    const periodStart = employeeRow?.start_date && employeeRow.start_date > yearStart
      ? employeeRow.start_date
      : yearStart;
    if (periodStart > periodEnd) throw Error(`El archivo termina antes de la fecha de ingreso (${periodStart})`);
    const beforeStart = parsed.find((item) => item.date < periodStart);
    if (beforeStart) throw Error(`El CSV contiene una fecha anterior al ingreso: ${beforeStart.date}`);
    for (const date of [...vacationDates, ...absenceDates, ...workedHolidayDates, ...workedWeekendDates]) {
      if (date < periodStart || date > periodEnd) throw Error(`${date} está fuera del periodo ${periodStart} a ${periodEnd}`);
    }
    const clientCatalog = (clients || []) as CatalogRow[];
    const activityCatalog = (activities || []) as CatalogRow[];
    const grouped = new Map<string, { entry: string; exit: string; mode: string; rows: Map<string, { client_id: string; activity_id: string; hours: number }> }>();
    for (const item of parsed) {
      if (normalize(item.worked).startsWith("no")) continue;
      const client = resolveCatalog(item.client, clientCatalog, "Cliente");
      const activity = resolveCatalog(item.activity, activityCatalog, "Actividad");
      const current = grouped.get(item.date) || { entry: item.entry || "09:00", exit: item.exit || "18:00", mode: modeValue(item.mode), rows: new Map() };
      if (item.entry) current.entry = item.entry;
      if (item.exit) current.exit = item.exit;
      const key = `${client.id}:${activity.id}`;
      const existing = current.rows.get(key);
      current.rows.set(key, { client_id: client.id, activity_id: activity.id, hours: (existing?.hours || 0) + item.hours });
      grouped.set(item.date, current);
    }
    const payloadByDate = new Map<string, any>();
    for (const [date, day] of grouped) {
      const duration = (() => {
        const [sh, sm] = day.entry.split(":").map(Number), [eh, em] = day.exit.split(":").map(Number);
        return (eh * 60 + em - sh * 60 - sm) / 60;
      })();
      const entries = [...day.rows.values()];
      const totalHours = entries.reduce((sum, item) => sum + item.hours, 0);
      if (!Number.isFinite(duration) || duration <= 0) throw Error(`Horario inválido en ${date}`);
      if (Math.abs(totalHours - duration) > 0.01) throw Error(`${date}: las actividades suman ${totalHours.toFixed(2)} h, pero la jornada es de ${duration.toFixed(2)} h`);
      const percentages = entries.map((item) => ({ client_id: item.client_id, activity_id: item.activity_id, percentage: Number((item.hours / totalHours * 100).toFixed(2)) }));
      const remainder = Number((100 - percentages.slice(0, -1).reduce((sum, item) => sum + item.percentage, 0)).toFixed(2));
      percentages[percentages.length - 1].percentage = remainder;
      payloadByDate.set(date, { employee_id: employeeId, work_date: date, attendance: "worked", mode: day.mode, entry_time: day.entry, exit_time: day.exit, entries: percentages });
    }

    const declaredHolidayWork = new Set(workedHolidayDates);
    const declaredWeekendWork = new Set(workedWeekendDates);
    const csvHolidayWork = [...payloadByDate.keys()].filter((date) => HOLIDAYS_2026.has(date));
    const csvWeekendWork = [...payloadByDate.keys()].filter(isWeekend);
    const missingHolidayRows = workedHolidayDates.filter((date) => payloadByDate.get(date)?.attendance !== "worked");
    const missingWeekendRows = workedWeekendDates.filter((date) => payloadByDate.get(date)?.attendance !== "worked");
    const undeclaredHolidayRows = csvHolidayWork.filter((date) => !declaredHolidayWork.has(date));
    const undeclaredWeekendRows = csvWeekendWork.filter((date) => !declaredWeekendWork.has(date));
    if (missingHolidayRows.length) throw Error(`Festivos declarados como trabajados sin horas en el CSV: ${missingHolidayRows.join(", ")}`);
    if (missingWeekendRows.length) throw Error(`Fines de semana declarados como trabajados sin horas en el CSV: ${missingWeekendRows.join(", ")}`);
    if (undeclaredHolidayRows.length) throw Error(`El CSV contiene festivos trabajados que no se declararon: ${undeclaredHolidayRows.join(", ")}`);
    if (undeclaredWeekendRows.length) throw Error(`El CSV contiene fines de semana trabajados que no se declararon: ${undeclaredWeekendRows.join(", ")}`);
    const invalidWeekends = workedWeekendDates.filter((date) => !isWeekend(date));
    if (invalidWeekends.length) throw Error(`Estas fechas no son fin de semana: ${invalidWeekends.join(", ")}`);

    const vacationSet = new Set(vacationDates.filter((date) => !isWeekend(date) && !HOLIDAYS_2026.has(date)));
    const absenceSet = new Set(absenceDates.filter((date) => !isWeekend(date) && !HOLIDAYS_2026.has(date)));
    const conflicts = [...vacationSet].filter((date) => absenceSet.has(date) || payloadByDate.has(date));
    conflicts.push(...[...absenceSet].filter((date) => payloadByDate.has(date)));
    if (conflicts.length) throw Error(`Fechas declaradas con dos estados distintos: ${[...new Set(conflicts)].sort().join(", ")}`);
    for (const date of vacationSet) {
      payloadByDate.set(date, { employee_id: employeeId, work_date: date, attendance: "vacation", mode: null, entry_time: null, exit_time: null, entries: [] });
    }
    for (const date of absenceSet) {
      payloadByDate.set(date, { employee_id: employeeId, work_date: date, attendance: "absence", mode: null, entry_time: null, exit_time: null, entries: [] });
    }
    for (const [date, label] of HOLIDAYS_2026) {
      if (date >= periodStart && date <= periodEnd && !payloadByDate.has(date)) {
        payloadByDate.set(date, { employee_id: employeeId, work_date: date, attendance: "holiday", mode: null, entry_time: null, exit_time: null, entries: [], holiday_name: label });
      }
    }
    const { data: rangeExisting, error: rangeExistingError } = await sb.from("timesheets")
      .select("work_date").eq("employee_id", employeeId).gte("work_date", periodStart).lte("work_date", periodEnd);
    if (rangeExistingError) throw rangeExistingError;
    const rangeExistingDates = new Set((rangeExisting || []).map((item) => item.work_date));
    const unexplained = datesBetween(periodStart, periodEnd).filter((date) =>
      !isWeekend(date) && !payloadByDate.has(date) && !rangeExistingDates.has(date)
    );
    if (unexplained.length) {
      const visible = unexplained.slice(0, 12).join(", ");
      const remainder = unexplained.length > 12 ? ` y ${unexplained.length - 12} más` : "";
      throw Error(`Hay días hábiles sin rastro: ${visible}${remainder}. Agrégalos al CSV, a vacaciones o a incapacidades/permisos.`);
    }
    const payloads = [...payloadByDate.values()].sort((a, b) => a.work_date.localeCompare(b.work_date));
    const dates = payloads.map((item) => item.work_date);
    const { data: existing, error: existingError } = await sb.from("timesheets").select("work_date").eq("employee_id", employeeId).in("work_date", dates);
    if (existingError) throw existingError;
    const existingDates = new Set((existing || []).map((item) => item.work_date));
    const summary = { total: payloads.length, new: payloads.filter((item) => !existingDates.has(item.work_date)).length, existing: payloads.filter((item) => existingDates.has(item.work_date)).length, overwrite: canOverwrite };
    if (dryRun) return json(res, 200, {
      summary,
      dates,
      period: { start: periodStart, end: periodEnd },
      holidays: payloads.filter((item) => item.attendance === "holiday").map((item) => item.work_date),
      vacations: [...vacationSet],
      absences: [...absenceSet],
      workedHolidays: workedHolidayDates,
      workedWeekends: workedWeekendDates,
    });
    const { data: result, error: saveError } = await sb.rpc("save_timesheets_batch", { payloads, overwrite_existing: canOverwrite });
    if (saveError) throw saveError;
    return json(res, 200, { summary, result });
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : "No se pudo procesar el CSV" });
  }
}
