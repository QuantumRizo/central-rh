export type ReportSheet = {
  id: string;
  employee_id: string;
  work_date: string;
  attendance: string;
  mode: string | null;
  entry_time: string | null;
  exit_time: string | null;
  permission_entry_time: string | null;
  permission_exit_time: string | null;
  position_snapshot: string | null;
  employee?: { full_name: string; position: string } | null;
  timesheet_entries: {
    id: string;
    percentage: number;
    client: { id: string; name: string } | null;
    activity: { id: string; name: string } | null;
  }[];
};

export type ActivityBreakdown = {
  name: string;
  days: number;
  equivalent: number;
  share: number;
};

export function summarizeActivities(sheets: ReportSheet[]) {
  const clients = new Map<string, { dates: Set<string>; equivalent: number }>();
  const tasks = new Map<string, { dates: Set<string>; equivalent: number }>();
  let totalEquivalent = 0;
  for (const sheet of sheets) {
    if (sheet.attendance !== 'worked') continue;
    for (const entry of sheet.timesheet_entries || []) {
      const equivalent = (Number(entry.percentage) || 0) / 100;
      totalEquivalent += equivalent;
      for (const [group, name] of [[clients, entry.client?.name || 'Sin cliente'], [tasks, entry.activity?.name || 'Sin tarea']] as const) {
        const item = group.get(name) || { dates: new Set<string>(), equivalent: 0 };
        item.dates.add(sheet.work_date);
        item.equivalent += equivalent;
        group.set(name, item);
      }
    }
  }
  const rows = (group: Map<string, { dates: Set<string>; equivalent: number }>): ActivityBreakdown[] =>
    [...group].map(([name, item]) => ({ name, days: item.dates.size, equivalent: item.equivalent, share: totalEquivalent ? item.equivalent / totalEquivalent : 0 }))
      .sort((a, b) => b.equivalent - a.equivalent || a.name.localeCompare(b.name, 'es-MX'));
  return { clients: rows(clients), tasks: rows(tasks), totalEquivalent };
}
