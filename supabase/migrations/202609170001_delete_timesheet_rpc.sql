-- RPC para eliminar un timesheet completo (incluye sus entries por cascade)
-- Solo el propio colaborador o un admin puede eliminarlo
create or replace function public.delete_timesheet(p_employee_id uuid, p_work_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_employee_id is null or p_work_date is null then
    raise exception 'Datos incompletos';
  end if;
  if not public.is_admin() and p_employee_id <> public.my_employee_id() then
    raise exception 'No autorizado';
  end if;
  delete from public.timesheets
  where employee_id = p_employee_id
    and work_date = p_work_date;
end;
$$;

grant execute on function public.delete_timesheet(uuid, date) to authenticated;
