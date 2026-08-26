-- First-party, privacy-conscious telemetry used only to improve RE:MIND.
-- Generic events must never contain user content. Sanitized unsupported
-- Assistant requests are the deliberately narrow exception in the gap table.
create table public.product_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  device_id text,
  session_id text not null,
  event_name text not null,
  surface text,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint analytics_event_name_length check (event_name ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint analytics_session_length check (length(session_id) between 1 and 80),
  constraint analytics_device_length check (device_id is null or length(device_id) <= 80),
  constraint analytics_surface_length check (surface is null or length(surface) <= 40),
  constraint analytics_source_values check (source is null or source in ('manual', 'assistant')),
  constraint analytics_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint analytics_metadata_size check (octet_length(metadata::text) <= 2048)
);
create index product_analytics_created_at_idx on public.product_analytics_events(created_at desc);
create index product_analytics_event_name_idx on public.product_analytics_events(event_name, created_at desc);
create index product_analytics_user_id_idx on public.product_analytics_events(user_id, created_at desc) where user_id is not null;
create index product_analytics_device_id_idx on public.product_analytics_events(device_id, created_at desc) where device_id is not null;
alter table public.product_analytics_events enable row level security;

create table public.assistant_capability_gaps (
  id uuid primary key default gen_random_uuid(),
  request_text text not null check (length(request_text) between 1 and 280),
  normalized_text text not null check (length(normalized_text) between 1 and 280),
  language text check (language in ('en', 'no')),
  user_id uuid references auth.users(id) on delete set null,
  device_id text check (device_id is null or length(device_id) <= 80),
  reason text not null check (reason in ('classifier_unsupported', 'unknown_capability')),
  created_at timestamptz not null default now()
);
create index assistant_capability_gaps_created_at_idx on public.assistant_capability_gaps(created_at desc);
create index assistant_capability_gaps_normalized_idx on public.assistant_capability_gaps(normalized_text, created_at desc);
alter table public.assistant_capability_gaps enable row level security;

-- Clients receive insertion only through this allow-listed RPC and cannot read
-- either table. SECURITY INVOKER binds user_id to the authenticated caller.
create function public.record_product_analytics_event(
  p_event_name text, p_session_id text, p_device_id text default null,
  p_surface text default null, p_source text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security invoker set search_path = public as $$
declare
  allowed_events constant text[] := array[
    'session_started','tab_opened','frame_preview_opened','assistant_opened',
    'assistant_request_completed','assistant_request_needs_input','assistant_request_unsupported','assistant_request_error',
    'reminder_created','grocery_item_added','recipe_created','recipe_added_to_groceries','dinner_plan_opened',
    'surf_opened','custom_spot_started','custom_spot_completed','layout_changed','frame_update_requested',
    'theme_changed','language_changed','connection_started','connection_completed','connection_failed'
  ];
  allowed_keys constant text[] := array['tab','provider','recurring','layoutType','capabilityId','helpTopicId','resolver','followupCount','outcome','errorType'];
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not (p_event_name = any(allowed_events)) then raise exception 'invalid event'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' or octet_length(p_metadata::text) > 2048 then raise exception 'invalid metadata'; end if;
  if exists (select 1 from jsonb_object_keys(p_metadata) key where not (key = any(allowed_keys))) then raise exception 'invalid metadata key'; end if;
  insert into public.product_analytics_events(user_id, device_id, session_id, event_name, surface, source, metadata)
  values (auth.uid(), nullif(left(p_device_id,80),''), left(p_session_id,80), p_event_name, nullif(left(p_surface,40),''), p_source, p_metadata);
end $$;
grant execute on function public.record_product_analytics_event(text,text,text,text,text,jsonb) to authenticated;
grant insert on public.product_analytics_events to authenticated;
create policy analytics_insert_own on public.product_analytics_events for insert to authenticated with check (user_id = auth.uid());

-- No client grants or policies exist for gap rows; only trusted server code can
-- insert/read them, making later retention deletion straightforward by date.
revoke all on public.assistant_capability_gaps from anon, authenticated;
