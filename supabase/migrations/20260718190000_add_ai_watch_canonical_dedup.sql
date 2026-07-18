-- Canonical shared AI watches/searches. User watches remain private quota items;
-- these tables only coordinate backend execution and cache public-search results.

create table if not exists public.monitoring_canonical_searches (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  canonical_intent jsonb not null,
  active_watch_count integer not null default 0,
  last_run_at timestamptz,
  last_successful_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monitoring_canonical_key_not_empty check (char_length(btrim(canonical_key)) > 0),
  constraint monitoring_canonical_intent_object check (jsonb_typeof(canonical_intent) = 'object'),
  constraint monitoring_canonical_active_count_check check (active_watch_count >= 0)
);

alter table public.monitoring_watches
  add column if not exists canonical_search_id uuid references public.monitoring_canonical_searches(id) on delete set null,
  add column if not exists canonical_key text,
  add column if not exists canonical_intent jsonb;

create table if not exists public.monitoring_shared_runs (
  id uuid primary key default gen_random_uuid(),
  canonical_search_id uuid not null references public.monitoring_canonical_searches(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  provider text not null default 'mock',
  model text not null default 'mock',
  response_id text,
  raw_result jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  usage jsonb not null default '{}'::jsonb,
  constraint monitoring_shared_runs_status_check check (status in ('running','no_change','change','uncertain','error')),
  constraint monitoring_shared_runs_result_object check (jsonb_typeof(result) = 'object')
);

create index if not exists monitoring_watches_canonical_active_idx on public.monitoring_watches (canonical_search_id, status) where canonical_search_id is not null;
create index if not exists monitoring_shared_runs_fresh_idx on public.monitoring_shared_runs (canonical_search_id, completed_at desc) where status in ('no_change','change','uncertain');
create unique index if not exists monitoring_shared_runs_one_running_idx on public.monitoring_shared_runs (canonical_search_id) where status = 'running';

alter table public.monitoring_canonical_searches enable row level security;
alter table public.monitoring_shared_runs enable row level security;
revoke all on public.monitoring_canonical_searches from anon, authenticated;
revoke all on public.monitoring_shared_runs from anon, authenticated;

drop trigger if exists trg_monitoring_canonical_searches_updated_at on public.monitoring_canonical_searches;
create trigger trg_monitoring_canonical_searches_updated_at before update on public.monitoring_canonical_searches for each row execute function public.set_timestamp_updated_at();

create or replace function public.refresh_monitoring_canonical_active_count(p_canonical_search_id uuid)
returns void language sql security definer set search_path=public as $$
  update public.monitoring_canonical_searches c set active_watch_count = (
    select count(*) from public.monitoring_watches w where w.canonical_search_id = c.id and w.status = 'active'
  ) where c.id = p_canonical_search_id;
$$;

create or replace function public.ensure_monitoring_canonical_search(p_canonical_key text, p_canonical_intent jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if p_canonical_key is null or char_length(btrim(p_canonical_key)) = 0 then return null; end if;
  insert into public.monitoring_canonical_searches(canonical_key, canonical_intent)
  values(btrim(p_canonical_key), coalesce(p_canonical_intent, '{}'::jsonb))
  on conflict(canonical_key) do update set canonical_intent = excluded.canonical_intent
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.claim_monitoring_shared_run(p_canonical_search_id uuid, p_provider text, p_model text, p_cache_max_age_minutes integer default 30)
returns table(action text, shared_run_id uuid, cached_result jsonb) language plpgsql security definer set search_path=public as $$
declare cached public.monitoring_shared_runs; inserted_id uuid;
begin
  if p_canonical_search_id is null then return query select 'skip'::text, null::uuid, null::jsonb; return; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_canonical_search_id::text, 42));
  select * into cached from public.monitoring_shared_runs r
   where r.canonical_search_id=p_canonical_search_id and r.status in ('no_change','change','uncertain')
     and r.completed_at >= now() - make_interval(mins => greatest(0, coalesce(p_cache_max_age_minutes,30)))
   order by r.completed_at desc limit 1;
  if cached.id is not null then return query select 'cache'::text, cached.id, cached.result; return; end if;
  if exists(select 1 from public.monitoring_shared_runs r where r.canonical_search_id=p_canonical_search_id and r.status='running') then
    return query select 'running'::text, null::uuid, null::jsonb; return;
  end if;
  insert into public.monitoring_shared_runs(canonical_search_id,status,provider,model) values(p_canonical_search_id,'running',coalesce(p_provider,'mock'),coalesce(p_model,'mock')) returning id into inserted_id;
  return query select 'run'::text, inserted_id, null::jsonb;
end $$;

