import { useCallback, useEffect, useMemo, useState } from "react";
import { History, KeyRound, Search } from "lucide-react";
import { sb } from "../lib/supabase";
import { TOOLS } from "../tools/catalog";
import { LEVEL_LABELS, ROLE_LABELS, canLoadData, type ToolLevel } from "./levels";

type Person = { user_id: string; employee_id: string | null; full_name: string; email: string; role: string; superadmin: boolean; tools: Record<string, ToolLevel> };
type Change = { at: string; actor: string; target: string; kind: "tool" | "role"; item: string | null; before: string | null; after: string | null };

const SECTIONS = [...new Set(TOOLS.map((tool) => tool.section))];
const toolLabel = (id: string | null) => TOOLS.find((tool) => tool.id === id)?.label ?? id ?? "";
const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

function describe(change: Change) {
  if (change.kind === "role") return `rol: ${ROLE_LABELS[change.before ?? "collaborator"] ?? change.before} → ${ROLE_LABELS[change.after ?? ""] ?? change.after}`;
  const level = (value: string | null) => (value ? LEVEL_LABELS[value as ToolLevel] : "sin acceso");
  return `${toolLabel(change.item)}: ${level(change.before)} → ${level(change.after)}`;
}

// Sólo para el super admin. El rol decide los módulos de RH; el nivel de cada herramienta, qué
// abre de Simi y CN Tools. Cada cambio se guarda al momento (las funciones vuelven a comprobar
// el permiso) y queda en el historial.
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

  async function save(key: string, update: (p: Person) => Person, call: () => PromiseLike<{ error: { message: string } | null }>, userId: string) {
    const before = people.find((p) => p.user_id === userId);
    if (!before) return;
    setSaving(key);
    setError("");
    setPeople((current) => current.map((p) => (p.user_id === userId ? update(p) : p)));
    const { error } = await call();
    if (error) {
      setPeople((current) => current.map((p) => (p.user_id === userId ? before : p)));
      setError(`No se guardó el cambio: ${error.message}`);
    } else await loadHistory();
    setSaving("");
  }

  function setLevel(person: Person, toolId: string, value: string) {
    const level = (value || null) as ToolLevel | null;
    void save(`${person.user_id}:${toolId}`, (p) => {
      const tools = { ...p.tools };
      if (level) tools[toolId] = level; else delete tools[toolId];
      return { ...p, tools };
    }, () => sb.rpc("set_tool_access", { target_user: person.user_id, tool: toolId, new_level: level }), person.user_id);
  }

  function setRole(person: Person, role: string) {
    if (role === "admin" && !window.confirm(`${person.full_name} podrá administrar todo RH: perfiles, reclutamiento, firmas, evaluaciones y timesheets de todos. ¿Continuar?`)) return;
    void save(`${person.user_id}:role`, (p) => ({ ...p, role }), () => sb.rpc("set_user_role", { target_user: person.user_id, new_role: role }), person.user_id);
  }

  const withTools = people.filter((p) => p.superadmin || Object.keys(p.tools).length).length;

  return (
    <div className="access-module">
      <div className="page-header"><div><p className="eyebrow">CONFIGURACIÓN</p><h1>Accesos</h1><p>El rol decide los módulos de RH; el nivel de cada herramienta, qué puede abrir de Simi y CN Tools.</p></div></div>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="admin-card">
        <div className="card-heading">
          <div><h2><KeyRound size={19} /> Rol y herramientas por persona</h2><p>{busy ? "Cargando…" : `${withTools} de ${people.length} personas tienen alguna herramienta. Los cambios se guardan al elegir.`}</p></div>
        </div>
        <dl className="access-legend">
          <div><dt>Admin</dt><dd>Todo RH: perfiles, reclutamiento, firmas, evaluaciones y timesheets de todos.</dd></div>
          <div><dt>Admin timesheets</dt><dd>Consulta los reportes de timesheets.</dd></div>
          <div><dt>Ver y cargar</dt><dd>En los dashboards de Simi, además de verlos, sube su Excel en el /admin.</dd></div>
        </dl>
        <label className="access-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar persona" aria-label="Buscar persona" /></label>
        {!busy && <div className="access-table-wrap">
          <table className="access-table">
            <thead>
              <tr>
                <th rowSpan={2} scope="col">Persona</th>
                <th rowSpan={2} scope="col" className="access-role-head">Rol en RH</th>
                {SECTIONS.map((section) => <th key={section} scope="colgroup" colSpan={TOOLS.filter((t) => t.section === section).length} className="access-section">{section}</th>)}
              </tr>
              <tr>{TOOLS.map((tool) => <th key={tool.id} scope="col" className="access-tool">{tool.label}</th>)}</tr>
            </thead>
            <tbody>
              {visible.map((person) => {
                const self = person.user_id === selfUserId;
                return (
                  <tr key={person.user_id}>
                    <th scope="row">
                      <strong>{person.full_name}</strong>
                      <span>{person.email}{person.superadmin ? " · Super admin" : ""}</span>
                    </th>
                    <td>
                      <select className="access-select" value={person.role} disabled={self || saving === `${person.user_id}:role`}
                        title={self ? "No puedes cambiar tu propio rol" : undefined} aria-label={`Rol de ${person.full_name}`}
                        onChange={(event) => setRole(person, event.target.value)}>
                        {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </td>
                    {TOOLS.map((tool) => {
                      const level = person.superadmin ? "cargar" : person.tools[tool.id] ?? "";
                      return (
                        <td key={tool.id} className="access-cell">
                          <select className={`access-select ${level ? "is-on" : ""}`} value={person.superadmin && !canLoadData(tool.id) ? "ver" : level}
                            disabled={person.superadmin || saving === `${person.user_id}:${tool.id}`}
                            title={person.superadmin ? "El super admin tiene todo" : undefined}
                            aria-label={`${person.full_name}: ${tool.label}`} onChange={(event) => setLevel(person, tool.id, event.target.value)}>
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
        <div className="card-heading"><div><h2><History size={19} /> Historial</h2><p>Últimos cambios de rol y de acceso.</p></div></div>
        {history.length ? <ul className="access-history">{history.map((change, index) => (
          <li key={`${change.at}-${index}`}><time>{dateTime.format(new Date(change.at))}</time><span><strong>{change.target}</strong> · {describe(change)}</span><small>por {change.actor}</small></li>
        ))}</ul> : <p className="access-empty">Todavía no hay cambios registrados.</p>}
      </section>
    </div>
  );
}
