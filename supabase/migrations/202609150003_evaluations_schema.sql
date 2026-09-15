-- Evaluaciones integradas con Central RH.
-- Los IDs originales del sistema anterior se conservan en legacy_id para
-- permitir una importación repetible sin exponerlos como claves primarias.

create table public.evaluation_cycles (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  start_date timestamptz,
  end_date timestamptz,
  evaluated_employee_id uuid references public.employees(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evaluation_questions (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  question_text text not null,
  category text not null,
  max_score numeric not null default 1,
  question_order integer,
  is_inverted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evaluation_responses (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  question_id uuid not null references public.evaluation_questions(id) on delete restrict,
  evaluator_id uuid not null references public.employees(id) on delete restrict,
  evaluated_id uuid not null references public.employees(id) on delete restrict,
  score numeric not null check (score >= 0 and score <= 1),
  evaluation_type text not null check (evaluation_type in ('self', 'peer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, question_id, evaluator_id, evaluated_id)
);

create table public.evaluation_assignments (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  evaluated_id uuid not null references public.employees(id) on delete restrict,
  evaluator_id uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, evaluated_id, evaluator_id)
);

create table public.evaluation_comments (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  evaluator_id uuid not null references public.employees(id) on delete restrict,
  evaluated_id uuid not null references public.employees(id) on delete restrict,
  evaluation_type text not null check (evaluation_type in ('self', 'peer')),
  comment text,
  strengths text,
  opportunities text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, evaluator_id, evaluated_id, evaluation_type)
);

create table public.evaluation_final_reports (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  self_score numeric,
  collective_score numeric,
  admin_summary text,
  strengths text,
  opportunities text,
  final_score numeric,
  is_exported boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, employee_id)
);

create index evaluation_cycles_employee_idx
  on public.evaluation_cycles(evaluated_employee_id);
create index evaluation_assignments_evaluator_idx
  on public.evaluation_assignments(cycle_id, evaluator_id);
create index evaluation_assignments_evaluated_idx
  on public.evaluation_assignments(cycle_id, evaluated_id);
create index evaluation_responses_evaluator_idx
  on public.evaluation_responses(cycle_id, evaluator_id, evaluated_id);
create index evaluation_comments_evaluator_idx
  on public.evaluation_comments(cycle_id, evaluator_id, evaluated_id);

create or replace function public.set_evaluation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger evaluation_cycles_updated_at
before update on public.evaluation_cycles
for each row execute function public.set_evaluation_updated_at();
create trigger evaluation_questions_updated_at
before update on public.evaluation_questions
for each row execute function public.set_evaluation_updated_at();
create trigger evaluation_responses_updated_at
before update on public.evaluation_responses
for each row execute function public.set_evaluation_updated_at();
create trigger evaluation_assignments_updated_at
before update on public.evaluation_assignments
for each row execute function public.set_evaluation_updated_at();
create trigger evaluation_comments_updated_at
before update on public.evaluation_comments
for each row execute function public.set_evaluation_updated_at();
create trigger evaluation_final_reports_updated_at
before update on public.evaluation_final_reports
for each row execute function public.set_evaluation_updated_at();

alter table public.evaluation_cycles enable row level security;
alter table public.evaluation_questions enable row level security;
alter table public.evaluation_responses enable row level security;
alter table public.evaluation_assignments enable row level security;
alter table public.evaluation_comments enable row level security;
alter table public.evaluation_final_reports enable row level security;

-- Sólo se muestran ciclos activos en los que la persona participa. El admin
-- conserva visibilidad sobre ciclos en cualquier estado.
create policy evaluation_cycles_read on public.evaluation_cycles
for select to authenticated
using (
  public.is_admin()
  or (
    status = 'active'
    and exists (
      select 1
      from public.evaluation_assignments a
      where a.cycle_id = evaluation_cycles.id
        and (a.evaluator_id = public.my_employee_id() or a.evaluated_id = public.my_employee_id())
    )
  )
);
create policy evaluation_cycles_admin_write on public.evaluation_cycles
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Las preguntas no contienen información personal y son necesarias para
-- construir cualquier formulario al que la persona ya tenga acceso.
create policy evaluation_questions_read on public.evaluation_questions
for select to authenticated using (auth.uid() is not null);
create policy evaluation_questions_admin_write on public.evaluation_questions
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Un colaborador sólo puede leer y modificar sus propias respuestas, y sólo
-- dentro de una asignación de un ciclo activo. Las respuestas de terceros
-- quedan reservadas al administrador.
create policy evaluation_responses_read on public.evaluation_responses
for select to authenticated
using (public.is_admin() or evaluator_id = public.my_employee_id());
create policy evaluation_responses_insert on public.evaluation_responses
for insert to authenticated
with check (
  evaluator_id = public.my_employee_id()
  and exists (
    select 1
    from public.evaluation_cycles c
    join public.evaluation_assignments a on a.cycle_id = c.id
    where c.id = evaluation_responses.cycle_id
      and c.status = 'active'
      and a.evaluator_id = evaluation_responses.evaluator_id
      and a.evaluated_id = evaluation_responses.evaluated_id
  )
  and evaluation_type = case when evaluator_id = evaluated_id then 'self' else 'peer' end
);
create policy evaluation_responses_update on public.evaluation_responses
for update to authenticated
using (
  public.is_admin()
  or (
    evaluator_id = public.my_employee_id()
    and exists (
      select 1
      from public.evaluation_cycles c
      join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_responses.cycle_id
        and c.status = 'active'
        and a.evaluator_id = evaluation_responses.evaluator_id
        and a.evaluated_id = evaluation_responses.evaluated_id
    )
  )
)
with check (
  public.is_admin()
  or (
    evaluator_id = public.my_employee_id()
    and exists (
      select 1
      from public.evaluation_cycles c
      join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_responses.cycle_id
        and c.status = 'active'
        and a.evaluator_id = evaluation_responses.evaluator_id
        and a.evaluated_id = evaluation_responses.evaluated_id
    )
    and evaluation_type = case when evaluator_id = evaluated_id then 'self' else 'peer' end
  )
);
create policy evaluation_responses_delete on public.evaluation_responses
for delete to authenticated
using (
  public.is_admin()
  or (
    evaluator_id = public.my_employee_id()
    and exists (
      select 1
      from public.evaluation_cycles c
      join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_responses.cycle_id
        and c.status = 'active'
        and a.evaluator_id = evaluation_responses.evaluator_id
        and a.evaluated_id = evaluation_responses.evaluated_id
    )
  )
);

create policy evaluation_assignments_read on public.evaluation_assignments
for select to authenticated
using (public.is_admin() or evaluator_id = public.my_employee_id() or evaluated_id = public.my_employee_id());
create policy evaluation_assignments_admin_write on public.evaluation_assignments
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy evaluation_comments_read on public.evaluation_comments
for select to authenticated
using (public.is_admin() or evaluator_id = public.my_employee_id());
create policy evaluation_comments_insert on public.evaluation_comments
for insert to authenticated
with check (
  evaluator_id = public.my_employee_id()
  and exists (
    select 1
    from public.evaluation_cycles c
    join public.evaluation_assignments a on a.cycle_id = c.id
    where c.id = evaluation_comments.cycle_id
      and c.status = 'active'
      and a.evaluator_id = evaluation_comments.evaluator_id
      and a.evaluated_id = evaluation_comments.evaluated_id
  )
  and evaluation_type = case when evaluator_id = evaluated_id then 'self' else 'peer' end
);
create policy evaluation_comments_update on public.evaluation_comments
for update to authenticated
using (
  public.is_admin()
  or (
    evaluator_id = public.my_employee_id()
    and exists (
      select 1
      from public.evaluation_cycles c
      join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_comments.cycle_id
        and c.status = 'active'
        and a.evaluator_id = evaluation_comments.evaluator_id
        and a.evaluated_id = evaluation_comments.evaluated_id
    )
  )
)
with check (
  public.is_admin()
  or (
    evaluator_id = public.my_employee_id()
    and exists (
      select 1
      from public.evaluation_cycles c
      join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_comments.cycle_id
        and c.status = 'active'
        and a.evaluator_id = evaluation_comments.evaluator_id
        and a.evaluated_id = evaluation_comments.evaluated_id
    )
    and evaluation_type = case when evaluator_id = evaluated_id then 'self' else 'peer' end
  )
);
create policy evaluation_comments_delete on public.evaluation_comments
for delete to authenticated
using (
  public.is_admin()
  or (
    evaluator_id = public.my_employee_id()
    and exists (
      select 1
      from public.evaluation_cycles c
      join public.evaluation_assignments a on a.cycle_id = c.id
      where c.id = evaluation_comments.cycle_id
        and c.status = 'active'
        and a.evaluator_id = evaluation_comments.evaluator_id
        and a.evaluated_id = evaluation_comments.evaluated_id
    )
  )
);

create policy evaluation_final_reports_read on public.evaluation_final_reports
for select to authenticated
using (public.is_admin() or employee_id = public.my_employee_id());
create policy evaluation_final_reports_admin_write on public.evaluation_final_reports
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete
  on public.evaluation_cycles,
     public.evaluation_questions,
     public.evaluation_responses,
     public.evaluation_assignments,
     public.evaluation_comments,
     public.evaluation_final_reports
  to authenticated;
grant all
  on public.evaluation_cycles,
     public.evaluation_questions,
     public.evaluation_responses,
     public.evaluation_assignments,
     public.evaluation_comments,
     public.evaluation_final_reports
  to service_role;
