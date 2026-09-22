import { createClient } from "@supabase/supabase-js";

const HOLIDAYS_2026 = new Map([
  ["2026-01-01", "Año Nuevo"],
  ["2026-02-02", "Día de la Constitución"],
  ["2026-03-16", "Natalicio de Benito Juárez"],
  ["2026-05-01", "Día del Trabajo"],
  ["2026-09-16", "Día de la Independencia"],
  ["2026-11-16", "Revolución Mexicana"],
  ["2026-12-25", "Navidad"],
]);
const MAX_GENERATION_DATE = "2026-08-31";

type CatalogRow = { id: string; name: string };
type Allocation = { client: string; activity: string; value: number; unit: "percent" | "hours" };
type MonthPlan = { month: string; allocations: Allocation[] };
type AiPlan = { months: MonthPlan[] };
type DateRange = { start: string; end?: string };
type SpecialDay = { date: string; entry?: string; exit?: string };
type FormInput = {
  periodStart: string;
  periodEnd: string;
  entry: string;
  exit: string;
  mealHours: number;
  modality: "office" | "home_office" | "hybrid";
  homeOfficeDays?: number[];
  vacations?: DateRange[];
  absences?: DateRange[];
  workedHolidays?: SpecialDay[];
  workedWeekends?: SpecialDay[];
  distributionText?: string;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const json = (res: any, status: number, body: unknown) => res.status(status).json(body);

const parseDate = (value: unknown, label = "Fecha") => {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error(`${label} inválida`);
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw Error(`${label} inválida`);
  return date;
};

const parseTime = (value: unknown, label: string) => {
  const time = String(value || "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error(`${label} inválida`);
  return time;
};

const durationHours = (entry: string, exit: string) => {
  const [eh, em] = entry.split(":").map(Number);
  const [xh, xm] = exit.split(":").map(Number);
  return (xh * 60 + xm - eh * 60 - em) / 60;
};

const dateRange = (start: string, end: string) => {
  const values: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    values.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return values;
};

const expandRanges = (ranges: DateRange[] | undefined, label: string, start: string, end: string) => {
  const dates = new Set<string>();
  for (const range of ranges || []) {
    const first = parseDate(range.start, label);
    const last = parseDate(range.end || range.start, label);
    if (last < first) throw Error(`${label}: el fin no puede ser anterior al inicio`);
    if (first < start || last > end) throw Error(`${label}: hay fechas fuera del periodo`);
    for (const date of dateRange(first, last)) dates.add(date);
  }
  return dates;
};

const isWeekend = (date: string) => {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
};

const monthKeys = (start: string, end: string) => [...new Set(dateRange(start, end).map((date) => date.slice(0, 7)))];

const resolveCatalog = (value: string, catalog: CatalogRow[], label: string) => {
  const wanted = normalize(value);
  const exact = catalog.filter((item) => normalize(item.name) === wanted);
  const matches = exact.length ? exact : catalog.filter((item) => {
    const name = normalize(item.name);
    return name.startsWith(wanted) || wanted.startsWith(name);
  });
  if (matches.length !== 1) throw Error(`${label} no reconocido o ambiguo: ${value}`);
  return matches[0];
};

const extractGeminiText = (body: any) => body?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";

async function interpretDistribution(text: string, months: string[], clients: CatalogRow[], activities: CatalogRow[]): Promise<AiPlan> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Error("Gemini no está configurado en Vercel");
  const models = [...new Set([process.env.GEMINI_MODEL, "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash"].filter(Boolean))] as string[];
  const prompt = `Convierte la distribución mensual de carga de trabajo en JSON estructurado.
Meses obligatorios: ${months.join(", ")}.
Clientes válidos: ${clients.map((item) => item.name).join(" | ")}.
Actividades válidas: ${activities.filter((item) => normalize(item.name) !== "comida").map((item) => item.name).join(" | ")}.
No incluyas Comida; el sistema la agrega automáticamente.
Si el usuario indica una distribución para varios meses, repítela explícitamente para cada mes.
Los porcentajes de cada mes deben sumar 100. Si hay horas fijas, usa unit=hours para ellas y los porcentajes restantes deben sumar 100 sobre las horas restantes.
No inventes clientes ni actividades. Conserva los nombres válidos exactamente.

Información del usuario:
${text}`;
  const schema = {
    type: "object",
    properties: {
      months: {
        type: "array",
        items: {
          type: "object",
          properties: {
            month: { type: "string" },
            allocations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  client: { type: "string" }, activity: { type: "string" },
                  value: { type: "number" }, unit: { type: "string", enum: ["percent", "hours"] },
                },
                required: ["client", "activity", "value", "unit"],
              },
            },
          },
          required: ["month", "allocations"],
        },
      },
    },
    required: ["months"],
  };
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Gemini error", model, response.status, detail.slice(0, 500));
      if ([404, 429, 503].includes(response.status)) continue;
      throw Error("Gemini no pudo interpretar la distribución");
    }
    const raw = extractGeminiText(await response.json());
    if (!raw) continue;
    try { return JSON.parse(raw) as AiPlan; }
    catch { throw Error("Gemini devolvió una distribución inválida"); }
  }
  throw Error("Gemini está temporalmente saturado; inténtalo nuevamente en unos minutos");
}

