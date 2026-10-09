// Vercel Cron owns the schedule; Resend and employee data stay in Supabase.
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`)
    return res.status(401).json({ error: 'No autorizado' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Falta configurar Supabase' });

  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/send-timesheet-reminders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await response.json();
    return res.status(response.status).json(body);
  } catch (error) {
    console.error('Timesheet reminder invocation failed', error);
    return res.status(502).json({ error: 'No se pudo iniciar el recordatorio' });
  }
}
