-- Accesos, paso 2: niveles por módulo de RH en lugar del rol "admin" que daba todo.
--   timesheets    reportes (consulta los reportes de todos) · admin (además edita timesheets de otros)
--   evaluaciones  admin (ciclos, preguntas, asignaciones, reportes finales)
--   perfiles      ver (directorio y perfiles de todos) · admin (además los edita)
--   reclutamiento admin
--   firmas        admin (registro de firmas, PDFs por colaborador y Excel original de RH)
-- El super admin tiene todo. user_roles queda sólo como antecedente: ya no da permisos.
-- Arranque sin pérdidas: cada admin recibe "admin" en todos los módulos y cada timesheet_admin
-- "reportes" en timesheets, que es exactamente lo que podían hacer.

create table public.module_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null,
  level text not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, module_id),
  constraint module_access_level_check check (
    (module_id = 'timesheets' and level in ('reportes', 'admin')) or
    (module_id = 'perfiles' and level in ('ver', 'admin')) or
    (module_id in ('evaluaciones', 'reclutamiento', 'firmas') and level = 'admin'))
);
alter table public.module_access enable row level security;
create policy module_access_read on public.module_access
  for select to authenticated using (user_id = auth.uid() or public.is_superadmin());
grant select on public.module_access to authenticated;
grant all on public.module_access to service_role;

insert into public.module_access (user_id, module_id, level)
select r.user_id, m.module_id, m.level from public.user_roles r
cross join (values ('timesheets', 'admin'), ('evaluaciones', 'admin'), ('perfiles', 'admin'), ('reclutamiento', 'admin'), ('firmas', 'admin')) as m (module_id, level)
where r.role = 'admin'
on conflict do nothing;
insert into public.module_access (user_id, module_id, level)
select user_id, 'timesheets', 'reportes' from public.user_roles where role = 'timesheet_admin'
on conflict do nothing;

/** ¿Tiene el usuario al menos ese nivel en el módulo? (super admin siempre). Para servidores. */
create or replace function public.user_has_module(target_user uuid, module text, min_level text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_permissions where user_id = target_user and permission = 'superadmin')
      or exists (select 1 from public.module_access a where a.user_id = target_user and a.module_id = module
                 and (a.level = min_level or a.level = 'admin'));
$$;
revoke all on function public.user_has_module(uuid, text, text) from public, anon, authenticated;
grant execute on function public.user_has_module(uuid, text, text) to service_role;