function validateForm(value: unknown): FormInput {
  const input = (value || {}) as FormInput;
  input.periodStart = parseDate(input.periodStart, "Fecha inicial");
  input.periodEnd = parseDate(input.periodEnd, "Fecha final");
  if (input.periodEnd < input.periodStart) throw Error("El periodo es inválido");
  if (input.periodEnd > MAX_GENERATION_DATE) throw Error("La generación automática llega únicamente hasta el 31 de agosto de 2026; septiembre debe capturarse manualmente");
  if (dateRange(input.periodStart, input.periodEnd).length > 366) throw Error("El periodo no puede superar un año");
  input.entry = parseTime(input.entry, "Hora de entrada");
  input.exit = parseTime(input.exit, "Hora de salida");
  const duration = durationHours(input.entry, input.exit);
  input.mealHours = Number(input.mealHours);
  if (duration <= 0 || !Number.isFinite(input.mealHours) || input.mealHours < 0 || input.mealHours >= duration) throw Error("El horario o la comida son inválidos");
  if (!(["office", "home_office", "hybrid"] as string[]).includes(input.modality)) throw Error("Modalidad inválida");
  input.homeOfficeDays = [...new Set((input.homeOfficeDays || []).map(Number))].filter((day) => day >= 1 && day <= 5);
  return input;
}

function validatePlan(plan: AiPlan, months: string[], clients: CatalogRow[], activities: CatalogRow[]) {
  if (!plan || !Array.isArray(plan.months)) throw Error("El plan de distribución es inválido");
  const byMonth = new Map<string, MonthPlan>();
  for (const month of plan.months) {
    if (!months.includes(month.month) || byMonth.has(month.month) || !Array.isArray(month.allocations) || !month.allocations.length) {
      throw Error(`Distribución mensual inválida: ${month.month || "sin mes"}`);
    }
    const resolved = month.allocations.map((item) => {
      const client = resolveCatalog(String(item.client), clients, "Cliente");
      const activity = resolveCatalog(String(item.activity), activities, "Actividad");
      const value = Number(item.value);
      if (!Number.isFinite(value) || value <= 0 || !["percent", "hours"].includes(item.unit)) throw Error(`Valor inválido en ${month.month}`);
      if (normalize(activity.name) === "comida") throw Error("No incluyas Comida en la distribución; se agrega automáticamente");
      return { ...item, value, client: client.name, activity: activity.name, client_id: client.id, activity_id: activity.id };
    });
    const unitsByEntry = new Map<string, string>();
    const merged = new Map<string, typeof resolved[number]>();
    for (const item of resolved) {
      const entryKey = `${item.client_id}:${item.activity_id}`;
      if (unitsByEntry.has(entryKey) && unitsByEntry.get(entryKey) !== item.unit) throw Error(`${month.month}: una misma actividad no puede mezclar porcentaje y horas fijas`);
      unitsByEntry.set(entryKey, item.unit);
      const key = `${entryKey}:${item.unit}`;
      const previous = merged.get(key);
      merged.set(key, previous ? { ...previous, value: round2(previous.value + item.value) } : item);
    }
    const allocations = [...merged.values()];
    const percentageTotal = round2(allocations.filter((item) => item.unit === "percent").reduce((sum, item) => sum + item.value, 0));
    if (percentageTotal && Math.abs(percentageTotal - 100) > 0.01) throw Error(`${month.month}: los porcentajes deben sumar 100% y actualmente suman ${percentageTotal}%`);
    byMonth.set(month.month, { month: month.month, allocations });
  }
  const missing = months.filter((month) => !byMonth.has(month));
  if (missing.length) throw Error(`Falta distribución para: ${missing.join(", ")}`);
  return byMonth as Map<string, MonthPlan & { allocations: Array<Allocation & { client_id: string; activity_id: string }> }>;
}

