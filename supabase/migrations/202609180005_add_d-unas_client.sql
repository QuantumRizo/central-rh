insert into public.clients (name)
values ('D-Uñas')
on conflict (name) do nothing;
