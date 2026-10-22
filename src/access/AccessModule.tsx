import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, History, Search } from "lucide-react";
import { sb } from "../lib/supabase";
import { TOOLS } from "../tools/catalog";
import { LEVEL_LABELS, RH_MODULES, TEMPLATES, canLoadData, moduleLevelLabel, type ModuleId, type ToolLevel } from "./levels";

type Person = { user_id: string; employee_id: string | null; full_name: string; email: string; superadmin: boolean; modules: Record<string, string>; tools: Record<string, ToolLevel> };
type Change = { at: string; actor: string; target: string; kind: "tool" | "role" | "module"; item: string | null; before: string | null; after: string | null };
type Rpc = PromiseLike<{ error: { message: string } | null }>;

const TOOL_SECTIONS = [...new Set(TOOLS.map((tool) => tool.section))];
const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

function describe(change: Change) {
  if (change.kind === "role") return `rol: ${change.before ?? "—"} → ${change.after ?? "—"}`;
  if (change.kind === "module") {
    const id = change.item as ModuleId, label = RH_MODULES.find((m) => m.id === id)?.label ?? id;
    const level = (value: string | null) => (value ? moduleLevelLabel(id, value) : "sin acceso");
    return `${label}: ${level(change.before)} → ${level(change.after)}`;
  }
  const level = (value: string | null) => (value ? LEVEL_LABELS[value as ToolLevel] : "sin acceso");
  return `${TOOLS.find((tool) => tool.id === change.item)?.label ?? change.item}: ${level(change.before)} → ${level(change.after)}`;
}