/** Lo mismo para el usuario con sesión: lo usan las políticas y el frontend. */
create or replace function public.has_module(module text, min_level text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.user_has_module(auth.uid(), module, min_level);
$$;
revoke all on function public.has_module(text, text) from public, anon;
grant execute on function public.has_module(text, text) to authenticated;

/** Quién ve a todos los colaboradores: perfiles, y los módulos que los listan. */
create or replace function public.sees_all_employees()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_module('perfiles', 'ver') or public.has_module('evaluaciones', 'admin') or public.has_module('firmas', 'admin');
$$;
revoke all on function public.sees_all_employees() from public, anon;
grant execute on function public.sees_all_employees() to authenticated;

/** Módulos del usuario con sesión; el super admin recibe todos en "admin". */
create or replace function public.my_modules()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_superadmin()
    then '{"timesheets":"admin","evaluaciones":"admin","perfiles":"admin","reclutamiento":"admin","firmas":"admin"}'::jsonb
    else coalesce((select jsonb_object_agg(module_id, level) from public.module_access where user_id = auth.uid()), '{}'::jsonb) end;
$$;
revoke all on function public.my_modules() from public, anon;
grant execute on function public.my_modules() to authenticated;

-- Las funciones de siempre pasan a significar su módulo; is_admin() queda sólo como red de
-- seguridad (super admin) por si algo antiguo lo siguiera llamando.
create or replace function public.can_view_timesheet_reports()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_module('timesheets', 'reportes');
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin();
$$;

-- Historial: ahora también registra módulos.
alter table public.access_log drop constraint access_log_kind_check;
alter table public.access_log add constraint access_log_kind_check check (kind in ('tool', 'role', 'module'));

/** level: el nivel o null para quitar el módulo. Sólo super admin. */
create or replace function public.set_module_access(target_user uuid, module text, new_level text)
returns void language plpgsql security definer set search_path = public as $$
declare old_level text;
begin
  if not public.is_superadmin() then raise exception 'Sólo el super admin puede cambiar accesos' using errcode = '42501'; end if;
  select level into old_level from public.module_access where user_id = target_user and module_id = module;
  if new_level is null then
    delete from public.module_access where user_id = target_user and module_id = module;
  else
    insert into public.module_access (user_id, module_id, level, granted_by) values (target_user, module, new_level, auth.uid())
    on conflict (user_id, module_id) do update set level = excluded.level, granted_by = excluded.granted_by, granted_at = now();
  end if;
  if old_level is distinct from new_level then
    insert into public.access_log (actor, target_user, kind, item, before, after)
    values (auth.uid(), target_user, 'module', module, old_level, new_level);
  end if;
end $$;
revoke all on function public.set_module_access(uuid, text, text) from public, anon;
grant execute on function public.set_module_access(uuid, text, text) to authenticated;

-- El rol ya no se edita: lo reemplazan los módulos.
drop function public.set_user_role(uuid, text);

drop function public.tool_access_matrix();
create function public.tool_access_matrix()
returns table (user_id uuid, employee_id uuid, full_name text, email text, superadmin boolean, modules jsonb, tools jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Sólo el super admin puede ver los accesos' using errcode = '42501'; end if;
  return query
    select u.id, e.id, coalesce(e.full_name, u.email::text), u.email::text,
      exists (select 1 from public.user_permissions p where p.user_id = u.id and p.permission = 'superadmin'),
      coalesce((select jsonb_object_agg(m.module_id, m.level) from public.module_access m where m.user_id = u.id), '{}'::jsonb),
      coalesce((select jsonb_object_agg(a.tool_id, a.level) from public.tool_access a where a.user_id = u.id), '{}'::jsonb)
    from auth.users u left join public.employees e on e.auth_user_id = u.id
    order by 3;
end $$;
revoke all on function public.tool_access_matrix() from public, anon;
grant execute on function public.tool_access_matrix() to authenticated;

drop function public.employee_access(uuid);
create function public.employee_access(target_employee uuid)
returns table (superadmin boolean, modules jsonb, tools jsonb)
language plpgsql stable security definer set search_path = public as $$
declare target_user uuid;
begin
  select auth_user_id into target_user from public.employees where id = target_employee;
  if target_user is null then return; end if;
  if target_user <> auth.uid() and not public.is_superadmin() then return; end if;
  return query
    select exists (select 1 from public.user_permissions p where p.user_id = target_user and p.permission = 'superadmin'),
      coalesce((select jsonb_object_agg(m.module_id, m.level) from public.module_access m where m.user_id = target_user), '{}'::jsonb),
      coalesce((select jsonb_object_agg(a.tool_id, a.level) from public.tool_access a where a.user_id = target_user), '{}'::jsonb);
end $$;
revoke all on function public.employee_access(uuid) from public, anon;
grant execute on function public.employee_access(uuid) to authenticated;

-- Políticas: cada is_admin() pasa al módulo dueño de la tabla (generado de pg_policies).
alter policy employees_read on public.employees
  using (((auth_user_id = auth.uid()) OR public.sees_all_employees()));
alter policy clients_read on public.clients
  using ((active OR public.has_module('timesheets', 'admin')));
alter policy activities_read on public.activities
  using ((active OR public.has_module('timesheets', 'admin')));
alter policy roles_read on public.user_roles
  using (((user_id = auth.uid()) OR public.is_superadmin()));
alter policy timesheets_read on public.timesheets
  using (((employee_id = my_employee_id()) OR public.has_module('timesheets', 'admin')));
alter policy timesheets_insert on public.timesheets
  with check (((employee_id = my_employee_id()) OR public.has_module('timesheets', 'admin')));
alter policy timesheets_update on public.timesheets
  using (((employee_id = my_employee_id()) OR public.has_module('timesheets', 'admin')))
  with check (((employee_id = my_employee_id()) OR public.has_module('timesheets', 'admin')));
alter policy timesheets_delete on public.timesheets
  using (((employee_id = my_employee_id()) OR public.has_module('timesheets', 'admin')));
alter policy entries_read on public.timesheet_entries
  using ((EXISTS ( SELECT 1
   FROM timesheets t
  WHERE ((t.id = timesheet_entries.timesheet_id) AND ((t.employee_id = my_employee_id()) OR public.has_module('timesheets', 'admin'))))));
alter policy evaluation_comments_read on public.evaluation_comments
  using ((public.has_module('evaluaciones', 'admin') OR (evaluator_id = my_employee_id())));
alter policy entries_write on public.timesheet_entries
  using ((EXISTS ( SELECT 1
   FROM timesheets t
  WHERE ((t.id = timesheet_entries.timesheet_id) AND ((t.employee_id = my_employee_id()) OR public.has_module('timesheets', 'admin'))))))
  with check ((EXISTS ( SELECT 1
   FROM timesheets t
  WHERE ((t.id = timesheet_entries.timesheet_id) AND ((t.employee_id = my_employee_id()) OR public.has_module('timesheets', 'admin'))))));
alter policy history_read on public.timesheet_history
  using ((public.has_module('timesheets', 'admin') OR (employee_id = my_employee_id())));
alter policy evaluation_cycles_read on public.evaluation_cycles
  using ((public.has_module('evaluaciones', 'admin') OR ((status = 'active'::text) AND (EXISTS ( SELECT 1
   FROM evaluation_assignments a
  WHERE ((a.cycle_id = evaluation_cycles.id) AND ((a.evaluator_id = my_employee_id()) OR (a.evaluated_id = my_employee_id()))))))));
alter policy evaluation_cycles_admin_write on public.evaluation_cycles
  using (public.has_module('evaluaciones', 'admin'))
  with check (public.has_module('evaluaciones', 'admin'));
alter policy evaluation_questions_admin_write on public.evaluation_questions
  using (public.has_module('evaluaciones', 'admin'))
  with check (public.has_module('evaluaciones', 'admin'));
alter policy evaluation_responses_read on public.evaluation_responses
  using ((public.has_module('evaluaciones', 'admin') OR (evaluator_id = my_employee_id())));
alter policy evaluation_responses_update on public.evaluation_responses
  using ((public.has_module('evaluaciones', 'admin') OR ((evaluator_id = my_employee_id()) AND (EXISTS ( SELECT 1
   FROM (evaluation_cycles c
     JOIN evaluation_assignments a ON ((a.cycle_id = c.id)))
  WHERE ((c.id = evaluation_responses.cycle_id) AND (c.status = 'active'::text) AND (a.evaluator_id = evaluation_responses.evaluator_id) AND (a.evaluated_id = evaluation_responses.evaluated_id)))))))
  with check ((public.has_module('evaluaciones', 'admin') OR ((evaluator_id = my_employee_id()) AND (EXISTS ( SELECT 1
   FROM (evaluation_cycles c
     JOIN evaluation_assignments a ON ((a.cycle_id = c.id)))
  WHERE ((c.id = evaluation_responses.cycle_id) AND (c.status = 'active'::text) AND (a.evaluator_id = evaluation_responses.evaluator_id) AND (a.evaluated_id = evaluation_responses.evaluated_id)))) AND (evaluation_type =
CASE
    WHEN (evaluator_id = evaluated_id) THEN 'self'::text
    ELSE 'peer'::text
END))));
alter policy evaluation_responses_delete on public.evaluation_responses
  using ((public.has_module('evaluaciones', 'admin') OR ((evaluator_id = my_employee_id()) AND (EXISTS ( SELECT 1
   FROM (evaluation_cycles c
     JOIN evaluation_assignments a ON ((a.cycle_id = c.id)))
  WHERE ((c.id = evaluation_responses.cycle_id) AND (c.status = 'active'::text) AND (a.evaluator_id = evaluation_responses.evaluator_id) AND (a.evaluated_id = evaluation_responses.evaluated_id)))))));
alter policy evaluation_assignments_read on public.evaluation_assignments
  using ((public.has_module('evaluaciones', 'admin') OR (evaluator_id = my_employee_id()) OR (evaluated_id = my_employee_id())));
alter policy evaluation_assignments_admin_write on public.evaluation_assignments
  using (public.has_module('evaluaciones', 'admin'))
  with check (public.has_module('evaluaciones', 'admin'));
alter policy evaluation_comments_update on public.evaluation_comments
  using ((public.has_module('evaluaciones', 'admin') OR ((evaluator_id = my_employee_id()) AND (EXISTS ( SELECT 1
   FROM (evaluation_cycles c
     JOIN evaluation_assignments a ON ((a.cycle_id = c.id)))
  WHERE ((c.id = evaluation_comments.cycle_id) AND (c.status = 'active'::text) AND (a.evaluator_id = evaluation_comments.evaluator_id) AND (a.evaluated_id = evaluation_comments.evaluated_id)))))))
  with check ((public.has_module('evaluaciones', 'admin') OR ((evaluator_id = my_employee_id()) AND (EXISTS ( SELECT 1
   FROM (evaluation_cycles c
     JOIN evaluation_assignments a ON ((a.cycle_id = c.id)))
  WHERE ((c.id = evaluation_comments.cycle_id) AND (c.status = 'active'::text) AND (a.evaluator_id = evaluation_comments.evaluator_id) AND (a.evaluated_id = evaluation_comments.evaluated_id)))) AND (evaluation_type =
CASE
    WHEN (evaluator_id = evaluated_id) THEN 'self'::text
    ELSE 'peer'::text
END))));
alter policy evaluation_comments_delete on public.evaluation_comments
  using ((public.has_module('evaluaciones', 'admin') OR ((evaluator_id = my_employee_id()) AND (EXISTS ( SELECT 1
   FROM (evaluation_cycles c
     JOIN evaluation_assignments a ON ((a.cycle_id = c.id)))
  WHERE ((c.id = evaluation_comments.cycle_id) AND (c.status = 'active'::text) AND (a.evaluator_id = evaluation_comments.evaluator_id) AND (a.evaluated_id = evaluation_comments.evaluated_id)))))));
alter policy evaluation_final_reports_admin_write on public.evaluation_final_reports
  using (public.has_module('evaluaciones', 'admin'))
  with check (public.has_module('evaluaciones', 'admin'));
alter policy employee_documents_storage_admin_delete on storage.objects
  using (((bucket_id = 'employee-documents'::text) AND public.has_module('firmas', 'admin')));
alter policy profile_photos_admin_select on storage.objects
  using (((bucket_id = 'profile-photos'::text) AND public.sees_all_employees()));
alter policy employees_update_admin on public.employees
  using (public.has_module('perfiles', 'admin'))
  with check (public.has_module('perfiles', 'admin'));
alter policy recruitment_positions_admin on public.recruitment_positions
  using (public.has_module('reclutamiento', 'admin'))
  with check (public.has_module('reclutamiento', 'admin'));
alter policy recruitment_candidates_admin on public.recruitment_candidates
  using (public.has_module('reclutamiento', 'admin'))
  with check (public.has_module('reclutamiento', 'admin'));
alter policy recruitment_matches_admin on public.recruitment_matches
  using (public.has_module('reclutamiento', 'admin'))
  with check (public.has_module('reclutamiento', 'admin'));
alter policy recruitment_cvs_admin_select on storage.objects
  using (((bucket_id = 'recruitment-cvs'::text) AND public.has_module('reclutamiento', 'admin')));
alter policy recruitment_cvs_admin_insert on storage.objects
  with check (((bucket_id = 'recruitment-cvs'::text) AND public.has_module('reclutamiento', 'admin')));
alter policy recruitment_cvs_admin_delete on storage.objects
  using (((bucket_id = 'recruitment-cvs'::text) AND public.has_module('reclutamiento', 'admin')));
alter policy employee_documents_admin_read on public.employee_documents
  using (public.has_module('firmas', 'admin'));
alter policy employee_documents_admin_insert on public.employee_documents
  with check (public.has_module('firmas', 'admin'));
alter policy employee_documents_admin_update on public.employee_documents
  using (public.has_module('firmas', 'admin'))
  with check (public.has_module('firmas', 'admin'));
alter policy employee_documents_admin_delete on public.employee_documents
  using (public.has_module('firmas', 'admin'));
alter policy employee_signature_registry_admin_read on public.employee_signature_registry
  using (public.has_module('firmas', 'admin'));
alter policy employee_signature_registry_admin_insert on public.employee_signature_registry
  with check (public.has_module('firmas', 'admin'));
alter policy employee_signature_registry_admin_update on public.employee_signature_registry
  using (public.has_module('firmas', 'admin'))
  with check (public.has_module('firmas', 'admin'));
alter policy employee_documents_storage_admin_read on storage.objects
  using (((bucket_id = 'employee-documents'::text) AND public.has_module('firmas', 'admin')));
alter policy employee_documents_storage_admin_insert on storage.objects
  with check (((bucket_id = 'employee-documents'::text) AND public.has_module('firmas', 'admin')));
alter policy rh_files_admin_read on public.rh_files
  using (public.has_module('firmas', 'admin'));
alter policy rh_files_admin_insert on public.rh_files
  with check (public.has_module('firmas', 'admin'));
alter policy rh_files_admin_delete on public.rh_files
  using (public.has_module('firmas', 'admin'));
alter policy rh_private_files_admin_read on storage.objects
  using (((bucket_id = 'rh-private-files'::text) AND public.has_module('firmas', 'admin')));
alter policy rh_private_files_admin_insert on storage.objects
  with check (((bucket_id = 'rh-private-files'::text) AND public.has_module('firmas', 'admin')));
alter policy rh_private_files_admin_delete on storage.objects
  using (((bucket_id = 'rh-private-files'::text) AND public.has_module('firmas', 'admin')));
alter policy permissions_read on public.user_permissions
  using (((user_id = auth.uid()) OR public.is_superadmin()));
alter policy evaluation_final_reports_read on public.evaluation_final_reports
  using ((public.has_module('evaluaciones', 'admin') OR ((employee_id = my_employee_id()) AND evaluation_cycle_is_closed(cycle_id))));

-- Funciones de timesheets: editar el de otra persona exige timesheets admin.
CREATE OR REPLACE FUNCTION public.delete_timesheet(p_employee_id uuid, p_work_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deleted_id uuid;
begin
  if p_employee_id is null or p_work_date is null then
    raise exception 'Datos incompletos';
  end if;
  if auth.uid() is null or (not public.has_module('timesheets', 'admin') and p_employee_id is distinct from public.my_employee_id()) then
    raise exception 'No autorizado';
  end if;
  if extract(isodow from p_work_date) not in (6, 7) then
    raise exception 'Solo se pueden eliminar registros de fin de semana';
  end if;

  delete from public.timesheets
  where employee_id = p_employee_id and work_date = p_work_date
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'No existe un registro para esa fecha';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_timesheet(payload jsonb)
 RETURNS timesheets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result public.timesheets;
  previous jsonb;
  current_data jsonb;
  actor text;
  employee uuid := (payload->>'employee_id')::uuid;
  work_day date := (payload->>'work_date')::date;
begin
  if auth.uid() is null or (not public.has_module('timesheets', 'admin') and employee is distinct from public.my_employee_id()) then
    raise exception 'No autorizado';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(employee::text || work_day::text, 0));
  select jsonb_build_object('day',to_jsonb(t),'entries',coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('client_name',c.name,'activity_name',a.name) order by e.client_id,e.activity_id) from public.timesheet_entries e join public.clients c on c.id=e.client_id join public.activities a on a.id=e.activity_id where e.timesheet_id=t.id),'[]'::jsonb))
    into previous from public.timesheets t where t.employee_id=employee and t.work_date=work_day;
  result := public.save_timesheet_internal(payload);
  select jsonb_build_object('day',to_jsonb(t),'entries',coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('client_name',c.name,'activity_name',a.name) order by e.client_id,e.activity_id) from public.timesheet_entries e join public.clients c on c.id=e.client_id join public.activities a on a.id=e.activity_id where e.timesheet_id=t.id),'[]'::jsonb))
    into current_data from public.timesheets t where t.id=result.id;
  select full_name into actor from public.employees where auth_user_id=auth.uid();
  insert into public.timesheet_history(employee_id,work_date,actor_id,actor_name,before_data,after_data)
    values(employee,work_day,auth.uid(),coalesce(actor,'Administrador'),previous,current_data);
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_timesheet_internal(payload jsonb)
 RETURNS timesheets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_employee_id uuid := (payload->>'employee_id')::uuid;
  v_date date := (payload->>'work_date')::date;
  v_attendance public.attendance_status := (payload->>'attendance')::public.attendance_status;
  v_mode public.work_mode := nullif(payload->>'mode','')::public.work_mode;
  v_entry time := nullif(payload->>'entry_time','')::time;
  v_exit time := nullif(payload->>'exit_time','')::time;
  v_permission_entry time := nullif(payload->>'permission_entry_time','')::time;
  v_permission_exit time := nullif(payload->>'permission_exit_time','')::time;
  v_position text;
  v_sheet public.timesheets;
  v_total numeric;
  v_entries jsonb := coalesce(payload->'entries', '[]'::jsonb);
