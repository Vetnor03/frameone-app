-- Ensure frame-scoped Local Events upserts have exact unique arbiters.
-- PostgREST/Supabase .upsert({ onConflict }) requires a non-partial unique
-- constraint or unique index that exactly matches the conflict columns.

-- Merge duplicate Local Events connection rows for the same frame/provider before
-- adding the exact unique index. Keep the most recently updated row, preferring a
-- connected row when timestamps tie, so changing location updates one shared row.
with ranked as (
  select
    id,
    row_number() over (
      partition by device_id, provider
      order by
        updated_at desc nulls last,
        case when status = 'connected' then 0 else 1 end,
        created_at desc nulls last,
        id desc
    ) as rn
  from public.user_integrations
  where device_id is not null
)
delete from public.user_integrations ui
using ranked r
where ui.id = r.id
  and r.rn > 1;

-- Merge duplicate imported Local Events rows for the same frame/provider/event.
-- Keep the newest copy so future syncs update that shared event row instead of
-- inserting duplicates for each frame member or location edit.
with ranked as (
  select
    id,
    row_number() over (
      partition by device_id, provider, external_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.integration_items
  where device_id is not null
)
delete from public.integration_items ii
using ranked r
where ii.id = r.id
  and r.rn > 1;

-- Replace the earlier partial unique indexes with exact non-partial unique
-- indexes matching the Supabase onConflict targets used by Local Events:
--   user_integrations: device_id,provider
--   integration_items: device_id,provider,external_id
-- Null device_id values are still allowed for legacy user-scoped rows; PostgreSQL
-- unique indexes allow multiple rows where any indexed column is null.
drop index if exists public.user_integrations_device_provider_unique_idx;
create unique index if not exists user_integrations_device_provider_unique_idx
  on public.user_integrations (device_id, provider);

drop index if exists public.integration_items_device_provider_external_idx;
create unique index if not exists integration_items_device_provider_external_idx
  on public.integration_items (device_id, provider, external_id);
