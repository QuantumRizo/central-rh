export const day = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const workedHours = (start?: string, end?: string) => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number),
    [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
};
export const csvCell = (value: unknown) => {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
};

export const HIDDEN_CLIENTS = new Set(["Tiempo interno", "Cliente de prueba"]);
