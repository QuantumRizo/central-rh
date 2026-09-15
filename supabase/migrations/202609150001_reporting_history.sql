alter table public.employees add column if not exists start_date date;

create or replace function public.set_employee_start_date(employee uuid, start_date date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'No autorizado'; end if;
  update public.employees set start_date = $2 where id = $1;
end;
$$;
revoke all on function public.set_employee_start_date(uuid,date) from public;
grant execute on function public.set_employee_start_date(uuid,date) to authenticated;

create table public.timesheet_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  work_date date not null,
  actor_id uuid,
  actor_name text not null,
  changed_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb not null
);
alter table public.timesheet_history enable row level security;
create policy history_read on public.timesheet_history for select to authenticated
using (public.is_admin() or employee_id = public.my_employee_id());
grant select on public.timesheet_history to authenticated;
create index on public.timesheet_history(employee_id,work_date,changed_at);

alter function public.save_timesheet(jsonb) rename to save_timesheet_internal;
revoke all on function public.save_timesheet_internal(jsonb) from public, anon, authenticated;
create function public.save_timesheet(payload jsonb)
returns public.timesheets language plpgsql security definer set search_path = public as $$
declare
  result public.timesheets;
  previous jsonb;
  current_data jsonb;
  actor text;
  employee uuid := (payload->>'employee_id')::uuid;
  work_day date := (payload->>'work_date')::date;
begin
  if auth.uid() is null or (not public.is_admin() and employee is distinct from public.my_employee_id()) then
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
$$;
revoke all on function public.save_timesheet(jsonb) from public, anon;
grant execute on function public.save_timesheet(jsonb) to authenticated;
