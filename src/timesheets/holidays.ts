const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha del n-ésimo lunes del mes (month 1-12). */
const nthMonday = (year: number, month: number, n: number) => {
  const first = new Date(year, month - 1, 1, 12).getDay();
  return 1 + ((8 - first) % 7) + (n - 1) * 7;
};

/** Días feriados oficiales de México (Ley Federal del Trabajo, art. 74) como `YYYY-MM-DD`. */
export const mexicoHolidays = (year: number) => {
  const iso = (month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
  const days = [
    iso(1, 1),
    iso(2, nthMonday(year, 2, 1)),
    iso(3, nthMonday(year, 3, 3)),
    iso(5, 1),
    iso(9, 16),
    iso(11, nthMonday(year, 11, 3)),
    iso(12, 25),
  ];
  // Transmisión del Poder Ejecutivo Federal: cada seis años (2024, 2030…).
  if ((year - 2024) % 6 === 0) days.push(iso(10, 1));
  return new Set(days);
};

const cache = new Map<number, Set<string>>();
export const isMexicoHoliday = (date: string) => {
  const year = Number(date.slice(0, 4));
  if (!cache.has(year)) cache.set(year, mexicoHolidays(year));
  return cache.get(year)!.has(date);
};
