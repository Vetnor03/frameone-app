-- Enforce hard paid OpenAI monitoring run limits with atomic reservation RPCs.

create index if not exists monitoring_runs_paid_usage_idx
  on public.monitoring_runs (provider, started_at, status, watch_id)
  where provider = 'openai' and status in ('running','no_change','change','uncertain','error');

create or replace function public.reserve_paid_monitoring_run(
  p_watch_id uuid,
  p_provider text,
  p_model text,
  p_default_daily_limit integer default 20,
  p_default_monthly_limit integer default 300,
  p_global_daily_limit integer default null,
  p_global_monthly_limit integer default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_watch public.monitoring_watches;
  v_daily_limit integer;
  v_monthly_limit integer;
  v_global_daily_limit integer := nullif(greatest(coalesce(p_global_daily_limit, 0), 0), 0);
  v_global_monthly_limit integer := nullif(greatest(coalesce(p_global_monthly_limit, 0), 0), 0);
  v_day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_next_day timestamptz := (date_trunc('day', now() at time zone 'utc') + interval '1 day') at time zone 'utc';
  v_next_month timestamptz := (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc';
  v_user_daily integer;
  v_user_monthly integer;
  v_global_daily integer;
  v_global_monthly integer;
  v_run public.monitoring_runs;
begin
  select * into v_watch from public.monitoring_watches where id = p_watch_id for update;
  if v_watch.id is null then
    return jsonb_build_object('allowed', false, 'reason', 'watch_not_found');
  end if;

  -- Paid allowance is only reserved for production OpenAI monitoring-search requests.
  if p_provider <> 'openai' then
    insert into public.monitoring_runs (watch_id, status, provider, model)
    values (p_watch_id, 'running', p_provider, p_model)
    returning * into v_run;
    return jsonb_build_object('allowed', true, 'run_id', v_run.id, 'provider', p_provider);
  end if;

  perform pg_advisory_xact_lock(hashtext('monitoring-paid-global'));
  perform pg_advisory_xact_lock(hashtext('monitoring-paid-user:' || v_watch.owner_user_id::text));

  select coalesce(l.daily_run_limit, greatest(coalesce(p_default_daily_limit, 20), 0)),
         coalesce(l.monthly_run_limit, greatest(coalesce(p_default_monthly_limit, 300), 0))
    into v_daily_limit, v_monthly_limit
  from (select v_watch.owner_user_id as owner_user_id) u
  left join public.monitoring_usage_limits l on l.owner_user_id = u.owner_user_id;

  select count(*) into v_user_daily
  from public.monitoring_runs r join public.monitoring_watches w on w.id = r.watch_id
  where w.owner_user_id = v_watch.owner_user_id and r.provider = 'openai'
    and r.status in ('running','no_change','change','uncertain','error') and r.started_at >= v_day_start;

  select count(*) into v_user_monthly
  from public.monitoring_runs r join public.monitoring_watches w on w.id = r.watch_id
  where w.owner_user_id = v_watch.owner_user_id and r.provider = 'openai'
    and r.status in ('running','no_change','change','uncertain','error') and r.started_at >= v_month_start;

  if v_daily_limit is not null and v_user_daily >= v_daily_limit then
    return jsonb_build_object('allowed', false, 'reason', 'daily_run_limit_reached', 'paid_checks_today', v_user_daily, 'paid_checks_this_month', v_user_monthly, 'daily_limit', v_daily_limit, 'monthly_limit', v_monthly_limit, 'next_reset_at', v_next_day);
  end if;
  if v_monthly_limit is not null and v_user_monthly >= v_monthly_limit then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_run_limit_reached', 'paid_checks_today', v_user_daily, 'paid_checks_this_month', v_user_monthly, 'daily_limit', v_daily_limit, 'monthly_limit', v_monthly_limit, 'next_reset_at', v_next_month);
  end if;

  if v_global_daily_limit is not null then
    select count(*) into v_global_daily from public.monitoring_runs r where r.provider = 'openai' and r.status in ('running','no_change','change','uncertain','error') and r.started_at >= v_day_start;
    if v_global_daily >= v_global_daily_limit then
      return jsonb_build_object('allowed', false, 'reason', 'global_daily_run_limit_reached', 'global_paid_checks_today', v_global_daily, 'global_daily_limit', v_global_daily_limit, 'next_reset_at', v_next_day);
    end if;
  end if;
  if v_global_monthly_limit is not null then
    select count(*) into v_global_monthly from public.monitoring_runs r where r.provider = 'openai' and r.status in ('running','no_change','change','uncertain','error') and r.started_at >= v_month_start;
    if v_global_monthly >= v_global_monthly_limit then
      return jsonb_build_object('allowed', false, 'reason', 'global_monthly_run_limit_reached', 'global_paid_checks_this_month', v_global_monthly, 'global_monthly_limit', v_global_monthly_limit, 'next_reset_at', v_next_month);
    end if;
  end if;

  insert into public.monitoring_runs (watch_id, status, provider, model)
  values (p_watch_id, 'running', 'openai', p_model)
  returning * into v_run;
  return jsonb_build_object('allowed', true, 'run_id', v_run.id, 'provider', 'openai', 'paid_checks_today', v_user_daily + 1, 'paid_checks_this_month', v_user_monthly + 1, 'daily_limit', v_daily_limit, 'monthly_limit', v_monthly_limit);
end; $$;

create or replace function public.get_monitoring_paid_usage(
  p_owner_user_id uuid,
  p_default_daily_limit integer default 20,
  p_default_monthly_limit integer default 300
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_daily_limit integer;
  v_monthly_limit integer;
  v_today integer;
  v_month integer;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_next_day timestamptz := (date_trunc('day', now() at time zone 'utc') + interval '1 day') at time zone 'utc';
  v_next_month timestamptz := (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc';
begin
  select coalesce(l.daily_run_limit, greatest(coalesce(p_default_daily_limit, 20), 0)),
         coalesce(l.monthly_run_limit, greatest(coalesce(p_default_monthly_limit, 300), 0))
    into v_daily_limit, v_monthly_limit
  from (select p_owner_user_id as owner_user_id) u
  left join public.monitoring_usage_limits l on l.owner_user_id = u.owner_user_id;

  select count(*) into v_today from public.monitoring_runs r join public.monitoring_watches w on w.id = r.watch_id
  where w.owner_user_id = p_owner_user_id and r.provider = 'openai' and r.status in ('running','no_change','change','uncertain','error') and r.started_at >= v_day_start;
  select count(*) into v_month from public.monitoring_runs r join public.monitoring_watches w on w.id = r.watch_id
  where w.owner_user_id = p_owner_user_id and r.provider = 'openai' and r.status in ('running','no_change','change','uncertain','error') and r.started_at >= v_month_start;

  return jsonb_build_object(
    'owner_user_id', p_owner_user_id,
    'paid_checks_today', v_today,
    'paid_checks_this_month', v_month,
    'daily_limit', v_daily_limit,
    'monthly_limit', v_monthly_limit,
    'remaining_today', case when v_daily_limit is null then null else greatest(v_daily_limit - v_today, 0) end,
    'remaining_this_month', case when v_monthly_limit is null then null else greatest(v_monthly_limit - v_month, 0) end,
    'next_daily_reset_at', v_next_day,
    'next_monthly_reset_at', v_next_month
  );
end; $$;

revoke execute on function public.reserve_paid_monitoring_run(uuid,text,text,integer,integer,integer,integer) from public, anon, authenticated;
revoke execute on function public.get_monitoring_paid_usage(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.reserve_paid_monitoring_run(uuid,text,text,integer,integer,integer,integer) to service_role;
grant execute on function public.get_monitoring_paid_usage(uuid,integer,integer) to service_role;
