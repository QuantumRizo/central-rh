create or replace function public.email_is_registered(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(btrim(p_email))
  );
$$;

revoke all on function public.email_is_registered(text) from public;
grant execute on function public.email_is_registered(text) to anon, authenticated;