function generatePayloads(input: FormInput, plan: AiPlan, employeeId: string, clients: CatalogRow[], activities: CatalogRow[]) {
  const months = monthKeys(input.periodStart, input.periodEnd);
  const planByMonth = validatePlan(plan, months, clients, activities);
  const vacations = expandRanges(input.vacations, "Vacaciones", input.periodStart, input.periodEnd);
  const absences = expandRanges(input.absences, "Incapacidades o permisos", input.periodStart, input.periodEnd);
  const overlap = [...vacations].filter((date) => absences.has(date));
  if (overlap.length) throw Error(`Fechas repetidas entre vacaciones y ausencias: ${overlap.join(", ")}`);
  const parseSpecial = (rows: SpecialDay[] | undefined, kind: "holiday" | "weekend") => {
    const result = new Map<string, { entry: string; exit: string }>();
    for (const row of rows || []) {
      const date = parseDate(row.date, "Fecha especial");
      if (date < input.periodStart || date > input.periodEnd) throw Error(`${date} está fuera del periodo`);
      if (kind === "holiday" && !HOLIDAYS_2026.has(date)) throw Error(`${date} no es un festivo oficial configurado`);
      if (kind === "weekend" && !isWeekend(date)) throw Error(`${date} no es fin de semana`);
      const entry = parseTime(row.entry || input.entry, "Entrada especial");
      const exit = parseTime(row.exit || input.exit, "Salida especial");
      if (durationHours(entry, exit) <= input.mealHours) throw Error(`La jornada especial de ${date} es inválida`);
      result.set(date, { entry, exit });
    }
    return result;
  };
  const workedHolidays = parseSpecial(input.workedHolidays, "holiday");
  const workedWeekends = parseSpecial(input.workedWeekends, "weekend");
  for (const date of [...workedHolidays.keys(), ...workedWeekends.keys()]) {
    if (vacations.has(date) || absences.has(date)) throw Error(`${date} está marcado simultáneamente como trabajado y no trabajado`);
  }
  const workedDays: Array<{ date: string; entry: string; exit: string; mode: "office" | "home_office" }> = [];
  const payloads: any[] = [];
  for (const date of dateRange(input.periodStart, input.periodEnd)) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const specialSchedule = workedHolidays.get(date) || workedWeekends.get(date);
    if (specialSchedule) {
      const mode = input.modality === "home_office" || (input.modality === "hybrid" && input.homeOfficeDays?.includes(weekday)) ? "home_office" : "office";
      workedDays.push({ date, ...specialSchedule, mode });
    } else if (HOLIDAYS_2026.has(date)) {
      payloads.push({ employee_id: employeeId, work_date: date, attendance: "holiday", mode: null, entry_time: null, exit_time: null, entries: [] });
    } else if (!isWeekend(date) && vacations.has(date)) {
      payloads.push({ employee_id: employeeId, work_date: date, attendance: "vacation", mode: null, entry_time: null, exit_time: null, entries: [] });
    } else if (!isWeekend(date) && absences.has(date)) {
      payloads.push({ employee_id: employeeId, work_date: date, attendance: "absence", mode: null, entry_time: null, exit_time: null, entries: [] });
    } else if (!isWeekend(date)) {
      const mode = input.modality === "home_office" || (input.modality === "hybrid" && input.homeOfficeDays?.includes(weekday)) ? "home_office" : "office";
      workedDays.push({ date, entry: input.entry, exit: input.exit, mode });
    }
  }
  const central = resolveCatalog("Central de Negocios", clients, "Cliente de comida");
  const meal = resolveCatalog("Comida", activities, "Actividad de comida");
  const monthSummary: any[] = [];
  for (const month of months) {
    const monthDays = workedDays.filter((day) => day.date.startsWith(month));
    const productiveTotal = round2(monthDays.reduce((sum, day) => sum + durationHours(day.entry, day.exit) - input.mealHours, 0));
    if (productiveTotal <= 0) throw Error(`${month}: no hay días trabajados para distribuir`);
    const monthPlan = planByMonth.get(month)!;
    const fixedTotal = round2(monthPlan.allocations.filter((item) => item.unit === "hours").reduce((sum, item) => sum + item.value, 0));
    if (fixedTotal > productiveTotal + 0.01) throw Error(`${month}: las horas fijas exceden las ${productiveTotal} horas productivas disponibles`);
    const percentRows = monthPlan.allocations.filter((item) => item.unit === "percent");
    if (!percentRows.length && Math.abs(fixedTotal - productiveTotal) > 0.01) throw Error(`${month}: las horas fijas suman ${fixedTotal}, pero deben cubrir ${productiveTotal} horas productivas`);
    const remaining = round2(productiveTotal - fixedTotal);
    const targets = monthPlan.allocations.map((item) => ({
      ...item,
      targetHours: item.unit === "hours" ? item.value : round2(remaining * item.value / 100),
    }));
    if (targets.length) targets[targets.length - 1].targetHours = round2(productiveTotal - targets.slice(0, -1).reduce((sum, item) => sum + item.targetHours, 0));
    for (const day of monthDays) {
      const totalHours = durationHours(day.entry, day.exit);
      const productive = totalHours - input.mealHours;
      const hourRows = targets.map((item) => ({ ...item, hours: productive * item.targetHours / productiveTotal }));
      hourRows.push({ client_id: central.id, activity_id: meal.id, client: central.name, activity: meal.name, hours: input.mealHours, value: input.mealHours, unit: "hours" as const, targetHours: input.mealHours });
      const entries = hourRows.map((item) => ({ client_id: item.client_id, activity_id: item.activity_id, percentage: round2(item.hours / totalHours * 100) }));
      entries[entries.length - 1].percentage = round2(100 - entries.slice(0, -1).reduce((sum, item) => sum + item.percentage, 0));
      payloads.push({ employee_id: employeeId, work_date: day.date, attendance: "worked", mode: day.mode, entry_time: day.entry, exit_time: day.exit, entries });
    }
    monthSummary.push({ month, workedDays: monthDays.length, productiveHours: productiveTotal, allocations: targets.map((item) => ({ client: item.client, activity: item.activity, hours: item.targetHours, percentage: round2(item.targetHours / productiveTotal * 100) })) });
  }
  payloads.sort((a, b) => a.work_date.localeCompare(b.work_date));
  const names = new Map([...clients.map((item) => [item.id, item.name]), ...activities.map((item) => [item.id, item.name])]);
  const days = payloads.map((item) => ({
    date: item.work_date, attendance: item.attendance, mode: item.mode, entry: item.entry_time, exit: item.exit_time,
    entries: item.entries.map((entry: any) => ({ client: names.get(entry.client_id), activity: names.get(entry.activity_id), percentage: entry.percentage })),
  }));
  return { payloads, days, monthSummary, vacations: [...vacations], absences: [...absences] };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return json(res, 405, { error: "Método no permitido" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !supabaseKey) return json(res, 500, { error: "Configuración del servidor incompleta" });
  const sb = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  try {
    const input = validateForm(req.body?.input);
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    if (userError || !userData.user) throw Error("Tu sesión expiró");
    const [{ data: employeeId, error: employeeError }, { data: role }, { data: clients, error: clientsError }, { data: activities, error: activitiesError }] = await Promise.all([
      sb.rpc("my_employee_id"),
      sb.from("user_roles").select("role").eq("user_id", userData.user.id).maybeSingle(),
      sb.from("clients").select("id,name").eq("active", true).order("name"),
      sb.from("activities").select("id,name").eq("active", true).order("name"),
    ]);
    if (employeeError) throw employeeError;
    if (clientsError) throw clientsError;
    if (activitiesError) throw activitiesError;
    if (!employeeId) throw Error("Tu cuenta no tiene un colaborador vinculado");
    const { data: employee, error: employeeDataError } = await sb.from("employees").select("start_date").eq("id", employeeId).single();
    if (employeeDataError) throw employeeDataError;
    if (employee?.start_date && input.periodStart < employee.start_date) throw Error(`El periodo no puede comenzar antes de tu fecha de ingreso (${employee.start_date})`);
    const months = monthKeys(input.periodStart, input.periodEnd);
    let plan = req.body?.plan as AiPlan | undefined;
    if (!plan) {
      const text = String(input.distributionText || "").trim();
      if (!text) throw Error("Describe la distribución mensual por cliente y actividad");
      plan = await interpretDistribution(text, months, clients || [], activities || []);
    }
    const generated = generatePayloads(input, plan, employeeId, clients || [], activities || []);
    const dates = generated.payloads.map((item) => item.work_date);
    const { data: existing, error: existingError } = await sb.from("timesheets").select("work_date").eq("employee_id", employeeId).in("work_date", dates);
    if (existingError) throw existingError;
    const existingDates = new Set((existing || []).map((item) => item.work_date));
    const isAdmin = role?.role === "admin";
    const overwrite = isAdmin && req.body?.overwrite === true;
    const summary = {
      total: generated.payloads.length,
      worked: generated.payloads.filter((item) => item.attendance === "worked").length,
      vacations: generated.payloads.filter((item) => item.attendance === "vacation").length,
      absences: generated.payloads.filter((item) => item.attendance === "absence").length,
      holidays: generated.payloads.filter((item) => item.attendance === "holiday").length,
      new: generated.payloads.filter((item) => !existingDates.has(item.work_date)).length,
      existing: generated.payloads.filter((item) => existingDates.has(item.work_date)).length,
      overwrite,
    };
    if (req.body?.action !== "commit") return json(res, 200, { summary, plan, days: generated.days, monthSummary: generated.monthSummary });
    const { data: result, error: saveError } = await sb.rpc("save_timesheets_batch", { payloads: generated.payloads, overwrite_existing: overwrite });
    if (saveError) throw saveError;
    return json(res, 200, { summary, result });
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : "No se pudieron generar las horas" });
  }
}
