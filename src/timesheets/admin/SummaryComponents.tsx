import { type ReactNode } from "react";

export function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="metric">
      <span className="metric-icon">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}
export function RankList({ rows }: { rows: { name: string; value: number }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return rows.length ? (
    <div className="rank-list">
      {rows.map((r) => (
        <div key={r.name}>
          <div>
            <span>{r.name.split(" (")[0]}</span>
            <strong>{r.value.toFixed(2)}</strong>
          </div>
          <div className="rank-bar">
            <span style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="empty">Sin información en este período.</p>
  );
}
export function ActivitySummary({ rows }: { rows: { name: string; equivalent: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.equivalent, 0);

  return (
    <section className="admin-card activity-summary">
      <div className="card-heading">
        <div>
          <h2>Dedicación por cliente</h2>
          <p>Tiempo acumulado por cliente en el período.</p>
        </div>
      </div>
      {rows.length > 0 && total > 0 ? (
        <div className="activity-summary-list">
          {rows.slice(0, 8).map((row) => {
            const share = row.equivalent / total;
            return (
              <div className="activity-summary-row" key={row.name}>
                <div className="activity-summary-label">
                  <span>{row.name}</span>
                  <strong>{share.toFixed(2)}</strong>
                </div>
                <div
                  className="activity-summary-bar"
                  role="progressbar"
                  aria-label={`${row.name}: ${(share * 100).toFixed(0)}%`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={share * 100}
                >
                  <span style={{ width: `${share * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty">Sin actividades en este período.</p>
      )}
    </section>
  );
}
