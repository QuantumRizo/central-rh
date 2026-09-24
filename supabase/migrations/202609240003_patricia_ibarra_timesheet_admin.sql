-- Patricia Ibarra Arenas: admin de timesheets (mismo nivel que Rebeca).
insert into public.user_roles (user_id, role)
select id, 'timesheet_admin' from auth.users
where lower(email) = 'ipatricia@centraldenegociosmx.com'
on conflict (user_id) do update set role = excluded.role;
