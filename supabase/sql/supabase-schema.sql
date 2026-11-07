create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  role text not null default 'user' check (role in ('user', 'manager', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;

alter table public.profiles
  add column if not exists full_name text not null default '',
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists role text not null default 'user',
  add column if not exists created_at timestamptz not null default now();

insert into public.profiles (id, full_name, email, role)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'full_name', ''),
  users.email,
  'user'
from auth.users as users
on conflict (id) do nothing;

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

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

create policy "Admins can view all profiles"
  on public.profiles
  for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "Users can create their own user profile" on public.profiles;
create policy "Users can create their own user profile"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id and role = 'user');

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
  on public.profiles
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete profiles" on public.profiles;
create policy "Admins can delete profiles"
  on public.profiles
  for delete
  to authenticated
  using ((select public.is_admin()));

alter table public.repair_requests enable row level security;

drop policy if exists "Admins can manage repair requests" on public.repair_requests;
create policy "Admins can manage repair requests"
  on public.repair_requests
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

notify pgrst, 'reload schema';
