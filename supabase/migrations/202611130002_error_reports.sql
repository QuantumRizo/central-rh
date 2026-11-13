-- Historial de reportes de error. Hasta ahora send-bug-report sólo mandaba un
-- correo, así que las alertas automáticas (5xx de la API) no dejaban rastro
-- consultable. La función escribe aquí con la clave de servicio antes de
-- enviar el correo; desde el navegador sólo el super admin puede leer.

create table public.error_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  reporter_user_id uuid references auth.users (id) on delete set null,
  reporter_email text,
  reporter_name text,
  module text check (char_length(module) <= 100),
  automatic boolean not null default false,
  message text not null check (char_length(message) between 1 and 4000),
  url text check (char_length(url) <= 2000),
  user_agent text check (char_length(user_agent) <= 1000),
  email_sent boolean not null default false
);

create index error_reports_created_at_idx on public.error_reports (created_at desc);

alter table public.error_reports enable row level security;

revoke all on public.error_reports from anon, authenticated;
grant select on public.error_reports to authenticated;

create policy error_reports_read on public.error_reports
  for select to authenticated
  using ((select public.is_superadmin()));
