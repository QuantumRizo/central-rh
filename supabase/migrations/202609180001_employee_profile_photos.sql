alter table public.employees add column if not exists avatar_path text;

create policy employees_update_own_avatar on public.employees
for update to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

grant update (avatar_path) on public.employees to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy profile_photos_select_own on storage.objects
for select to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy profile_photos_insert_own on storage.objects
for insert to authenticated
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy profile_photos_update_own on storage.objects
for update to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy profile_photos_delete_own on storage.objects
for delete to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
