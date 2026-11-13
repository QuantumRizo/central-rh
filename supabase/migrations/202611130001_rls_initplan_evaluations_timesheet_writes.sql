-- Continúa 202610210002: las políticas que llamaban a has_module(),
-- my_employee_id() o can_view_timesheet_reports() directamente las evaluaban
-- una vez por fila. Contar evaluation_responses (~3.6k filas) tardaba ~450 ms
-- de media y crece con cada ciclo. Envolver cada llamada en (select ...) la
-- convierte en InitPlan (una vez por consulta). Misma semántica: sólo cambia
-- cuándo se evalúan las funciones, no las condiciones.

-- Timesheets: escrituras e historial.
alter policy timesheets_insert on public.timesheets
  with check ((employee_id = (select public.my_employee_id())) or (select public.has_module('timesheets', 'admin')));
alter policy timesheets_update on public.timesheets
  using ((employee_id = (select public.my_employee_id())) or (select public.has_module('timesheets', 'admin')))
  with check ((employee_id = (select public.my_employee_id())) or (select public.has_module('timesheets', 'admin')));
alter policy timesheets_delete on public.timesheets
  using ((employee_id = (select public.my_employee_id())) or (select public.has_module('timesheets', 'admin')));

alter policy entries_write on public.timesheet_entries
  using (exists (
    select 1 from public.timesheets t
    where t.id = timesheet_entries.timesheet_id
      and (t.employee_id = (select public.my_employee_id()) or (select public.has_module('timesheets', 'admin')))
  ))
  with check (exists (
    select 1 from public.timesheets t
    where t.id = timesheet_entries.timesheet_id
      and (t.employee_id = (select public.my_employee_id()) or (select public.has_module('timesheets', 'admin')))
  ));

alter policy history_read on public.timesheet_history
  using ((select public.has_module('timesheets', 'admin')) or (employee_id = (select public.my_employee_id())));
alter policy history_read_timesheet_reports on public.timesheet_history
  using ((select public.can_view_timesheet_reports()));

-- Evaluaciones.
alter policy evaluation_responses_read on public.evaluation_responses
  using ((select public.has_module('evaluaciones', 'admin')) or (evaluator_id = (select public.my_employee_id())));
alter policy evaluation_responses_insert on public.evaluation_responses
  with check (
    evaluator_id = (select public.my_employee_id())
    and exists (
      select 1 from public.evaluation_cycles c join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_responses.cycle_id and c.status = 'active'
        and a.evaluator_id = evaluation_responses.evaluator_id and a.evaluated_id = evaluation_responses.evaluated_id
    )
    and evaluation_type = case when evaluator_id = evaluated_id then 'self' else 'peer' end
  );
alter policy evaluation_responses_update on public.evaluation_responses
  using (
    (select public.has_module('evaluaciones', 'admin'))
    or (evaluator_id = (select public.my_employee_id()) and exists (
      select 1 from public.evaluation_cycles c join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_responses.cycle_id and c.status = 'active'
        and a.evaluator_id = evaluation_responses.evaluator_id and a.evaluated_id = evaluation_responses.evaluated_id
    ))
  )
  with check (
    (select public.has_module('evaluaciones', 'admin'))
    or (evaluator_id = (select public.my_employee_id()) and exists (
      select 1 from public.evaluation_cycles c join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_responses.cycle_id and c.status = 'active'
        and a.evaluator_id = evaluation_responses.evaluator_id and a.evaluated_id = evaluation_responses.evaluated_id
    ) and evaluation_type = case when evaluator_id = evaluated_id then 'self' else 'peer' end)
  );
alter policy evaluation_responses_delete on public.evaluation_responses
  using (
    (select public.has_module('evaluaciones', 'admin'))
    or (evaluator_id = (select public.my_employee_id()) and exists (
      select 1 from public.evaluation_cycles c join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_responses.cycle_id and c.status = 'active'
        and a.evaluator_id = evaluation_responses.evaluator_id and a.evaluated_id = evaluation_responses.evaluated_id
    ))
  );

alter policy evaluation_comments_read on public.evaluation_comments
  using ((select public.has_module('evaluaciones', 'admin')) or (evaluator_id = (select public.my_employee_id())));
alter policy evaluation_comments_insert on public.evaluation_comments
  with check (
    evaluator_id = (select public.my_employee_id())
    and exists (
      select 1 from public.evaluation_cycles c join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_comments.cycle_id and c.status = 'active'
        and a.evaluator_id = evaluation_comments.evaluator_id and a.evaluated_id = evaluation_comments.evaluated_id
    )
    and evaluation_type = case when evaluator_id = evaluated_id then 'self' else 'peer' end
  );
alter policy evaluation_comments_update on public.evaluation_comments
  using (
    (select public.has_module('evaluaciones', 'admin'))
    or (evaluator_id = (select public.my_employee_id()) and exists (
      select 1 from public.evaluation_cycles c join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_comments.cycle_id and c.status = 'active'
        and a.evaluator_id = evaluation_comments.evaluator_id and a.evaluated_id = evaluation_comments.evaluated_id
    ))
  )
  with check (
    (select public.has_module('evaluaciones', 'admin'))
    or (evaluator_id = (select public.my_employee_id()) and exists (
      select 1 from public.evaluation_cycles c join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_comments.cycle_id and c.status = 'active'
        and a.evaluator_id = evaluation_comments.evaluator_id and a.evaluated_id = evaluation_comments.evaluated_id
    ) and evaluation_type = case when evaluator_id = evaluated_id then 'self' else 'peer' end)
  );
alter policy evaluation_comments_delete on public.evaluation_comments
  using (
    (select public.has_module('evaluaciones', 'admin'))
    or (evaluator_id = (select public.my_employee_id()) and exists (
      select 1 from public.evaluation_cycles c join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_comments.cycle_id and c.status = 'active'
        and a.evaluator_id = evaluation_comments.evaluator_id and a.evaluated_id = evaluation_comments.evaluated_id
    ))
  );

alter policy evaluation_assignments_read on public.evaluation_assignments
  using (
    (select public.has_module('evaluaciones', 'admin'))
    or evaluator_id = (select public.my_employee_id())
    or evaluated_id = (select public.my_employee_id())
  );
alter policy evaluation_assignments_admin_write on public.evaluation_assignments
  using ((select public.has_module('evaluaciones', 'admin')))
  with check ((select public.has_module('evaluaciones', 'admin')));

alter policy evaluation_cycles_read on public.evaluation_cycles
  using (
    (select public.has_module('evaluaciones', 'admin'))
    or (status = 'active' and exists (
      select 1 from public.evaluation_assignments a
      where a.cycle_id = evaluation_cycles.id
        and (a.evaluator_id = (select public.my_employee_id()) or a.evaluated_id = (select public.my_employee_id()))
    ))
  );
alter policy evaluation_cycles_admin_write on public.evaluation_cycles
  using ((select public.has_module('evaluaciones', 'admin')))
  with check ((select public.has_module('evaluaciones', 'admin')));

alter policy evaluation_final_reports_read on public.evaluation_final_reports
  using (
    (select public.has_module('evaluaciones', 'admin'))
    or (employee_id = (select public.my_employee_id()) and public.evaluation_cycle_is_closed(cycle_id))
  );
alter policy evaluation_final_reports_admin_write on public.evaluation_final_reports
  using ((select public.has_module('evaluaciones', 'admin')))
  with check ((select public.has_module('evaluaciones', 'admin')));
