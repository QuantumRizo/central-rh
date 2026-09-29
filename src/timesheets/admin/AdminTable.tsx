import { type ReactNode } from "react";

export function AdminTable({
  headings,
  rows,
  empty,
  onRowClick,
}: {
  headings: string[];
  rows: ReactNode[][];
  empty: string;
  onRowClick?: (index: number) => void;
}) {
  return (
    <section className="admin-card table-card">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {headings.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
              {rows.map((row, i) => (
              <tr
                key={i}
                className={onRowClick ? "clickable-row" : ""}
                onClick={() => onRowClick?.(i)}
                onKeyDown={(event) => {
                  if (onRowClick && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onRowClick(i);
                  }
                }}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
              >
                {row.map((value, j) => (
                  <td key={j}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="empty">{empty}</p>}
    </section>
  );
}
