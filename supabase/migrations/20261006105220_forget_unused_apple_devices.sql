-- Apple devices are only kept while they hold a pass: their push token and
-- identifier are customer data with no use without passes.

-- Registrations disappear when a device unregisters, and by cascade when a
-- pass, a program or a merchant's account is deleted. Security definer:
-- cascades run with the privileges of whoever deleted the parent row.
create function private.forget_unused_apple_devices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.apple_devices
  where apple_devices.id in (select removed.device_id from removed)
    and not exists (
      select 1 from public.apple_registrations
      where apple_registrations.device_id = apple_devices.id
    );
  return null;
end;
$$;

create trigger apple_registrations_forget_unused_devices
  after delete on public.apple_registrations
  referencing old table as removed
  for each statement execute function private.forget_unused_apple_devices();

-- The trigger now forgets devices without passes: this function no longer
-- does it itself.
create or replace function public.unregister_apple_device(
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
end;
$$;

-- Devices already left without passes by deleted programs.
delete from public.apple_devices
where not exists (
  select 1 from public.apple_registrations
  where apple_registrations.device_id = apple_devices.id
);
