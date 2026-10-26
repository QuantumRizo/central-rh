import { ArrowLeft, CalendarDays, Clock3, Download, LayoutDashboard, Search, UserCheck, Users, X } from "lucide-react";
import { useState } from "react";
import { AdminSkeleton } from "../../components/LoadingSkeletons";
import { PendingDays, ReportDetails } from "./ReportDetails";
import { ABSENCE_OPTIONS, attendanceLabel } from "../attendance";
import { day, csvCell } from "../utils";
import { sb } from "../../lib/supabase";

import { ClientDetail, PersonDetail, LegacyActivitySummary } from "./DetailComponents";
import { ActivitySummary, Metric, RankList } from "./SummaryComponents";
import { AdminTable } from "./AdminTable";
import { useAdminReport, type AdminTab } from "./useAdminReport";

export function AdminDashboard({ canEdit, onBack }: { canEdit: boolean; onBack: () => void }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const { selection, setSelection, revision, setRevision, from, setFrom, to, setTo, tab, setTab, query, setQuery, employees, sheets, busy, error, selectedClientName, setSelectedClientName, selectedPersonId, setSelectedPersonId, worked, absenceCounts, peopleWithCapture, coverage, hours, personRows, clientRows, activityRows, absenceRows, selectedClientDetail, selectedPersonDetail } = useAdminReport();
  const tabs: [AdminTab, string][] = [
    ["summary", "Resumen"],
    ["people", "Personas"],
    ["clients", "Clientes"],
    ["absences", "Ausencias"],
  ];
  const exportData = () => {
    if (selection?.type === "person") {
      setExporting(true);
      setExportError("");
      void import("./timesheetExcel").then(({ downloadTimesheetWorkbook }) => downloadTimesheetWorkbook(sheets, selection.id, selection.name, from, to)).catch((exportFailure: Error) => setExportError(exportFailure.message)).finally(() => setExporting(false));
      return;
    }
    let heading: string[] = [],
      data: (string | number)[][] = [];
    if (tab === "people") {
      heading = [
        "Colaborador",
        "Puesto",
        "Capturas",
        "Días trabajados",
        ...ABSENCE_OPTIONS.map((option) => option.plural),
        "Horas",
      ];
      data = personRows.map((r) => [
        r.name,
        r.position,
        r.captures,
        r.worked,
        ...r.absences,
        r.hours.toFixed(1),
      ]);
    } else if (tab === "clients") {
      heading = [
        "Cliente",
        "Personas",
        "Días equivalentes",
        "Actividad principal",
      ];
      data = clientRows.map((r) => [
        r.name,
        r.people,
        r.equivalent.toFixed(2),
        r.top,
      ]);
    } else if (tab === "absences") {
      heading = ["Fecha", "Colaborador", "Puesto", "Tipo"];
      data = absenceRows.map((r) => [
        r.work_date,
        r.employee?.full_name || "",
        r.employee?.position || "",
        attendanceLabel(r.attendance),
      ]);
    } else {
      heading = ["Indicador", "Valor"];
      data = [
        ["Colaboradores activos", employees.length],
        ["Personas con captura", peopleWithCapture.size],
        ["Registros", sheets.length],
        ["Días trabajados", worked.length],
        ...absenceCounts.map((item) => [item.plural, item.count]),
        ["Horas registradas", hours.toFixed(1)],
      ];
    }
    const blob = new Blob(
        [
          "\ufeff" +
            [heading, ...data]
              .map((r) => r.map(csvCell).join(","))
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `central-rh-${tab}-${from}-${to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return (
    <div className="admin-dashboard">
      <div className="page-header">
        <div>
          <button className="back-link" onClick={onBack}>
            <ArrowLeft size={17} /> Volver a captura
          </button>
          <p className="eyebrow">ADMINISTRACIÓN</p>
          <h1>Panel de seguimiento</h1>
          <p>Consulta el avance del equipo y la distribución del tiempo.</p>
        </div>
        <button
          className="secondary export-button"
          onClick={exportData}
          disabled={busy || exporting || !!error || (selection?.type === "person" && !sheets.some(s => s.employee_id === selection.id))}
        >
          <Download size={17} /> {exporting ? "Preparando Excel…" : selection?.type === "person" ? "Descargar reporte Excel" : "Exportar tabla CSV"}
        </button>
      </div>
      {exportError && <p role="alert" className="error">No se pudo generar el Excel: {exportError}</p>}
      <div className="admin-toolbar">
        <div className="date-filter">
          <label>
            Desde
            <input
              type="date"
              max={day()}
              value={from}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
          </label>
          <span>—</span>
          <label>
            Hasta
            <input
              type="date"
              max={day()}
              value={to}
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
          </label>
        </div>
        <button className="secondary" onClick={() => { setFrom(`${day().slice(0, 4)}-01-01`); setTo(day()); }}>Año a la fecha</button>
        {tab !== "summary" && (
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Buscar"
              placeholder="Buscar…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        )}
      </div>
      <nav className="admin-tabs" aria-label="Secciones del panel">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setSelection(null);
              setQuery("");
              setSelectedClientName(null);
              setSelectedPersonId(null);
            }}
          >
            {label}
            {id === "absences" && absenceRows.length > 0 && (
              <span>{absenceRows.length}</span>
            )}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {busy ? (
        <AdminSkeleton />
      ) : (
        <>
          <div className="metrics">
            <Metric
              icon={<Users />}
              label="Colaboradores activos"
              value={employees.length}
            />
            <Metric
              icon={<UserCheck />}
              label="Con captura"
              value={peopleWithCapture.size}
              detail={`${coverage}% del equipo`}
            />
            <Metric
              icon={<CalendarDays />}
              label="Registros del período"
              value={sheets.length}
            />
            <Metric
              icon={<Clock3 />}
              label="Horas registradas"
              value={hours.toFixed(1)}
            />
          </div>
          {tab === "summary" && (
            <div className="summary-grid">
              <section className="admin-card">
                <div className="card-heading">
                  <div>
                    <h2>Estado del período</h2>
                    <p>Resumen de asistencia registrada.</p>
                  </div>
                </div>
                <div className="status-list">
                  <div>
                    <span className="status-dot worked" />
                    Trabajados<strong>{worked.length}</strong>
                  </div>
                  {absenceCounts.map((item) => (
                    <div key={item.value}>
                      <span className={`status-dot ${item.value}`} />
                      {item.plural}<strong>{item.count}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <section className="admin-card">
                <div className="card-heading">
                  <div>
                    <h2>Clientes con más dedicación</h2>
                    <p>Días equivalentes según porcentaje reportado.</p>
                  </div>
                </div>
                <RankList
                  rows={clientRows
                    .slice(0, 5)
                    .map((r) => ({ name: r.name, value: r.equivalent }))}
                />
              </section>
            </div>
          )}
          {tab === "people" && (
            <AdminTable
              headings={[
                "Colaborador",
                "Puesto",
                "Capturas",
                "Trabajados",
                ...ABSENCE_OPTIONS.map((option) => option.plural),
                "Horas",
              ]}
              rows={personRows.map((r) => [
                <button className="detail-link" onClick={()=>setSelection({type:'person',id:r.id,name:r.name})}>{r.name}</button>,
                r.position,
                r.captures,
                r.worked,
                ...r.absences,
                r.hours.toFixed(1),
              ])}
              empty="No hay colaboradores que coincidan."
            />
          )}
          {tab === "clients" && (
            <>
              <ActivitySummary rows={clientRows.map(({ name, equivalent }) => ({ name, equivalent }))} />
              <AdminTable
                headings={[
                  "Cliente",
                  "Personas",
                  "Días equivalentes",
                  "Actividad principal",
                ]}
                rows={clientRows.map((r) => [
                  <button className="detail-link" onClick={()=>setSelection({type:'client',name:r.name})}>{r.name}</button>,
                  r.people,
                  r.equivalent.toFixed(2),
                  r.top,
                ])}
                empty="No hay actividad de clientes en este período."
              />
            </>
          )}
          {selection && (tab === 'people' || tab === 'clients') && <ReportDetails key={selection.type+(selection.type === 'person' ? selection.id : selection.name)+from+to} sheets={sheets} selection={selection} from={from} to={to} onClose={()=>setSelection(null)} db={sb} />}
          {tab === 'people' && <PendingDays employees={employees} sheets={sheets} from={from} to={to} today={day()} db={sb} canEdit={canEdit} onRefresh={()=>setRevision(r=>r+1)} />}
          {tab === "absences" && (
            <AdminTable
              headings={["Fecha", "Colaborador", "Puesto", "Tipo"]}
              rows={absenceRows.map((r) => [
                new Date(`${r.work_date}T12:00:00`).toLocaleDateString("es-MX"),
                r.employee?.full_name || "—",
                r.employee?.position || "—",
                <span className={`status-pill ${r.attendance}`}>
                  {attendanceLabel(r.attendance)}
                </span>,
              ])}
              empty="No hay ausencias en este período."
            />
          )}
        </>
      )}
    </div>
  );
}