create or replace function public.complete_monitoring_shared_run(p_shared_run_id uuid, p_status text, p_result jsonb, p_response_id text default null, p_raw_result jsonb default '{}'::jsonb, p_usage jsonb default '{}'::jsonb, p_error_message text default null)
returns void language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
  update public.monitoring_shared_runs set status=p_status, completed_at=now(), result=coalesce(p_result,'{}'::jsonb), response_id=p_response_id, raw_result=coalesce(p_raw_result,'{}'::jsonb), usage=coalesce(p_usage,'{}'::jsonb), error_message=p_error_message
  where id=p_shared_run_id returning canonical_search_id into cid;
  if cid is not null then update public.monitoring_canonical_searches set last_run_at=now(), last_successful_run_at=case when p_status in ('no_change','change','uncertain') then now() else last_successful_run_at end where id=cid; end if;
end $$;

create or replace function public.apply_ai_assistant_interpretation(
  p_watch_id uuid, p_owner_user_id uuid, p_request_snapshot text, p_title text, p_normalized_goal text,
  p_trigger_description text, p_search_guidance jsonb, p_frequency_minutes integer, p_completion_condition text,
  p_preferred_language text, p_monitoring_class text default 'normal', p_urgent_until timestamptz default null,
  p_canonical_key text default null, p_canonical_intent jsonb default null
)
returns public.monitoring_watches language plpgsql security definer set search_path = public as $$
declare updated_watch public.monitoring_watches; normalized_class text; old_canonical uuid; new_canonical uuid;
begin
  normalized_class := case when p_monitoring_class in ('long_term','normal','active','urgent') then p_monitoring_class else 'normal' end;
  select canonical_search_id into old_canonical from public.monitoring_watches where id=p_watch_id for update;
  new_canonical := public.ensure_monitoring_canonical_search(p_canonical_key, p_canonical_intent);
  update public.monitoring_watches
  set title=left(btrim(p_title),90), normalized_goal=left(btrim(p_normalized_goal),600), trigger_description=left(btrim(p_trigger_description),500), search_guidance=coalesce(p_search_guidance,'{}'::jsonb), frequency_minutes=greatest(60,least(coalesce(p_frequency_minutes,frequency_minutes),10080)), next_check_at=least(next_check_at,now()), completion_condition=nullif(left(btrim(coalesce(p_completion_condition,'')),500),''), preferred_language=case when p_preferred_language in ('en','no') then p_preferred_language else preferred_language end, monitoring_class=normalized_class, urgent_until=case when normalized_class='urgent' then coalesce(p_urgent_until,now()+interval '24 hours') else null end, consecutive_no_change_count=0, interpreted_at=now(), interpretation_status='complete', interpretation_error=null, status=case when status='error' then 'active' else status end, canonical_search_id=new_canonical, canonical_key=p_canonical_key, canonical_intent=p_canonical_intent
  where id=p_watch_id and owner_user_id=p_owner_user_id and original_request=p_request_snapshot and status <> 'completed'
  returning * into updated_watch;
  if updated_watch.id is null then raise exception 'watch_not_found_forbidden_or_stale'; end if;
  if old_canonical is not null then perform public.refresh_monitoring_canonical_active_count(old_canonical); end if;
  if new_canonical is not null then perform public.refresh_monitoring_canonical_active_count(new_canonical); end if;
  return updated_watch;
end; $$;

