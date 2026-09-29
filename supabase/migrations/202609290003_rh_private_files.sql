-- Private RH source files, including the original signature roster workbook.
create table public.rh_files (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('signature_roster')),
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (category, sha256)
);
alter table public.rh_files enable row level security;
create policy rh_files_admin_read on public.rh_files
for select to authenticated using (public.is_admin());
create policy rh_files_admin_insert on public.rh_files
for insert to authenticated with check (public.is_admin());
create policy rh_files_admin_delete on public.rh_files
for delete to authenticated using (public.is_admin());
grant select, insert, delete on public.rh_files to authenticated;
grant all on public.rh_files to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rh-private-files', 'rh-private-files', false, 10485760,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
create policy rh_private_files_admin_read on storage.objects
for select to authenticated using (bucket_id = 'rh-private-files' and public.is_admin());
create policy rh_private_files_admin_insert on storage.objects
for insert to authenticated with check (bucket_id = 'rh-private-files' and public.is_admin());
create policy rh_private_files_admin_delete on storage.objects
for delete to authenticated using (bucket_id = 'rh-private-files' and public.is_admin());
