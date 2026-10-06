-- Members of loyalty programs and the wallet passes that carry their card.

create extension if not exists citext with schema extensions;

create type public.wallet_provider as enum ('apple', 'google');

-- Members ---------------------------------------------------------------------

-- A customer's membership in one program. Points belong to the member, not to
-- a pass: a member keeps them across passes (new phone, other wallet).
create table public.members (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  email extensions.citext not null check (
    char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+$'
  ),
  first_name text not null check (char_length(first_name) between 1 and 50),
  last_name text not null check (char_length(last_name) between 1 and 50),
  -- Set from the program's welcome points on insert.
  points integer not null check (points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_program_id_email_key unique (program_id, email)
);

comment on table public.members is 'Customers enrolled in a loyalty program. Emails are unique per program, case-insensitively.';

-- The unique constraint's index also serves the `program_id` foreign key.

create trigger members_set_updated_at
  before update on public.members
  for each row execute function private.set_updated_at();

-- New members start with the program's welcome points, whoever inserts them.
create function private.set_member_initial_points()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select programs.initial_points into new.points
  from public.programs
  where programs.id = new.program_id;
  return new;
end;
$$;

create trigger members_set_initial_points
  before insert on public.members
  for each row execute function private.set_member_initial_points();

-- Points are not insertable: the trigger sets them, and later changes go
-- through the points ledger.
revoke all on table public.members from anon, authenticated;
grant select on table public.members to authenticated;
grant insert (program_id, email, first_name, last_name) on table public.members to authenticated;
grant select, insert, update, delete on table public.members to service_role;

alter table public.members enable row level security;

create policy "Merchants can read their members"
  on public.members for select
  to authenticated
  using (
    program_id in (
      select programs.id from public.programs
      where programs.owner_id = (select auth.uid())
    )
  );

create policy "Merchants can add members to their programs"
  on public.members for insert
  to authenticated
  with check (
    program_id in (
      select programs.id from public.programs
      where programs.owner_id = (select auth.uid())
    )
  );

-- Wallet passes ---------------------------------------------------------------

create table public.wallet_passes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  provider public.wallet_provider not null,
  -- Content of the pass's QR code, scanned at checkout: 128 random bits.
  serial_number text not null unique
    default encode(extensions.gen_random_bytes(16), 'hex')
    check (serial_number ~ '^[0-9a-f]{32}$'),
  -- Secret of the pass, 256 random bits: Apple Wallet authenticates its web
  -- service calls with it, and the pass download link requires it.
  authentication_token text not null
    default encode(extensions.gen_random_bytes(32), 'hex')
    check (authentication_token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  -- Bumped whenever the pass content changes (Apple `passesUpdatedSince`).
  updated_at timestamptz not null default now()
);

comment on table public.wallet_passes is 'Apple or Google Wallet passes of a member. The Google object ID is {GOOGLE_ISSUER_ID}.{id}.';

create index wallet_passes_member_id_idx on public.wallet_passes (member_id);

create trigger wallet_passes_set_updated_at
  before update on public.wallet_passes
  for each row execute function private.set_updated_at();

-- The serial number and the token always come from the column defaults.
revoke all on table public.wallet_passes from anon, authenticated;
grant select on table public.wallet_passes to authenticated;
grant insert (member_id, provider) on table public.wallet_passes to authenticated;
grant select, insert, update, delete on table public.wallet_passes to service_role;

alter table public.wallet_passes enable row level security;

create policy "Merchants can read their members' passes"
  on public.wallet_passes for select
  to authenticated
  using (
    member_id in (
      select members.id
      from public.members
      join public.programs on programs.id = members.program_id
      where programs.owner_id = (select auth.uid())
    )
  );

create policy "Merchants can issue passes to their members"
  on public.wallet_passes for insert
  to authenticated
  with check (
    member_id in (
      select members.id
      from public.members
      join public.programs on programs.id = members.program_id
      where programs.owner_id = (select auth.uid())
    )
  );

-- Issuing passes --------------------------------------------------------------

-- Public enrollment, for the server only (no signed-in user): creates the
-- member and their first pass in one transaction. An email already enrolled
-- fails with a unique violation, so the public form never hands out an
-- existing member's pass. Returns no row for an unknown program.
create function public.enroll_member(
  program_id uuid,
  email extensions.citext,
  first_name text,
  last_name text,
  provider public.wallet_provider
)
returns table (serial_number text, authentication_token text)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  new_member_id uuid;
begin
  insert into public.members (program_id, email, first_name, last_name)
  select programs.id, enroll_member.email, enroll_member.first_name, enroll_member.last_name
  from public.programs
  where programs.id = enroll_member.program_id
  returning members.id into new_member_id;

  if new_member_id is null then
    return;
  end if;

  return query
    insert into public.wallet_passes (member_id, provider)
    values (new_member_id, enroll_member.provider)
    returning wallet_passes.serial_number, wallet_passes.authentication_token;
end;
$$;

revoke execute on function public.enroll_member from public, anon, authenticated;
grant execute on function public.enroll_member to service_role;

-- Manual issue by the program's merchant (RLS applies): issues a pass to the
-- member with this email, creating the member if needed. Returns no row for
-- an unknown or foreign program.
create function public.issue_wallet_pass(
  program_id uuid,
  email extensions.citext,
  first_name text,
  last_name text,
  provider public.wallet_provider
)
returns table (serial_number text, authentication_token text, member_created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  target_member_id uuid;
begin
  perform 1 from public.programs where programs.id = issue_wallet_pass.program_id;
  if not found then
    return;
  end if;

  insert into public.members (program_id, email, first_name, last_name)
  values (
    issue_wallet_pass.program_id,
    issue_wallet_pass.email,
    issue_wallet_pass.first_name,
    issue_wallet_pass.last_name
  )
  on conflict on constraint members_program_id_email_key do nothing
  returning members.id into target_member_id;

  member_created := target_member_id is not null;
  if not member_created then
    -- `citext` equality, spelled out: the empty search_path hides its operator.
    select members.id into target_member_id
    from public.members
    where members.program_id = issue_wallet_pass.program_id
      and members.email operator(extensions.=) issue_wallet_pass.email;
  end if;

  return query
    insert into public.wallet_passes (member_id, provider)
    values (target_member_id, issue_wallet_pass.provider)
    returning wallet_passes.serial_number, wallet_passes.authentication_token, member_created;
end;
$$;

revoke execute on function public.issue_wallet_pass from public, anon;
grant execute on function public.issue_wallet_pass to authenticated, service_role;
