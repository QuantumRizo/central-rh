create or replace function public.save_timesheets_batch(
  payloads jsonb,
  overwrite_existing boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  item jsonb;
  employee uuid;
  work_day date;
  already_exists boolean;
  created_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if jsonb_typeof(payloads) <> 'array' then
    raise exception 'La carga debe ser una lista de días';
  end if;
  if jsonb_array_length(payloads) > 400 then
    raise exception 'La carga excede el máximo de 400 días';
  end if;

  for item in select value from jsonb_array_elements(payloads) as elements(value)
  loop
    employee := (item->>'employee_id')::uuid;
    work_day := (item->>'work_date')::date;
    select exists(
      select 1 from public.timesheets
      where employee_id = employee and work_date = work_day
    ) into already_exists;

    if already_exists and not overwrite_existing then
      skipped_count := skipped_count + 1;
    else
      perform public.save_timesheet(item);
      if already_exists then
        updated_count := updated_count + 1;
      else
        created_count := created_count + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'created', created_count,
    'updated', updated_count,
    'skipped', skipped_count,
    'total', created_count + updated_count + skipped_count
  );
end;
$$;

revoke all on function public.save_timesheets_batch(jsonb, boolean) from public, anon;
grant execute on function public.save_timesheets_batch(jsonb, boolean) to authenticated;
