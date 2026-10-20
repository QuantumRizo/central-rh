import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { sb } from "../lib/supabase";
import { TOOLS } from "../tools/catalog";
import { LEVEL_LABELS, RH_MODULES, moduleLevelLabel, type ToolLevel } from "./levels";

type Access = { superadmin: boolean; modules: Record<string, string>; tools: Record<string, ToolLevel> };

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
  const modules = RH_MODULES.filter((m) => access.superadmin || access.modules[m.id]);
  const tools = access.superadmin ? TOOLS : TOOLS.filter((tool) => access.tools[tool.id]);
  const items = [
    ...modules.map((m) => ({ key: m.id, label: m.label, detail: `RH · ${access.superadmin ? "Todo" : moduleLevelLabel(m.id, access.modules[m.id])}` })),
    ...tools.map((t) => ({ key: t.id, label: t.label, detail: `${t.section} · ${access.superadmin ? "Todo" : LEVEL_LABELS[access.tools[t.id]]}` })),
  ];
  return (
    <section className="profile-card profile-access-card">
      <div className="profile-card-title"><KeyRound size={19} /><h2>Accesos</h2></div>
      {access.superadmin && <p className="profile-access-role"><strong>Super admin</strong>: administra los accesos de todos.</p>}
      {items.length ? (
        <ul className="profile-access-tools">
          {items.map((item) => <li key={item.key}><span>{item.label}</span><small>{item.detail}</small></li>)}
        </ul>
      ) : <p className="profile-empty">Usa sus propios timesheets, evaluaciones y perfil; sin módulos de administración ni herramientas.</p>}
    </section>
  );
}
