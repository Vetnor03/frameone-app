-- RE:MIND Watch / Følg med backend foundation.

create table if not exists public.monitoring_watches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  frame_id text,
  original_request text not null,
  title text not null,
  normalized_goal text not null,
  trigger_description text not null,
  search_guidance jsonb not null default '{}'::jsonb,
  frequency_minutes integer not null default 60,
  next_check_at timestamptz not null default now(),
  last_checked_at timestamptz,
  status text not null default 'active',
  show_in_app boolean not null default true,
  show_on_frame boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monitoring_watches_status_check check (status in ('active','paused','completed','error')),
  constraint monitoring_watches_frequency_check check (frequency_minutes between 5 and 10080),
  constraint monitoring_watches_original_request_not_empty check (char_length(btrim(original_request)) > 0),
  constraint monitoring_watches_title_not_empty check (char_length(btrim(title)) > 0),
  constraint monitoring_watches_goal_not_empty check (char_length(btrim(normalized_goal)) > 0),
  constraint monitoring_watches_trigger_not_empty check (char_length(btrim(trigger_description)) > 0)
);

create table if not exists public.monitoring_runs (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.monitoring_watches(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  provider text not null default 'mock',
  model text not null default 'mock',
  response_id text,
  raw_result jsonb not null default '{}'::jsonb,
  error_message text,
  usage jsonb not null default '{}'::jsonb,
  constraint monitoring_runs_status_check check (status in ('running','no_change','change','uncertain','error'))
);

create table if not exists public.monitoring_updates (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.monitoring_watches(id) on delete cascade,
  run_id uuid not null references public.monitoring_runs(id) on delete cascade,
  headline text not null,
  summary text not null,
  event_at timestamptz,
  confidence numeric(4,3) not null default 0,
  fingerprint text not null,
  source_urls jsonb not null default '[]'::jsonb,
  is_read boolean not null default false,
  dismissed_from_frame boolean not null default false,
  created_at timestamptz not null default now(),
  constraint monitoring_updates_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint monitoring_updates_sources_array check (jsonb_typeof(source_urls) = 'array'),
  constraint monitoring_updates_headline_not_empty check (char_length(btrim(headline)) > 0),
  constraint monitoring_updates_summary_not_empty check (char_length(btrim(summary)) > 0),
  constraint monitoring_updates_fingerprint_not_empty check (char_length(btrim(fingerprint)) > 0),
  constraint monitoring_updates_watch_fingerprint_unique unique (watch_id, fingerprint)
);

create table if not exists public.monitoring_queue (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.monitoring_watches(id) on delete cascade,
  run_after timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  completed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monitoring_queue_attempts_check check (attempts >= 0)
);

create unique index if not exists monitoring_queue_one_open_per_watch_idx
  on public.monitoring_queue (watch_id)
  where completed_at is null;
create index if not exists monitoring_watches_due_idx
  on public.monitoring_watches (next_check_at, status) where status = 'active';
create index if not exists monitoring_watches_owner_idx on public.monitoring_watches (owner_user_id, created_at desc);
create index if not exists monitoring_watches_frame_idx on public.monitoring_watches (frame_id) where frame_id is not null;
create index if not exists monitoring_runs_watch_started_idx on public.monitoring_runs (watch_id, started_at desc);
create unique index if not exists monitoring_runs_one_running_per_watch_idx
  on public.monitoring_runs (watch_id)
  where status = 'running';
create index if not exists monitoring_updates_watch_created_idx on public.monitoring_updates (watch_id, created_at desc);
create index if not exists monitoring_updates_frame_unread_idx on public.monitoring_updates (watch_id, created_at desc) where is_read = false and dismissed_from_frame = false;
create index if not exists monitoring_queue_claim_idx on public.monitoring_queue (run_after, created_at) where completed_at is null and claimed_at is null;

create or replace function public.set_timestamp_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_monitoring_watches_updated_at on public.monitoring_watches;
create trigger trg_monitoring_watches_updated_at before update on public.monitoring_watches for each row execute function public.set_timestamp_updated_at();
drop trigger if exists trg_monitoring_queue_updated_at on public.monitoring_queue;
create trigger trg_monitoring_queue_updated_at before update on public.monitoring_queue for each row execute function public.set_timestamp_updated_at();

alter table public.monitoring_watches enable row level security;
alter table public.monitoring_runs enable row level security;
alter table public.monitoring_updates enable row level security;
alter table public.monitoring_queue enable row level security;

create or replace function public.can_access_monitoring_watch(w public.monitoring_watches)
returns boolean language sql stable as $$
  select auth.uid() = w.owner_user_id or (
    w.frame_id is not null and exists (
      select 1 from public.device_members dm where dm.device_id = w.frame_id and dm.user_id = auth.uid()
    )
  );
$$;

drop policy if exists "Users can read owned or frame shared watches" on public.monitoring_watches;
create policy "Users can read owned or frame shared watches" on public.monitoring_watches for select using (public.can_access_monitoring_watch(monitoring_watches));
drop policy if exists "Users can insert owned watches" on public.monitoring_watches;
create policy "Users can insert owned watches" on public.monitoring_watches for insert with check (owner_user_id = auth.uid() and (frame_id is null or exists (select 1 from public.device_members dm where dm.device_id = monitoring_watches.frame_id and dm.user_id = auth.uid())));
drop policy if exists "Owners can update watches" on public.monitoring_watches;
create policy "Owners can update watches" on public.monitoring_watches for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid() and (frame_id is null or exists (select 1 from public.device_members dm where dm.device_id = monitoring_watches.frame_id and dm.user_id = auth.uid())));
drop policy if exists "Owners can delete watches" on public.monitoring_watches;
create policy "Owners can delete watches" on public.monitoring_watches for delete using (owner_user_id = auth.uid());

