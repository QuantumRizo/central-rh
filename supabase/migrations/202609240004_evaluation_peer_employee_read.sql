-- Un colaborador sólo podía leer su propia fila de employees, así que al
-- cargar sus evaluaciones pendientes no encontraba a la persona evaluada y la
-- tarea se descartaba. Permitir leer a quien tiene asignado evaluar mientras
-- el ciclo esté activo (política permisiva: se suma a las existentes).
create policy employees_read_evaluation_targets on public.employees
for select to authenticated
using (
  exists (
    select 1
    from public.evaluation_assignments a
    join public.evaluation_cycles c on c.id = a.cycle_id
    where a.evaluated_id = employees.id
      and a.evaluator_id = public.my_employee_id()
      and c.status = 'active'
  )
);
