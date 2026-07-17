-- Final numeric Watch allowances and server-side 15-minute Instant scheduling.
-- This is forward-only: the two deployed subscription foundation migrations are
-- intentionally not modified.

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
    case when not v_active then 0 when v_is_trial then 2 when a.plan = 'basic' then 3 when a.plan = 'normal' then 5 else 10 end,
    case when not v_active then 0 when v_is_trial then 1 when a.plan = 'basic' then 0 when a.plan = 'normal' then 1 else 5 end,
    v_active and (v_is_trial or a.plan in ('normal','pro')),
    case when v_active and (v_is_trial or a.plan in ('normal','pro')) then 15 else null end;
end $$;

create or replace function public.create_ai_assistant_watch(p_original_request text, p_frame_id text default null)
returns public.monitoring_watches language plpgsql security definer set search_path = public as $$
declare cleaned_request text := public.ai_assistant_clean_request(p_original_request); created_watch public.monitoring_watches;
  current_user_id uuid := auth.uid(); owned_ongoing_watch_count integer; e record;
begin
  if current_user_id is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  -- This transaction rolls back the trial start if Watch creation does not succeed.
  insert into public.ai_subscription_accounts(user_id,plan,status,trial_started_at,trial_ends_at)
  values(current_user_id,'basic','trialing',now(),now()+interval '30 days')
  on conflict(user_id) do update set status='trialing', trial_started_at=now(), trial_ends_at=now()+interval '30 days'
    where ai_subscription_accounts.status='inactive' and ai_subscription_accounts.trial_started_at is null;
  select * into e from public.get_ai_subscription_entitlements(current_user_id);
  if not e.monitoring_enabled then raise exception 'subscription_required'; end if;
  select count(*) into owned_ongoing_watch_count from public.monitoring_watches mw
    where mw.owner_user_id=current_user_id and mw.status in ('active','paused','error');
  if owned_ongoing_watch_count >= e.max_ongoing_watches then raise exception 'watch_limit_reached'; end if;
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

create or replace function public.set_ai_assistant_watch_instant(p_watch_id uuid,p_is_instant boolean)
returns public.monitoring_watches language plpgsql security definer set search_path=public as $$
declare w public.monitoring_watches; e record; n integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
  select * into w from public.monitoring_watches where id=p_watch_id and owner_user_id=auth.uid() for update;
  if w.id is null then raise exception 'watch_not_found_or_not_owned'; end if;
  if not p_is_instant then
    update public.monitoring_watches set is_instant=false,
      next_check_at=greatest(coalesce(next_check_at,now()),now()+interval '180 minutes')
      where id=w.id returning * into w;
    return w;
  end if;
  select * into e from public.get_ai_subscription_entitlements(auth.uid());
  if not e.monitoring_enabled then raise exception 'subscription_required'; end if;
  if not e.can_use_instant then raise exception 'instant_not_available'; end if;
  select count(*) into n from public.monitoring_watches
    where owner_user_id=auth.uid() and is_instant and status in ('active','paused','error') and id<>w.id;
  if w.status in ('active','paused','error') and n>=e.max_instant_watches then raise exception 'instant_watch_limit_reached'; end if;
  update public.monitoring_watches set is_instant=true,next_check_at=least(coalesce(next_check_at,now()),now()) where id=w.id returning * into w;
  return w;
end $$;

-- Service-only eligibility is used both by due selection and the worker.  The
-- deterministic allowed subset is oldest created Watch first, then UUID.
create or replace function public.get_monitoring_watch_schedule_eligibility(p_watch_id uuid)
returns table(eligible boolean, use_instant_cadence boolean, interval_minutes integer)
language sql stable security definer set search_path=public as $$
  with target as (
    select w.*, e.monitoring_enabled, e.can_use_instant, e.max_instant_watches
    from public.monitoring_watches w
    cross join lateral public.get_ai_subscription_entitlements(w.owner_user_id) e
    where w.id=p_watch_id
  ), ranked as (
    select t.*,
      (select count(*) from public.monitoring_watches x
       where x.owner_user_id=t.owner_user_id and x.is_instant
         and x.status in ('active','paused','error')
         and (x.created_at,x.id)<=(t.created_at,t.id)) as instant_rank
    from target t
  )
  select status='active' and monitoring_enabled
      and (not is_instant or (can_use_instant and instant_rank<=max_instant_watches)),
    status='active' and monitoring_enabled and is_instant
      and can_use_instant and instant_rank<=max_instant_watches,
    case when status='active' and monitoring_enabled and is_instant
      and can_use_instant and instant_rank<=max_instant_watches then 15 else null end
  from ranked
$$;
revoke execute on function public.get_monitoring_watch_schedule_eligibility(uuid) from public,anon,authenticated;
grant execute on function public.get_monitoring_watch_schedule_eligibility(uuid) to service_role;

create or replace function public.enqueue_due_monitoring_watches(max_count integer default 100)
returns integer language plpgsql security definer set search_path=public as $$
declare inserted_count integer;
begin
  with due as (
    select w.id from public.monitoring_watches w
    cross join lateral public.get_monitoring_watch_schedule_eligibility(w.id) eligibility
    where eligibility.eligible and w.next_check_at<=now()
    order by w.next_check_at asc
    limit greatest(1,least(max_count,1000)) for update of w skip locked
  ), inserted as (
    insert into public.monitoring_queue(watch_id) select id from due on conflict do nothing returning 1
  ) select count(*) into inserted_count from inserted;
  return inserted_count;
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
  keep_count:=case p_plan when 'trial' then 1 when 'normal' then 1 when 'pro' then 5 else 0 end;
  -- Keep the oldest ongoing Instant Watches (created_at, then UUID); disable all
  -- completed Watches and every ongoing Watch after the retained allowance.
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

revoke execute on function public.create_ai_assistant_watch(text,text) from public,anon;
grant execute on function public.create_ai_assistant_watch(text,text) to authenticated;
revoke execute on function public.set_ai_assistant_watch_instant(uuid,boolean) from public,anon;
grant execute on function public.set_ai_assistant_watch_instant(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
