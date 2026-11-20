-- Fecha de baja del colaborador. Sólo aplica cuando status = 'Baja'.
alter table public.employees add column if not exists end_date date;

alter table public.employees
  add constraint employees_end_date_after_start
  check (end_date is null or start_date is null or end_date >= start_date);

grant update (end_date) on public.employees to authenticated;
