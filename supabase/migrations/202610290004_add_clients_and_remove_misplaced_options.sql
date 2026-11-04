insert into public.clients (name)
values ('New Business'), ('Colchones América')
on conflict (name) do update set active = true;

delete from public.clients c
where c.name in ('Reportes Internos', 'Presentaciones a Cliente')
  and not exists (
    select 1
    from public.timesheet_entries te
    where te.client_id = c.id
  );
