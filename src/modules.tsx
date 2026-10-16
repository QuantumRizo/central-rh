import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { BriefcaseBusiness, ClipboardCheck, Clock3, FileSignature, UserRound, Users, type LucideIcon } from "lucide-react";
import type { Option } from "./components/Picker";
import { AdminDashboard } from "./timesheets/admin/AdminDashboard";
import { TimesheetsModule } from "./timesheets/TimesheetsModule";
import type { useTimesheetDraft } from "./timesheets/useTimesheetDraft";
import { EvaluacionesModule } from "./evaluaciones/EvaluacionesModule";
import { Profile } from "./profile/Profile";
import { ProfilesDirectory } from "./profile/ProfilesDirectory";
import { ChangePassword } from "./profile/ChangePassword";
import { RecruitmentModule } from "./recruitment/RecruitmentModule";
import { SignaturesModule } from "./signatures/SignaturesModule";
import { ToolsModule } from "./tools/ToolsModule";
import { TOOLS } from "./tools/catalog";

export type Access = { admin: boolean; canViewTimesheetReports: boolean; toolmaster: boolean };

export type ModuleContext = Access & {
  session: Session;
  employee: string;
  clients: Option[];
  activities: Option[];
  draft: ReturnType<typeof useTimesheetDraft>;
  navigate: (path: string) => void;
};

export type AppModule = {
  /** Ruta en el navegador; también identifica al módulo. */
  path: string;
  /** Nombre para el reporte de errores. */
  name: string;
  /** Sección de la barra lateral; sin ella, la pantalla no aparece en el menú (subpantallas). */
  section?: (typeof SECTIONS)[number];
  label?: string;
  icon?: LucideIcon;
  /** Opción del menú que se marca activa cuando la pantalla es una subpantalla. */
  parent?: string;
  visible: (access: Access) => boolean;
  render: (ctx: ModuleContext) => ReactNode;
};

const everyone = () => true;
const adminOnly = (a: Access) => a.admin;

// Un módulo nuevo = una entrada aquí. El orden es el de la barra lateral.
export const MODULES: AppModule[] = [
  { path: "/timesheets", name: "timesheets", section: "RH", label: "Timesheets", icon: Clock3, visible: everyone,
    render: (c) => <TimesheetsModule employee={c.employee} admin={c.admin} canViewTimesheetReports={c.canViewTimesheetReports} onReports={() => c.navigate("/timesheets/reportes")} clients={c.clients} activities={c.activities} draft={c.draft} /> },
  { path: "/timesheets/reportes", name: "timesheets (panel admin)", parent: "/timesheets", visible: (a) => a.canViewTimesheetReports,
    render: (c) => <AdminDashboard canEdit={c.admin} onBack={() => c.navigate("/timesheets")} /> },
  { path: "/evaluaciones", name: "evaluaciones", section: "RH", label: "Evaluaciones", icon: ClipboardCheck, visible: everyone,
    render: (c) => <EvaluacionesModule employeeId={c.employee} isAdmin={c.admin} /> },
  { path: "/perfil", name: "perfil", section: "RH", label: "Mi perfil", icon: UserRound, visible: everyone,
    render: (c) => <Profile session={c.session} employeeId={c.employee} viewerEmployeeId={c.employee} isAdmin={c.admin} onEvaluations={() => c.navigate("/evaluaciones")} onChangePassword={() => c.navigate("/perfil/contrasena")} /> },
  { path: "/perfil/contrasena", name: "cambiar-contrasena", parent: "/perfil", visible: everyone,
    render: (c) => <ChangePassword session={c.session} onBack={() => c.navigate("/perfil")} /> },
  { path: "/perfiles", name: "perfiles", section: "RH", label: "Perfiles", icon: Users, visible: adminOnly,
    render: (c) => <ProfilesDirectory session={c.session} viewerEmployeeId={c.employee} isAdmin={c.admin} onEvaluations={() => c.navigate("/evaluaciones")} onChangePassword={() => c.navigate("/perfil/contrasena")} /> },
  { path: "/reclutamiento", name: "reclutamiento", section: "RH", label: "Reclutamiento", icon: BriefcaseBusiness, visible: adminOnly,
    render: () => <RecruitmentModule /> },
  { path: "/firmas", name: "firmas", section: "RH", label: "Firmas y convenios", icon: FileSignature, visible: adminOnly,
    render: () => <SignaturesModule /> },
  ...TOOLS.map((tool): AppModule => ({
    path: `/tools/${tool.id}`, name: `tools: ${tool.id}`, section: tool.section, label: tool.label, icon: tool.icon,
    visible: (a) => a.toolmaster, render: () => <ToolsModule tool={tool} />,
  })),
];

export const DEFAULT_PATH = "/timesheets";
export const SECTIONS = ["RH", "Simi", "CN Tools"] as const;
