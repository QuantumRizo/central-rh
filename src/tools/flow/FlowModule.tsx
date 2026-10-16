import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, FileSpreadsheet, LoaderCircle, RefreshCw } from "lucide-react";
import { compute, fetchCampaigns, money, PROBABILIDAD, shortDate, STATUS, sum, type Computed, type SyncInfo } from "./api";
import { ChartCard, DataTable, Legend, MagnitudeBars, ShareBars, TipRow, useTip, Waterfall, type WaterfallStep } from "./charts";

// Partes del ingreso. Las cuatro primeras son las de la gráfica 100% apilada del Power BI;
// MVD y Neto se suman según la variante elegida. El color va con la parte, no con su posición.
const PARTS = [
  { key: "fee", label: "Fee", pick: (c: Computed) => c.fee },
  { key: "margen", label: "Margen producción", pick: (c: Computed) => c.margenProduccion },
  { key: "markup", label: "Mark up medios", pick: (c: Computed) => c.markUp },
  { key: "otros", label: "Otros / promos", pick: (c: Computed) => c.otros_promos, light: true },
  { key: "mvd", label: "MVD", pick: (c: Computed) => c.mvd },
  { key: "neto", label: "Neto", pick: (c: Computed) => c.neto, light: true },
] as const;
type Part = (typeof PARTS)[number];

const VARIANTS = [
  { id: "base", label: "Sin MVD ni neto", short: "sin MVD ni neto", mvd: false, neto: false },
  { id: "mvd", label: "Con MVD", short: "con MVD", mvd: true, neto: false },
  { id: "neto", label: "Con neto", short: "con neto", mvd: false, neto: true },
  { id: "total", label: "Con MVD y neto", short: "con MVD y neto", mvd: true, neto: true },
] as const;
type Variant = (typeof VARIANTS)[number];
const VARIANT_KEY = "central-flow-variante";

const partsFor = (v: Variant): Part[] => PARTS.filter((part) => (part.key !== "mvd" || v.mvd) && (part.key !== "neto" || v.neto));
const income = (c: Computed, v: Variant) => c.ingresoSinMvdNeto + (v.mvd ? c.mvd : 0) + (v.neto ? c.neto : 0);
const ALL = "";
const DAY = 864e5;

// $3.20 M / $958.9 mil / $405 — como los tableros de Similares.
function compact(value: number) {
  const abs = Math.abs(value), sign = value < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)} M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)} mil`;
  return `${sign}$${abs.toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;
}
const percent = (value: number) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";

function Filter({ label, value, options, onChange, all = "Todos" }: {
  label: string; value: string; options: Array<string | { value: string; label: string }>; onChange: (value: string) => void; all?: string | null;
}) {
  return <label className="fd-filter">
    <span className="fd-filter-label">{label}</span>
    <span className="fd-select"><select value={value} onChange={(event) => onChange(event.target.value)}>
      {all !== null && <option value={ALL}>{all}</option>}
      {options.map((option) => typeof option === "string"
        ? <option key={option} value={option}>{option}</option>
        : <option key={option.value} value={option.value}>{option.label}</option>)}
    </select><ChevronDown size={15}/></span>
  </label>;
}

function Kpi({ label, value, note, hero }: { label: string; value: string; note?: ReactNode; hero?: boolean }) {
  return <article className={`fd-kpi${hero ? " is-hero" : ""}`}><span>{label}</span><strong>{value}</strong><small>{note ?? " "}</small></article>;
}

function StatusChip({ status }: { status: string | null }) {
  return status ? <span className={`fd-chip s-${STATUS.indexOf(status as never) + 1}`}>{status}</span> : <>—</>;
}

const STATUS_SWATCH = ["", "st-1", "st-2", "st-3", "st-4", "st-5"];

// El agente del NAS revisa el Excel cada 10 minutos; si pasan 2 horas sin revisión, avisa.
const SYNC_STALE = 2 * 3600e3;
const dateTime = (value: string) => new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

