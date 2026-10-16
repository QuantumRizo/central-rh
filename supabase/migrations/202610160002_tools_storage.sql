-- Tools en el mismo proyecto que RH. Los schemas de cada herramienta (alcance, flow,
-- street_planner, inversion, competencia y simi_admin) se copiaron del antiguo proyecto
-- "Central Data Dashboards"; su definición vive en el repositorio de cada herramienta.
-- Aquí sólo se fija lo que comparten con la plataforma: nombres y archivos.

-- El schema de bitácora de Simi se llamaba "admin": demasiado genérico junto a RH.
alter schema admin rename to simi_admin;

-- Excel de Curvas de alcance. Sin políticas: la Edge Function `alcance` firma las URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('alcance-excel', 'alcance-excel', false, 2000000,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- Excel que el /admin de los dashboards de Simi sube antes de importarlo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('simi-imports', 'simi-imports', false, 52428800,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy simi_imports_toolmaster_select on storage.objects for select to authenticated
  using (bucket_id = 'simi-imports' and public.is_toolmaster());
create policy simi_imports_toolmaster_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'simi-imports' and public.is_toolmaster());
create policy simi_imports_toolmaster_update on storage.objects for update to authenticated
  using (bucket_id = 'simi-imports' and public.is_toolmaster());
create policy simi_imports_toolmaster_delete on storage.objects for delete to authenticated
  using (bucket_id = 'simi-imports' and public.is_toolmaster());
