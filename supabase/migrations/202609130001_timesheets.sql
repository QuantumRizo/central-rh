create extension if not exists pgcrypto;
create type public.employee_status as enum ('Activo', 'Baja');
create type public.attendance_status as enum ('worked', 'vacation', 'absence');
create type public.work_mode as enum ('office', 'home_office', 'schedule_permission');

create table public.employees (
  id uuid primary key default gen_random_uuid(), full_name text not null, position text not null,
  status public.employee_status not null default 'Activo', auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.clients (id uuid primary key default gen_random_uuid(), name text not null unique, active boolean not null default true, created_at timestamptz not null default now());
create table public.activities (id uuid primary key default gen_random_uuid(), name text not null unique, active boolean not null default true, created_at timestamptz not null default now());
create table public.user_roles (user_id uuid primary key references auth.users(id) on delete cascade, role text not null check (role in ('admin', 'collaborator')) default 'collaborator');
create table public.timesheets (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null, attendance public.attendance_status not null, mode public.work_mode, entry_time time, exit_time time,
  position_snapshot text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (employee_id, work_date),
  check ((attendance = 'worked' and mode is not null and entry_time is not null and exit_time is not null and exit_time > entry_time) or (attendance in ('vacation', 'absence') and mode is null and entry_time is null and exit_time is null))
);
create table public.timesheet_entries (
  id uuid primary key default gen_random_uuid(), timesheet_id uuid not null references public.timesheets(id) on delete cascade,
  client_id uuid not null references public.clients(id), activity_id uuid not null references public.activities(id), percentage numeric(5,2) not null check (percentage > 0 and percentage <= 100), unique (timesheet_id, client_id, activity_id)
);
create index timesheets_date_idx on public.timesheets(work_date);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'); $$;
create or replace function public.my_employee_id() returns uuid language sql stable security definer set search_path = public as $$ select id from public.employees where auth_user_id = auth.uid() limit 1; $$;
alter table public.employees enable row level security;
alter table public.clients enable row level security;
alter table public.activities enable row level security;
alter table public.user_roles enable row level security;
alter table public.timesheets enable row level security;
alter table public.timesheet_entries enable row level security;
create policy employees_read on public.employees for select to authenticated using (auth_user_id = auth.uid() or public.is_admin());
create policy clients_read on public.clients for select to authenticated using (active or public.is_admin());
create policy activities_read on public.activities for select to authenticated using (active or public.is_admin());
create policy roles_read on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy timesheets_read on public.timesheets for select to authenticated using (employee_id = public.my_employee_id() or public.is_admin());
create policy timesheets_insert on public.timesheets for insert to authenticated with check (employee_id = public.my_employee_id() or public.is_admin());
create policy timesheets_update on public.timesheets for update to authenticated using (employee_id = public.my_employee_id() or public.is_admin()) with check (employee_id = public.my_employee_id() or public.is_admin());
create policy timesheets_delete on public.timesheets for delete to authenticated using (employee_id = public.my_employee_id() or public.is_admin());
create policy entries_read on public.timesheet_entries for select to authenticated using (exists (select 1 from public.timesheets t where t.id = timesheet_id and (t.employee_id = public.my_employee_id() or public.is_admin())));
create policy entries_write on public.timesheet_entries for all to authenticated using (exists (select 1 from public.timesheets t where t.id = timesheet_id and (t.employee_id = public.my_employee_id() or public.is_admin()))) with check (exists (select 1 from public.timesheets t where t.id = timesheet_id and (t.employee_id = public.my_employee_id() or public.is_admin())));
grant usage on schema public to authenticated;
grant select on public.employees, public.clients, public.activities, public.user_roles, public.timesheets, public.timesheet_entries to authenticated;
grant insert, update, delete on public.timesheets, public.timesheet_entries to authenticated;
grant all on public.employees, public.clients, public.activities, public.user_roles, public.timesheets, public.timesheet_entries to service_role;
