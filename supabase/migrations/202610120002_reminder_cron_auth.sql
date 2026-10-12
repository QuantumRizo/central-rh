-- The Edge runtime's service key can differ from the legacy JWT accepted by its gateway.
-- Use a dedicated shared secret for the function and keep the JWT for gateway verification.
create or replace function public.invoke_timesheet_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_key text;
  cron_secret text;
begin
  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'timesheet_reminder_service_role';

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'timesheet_reminder_cron_token';

  if service_key is null or cron_secret is null then
    raise exception 'Timesheet reminder cron credentials are not configured';
  end if;

  perform net.http_post(
    url := 'https://ncgbvbpkinrvrzxyttfz.supabase.co/functions/v1/send-timesheet-reminders',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key,
      'apikey', service_key,
      'x-cron-secret', cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;
