-- Keep named exclusions separate from employee status and account access.
create table public.timesheet_reminder_exclusions (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.timesheet_reminder_exclusions enable row level security;
revoke all on public.timesheet_reminder_exclusions from public, anon, authenticated;
grant select, insert, delete on public.timesheet_reminder_exclusions to service_role;

insert into public.timesheet_reminder_exclusions (employee_id, reason) values
  ('e95c9cd0-63cf-4f96-9e53-063a959a885e', 'Excluido por solicitud de RH: 67 días pendientes en la vista previa del 2026-10-12'),
  ('5d646c11-421e-4bc7-9f37-79a80b5ceeae', 'Excluido por solicitud de RH: 67 días pendientes en la vista previa del 2026-10-12'),
  ('8522eabc-ef9d-4423-9109-e4d8e7b682da', 'Excluido por solicitud de RH: 67 días pendientes en la vista previa del 2026-10-12'),
  ('4bbc5954-f114-4255-bd44-ab20a4921332', 'Excluido por solicitud de RH: 67 días pendientes en la vista previa del 2026-10-12'),
  ('8c00f47e-e4c5-4e90-b462-b5e6e655142a', 'Excluido por solicitud de RH: 67 días pendientes en la vista previa del 2026-10-12'),
  ('f13dd36a-f81b-4411-b0e4-2e3763cde44d', 'Excluido por solicitud de RH: 67 días pendientes en la vista previa del 2026-10-12'),
  ('e254a28d-f472-4388-b7e5-b2f9c0a24f46', 'Excluido por solicitud de RH: 67 días pendientes en la vista previa del 2026-10-12'),
  ('be221f7b-90b6-41f7-af99-e6e3ed2916cc', 'Excluido por solicitud de RH: 67 días pendientes en la vista previa del 2026-10-12');

select cron.unschedule('send-timesheet-reminders-friday');
select cron.schedule(
  'send-timesheet-reminders-monday',
  '30 15 * * 1',
  'select public.invoke_timesheet_reminders();'
);
