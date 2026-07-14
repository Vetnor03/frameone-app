-- Add server-controlled, cost-aware monitoring scheduling state.

alter table public.monitoring_watches
  add column if not exists monitoring_class text not null default 'normal',
  add column if not exists consecutive_no_change_count integer not null default 0,
  add column if not exists urgent_until timestamptz,
  add column if not exists last_change_at timestamptz;

alter table public.monitoring_watches
  drop constraint if exists monitoring_watches_monitoring_class_check,
  add constraint monitoring_watches_monitoring_class_check check (monitoring_class in ('long_term','normal','active','urgent')),
  drop constraint if exists monitoring_watches_consecutive_no_change_check,
  add constraint monitoring_watches_consecutive_no_change_check check (consecutive_no_change_count >= 0);

create table if not exists public.monitoring_usage_limits (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  daily_run_limit integer,
  monthly_run_limit integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monitoring_usage_limits_daily_check check (daily_run_limit is null or daily_run_limit >= 0),
  constraint monitoring_usage_limits_monthly_check check (monthly_run_limit is null or monthly_run_limit >= 0)
);

alter table public.monitoring_usage_limits enable row level security;
drop policy if exists "Users can read own monitoring usage limits" on public.monitoring_usage_limits;
create policy "Users can read own monitoring usage limits" on public.monitoring_usage_limits for select using (owner_user_id = auth.uid());
revoke insert, update, delete on public.monitoring_usage_limits from anon, authenticated;

drop trigger if exists trg_monitoring_usage_limits_updated_at on public.monitoring_usage_limits;
create trigger trg_monitoring_usage_limits_updated_at before update on public.monitoring_usage_limits for each row execute function public.set_timestamp_updated_at();

create index if not exists monitoring_watches_owner_class_idx on public.monitoring_watches (owner_user_id, monitoring_class) where status in ('active','error');

create or replace function public.apply_ai_assistant_interpretation(
  p_watch_id uuid,
  p_owner_user_id uuid,
  p_request_snapshot text,
  p_title text,
  p_normalized_goal text,
  p_trigger_description text,
  p_search_guidance jsonb,
  p_frequency_minutes integer,
  p_completion_condition text,
  p_preferred_language text,
  p_monitoring_class text default 'normal',
  p_urgent_until timestamptz default null
)
returns public.monitoring_watches language plpgsql security definer set search_path = public as $$
declare updated_watch public.monitoring_watches; normalized_class text;
begin
  normalized_class := case when p_monitoring_class in ('long_term','normal','active','urgent') then p_monitoring_class else 'normal' end;
  update public.monitoring_watches
  set title = left(btrim(p_title), 90),
      normalized_goal = left(btrim(p_normalized_goal), 600),
      trigger_description = left(btrim(p_trigger_description), 500),
      search_guidance = coalesce(p_search_guidance, '{}'::jsonb),
      frequency_minutes = greatest(60, least(coalesce(p_frequency_minutes, frequency_minutes), 10080)),
      next_check_at = least(next_check_at, now()),
      completion_condition = nullif(left(btrim(coalesce(p_completion_condition, '')), 500), ''),
      preferred_language = case when p_preferred_language in ('en','no') then p_preferred_language else preferred_language end,
      monitoring_class = normalized_class,
      urgent_until = case when normalized_class = 'urgent' then coalesce(p_urgent_until, now() + interval '24 hours') else null end,
      consecutive_no_change_count = 0,
      interpreted_at = now(),
      interpretation_status = 'complete',
      interpretation_error = null,
      status = case when status = 'error' then 'active' else status end
  where id = p_watch_id and owner_user_id = p_owner_user_id and original_request = p_request_snapshot and status <> 'completed'
  returning * into updated_watch;
  if updated_watch.id is null then raise exception 'watch_not_found_forbidden_or_stale'; end if;
  return updated_watch;
end; $$;

revoke execute on function public.apply_ai_assistant_interpretation(uuid,uuid,text,text,text,text,jsonb,integer,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.apply_ai_assistant_interpretation(uuid,uuid,text,text,text,text,jsonb,integer,text,text,text,timestamptz) to service_role;
