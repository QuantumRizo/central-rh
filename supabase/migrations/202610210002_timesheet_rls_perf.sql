-- El panel de Personas (timesheets) agotaba el statement timeout (57014): las
-- políticas llamaban a funciones security definer una vez por fila y
-- entries_read hacía una subconsulta por cada entrada. Envolver las llamadas en
-- (select ...) las convierte en InitPlan (se evalúan una vez por consulta) y
-- entries_read pasa a una subconsulta no correlacionada. Misma semántica.

alter policy timesheets_read on public.timesheets
  using ((employee_id = (select public.my_employee_id())) or (select public.has_module('timesheets', 'admin')));
alter policy timesheets_read_timesheet_reports on public.timesheets
  using ((select public.can_view_timesheet_reports()));

alter policy entries_read on public.timesheet_entries
  using (
    (select public.has_module('timesheets', 'admin'))
    or timesheet_id in (select t.id from public.timesheets t where t.employee_id = (select public.my_employee_id()))
  );
alter policy entries_read_timesheet_reports on public.timesheet_entries
  using ((select public.can_view_timesheet_reports()));

alter policy employees_read on public.employees
  using ((auth_user_id = (select auth.uid())) or (select public.sees_all_employees()));
alter policy employees_read_timesheet_reports on public.employees
  using ((select public.can_view_timesheet_reports()));

alter policy clients_read on public.clients
  using (active or (select public.has_module('timesheets', 'admin')));
alter policy clients_read_timesheet_reports on public.clients
  using ((select public.can_view_timesheet_reports()));
alter policy activities_read on public.activities
  using (active or (select public.has_module('timesheets', 'admin')));
alter policy activities_read_timesheet_reports on public.activities
  using ((select public.can_view_timesheet_reports()));
