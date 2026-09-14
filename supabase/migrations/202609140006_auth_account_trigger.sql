alter table public.employees add column if not exists email text;

create unique index if not exists employees_email_unique
  on public.employees (lower(btrim(email)))
  where email is not null;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(btrim(new.raw_user_meta_data->>'full_name'), '');
begin
  v_name := coalesce(v_name, split_part(new.email, '@', 1), 'Nuevo colaborador');

  insert into public.user_roles (user_id, role)
  values (new.id, 'collaborator')
  on conflict (user_id) do nothing;

  update public.employees
  set auth_user_id = new.id, email = new.email
  where auth_user_id is null
    and lower(btrim(full_name)) = lower(v_name);

  if not found then
    insert into public.employees (full_name, position, status, email, auth_user_id)
    values (v_name, 'Por asignar', 'Activo', new.email, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();
