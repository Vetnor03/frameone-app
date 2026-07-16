-- Provider-neutral subscription entitlements for AI Assistant / Watch.
create table public.ai_subscription_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'basic' check (plan in ('basic','normal','pro')),
  status text not null default 'inactive' check (status in ('trialing','active','past_due','canceled','inactive')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  subscription_started_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  billing_provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_subscription_trial_dates check (trial_ends_at is null or trial_started_at is not null)
);
create unique index ai_subscription_provider_customer_uidx on public.ai_subscription_accounts (billing_provider, provider_customer_id) where provider_customer_id is not null;
create unique index ai_subscription_provider_subscription_uidx on public.ai_subscription_accounts (billing_provider, provider_subscription_id) where provider_subscription_id is not null;
create trigger trg_ai_subscription_accounts_updated_at before update on public.ai_subscription_accounts for each row execute function public.set_timestamp_updated_at();

alter table public.ai_subscription_accounts enable row level security;
create policy "Users can read their own AI subscription account" on public.ai_subscription_accounts for select to authenticated using (user_id = auth.uid());
revoke all on public.ai_subscription_accounts from public, anon, authenticated;
-- Owners may inspect safe account state, but provider identifiers remain available
-- only to trusted server code. The app consumes the entitlement RPC below.
grant select (user_id, plan, status, trial_started_at, trial_ends_at,
  subscription_started_at, current_period_end, cancel_at_period_end,
  created_at, updated_at) on public.ai_subscription_accounts to authenticated;

create or replace function public.get_ai_subscription_entitlements(p_user_id uuid default auth.uid())
returns table (
  user_id uuid, effective_plan text, effective_status text, is_trial boolean,
  trial_ends_at timestamptz, days_remaining_in_trial integer,
  monitoring_enabled boolean, max_ongoing_watches integer,
  max_instant_watches integer, can_use_instant boolean,
  instant_check_interval_minutes integer
) language plpgsql stable security definer set search_path = public as $$
declare a public.ai_subscription_accounts; v_is_trial boolean; v_active boolean;
begin
  if p_user_id is null then raise exception 'not_authenticated'; end if;
  if auth.uid() is not null and auth.uid() <> p_user_id then raise exception 'not_authorized'; end if;
  select * into a from public.ai_subscription_accounts s where s.user_id = p_user_id;
  v_is_trial := a.status = 'trialing' and a.trial_ends_at > now();
  v_active := v_is_trial or a.status = 'active';
  return query select p_user_id,
    case when v_is_trial then 'basic' else coalesce(a.plan, 'basic') end,
    case when v_is_trial then 'trialing' when a.status = 'active' then 'active' else 'inactive' end,
    v_is_trial, a.trial_ends_at,
    case when v_is_trial then greatest(0, ceil(extract(epoch from (a.trial_ends_at-now()))/86400.0)::integer) else 0 end,
    v_active,
    case when v_active and (v_is_trial or a.plan = 'basic') then 5 else null end,
    case when v_active and not v_is_trial and a.plan = 'pro' then 5 else 0 end,
    (v_active and not v_is_trial and a.plan = 'pro'),
    case when v_active and not v_is_trial and a.plan = 'pro' then 15 else null end;
end $$;
revoke execute on function public.get_ai_subscription_entitlements(uuid) from public, anon;
grant execute on function public.get_ai_subscription_entitlements(uuid) to authenticated, service_role;

alter table public.monitoring_watches add column is_instant boolean not null default false;
create index monitoring_watches_active_instant_owner_idx on public.monitoring_watches(owner_user_id) where is_instant and status = 'active';

-- Existing testers receive a fresh trial without changing Watches or history.
insert into public.ai_subscription_accounts(user_id, plan, status, trial_started_at, trial_ends_at)
select distinct owner_user_id, 'basic', 'trialing', now(), now() + interval '30 days'
from public.monitoring_watches
on conflict (user_id) do nothing;

create or replace function public.create_ai_assistant_watch(p_original_request text, p_frame_id text default null)
returns public.monitoring_watches language plpgsql security definer set search_path = public as $$
declare cleaned_request text := public.ai_assistant_clean_request(p_original_request); created_watch public.monitoring_watches;
  current_user_id uuid := auth.uid(); owned_ongoing_watch_count integer; e record;
