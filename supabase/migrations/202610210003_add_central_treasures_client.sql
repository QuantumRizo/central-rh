insert into public.clients (name)
values ('Central Treasures')
on conflict (name) do nothing;
