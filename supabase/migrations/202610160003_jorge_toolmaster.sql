-- Jorge: acceso a todas las tools (secciones Simi y CN Tools). Sigue siendo colaborador en RH.
insert into public.user_permissions (user_id, permission)
select id, 'toolmaster' from auth.users
where lower(email) = 'jorge@centraldenegociosmx.com'
on conflict do nothing;
