import { useCallback, useEffect, useState } from "react";

const current = () => window.location.pathname.replace(/\/+$/, "") || "/";

/**
 * Ruta del navegador sin dependencias. `navigate` agrega una entrada al historial;
 * `replace` la sustituye (para corregir rutas sin permiso o desconocidas).
 * `canLeave` se consulta también con los botones atrás/adelante del navegador.
 */
export function usePath(canLeave: () => boolean) {
  const [path, setPath] = useState(current);
  useEffect(() => {
    const onPop = () => {
      const next = current();
      if (next !== path && !canLeave()) {
        window.history.pushState(null, "", path);
        return;
      }
      setPath(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [path, canLeave]);
  const navigate = useCallback((to: string) => {
    if (to !== current()) window.history.pushState(null, "", to);
    setPath(to);
  }, []);
  const replace = useCallback((to: string) => {
    window.history.replaceState(null, "", to + window.location.hash);
    setPath(to);
  }, []);
  return { path, navigate, replace };
}
