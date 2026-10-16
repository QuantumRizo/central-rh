
// Piezas del dashboard del Flow, con la misma estructura que los tableros de Farmacias
// Similares (tarjeta con título, leyenda y botón Gráfica/Tabla; tooltip dentro del cuerpo),
// en la paleta azul de Central MX.

import { ChartColumn, Table2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

type Tip = { x: number; y: number; content: ReactNode } | null;

export function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  function showFor(element: HTMLElement, content: ReactNode) {
    const host = hostRef.current?.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    if (!host) return;
    setTip({ x: box.left + box.width / 2 - host.left, y: box.top - host.top, content });
  }
  const width = hostRef.current?.clientWidth ?? 0;
  const node = tip && <div className="fd-tooltip" role="status" style={{ left: tip.x, top: tip.y,
    transform: `translate(${tip.x > width - 240 ? "calc(-100% - 10px)" : tip.x < 120 ? "10px" : "-50%"}, ${tip.y > 90 ? "calc(-100% - 8px)" : "28px"})` }}>{tip.content}</div>;
  return { hostRef, node, showFor, hide: () => setTip(null) };
}

export function TipRow({ swatch, value, label }: { swatch?: string; value: ReactNode; label: ReactNode }) {
  return <div className="fd-tip-row"><i className={`fd-key ${swatch ?? ""}`}/><strong>{value}</strong><span>{label}</span></div>;
}

export type LegendItem = { label: string; swatch: string; kind?: "rect" | "line" };

export function Legend({ items }: { items: LegendItem[] }) {
  return <ul className="fd-legend">{items.map((item) => <li key={item.label}><i className={`fd-key ${item.kind === "line" ? "is-line" : ""} ${item.swatch}`}/>{item.label}</li>)}</ul>;
}

export function DataTable({ columns, rows, foot }: { columns: string[]; rows: Array<Array<ReactNode>>; foot?: Array<ReactNode> }) {
  return <table className="fd-table">
    <thead><tr>{columns.map((column, i) => <th key={column} scope="col" className={i ? "num" : undefined}>{column}</th>)}</tr></thead>
    <tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, i) => i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i} className="num">{cell}</td>)}</tr>)}</tbody>
    {foot && <tfoot><tr>{foot.map((cell, i) => i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i} className="num">{cell}</td>)}</tr></tfoot>}
  </table>;
}

export function ChartCard({ title, subtitle, legend, table, className = "", children }: {
  title: ReactNode; subtitle?: ReactNode; legend?: ReactNode; table?: ReactNode; className?: string; children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return <section className={`fd-card ${className}`}>
    <header className="fd-card-header">
      <div className="fd-card-heading"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      {table && <button type="button" className="fd-view-toggle" aria-pressed={showTable} onClick={() => setShowTable((value) => !value)}>
        {showTable ? <><ChartColumn size={13}/> Gráfica</> : <><Table2 size={13}/> Tabla</>}
      </button>}
    </header>
    {legend && !showTable && legend}
    <div className="fd-card-body">{showTable ? <div className="fd-table-wrap">{table}</div> : children}</div>
  </section>;
}

export type MagnitudeRow = { key: string; label: string; value: number; note?: string; swatch?: string; tip?: ReactNode };

// Barras horizontales de magnitud: etiqueta, barra y valor. Si hay onSelect, cada fila se
// puede elegir (cambia el fondo, como en los tableros de Similares).
export function MagnitudeBars({ rows, format, selected, onSelect, empty = "Sin datos con estos filtros." }: {
  rows: MagnitudeRow[]; format: (value: number) => string; selected?: string | null; onSelect?: (key: string) => void; empty?: string;
}) {
  const tip = useTip();
  const max = Math.max(0, ...rows.map((row) => row.value));
  if (!rows.length || max <= 0) return <p className="fd-empty">{empty}</p>;
  return <div className="fd-bars" ref={tip.hostRef} onMouseLeave={tip.hide}>
    {rows.map((row) => <div key={row.key} className={`fd-bar-row${selected === row.key ? " is-selected" : ""}`}
      role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? () => onSelect(row.key) : undefined}
      onKeyDown={onSelect ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(row.key); } } : undefined}
      onMouseEnter={(event) => row.tip && tip.showFor(event.currentTarget.querySelector(".fd-bar") as HTMLElement ?? event.currentTarget, row.tip)}>
      <span className="fd-bar-label" title={row.label}>{row.label}</span>
      <span className="fd-bar-track">
        <span className={`fd-bar ${row.swatch ?? ""}`} style={{ width: `${Math.max(row.value, 0) / max * 58}%` }}/>
        <span className="fd-bar-value">{format(row.value)}{row.note && <small> {row.note}</small>}</span>
      </span>
    </div>)}
    {tip.node}
  </div>;
}

