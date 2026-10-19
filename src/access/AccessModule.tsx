import { useEffect, useMemo, useState } from "react";
import { KeyRound, Search } from "lucide-react";
import { sb } from "../lib/supabase";
import { TOOLS } from "../tools/catalog";

type Person = { user_id: string; full_name: string; email: string; role: string; superadmin: boolean; tools: string[] };

const ROLE_LABELS: Record<string, string> = { admin: "Admin", timesheet_admin: "Admin timesheets", collaborator: "Colaborador" };
const SECTIONS = [...new Set(TOOLS.map((tool) => tool.section))];

// Sólo para el super admin: quién puede abrir cada herramienta de Simi y CN Tools.
// Cada casilla guarda al momento con set_tool_access(), que vuelve a comprobar el permiso.
export function AccessModule() {
  const [people, setPeople] = useState<Person[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await sb.rpc("tool_access_matrix");
      if (error) setError(error.message);
      else setPeople((data ?? []) as Person[]);
      setBusy(false);
    })();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es-MX");
    return q ? people.filter((p) => `${p.full_name} ${p.email}`.toLocaleLowerCase("es-MX").includes(q)) : people;
  }, [people, query]);

  async function toggle(person: Person, toolId: string) {
    const allowed = !person.tools.includes(toolId);
    const key = `${person.user_id}:${toolId}`;
    const apply = (on: boolean) => setPeople((current) => current.map((p) => p.user_id !== person.user_id ? p
      : { ...p, tools: on ? [...p.tools, toolId] : p.tools.filter((t) => t !== toolId) }));
    setSaving(key);
    setError("");
    apply(allowed);
    const { error } = await sb.rpc("set_tool_access", { target_user: person.user_id, tool: toolId, allowed });
    if (error) {
      apply(!allowed);
      setError(`No se guardó el cambio: ${error.message}`);
    }
    setSaving("");
  }

  const withAccess = people.filter((p) => p.superadmin || p.tools.length).length;

  return (
    <div className="access-module">
      <div className="page-header"><div><p className="eyebrow">CONFIGURACIÓN</p><h1>Accesos</h1><p>Elige quién puede abrir cada herramienta de Simi y CN Tools. Los módulos de RH siguen dependiendo del rol.</p></div></div>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="admin-card">
        <div className="card-heading">
          <div><h2><KeyRound size={19} /> Herramientas por persona</h2><p>{busy ? "Cargando…" : `${withAccess} de ${people.length} personas tienen alguna herramienta. Los cambios se guardan al marcar.`}</p></div>
        </div>
        <label className="access-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar persona" aria-label="Buscar persona" /></label>
        {!busy && <div className="access-table-wrap">
          <table className="access-table">
            <thead>
              <tr>
                <th rowSpan={2} scope="col">Persona</th>
                {SECTIONS.map((section) => <th key={section} scope="colgroup" colSpan={TOOLS.filter((t) => t.section === section).length} className="access-section">{section}</th>)}
              </tr>
              <tr>{TOOLS.map((tool) => <th key={tool.id} scope="col" className="access-tool">{tool.label}</th>)}</tr>
            </thead>
            <tbody>
              {visible.map((person) => (
                <tr key={person.user_id}>
                  <th scope="row">
                    <strong>{person.full_name}</strong>
                    <span>{person.email} · {person.superadmin ? "Super admin" : ROLE_LABELS[person.role] ?? person.role}</span>
                  </th>
                  {TOOLS.map((tool) => {
                    const checked = person.superadmin || person.tools.includes(tool.id);
                    return (
                      <td key={tool.id} className="access-cell">
                        <input type="checkbox" checked={checked} disabled={person.superadmin || saving === `${person.user_id}:${tool.id}`}
                          title={person.superadmin ? "El super admin abre todas las herramientas" : undefined}
                          aria-label={`${person.full_name}: ${tool.label}`} onChange={() => void toggle(person, tool.id)} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && <p className="access-empty">Nadie coincide con la búsqueda.</p>}
        </div>}
      </section>
    </div>
  );
}
