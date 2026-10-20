import { Fragment, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import { useTimesheetDraft } from "./timesheets/useTimesheetDraft";
import type { Option } from "./components/Picker";
import { BugReporter } from "./bug-reporter/BugReporter";
import { sb } from "./lib/supabase";
import { usePath } from "./lib/router";
import { DEFAULT_PATH, MODULES, SECTIONS, type Access } from "./modules";
import { HIDDEN_CLIENTS } from "./timesheets/utils";
import { meets } from "./access/levels";

export function Workspace({ session }: { session: Session }) {
  const [employee, setEmployee] = useState("");
  const [modules, setModules] = useState<Record<string, string>>({});
  const [tools, setTools] = useState<string[]>([]);
  const [accessReady, setAccessReady] = useState(false);
  const [clients, setClients] = useState<Option[]>([]);
  const [activities, setActivities] = useState<Option[]>([]);
  const draft = useTimesheetDraft(employee);
  const { canLeave, setError, setBusy } = draft;
  const { path, navigate, replace } = usePath(canLeave);
  const superadmin = tools.includes("*");
  const access: Access = {
    superadmin,
    can: (module, level) => meets(modules[module], level),
    hasTool: (toolId) => superadmin || tools.includes(toolId),
  };
  const levels = Object.values(modules);
  const visible = MODULES.filter((module) => module.visible(access));
  const active = visible.find((module) => module.path === path) ?? visible.find((module) => module.path === DEFAULT_PATH)!;
  const activeNav = active.parent ?? active.path;
  useEffect(() => {
    (async () => {
      try {
        const results = await Promise.all([
          sb.rpc("my_employee_id"),
          sb.rpc("my_modules"),
          sb.from("clients").select("id,name").eq("active", true).order("name"),
          sb
            .from("activities")
            .select("id,name")
            .eq("active", true)
            .order("name"),
          sb.rpc("my_tools"),
        ]);
        for (const r of results) if (r.error) throw r.error;
        setEmployee(results[0].data || "");
        setModules((results[1].data as Record<string, string> | null) ?? {});
        setClients(
          (results[2].data || []).filter(
            (client) => !HIDDEN_CLIENTS.has(client.name),
          ),
        );
        setActivities(results[3].data || []);
        setTools((results[4].data as string[] | null) ?? []);
        setAccessReady(true);
        if (!results[0].data)
          throw Error("Tu cuenta no tiene un colaborador vinculado");
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
      }
    })();
  }, [session.user.id]);
  // Una ruta desconocida o sin permiso se corrige cuando ya se conocen los permisos.
  useEffect(() => {
    if (accessReady && active.path !== path) replace(active.path);
  }, [accessReady, active.path, path, replace]);
  const go = (to: string) => { if (to !== path && canLeave()) navigate(to); };
  return (
    <main className="app">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <img className="cn-header-logo" src="/Logo_CN_2025_Negro.webp" alt="Central MX" />
          <div><strong>Plataforma Central</strong></div>
        </div>
        {SECTIONS.map((section) => {
          const items = visible.filter((module) => module.section === section);
          if (!items.length) return null;
          return <Fragment key={section}>
            <p className="sidebar-section-label">{section}</p>
            <nav className="module-nav" aria-label={section}>
              {items.map(({ path: to, label, icon: Icon, href }) => href ? <a key={to} href={href} target="_blank" rel="noopener" title={`Abrir ${label} en otra pestaña`}>
                {Icon && <Icon size={18} />} <span>{label}</span>
              </a> : <button key={to} className={activeNav === to ? "active" : ""} onClick={() => go(to)}>
                {Icon && <Icon size={18} />} <span>{label}</span>
              </button>)}
            </nav>
          </Fragment>;
        })}
        <div className="sidebar-footer">
          <div className="sidebar-user"><div>{levels.length > 0 && <span className="admin-badge">{superadmin ? "Super admin" : levels.includes("admin") ? "Admin" : "Reportes"}</span>}</div><strong>{session.user.email}</strong></div>
          <div className="sidebar-user-actions"><button title="Salir" className="sidebar-logout" onClick={() => { if (canLeave()) sb.auth.signOut(); }}><LogOut size={17} /></button></div>
        </div>
      </aside>
      <section className="content">
        {active.render({ ...access, session, employee, clients, activities, draft, navigate: go })}
      </section>
      <BugReporter module={active.name} />
    </main>
  );
}