begin
  if current_user_id is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  insert into public.ai_subscription_accounts(user_id,plan,status,trial_started_at,trial_ends_at)
  values(current_user_id,'basic','trialing',now(),now()+interval '30 days') on conflict(user_id) do nothing;
  select * into e from public.get_ai_subscription_entitlements(current_user_id);
  if not e.monitoring_enabled then raise exception 'subscription_required'; end if;
  select count(*) into owned_ongoing_watch_count from public.monitoring_watches mw
    where mw.owner_user_id=current_user_id and mw.status in ('active','paused','error');
  if e.max_ongoing_watches is not null and owned_ongoing_watch_count >= e.max_ongoing_watches then raise exception 'watch_limit_reached'; end if;
  if char_length(cleaned_request)<8 or cleaned_request !~ '[[:alnum:]]' then raise exception 'request_too_short'; end if;
  if char_length(cleaned_request)>1000 then raise exception 'request_too_long'; end if;
  if p_frame_id is not null and not exists(select 1 from public.device_members dm where dm.device_id=p_frame_id and dm.user_id=current_user_id) then raise exception 'frame_not_available'; end if;
  insert into public.monitoring_watches(owner_user_id,frame_id,original_request,title,normalized_goal,trigger_description,search_guidance,frequency_minutes,next_check_at,status,show_in_app,show_on_frame,interpretation_status,is_instant)
  values(current_user_id,p_frame_id,cleaned_request,public.ai_assistant_title(cleaned_request),cleaned_request,'RE:MIND lets you know when something new and relevant happens.',jsonb_build_object('interpretation_status','temporary','future_ai_ready',true),60,now(),'active',true,false,'pending',false) returning * into created_watch;
  insert into public.user_onboarding_state(user_id,has_created_watch) values(current_user_id,true) on conflict(user_id) do update set has_created_watch=true,updated_at=now();
  perform public.enqueue_ai_assistant_interpretation(created_watch.id,created_watch.owner_user_id,created_watch.original_request,now());
  insert into public.monitoring_queue(watch_id,run_after) values(created_watch.id,now()) on conflict do nothing;
  return created_watch;
end $$;

create or replace function public.update_ai_assistant_watch_request(p_watch_id uuid,p_original_request text)
returns public.monitoring_watches language plpgsql security definer set search_path=public as $$
declare cleaned_request text:=public.ai_assistant_clean_request(p_original_request); updated_watch public.monitoring_watches; e record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into e from public.get_ai_subscription_entitlements(auth.uid());
  if not e.monitoring_enabled then raise exception 'subscription_required'; end if;
  if char_length(cleaned_request)<8 or cleaned_request !~ '[[:alnum:]]' then raise exception 'request_too_short'; end if;
  if char_length(cleaned_request)>1000 then raise exception 'request_too_long'; end if;
  update public.monitoring_watches set original_request=cleaned_request where id=p_watch_id and owner_user_id=auth.uid() returning * into updated_watch;
  if updated_watch.id is null then raise exception 'watch_not_found_or_not_owned'; end if;
  return updated_watch;
end $$;

create or replace function public.resume_ai_assistant_watch(p_watch_id uuid)
returns public.monitoring_watches language plpgsql security definer set search_path=public as $$
declare updated_watch public.monitoring_watches; e record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into e from public.get_ai_subscription_entitlements(auth.uid());
  if not e.monitoring_enabled then raise exception 'subscription_required'; end if;
  update public.monitoring_watches set status='active',show_in_app=true,next_check_at=greatest(coalesce(next_check_at,now()),now()) where id=p_watch_id and owner_user_id=auth.uid() returning * into updated_watch;
  if updated_watch.id is null then raise exception 'watch_not_found'; end if; return updated_watch;
end $$;

create or replace function public.set_ai_assistant_watch_instant(p_watch_id uuid,p_is_instant boolean)
returns public.monitoring_watches language plpgsql security definer set search_path=public as $$
declare w public.monitoring_watches; e record; n integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
  select * into w from public.monitoring_watches where id=p_watch_id and owner_user_id=auth.uid() for update;
  if w.id is null then raise exception 'watch_not_found_or_not_owned'; end if;
  if not p_is_instant then update public.monitoring_watches set is_instant=false where id=w.id returning * into w; return w; end if;
  select * into e from public.get_ai_subscription_entitlements(auth.uid());
  if not e.monitoring_enabled then raise exception 'subscription_required'; end if;
  if not e.can_use_instant then raise exception 'instant_not_available'; end if;
  select count(*) into n from public.monitoring_watches where owner_user_id=auth.uid() and is_instant and status='active' and id<>w.id;
  if w.status='active' and n>=e.max_instant_watches then raise exception 'instant_watch_limit_reached'; end if;
  update public.monitoring_watches set is_instant=true where id=w.id returning * into w; return w;
end $$;
revoke execute on function public.set_ai_assistant_watch_instant(uuid,boolean) from public,anon;
grant execute on function public.set_ai_assistant_watch_instant(uuid,boolean) to authenticated;

-- Replaces the paid reservation while preserving provider/cost-cap behavior.
create or replace function public.ai_monitoring_subscription_enabled(p_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select monitoring_enabled from public.get_ai_subscription_entitlements(p_user_id)
$$;
revoke execute on function public.ai_monitoring_subscription_enabled(uuid) from public,anon,authenticated;
grant execute on function public.ai_monitoring_subscription_enabled(uuid) to service_role;

-- Paid OpenAI reservations are entitlement-gated before all existing cost caps.
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

  if not public.ai_monitoring_subscription_enabled(v_watch.owner_user_id) then
    return jsonb_build_object('allowed', false, 'reason', 'subscription_inactive');
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


revoke execute on function public.create_ai_assistant_watch(text,text) from public,anon;
grant execute on function public.create_ai_assistant_watch(text,text) to authenticated;
notify pgrst,'reload schema';
