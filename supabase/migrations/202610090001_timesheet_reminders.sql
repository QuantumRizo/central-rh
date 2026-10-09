-- One delivery attempt per collaborator and Friday. Kept private from the Data API.
create table public.timesheet_reminder_deliveries (
  employee_id uuid not null references public.employees(id) on delete cascade,
  reminder_date date not null,
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'failed')),
  missing_days integer not null,
  resend_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (employee_id, reminder_date)
);

alter table public.timesheet_reminder_deliveries enable row level security;
revoke all on public.timesheet_reminder_deliveries from public, anon, authenticated;
grant select, insert, update on public.timesheet_reminder_deliveries to service_role;
