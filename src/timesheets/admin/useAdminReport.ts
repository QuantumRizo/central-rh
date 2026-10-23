import { useEffect, useState } from "react";
import { sb } from "../../lib/supabase";
import { ABSENCE_OPTIONS } from "../attendance";
import { day, workedHours, HIDDEN_CLIENTS } from "../utils";

export type AdminTab = "summary" | "people" | "clients" | "absences";
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

export function useAdminReport() {
  const [selection, setSelection] = useState<{type:'person'|'client';name:string}|null>(null);
  const [revision, setRevision] = useState(0);
  const [from, setFrom] = useState(monthStart()),
    [to, setTo] = useState(day()),
    [tab, setTab] = useState<AdminTab>("summary"),
    [query, setQuery] = useState(""),
    [employees, setEmployees] = useState<any[]>([]),
    [sheets, setSheets] = useState<any[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [selectedClientName, setSelectedClientName] = useState<string | null>(null),
    [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      setBusy(true);
      setError("");
      try {
        if (from > to)
          throw Error("La fecha inicial debe ser anterior a la fecha final.");
        const employeeRequest = sb
          .from("employees")
          .select("id,full_name,position,status,start_date")
          .eq("status", "Activo")
          .order("full_name");
        const all: any[] = [];
        for (let start = 0; ; start += 500) {
          const { data, error } = await sb
            .from("timesheets")
            .select(
              "id,employee_id,work_date,attendance,mode,entry_time,exit_time,position_snapshot,employee:employees(full_name,position),timesheet_entries(id,percentage,client:clients(id,name),activity:activities(id,name))",
            )
            .gte("work_date", from)
            .lte("work_date", to)
            .order("work_date", { ascending: false })
            .range(start, start + 499);
          if (error) throw error;
          all.push(...(data || []));
          if ((data?.length || 0) < 500) break;
        }
        const employeeResult = await employeeRequest;
        if (employeeResult.error) throw employeeResult.error;
        if (live) {
          setEmployees(employeeResult.data || []);
          setSheets(all);
        }
      } catch (e) {
        if (live) {
          setEmployees([]);
          setSheets([]);
          setError((e as Error).message);
        }
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [from, to, revision]);

  const worked = sheets.filter((s) => s.attendance === "worked"),
    absenceCounts = ABSENCE_OPTIONS.map((option) => ({
      ...option,
      count: sheets.filter((s) => s.attendance === option.value).length,
    }));
  const peopleWithCapture = new Set(sheets.map((s) => s.employee_id));
  const coverage = employees.length
    ? Math.round((peopleWithCapture.size / employees.length) * 100)
    : 0;
  const hours = worked.reduce(
    (sum, s) => sum + workedHours(s.entry_time, s.exit_time),
    0,
  );
  const toIsWeekend = (() => { const d = new Date(to + 'T12:00:00'); return d.getDay() === 0 || d.getDay() === 6; })();
  const missing = toIsWeekend ? [] : employees.filter(
    (e) => !sheets.some((s) => s.employee_id === e.id && s.work_date === to),
  );
  const personRows = employees
    .map((e) => {
      const own = sheets.filter((s) => s.employee_id === e.id),
        ownWorked = own.filter((s) => s.attendance === "worked");
      return {
        id: e.id,
        name: e.full_name,
        position: e.position,
        captures: own.length,
        worked: ownWorked.length,
        absences: ABSENCE_OPTIONS.map(
          (option) => own.filter((s) => s.attendance === option.value).length,
        ),
        hours: ownWorked.reduce(
          (sum, s) => sum + workedHours(s.entry_time, s.exit_time),
          0,
        ),
      };
    })
    .filter((r) =>
      `${r.name} ${r.position}`.toLowerCase().includes(query.toLowerCase()),
    );
  const clientMap = new Map<
    string,
    {
      name: string;
      equivalent: number;
      people: Set<string>;
      activities: Map<string, number>;
    }
  >();
  const activityMap = new Map<string, number>();
  for (const sheet of worked)
    for (const entry of sheet.timesheet_entries || []) {
      const client = entry.client?.name || "Sin cliente",
        activity = entry.activity?.name || "Sin actividad",
        percentage = Number(entry.percentage) || 0;
      const item = clientMap.get(client) || {
        name: client,
        equivalent: 0,
        people: new Set<string>(),
        activities: new Map<string, number>(),
      };
      item.equivalent += percentage / 100;
      item.people.add(sheet.employee_id);
      item.activities.set(
        activity,
        (item.activities.get(activity) || 0) + percentage / 100,
      );
      clientMap.set(client, item);
      activityMap.set(
        activity,
        (activityMap.get(activity) || 0) + percentage / 100,
      );
    }
  const clientRows = [...clientMap.values()]
    .map((c) => ({
      name: c.name,
      people: c.people.size,
      equivalent: c.equivalent,
      top: [...c.activities].sort((a, b) => b[1] - a[1])[0]?.[0] || "—",
    }))
    .filter(
      (r) =>
        !HIDDEN_CLIENTS.has(r.name) &&
        r.name.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => b.equivalent - a.equivalent);
  const activityRows = [...activityMap]
    .map(([name, equivalent]) => ({ name, equivalent }))
    .sort((a, b) => b.equivalent - a.equivalent);
  const absenceRows = sheets
    .filter((s) => s.attendance !== "worked" && s.attendance !== "holiday")
    .filter((s) =>
      `${s.employee?.full_name || ""} ${s.employee?.position || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  const selectedClientDetail = selectedClientName
    ? (() => {
        const client = clientMap.get(selectedClientName);
        if (!client) return null;
        const people = new Map<
          string,
          {
            id: string;
            name: string;
            position: string;
            equivalent: number;
            days: Set<string>;
            activities: Map<string, number>;
          }
        >();
        const activities = new Map<string, number>();
        for (const sheet of worked) {
          for (const entry of sheet.timesheet_entries || []) {
            if (entry.client?.name !== selectedClientName) continue;
            const activity = entry.activity?.name || "Sin actividad";
            const percentage = Number(entry.percentage) || 0;
            const person = people.get(sheet.employee_id) || {
              id: sheet.employee_id,
              name: sheet.employee?.full_name || "Colaborador sin nombre",
              position: sheet.employee?.position || sheet.position_snapshot || "—",
              equivalent: 0,
              days: new Set<string>(),
              activities: new Map<string, number>(),
            };
            person.equivalent += percentage / 100;
            person.days.add(sheet.work_date);
            person.activities.set(
              activity,
              (person.activities.get(activity) || 0) + percentage,
            );
            people.set(sheet.employee_id, person);
            activities.set(activity, (activities.get(activity) || 0) + percentage);
          }
        }
        const activityTotal = [...activities.values()].reduce((sum, value) => sum + value, 0);
        return {
          ...client,
          activities: [...activities]
            .map(([name, percentage]) => ({
              name,
              percentage,
              share: activityTotal ? (percentage / activityTotal) * 100 : 0,
            }))
            .sort((a, b) => b.percentage - a.percentage),
          people: [...people.values()].sort((a, b) => b.equivalent - a.equivalent),
        };
      })()
    : null;
  const selectedPersonDetail = selectedPersonId
    ? (() => {
        const person = employees.find((employee) => employee.id === selectedPersonId);
        if (!person) return null;
        const own = sheets.filter((sheet) => sheet.employee_id === selectedPersonId);
        const ownWorked = own.filter((sheet) => sheet.attendance === "worked");
        const activities = new Map<string, number>();
        for (const sheet of ownWorked)
          for (const entry of sheet.timesheet_entries || []) {
            const activity = entry.activity?.name || "Sin actividad";
            activities.set(activity, (activities.get(activity) || 0) + (Number(entry.percentage) || 0));
          }
        const activityTotal = [...activities.values()].reduce((sum, value) => sum + value, 0);
        const activityNames = [...activities]
          .sort((a, b) => b[1] - a[1])
          .map(([name]) => name);
        return {
          person,
          own,
          ownWorked,
          hours: ownWorked.reduce(
            (sum, sheet) => sum + workedHours(sheet.entry_time, sheet.exit_time),
            0,
          ),
          activities: [...activities]
            .map(([name, percentage]) => ({
              name,
              percentage,
              share: activityTotal ? (percentage / activityTotal) * 100 : 0,
            }))
            .sort((a, b) => b.percentage - a.percentage),
          activityNames,
        };
      })()
    : null;
  return { selection, setSelection, revision, setRevision, from, setFrom, to, setTo, tab, setTab, query, setQuery, employees, sheets, busy, error, selectedClientName, setSelectedClientName, selectedPersonId, setSelectedPersonId, worked, absenceCounts, peopleWithCapture, coverage, hours, toIsWeekend, missing, personRows, clientRows, activityRows, absenceRows, selectedClientDetail, selectedPersonDetail };
}
