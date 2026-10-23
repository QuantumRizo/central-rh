import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { BriefcaseBusiness, ClipboardCheck, Clock3, FileSignature, KeyRound, LayoutGrid, UserRound, Users, Wrench, type LucideIcon } from "lucide-react";
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
import { ToolsHub } from "./tools/ToolsHub";
import { AccessModule } from "./access/AccessModule";
import type { ModuleId, ModuleLevel } from "./access/levels";
import { TOOLS } from "./tools/catalog";

export type Access = {
  /** Nivel en un módulo de RH (public.module_access; el super admin tiene todo). */
  can: (module: ModuleId, level: ModuleLevel) => boolean;
  /** Administra quién abre cada herramienta (permiso `superadmin`). */
  superadmin: boolean;
  /** Herramientas que puede abrir (`public.tool_access`; el super admin, todas). */
  hasTool: (toolId: string) => boolean;
};

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
  /** Si existe, la opción del menú abre este sitio en otra pestaña en lugar de una pantalla. */
  href?: string;
  /** Opción del menú que se marca activa cuando la pantalla es una subpantalla. */
  parent?: string;
  visible: (access: Access) => boolean;
  render: (ctx: ModuleContext) => ReactNode;
};

const everyone = () => true;
const hasAny = (access: Access, section: (typeof TOOLS)[number]["section"]) => TOOLS.some((tool) => tool.section === section && access.hasTool(tool.id));

// Un módulo nuevo = una entrada aquí. El orden es el de la barra lateral.
export const MODULES: AppModule[] = [
  { path: "/timesheets", name: "timesheets", section: "RH", label: "Timesheets", icon: Clock3, visible: everyone,
    render: (c) => <TimesheetsModule employee={c.employee} admin={c.can("timesheets", "admin")} canViewTimesheetReports={c.can("timesheets", "reportes")} onReports={() => c.navigate("/timesheets/reportes")} clients={c.clients} activities={c.activities} draft={c.draft} /> },
  { path: "/timesheets/reportes", name: "timesheets (panel admin)", parent: "/timesheets", visible: (a) => a.can("timesheets", "reportes"),
    render: (c) => <AdminDashboard canEdit={c.can("timesheets", "admin")} onBack={() => c.navigate("/timesheets")} /> },
  { path: "/evaluaciones", name: "evaluaciones", section: "RH", label: "Evaluaciones", icon: ClipboardCheck, visible: everyone,
    render: (c) => <EvaluacionesModule employeeId={c.employee} isAdmin={c.can("evaluaciones", "admin")} /> },
  { path: "/perfil", name: "perfil", section: "RH", label: "Mi perfil", icon: UserRound, visible: everyone,
    render: (c) => <Profile session={c.session} employeeId={c.employee} viewerEmployeeId={c.employee} isAdmin={c.can("perfiles", "admin")} canSeeDocuments={c.can("firmas", "admin")} onEvaluations={() => c.navigate("/evaluaciones")} onChangePassword={() => c.navigate("/perfil/contrasena")} /> },
  { path: "/perfil/contrasena", name: "cambiar-contrasena", parent: "/perfil", visible: everyone,
    render: (c) => <ChangePassword session={c.session} onBack={() => c.navigate("/perfil")} /> },
  { path: "/perfiles", name: "perfiles", section: "RH", label: "Perfiles", icon: Users, visible: (a) => a.can("perfiles", "ver"),
    render: (c) => <ProfilesDirectory session={c.session} viewerEmployeeId={c.employee} isAdmin={c.can("perfiles", "admin")} canSeeDocuments={c.can("firmas", "admin")} onEvaluations={() => c.navigate("/evaluaciones")} onChangePassword={() => c.navigate("/perfil/contrasena")} /> },
  { path: "/reclutamiento", name: "reclutamiento", section: "RH", label: "Reclutamiento", icon: BriefcaseBusiness, visible: (a) => a.can("reclutamiento", "admin"),
    render: () => <RecruitmentModule /> },
  { path: "/firmas", name: "firmas", section: "RH", label: "Firmas y convenios", icon: FileSignature, visible: (a) => a.can("firmas", "admin"),
    render: () => <SignaturesModule /> },
  // Cada sección de herramientas es una sola entrada del menú que abre su página de tarjetas.
  { path: "/simi", name: "tools: simi", section: "Herramientas", label: "Dashboards Simi", icon: LayoutGrid, visible: (a) => hasAny(a, "Simi"),
    render: (c) => <ToolsHub section="Simi" title="Dashboards Simi" description="Dashboards de Farmacias Similares. Se abren en otra pestaña." hasTool={c.hasTool} /> },
  { path: "/cn-tools", name: "tools: cn-tools", section: "Herramientas", label: "Herramientas CN", icon: Wrench, visible: (a) => hasAny(a, "CN Tools"),
    render: (c) => <ToolsHub section="CN Tools" title="Herramientas CN" description="Herramientas de Central de Negocios. Se abren en otra pestaña." hasTool={c.hasTool} /> },
  ...TOOLS.map((tool): AppModule => ({
    path: `/tools/${tool.id}`, name: `tools: ${tool.id}`, parent: tool.section === "Simi" ? "/simi" : "/cn-tools",
    visible: (a) => a.hasTool(tool.id), render: () => <ToolsModule tool={tool} />,
  })),
  { path: "/configuracion/accesos", name: "accesos", section: "Configuración", label: "Accesos", icon: KeyRound, visible: (a) => a.superadmin,
    render: (c) => <AccessModule selfUserId={c.session.user.id} /> },
];

export const DEFAULT_PATH = "/timesheets";
export const SECTIONS = ["RH", "Herramientas", "Configuración"] as const;
