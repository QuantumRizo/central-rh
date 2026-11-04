insert into public.clients (name)
values ('Reportes Internos')
on conflict (name) do nothing;
