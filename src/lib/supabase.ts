import { createClient } from '@supabase/supabase-js';

const ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const lastAlert = new Map<string, number>();

/** Avisa por correo (send-bug-report) cuando la API de datos responde con error de servidor. */
async function alertServerError(response: Response, method: string) {
  const { pathname, search } = new URL(response.url);
  const body = await response.clone().json().catch(() => null);
  const code = body?.code ? ` ${body.code}` : '';
  const key = `${method} ${pathname} ${response.status}${code}`;
  const now = Date.now();
  if (now - (lastAlert.get(key) ?? 0) < ALERT_COOLDOWN_MS) return;
  lastAlert.set(key, now);
  const { data } = await sb.auth.getSession();
  if (!data.session) return;
  const detail = body?.message ? `\n${String(body.message).slice(0, 300)}` : '';
  await sb.functions.invoke('send-bug-report', {
    body: {
      message: `Alerta automática: ${method} ${pathname} respondió ${response.status}${code}${detail}\n\n${search.slice(0, 400)}`,
      module: 'alerta-automatica',
      url: window.location.href,
      user_agent: navigator.userAgent,
    },
  });
}

const monitoredFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.status >= 500 && new URL(response.url).pathname.startsWith('/rest/v1/')) {
    alertServerError(response, (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()).catch(() => {});
  }
  return response;
};

export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL_PROD ||
    'https://ncgbvbpkinrvrzxyttfz.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY_PROD ||
    'sb_publishable_mG6DsF6355IRpy9TJ2ziBw_DSoVyQqE',
  { global: { fetch: monitoredFetch } },
);
