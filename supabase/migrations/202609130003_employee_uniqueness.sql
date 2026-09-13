create unique index if not exists employees_full_name_unique on public.employees (lower(btrim(full_name)));