drop policy if exists "Users can read runs through accessible watches" on public.monitoring_runs;
create policy "Users can read runs through accessible watches" on public.monitoring_runs for select using (exists (select 1 from public.monitoring_watches w where w.id = monitoring_runs.watch_id and public.can_access_monitoring_watch(w)));
drop policy if exists "Users can read updates through accessible watches" on public.monitoring_updates;
create policy "Users can read updates through accessible watches" on public.monitoring_updates for select using (exists (select 1 from public.monitoring_watches w where w.id = monitoring_updates.watch_id and public.can_access_monitoring_watch(w)));
drop policy if exists "Users can mark accessible updates read" on public.monitoring_updates;
revoke update on public.monitoring_updates from authenticated;
grant update (is_read, dismissed_from_frame) on public.monitoring_updates to authenticated;
create policy "Users can mark accessible updates read" on public.monitoring_updates for update using (exists (select 1 from public.monitoring_watches w where w.id = monitoring_updates.watch_id and public.can_access_monitoring_watch(w))) with check (exists (select 1 from public.monitoring_watches w where w.id = monitoring_updates.watch_id and public.can_access_monitoring_watch(w)));

create or replace function public.enqueue_due_monitoring_watches(max_count integer default 100)
returns integer language plpgsql security definer set search_path = public as $$
declare inserted_count integer;
begin
  with due as (
    select id from public.monitoring_watches
    where status = 'active' and next_check_at <= now()
    order by next_check_at asc
    limit greatest(1, least(max_count, 1000))
    for update skip locked
  ), inserted as (
    insert into public.monitoring_queue (watch_id)
    select id from due
    on conflict do nothing
    returning 1
  )
  select count(*) into inserted_count from inserted;
  return inserted_count;
end; $$;

create or replace function public.claim_monitoring_queue(max_count integer default 5, worker_id text default null, stale_after_minutes integer default 15)
returns setof public.monitoring_queue language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidates as (
    select id from public.monitoring_queue
    where completed_at is null
      and run_after <= now()
      and (claimed_at is null or claimed_at < now() - make_interval(mins => stale_after_minutes))
    order by run_after asc, created_at asc
    limit greatest(1, least(max_count, 50))
    for update skip locked
  )
  update public.monitoring_queue q
  set claimed_at = now(), claimed_by = coalesce(worker_id, 'worker'), attempts = attempts + 1, updated_at = now()
  from candidates c where q.id = c.id
  returning q.*;
end; $$;

revoke execute on function public.enqueue_due_monitoring_watches(integer) from public, anon, authenticated;
revoke execute on function public.claim_monitoring_queue(integer,text,integer) from public, anon, authenticated;
grant execute on function public.enqueue_due_monitoring_watches(integer) to service_role;
grant execute on function public.claim_monitoring_queue(integer,text,integer) to service_role;

create or replace function public.prune_monitoring_runs(retention_days integer default 90)
returns integer language plpgsql security definer set search_path = public as $$
declare deleted_count integer;
begin
  delete from public.monitoring_runs
  where completed_at is not null
    and completed_at < now() - make_interval(days => greatest(1, retention_days));
  get diagnostics deleted_count = row_count;
  return deleted_count;
end; $$;

revoke execute on function public.prune_monitoring_runs(integer) from public, anon, authenticated;
grant execute on function public.prune_monitoring_runs(integer) to service_role;
