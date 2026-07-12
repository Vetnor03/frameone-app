-- Scope Local Events connections and imported events to a frame (device), not a single user.

alter table public.user_integrations
  add column if not exists device_id text;

alter table public.integration_items
  add column if not exists device_id text;

create index if not exists user_integrations_device_provider_idx
  on public.user_integrations (device_id, provider);

create index if not exists integration_items_device_provider_priority_starts_idx
  on public.integration_items (device_id, provider, priority, starts_at)
  where device_id is not null;

-- Best-effort migration: attach existing user-scoped Local Events data to a frame the user manages,
-- or otherwise the first frame they are a member of. The unique indexes prevent duplicate frame imports.
with candidate_frames as (
  select distinct on (dm.user_id)
    dm.user_id,
    dm.device_id
  from public.device_members dm
  order by dm.user_id,
    case when dm.role in ('owner', 'admin') then 0 else 1 end,
    dm.device_id
)
update public.user_integrations ui
set device_id = cf.device_id,
    encrypted_credentials = coalesce(ui.encrypted_credentials, '{}'::jsonb) || jsonb_build_object('scope', 'frame'),
    updated_at = now()
from candidate_frames cf
where ui.provider = 'edge-of-norway'
  and ui.device_id is null
  and ui.user_id = cf.user_id;

with candidate_frames as (
  select distinct on (dm.user_id)
    dm.user_id,
    dm.device_id
  from public.device_members dm
  order by dm.user_id,
    case when dm.role in ('owner', 'admin') then 0 else 1 end,
    dm.device_id
)
update public.integration_items ii
set device_id = cf.device_id,
    raw = coalesce(ii.raw, '{}'::jsonb) || jsonb_build_object('scope', 'frame'),
    updated_at = now()
from candidate_frames cf
where ii.provider = 'edge-of-norway'
  and ii.device_id is null
  and ii.user_id = cf.user_id;

-- Remove duplicate Local Events rows after attaching them to the frame, keeping the newest copy.
delete from public.integration_items victim
using public.integration_items keeper
where victim.provider = 'edge-of-norway'
  and keeper.provider = 'edge-of-norway'
  and victim.device_id is not null
  and keeper.device_id = victim.device_id
  and keeper.external_id = victim.external_id
  and keeper.id <> victim.id
  and (keeper.updated_at, keeper.id) > (victim.updated_at, victim.id);

-- Remove duplicate frame connection rows, keeping the newest copy.
delete from public.user_integrations victim
using public.user_integrations keeper
where victim.provider = 'edge-of-norway'
  and keeper.provider = 'edge-of-norway'
  and victim.device_id is not null
  and keeper.device_id = victim.device_id
  and keeper.id <> victim.id
  and (keeper.updated_at, keeper.id) > (victim.updated_at, victim.id);


create unique index if not exists user_integrations_device_provider_unique_idx
  on public.user_integrations (device_id, provider)
  where device_id is not null;

create unique index if not exists integration_items_device_provider_external_idx
  on public.integration_items (device_id, provider, external_id)
  where device_id is not null;

-- RLS: existing own-user policies remain for personal integrations. Add frame-member read access
-- for frame-scoped Local Events connections and imported events.
drop policy if exists "Frame members can read frame local event status" on public.user_integrations;
create policy "Frame members can read frame local event status"
on public.user_integrations
for select
using (
  provider = 'edge-of-norway'
  and device_id is not null
  and exists (
    select 1 from public.device_members dm
    where dm.device_id = user_integrations.device_id
      and dm.user_id = auth.uid()
  )
);

drop policy if exists "Frame members can read frame local event items" on public.integration_items;
create policy "Frame members can read frame local event items"
on public.integration_items
for select
using (
  provider = 'edge-of-norway'
  and device_id is not null
  and exists (
    select 1 from public.device_members dm
    where dm.device_id = integration_items.device_id
      and dm.user_id = auth.uid()
  )
);
