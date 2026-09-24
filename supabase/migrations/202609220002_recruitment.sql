-- Reclutamiento: los currículums y las evaluaciones sólo son visibles para admins.
create table public.recruitment_positions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 2 and 160),
  description text not null default '',
  required_criteria text not null default '',
  preferred_criteria text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recruitment_candidates (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('email', 'manual')),
  source_message_id text unique,
  sender_email text,
  received_at timestamptz not null default now(),
  full_name text not null default 'Por identificar',
  email text,
  phone text,
  summary text not null default '',
  experience_summary text not null default '',
  skills text[] not null default '{}',
  document_path text,
  document_name text,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processed', 'needs_review', 'failed')),
  processing_error text,
  stage text not null default 'new' check (stage in ('new', 'reviewing', 'interview', 'rejected', 'hired')),
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recruitment_matches (
  candidate_id uuid not null references public.recruitment_candidates(id) on delete cascade,
  position_id uuid not null references public.recruitment_positions(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  matched_criteria text[] not null default '{}',
  missing_criteria text[] not null default '{}',
  rationale text not null default '',
  assessed_at timestamptz not null default now(),
  primary key (candidate_id, position_id)
);

create index recruitment_candidates_received_idx on public.recruitment_candidates(received_at desc);
create index recruitment_matches_position_score_idx on public.recruitment_matches(position_id, score desc);
create trigger recruitment_positions_updated_at before update on public.recruitment_positions
for each row execute function public.set_evaluation_updated_at();
create trigger recruitment_candidates_updated_at before update on public.recruitment_candidates
for each row execute function public.set_evaluation_updated_at();

alter table public.recruitment_positions enable row level security;
alter table public.recruitment_candidates enable row level security;
alter table public.recruitment_matches enable row level security;

create policy recruitment_positions_admin on public.recruitment_positions for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy recruitment_candidates_admin on public.recruitment_candidates for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy recruitment_matches_admin on public.recruitment_matches for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.recruitment_positions, public.recruitment_candidates, public.recruitment_matches to authenticated;
grant all on public.recruitment_positions, public.recruitment_candidates, public.recruitment_matches to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recruitment-cvs', 'recruitment-cvs', false, 10485760, array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

create policy recruitment_cvs_admin_select on storage.objects for select to authenticated
using (bucket_id = 'recruitment-cvs' and public.is_admin());
create policy recruitment_cvs_admin_insert on storage.objects for insert to authenticated
with check (bucket_id = 'recruitment-cvs' and public.is_admin());
create policy recruitment_cvs_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'recruitment-cvs' and public.is_admin());
