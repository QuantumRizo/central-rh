-- Acceso por herramienta (secciones Simi y CN Tools) y super admin.
--   superadmin → administra quién abre cada herramienta y las ve todas. Hoy sólo Félix.
--   toolmaster → sigue significando "puede subir datos en el /admin de los dashboards de Simi".
-- El catálogo de herramientas vive en el frontend (src/tools/catalog.ts); aquí sólo su id.
alter table public.user_permissions drop constraint user_permissions_permission_check;
alter table public.user_permissions add constraint user_permissions_permission_check
  check (permission in ('toolmaster', 'superadmin'));

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_permissions where user_id = auth.uid() and permission = 'superadmin');
$$;
revoke all on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated;

create table public.tool_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_id text not null check (tool_id ~ '^[a-z0-9-]+$'),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, tool_id)
);
alter table public.tool_access enable row level security;
create policy tool_access_read on public.tool_access
  for select to authenticated using (user_id = auth.uid() or public.is_superadmin());
-- Las altas y bajas pasan por set_tool_access(), que exige super admin.
grant select on public.tool_access to authenticated;
grant all on public.tool_access to service_role;

/** ¿Puede este usuario abrir la herramienta? Para los servidores de cada herramienta. */
create or replace function public.user_has_tool(target_user uuid, tool text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_permissions where user_id = target_user and permission = 'superadmin')
      or exists (select 1 from public.tool_access where user_id = target_user and tool_id = tool);
$$;
revoke all on function public.user_has_tool(uuid, text) from public, anon, authenticated;

/** Herramientas del usuario con sesión; un super admin recibe '*' (todas). */
create or replace function public.my_tools()
returns text[] language sql stable security definer set search_path = public as $$
  select case when public.is_superadmin() then array['*']
    else coalesce((select array_agg(tool_id order by tool_id) from public.tool_access where user_id = auth.uid()), '{}') end;
$$;
revoke all on function public.my_tools() from public, anon;
grant execute on function public.my_tools() to authenticated;

/** Colaboradores con cuenta y sus herramientas, para la pantalla de Accesos (sólo super admin). */
create or replace function public.tool_access_matrix()
returns table (user_id uuid, full_name text, email text, role text, superadmin boolean, tools text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Sólo el super admin puede ver los accesos' using errcode = '42501'; end if;
  return query
    select u.id, coalesce(e.full_name, u.email::text), u.email::text, coalesce(r.role, 'collaborator'),
      exists (select 1 from public.user_permissions p where p.user_id = u.id and p.permission = 'superadmin'),
      coalesce((select array_agg(a.tool_id order by a.tool_id) from public.tool_access a where a.user_id = u.id), '{}')
    from auth.users u
    left join public.employees e on e.auth_user_id = u.id
    left join public.user_roles r on r.user_id = u.id
    order by 2;
end $$;
revoke all on function public.tool_access_matrix() from public, anon;
grant execute on function public.tool_access_matrix() to authenticated;

create or replace function public.set_tool_access(target_user uuid, tool text, allowed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Sólo el super admin puede cambiar accesos' using errcode = '42501'; end if;
  if allowed then
    insert into public.tool_access (user_id, tool_id, granted_by) values (target_user, tool, auth.uid())
    on conflict (user_id, tool_id) do nothing;
  else
    delete from public.tool_access where user_id = target_user and tool_id = tool;
  end if;
end $$;
revoke all on function public.set_tool_access(uuid, text, boolean) from public, anon;
grant execute on function public.set_tool_access(uuid, text, boolean) to authenticated;

-- Accesos iniciales: Félix super admin; Jorge conserva todas las herramientas que veía;
-- Juan Pablo abre el Flow comercial.
insert into public.user_permissions (user_id, permission)
select id, 'superadmin' from auth.users where lower(email) = 'felix@centraldenegociosmx.com'
on conflict do nothing;

insert into public.tool_access (user_id, tool_id)
select u.id, t.tool_id from auth.users u
cross join (values ('street-planner'), ('inversion'), ('competencia'), ('alcance'), ('flow'), ('planeador-radio')) as t (tool_id)
where lower(u.email) = 'jorge@centraldenegociosmx.com'
on conflict do nothing;

insert into public.tool_access (user_id, tool_id)
select id, 'flow' from auth.users where lower(email) = 'juan@centraldenegociosmx.com'
on conflict do nothing;
