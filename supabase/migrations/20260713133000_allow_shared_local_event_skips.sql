-- Allow Local Events skip state to be keyed by the shared canonical Local Events
-- occurrence instead of by a specific event provider. Existing Edge of Norway
-- skip rows remain valid for backward compatibility while new skip rows use
-- provider = 'local-events'.
alter table public.local_event_frame_skips
  drop constraint if exists local_event_frame_skips_provider_valid;

alter table public.local_event_frame_skips
  add constraint local_event_frame_skips_provider_valid
  check (provider in ('edge-of-norway', 'local-events'));