function SyncBadge({ info }: { info: SyncInfo | null }) {
  if (!info) return null;
  const stale = !info.revisado_en || Date.now() - Date.parse(info.revisado_en) > SYNC_STALE;
  const kind = info.estado === "error" ? " is-error" : stale || info.avisos.length ? " is-warn" : "";
  const label = info.estado === "error" ? "Error en el Excel"
    : info.datos_al ? `Excel al ${new Date(info.datos_al).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}` : "Excel";
  const detail = [
    info.archivo,
    info.estado === "error" && `No se pudo leer la última versión: ${info.error}`,
    info.datos_al && `Datos del Excel guardado el ${dateTime(info.datos_al)}.`,
    info.revisado_en && `El NAS lo revisó por última vez el ${dateTime(info.revisado_en)}.`,
    stale && "El NAS no ha revisado el Excel en más de 2 horas: los datos pueden estar desactualizados.",
    ...info.avisos,
  ].filter(Boolean).join("\n");
  return <span className={`fd-sync${kind}`} title={detail} aria-label={detail} tabIndex={0}><FileSpreadsheet size={14}/><span>{label}</span></span>;
}

function Timeline({ items, onSelect }: { items: Computed[]; onSelect: (id: string) => void }) {
  const tip = useTip();
  const dated = items.filter((c) => c.inicio && c.fin).sort((a, b) => a.inicio!.localeCompare(b.inicio!));
  if (!dated.length) return <p className="fd-empty">Ninguna campaña filtrada tiene fechas.</p>;
  const first = new Date(Math.min(...dated.map((c) => Date.parse(c.inicio!)))); first.setUTCDate(1);
  const last = new Date(Math.max(...dated.map((c) => Date.parse(c.fin!)))); last.setUTCMonth(last.getUTCMonth() + 1, 1);
  const span = last.getTime() - first.getTime();
  const at = (time: number) => `${(time - first.getTime()) / span * 100}%`;
  const months: Date[] = [];
  for (const d = new Date(first); d < last; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(new Date(d));
  const now = Date.now();
  return <div className="fd-timeline" ref={tip.hostRef} onMouseLeave={tip.hide}>
    <div className="fd-tl-row fd-tl-head"><span/><div className="fd-tl-track">{months.map((m, i) => <span key={i} style={{ left: at(m.getTime()) }}>
      {m.toLocaleDateString("es-MX", { month: "short", timeZone: "UTC" })}{i === 0 || m.getUTCMonth() === 0 ? ` ${String(m.getUTCFullYear()).slice(2)}` : ""}</span>)}</div></div>
    <div className="fd-tl-rows">
      {dated.map((c) => <div className="fd-tl-row" key={c.id}>
        <button className="fd-tl-name" title={c.campana} onClick={() => onSelect(c.id)}>{c.campana}</button>
        <div className="fd-tl-track">
          {months.map((m, i) => <i key={i} className="fd-tl-grid" style={{ left: at(m.getTime()) }}/>)}
          {now > first.getTime() && now < last.getTime() && <i className="fd-tl-today" style={{ left: at(now) }}/>}
          <span className={`fd-tl-bar ${STATUS_SWATCH[c.ordenStatus ?? 0] || "st-4"}`} style={{ left: at(Date.parse(c.inicio!)), width: `max(4px, ${(Date.parse(c.fin!) - Date.parse(c.inicio!) + DAY) / span * 100}%)` }}
            onMouseEnter={(event) => tip.showFor(event.currentTarget, <><header>{c.campana}</header>
              <TipRow swatch={STATUS_SWATCH[c.ordenStatus ?? 0]} value={c.status ?? "Sin status"} label={c.probabilidad ? `probabilidad ${c.probabilidad.toLowerCase()}` : ""}/>
              <TipRow value={`${shortDate(c.inicio)} – ${shortDate(c.fin)}`} label={`${c.duracion} días`}/>
              <TipRow value={compact(c.ventaCN)} label="venta CN"/></>)}/>
        </div>
      </div>)}
    </div>
    {tip.node}
  </div>;
}

function waterfallSteps(items: Computed[], variant: Variant): WaterfallStep[] {
  const steps: WaterfallStep[] = [
    { key: "venta", label: "Venta CN", value: sum(items, (c) => c.ventaCN), kind: "total" },
    { key: "medios", label: "Medios CxP", value: sum(items, (c) => c.medios_cxp), kind: "minus" },
    { key: "produccion", label: "Producción CxP", value: sum(items, (c) => c.produccion_cxp), kind: "minus" },
  ];
  if (variant.mvd) steps.push({ key: "mvd", label: "MVD", value: sum(items, (c) => c.mvd), kind: "plus" });
  if (variant.neto) steps.push({ key: "neto", label: "Neto", value: sum(items, (c) => c.neto), kind: "plus" });
  steps.push({ key: "ingreso", label: "Ingreso CN", value: sum(items, (c) => income(c, variant)), kind: "result" });
  return steps;
}

function waterfallTable(steps: WaterfallStep[]) {
  const base = steps[0]?.value || 1;
  return <DataTable columns={["Concepto", "Monto", "% de la venta"]}
    rows={steps.map((s) => [s.label, `${s.kind === "minus" ? "−" : s.kind === "plus" ? "+" : ""}${money.format(s.value)}`, percent(s.value / base)])}/>;
}

export function FlowModule() {
  const [campaigns, setCampaigns] = useState<Computed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [view, setView] = useState<"general" | "campana">("general");
  const [cliente, setCliente] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [probabilidad, setProbabilidad] = useState(ALL);
  const [selectedId, setSelectedId] = useState("");
  const [variant, setVariantState] = useState<Variant>(VARIANTS[0]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await fetchCampaigns();
      setCampaigns(data.campanas.map(compute));
      setSync(data.sincronizacion);
      setLoadedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el Flow.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try { const saved = VARIANTS.find((v) => v.id === localStorage.getItem(VARIANT_KEY)); if (saved) setVariantState(saved); } catch { /* opcional */ }
  }, []);

  function setVariant(id: string) {
    const next = VARIANTS.find((v) => v.id === id) ?? VARIANTS[0];
    setVariantState(next);
    try { localStorage.setItem(VARIANT_KEY, next.id); } catch { /* opcional */ }
  }

  function openCampaign(id: string) {
    setSelectedId(id); setView("campana");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const clients = useMemo(() => [...new Set(campaigns.map((c) => c.cliente))].sort(), [campaigns]);
  const byClient = useMemo(() => campaigns.filter((c) => !cliente || c.cliente === cliente), [campaigns, cliente]);
  const filtered = useMemo(() => byClient.filter((c) => (!status || c.status === status) && (!probabilidad || c.probabilidad === probabilidad)),
    [byClient, status, probabilidad]);
  const selected = byClient.find((c) => c.id === selectedId) ?? byClient[0];

  const variantFilter = <Filter label="INGRESO" value={variant.id} all={null} options={VARIANTS.map((v) => ({ value: v.id, label: v.label }))} onChange={setVariant}/>;
  const clientFilter = <Filter label="CLIENTE" value={cliente} options={clients} onChange={(value) => { setCliente(value); setSelectedId(""); }}/>;

  return <div className="fd-page">
    <div className="fd-shell">
      <div className="fd-screen">
        <header className="fd-header">
          <div className="fd-brand">
            <div><h1>FLOW COMERCIAL</h1><p>CENTRAL MX</p></div>
          </div>
          <nav className="fd-tabs" aria-label="Vista">
            <button className={view === "general" ? "is-active" : ""} aria-pressed={view === "general"} onClick={() => setView("general")}>General</button>
            <button className={view === "campana" ? "is-active" : ""} aria-pressed={view === "campana"} onClick={() => setView("campana")}>Por campaña</button>
          </nav>
          <div className="fd-actions">
            <SyncBadge info={sync}/>
            <button className="fd-icon" onClick={() => void load()} disabled={loading} title="Recargar datos" aria-label="Recargar datos">{loading ? <LoaderCircle className="spin" size={16}/> : <RefreshCw size={16}/>}</button>
          </div>
        </header>

        {view === "general" ? <>
          <section className="fd-filters">
            {clientFilter}
            <Filter label="STATUS" value={status} options={[...STATUS]} onChange={setStatus}/>
            <Filter label="PROBABILIDAD" value={probabilidad} options={[...PROBABILIDAD]} onChange={setProbabilidad}/>
            {variantFilter}
          </section>
          {error && <p className="fd-error">{error}</p>}
          {sync?.estado === "error" && <p className="fd-error">El Excel maestro tiene un problema y no se pudo actualizar: {sync.error} Se muestran los datos de la última versión que sí se leyó.</p>}
          <General items={filtered} variant={variant} loading={loading} status={status} onStatus={(s) => setStatus((current) => current === s ? ALL : s)} onOpen={openCampaign}/>
        </> : <>
          <section className="fd-filters is-campaign">
            {clientFilter}
            <Filter label="CAMPAÑA" value={selected?.id ?? ""} all={null} options={byClient.map((c) => ({ value: c.id, label: c.campana }))} onChange={setSelectedId}/>
            {variantFilter}
          </section>
          {error && <p className="fd-error">{error}</p>}
          {selected ? <CampaignView c={selected} variant={variant}/> : <p className="fd-empty">{loading ? "Cargando…" : "No hay campañas."}</p>}
        </>}
      </div>
      <footer className="fd-footer">
        <span>{loadedAt ? `Datos al ${loadedAt.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })} · ${campaigns.length} campañas` : "Cargando…"}</span>
        <span>Central MX · Flow comercial</span>
      </footer>
    </div>
  </div>;
}

function General({ items, variant, loading, status, onStatus, onOpen }: {
  items: Computed[]; variant: Variant; loading: boolean; status: string; onStatus: (status: string) => void; onOpen: (id: string) => void;
}) {
  const venta = sum(items, (c) => c.ventaCN);
  const ingreso = sum(items, (c) => income(c, variant));
  const confirmed = items.filter((c) => c.status === "Ganada");
  const projected = items.filter((c) => c.enProyeccion);
  const parts = partsFor(variant);
  const ranked = [...items].sort((a, b) => income(b, variant) - income(a, variant));
  const steps = waterfallSteps(items, variant);
  const statusRows = STATUS.map((s, i) => {
    const group = items.filter((c) => c.status === s);
    const value = sum(group, (c) => c.ventaCN);
    return { key: s, label: s, value, swatch: `st-${i + 1}`, note: `${group.length} · ${percent(venta ? value / venta : 0)}`,
      tip: <><header>{s}</header><TipRow swatch={`st-${i + 1}`} value={money.format(value)} label="venta CN"/><TipRow value={compact(sum(group, (c) => income(c, variant)))} label={`ingreso ${variant.short}`}/><TipRow value={group.length} label="campañas"/></> };
  }).filter((row) => row.value > 0 || row.key === status);

  const k = (value: number) => loading && !items.length ? "—" : money.format(value);
  return <>
    <section className="fd-kpis">
      <Kpi hero label="Venta total CN" value={k(venta)} note={`${items.length} campañas · ${new Set(items.map((c) => c.cliente)).size} cliente(s)`}/>
      <Kpi label="Ingreso CN" value={k(ingreso)} note={`${percent(venta ? ingreso / venta : 0)} de la venta · ${variant.short}`}/>
      <Kpi label="Confirmado (ganadas)" value={k(sum(confirmed, (c) => c.ventaCN))} note={`Ingreso ${compact(sum(confirmed, (c) => income(c, variant)))} · ${confirmed.length} campañas`}/>
      <Kpi label="Proyección (alta / media)" value={k(sum(projected, (c) => c.ventaCN))} note={`Ingreso ${compact(sum(projected, (c) => income(c, variant)))} · ${projected.length} campañas`}/>
      <Kpi label="Medios + producción CxP" value={k(sum(items, (c) => c.medios_cxp + c.produccion_cxp))} note={`Medios ${compact(sum(items, (c) => c.medios_cxp))} · Producción ${compact(sum(items, (c) => c.produccion_cxp))}`}/>
    </section>

    <section className="fd-grid fd-general">
      <ChartCard className="g-timeline" title="Calendario de campañas" subtitle="Inicio y fin por status; toca una campaña para ver su detalle"
        legend={<Legend items={STATUS.map((s, i) => ({ label: s, swatch: `st-${i + 1}` }))}/>}
        table={<DataTable columns={["Campaña", "Status", "Inicio", "Fin", "Días", "Venta CN"]}
          rows={[...items].sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? "")).map((c) => [c.campana, c.status ?? "—", shortDate(c.inicio), shortDate(c.fin), c.duracion ?? "—", money.format(c.ventaCN)])}/>}>
        <Timeline items={items} onSelect={onOpen}/>
      </ChartCard>

      <ChartCard className="g-waterfall" title="De la venta al ingreso" subtitle={`Lo que queda de la venta después de pagar proveedores (${variant.short})`}
        table={waterfallTable(steps)}>
        <Waterfall steps={steps} format={compact}/>
      </ChartCard>

      <ChartCard className="g-status" title="Venta por status" subtitle="Elige un status para filtrar el tablero"
        table={<DataTable columns={["Status", "Campañas", "Venta CN", `Ingreso (${variant.short})`, "% de la venta"]}
          rows={statusRows.map((row) => [row.label, items.filter((c) => c.status === row.key).length, money.format(row.value), money.format(sum(items.filter((c) => c.status === row.key), (c) => income(c, variant))), percent(venta ? row.value / venta : 0)])}/>}>
        <MagnitudeBars rows={statusRows} format={compact} selected={status || null} onSelect={onStatus}/>
      </ChartCard>

      <ChartCard className="g-comp" title="Composición del ingreso por campaña" subtitle={`Qué parte del ingreso (${variant.short}) viene de cada concepto; a la derecha, el ingreso`}
        legend={<Legend items={parts.map((p) => ({ label: p.label, swatch: `sw-${p.key}` }))}/>}
        table={<DataTable columns={["Campaña", "Venta CN", ...parts.map((p) => p.label), "Ingreso CN", "% Ganancia"]}
          rows={ranked.map((c) => [c.campana, money.format(c.ventaCN), ...parts.map((p) => money.format(p.pick(c))), money.format(income(c, variant)), percent(c.ventaCN ? income(c, variant) / c.ventaCN : 0)])}
          foot={["Total", money.format(venta), ...parts.map((p) => money.format(sum(items, p.pick))), money.format(ingreso), percent(venta ? ingreso / venta : 0)]}/>}>
        <ShareBars format={compact} onSelect={onOpen}
          rows={ranked.map((c) => ({ key: c.id, label: c.campana, total: compact(income(c, variant)),
            segments: parts.map((p) => ({ key: p.key, label: p.label, value: p.pick(c), swatch: `sw-${p.key}`, darkText: "light" in p })) }))}/>
      </ChartCard>
    </section>
  </>;
}

