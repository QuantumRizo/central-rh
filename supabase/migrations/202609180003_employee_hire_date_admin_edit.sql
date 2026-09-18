alter table public.employees add column if not exists hire_date date;

create policy employees_update_admin on public.employees
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

grant update (full_name, position, department, email, status, hire_date, avatar_path)
  on public.employees to authenticated;
