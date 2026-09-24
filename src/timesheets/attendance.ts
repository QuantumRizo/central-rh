// Single list of attendance types. Values must match public.attendance_status in Supabase.
export const ABSENCE_OPTIONS = [
  { value: "vacation", label: "Vacaciones", plural: "Vacaciones" },
  { value: "absence", label: "Falta", plural: "Faltas" },
  { value: "personal_day", label: "Día personal", plural: "Días personales" },
  { value: "sick_leave", label: "Incapacidad", plural: "Incapacidades" },
  { value: "holiday", label: "Feriado", plural: "Feriados" },
] as const;

export type AbsenceType = (typeof ABSENCE_OPTIONS)[number]["value"];

export const attendanceLabel = (attendance: string) =>
  attendance === "worked"
    ? "Trabajado"
    : ABSENCE_OPTIONS.find((option) => option.value === attendance)?.label ?? "Falta";
