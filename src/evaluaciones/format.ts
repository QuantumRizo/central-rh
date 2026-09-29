export function formatScore(value: number | null) {
  return value === null || value === undefined ? '—' : `${(Number(value) * 100).toFixed(0)}%`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function formatAverage(values: number[]) {
  return values.length ? `${(values.reduce((sum, value) => sum + value, 0) / values.length * 100).toFixed(0)}%` : '—';
}

export function averageNumber(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
