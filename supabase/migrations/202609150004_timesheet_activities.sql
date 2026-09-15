insert into public.activities (name, active)
values
  ('Desarrollo de software', true),
  ('Análisis de datos', true)
on conflict (name) do update
set active = true;
