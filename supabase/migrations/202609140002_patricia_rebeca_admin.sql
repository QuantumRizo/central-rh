insert into public.user_roles (user_id, role)
select auth_user_id, 'admin'
from public.employees
where full_name in ('Ibarra Arenas Patricia', 'Domínguez García Rebeca')
  and auth_user_id is not null
on conflict (user_id) do update set role = excluded.role;
