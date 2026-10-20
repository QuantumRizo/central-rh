import { TOOL_ORIGINS } from "./tools/catalog";

// Inicio de sesión único: las herramientas (cn-tools, dashboards de Simi) no tienen login propio.
// Cuando no saben quién es la persona, la mandan a /sso?to=<su URL>; si hay sesión en la
// Plataforma, se regresa a esa URL con un pase (el access token, de corta vida) en el fragmento
// `#sso=`, que no viaja al servidor. Sólo se entrega a los sitios de TOOL_ORIGINS.

/** Destino válido de /sso, o null si la ruta no es /sso o el destino no es una herramienta. */
export function ssoTarget(): string | null {
  if (window.location.pathname.replace(/\/+$/, "") !== "/sso") return null;
  const to = new URLSearchParams(window.location.search).get("to");
  if (!to) return null;
  try {
    const url = new URL(to);
    return TOOL_ORIGINS.has(url.origin) && url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function returnToTool(target: string, accessToken: string) {
  const url = new URL(target);
  url.hash = `sso=${encodeURIComponent(accessToken)}`;
  window.location.replace(url.toString());
}
