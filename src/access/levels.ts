// Nombres de roles y niveles de acceso, compartidos por la pantalla de Accesos y el perfil.
export type ToolLevel = "ver" | "cargar";

export const ROLE_LABELS: Record<string, string> = { collaborator: "Colaborador", timesheet_admin: "Admin timesheets", admin: "Admin" };
export const LEVEL_LABELS: Record<ToolLevel, string> = { ver: "Ver", cargar: "Ver y cargar" };

// Sólo los dashboards de Simi tienen /admin para subir su Excel (public.user_can_load).
const LOADABLE = new Set(["street-planner", "inversion", "competencia", "planeador-radio"]);
export const canLoadData = (toolId: string) => LOADABLE.has(toolId);