begin
  if v_employee_id is null or v_date is null or v_attendance is null then raise exception 'Datos incompletos'; end if;
  if not public.has_module('timesheets', 'admin') and v_employee_id <> public.my_employee_id() then raise exception 'No autorizado'; end if;
  select position into v_position from public.employees where id = v_employee_id and status = 'Activo';
  if v_position is null then raise exception 'Colaborador no activo'; end if;
  if v_attendance = 'worked' then
    if v_mode is null or v_entry is null or v_exit is null or v_exit <= v_entry then raise exception 'Horario real inválido'; end if;
    if v_mode = 'schedule_permission' and (v_permission_entry is null or v_permission_exit is null or v_permission_exit <= v_permission_entry) then raise exception 'Horario de permiso inválido'; end if;
    if v_mode <> 'schedule_permission' then v_permission_entry := null; v_permission_exit := null; end if;
    if jsonb_typeof(v_entries) <> 'array' or jsonb_array_length(v_entries) = 0 then raise exception 'Agrega al menos una actividad'; end if;
    select coalesce(sum((x->>'percentage')::numeric),0) into v_total from jsonb_array_elements(v_entries) x;
    if v_total <> 100 then raise exception 'El porcentaje diario debe sumar exactamente 100'; end if;
  else
    v_mode := null; v_entry := null; v_exit := null; v_permission_entry := null; v_permission_exit := null; v_entries := '[]'::jsonb;
  end if;
  insert into public.timesheets(employee_id,work_date,attendance,mode,entry_time,exit_time,permission_entry_time,permission_exit_time,position_snapshot,updated_at)
    values (v_employee_id,v_date,v_attendance,v_mode,v_entry,v_exit,v_permission_entry,v_permission_exit,v_position,now())
    on conflict (employee_id,work_date) do update set attendance=excluded.attendance,mode=excluded.mode,entry_time=excluded.entry_time,exit_time=excluded.exit_time,permission_entry_time=excluded.permission_entry_time,permission_exit_time=excluded.permission_exit_time,position_snapshot=excluded.position_snapshot,updated_at=now()
    returning * into v_sheet;
  delete from public.timesheet_entries where timesheet_id = v_sheet.id;
  if v_attendance = 'worked' then
    insert into public.timesheet_entries(timesheet_id,client_id,activity_id,percentage)
      select v_sheet.id,(x->>'client_id')::uuid,(x->>'activity_id')::uuid,(x->>'percentage')::numeric from jsonb_array_elements(v_entries) x;
  end if;
  return v_sheet;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Datos de captura inválidos';
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_employee_start_date(employee uuid, start_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.has_module('timesheets', 'admin') then raise exception 'No autorizado'; end if;
  update public.employees set start_date = $2 where id = $1;
end;
$function$;
