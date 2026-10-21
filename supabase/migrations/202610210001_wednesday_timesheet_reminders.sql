-- 16:00 UTC is Wednesday 10:00 in Mexico City throughout the year.
do $$
declare
  old_job_id bigint;
begin
  select jobid into old_job_id
  from cron.job
  where jobname = 'send-timesheet-reminders-monday';

  if old_job_id is not null then
    perform cron.unschedule(old_job_id);
  end if;
end;
$$;

select cron.schedule(
  'send-timesheet-reminders-wednesday',
  '0 16 * * 3',
  'select public.invoke_timesheet_reminders();'
);
