import { ArrowLeft, CalendarDays, Check, Clock3, LayoutDashboard, UserCheck, Users, X } from "lucide-react";
import { attendanceLabel } from "../attendance";
import { workedHours } from "../utils";
import { Metric } from "./SummaryComponents";

export function LegacyActivitySummary({
  rows,
  title = "Actividades principales",
  description = "Distribución acumulada en el período.",
}: {
  rows: { name: string; percentage: number; share: number }[];
  title?: string;
  description?: string;
}) {
  return (
    <section className="admin-card activity-summary">
      <div className="card-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {rows.length ? (
        <div className="detail-activity-list">
          {rows.map((row) => (
            <div className="detail-activity" key={row.name}>
              <div className="detail-activity-label">
                <span>{row.name}</span>
                <strong>{row.share.toFixed(0)}%</strong>
              </div>
              <div className="rank-bar">
                <span style={{ width: `${Math.min(row.share, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty">Sin actividades en este período.</p>
      )}
    </section>
  );
}

export function DetailHeader({
  eyebrow,
  title,
  description,
  backLabel,
  onClose,
}: {
  eyebrow: string;
  title: string;
  description: string;
  backLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="detail-header">
      <div>
        <button className="back-link" onClick={onClose}>
          <ArrowLeft size={17} /> {backLabel}
        </button>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <button className="icon detail-close" aria-label="Cerrar detalle" onClick={onClose}>
        <X size={19} />
      </button>
    </div>
  );
}

export function ClientDetail({
  detail,
  from,
  to,
  onClose,
}: {
  detail: any;
  from: string;
  to: string;
  onClose: () => void;
}) {
  return (
    <div className="detail-view">
      <DetailHeader
        eyebrow="DETALLE DEL CLIENTE"
        title={detail.name}
        description={`Personas y actividades registradas del ${from} al ${to}.`}
        backLabel="Volver a clientes"
        onClose={onClose}
      />
      <div className="detail-metrics">
        <Metric icon={<Users />} label="Personas trabajando" value={detail.people.length} />
        <Metric
          icon={<Clock3 />}
          label="Días equivalentes"
          value={detail.equivalent.toFixed(2)}
        />
        <Metric
          icon={<LayoutDashboard />}
          label="Actividades"
          value={detail.activities.length}
        />
      </div>
      <div className="detail-grid">
        <LegacyActivitySummary
          rows={detail.activities}
          title="Actividades principales"
          description="Proporción del tiempo reportado para este cliente."
        />
        <section className="admin-card people-detail-card">
          <div className="card-heading">
            <div>
              <h2>Personas asignadas</h2>
              <p>Qué actividad realiza cada persona y su porcentaje promedio diario.</p>
            </div>
          </div>
          {detail.people.length ? (
            <div className="assigned-people">
              {detail.people.map((person: any) => {
                const personTotal = [...person.activities.values()].reduce(
                  (sum: number, value: number) => sum + value,
                  0,
                );
                return (
                  <div className="assigned-person" key={person.id}>
                    <div className="assigned-person-heading">
                      <div>
                        <strong>{person.name}</strong>
                        <small>{person.position}</small>
                      </div>
                      <span>{person.equivalent.toFixed(2)} días eq.</span>
                    </div>
                    <div className="assigned-activities">
                      {[...person.activities]
                        .sort((a, b) => b[1] - a[1])
                        .map(([name, percentage]) => (
                          <div key={name}>
                            <span>{name}</span>
                            <strong>
                              {(percentage / Math.max(person.days.size, 1)).toFixed(1)}%
                            </strong>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty">Sin personas en este período.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export function PersonDetail({
  detail,
  from,
  to,
  onClose,
}: {
  detail: any;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const activityValue = (sheet: any, activityName: string) =>
    (sheet.timesheet_entries || [])
      .filter((entry: any) => (entry.activity?.name || "Sin actividad") === activityName)
      .reduce((sum: number, entry: any) => sum + (Number(entry.percentage) || 0), 0);
  return (
    <div className="detail-view">
      <DetailHeader
        eyebrow="DETALLE DE LA PERSONA"
        title={detail.person.full_name}
        description={`${detail.person.position} · Resumen del ${from} al ${to}.`}
        backLabel="Volver a personas"
        onClose={onClose}
      />
      <div className="detail-metrics person-metrics">
        <Metric icon={<CalendarDays />} label="Capturas" value={detail.own.length} />
        <Metric icon={<Check />} label="Días trabajados" value={detail.ownWorked.length} />
        <Metric icon={<Clock3 />} label="Horas reales" value={detail.hours.toFixed(1)} />
        <Metric
          icon={<UserCheck />}
          label="No trabajados"
          value={detail.own.filter((sheet: any) => sheet.attendance !== "worked").length}
        />
      </div>
      <LegacyActivitySummary
        rows={detail.activities}
        title="Resumen de actividades"
        description="Distribución de las actividades trabajadas por la persona."
      />
      <section className="admin-card table-card person-log-card">
        <div className="card-heading detail-table-heading">
          <div>
            <h2>Tiempo y actividades por día</h2>
            <p>Horas reales registradas y porcentaje capturado en cada actividad.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Fecha",
                  "Estado",
                  "Horario",
                  "Horas reales",
                  ...detail.activityNames,
                ].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.own.map((sheet: any) => (
                <tr key={sheet.id}>
                  <td>
                    {new Date(`${sheet.work_date}T12:00:00`).toLocaleDateString("es-MX")}
                  </td>
                  <td>
                    <span className={`status-pill ${sheet.attendance}`}>
                      {attendanceLabel(sheet.attendance)}
                    </span>
                  </td>
                  <td>
                    {sheet.attendance === "worked" && sheet.entry_time && sheet.exit_time
                      ? `${sheet.entry_time.slice(0, 5)} – ${sheet.exit_time.slice(0, 5)}`
                      : "—"}
                  </td>
                  <td>
                    {sheet.attendance === "worked"
                      ? workedHours(sheet.entry_time, sheet.exit_time).toFixed(1)
                      : "—"}
                  </td>
                  {detail.activityNames.map((activityName: string) => {
                    const percentage = activityValue(sheet, activityName);
                    return <td key={activityName}>{percentage ? `${percentage.toFixed(1)}%` : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!detail.own.length && <p className="empty">Sin registros en este período.</p>}
      </section>
    </div>
  );
}
