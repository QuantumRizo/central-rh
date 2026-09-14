alter table public.timesheets
  add column if not exists permission_entry_time time,
  add column if not exists permission_exit_time time;

update public.timesheets
set permission_entry_time = coalesce(permission_entry_time, entry_time),
    permission_exit_time = coalesce(permission_exit_time, exit_time)
where attendance = 'worked' and mode = 'schedule_permission';

alter table public.timesheets drop constraint if exists timesheets_check;
alter table public.timesheets add constraint timesheets_schedule_check check (
  (attendance = 'worked'
    and mode is not null and entry_time is not null and exit_time is not null and exit_time > entry_time
    and ((mode = 'schedule_permission' and permission_entry_time is not null and permission_exit_time is not null and permission_exit_time > permission_entry_time)
      or (mode <> 'schedule_permission' and permission_entry_time is null and permission_exit_time is null)))
  or (attendance in ('vacation', 'absence')
    and mode is null and entry_time is null and exit_time is null
    and permission_entry_time is null and permission_exit_time is null)
);

insert into public.clients (name) values
  ('Central de Negocios'), ('Sansui'), ('Sika'), ('Senosiain'), ('Dongfeng'), ('Waldo’s'), ('Farmacias Similares')
on conflict (name) do update set active = true;

create or replace function public.save_timesheet(payload jsonb)
returns public.timesheets
language plpgsql
security definer
set search_path = public
as $$
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
  if not public.is_admin() and v_employee_id <> public.my_employee_id() then raise exception 'No autorizado'; end if;
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
$$;
