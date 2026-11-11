-- La fecha de ingreso vive sólo en employees.start_date.
update public.employees set start_date = hire_date where start_date is null and hire_date is not null;

revoke update (hire_date) on public.employees from authenticated;
grant update (start_date) on public.employees to authenticated;

alter table public.employees drop column hire_date;