export type ShareSegment = { key: string; label: string; value: number; swatch: string; darkText?: boolean };
export type ShareRow = { key: string; label: string; segments: ShareSegment[]; total: string };

// Barras 100% apiladas por fila, con el total a la derecha. Los montos negativos no caben en
// una composición: se dibujan como 0 y se ven en el tooltip y la tabla.
export function ShareBars({ rows, format, selected, onSelect }: {
  rows: ShareRow[]; format: (value: number) => string; selected?: string | null; onSelect?: (key: string) => void;
}) {
  const tip = useTip();
  if (!rows.length) return <p className="fd-empty">Sin campañas con estos filtros.</p>;
  return <div className="fd-bars fd-share" ref={tip.hostRef} onMouseLeave={tip.hide}>
    {rows.map((row) => {
      const positive = row.segments.reduce((total, segment) => total + Math.max(segment.value, 0), 0);
      return <div key={row.key} className={`fd-bar-row fd-share-row${selected === row.key ? " is-selected" : ""}`}
        role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined}
        onClick={onSelect ? () => onSelect(row.key) : undefined}
        onKeyDown={onSelect ? (event) => { if (event.key === "Enter") onSelect(row.key); } : undefined}>
        <span className="fd-bar-label" title={row.label}>{row.label}</span>
        <span className="fd-share-track">
          {positive <= 0 ? <span className="fd-share-empty">Sin ingreso</span> : row.segments.map((segment) => {
            const share = Math.max(segment.value, 0) / positive;
            if (share <= 0.002) return null;
            return <span key={segment.key} className={`fd-seg ${segment.swatch}${segment.darkText ? " is-light" : ""}`} style={{ flexGrow: share }}
              onMouseEnter={(event) => tip.showFor(event.currentTarget, <>
                <header>{row.label}</header>
                {row.segments.map((s) => <TipRow key={s.key} swatch={s.swatch} value={format(s.value)} label={`${s.label} · ${positive ? ((Math.max(s.value, 0) / positive) * 100).toFixed(1) : 0}%`}/>)}
              </>)}>
              {share >= 0.11 && `${(share * 100).toFixed(1)}%`}
            </span>;
          })}
        </span>
        <span className="fd-row-total">{row.total}</span>
      </div>;
    })}
    {tip.node}
  </div>;
}

export type WaterfallStep = { key: string; label: string; value: number; kind: "total" | "minus" | "plus" | "result" };

// De la venta al ingreso: cada paso es una barra que empieza donde terminó la anterior.
export function Waterfall({ steps, format }: { steps: WaterfallStep[]; format: (value: number) => string }) {
  const tip = useTip();
  let level = 0;
  const placed = steps.map((step) => {
    let from: number, to: number;
    if (step.kind === "total" || step.kind === "result") { from = 0; to = step.value; level = step.value; }
    else if (step.kind === "minus") { from = level - step.value; to = level; level = from; }
    else { from = level; to = level + step.value; level = to; }
    return { ...step, from: Math.min(from, to), to: Math.max(from, to) };
  });
  const max = Math.max(1, ...placed.map((step) => step.to));
  const base = steps[0]?.value || 1;
  return <div className="fd-waterfall" ref={tip.hostRef} onMouseLeave={tip.hide}>
    {placed.map((step) => <div key={step.key} className={`fd-wf-row is-${step.kind}`}>
      <span className="fd-bar-label">{step.label}</span>
      <span className="fd-wf-track">
        <span className="fd-wf-bar" style={{ left: `${step.from / max * 100}%`, width: `${Math.max((step.to - step.from) / max * 100, 0.4)}%` }}
          onMouseEnter={(event) => tip.showFor(event.currentTarget, <><header>{step.label}</header>
            <TipRow value={format(step.value)} label={`${((step.value / base) * 100).toFixed(1)}% de la venta`}/></>)}/>
      </span>
      <span className="fd-row-total">{step.kind === "minus" ? "−" : step.kind === "plus" ? "+" : ""}{format(step.value)}</span>
    </div>)}
    {tip.node}
  </div>;
}
