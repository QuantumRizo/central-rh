import { useCallback, useEffect, useMemo, useState } from "react";
import { History, KeyRound, Search } from "lucide-react";
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

  return (
    <div className="access-module">
      <div className="page-header"><div><p className="eyebrow">CONFIGURACIÓN</p><h1>Accesos</h1><p>Qué módulos de RH administra cada persona y qué herramientas de Simi y CN Tools abre. Todos usan sus propios timesheets, evaluaciones y perfil.</p></div></div>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="admin-card">
        <div className="card-heading">
          <div><h2><KeyRound size={19} /> Accesos por persona</h2><p>{busy ? "Cargando…" : `${people.length} cuentas. Los cambios se guardan al elegir.`}</p></div>
        </div>
        <dl className="access-legend">
          {RH_MODULES.flatMap((m) => m.levels.map((level) => (
            <div key={`${m.id}-${level.value}`}><dt>{m.label} · {level.label}</dt><dd>{level.help}</dd></div>
          )))}
          <div><dt>Simi · Ver y cargar</dt><dd>Además de ver el dashboard, sube su Excel en el /admin.</dd></div>
        </dl>
        <label className="access-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar persona" aria-label="Buscar persona" /></label>
        {!busy && <div className="access-table-wrap">
          <table className="access-table">
            <thead>
              <tr>
                <th rowSpan={2} scope="col">Persona</th>
                <th scope="colgroup" colSpan={RH_MODULES.length + 1} className="access-section">RH</th>
                {TOOL_SECTIONS.map((section) => <th key={section} scope="colgroup" colSpan={TOOLS.filter((t) => t.section === section).length} className="access-section">{section}</th>)}
              </tr>
              <tr>
                <th scope="col" className="access-tool">Plantilla</th>
                {RH_MODULES.map((m) => <th key={m.id} scope="col" className="access-tool">{m.label}</th>)}
                {TOOLS.map((tool) => <th key={tool.id} scope="col" className="access-tool">{tool.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.map((person) => {
                const locked = person.superadmin || person.user_id === selfUserId;
                return (
                  <tr key={person.user_id}>
                    <th scope="row">
                      <strong>{person.full_name}</strong>
                      <span>{person.email}{person.superadmin ? " · Super admin" : ""}</span>
                    </th>
                    <td>
                      <select className="access-select" value="" disabled={locked || busyRow(person)} aria-label={`Plantilla para ${person.full_name}`}
                        onChange={(event) => applyTemplate(person, event.target.value)}>
                        <option value="">Aplicar…</option>
                        {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </td>
                    {RH_MODULES.map((m) => {
                      const level = person.superadmin ? "admin" : person.modules[m.id] ?? "";
                      return (
                        <td key={m.id} className="access-cell">
                          <select className={`access-select ${level ? "is-on" : ""}`} value={level} disabled={locked || busyRow(person)}
                            title={person.superadmin ? "El super admin tiene todo" : person.user_id === selfUserId ? "No puedes cambiar tus propios accesos" : undefined}
                            aria-label={`${person.full_name}: ${m.label}`} onChange={(event) => setModule(person, m.id, event.target.value)}>
                            <option value="">—</option>
                            {m.levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                          </select>
                        </td>
                      );
                    })}
                    {TOOLS.map((tool) => {
                      const level = person.superadmin ? (canLoadData(tool.id) ? "cargar" : "ver") : person.tools[tool.id] ?? "";
                      return (
                        <td key={tool.id} className="access-cell">
                          <select className={`access-select ${level ? "is-on" : ""}`} value={level} disabled={person.superadmin || busyRow(person)}
                            title={person.superadmin ? "El super admin tiene todo" : undefined}
                            aria-label={`${person.full_name}: ${tool.label}`} onChange={(event) => setTool(person, tool.id, event.target.value)}>
                            <option value="">—</option>
                            <option value="ver">{LEVEL_LABELS.ver}</option>
                            {canLoadData(tool.id) && <option value="cargar">{LEVEL_LABELS.cargar}</option>}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visible.length && <p className="access-empty">Nadie coincide con la búsqueda.</p>}
        </div>}
      </section>
      <section className="admin-card">
        <div className="card-heading"><div><h2><History size={19} /> Historial</h2><p>Últimos cambios de acceso.</p></div></div>
        {history.length ? <ul className="access-history">{history.map((change, index) => (
          <li key={`${change.at}-${index}`}><time>{dateTime.format(new Date(change.at))}</time><span><strong>{change.target}</strong> · {describe(change)}</span><small>por {change.actor}</small></li>
        ))}</ul> : <p className="access-empty">Todavía no hay cambios registrados.</p>}
      </section>
    </div>
  );
}
