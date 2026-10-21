import { createClient } from 'npm:@supabase/supabase-js@2';
import { renderReminderEmail } from './email.ts';
import { eligibleStart, mexicoNow, reminderPeriods, weekdays } from './logic.ts';

type Employee = { id: string; full_name: string; email: string | null; start_date: string | null; hire_date: string | null };
type Sheet = { employee_id: string; work_date: string };
type Exclusion = { employee_id: string };

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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
  const cronSecret = Deno.env.get('TIMESHEET_CRON_SECRET');
  if (!serviceKey || !cronSecret || request.headers.get('x-cron-secret') !== cronSecret)
    return json({ error: 'Unauthorized' }, 401);

  const now = mexicoNow(new Date());
  if (now.weekday !== 'Wed' || now.hour < 10)
    return json({ error: 'Available Wednesday after 10:00 Mexico City time' }, 409);

  const url = Deno.env.get('SUPABASE_URL');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL');
  const appUrl = Deno.env.get('APP_URL');
  if (!url || !resendKey || !from || !appUrl || !/^https:\/\//.test(appUrl))
    return json({ error: 'Missing server configuration' }, 500);

  try {
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const periods = reminderPeriods(now.date);
    const fromDate = periods.previousStart;
    const [employees, sheets, exclusions] = await Promise.all([
      allRows<Employee>((start, end) => db.from('employees')
        .select('id,full_name,email,start_date,hire_date').eq('status', 'Activo')
        .not('auth_user_id', 'is', null).order('id').range(start, end)),
      allRows<Sheet>((start, end) => db.from('timesheets')
        .select('employee_id,work_date').gte('work_date', fromDate).lte('work_date', periods.currentEnd)
        .order('employee_id').order('work_date').range(start, end)),
      allRows<Exclusion>((start, end) => db.from('timesheet_reminder_exclusions')
        .select('employee_id').order('employee_id').range(start, end)),
    ]);
    const excluded = new Set(exclusions.map((item) => item.employee_id));
    const captured = new Set(sheets.map((sheet) => `${sheet.employee_id}:${sheet.work_date}`));
    const days = [...weekdays(periods.previousStart, periods.previousEnd), ...weekdays(periods.currentStart, periods.currentEnd)];
    const result = { eligible: 0, sent: 0, alreadyClaimed: 0, noEmail: 0, failed: 0 };

    for (const employee of employees) {
      if (excluded.has(employee.id)) continue;
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

      const email = renderReminderEmail(employee.full_name, appUrl, {
        previous: missing.some((date) => date < periods.currentStart),
        current: missing.some((date) => date >= periods.currentStart),
      });

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json',
            'Idempotency-Key': `timesheet-reminder/${now.date}/${employee.id}`,
          },
          body: JSON.stringify({ from, to: employee.email.trim(), ...email }),
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