// Sólo para el super admin: qué módulos de RH administra cada persona y qué herramientas abre.
// Todos usan sus propios timesheets, evaluaciones y perfil sin necesitar nada aquí. Cada cambio
// se guarda al momento (las funciones vuelven a comprobar el permiso) y queda en el historial.
export function AccessModule({ selfUserId }: { selfUserId: string }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [history, setHistory] = useState<Change[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadHistory = useCallback(async () => {
    const { data } = await sb.rpc("access_history", { max_rows: 40 });
    setHistory((data ?? []) as Change[]);
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await sb.rpc("tool_access_matrix");
      if (error) setError(error.message);
      else setPeople((data ?? []) as Person[]);
      setBusy(false);
      await loadHistory();
    })();
  }, [loadHistory]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es-MX");
    return q ? people.filter((p) => `${p.full_name} ${p.email}`.toLocaleLowerCase("es-MX").includes(q)) : people;
  }, [people, query]);

  async function save(person: Person, key: string, next: Person, calls: Rpc[]) {
    setSaving(key);
    setError("");
    setPeople((current) => current.map((p) => (p.user_id === person.user_id ? next : p)));
    const results = await Promise.all(calls);
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      setPeople((current) => current.map((p) => (p.user_id === person.user_id ? person : p)));
      setError(`No se guardó el cambio: ${failed.error.message}`);
    }
    await loadHistory();
    setSaving("");
  }

  function setModule(person: Person, module: ModuleId, value: string) {
    const modules = { ...person.modules };
    if (value) modules[module] = value; else delete modules[module];
    void save(person, `${person.user_id}:${module}`, { ...person, modules },
      [sb.rpc("set_module_access", { target_user: person.user_id, module, new_level: value || null })]);
  }

  function applyTemplate(person: Person, templateId: string) {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    if (template.modules.firmas && !window.confirm(`${person.full_name} podrá administrar todo RH, incluido el Excel de firmas con contraseñas. ¿Continuar?`)) return;
    const modules = { ...template.modules } as Record<string, string>;
    const calls = RH_MODULES.filter((m) => (person.modules[m.id] ?? null) !== (modules[m.id] ?? null))
      .map((m) => sb.rpc("set_module_access", { target_user: person.user_id, module: m.id, new_level: modules[m.id] ?? null }));
    if (calls.length) void save(person, `${person.user_id}:template`, { ...person, modules }, calls);
  }

  function setTool(person: Person, toolId: string, value: string) {
    const tools = { ...person.tools };
    if (value) tools[toolId] = value as ToolLevel; else delete tools[toolId];
    void save(person, `${person.user_id}:${toolId}`, { ...person, tools },
      [sb.rpc("set_tool_access", { target_user: person.user_id, tool: toolId, new_level: value || null })]);
  }

  const busyRow = (person: Person) => saving.startsWith(`${person.user_id}:`);
  const selected = people.find((p) => p.user_id === selectedId) ?? visible[0] ?? null;
  const locked = selected ? selected.superadmin || selected.user_id === selfUserId : false;
  const lockedReason = selected?.superadmin ? "El super admin tiene todo" : selected?.user_id === selfUserId ? "No puedes cambiar tus propios accesos" : undefined;
  const pick = (id: string) => { setSelectedId(id); setDetailOpen(true); };

  return (
    <div className={`access-module ${detailOpen ? "is-detail" : ""}`}>
      <div className="page-header"><div><p className="eyebrow">CONFIGURACIÓN</p><h1>Accesos</h1><p>Qué módulos de RH administra cada persona y qué herramientas de Simi y CN Tools abre. Todos usan sus propios timesheets, evaluaciones y perfil.</p></div></div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="access-split">
        <section className="access-people" aria-label="Personas">
          <label className="access-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar persona" aria-label="Buscar persona" /></label>
          <p className="access-count">{busy ? "Cargando…" : `${visible.length} de ${people.length} cuentas`}</p>
          {!busy && <ul className="access-list">
            {visible.map((person) => (
              <li key={person.user_id}>
                <button type="button" className={person.user_id === selected?.user_id ? "active" : ""} onClick={() => pick(person.user_id)} aria-current={person.user_id === selected?.user_id}>
                  <span className="access-avatar" aria-hidden="true">{person.full_name.trim().charAt(0).toLocaleUpperCase("es-MX")}</span>
                  <span className="access-person"><strong>{person.full_name}</strong><small>{person.email}</small></span>
                  {person.superadmin && <span className="access-badge">Super admin</span>}
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>}
          {!busy && !visible.length && <p className="access-empty">Nadie coincide con la búsqueda.</p>}
        </section>
        {selected && <section className="access-detail" aria-label={`Accesos de ${selected.full_name}`}>
          <button type="button" className="back-link access-back" onClick={() => setDetailOpen(false)}><ArrowLeft size={17} /> Personas</button>
          <header className="access-detail-head">
            <span className="access-avatar large" aria-hidden="true">{selected.full_name.trim().charAt(0).toLocaleUpperCase("es-MX")}</span>
            <div><h2>{selected.full_name}</h2><p>{selected.email}{selected.superadmin ? " · Super admin" : ""}</p></div>
          </header>
          {lockedReason && <p className="access-note">{lockedReason}.</p>}
          <h3 className="access-group-title">Módulos de RH</h3>
          <div className="access-group">
            <div className="access-row">
              <div className="access-row-text"><strong>Plantilla</strong><small>Llena todos los módulos de golpe.</small></div>
              <select className="access-select" value="" disabled={locked || busyRow(selected)} aria-label={`Plantilla para ${selected.full_name}`} onChange={(event) => applyTemplate(selected, event.target.value)}>
                <option value="">Aplicar…</option>
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            {RH_MODULES.map((m) => {
              const level = selected.superadmin ? "admin" : selected.modules[m.id] ?? "";
              const help = m.levels.find((l) => l.value === level)?.help ?? "Sin acceso";
              return (
                <div className="access-row" key={m.id}>
                  <div className="access-row-text"><strong>{m.label}</strong><small>{help}</small></div>
                  <select className={`access-select ${level ? "is-on" : ""}`} value={level} disabled={locked || busyRow(selected)} title={lockedReason}
                    aria-label={`${selected.full_name}: ${m.label}`} onChange={(event) => setModule(selected, m.id, event.target.value)}>
                    <option value="">Sin acceso</option>
                    {m.levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
          {TOOL_SECTIONS.map((section) => (
            <div key={section}>
              <h3 className="access-group-title">{section}</h3>
              <div className="access-group">
                {TOOLS.filter((tool) => tool.section === section).map((tool) => {
                  const level = selected.superadmin ? (canLoadData(tool.id) ? "cargar" : "ver") : selected.tools[tool.id] ?? "";
                  return (
                    <div className="access-row" key={tool.id}>
                      <div className="access-row-text"><strong>{tool.label}</strong>{canLoadData(tool.id) && <small>Además de ver el dashboard, sube su Excel en el /admin.</small>}</div>
                      <select className={`access-select ${level ? "is-on" : ""}`} value={level} disabled={selected.superadmin || busyRow(selected)} title={selected.superadmin ? "El super admin tiene todo" : undefined}
                        aria-label={`${selected.full_name}: ${tool.label}`} onChange={(event) => setTool(selected, tool.id, event.target.value)}>
                        <option value="">Sin acceso</option>
                        <option value="ver">{LEVEL_LABELS.ver}</option>
                        {canLoadData(tool.id) && <option value="cargar">{LEVEL_LABELS.cargar}</option>}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="access-note">Los cambios se guardan al elegir.</p>
        </section>}
      </div>
      <section className="admin-card">
        <div className="card-heading"><div><h2><History size={19} /> Historial</h2><p>Últimos cambios de acceso.</p></div></div>
        {history.length ? <ul className="access-history">{history.map((change, index) => (
          <li key={`${change.at}-${index}`}><time>{dateTime.format(new Date(change.at))}</time><span><strong>{change.target}</strong> · {describe(change)}</span><small>por {change.actor}</small></li>
        ))}</ul> : <p className="access-empty">Todavía no hay cambios registrados.</p>}
      </section>
    </div>
  );
}
