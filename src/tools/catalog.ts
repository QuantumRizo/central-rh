import { BarChart3, MapPinned, Target, Tv, Wallet, type LucideIcon } from "lucide-react";

// Sitios de Vercel donde viven hoy las herramientas. Si cambia un dominio, basta con definir
// la variable correspondiente en Vercel (y en el .env local); las rutas se arman solas.
const SITES = {
  simi: import.meta.env.VITE_SIMI_DASHBOARDS_URL || "https://dashboards-farmacias.vercel.app",
  cnTools: import.meta.env.VITE_CN_TOOLS_URL || "https://cn-tools.vercel.app",
};

const url = (site: keyof typeof SITES, path: string) => `${SITES[site].replace(/\/+$/, "")}${path}`;

// Herramientas de la sección Tools. Cada una abre su sitio en otra pestaña.
export type Tool = {
  id: string;
  label: string;
  group: string;
  description: string;
  icon: LucideIcon;
  url: string;
};

export const TOOLS: Tool[] = [
  { id: "street-planner", label: "Street Planner", group: "Dashboards Simi", icon: MapPinned,
    description: "Sitios OOH, farmacias e impactos por estado, ciudad y radio.",
    url: url("simi", "/street-planner") },
  { id: "inversion", label: "Inversión", group: "Dashboards Simi", icon: Wallet,
    description: "Inversión de Farmacias Similares por área, marca y medio.",
    url: url("simi", "/inversion") },
  { id: "competencia", label: "Competencia", group: "Dashboards Simi", icon: Tv,
    description: "Inversión y spots de la competencia en TV y radio.",
    url: url("simi", "/competencia") },
  { id: "alcance", label: "Curvas de alcance", group: "Planeación de medios", icon: Target,
    description: "Alcance de un plan por inversión y duplicidad de audiencias entre medios.",
    url: url("cnTools", "/alcance") },
  { id: "flow", label: "Flow comercial", group: "Comercial", icon: BarChart3,
    description: "Venta, ingreso y márgenes de las campañas por cliente (Flow SIKA).",
    url: url("cnTools", "/flow") },
];
