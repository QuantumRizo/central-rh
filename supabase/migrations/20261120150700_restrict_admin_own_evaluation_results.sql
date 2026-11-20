-- Un administrador que también es colaborador no administra su propio ciclo.
-- Sus respuestas como evaluador siguen disponibles para completar sus tareas.
alter policy evaluation_cycles_read on public.evaluation_cycles
  using (
    ((select public.has_module('evaluaciones', 'admin'))
      and evaluated_employee_id is distinct from (select public.my_employee_id()))
    or (status = 'active' and exists (
      select 1 from public.evaluation_assignments a
      where a.cycle_id = evaluation_cycles.id
        and (a.evaluator_id = (select public.my_employee_id())
          or a.evaluated_id = (select public.my_employee_id()))
    ))
  );
alter policy evaluation_cycles_admin_write on public.evaluation_cycles
  using ((select public.has_module('evaluaciones', 'admin'))
    and evaluated_employee_id is distinct from (select public.my_employee_id()))
  with check ((select public.has_module('evaluaciones', 'admin'))
    and evaluated_employee_id is distinct from (select public.my_employee_id()));

alter policy evaluation_assignments_read on public.evaluation_assignments
  using (
    ((select public.has_module('evaluaciones', 'admin'))
      and evaluated_id is distinct from (select public.my_employee_id()))
    or evaluator_id = (select public.my_employee_id())
    or evaluated_id = (select public.my_employee_id())
  );
alter policy evaluation_assignments_admin_write on public.evaluation_assignments
  using ((select public.has_module('evaluaciones', 'admin'))
    and evaluated_id is distinct from (select public.my_employee_id()))
  with check ((select public.has_module('evaluaciones', 'admin'))
    and evaluated_id is distinct from (select public.my_employee_id()));

alter policy evaluation_responses_read on public.evaluation_responses
  using (
    ((select public.has_module('evaluaciones', 'admin'))
      and evaluated_id is distinct from (select public.my_employee_id()))
    or evaluator_id = (select public.my_employee_id())
  );
alter policy evaluation_responses_update on public.evaluation_responses
  using (
    ((select public.has_module('evaluaciones', 'admin'))
      and evaluated_id is distinct from (select public.my_employee_id()))
    or (evaluator_id = (select public.my_employee_id()) and exists (
      select 1 from public.evaluation_cycles c
      join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_responses.cycle_id and c.status = 'active'
        and a.evaluator_id = evaluation_responses.evaluator_id
        and a.evaluated_id = evaluation_responses.evaluated_id
    ))
  )
  with check (
    ((select public.has_module('evaluaciones', 'admin'))
      and evaluated_id is distinct from (select public.my_employee_id()))
    or (evaluator_id = (select public.my_employee_id()) and exists (
      select 1 from public.evaluation_cycles c
      join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_responses.cycle_id and c.status = 'active'
        and a.evaluator_id = evaluation_responses.evaluator_id
        and a.evaluated_id = evaluation_responses.evaluated_id
    ) and evaluation_type = case when evaluator_id = evaluated_id then 'self' else 'peer' end)
  );
alter policy evaluation_responses_delete on public.evaluation_responses
  using (
    ((select public.has_module('evaluaciones', 'admin'))
      and evaluated_id is distinct from (select public.my_employee_id()))
    or (evaluator_id = (select public.my_employee_id()) and exists (
      select 1 from public.evaluation_cycles c
      join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_responses.cycle_id and c.status = 'active'
        and a.evaluator_id = evaluation_responses.evaluator_id
        and a.evaluated_id = evaluation_responses.evaluated_id
    ))
  );

alter policy evaluation_comments_read on public.evaluation_comments
  using (
    ((select public.has_module('evaluaciones', 'admin'))
      and evaluated_id is distinct from (select public.my_employee_id()))
    or evaluator_id = (select public.my_employee_id())
  );
alter policy evaluation_comments_update on public.evaluation_comments
  using (
    ((select public.has_module('evaluaciones', 'admin'))
      and evaluated_id is distinct from (select public.my_employee_id()))
    or (evaluator_id = (select public.my_employee_id()) and exists (
      select 1 from public.evaluation_cycles c
      join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_comments.cycle_id and c.status = 'active'
        and a.evaluator_id = evaluation_comments.evaluator_id
        and a.evaluated_id = evaluation_comments.evaluated_id
    ))
  )
  with check (
    ((select public.has_module('evaluaciones', 'admin'))
      and evaluated_id is distinct from (select public.my_employee_id()))
    or (evaluator_id = (select public.my_employee_id()) and exists (
      select 1 from public.evaluation_cycles c
      join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_comments.cycle_id and c.status = 'active'
        and a.evaluator_id = evaluation_comments.evaluator_id
        and a.evaluated_id = evaluation_comments.evaluated_id
    ) and evaluation_type = case when evaluator_id = evaluated_id then 'self' else 'peer' end)
  );
alter policy evaluation_comments_delete on public.evaluation_comments
  using (
    ((select public.has_module('evaluaciones', 'admin'))
      and evaluated_id is distinct from (select public.my_employee_id()))
    or (evaluator_id = (select public.my_employee_id()) and exists (
      select 1 from public.evaluation_cycles c
      join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_comments.cycle_id and c.status = 'active'
        and a.evaluator_id = evaluation_comments.evaluator_id
        and a.evaluated_id = evaluation_comments.evaluated_id
    ))
  );

-- El reporte propio sólo se libera con el cierre, igual que para cualquier colaborador.
alter policy evaluation_final_reports_read on public.evaluation_final_reports
  using (
    ((select public.has_module('evaluaciones', 'admin'))
      and employee_id is distinct from (select public.my_employee_id()))
    or (employee_id = (select public.my_employee_id())
      and public.evaluation_cycle_is_closed(cycle_id))
  );
alter policy evaluation_final_reports_admin_write on public.evaluation_final_reports
  using ((select public.has_module('evaluaciones', 'admin'))
    and employee_id is distinct from (select public.my_employee_id()))
  with check ((select public.has_module('evaluaciones', 'admin'))
    and employee_id is distinct from (select public.my_employee_id()));
