insert into public.clients (name)
values ('Presentaciones a Cliente')
on conflict (name) do nothing;
