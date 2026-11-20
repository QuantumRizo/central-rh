-- Job Description del colaborador: texto libre que edita el administrador.
alter table public.employees add column if not exists job_description text;

grant update (job_description) on public.employees to authenticated;
