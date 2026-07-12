create table if not exists public.local_event_frame_skips (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  provider text not null,
  external_event_id text not null,
  skipped boolean not null default true,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint local_event_frame_skips_provider_valid check (provider in ('edge-of-norway')),
  constraint local_event_frame_skips_external_id_not_empty check (char_length(btrim(external_event_id)) > 0),
  unique(device_id, provider, external_event_id)
);

-- If an earlier failed manual run created the table with device_id as uuid,
-- remove that incompatible FK/type so policies can compare to device_members.device_id (text).
alter table public.local_event_frame_skips
  drop constraint if exists local_event_frame_skips_device_id_fkey;

alter table public.local_event_frame_skips
  alter column device_id type text using device_id::text;

create index if not exists local_event_frame_skips_device_provider_idx
  on public.local_event_frame_skips(device_id, provider);

alter table public.local_event_frame_skips enable row level security;

drop policy if exists "Members can read local event frame skips" on public.local_event_frame_skips;
create policy "Members can read local event frame skips"
on public.local_event_frame_skips
for select
using (
  exists (
    select 1 from public.device_members dm
    where dm.device_id = local_event_frame_skips.device_id
      and dm.user_id = auth.uid()
  )
);

drop policy if exists "Members can insert local event frame skips" on public.local_event_frame_skips;
create policy "Members can insert local event frame skips"
on public.local_event_frame_skips
for insert
with check (
  exists (
    select 1 from public.device_members dm
    where dm.device_id = local_event_frame_skips.device_id
      and dm.user_id = auth.uid()
  )
);

drop policy if exists "Members can update local event frame skips" on public.local_event_frame_skips;
create policy "Members can update local event frame skips"
on public.local_event_frame_skips
for update
using (
  exists (
    select 1 from public.device_members dm
    where dm.device_id = local_event_frame_skips.device_id
      and dm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.device_members dm
    where dm.device_id = local_event_frame_skips.device_id
      and dm.user_id = auth.uid()
  )
);

drop policy if exists "Members can delete local event frame skips" on public.local_event_frame_skips;
create policy "Members can delete local event frame skips"
on public.local_event_frame_skips
for delete
using (
  exists (
    select 1 from public.device_members dm
    where dm.device_id = local_event_frame_skips.device_id
      and dm.user_id = auth.uid()
  )
);
