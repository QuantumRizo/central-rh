import { BarChart3, Images, MapPinned, Radio, Target, Tv, Wallet, type LucideIcon } from "lucide-react";

// Sitios de Vercel donde viven hoy las herramientas. Si cambia un dominio, basta con definir
// la variable correspondiente en Vercel (y en el .env local); las rutas se arman solas.
const SITES = {
  simi: import.meta.env.VITE_SIMI_DASHBOARDS_URL || "https://dashboards-cn-partners.vercel.app",
  cnTools: import.meta.env.VITE_CN_TOOLS_URL || "https://cn-tools.vercel.app",
};

/** Sitios a los que la Plataforma entrega un pase de sesión (/sso). Ningún otro origen lo recibe. */
export const TOOL_ORIGINS = new Set(Object.values(SITES).map((site) => new URL(site).origin));

const url = (site: keyof typeof SITES, path: string) => `${SITES[site].replace(/\/+$/, "")}${path}`;

// Herramientas de Simi y CN Tools. La barra lateral las abre directo en otra pestaña; cada sitio
// toma la sesión de la Plataforma por /sso (src/sso.ts), sin pedir otro login.
export type Tool = {
  id: string;
  label: string;
  /** Sección de la barra lateral. */
  section: "Simi" | "CN Tools" | "Clientes";
  group: string;
  description: string;
  icon: LucideIcon;
  url: string;
};

export const TOOLS: Tool[] = [
  // Lo ve el cliente de CN Sika: el sitio de Simi lo muestra sin la franja de Plataforma Central.
  { id: "sika", label: "Sika", section: "Clientes", group: "Sika", icon: Images,
    description: "Campañas digitales de Sika: YouTube, Programmatic y Meta, con sus testigos.",
    url: url("simi", "/sika") },
  // Igual que Sika: lo ve el cliente (Senosiain).
  { id: "senosiain", label: "Senosiain", section: "Clientes", group: "Senosiain", icon: Images,
    description: "Campañas digitales de Senosiain: YouTube, Meta, TikTok y Programmatic, con sus testigos.",
    url: url("simi", "/senosiain") },
  { id: "street-planner", label: "Street Planner", section: "Simi", group: "Farmacias Similares", icon: MapPinned,
    description: "Sitios OOH, farmacias e impactos por estado, ciudad y radio.",
    url: url("simi", "/street-planner") },
  { id: "inversion", label: "Inversión", section: "Simi", group: "Farmacias Similares", icon: Wallet,
    description: "Inversión de Farmacias Similares por área, marca y medio.",
    url: url("simi", "/inversion") },
  { id: "competencia", label: "Competencia", section: "Simi", group: "Farmacias Similares", icon: Tv,
    description: "Inversión y spots de la competencia en TV y radio.",
    url: url("simi", "/competencia") },
  { id: "alcance", label: "Curvas de alcance", section: "CN Tools", group: "Planeación de medios", icon: Target,
    description: "Alcance de un plan por inversión y duplicidad de audiencias entre medios.",
    url: url("cnTools", "/alcance") },
  { id: "flow", label: "Flow comercial", section: "CN Tools", group: "Comercial", icon: BarChart3,
    description: "Venta, ingreso y márgenes de las campañas por cliente (Flow SIKA).",
    url: url("cnTools", "/flow") },
  // Vive en el sitio de los dashboards de Simi, pero es una herramienta de Central de Negocios.
  { id: "planeador-radio", label: "Planeador de radio", section: "CN Tools", group: "Planeación de medios", icon: Radio,
    description: "Rating por target de las emisoras de cada plaza y peso de las emisoras elegidas (INRA).",
    url: url("simi", "/planeador-radio") },
];
