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

export function Workspace({ session }: { session: Session }) {
  const [employee, setEmployee] = useState("");
  const [role, setRole] = useState("collaborator");
  const [toolmaster, setToolmaster] = useState(false);
  const [accessReady, setAccessReady] = useState(false);
  const [clients, setClients] = useState<Option[]>([]);
  const [activities, setActivities] = useState<Option[]>([]);
  const draft = useTimesheetDraft(employee);
  const { canLeave, setError, setBusy } = draft;
  const { path, navigate, replace } = usePath(canLeave);
  const admin = role === "admin";
  const access: Access = { admin, canViewTimesheetReports: admin || role === "timesheet_admin", toolmaster };
  const visible = MODULES.filter((module) => module.visible(access));
  const active = visible.find((module) => module.path === path) ?? visible.find((module) => module.path === DEFAULT_PATH)!;
  const activeNav = active.parent ?? active.path;
  useEffect(() => {
    (async () => {
      try {
        const results = await Promise.all([
          sb.rpc("my_employee_id"),
          sb
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .maybeSingle(),
          sb.from("clients").select("id,name").eq("active", true).order("name"),
          sb
            .from("activities")
            .select("id,name")
            .eq("active", true)
            .order("name"),
          sb.rpc("is_toolmaster"),
        ]);
        for (const r of results) if (r.error) throw r.error;
        setEmployee(results[0].data || "");
        setRole(results[1].data?.role || "collaborator");
        setClients(
          (results[2].data || []).filter(
            (client) => !HIDDEN_CLIENTS.has(client.name),
          ),
        );
        setActivities(results[3].data || []);
        setToolmaster(results[4].data === true);
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
          <div><strong>Plataforma RH</strong></div>
        </div>
        {SECTIONS.map((section) => {
          const items = visible.filter((module) => module.section === section);
          if (!items.length) return null;
          return <Fragment key={section}>
            <p className="sidebar-section-label">{section}</p>
            <nav className="module-nav" aria-label={section}>
              {items.map(({ path: to, label, icon: Icon }) => <button key={to} className={activeNav === to ? "active" : ""} onClick={() => go(to)}>
                {Icon && <Icon size={18} />} <span>{label}</span>
              </button>)}
            </nav>
          </Fragment>;
        })}
        <div className="sidebar-footer">
          <div className="sidebar-user"><div>{access.canViewTimesheetReports && <span className="admin-badge">{admin ? "Superadmin" : "Admin timesheets"}</span>}</div><strong>{session.user.email}</strong></div>
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
