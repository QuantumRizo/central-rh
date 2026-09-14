insert into public.user_roles (user_id, role)
select id, 'admin'
from auth.users
where lower(email) = 'carolina@centraldenegociosmx.com'
on conflict (user_id) do update set role = excluded.role;
