create table if not exists public.request_status_history (
  id bigint generated always as identity primary key,
  request_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists request_status_history_request_created_idx
  on public.request_status_history (request_id, created_at desc);

insert into public.request_status_history (request_id, user_id, old_status, new_status, created_at)
select requests.id::text, requests.user_id, null, requests.status, requests.created_at
from public.repair_requests as requests
where not exists (
  select 1
  from public.request_status_history as history
  where history.request_id = requests.id::text
);

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.request_status_history enable row level security;
alter table public.notifications enable row level security;

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

drop policy if exists "Users and staff can view request status history" on public.request_status_history;
create policy "Users and staff can view request status history"
  on public.request_status_history
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and role = 'manager'
    )
  );

drop policy if exists "Users can view their notifications" on public.notifications;
create policy "Users can view their notifications"
  on public.notifications
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can mark their notifications as read" on public.notifications;
create policy "Users can mark their notifications as read"
  on public.notifications
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.request_status_history from public, anon, authenticated;
grant select on public.request_status_history to authenticated;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

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

  if not exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('manager', 'admin')
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

create or replace function public.record_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  status_label text;
begin
  if tg_op = 'DELETE' then
    delete from public.request_status_history
    where request_id = old.id::text;
    delete from public.notifications
    where request_id = old.id::text;
    return old;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.request_status_history (
      request_id, user_id, old_status, new_status, changed_by
    )
    values (
      new.id::text,
      new.user_id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      (select auth.uid())
    );

    if tg_op = 'UPDATE' and new.user_id is not null then
      status_label := case new.status
        when 'new' then 'Нова'
        when 'in_progress' then 'У роботі'
        when 'waiting' then 'Очікує відповіді'
        when 'completed' then 'Завершена'
        when 'rejected' then 'Відхилена'
        else new.status
      end;

      insert into public.notifications (user_id, request_id, title, body)
      values (
        new.user_id,
        new.id::text,
        'Оновлено статус заявки',
        format('Заявка «%s»: новий статус — %s.', new.title, status_label)
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.record_request_status_change() from public, anon, authenticated;

drop trigger if exists record_request_status_change on public.repair_requests;
create trigger record_request_status_change
  after insert or update of status or delete on public.repair_requests
  for each row execute function public.record_request_status_change();

notify pgrst, 'reload schema';
