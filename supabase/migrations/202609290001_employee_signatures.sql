-- Signed personnel documents are private and visible only to superadmins.
create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null check (kind in ('arien_letter', 'confidentiality_agreement')),
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, kind, sha256)
);
create index employee_documents_employee_kind_idx on public.employee_documents (employee_id, kind);
alter table public.employee_documents enable row level security;
create policy employee_documents_admin_read on public.employee_documents
for select to authenticated using (public.is_admin());
create policy employee_documents_admin_insert on public.employee_documents
for insert to authenticated with check (public.is_admin());
create policy employee_documents_admin_update on public.employee_documents
for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy employee_documents_admin_delete on public.employee_documents
for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.employee_documents to authenticated;
grant all on public.employee_documents to service_role;

create table public.employee_signature_registry (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  arien_status text not null default 'pending' check (arien_status in ('signed', 'pending', 'not_applicable')),
  cc_status text not null default 'pending' check (cc_status in ('signed', 'pending', 'not_applicable')),
  cc_fanny_status text not null default 'pending' check (cc_fanny_status in ('signed', 'pending', 'not_applicable')),
  note text,
  source_date date,
  updated_at timestamptz not null default now()
);
alter table public.employee_signature_registry enable row level security;
create policy employee_signature_registry_admin_read on public.employee_signature_registry
for select to authenticated using (public.is_admin());
create policy employee_signature_registry_admin_insert on public.employee_signature_registry
for insert to authenticated with check (public.is_admin());
create policy employee_signature_registry_admin_update on public.employee_signature_registry
for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.employee_signature_registry to authenticated;
grant all on public.employee_signature_registry to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-documents', 'employee-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf'];
create policy employee_documents_storage_admin_read on storage.objects
for select to authenticated using (bucket_id = 'employee-documents' and public.is_admin());
create policy employee_documents_storage_admin_insert on storage.objects
for insert to authenticated with check (bucket_id = 'employee-documents' and public.is_admin());
create policy employee_documents_storage_admin_delete on storage.objects
for delete to authenticated using (bucket_id = 'employee-documents' and public.is_admin());
