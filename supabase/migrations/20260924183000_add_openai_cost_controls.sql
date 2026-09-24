create table if not exists public.openai_usage_events (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  model text not null,
  background boolean not null default false,
  status text not null check (status in ('reserved','success','error')),
  response_id text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  reasoning_tokens integer not null default 0 check (reasoning_tokens >= 0),
  usage jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists openai_usage_events_created_idx
  on public.openai_usage_events (created_at desc);
create index if not exists openai_usage_events_feature_created_idx
  on public.openai_usage_events (feature, created_at desc);

alter table public.openai_usage_events enable row level security;
revoke all on table public.openai_usage_events from anon, authenticated;
grant select, insert, update on table public.openai_usage_events to service_role;

create or replace function public.reserve_openai_background_call(
  p_feature text,
  p_model text,
  p_daily_limit integer,
  p_monthly_limit integer
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_daily integer;
  v_monthly integer;
begin
  if coalesce(trim(p_feature), '') = '' or coalesce(trim(p_model), '') = '' then
    return null;
  end if;
  if coalesce(p_daily_limit, 0) <= 0 or coalesce(p_monthly_limit, 0) <= 0 then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('openai-background-budget'));

  select count(*)::integer into v_daily
  from public.openai_usage_events
  where background = true
    and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';

  if v_daily >= p_daily_limit then
    return null;
  end if;

  select count(*)::integer into v_monthly
  from public.openai_usage_events
  where background = true
    and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';

  if v_monthly >= p_monthly_limit then
    return null;
  end if;

  insert into public.openai_usage_events(feature, model, background, status)
  values (trim(p_feature), trim(p_model), true, 'reserved')
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.reserve_openai_background_call(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.reserve_openai_background_call(text,text,integer,integer) to service_role;

create table if not exists public.weather_ai_insight_cache (
  cache_key text primary key,
  model text not null,
  period text not null,
  rows jsonb not null default '{}'::jsonb,
  insight text not null default '',
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists weather_ai_insight_cache_expires_idx
  on public.weather_ai_insight_cache (expires_at);

alter table public.weather_ai_insight_cache enable row level security;
revoke all on table public.weather_ai_insight_cache from anon, authenticated;
grant select, insert, update, delete on table public.weather_ai_insight_cache to service_role;
