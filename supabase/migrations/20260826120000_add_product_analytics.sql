-- First-party, privacy-conscious telemetry used only to improve RE:MIND.
-- Generic events must never contain user content. Sanitized unsupported
-- Assistant requests are the deliberately narrow, de-identified exception.
create table public.product_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  client_id text not null,
  frame_device_id text,
  session_id text not null,
  event_name text not null,
  surface text,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint analytics_event_name_shape check (event_name ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint analytics_session_shape check (length(session_id) between 1 and 80 and session_id ~ '^[A-Za-z0-9._:-]+$'),
  constraint analytics_client_shape check (length(client_id) between 1 and 80 and client_id ~ '^[A-Za-z0-9._:-]+$'),
  constraint analytics_frame_device_shape check (frame_device_id is null or (length(frame_device_id) between 1 and 80 and frame_device_id ~ '^[A-Za-z0-9._:-]+$')),
  constraint analytics_surface_shape check (surface is null or (length(surface) between 1 and 40 and surface ~ '^[a-z][a-z0-9_-]*$')),
  constraint analytics_source_values check (source is null or source in ('manual', 'assistant')),
  constraint analytics_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint analytics_metadata_size check (octet_length(metadata::text) <= 2048)
);
create index product_analytics_created_at_idx on public.product_analytics_events(created_at desc);
create index product_analytics_event_name_idx on public.product_analytics_events(event_name, created_at desc);
create index product_analytics_user_id_idx on public.product_analytics_events(user_id, created_at desc) where user_id is not null;
create index product_analytics_client_id_idx on public.product_analytics_events(client_id, created_at desc);
create index product_analytics_frame_device_id_idx on public.product_analytics_events(frame_device_id, created_at desc) where frame_device_id is not null;
alter table public.product_analytics_events enable row level security;

-- Deliberately contains no user/frame identifier because sanitized free text can
-- still contain names or addresses. created_at supports later retention deletion.
create table public.assistant_capability_gaps (
  id uuid primary key default gen_random_uuid(),
  request_text text not null check (length(request_text) between 1 and 280),
  normalized_text text not null check (length(normalized_text) between 1 and 280),
  language text check (language in ('en', 'no')),
  reason text not null check (reason in ('classifier_unsupported', 'unknown_capability')),
  created_at timestamptz not null default now()
);
create index assistant_capability_gaps_created_at_idx on public.assistant_capability_gaps(created_at desc);
create index assistant_capability_gaps_normalized_idx on public.assistant_capability_gaps(normalized_text, created_at desc);
alter table public.assistant_capability_gaps enable row level security;

