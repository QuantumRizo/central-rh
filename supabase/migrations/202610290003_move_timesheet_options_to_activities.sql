insert into public.activities (name)
values ('Reportes Internos'), ('Presentaciones a Cliente')
on conflict (name) do update set active = true;

update public.clients
set active = false
where name in ('Reportes Internos', 'Presentaciones a Cliente');
