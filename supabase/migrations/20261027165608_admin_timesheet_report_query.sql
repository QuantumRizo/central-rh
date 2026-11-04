-- The admin report needs complete daily rows and their allocations. Build the
-- page first, then aggregate allocations once per selected timesheet. The
-- explicit report permission check preserves the existing RLS access boundary.
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
      'client', jsonb_build_object('id', c.id, 'name', c.name),
      'activity', jsonb_build_object('id', a.id, 'name', a.name)
    ) order by te.id) as entries
    from public.timesheet_entries te
    join public.clients c on c.id = te.client_id
    join public.activities a on a.id = te.activity_id
    where te.timesheet_id = t.id
  ) allocations on true
  order by t.work_date desc, t.id desc;
end;
$$;

revoke all on function public.admin_timesheet_report_page(date, date, integer, integer) from public, anon;
grant execute on function public.admin_timesheet_report_page(date, date, integer, integer) to authenticated;
