export function mexicoNow(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return { date: `${value('year')}-${value('month')}-${value('day')}`, weekday: value('weekday'), hour: Number(value('hour')), minute: Number(value('minute')) };
}

const utcDate = (date: string) => new Date(`${date}T12:00:00Z`);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export function weekdays(from: string, to: string) {
  const result: string[] = [];
  for (const date = utcDate(from), end = utcDate(to); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) result.push(isoDate(date));
  }
  return result;
}

export function monday(date: string) {
  const day = utcDate(date);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return isoDate(day);
}

export function reminderPeriods(wednesdayDate: string) {
  const weekStart = utcDate(monday(wednesdayDate));
  const shifted = (days: number) => {
    const date = new Date(weekStart);
    date.setUTCDate(date.getUTCDate() + days);
    return isoDate(date);
  };
  return {
    previousStart: shifted(-7),
    previousEnd: shifted(-3),
    currentStart: shifted(0),
    currentEnd: shifted(1),
  };
}

export function eligibleStart(startDate: string | null, hireDate: string | null, windowStart: string) {
  return [startDate, hireDate, windowStart].filter((date): date is string => Boolean(date)).sort().at(-1)!;
}
