export type Entry = { client_id: string; activity_id: string; percentage: number; hours?: number };
export const mergeDuplicateEntries = (entries: Entry[]) => {
  const merged = new Map<string, Entry>();
  for (const row of entries) {
    const key = `${row.client_id}:${row.activity_id}`;
    const existing = merged.get(key);
    if (existing) {
      existing.hours = (Number(existing.hours) || 0) + (Number(row.hours) || 0);
    } else {
      merged.set(key, { ...row });
    }
  }
  return [...merged.values()];
};
export const sheetSnapshot = (value: {
  attendance: string;
  mode: string;
  entry: string;
  exit: string;
  permissionEntry: string;
  permissionExit: string;
  rows: Entry[];
}) => JSON.stringify({
  attendance: value.attendance,
  mode: value.mode,
  entry: value.entry,
  exit: value.exit,
  permissionEntry: value.permissionEntry,
  permissionExit: value.permissionExit,
  rows: value.rows.map((row) => ({
    client_id: row.client_id,
    activity_id: row.activity_id,
    percentage: Number(row.percentage) || 0,
    hours: Number(row.hours) || 0,
  })),
});
