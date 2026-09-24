-- Niveles de acceso:
--   admin            → superadmin: ve y hace todo (public.is_admin() no cambia).
--   timesheet_admin  → sólo consulta el panel de seguimiento de timesheets.
--   collaborator     → usuario normal.
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'timesheet_admin', 'collaborator'));

create or replace function public.can_view_timesheet_reports()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('admin', 'timesheet_admin')
  );
$$;
revoke all on function public.can_view_timesheet_reports() from public, anon;
grant execute on function public.can_view_timesheet_reports() to authenticated;

-- Lectura del panel de timesheets (políticas permisivas: se suman a las existentes).
create policy employees_read_timesheet_reports on public.employees
  for select to authenticated using (public.can_view_timesheet_reports());
create policy clients_read_timesheet_reports on public.clients
  for select to authenticated using (public.can_view_timesheet_reports());
create policy activities_read_timesheet_reports on public.activities
  for select to authenticated using (public.can_view_timesheet_reports());
create policy timesheets_read_timesheet_reports on public.timesheets
  for select to authenticated using (public.can_view_timesheet_reports());
create policy entries_read_timesheet_reports on public.timesheet_entries
  for select to authenticated using (public.can_view_timesheet_reports());
create policy history_read_timesheet_reports on public.timesheet_history
  for select to authenticated using (public.can_view_timesheet_reports());

-- Asignación de roles por correo de acceso.
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users
where lower(email) in (
  'patricia@centraldenegociosmx.com',
  'fanny@centraldenegociosmx.com',
  'felix@centraldenegociosmx.com',
  'carolina@centraldenegociosmx.com',
  'rh@centrales.com.mx'
)
on conflict (user_id) do update set role = excluded.role;

insert into public.user_roles (user_id, role)
select id, 'timesheet_admin' from auth.users
where lower(email) = 'rebeca@centraldenegociosmx.com'
on conflict (user_id) do update set role = excluded.role;

update public.user_roles r set role = 'collaborator'
from auth.users u
where u.id = r.user_id
  and r.role in ('admin', 'timesheet_admin')
  and lower(u.email) not in (
    'patricia@centraldenegociosmx.com',
    'fanny@centraldenegociosmx.com',
    'felix@centraldenegociosmx.com',
    'carolina@centraldenegociosmx.com',
    'rh@centrales.com.mx',
    'rebeca@centraldenegociosmx.com'
  );

-- El perfil y los correos de evaluaciones leen employees.email: copiar el correo de acceso.
update public.employees e
set email = u.email
from auth.users u
where u.id = e.auth_user_id
  and e.email is distinct from u.email;
