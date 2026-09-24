import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character] ?? character));

const MAX_MESSAGE_LENGTH = 4000;
const DEFAULT_RECIPIENT = 'felix@centraldenegociosmx.com';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return json({ success: false, message: 'Unauthorized' }, 401);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ success: false, message: 'Unauthorized' }, 401);

    const { message, module, url, user_agent: userAgent } = await request.json();
    if (typeof message !== 'string' || !message.trim()) return json({ success: false, message: 'Escribe qué pasó antes de enviar.' }, 400);
    if (message.length > MAX_MESSAGE_LENGTH) return json({ success: false, message: `El mensaje no puede pasar de ${MAX_MESSAGE_LENGTH} caracteres.` }, 400);

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ success: false, message: 'Email service not configured' }, 500);
    const from = Deno.env.get('RESEND_FROM_EMAIL');
    if (!from) return json({ success: false, message: 'RESEND_FROM_EMAIL is not configured' }, 500);
    const to = Deno.env.get('BUG_REPORT_EMAIL') || DEFAULT_RECIPIENT;

    const { data: employee } = await adminClient
      .from('employees')
      .select('full_name,position,department')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    const reporter = employee?.full_name || user.email || 'Usuario sin nombre';
    const sentAt = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'long', timeStyle: 'short' });
    const firstLine = message.trim().split('\n')[0].slice(0, 60);
    const detail = (label: string, value: unknown) => value
      ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top">${label}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`
      : '';
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1e293b"><h2 style="color:#0b5eb7;margin:0 0 12px">Reporte de error</h2><div style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px">${escapeHtml(message.trim())}</div><table style="margin-top:16px;font-size:13px;border-collapse:collapse">${detail('Reportó', reporter)}${detail('Correo', user.email)}${detail('Puesto', [employee?.position, employee?.department].filter(Boolean).join(' · '))}${detail('Módulo', module)}${detail('URL', url)}${detail('Navegador', userAgent)}${detail('Fecha', sentAt)}</table></div>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        reply_to: user.email || undefined,
        subject: `🐞 Bug de ${reporter}: ${firstLine}`,
        html,
      }),
    });
    if (!response.ok) {
      console.error('Resend error', response.status, await response.text());
      return json({ success: false, message: 'No se pudo enviar el reporte. Intenta de nuevo en un momento.' }, 502);
    }

    return json({ success: true, message: 'Reporte enviado.' });
  } catch (error) {
    console.error(error);
    return json({ success: false, message: 'Internal error' }, 500);
  }
});
