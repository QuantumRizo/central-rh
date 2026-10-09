import { createClient } from 'npm:@supabase/supabase-js@2';
import { eligibleStart, mexicoNow, monday, threeMonthsBefore, weekdays } from './logic.ts';

type Employee = { id: string; full_name: string; email: string | null; start_date: string | null; hire_date: string | null };
type Sheet = { employee_id: string; work_date: string };

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query(offset, offset + 499);
    if (error) throw Error(error.message);
    result.push(...(data || []));
    if ((data?.length || 0) < 500) return result;
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey || request.headers.get('Authorization') !== `Bearer ${serviceKey}`)
    return json({ error: 'Unauthorized' }, 401);

  const now = mexicoNow(new Date());
  if (now.weekday !== 'Fri' || now.hour < 15)
    return json({ error: 'Available Friday after 15:00 Mexico City time' }, 409);

  const url = Deno.env.get('SUPABASE_URL');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL');
  const appUrl = Deno.env.get('APP_URL');
  if (!url || !resendKey || !from || !appUrl || !/^https:\/\//.test(appUrl))
    return json({ error: 'Missing server configuration' }, 500);

  try {
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const fromDate = threeMonthsBefore(now.date);
    const [employees, sheets] = await Promise.all([
      allRows<Employee>((start, end) => db.from('employees')
        .select('id,full_name,email,start_date,hire_date').eq('status', 'Activo')
        .not('auth_user_id', 'is', null).order('id').range(start, end)),
      allRows<Sheet>((start, end) => db.from('timesheets')
        .select('employee_id,work_date').gte('work_date', fromDate).lte('work_date', now.date)
        .order('employee_id').order('work_date').range(start, end)),
    ]);
    const captured = new Set(sheets.map((sheet) => `${sheet.employee_id}:${sheet.work_date}`));
    const days = weekdays(fromDate, now.date);
    const appLink = `${appUrl.replace(/\/$/, '')}/`;
    const result = { eligible: 0, sent: 0, alreadyClaimed: 0, noEmail: 0, failed: 0 };

    for (const employee of employees) {
      // Respect both dates if administrators have filled them separately.
      const joined = eligibleStart(employee.start_date, employee.hire_date, fromDate);
      const expected = days.filter((date) => date >= joined);
      const missing = expected.filter((date) => !captured.has(`${employee.id}:${date}`));
      if (!missing.length) continue;
      result.eligible++;
      if (!employee.email?.trim()) { result.noEmail++; continue; }

      // The primary key is an atomic claim across concurrent cron invocations.
      const { error: claimError } = await db.from('timesheet_reminder_deliveries').insert({
        employee_id: employee.id, reminder_date: now.date, missing_days: missing.length,
      });
      if (claimError?.code === '23505') { result.alreadyClaimed++; continue; }
      if (claimError) throw Error(`Claim failed: ${claimError.message}`);

      const weeks = new Map<string, { expected: number; missing: string[] }>();
      for (const date of expected) {
        const key = monday(date);
        const week = weeks.get(key) || { expected: 0, missing: [] };
        week.expected++;
        if (!captured.has(`${employee.id}:${date}`)) week.missing.push(date);
        weeks.set(key, week);
      }
      const pendingWeeks = [...weeks].filter(([, week]) => week.missing.length);
      const list = pendingWeeks.map(([start, week]) => {
        const type = week.missing.length === week.expected ? 'sin registros' : 'incompleta';
        return `<li><strong>Semana del ${start}</strong> (${type}): ${week.missing.length} día${week.missing.length === 1 ? '' : 's'} pendiente${week.missing.length === 1 ? '' : 's'} — ${week.missing.join(', ')}</li>`;
      }).join('');
      const subject = `Tus horas pendientes en Central RH (${missing.length} días)`;
      const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#24364b"><h2>Recordatorio de Time Sheets</h2><p>Hola ${escapeHtml(employee.full_name.split(' ')[0] || employee.full_name)},</p><p>Tienes ${missing.length} día${missing.length === 1 ? '' : 's'} sin registrar entre ${fromDate} y ${now.date}.</p><ul>${list}</ul><p>Registra tus horas o la ausencia que corresponda.</p><p><a href="${escapeHtml(appLink)}">Abrir Time Sheets en Central RH</a></p></div>`;

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json',
            'Idempotency-Key': `timesheet-reminder/${now.date}/${employee.id}`,
          },
          body: JSON.stringify({ from, to: employee.email.trim(), subject, html }),
        });
        if (!response.ok) throw Error(`Resend HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
        const delivery = await response.json() as { id?: string };
        const { error } = await db.from('timesheet_reminder_deliveries').update({
          status: 'sent', resend_id: delivery.id || null, updated_at: new Date().toISOString(),
        }).eq('employee_id', employee.id).eq('reminder_date', now.date);
        if (error) throw Error(`Delivery log failed: ${error.message}`);
        result.sent++;
      } catch (error) {
        result.failed++;
        console.error('Timesheet reminder failed', employee.id, error);
        await db.from('timesheet_reminder_deliveries').update({
          status: 'failed', error_message: String(error).slice(0, 500), updated_at: new Date().toISOString(),
        }).eq('employee_id', employee.id).eq('reminder_date', now.date);
      }
      // Resend's standard API rate limit is two requests per second.
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    return json(result, result.failed ? 502 : 200);
  } catch (error) {
    console.error('Timesheet reminder run failed', error);
    return json({ error: 'Reminder run failed' }, 500);
  }
});