-- The tables have no client policies or grants. This definer RPC is the sole
-- authenticated write boundary and derives user_id exclusively from auth.uid().
create function public.record_product_analytics_event(
  p_event_name text, p_session_id text, p_client_id text,
  p_frame_device_id text default null, p_surface text default null,
  p_source text default null, p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  caller_id uuid := auth.uid();
  allowed_events constant text[] := array[
    'session_started','tab_opened','frame_preview_opened','assistant_opened',
    'assistant_request_completed','assistant_request_needs_input','assistant_request_unsupported','assistant_request_error',
    'reminder_created','grocery_item_added','recipe_created','recipe_added_to_groceries','dinner_plan_opened',
    'surf_opened','custom_spot_started','custom_spot_completed','layout_selected','frame_update_requested',
    'theme_changed','language_changed','connection_started','connection_completed','connection_failed'
  ];
  allowed_keys constant text[] := array['tab','provider','recurring','layoutType','capabilityId','helpTopicId','resolver','followupCount','outcome','errorType'];
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_event_name is null or not (p_event_name = any(allowed_events)) then raise exception 'invalid event'; end if;
  if p_session_id is null or length(p_session_id) not between 1 and 80 or p_session_id !~ '^[A-Za-z0-9._:-]+$' then raise exception 'invalid session id'; end if;
  if p_client_id is null or length(p_client_id) not between 1 and 80 or p_client_id !~ '^[A-Za-z0-9._:-]+$' then raise exception 'invalid client id'; end if;
  if p_frame_device_id is not null and (length(p_frame_device_id) not between 1 and 80 or p_frame_device_id !~ '^[A-Za-z0-9._:-]+$') then raise exception 'invalid frame device id'; end if;
  if p_surface is not null and (length(p_surface) not between 1 and 40 or p_surface !~ '^[a-z][a-z0-9_-]*$') then raise exception 'invalid surface'; end if;
  if p_source is not null and p_source not in ('manual','assistant') then raise exception 'invalid source'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' or octet_length(p_metadata::text) > 2048 then raise exception 'invalid metadata'; end if;
  if exists (select 1 from jsonb_object_keys(p_metadata) key where not (key = any(allowed_keys))) then raise exception 'invalid metadata key'; end if;
  if p_metadata ? 'tab' and (jsonb_typeof(p_metadata->'tab') is distinct from 'string' or not ((p_metadata->>'tab') = any(array['frame','settings','assistant','date','weather','surf','reminders','countdown','soccer','stocks','groceries']))) then raise exception 'invalid tab'; end if;
  if p_metadata ? 'provider' and (jsonb_typeof(p_metadata->'provider') is distinct from 'string' or not ((p_metadata->>'provider') = any(array['spond','teams','calendar','local_events']))) then raise exception 'invalid provider'; end if;
  if p_metadata ? 'recurring' and jsonb_typeof(p_metadata->'recurring') is distinct from 'boolean' then raise exception 'invalid recurring'; end if;
  if p_metadata ? 'layoutType' and (jsonb_typeof(p_metadata->'layoutType') is distinct from 'string' or (p_metadata->>'layoutType') not in ('built_in','custom')) then raise exception 'invalid layout type'; end if;
  if p_metadata ? 'resolver' and (jsonb_typeof(p_metadata->'resolver') is distinct from 'string' or (p_metadata->>'resolver') not in ('deterministic','ai')) then raise exception 'invalid resolver'; end if;
  if p_metadata ? 'outcome' and (jsonb_typeof(p_metadata->'outcome') is distinct from 'string' or (p_metadata->>'outcome') not in ('completed','needs_input','unsupported','error')) then raise exception 'invalid outcome'; end if;
  if p_metadata ? 'followupCount' and (jsonb_typeof(p_metadata->'followupCount') is distinct from 'number' or (p_metadata->>'followupCount') !~ '^([0-9]|[1-9][0-9]|100)$') then raise exception 'invalid followup count'; end if;
  if p_metadata ? 'capabilityId' and (jsonb_typeof(p_metadata->'capabilityId') is distinct from 'string' or length(p_metadata->>'capabilityId') not between 1 and 80 or (p_metadata->>'capabilityId') !~ '^[a-z][a-z0-9_.:-]*$') then raise exception 'invalid capability id'; end if;
  if p_metadata ? 'helpTopicId' and (jsonb_typeof(p_metadata->'helpTopicId') is distinct from 'string' or length(p_metadata->>'helpTopicId') not between 1 and 80 or (p_metadata->>'helpTopicId') !~ '^[a-z][a-z0-9_.:-]*$') then raise exception 'invalid help topic id'; end if;
  if p_metadata ? 'errorType' and (jsonb_typeof(p_metadata->'errorType') is distinct from 'string' or length(p_metadata->>'errorType') not between 1 and 40 or (p_metadata->>'errorType') !~ '^[a-z][a-z0-9_-]*$') then raise exception 'invalid error type'; end if;

  insert into public.product_analytics_events(user_id, client_id, frame_device_id, session_id, event_name, surface, source, metadata)
  values (caller_id, p_client_id, p_frame_device_id, p_session_id, p_event_name, p_surface, p_source, p_metadata);
end $$;

revoke all on public.product_analytics_events from anon, authenticated;
revoke all on public.assistant_capability_gaps from anon, authenticated;
revoke all on function public.record_product_analytics_event(text,text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.record_product_analytics_event(text,text,text,text,text,text,jsonb) to authenticated;
