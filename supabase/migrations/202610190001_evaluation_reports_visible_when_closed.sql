-- Los borradores del dictamen se guardan en evaluation_final_reports antes de cerrar el ciclo.
-- El colaborador evaluado solo puede leer su reporte cuando el ciclo ya está cerrado.
create or replace function public.evaluation_cycle_is_closed(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.evaluation_cycles where id = target and status = 'closed');
$$;

drop policy if exists evaluation_final_reports_read on public.evaluation_final_reports;
create policy evaluation_final_reports_read on public.evaluation_final_reports
for select to authenticated
using (
  public.is_admin()
  or (employee_id = public.my_employee_id() and public.evaluation_cycle_is_closed(cycle_id))
);
