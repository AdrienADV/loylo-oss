-- Loyalty programs, owned by merchants, and the storage bucket for their images.

-- Internal helpers live outside the schemas exposed by the Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Programs ------------------------------------------------------------------

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 64),
  background_color text not null check (background_color ~ '^#[0-9a-f]{6}$'),
  -- Folder of the program's images in the `program-assets` bucket.
  logo_path text check (char_length(logo_path) between 1 and 512),
  -- Points granted to every new member.
  initial_points integer not null default 0 check (initial_points between 0 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.programs is 'Loyalty programs. Each one is a pass design that members add to Apple or Google Wallet.';

create index programs_owner_id_idx on public.programs (owner_id);

create trigger programs_set_updated_at
  before update on public.programs
  for each row execute function private.set_updated_at();

-- Access is opt-in: the Data API only reaches what is granted here, and RLS
-- then limits merchants to their own programs. Column grants keep `owner_id`,
-- `created_at` and `updated_at` under the database's control.
revoke all on table public.programs from anon, authenticated;
grant select, delete on table public.programs to authenticated;
grant insert (id, name, background_color, logo_path, initial_points) on table public.programs to authenticated;
grant update (name, background_color, logo_path, initial_points) on table public.programs to authenticated;
grant select, insert, update, delete on table public.programs to service_role;

alter table public.programs enable row level security;

create policy "Merchants can read their programs"
  on public.programs for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Merchants can create their programs"
  on public.programs for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Merchants can update their programs"
  on public.programs for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Merchants can delete their programs"
  on public.programs for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- Program images --------------------------------------------------------------

-- Public: Google Wallet downloads program logos from their URL. Images are
-- resized to PNG in the browser before upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('program-assets', 'program-assets', true, 1048576, array['image/png']);

-- Merchants manage files under their own folder: `{owner_id}/{program_id}/...`.
-- Replacing a file (upsert) needs the select, insert and update policies.
create policy "Merchants can read their program assets"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'program-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Merchants can upload their program assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'program-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Merchants can replace their program assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'program-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'program-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Merchants can delete their program assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'program-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
