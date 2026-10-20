// Niveles de acceso, compartidos por la barra lateral, la pantalla de Accesos y el perfil.
// Deben coincidir con public.module_access y public.tool_access (migraciones 202610191001 y 202610192001).

export type ToolLevel = "ver" | "cargar";
export const LEVEL_LABELS: Record<ToolLevel, string> = { ver: "Ver", cargar: "Ver y cargar" };

// Sólo los dashboards de Simi tienen /admin para subir su Excel (public.user_can_load).
const LOADABLE = new Set(["street-planner", "inversion", "competencia", "planeador-radio"]);
export const canLoadData = (toolId: string) => LOADABLE.has(toolId);

export type ModuleId = "timesheets" | "evaluaciones" | "perfiles" | "reclutamiento" | "firmas";
export type ModuleLevel = "ver" | "reportes" | "admin";

/** Módulos de RH con niveles. Todos usan Timesheets, Evaluaciones y su perfil sin necesitar nada aquí. */
export const RH_MODULES: { id: ModuleId; label: string; levels: { value: ModuleLevel; label: string; help: string }[] }[] = [
  { id: "timesheets", label: "Timesheets", levels: [
    { value: "reportes", label: "Reportes", help: "Consulta los reportes de todos" },
    { value: "admin", label: "Admin", help: "Además edita timesheets de otros" },
  ] },
  { id: "evaluaciones", label: "Evaluaciones", levels: [{ value: "admin", label: "Admin", help: "Ciclos, preguntas, asignaciones y reportes finales" }] },
  { id: "perfiles", label: "Perfiles", levels: [
    { value: "ver", label: "Ver", help: "Directorio y perfiles de todos" },
    { value: "admin", label: "Admin", help: "Además los edita" },
  ] },
  { id: "reclutamiento", label: "Reclutamiento", levels: [{ value: "admin", label: "Admin", help: "Vacantes y candidatos" }] },
  { id: "firmas", label: "Firmas y convenios", levels: [{ value: "admin", label: "Admin", help: "Registro de firmas, PDFs y el Excel original de RH" }] },
];

/** ¿Alcanza el nivel que tiene para lo que pide? "admin" incluye a los demás. */
export const meets = (has: string | undefined, min: ModuleLevel) => has === min || has === "admin";

export const moduleLevelLabel = (module: ModuleId, level: string) =>
  RH_MODULES.find((m) => m.id === module)?.levels.find((l) => l.value === level)?.label ?? level;

/** Plantillas para llenar una fila de golpe en Accesos. */
export const TEMPLATES: { id: string; label: string; modules: Partial<Record<ModuleId, ModuleLevel>> }[] = [
  { id: "colaborador", label: "Colaborador (sin módulos de RH)", modules: {} },
  { id: "reportes", label: "Reportes de timesheets", modules: { timesheets: "reportes" } },
  { id: "rh", label: "Admin RH completo", modules: { timesheets: "admin", evaluaciones: "admin", perfiles: "admin", reclutamiento: "admin", firmas: "admin" } },
];
