-- Sanitized status import from the 2026-09-28 Arien roster. The source workbook's
-- account and password columns are deliberately excluded.
do $$
declare imported_count integer;
begin
  with source(full_name, arien_status, note) as (
    values
      ('Rebeca Domínguez García', 'not_applicable', 'El PDF tiene una pestaña amarilla.'),
      ('Jesús Manuel Morán Arvizu', 'signed', null),
      ('Jazmín Araceli Cruz Ocampo', 'signed', null),
      ('Agustín Santiago Valentinez', 'signed', null),
      ('Irais De León Clorio', 'signed', null),
      ('Arturo Pérez Gutiérrez', 'signed', null),
      ('Alejandro David Méndez López', 'signed', null),
      ('Diego Armando Negrete González', 'signed', null),
      ('Edmundo González Chávez', 'signed', null),
      ('Diana Ortiz Colín', 'signed', null),
      ('Brenda Gabriela De Viana Cruz', 'signed', null),
      ('Vania Marleth Galeana Ruiz', 'not_applicable', null),
      ('Karla Daniela Padilla Silva', 'signed', null),
      ('Patricia Ibarra Arenas', 'signed', null),
      ('Martha Patricia Martínez Trujillo', 'not_applicable', null),
      ('Ely Cristel Hernández Cagal', 'not_applicable', null),
      ('Félix David Rizo Serrano', 'not_applicable', null),
      ('Jorge Luis Rodríguez Mondragón', 'not_applicable', null),
      ('Luz Fernanda Altamirano Reyes', 'not_applicable', null)
  )
  insert into public.employee_signature_registry
    (employee_id, arien_status, cc_status, cc_fanny_status, note, source_date)
  select e.id, s.arien_status, 'signed', 'signed', s.note, date '2026-09-28'
  from source s join public.employees e on e.full_name = s.full_name
  on conflict (employee_id) do nothing;

  select count(*) into imported_count from public.employee_signature_registry where source_date = date '2026-09-28';
  if imported_count <> 19 then
    raise exception 'Expected 19 signature roster entries, found %', imported_count;
  end if;
end $$;
