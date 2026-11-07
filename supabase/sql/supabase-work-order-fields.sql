-- Apply after supabase-schema.sql; run supabase-request-notifications.sql for status history and alerts.

alter table public.profiles
  add column if not exists phone text;

alter table public.repair_requests
  add column if not exists due_at timestamptz,
  add column if not exists fault_cause text,
  add column if not exists resolution text,
  add column if not exists contact_phone text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.repair_requests
  alter column status set default 'new',
  alter column priority set default 'medium',
  alter column created_at set default now();

alter table public.profiles enable row level security;
alter table public.repair_requests enable row level security;

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

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.is_manager()
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
      and role = 'manager'
  );
$$;

revoke all on function public.is_manager() from public, anon;
grant execute on function public.is_manager() to authenticated;

drop policy if exists "Managers can view requester profiles" on public.profiles;
create policy "Managers can view requester profiles"
  on public.profiles
  for select
  to authenticated
  using ((select public.is_manager()));

drop policy if exists "Restrict profile reads by role" on public.profiles;
create policy "Restrict profile reads by role"
  on public.profiles
  as restrictive
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_manager())
  );

drop policy if exists "Restrict profile updates to administrators" on public.profiles;
create policy "Restrict profile updates to administrators"
  on public.profiles
  as restrictive
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
  on public.profiles
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Restrict profile deletes to administrators" on public.profiles;
create policy "Restrict profile deletes to administrators"
  on public.profiles
  as restrictive
  for delete
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "Restrict profile inserts to own user role" on public.profiles;
create policy "Restrict profile inserts to own user role"
  on public.profiles
  as restrictive
  for insert
  to authenticated
  with check (
    (id = (select auth.uid()) and role = 'user')
    or (select public.is_admin())
  );

drop policy if exists "Users can view their own repair requests" on public.repair_requests;
create policy "Users can view their own repair requests"
  on public.repair_requests
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can create their own repair requests" on public.repair_requests;
create policy "Users can create their own repair requests"
  on public.repair_requests
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'new'
    and priority = 'medium'
  );

drop policy if exists "Managers can view all repair requests" on public.repair_requests;
create policy "Managers can view all repair requests"
  on public.repair_requests
  for select
  to authenticated
  using ((select public.is_manager()));

drop policy if exists "Managers can update repair work fields" on public.repair_requests;
create policy "Managers can update repair work fields"
  on public.repair_requests
  for update
  to authenticated
  using ((select public.is_manager()))
  with check ((select public.is_manager()));

drop policy if exists "Restrict request reads by role" on public.repair_requests;
create policy "Restrict request reads by role"
  on public.repair_requests
  as restrictive
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or (select public.is_manager())
  );

drop policy if exists "Restrict request inserts to own new requests" on public.repair_requests;
create policy "Restrict request inserts to own new requests"
  on public.repair_requests
  as restrictive
  for insert
  to authenticated
  with check (
    (user_id = (select auth.uid()) and status = 'new' and priority = 'medium')
    or (select public.is_admin())
  );

drop policy if exists "Restrict request updates to staff" on public.repair_requests;
create policy "Restrict request updates to staff"
  on public.repair_requests
  as restrictive
  for update
  to authenticated
  using ((select public.is_admin()) or (select public.is_manager()))
  with check ((select public.is_admin()) or (select public.is_manager()));

drop policy if exists "Restrict request deletes to administrators" on public.repair_requests;
create policy "Restrict request deletes to administrators"
  on public.repair_requests
  as restrictive
  for delete
  to authenticated
  using ((select public.is_admin()));

revoke update on public.repair_requests from public, anon, authenticated;
grant update (status, priority, due_at, fault_cause, resolution, admin_comment)
  on public.repair_requests to authenticated;
revoke update on public.profiles from public, anon, authenticated;
grant update (role) on public.profiles to authenticated;
revoke insert on public.repair_requests from public, anon, authenticated;
grant insert (user_id, title, equipment_type, inventory_number, location, description, contact_phone, status, priority)
  on public.repair_requests to authenticated;
grant select on public.repair_requests, public.profiles to authenticated;

create or replace function public.update_request_status(p_request_id text, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.';
  end if;

  if not (
    (select public.is_admin())
    or (select public.is_manager())
  ) then
    raise exception 'Only managers and administrators can change request status.';
  end if;

  if p_status not in ('new', 'in_progress', 'waiting', 'completed', 'rejected') then
    raise exception 'Invalid request status.';
  end if;

  update public.repair_requests
  set status = p_status
  where id::text = p_request_id;

  if not found then
    raise exception 'Request not found.';
  end if;
end;
$$;

revoke all on function public.update_request_status(text, text) from public, anon;
grant execute on function public.update_request_status(text, text) to authenticated;

create or replace function public.update_my_contact(p_full_name text, p_phone text)
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

  if p_phone is not null and length(btrim(p_phone)) > 30 then
    raise exception 'Phone number must be 30 characters or fewer.';
  end if;

  update public.profiles
  set full_name = btrim(p_full_name),
      phone = nullif(btrim(coalesce(p_phone, '')), '')
  where id = current_user_id;

  if not found then
    raise exception 'Profile not found.';
  end if;
end;
$$;

revoke all on function public.update_my_contact(text, text) from public, anon;
grant execute on function public.update_my_contact(text, text) to authenticated;

create or replace function public.set_repair_request_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_repair_request_updated_at() from public, anon, authenticated;

drop trigger if exists set_repair_request_updated_at on public.repair_requests;
create trigger set_repair_request_updated_at
  before update on public.repair_requests
  for each row execute function public.set_repair_request_updated_at();

notify pgrst, 'reload schema';
