-- Points: the ledger of every change to a member's balance, and the functions
-- merchants use to change and list them.

-- Points ledger ----------------------------------------------------------------

create type public.point_transaction_kind as enum ('welcome', 'adjustment');

-- Append-only: rows only come from the triggers below, so the ledger always
-- explains the balance (the sum of a member's deltas is their points).
create table public.point_transactions (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  kind public.point_transaction_kind not null,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  -- The merchant who made the change; null for public enrollments.
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.point_transactions is 'Every change to a member''s points: welcome points, then additions and redemptions. Written by triggers on members.';

-- A member's history, newest first (`id` follows insertion order). Also
-- serves the `member_id` foreign key.
create index point_transactions_member_id_id_idx on public.point_transactions (member_id, id);
create index point_transactions_created_by_idx on public.point_transactions (created_by);

-- Members created before this migration only have their welcome points: no
-- path changed points until now.
insert into public.point_transactions (member_id, kind, delta, balance_after, created_at)
select members.id, 'welcome', members.points, members.points, members.created_at
from public.members
where members.points > 0;

-- Records a change of `members.points`. Security definer: merchants cannot
-- write to the ledger themselves, only change points.
create function private.record_point_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_points integer := 0;
begin
  if tg_op = 'UPDATE' then
    previous_points := old.points;
  end if;

  insert into public.point_transactions (member_id, kind, delta, balance_after, created_by)
  values (
    new.id,
    tg_argv[0]::public.point_transaction_kind,
    new.points - previous_points,
    new.points,
    auth.uid()
  );
  return null;
end;
$$;

create trigger members_record_welcome_points
  after insert on public.members
  for each row when (new.points > 0)
  execute function private.record_point_transaction('welcome');

create trigger members_record_point_changes
  after update of points on public.members
  for each row when (new.points <> old.points)
  execute function private.record_point_transaction('adjustment');

revoke all on table public.point_transactions from anon, authenticated, service_role;
grant select on table public.point_transactions to authenticated, service_role;

alter table public.point_transactions enable row level security;

create policy "Merchants can read their members' point transactions"
  on public.point_transactions for select
  to authenticated
  using (
    member_id in (
      select members.id
      from public.members
      join public.programs on programs.id = members.program_id
      where programs.owner_id = (select auth.uid())
    )
  );

-- Changing points -----------------------------------------------------------------

-- Merchants change their members' points; the ledger records each change,
-- and the new `updated_at` marks the member's passes as updated.
grant update (points) on table public.members to authenticated;

create policy "Merchants can update their members"
  on public.members for update
  to authenticated
  using (
    program_id in (
      select programs.id from public.programs
      where programs.owner_id = (select auth.uid())
    )
  )
  with check (
    program_id in (
      select programs.id from public.programs
      where programs.owner_id = (select auth.uid())
    )
  );

-- Adds `delta` points (removes them when negative) in one statement, so
-- concurrent changes add up. Returns the new balance, or null for an unknown
-- or foreign member. A balance below zero violates `members_points_check`.
create function public.adjust_points(member_id uuid, delta integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_points integer;
begin
  if adjust_points.delta = 0 then
    raise exception 'delta must not be zero' using errcode = 'invalid_parameter_value';
  end if;

  update public.members
  set points = members.points + adjust_points.delta
  where members.id = adjust_points.member_id
  returning members.points into new_points;

  return new_points;
end;
$$;

revoke execute on function public.adjust_points from public, anon;
grant execute on function public.adjust_points to authenticated, service_role;

-- Listing members -------------------------------------------------------------------

-- Newest first, page by page: pass the `created_at` and `id` of the last
-- member of a page to get the next one.
create index members_program_id_created_at_id_idx on public.members (program_id, created_at, id);

-- A page of the program's members, newest first, optionally only those whose
-- name or email contains `search` (case-insensitive, taken literally). Returns
-- table rows, so the Data API can embed their passes.
create function public.list_members(
  program_id uuid,
  search text default null,
  after_created_at timestamptz default null,
  after_id uuid default null,
  page_size integer default 25
)
returns setof public.members
language sql
stable
security invoker
set search_path = ''
as $$
  with query as (
    -- `%` and `_` are wildcards in `ilike` patterns: escape them.
    select '%' || replace(replace(replace(
      list_members.search, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  )
  select members.*
  from public.members, query
  where members.program_id = list_members.program_id
    and (
      list_members.search is null
      or (members.first_name || ' ' || members.last_name) ilike query.pattern
      or members.email::text ilike query.pattern
    )
    and (
      list_members.after_created_at is null
      or (members.created_at, members.id) < (list_members.after_created_at, list_members.after_id)
    )
  order by members.created_at desc, members.id desc
  limit least(greatest(list_members.page_size, 1), 100);
$$;

revoke execute on function public.list_members from public, anon;
grant execute on function public.list_members to authenticated, service_role;
