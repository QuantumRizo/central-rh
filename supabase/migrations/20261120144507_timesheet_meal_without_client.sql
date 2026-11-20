-- La comida pertenece a la jornada, pero no a un cliente.
alter table public.timesheet_entries alter column client_id drop not null;
-- Un índice evita dos filas de comida sin cliente en un mismo día.
create unique index timesheet_entries_one_clientless_activity
  on public.timesheet_entries (timesheet_id, activity_id) where client_id is null;

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
  v_meal_activity_id uuid;
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
    select id into v_meal_activity_id from public.activities where name = 'Comida';
    if exists (
      select 1 from jsonb_array_elements(v_entries) x
      where nullif(x->>'client_id', '') is null
        and (x->>'activity_id')::uuid is distinct from v_meal_activity_id
    ) then raise exception 'Sólo la comida puede registrarse sin cliente'; end if;
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
      select v_sheet.id,nullif(x->>'client_id', '')::uuid,(x->>'activity_id')::uuid,(x->>'percentage')::numeric from jsonb_array_elements(v_entries) x;
  end if;
  return v_sheet;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Datos de captura inválidos';
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
  select jsonb_build_object('day',to_jsonb(t),'entries',coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('client_name',c.name,'activity_name',a.name) order by e.client_id,e.activity_id) from public.timesheet_entries e left join public.clients c on c.id=e.client_id join public.activities a on a.id=e.activity_id where e.timesheet_id=t.id),'[]'::jsonb))
    into previous from public.timesheets t where t.employee_id=employee and t.work_date=work_day;
  result := public.save_timesheet_internal(payload);
  select jsonb_build_object('day',to_jsonb(t),'entries',coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('client_name',c.name,'activity_name',a.name) order by e.client_id,e.activity_id) from public.timesheet_entries e left join public.clients c on c.id=e.client_id join public.activities a on a.id=e.activity_id where e.timesheet_id=t.id),'[]'::jsonb))
    into current_data from public.timesheets t where t.id=result.id;
  select full_name into actor from public.employees where auth_user_id=auth.uid();
  insert into public.timesheet_history(employee_id,work_date,actor_id,actor_name,before_data,after_data)
    values(employee,work_day,auth.uid(),coalesce(actor,'Administrador'),previous,current_data);
  return result;
end;
$function$;

create or replace function public.admin_timesheet_report_page(
  p_from date,
  p_to date,
  p_offset integer default 0,
  p_limit integer default 500
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.can_view_timesheet_reports() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to
     or p_offset is null or p_offset < 0
     or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Parámetros de reporte inválidos' using errcode = '22023';
  end if;

  return query
  with page as materialized (
    select t.*
    from public.timesheets t
    where t.work_date between p_from and p_to
    order by t.work_date desc, t.id desc
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'id', t.id,
    'employee_id', t.employee_id,
    'work_date', t.work_date,
    'attendance', t.attendance,
    'mode', t.mode,
    'entry_time', t.entry_time,
    'exit_time', t.exit_time,
    'permission_entry_time', t.permission_entry_time,
    'permission_exit_time', t.permission_exit_time,
    'position_snapshot', t.position_snapshot,
    'employee', jsonb_build_object('full_name', e.full_name, 'position', e.position),
    'timesheet_entries', coalesce(allocations.entries, '[]'::jsonb)
  )
  from page t
  join public.employees e on e.id = t.employee_id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', te.id,
      'percentage', te.percentage,
      'client', case when c.id is null then null else jsonb_build_object('id', c.id, 'name', c.name) end,
      'activity', jsonb_build_object('id', a.id, 'name', a.name)
    ) order by te.id) as entries
    from public.timesheet_entries te
    left join public.clients c on c.id = te.client_id
    join public.activities a on a.id = te.activity_id
    where te.timesheet_id = t.id
  ) allocations on true
  order by t.work_date desc, t.id desc;
end;
$$;

revoke all on function public.admin_timesheet_report_page(date, date, integer, integer) from public, anon;
grant execute on function public.admin_timesheet_report_page(date, date, integer, integer) to authenticated;
