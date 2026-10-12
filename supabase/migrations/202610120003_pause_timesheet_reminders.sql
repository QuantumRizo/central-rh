-- Paused by RH until further notice; keep the job definition for later reactivation.
do $$
declare
  reminder_job_id bigint;
begin
  select jobid into reminder_job_id
  from cron.job
  where jobname = 'send-timesheet-reminders-monday';

  if reminder_job_id is not null then
    perform cron.alter_job(reminder_job_id, active := false);
  end if;
end;
$$;
