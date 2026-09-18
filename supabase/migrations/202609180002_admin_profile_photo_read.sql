-- Los administradores pueden ver la foto de cada colaborador en su perfil.
-- La escritura y eliminación continúan reservadas al dueño de la foto.
create policy profile_photos_admin_select on storage.objects
for select to authenticated
using (bucket_id = 'profile-photos' and public.is_admin());
