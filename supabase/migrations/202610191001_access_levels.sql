-- Accesos, paso 1: niveles por herramienta, rol editable desde la interfaz e historial.
--   tool_access.level: 'ver' o 'cargar' (sólo los dashboards de Simi: subir Excel en su /admin).
--   'cargar' reemplaza al permiso toolmaster, que desaparece.
--   El super admin (hoy Félix) cambia niveles y roles desde Configuración → Accesos; cada cambio
--   queda en access_log.

-- 1. Nivel por herramienta.
alter table public.tool_access add column level text not null default 'ver'
  check (level in ('ver', 'cargar'));
alter table public.tool_access add constraint tool_access_cargar_only_simi
  check (level = 'ver' or tool_id in ('street-planner', 'inversion', 'competencia', 'planeador-radio'));

-- Quien tenía toolmaster pasa a "cargar" en los dashboards de Simi que ya veía.
update public.tool_access a set level = 'cargar'
from public.user_permissions p
where p.user_id = a.user_id and p.permission = 'toolmaster'
  and a.tool_id in ('street-planner', 'inversion', 'competencia', 'planeador-radio');

/** ¿Puede subir datos de esta herramienta? (super admin siempre). Para el /admin de Simi. */
create or replace function public.user_can_load(target_user uuid, tool text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_permissions where user_id = target_user and permission = 'superadmin')
      or exists (select 1 from public.tool_access where user_id = target_user and tool_id = tool and level = 'cargar');
$$;
revoke all on function public.user_can_load(uuid, text) from public, anon, authenticated;

/** ¿Puede subir datos de alguna herramienta? Para las políticas del bucket simi-imports. */
create or replace function public.can_load_data()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin()
      or exists (select 1 from public.tool_access where user_id = auth.uid() and level = 'cargar');
$$;
revoke all on function public.can_load_data() from public, anon;
grant execute on function public.can_load_data() to authenticated;

drop policy simi_imports_toolmaster_select on storage.objects;
drop policy simi_imports_toolmaster_insert on storage.objects;
drop policy simi_imports_toolmaster_update on storage.objects;
drop policy simi_imports_toolmaster_delete on storage.objects;
create policy simi_imports_loader_select on storage.objects for select to authenticated
  using (bucket_id = 'simi-imports' and public.can_load_data());
create policy simi_imports_loader_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'simi-imports' and public.can_load_data());
create policy simi_imports_loader_update on storage.objects for update to authenticated
  using (bucket_id = 'simi-imports' and public.can_load_data());
create policy simi_imports_loader_delete on storage.objects for delete to authenticated
  using (bucket_id = 'simi-imports' and public.can_load_data());

delete from public.user_permissions where permission = 'toolmaster';
drop function public.is_toolmaster();
alter table public.user_permissions drop constraint user_permissions_permission_check;
alter table public.user_permissions add constraint user_permissions_permission_check
  check (permission = 'superadmin');

-- 2. Historial de cambios de acceso.
create table public.access_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references auth.users(id) on delete set null,
  target_user uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('tool', 'role')),
  item text,
  before text,
  after text
);
alter table public.access_log enable row level security;
create policy access_log_read on public.access_log for select to authenticated using (public.is_superadmin());
grant select on public.access_log to authenticated;
grant all on public.access_log to service_role;

-- 3. Funciones de la pantalla de Accesos (todas exigen super admin).
drop function public.set_tool_access(uuid, text, boolean);
drop function public.tool_access_matrix();

