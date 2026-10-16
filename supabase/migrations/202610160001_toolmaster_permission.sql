-- Permisos adicionales al rol. Un usuario tiene un solo rol en user_roles
-- (admin, timesheet_admin, collaborator); los permisos se suman a ese rol.
--   toolmaster → acceso a la sección Tools (dashboards de Simi, curvas de alcance, Flow).
--                Ser admin no lo incluye.
create table public.user_permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null check (permission in ('toolmaster')),
  granted_at timestamptz not null default now(),
  primary key (user_id, permission)
);

alter table public.user_permissions enable row level security;
create policy permissions_read on public.user_permissions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- Sin políticas de escritura: los permisos se asignan por migración.
grant select on public.user_permissions to authenticated;
grant all on public.user_permissions to service_role;

create or replace function public.is_toolmaster()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_permissions
    where user_id = auth.uid() and permission = 'toolmaster'
  );
$$;
revoke all on function public.is_toolmaster() from public, anon;
grant execute on function public.is_toolmaster() to authenticated;

insert into public.user_permissions (user_id, permission)
select id, 'toolmaster' from auth.users
where lower(email) = 'felix@centraldenegociosmx.com'
on conflict do nothing;
