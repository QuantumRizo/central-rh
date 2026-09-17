-- Solo el colaborador propietario o un administrador autenticado puede eliminar
-- una captura de fin de semana que exista.
create or replace function public.delete_timesheet(p_employee_id uuid, p_work_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_id uuid;
begin
  if p_employee_id is null or p_work_date is null then
    raise exception 'Datos incompletos';
  end if;
  if auth.uid() is null or (not public.is_admin() and p_employee_id is distinct from public.my_employee_id()) then
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
$$;

revoke all on function public.delete_timesheet(uuid, date) from public, anon, authenticated;
grant execute on function public.delete_timesheet(uuid, date) to authenticated;
