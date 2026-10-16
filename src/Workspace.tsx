import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { BriefcaseBusiness, ClipboardCheck, Clock3, FileSignature, LogOut, UserRound, Users } from "lucide-react";
import { AdminDashboard } from "./timesheets/admin/AdminDashboard";
import { TimesheetsModule } from "./timesheets/TimesheetsModule";
import { useTimesheetDraft } from "./timesheets/useTimesheetDraft";
import type { Option } from "./components/Picker";
import { EvaluacionesModule } from "./evaluaciones/EvaluacionesModule";
import { Profile } from "./profile/Profile";
import { ProfilesDirectory } from "./profile/ProfilesDirectory";
import { ChangePassword } from "./profile/ChangePassword";
import { RecruitmentModule } from "./recruitment/RecruitmentModule";
import { SignaturesModule } from "./signatures/SignaturesModule";
import { BugReporter } from "./bug-reporter/BugReporter";
import { ToolsModule } from "./tools/ToolsModule";
import { TOOLS } from "./tools/catalog";
import { sb } from "./lib/supabase";
import { HIDDEN_CLIENTS } from "./timesheets/utils";

export function Workspace({ session }: { session: Session }) {
  const [employee, setEmployee] = useState("");
  const [role, setRole] = useState("collaborator");
  const [clients, setClients] = useState<Option[]>([]);
  const [activities, setActivities] = useState<Option[]>([]);
  const [reports, setReports] = useState(false);
  const [toolmaster, setToolmaster] = useState(false);
  const [activeModule, setActiveModule] = useState<"timesheets" | "evaluaciones" | "perfil" | "perfiles" | "reclutamiento" | "firmas" | "cambiar-contrasena" | `tool:${string}`>("timesheets");
  const activeTool = toolmaster ? TOOLS.find((tool) => activeModule === `tool:${tool.id}`) : undefined;
  const draft = useTimesheetDraft(employee);
  const { canLeave, setError, setBusy } = draft;
  const admin = role === "admin";
  const canViewTimesheetReports = admin || role === "timesheet_admin";
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
        // Sin el permiso (o antes de aplicar su migración) la sección Tools no aparece.
        const tools = await sb.rpc("is_toolmaster");
        setToolmaster(tools.data === true);
        if (!results[0].data)
          throw Error("Tu cuenta no tiene un colaborador vinculado");
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
      }
    })();
  }, [session.user.id]);
  return (
    <main className="app">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <img className="cn-header-logo" src="/Logo_CN_2025_Negro.webp" alt="Central MX" />
          <div><strong>Plataforma RH</strong></div>
        </div>
        <p className="sidebar-section-label">Módulos</p>
        <nav className={`module-nav ${admin ? 'has-profiles' : ''}`} aria-label="Módulos">
          <button
            className={activeModule === "timesheets" ? "active" : ""}
            onClick={() => { if (canLeave()) { setActiveModule("timesheets"); setReports(false); } }}
          >
            <Clock3 size={18} /> <span>Timesheets</span>
          </button>
          <button
            className={activeModule === "evaluaciones" ? "active" : ""}
            onClick={() => { if (canLeave()) { setActiveModule("evaluaciones"); setReports(false); } }}
          >
            <ClipboardCheck size={18} /> <span>Evaluaciones</span>
          </button>
          <button
            className={activeModule === "perfil" ? "active" : ""}
            onClick={() => { if (canLeave()) { setActiveModule("perfil"); setReports(false); } }}
          >
            <UserRound size={18} /> <span>Mi perfil</span>
          </button>
          {admin && <button
            className={activeModule === "perfiles" ? "active" : ""}
            onClick={() => { if (canLeave()) { setActiveModule("perfiles"); setReports(false); } }}
          >
            <Users size={18} /> <span>Perfiles</span>
          </button>}
          {admin && <button
            className={activeModule === "reclutamiento" ? "active" : ""}
            onClick={() => { if (canLeave()) { setActiveModule("reclutamiento"); setReports(false); } }}
          >
            <BriefcaseBusiness size={18} /> <span>Reclutamiento</span>
          </button>}
          {admin && <button
            className={activeModule === "firmas" ? "active" : ""}
            onClick={() => { if (canLeave()) { setActiveModule("firmas"); setReports(false); } }}
          >
            <FileSignature size={18} /> <span>Firmas y convenios</span>
          </button>}
        </nav>
        {toolmaster && <>
          <p className="sidebar-section-label">Tools</p>
          <nav className="module-nav" aria-label="Tools">
            {TOOLS.map(({ id, label, icon: Icon }) => <button
              key={id}
              className={activeModule === `tool:${id}` ? "active" : ""}
              onClick={() => { if (canLeave()) { setActiveModule(`tool:${id}`); setReports(false); } }}
            >
              <Icon size={18} /> <span>{label}</span>
            </button>)}
          </nav>
        </>}
        <div className="sidebar-footer">
          <div className="sidebar-user"><div>{canViewTimesheetReports && <span className="admin-badge">{admin ? "Superadmin" : "Admin timesheets"}</span>}</div><strong>{session.user.email}</strong></div>
          <div className="sidebar-user-actions"><button title="Salir" className="sidebar-logout" onClick={() => { if (canLeave()) sb.auth.signOut(); }}><LogOut size={17} /></button></div>
        </div>
      </aside>
      <section className="content">
        {activeTool ? (
          <ToolsModule tool={activeTool} />
        ) : activeModule === "perfiles" && admin ? (
          <ProfilesDirectory session={session} viewerEmployeeId={employee} isAdmin={admin} onEvaluations={() => setActiveModule("evaluaciones")} onChangePassword={() => setActiveModule("cambiar-contrasena")} />
        ) : activeModule === "reclutamiento" && admin ? (
          <RecruitmentModule />
        ) : activeModule === "firmas" && admin ? (
          <SignaturesModule />
        ) : activeModule === "cambiar-contrasena" ? (
          <ChangePassword session={session} onBack={() => setActiveModule("perfil")} />
        ) : activeModule === "perfil" ? (
          <Profile session={session} employeeId={employee} viewerEmployeeId={employee} isAdmin={admin} onEvaluations={() => setActiveModule("evaluaciones")} onChangePassword={() => setActiveModule("cambiar-contrasena")} />
        ) : activeModule === "evaluaciones" ? (
          <EvaluacionesModule employeeId={employee} isAdmin={admin} />
        ) : reports && canViewTimesheetReports ? (
          <AdminDashboard canEdit={admin} onBack={() => setReports(false)} />
        ) : (
          <TimesheetsModule employee={employee} admin={admin} canViewTimesheetReports={canViewTimesheetReports} onReports={() => setReports(true)} clients={clients} activities={activities} draft={draft} />
        )}
      </section>
      <BugReporter module={reports && activeModule === "timesheets" ? "timesheets (panel admin)" : activeModule} />
    </main>
  );
}
