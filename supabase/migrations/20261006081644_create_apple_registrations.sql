-- Install state of wallet passes, and the Apple devices that hold them.

-- Install state ---------------------------------------------------------------

-- A pass is installed while `installed_at` is set and `uninstalled_at` is not.
-- Apple passes: installed while at least one device is registered for them.
-- Google passes: from Google's save and delete callbacks.
alter table public.wallet_passes
  add column installed_at timestamptz,
  add column uninstalled_at timestamptz,
  add constraint wallet_passes_install_state_check check (
    uninstalled_at is null
    or (installed_at is not null and uninstalled_at >= installed_at)
  );

comment on column public.wallet_passes.installed_at is 'When the pass was last added to a wallet.';
comment on column public.wallet_passes.uninstalled_at is 'When the pass was removed from every wallet holding it; null while installed.';
comment on column public.wallet_passes.updated_at is 'Last change of the row, install state included. The pass content changes with its member and its program: its version is the latest of its created_at and their updated_at.';

-- Server only (wallet callbacks). Adding a wallet again starts a new install;
-- another device installing an installed pass changes nothing.
create function public.record_wallet_pass_install(pass_id uuid, installed boolean)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.wallet_passes
  set
    installed_at = case
      when not record_wallet_pass_install.installed then wallet_passes.installed_at
      when wallet_passes.installed_at is null or wallet_passes.uninstalled_at is not null then now()
      else wallet_passes.installed_at
    end,
    uninstalled_at = case
      when record_wallet_pass_install.installed then null
      else coalesce(wallet_passes.uninstalled_at, now())
    end
  where wallet_passes.id = record_wallet_pass_install.pass_id
    and (record_wallet_pass_install.installed or wallet_passes.installed_at is not null);
$$;

revoke execute on function public.record_wallet_pass_install from public, anon, authenticated;
grant execute on function public.record_wallet_pass_install to service_role;

-- Apple devices -----------------------------------------------------------------

-- Devices registered by Apple Wallet through the PassKit Web Service. Only the
-- server reaches them: RLS is on, without policies.
create table public.apple_devices (
  id uuid primary key default gen_random_uuid(),
  device_library_identifier text not null unique
    check (device_library_identifier ~ '^[A-Za-z0-9._-]{1,128}$'),
  -- APNs token: where to send "pass updated" pushes.
  push_token text not null check (push_token ~ '^[0-9A-Fa-f]{16,200}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.apple_devices is 'Apple Wallet devices holding passes, with their push token.';

create trigger apple_devices_set_updated_at
  before update on public.apple_devices
  for each row execute function private.set_updated_at();

create table public.apple_registrations (
  device_id uuid not null references public.apple_devices (id) on delete cascade,
  pass_id uuid not null references public.wallet_passes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (device_id, pass_id)
);

comment on table public.apple_registrations is 'Which Apple device holds which pass.';

-- The primary key serves `device_id`; this one serves `pass_id`.
create index apple_registrations_pass_id_idx on public.apple_registrations (pass_id);

revoke all on table public.apple_devices from anon, authenticated;
revoke all on table public.apple_registrations from anon, authenticated;
grant select, insert, update, delete on table public.apple_devices to service_role;
grant select, insert, delete on table public.apple_registrations to service_role;

alter table public.apple_devices enable row level security;
alter table public.apple_registrations enable row level security;

-- PassKit Web Service -------------------------------------------------------------

-- A device registers for a pass (Wallet added it). Records the latest push
-- token and the install. Returns whether the registration is new.
create function public.register_apple_device(
  device_library_identifier text,
  push_token text,
  pass_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  target_device_id uuid;
begin
  insert into public.apple_devices (device_library_identifier, push_token)
  values (register_apple_device.device_library_identifier, register_apple_device.push_token)
  on conflict on constraint apple_devices_device_library_identifier_key
    do update set push_token = excluded.push_token
  returning apple_devices.id into target_device_id;

  insert into public.apple_registrations (device_id, pass_id)
  values (target_device_id, register_apple_device.pass_id)
  on conflict do nothing;
  if not found then
    return false;
  end if;

  perform public.record_wallet_pass_install(register_apple_device.pass_id, true);
  return true;
end;
$$;

-- A device unregisters from a pass (Wallet removed it). The pass stays
-- installed while another device holds it; a device without passes is
-- forgotten, as Apple allows.
create function public.unregister_apple_device(
  device_library_identifier text,
  pass_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  target_device_id uuid;
begin
  -- Serializes with a concurrent registration of the same device.
  select apple_devices.id into target_device_id
  from public.apple_devices
  where apple_devices.device_library_identifier = unregister_apple_device.device_library_identifier
  for update;
  if target_device_id is null then
    return;
  end if;

  delete from public.apple_registrations
  where apple_registrations.device_id = target_device_id
    and apple_registrations.pass_id = unregister_apple_device.pass_id;
  if not found then
    return;
  end if;

  if not exists (
    select 1 from public.apple_registrations
    where apple_registrations.pass_id = unregister_apple_device.pass_id
  ) then
    perform public.record_wallet_pass_install(unregister_apple_device.pass_id, false);
  end if;

  delete from public.apple_devices
  where apple_devices.id = target_device_id
    and not exists (
      select 1 from public.apple_registrations
      where apple_registrations.device_id = target_device_id
    );
end;
$$;

-- Serial numbers of the device's passes whose content changed after
-- `updated_since` (all of them when null), with their content version.
-- `last_updated` is the latest version among them: Wallet sends it back as
-- `passesUpdatedSince` next time.
create function public.list_apple_device_passes(
  device_library_identifier text,
  updated_since timestamptz default null
)
returns table (serial_number text, last_updated timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select passes.serial_number, max(versions.updated_at) over () as last_updated
  from public.apple_devices as devices
  join public.apple_registrations as registrations on registrations.device_id = devices.id
  join public.wallet_passes as passes on passes.id = registrations.pass_id
  join public.members on members.id = passes.member_id
  join public.programs on programs.id = members.program_id
  cross join lateral (
    select greatest(passes.created_at, members.updated_at, programs.updated_at) as updated_at
  ) as versions
  where devices.device_library_identifier = list_apple_device_passes.device_library_identifier
    and (
      list_apple_device_passes.updated_since is null
      or versions.updated_at > list_apple_device_passes.updated_since
    );
$$;

revoke execute on function public.register_apple_device from public, anon, authenticated;
revoke execute on function public.unregister_apple_device from public, anon, authenticated;
revoke execute on function public.list_apple_device_passes from public, anon, authenticated;
grant execute on function public.register_apple_device to service_role;
grant execute on function public.unregister_apple_device to service_role;
grant execute on function public.list_apple_device_passes to service_role;
