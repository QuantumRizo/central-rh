import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { sb } from "../lib/supabase";
import { TOOLS } from "../tools/catalog";
import { LEVEL_LABELS, ROLE_LABELS, type ToolLevel } from "./levels";

type Access = { role: string; superadmin: boolean; tools: Record<string, ToolLevel> };

// Tarjeta "Accesos" del perfil. La función sólo responde para el propio perfil o para el
// super admin; con cualquier otro perfil no se muestra nada.
export function ProfileAccess({ employeeId }: { employeeId: string }) {
  const [access, setAccess] = useState<Access | null>(null);

  useEffect(() => {
    if (!employeeId) return;
    let active = true;
    (async () => {
      const { data } = await sb.rpc("employee_access", { target_employee: employeeId });
      if (active) setAccess(((data ?? []) as Access[])[0] ?? null);
    })();
    return () => { active = false; };
  }, [employeeId]);

  if (!access) return null;
  const tools = access.superadmin ? TOOLS : TOOLS.filter((tool) => access.tools[tool.id]);
  return (
    <section className="profile-card profile-access-card">
      <div className="profile-card-title"><KeyRound size={19} /><h2>Accesos</h2></div>
      <p className="profile-access-role">Rol en RH: <strong>{access.superadmin ? "Super admin" : ROLE_LABELS[access.role] ?? access.role}</strong></p>
      {tools.length ? (
        <ul className="profile-access-tools">
          {tools.map((tool) => (
            <li key={tool.id}><span>{tool.label}</span><small>{tool.section} · {access.superadmin ? "Todo" : LEVEL_LABELS[access.tools[tool.id]]}</small></li>
          ))}
        </ul>
      ) : <p className="profile-empty">Sin herramientas de Simi ni CN Tools.</p>}
    </section>
  );
}
