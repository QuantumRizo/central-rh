-- Supabase Cron runs in UTC. 21:00 UTC is 15:00 in Mexico City year round.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_timesheet_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_key text;
begin
  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'timesheet_reminder_service_role';

  if service_key is null then
    raise exception 'Timesheet reminder cron secret is not configured';
  end if;

  perform net.http_post(
    url := 'https://ncgbvbpkinrvrzxyttfz.supabase.co/functions/v1/send-timesheet-reminders',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key,
      'apikey', service_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function public.invoke_timesheet_reminders() from public, anon, authenticated;

select cron.schedule(
  'send-timesheet-reminders-friday',
  '0 21 * * 5',
  'select public.invoke_timesheet_reminders();'
);
