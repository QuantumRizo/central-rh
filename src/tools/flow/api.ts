// Flow comercial: tipos, fórmulas y cliente de la Edge Function `flow` (código en alcance-app).
// Las fórmulas son las de la tabla FlowSika del Excel y las medidas del Power BI.
// La vista flow.campanas_calculadas (db/flow.sql) repite estas mismas fórmulas en SQL:
// si cambias una, cambia la otra.

import { sb } from "../../lib/supabase";


export const STATUS = ["Ganada", "En pitch", "Proyección", "No ganada", "Cancelada"] as const;
export const PROBABILIDAD = ["Alta", "Media", "Baja"] as const;

export type Campaign = {
  id: string; numero: number | null; cliente: string; campana: string; formato: string | null;
  status: string | null; probabilidad: string | null; inicio: string | null; fin: string | null;
  inversion_medios_cliente: number; medios_cxp: number; fee_produccion: number; produccion_cxp: number;
  otros_promos: number; pct_fee: number; mvd: number; neto: number; impactos: number; notas: string | null;
};

export type Computed = Campaign & {
  duracion: number | null; markUp: number; margenProduccion: number; fee: number; ventaCN: number;
  ingresoTotalCN: number; ingresoSinMvdNeto: number; enProyeccion: boolean | null; ordenStatus: number | null;
};

export function compute(c: Campaign): Computed {
  const markUp = c.inversion_medios_cliente - c.medios_cxp;
  const margenProduccion = c.fee_produccion - c.produccion_cxp;
  const fee = c.inversion_medios_cliente * c.pct_fee;
  const ventaCN = fee + c.fee_produccion + c.otros_promos + c.inversion_medios_cliente;
  const ingresoSinMvdNeto = markUp + fee + margenProduccion + c.otros_promos;
  const duracion = c.inicio && c.fin ? Math.round((Date.parse(c.fin) - Date.parse(c.inicio)) / 864e5) + 1 : null;
  const enProyeccion = !c.status ? null : ["Ganada", "No ganada", "Cancelada"].includes(c.status) ? false : c.probabilidad === "Alta" || c.probabilidad === "Media";
  const orden = STATUS.indexOf(c.status as (typeof STATUS)[number]);
  return { ...c, duracion, markUp, margenProduccion, fee, ventaCN, ingresoTotalCN: ingresoSinMvdNeto + c.mvd + c.neto,
    ingresoSinMvdNeto, enProyeccion, ordenStatus: orden < 0 ? null : orden + 1 };
}

export function sum<T>(items: T[], pick: (item: T) => number) {
  return items.reduce((total, item) => total + (pick(item) || 0), 0);
}

export const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
export const shortDate = (value: string | null) => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// La función revisa la sesión de RH y el permiso `toolmaster`; supabase-js manda el token.
async function request(query: string) {
  const { data, error } = await sb.functions.invoke(`flow${query}`, { method: "GET" });
  if (error) {
    const body = await (error.context as Response | undefined)?.json?.().catch(() => null);
    throw new Error(body?.error || "No se pudo conectar con el Flow.");
  }
  return data;
}

// Última vez que el agente del NAS leyó el Excel maestro (ver nas-sync/).
// `datos_al` es la fecha de modificación del Excel que se está mostrando.
export type SyncInfo = {
  estado: "ok" | "error"; error: string | null; avisos: string[]; archivo: string | null;
  revisado_en: string | null; datos_al: string | null;
};

export async function fetchCampaigns(): Promise<{ campanas: Campaign[]; sincronizacion: SyncInfo | null }> {
  const data = await request("");
  return { campanas: Array.isArray(data.campanas) ? data.campanas : [], sincronizacion: data.sincronizacion ?? null };
}