create or replace function public.tool_access_matrix()
returns table (user_id uuid, employee_id uuid, full_name text, email text, role text, superadmin boolean, tools jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Sólo el super admin puede ver los accesos' using errcode = '42501'; end if;
  return query
    select u.id, e.id, coalesce(e.full_name, u.email::text), u.email::text, coalesce(r.role, 'collaborator'),
      exists (select 1 from public.user_permissions p where p.user_id = u.id and p.permission = 'superadmin'),
      coalesce((select jsonb_object_agg(a.tool_id, a.level) from public.tool_access a where a.user_id = u.id), '{}'::jsonb)
    from auth.users u
    left join public.employees e on e.auth_user_id = u.id
    left join public.user_roles r on r.user_id = u.id
    order by 3;
end $$;
revoke all on function public.tool_access_matrix() from public, anon;
grant execute on function public.tool_access_matrix() to authenticated;

/** level: 'ver', 'cargar' o null para quitar el acceso. */
create or replace function public.set_tool_access(target_user uuid, tool text, new_level text)
returns void language plpgsql security definer set search_path = public as $$
declare old_level text;
begin
  if not public.is_superadmin() then raise exception 'Sólo el super admin puede cambiar accesos' using errcode = '42501'; end if;
  select level into old_level from public.tool_access where user_id = target_user and tool_id = tool;
  if new_level is null then
    delete from public.tool_access where user_id = target_user and tool_id = tool;
  else
    insert into public.tool_access (user_id, tool_id, level, granted_by) values (target_user, tool, new_level, auth.uid())
    on conflict (user_id, tool_id) do update set level = excluded.level, granted_by = excluded.granted_by, granted_at = now();
  end if;
  if old_level is distinct from new_level then
    insert into public.access_log (actor, target_user, kind, item, before, after)
    values (auth.uid(), target_user, 'tool', tool, old_level, new_level);
  end if;
end $$;
revoke all on function public.set_tool_access(uuid, text, text) from public, anon;
grant execute on function public.set_tool_access(uuid, text, text) to authenticated;

create or replace function public.set_user_role(target_user uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
declare old_role text;
begin
  if not public.is_superadmin() then raise exception 'Sólo el super admin puede cambiar roles' using errcode = '42501'; end if;
  if target_user = auth.uid() then raise exception 'No puedes cambiar tu propio rol' using errcode = '42501'; end if;
  if new_role not in ('admin', 'timesheet_admin', 'collaborator') then raise exception 'Rol desconocido: %', new_role; end if;
  select role into old_role from public.user_roles where user_id = target_user;
  insert into public.user_roles (user_id, role) values (target_user, new_role)
  on conflict (user_id) do update set role = excluded.role;
  if old_role is distinct from new_role then
    insert into public.access_log (actor, target_user, kind, item, before, after)
    values (auth.uid(), target_user, 'role', null, old_role, new_role);
  end if;
end $$;
revoke all on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

create or replace function public.access_history(max_rows integer default 50)
returns table (at timestamptz, actor text, target text, kind text, item text, before text, after text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Sólo el super admin puede ver el historial' using errcode = '42501'; end if;
  return query
    select l.at, coalesce(ea.full_name, ua.email::text), coalesce(et.full_name, ut.email::text), l.kind, l.item, l.before, l.after
    from public.access_log l
    left join auth.users ua on ua.id = l.actor left join public.employees ea on ea.auth_user_id = l.actor
    left join auth.users ut on ut.id = l.target_user left join public.employees et on et.auth_user_id = l.target_user
    order by l.at desc limit least(max_rows, 200);
end $$;
revoke all on function public.access_history(integer) from public, anon;
grant execute on function public.access_history(integer) to authenticated;

-- 4. Tarjeta "Accesos" del perfil: la propia, o la de cualquiera si eres super admin.
create or replace function public.employee_access(target_employee uuid)
returns table (role text, superadmin boolean, tools jsonb)
language plpgsql stable security definer set search_path = public as $$
declare target_user uuid;
begin
  select auth_user_id into target_user from public.employees where id = target_employee;
  if target_user is null then return; end if;
  if target_user <> auth.uid() and not public.is_superadmin() then return; end if;
  return query
    select coalesce((select r.role from public.user_roles r where r.user_id = target_user), 'collaborator'),
      exists (select 1 from public.user_permissions p where p.user_id = target_user and p.permission = 'superadmin'),
      coalesce((select jsonb_object_agg(a.tool_id, a.level) from public.tool_access a where a.user_id = target_user), '{}'::jsonb);
end $$;
revoke all on function public.employee_access(uuid) from public, anon;
grant execute on function public.employee_access(uuid) to authenticated;