revoke execute on function public.apply_ai_assistant_interpretation(uuid,uuid,text,text,text,text,jsonb,integer,text,text,text,timestamptz,text,jsonb) from public, anon, authenticated;
grant execute on function public.apply_ai_assistant_interpretation(uuid,uuid,text,text,text,text,jsonb,integer,text,text,text,timestamptz,text,jsonb) to service_role;
revoke execute on function public.ensure_monitoring_canonical_search(text,jsonb) from public, anon, authenticated;
grant execute on function public.ensure_monitoring_canonical_search(text,jsonb) to service_role;
revoke execute on function public.claim_monitoring_shared_run(uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.claim_monitoring_shared_run(uuid,text,text,integer) to service_role;
revoke execute on function public.complete_monitoring_shared_run(uuid,text,jsonb,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.complete_monitoring_shared_run(uuid,text,jsonb,text,jsonb,jsonb,text) to service_role;
revoke execute on function public.refresh_monitoring_canonical_active_count(uuid) from public, anon, authenticated;
grant execute on function public.refresh_monitoring_canonical_active_count(uuid) to service_role;

create or replace function public.prune_monitoring_runs(retention_days integer default 90)
returns integer language plpgsql security definer set search_path = public as $$
declare deleted_count integer;
begin
  delete from public.monitoring_runs where completed_at is not null and completed_at < now() - make_interval(days => greatest(retention_days, 1));
  get diagnostics deleted_count = row_count;
  delete from public.monitoring_shared_runs where completed_at is not null and completed_at < now() - make_interval(days => greatest(retention_days, 1));
  return deleted_count;
end; $$;

notify pgrst,'reload schema';

create or replace function public.update_ai_assistant_watch_request(p_watch_id uuid, p_original_request text)
returns public.monitoring_watches language plpgsql security definer set search_path=public as $$
declare cleaned_request text:=public.ai_assistant_clean_request(p_original_request); updated_watch public.monitoring_watches; e record; old_canonical uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into e from public.get_ai_subscription_entitlements(auth.uid());
  if not e.monitoring_enabled then raise exception 'subscription_required'; end if;
  if char_length(cleaned_request)<8 or cleaned_request !~ '[[:alnum:]]' then raise exception 'request_too_short'; end if;
  if char_length(cleaned_request)>1000 then raise exception 'request_too_long'; end if;
  select canonical_search_id into old_canonical from public.monitoring_watches where id=p_watch_id and owner_user_id=auth.uid() for update;
  update public.monitoring_watches set original_request=cleaned_request, interpretation_status='pending', interpretation_error=null, interpreted_at=null, canonical_search_id=null, canonical_key=null, canonical_intent=null, next_check_at=now()
    where id=p_watch_id and owner_user_id=auth.uid() returning * into updated_watch;
  if updated_watch.id is null then raise exception 'watch_not_found_or_not_owned'; end if;
  if old_canonical is not null then perform public.refresh_monitoring_canonical_active_count(old_canonical); end if;
  perform public.enqueue_ai_assistant_interpretation(updated_watch.id, updated_watch.owner_user_id, updated_watch.original_request, now());
  insert into public.monitoring_queue(watch_id,run_after) values(updated_watch.id,now()) on conflict do nothing;
  return updated_watch;
end $$;

create or replace function public.pause_ai_assistant_watch(p_watch_id uuid)
returns public.monitoring_watches language plpgsql security definer set search_path = public as $$
declare updated_watch public.monitoring_watches;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.monitoring_watches set status='paused', show_in_app=true where id=p_watch_id and owner_user_id=auth.uid() returning * into updated_watch;
  if updated_watch.id is null then raise exception 'watch_not_found'; end if;
  update public.monitoring_queue set completed_at=now(), claimed_at=null, claimed_by=null, last_error='watch_paused' where watch_id=updated_watch.id and completed_at is null;
  if updated_watch.canonical_search_id is not null then perform public.refresh_monitoring_canonical_active_count(updated_watch.canonical_search_id); end if;
  return updated_watch;
end; $$;

create or replace function public.resume_ai_assistant_watch(p_watch_id uuid)
returns public.monitoring_watches language plpgsql security definer set search_path=public as $$
declare updated_watch public.monitoring_watches; e record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into e from public.get_ai_subscription_entitlements(auth.uid());
  if not e.monitoring_enabled then raise exception 'subscription_required'; end if;
  update public.monitoring_watches set status='active', show_in_app=true, next_check_at=greatest(coalesce(next_check_at,now()),now()) where id=p_watch_id and owner_user_id=auth.uid() returning * into updated_watch;
  if updated_watch.id is null then raise exception 'watch_not_found'; end if;
  if updated_watch.canonical_search_id is not null then perform public.refresh_monitoring_canonical_active_count(updated_watch.canonical_search_id); end if;
  return updated_watch;
end $$;

create or replace function public.delete_ai_assistant_watch(p_watch_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare old_canonical uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select canonical_search_id into old_canonical from public.monitoring_watches where id=p_watch_id and owner_user_id=auth.uid();
  delete from public.monitoring_watches where id=p_watch_id and owner_user_id=auth.uid();
  if not found then raise exception 'watch_not_found'; end if;
  if old_canonical is not null then perform public.refresh_monitoring_canonical_active_count(old_canonical); end if;
end $$;

revoke execute on function public.update_ai_assistant_watch_request(uuid,text) from public,anon;
grant execute on function public.update_ai_assistant_watch_request(uuid,text) to authenticated;
revoke execute on function public.pause_ai_assistant_watch(uuid) from public,anon;
grant execute on function public.pause_ai_assistant_watch(uuid) to authenticated;
revoke execute on function public.resume_ai_assistant_watch(uuid) from public,anon;
grant execute on function public.resume_ai_assistant_watch(uuid) to authenticated;
revoke execute on function public.delete_ai_assistant_watch(uuid) from public,anon;
grant execute on function public.delete_ai_assistant_watch(uuid) to authenticated;
notify pgrst,'reload schema';
