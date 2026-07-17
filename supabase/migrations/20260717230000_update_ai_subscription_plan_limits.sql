-- Update the canonical AI subscription allowances without changing the deployed
-- subscription schema, status semantics, or downstream scheduling protections.

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
  v_is_trial := coalesce(a.status = 'trialing' and a.trial_ends_at > now(),false);
  v_active := v_is_trial or a.status = 'active';
  return query select p_user_id,
    case when v_is_trial then 'basic' else coalesce(a.plan, 'basic') end,
    case when v_is_trial then 'trialing' when a.status = 'active' then 'active' else 'inactive' end,
    v_is_trial, a.trial_ends_at,
    case when v_is_trial then greatest(0, ceil(extract(epoch from (a.trial_ends_at-now()))/86400.0)::integer) else 0 end,
    v_active,
    case when not v_active then 0 when v_is_trial then 1 when a.plan = 'basic' then 2 when a.plan = 'normal' then 5 else 10 end,
    case when not v_active then 0 when v_is_trial then 1 when a.plan = 'basic' then 1 when a.plan = 'normal' then 2 else 5 end,
    v_active,
    case when v_active then 15 else null end;
end $$;

create or replace function public.preview_ai_subscription_plan(p_plan text)
returns public.ai_subscription_accounts language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); account public.ai_subscription_accounts; keep_count integer;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_plan not in ('trial','basic','normal','pro') then raise exception 'invalid_plan'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,1));
  insert into public.ai_subscription_accounts(user_id,plan,status,trial_started_at,trial_ends_at,subscription_started_at)
  values(uid,case when p_plan='trial' then 'basic' else p_plan end,
    case when p_plan='trial' then 'trialing' else 'active' end,
    case when p_plan='trial' then now() end,case when p_plan='trial' then now()+interval '30 days' end,
    case when p_plan<>'trial' then now() end)
  on conflict(user_id) do update set plan=excluded.plan,status=excluded.status,
    trial_started_at=excluded.trial_started_at,trial_ends_at=excluded.trial_ends_at,
    subscription_started_at=coalesce(ai_subscription_accounts.subscription_started_at,excluded.subscription_started_at),updated_at=now()
  returning * into account;
  keep_count:=case p_plan when 'trial' then 1 when 'basic' then 1 when 'normal' then 2 when 'pro' then 5 end;
  -- Retain the oldest ongoing Radar-enabled rows deterministically. Completed
  -- rows and excess ongoing rows use the existing safe downgrade cadence.
  with ranked as (
    select id,row_number() over(order by created_at,id) as rn from public.monitoring_watches
    where owner_user_id=uid and is_instant and status in ('active','paused','error')
  ) update public.monitoring_watches w set is_instant=false,
      next_check_at=greatest(coalesce(w.next_check_at,now()),now()+interval '180 minutes')
    where w.owner_user_id=uid and w.is_instant
      and (w.status not in ('active','paused','error') or w.id in (select id from ranked where rn>keep_count));
  return account;
end $$;

revoke execute on function public.preview_ai_subscription_plan(text) from public,anon;
grant execute on function public.preview_ai_subscription_plan(text) to authenticated;
notify pgrst,'reload schema';
