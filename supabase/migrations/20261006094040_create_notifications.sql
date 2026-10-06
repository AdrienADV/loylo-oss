-- Marketing messages: the program's current message, shown on every pass, and
-- the history of messages sent, with the sending rules.

-- Current message -------------------------------------------------------------

-- Set only by `create_notification`: merchants cannot update it directly (the
-- column grants of programs leave it out), so every change follows the rules.
alter table public.programs
  add column wallet_message text check (
    char_length(wallet_message) between 1 and 100 and btrim(wallet_message) <> ''
  );

comment on column public.programs.wallet_message is 'Latest message sent to the program''s passes, shown on every pass. Set by create_notification.';

-- Messages sent -----------------------------------------------------------------

create table public.notifications (
  id bigint generated always as identity primary key,
  program_id uuid not null references public.programs (id) on delete cascade,
  message text not null check (
    char_length(message) between 1 and 100 and btrim(message) <> ''
  ),
  sent_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.notifications is 'Messages sent to every pass of a program. At most one per 24 hours, and a monthly cap.';

-- History and sending rules of a program; also serves the `program_id` foreign key.
create index notifications_program_id_created_at_idx on public.notifications (program_id, created_at);
create index notifications_sent_by_idx on public.notifications (sent_by);

-- Append-only, written by `create_notification` on the server.
revoke all on table public.notifications from anon, authenticated, service_role;
grant select on table public.notifications to authenticated;
grant select, insert on table public.notifications to service_role;

alter table public.notifications enable row level security;

create policy "Merchants can read their programs' notifications"
  on public.notifications for select
  to authenticated
  using (
    program_id in (
      select programs.id from public.programs
      where programs.owner_id = (select auth.uid())
    )
  );

-- Sending rules -------------------------------------------------------------------

-- Messages sent this calendar month (UTC), and when the last one was sent.
create function public.notification_usage(program_id uuid)
returns table (sent_this_month integer, last_sent_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (count(*) filter (
      where notifications.created_at >= date_trunc('month', now(), 'UTC')
    ))::integer,
    max(notifications.created_at)
  from public.notifications
  where notifications.program_id = notification_usage.program_id;
$$;

revoke execute on function public.notification_usage from public, anon;
grant execute on function public.notification_usage to authenticated, service_role;

-- Records a message and makes it the program's current message, if the rules
-- allow it: one message per 24 hours, at most `monthly_cap` per month. Raises
-- `LY001` (too soon) or `LY002` (monthly cap reached); returns no row for an
-- unknown program.
--
-- Server only: the cap is the deployment's setting (NOTIFICATIONS_MONTHLY_CAP),
-- so merchants cannot choose it. The server checks that the program is the
-- merchant's before calling it.
create function public.create_notification(
  program_id uuid,
  message text,
  sent_by uuid,
  monthly_cap integer
)
returns setof public.notifications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  usage record;
begin
  -- Concurrent sends for the program wait here, then see this one.
  perform 1 from public.programs
  where programs.id = create_notification.program_id
  for update;
  if not found then
    return;
  end if;

  select * into usage from public.notification_usage(create_notification.program_id);
  if usage.last_sent_at > now() - interval '24 hours' then
    raise exception 'A message was sent less than 24 hours ago'
      using errcode = 'LY001';
  end if;
  if usage.sent_this_month >= create_notification.monthly_cap then
    raise exception 'The monthly message cap is reached'
      using errcode = 'LY002';
  end if;

  -- Also bumps `programs.updated_at`, which marks every pass as updated.
  update public.programs
  set wallet_message = create_notification.message
  where programs.id = create_notification.program_id;

  return query
    insert into public.notifications (program_id, message, sent_by)
    values (create_notification.program_id, create_notification.message, create_notification.sent_by)
    returning *;
end;
$$;

revoke execute on function public.create_notification from public, anon, authenticated;
grant execute on function public.create_notification to service_role;

-- Apple devices of a program -------------------------------------------------------

-- Every Apple device holding passes of the program, with those passes: one
-- push per device tells it about all of them. Server only, like the devices.
create function public.list_program_apple_devices(program_id uuid)
returns table (device_library_identifier text, push_token text, pass_ids uuid[])
language sql
stable
security invoker
set search_path = ''
as $$
  select devices.device_library_identifier, devices.push_token, array_agg(passes.id)
  from public.apple_devices as devices
  join public.apple_registrations as registrations on registrations.device_id = devices.id
  join public.wallet_passes as passes on passes.id = registrations.pass_id
  join public.members on members.id = passes.member_id
  where members.program_id = list_program_apple_devices.program_id
  group by devices.id
  order by devices.device_library_identifier;
$$;

revoke execute on function public.list_program_apple_devices from public, anon, authenticated;
grant execute on function public.list_program_apple_devices to service_role;