function progress(c: Computed) {
  if (!c.inicio || !c.fin) return null;
  const start = Date.parse(`${c.inicio}T00:00:00`), end = Date.parse(`${c.fin}T23:59:59`), now = Date.now();
  if (now < start) return { share: 0, text: `Inicia en ${Math.ceil((start - now) / DAY)} días` };
  if (now > end) return { share: 1, text: `Terminó hace ${Math.floor((now - end) / DAY)} días` };
  const day = Math.floor((now - start) / DAY) + 1;
  return { share: (now - start) / (end - start), text: `En curso · día ${day} de ${c.duracion}` };
}

function CampaignView({ c, variant }: { c: Computed; variant: Variant }) {
  const value = income(c, variant);
  const parts = partsFor(variant);
  const steps = waterfallSteps([c], variant);
  const state = progress(c);
  return <>
    <section className="fd-kpis">
      <Kpi hero label="Venta CN" value={money.format(c.ventaCN)} note={c.campana}/>
      <Kpi label="Ingreso CN" value={money.format(value)} note={`${percent(c.ventaCN ? value / c.ventaCN : 0)} de la venta · ${variant.short}`}/>
      <Kpi label="Inversión medios cliente" value={money.format(c.inversion_medios_cliente)} note={`Medios CxP ${compact(c.medios_cxp)}`}/>
      <Kpi label="Fee" value={money.format(c.fee)} note={`${percent(c.pct_fee)} de la inversión en medios`}/>
      <Kpi label="Producción" value={money.format(c.fee_produccion)} note={`Fee de producción · CxP ${compact(c.produccion_cxp)}`}/>
    </section>

    <section className="fd-grid fd-campaign">
      <section className="fd-card c-ficha">
        <header className="fd-card-header"><div className="fd-card-heading"><p className="fd-eyebrow">{c.cliente}{c.numero !== null ? ` · ID ${c.numero}` : ""}</p><h2 className="fd-title-lg">{c.campana}</h2>{c.notas && <p>{c.notas}</p>}</div></header>
        <div className="fd-card-body fd-ficha">
          <dl>
            <div><dt>Formato</dt><dd>{c.formato || "—"}</dd></div>
            <div><dt>Status</dt><dd><StatusChip status={c.status}/></dd></div>
            <div><dt>Probabilidad</dt><dd>{c.probabilidad || "—"}</dd></div>
            <div><dt>En proyección</dt><dd>{c.enProyeccion === null ? "—" : c.enProyeccion ? "Sí" : "No"}</dd></div>
            <div><dt>Inicio</dt><dd>{shortDate(c.inicio)}</dd></div>
            <div><dt>Fin</dt><dd>{shortDate(c.fin)}</dd></div>
            <div><dt>Impactos</dt><dd>{c.impactos ? c.impactos.toLocaleString("es-MX") : "—"}</dd></div>
            <div><dt>Duración</dt><dd>{c.duracion ? `${c.duracion} días` : "—"}</dd></div>
          </dl>
          {state && <div className="fd-progress"><div className="fd-progress-head"><span>{state.text}</span><span>{shortDate(c.inicio)} – {shortDate(c.fin)}</span></div>
            <div className="fd-progress-track"><span style={{ width: `${state.share * 100}%` }}/></div></div>}
        </div>
      </section>

      <ChartCard className="c-waterfall" title="De la venta al ingreso" subtitle={`Venta de la campaña menos lo que se paga a proveedores (${variant.short})`} table={waterfallTable(steps)}>
        <Waterfall steps={steps} format={compact}/>
      </ChartCard>

      <ChartCard className="c-comp" title="Composición del ingreso" subtitle={`Ingreso de ${money.format(value)} (${variant.short}) por concepto`}
        legend={<Legend items={parts.map((p) => ({ label: p.label, swatch: `sw-${p.key}` }))}/>}
        table={<DataTable columns={["Concepto", "Monto", "% del ingreso"]}
          rows={PARTS.map((p) => [`${p.label}${parts.includes(p) ? "" : " (no incluido)"}`, money.format(p.pick(c)), parts.includes(p) && value ? percent(p.pick(c) / value) : "—"])}
          foot={[`Ingreso CN (${variant.short})`, money.format(value), "100%"]}/>}>
        <div className="fd-comp-single">
          <ShareBars format={compact} rows={[{ key: c.id, label: "Ingreso", total: compact(value),
            segments: parts.map((p) => ({ key: p.key, label: p.label, value: p.pick(c), swatch: `sw-${p.key}`, darkText: "light" in p })) }]}/>
          <MagnitudeBars format={compact} rows={parts.map((p) => ({ key: p.key, label: p.label, value: p.pick(c), swatch: `sw-${p.key}`, note: value ? percent(p.pick(c) / value) : "" }))}/>
        </div>
      </ChartCard>
    </section>
  </>;
}
