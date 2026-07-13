-- Durable server-side interpretation queue. No network calls from triggers; workers claim rows explicitly.
create table if not exists public.ai_assistant_interpretation_queue (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.monitoring_watches(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  request_snapshot text not null,
  run_after timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  completed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_assistant_interpretation_queue_attempts_check check (attempts >= 0),
  constraint ai_assistant_interpretation_queue_request_snapshot_not_empty check (char_length(btrim(request_snapshot)) > 0)
);

create unique index if not exists ai_assistant_interpretation_one_open_per_watch_idx
  on public.ai_assistant_interpretation_queue (watch_id)
  where completed_at is null;
create index if not exists ai_assistant_interpretation_claim_idx
  on public.ai_assistant_interpretation_queue (run_after, created_at)
  where completed_at is null and claimed_at is null;

drop trigger if exists trg_ai_assistant_interpretation_queue_updated_at on public.ai_assistant_interpretation_queue;
create trigger trg_ai_assistant_interpretation_queue_updated_at before update on public.ai_assistant_interpretation_queue for each row execute function public.set_timestamp_updated_at();

alter table public.ai_assistant_interpretation_queue enable row level security;

create or replace function public.enqueue_ai_assistant_interpretation(p_watch_id uuid, p_owner_user_id uuid, p_request_snapshot text, p_run_after timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare queued_id uuid;
begin
  insert into public.ai_assistant_interpretation_queue (watch_id, owner_user_id, request_snapshot, run_after)
  values (p_watch_id, p_owner_user_id, p_request_snapshot, coalesce(p_run_after, now()))
  on conflict (watch_id) where completed_at is null do update
    set owner_user_id = excluded.owner_user_id,
        request_snapshot = excluded.request_snapshot,
        run_after = excluded.run_after,
        claimed_at = null,
        claimed_by = null,
        last_error = null,
        updated_at = now()
  returning id into queued_id;
  return queued_id;
end; $$;

create or replace function public.claim_ai_assistant_interpretation_queue(max_count integer default 5, worker_id text default null, stale_after_minutes integer default 15)
returns setof public.ai_assistant_interpretation_queue language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidates as (
    select id from public.ai_assistant_interpretation_queue
    where completed_at is null
      and attempts < 8
      and run_after <= now()
      and (claimed_at is null or claimed_at < now() - make_interval(mins => stale_after_minutes))
    order by run_after asc, created_at asc
    limit greatest(1, least(max_count, 50))
    for update skip locked
  )
  update public.ai_assistant_interpretation_queue q
  set claimed_at = now(), claimed_by = coalesce(worker_id, 'interpretation-worker'), attempts = attempts + 1, updated_at = now()
  from candidates c where q.id = c.id
  returning q.*;
end; $$;

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
  p_preferred_language text
)
returns public.monitoring_watches language plpgsql security definer set search_path = public as $$
declare updated_watch public.monitoring_watches;
begin
  update public.monitoring_watches
  set title = left(btrim(p_title), 90),
      normalized_goal = left(btrim(p_normalized_goal), 600),
      trigger_description = left(btrim(p_trigger_description), 500),
      search_guidance = coalesce(p_search_guidance, '{}'::jsonb),
      frequency_minutes = greatest(5, least(coalesce(p_frequency_minutes, frequency_minutes), 10080)),
      next_check_at = least(next_check_at, now()),
      completion_condition = nullif(left(btrim(coalesce(p_completion_condition, '')), 500), ''),
      preferred_language = case when p_preferred_language in ('en','no') then p_preferred_language else preferred_language end,
      interpreted_at = now(),
      interpretation_status = 'complete',
      interpretation_error = null
  where id = p_watch_id and owner_user_id = p_owner_user_id and original_request = p_request_snapshot and status <> 'completed'
  returning * into updated_watch;
  if updated_watch.id is null then raise exception 'watch_not_found_forbidden_or_stale'; end if;
  return updated_watch;
end; $$;

create or replace function public.create_ai_assistant_watch(p_original_request text, p_frame_id text default null)
returns public.monitoring_watches language plpgsql security definer set search_path = public as $$
declare cleaned_request text := public.ai_assistant_clean_request(p_original_request); created_watch public.monitoring_watches;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(cleaned_request) < 8 or cleaned_request !~ '[[:alnum:]]' then raise exception 'request_too_short'; end if;
  if char_length(cleaned_request) > 1000 then raise exception 'request_too_long'; end if;
  if p_frame_id is not null and not exists (select 1 from public.device_members dm where dm.device_id = p_frame_id and dm.user_id = auth.uid()) then raise exception 'frame_not_available'; end if;
  insert into public.monitoring_watches (owner_user_id, frame_id, original_request, title, normalized_goal, trigger_description, search_guidance, frequency_minutes, next_check_at, status, show_in_app, show_on_frame, interpretation_status)
  values (auth.uid(), p_frame_id, cleaned_request, public.ai_assistant_title(cleaned_request), cleaned_request, 'RE:MIND lets you know when something new and relevant happens.', jsonb_build_object('interpretation_status', 'temporary', 'future_ai_ready', true), 60, now(), 'active', true, false, 'pending') returning * into created_watch;
  perform public.enqueue_ai_assistant_interpretation(created_watch.id, created_watch.owner_user_id, created_watch.original_request, now());
  insert into public.monitoring_queue (watch_id, run_after) values (created_watch.id, now()) on conflict do nothing;
  return created_watch;
end; $$;

create or replace function public.update_ai_assistant_watch_request(p_watch_id uuid, p_original_request text)
returns public.monitoring_watches language plpgsql security definer set search_path = public as $$
declare cleaned_request text := public.ai_assistant_clean_request(p_original_request); updated_watch public.monitoring_watches;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(cleaned_request) < 8 or cleaned_request !~ '[[:alnum:]]' then raise exception 'request_too_short'; end if;
  if char_length(cleaned_request) > 1000 then raise exception 'request_too_long'; end if;
  update public.monitoring_watches
  set original_request = cleaned_request, title = public.ai_assistant_title(cleaned_request), normalized_goal = cleaned_request, trigger_description = 'RE:MIND lets you know when something new and relevant happens.', search_guidance = jsonb_build_object('interpretation_status', 'temporary', 'future_ai_ready', true), status = 'active', frequency_minutes = 60, next_check_at = now(), show_in_app = true, show_on_frame = false, interpretation_status = 'pending', interpretation_error = null
  where id = p_watch_id and owner_user_id = auth.uid() returning * into updated_watch;
  if updated_watch.id is null then raise exception 'watch_not_found'; end if;
  perform public.enqueue_ai_assistant_interpretation(updated_watch.id, updated_watch.owner_user_id, updated_watch.original_request, now());
  insert into public.monitoring_queue (watch_id, run_after) values (updated_watch.id, now()) on conflict do nothing;
  return updated_watch;
end; $$;

revoke all on public.ai_assistant_interpretation_queue from public, anon, authenticated;
revoke execute on function public.enqueue_ai_assistant_interpretation(uuid,uuid,text,timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_ai_assistant_interpretation_queue(integer,text,integer) from public, anon, authenticated;
revoke execute on function public.apply_ai_assistant_interpretation(uuid,uuid,text,text,text,text,jsonb,integer,text,text) from public, anon, authenticated;
grant execute on function public.enqueue_ai_assistant_interpretation(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.claim_ai_assistant_interpretation_queue(integer,text,integer) to service_role;
grant execute on function public.apply_ai_assistant_interpretation(uuid,uuid,text,text,text,text,jsonb,integer,text,text) to service_role;
-- Remove the previous narrower-but-stale-prone signature after replacing it with request_snapshot validation.
drop function if exists public.apply_ai_assistant_interpretation(uuid,uuid,text,text,text,jsonb,integer,text,text);
