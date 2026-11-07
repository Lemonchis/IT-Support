create or replace function public.update_my_profile(p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_full_name is null or length(btrim(p_full_name)) = 0 or length(btrim(p_full_name)) > 100 then
    raise exception 'Name must contain between 1 and 100 characters.';
  end if;

  update public.profiles
  set full_name = btrim(p_full_name)
  where id = current_user_id;

  if not found then
    raise exception 'Profile not found.';
  end if;
end;
$$;

revoke all on function public.update_my_profile(text) from public, anon;
grant execute on function public.update_my_profile(text) to authenticated;

notify pgrst, 'reload schema';
