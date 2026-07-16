-- Durable per-user onboarding state for AI Assistant suggestions. This is
-- intentionally independent of the current Watch rows, which users may delete.
create table if not exists public.user_onboarding_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  has_created_watch boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_onboarding_state enable row level security;

create policy "Users can read their own onboarding state"
on public.user_onboarding_state for select
to authenticated
using (user_id = auth.uid());

-- Preserve onboarding knowledge for every user with Watch history at migration
-- time. Future successful creations update this state atomically in the RPC.
insert into public.user_onboarding_state (user_id, has_created_watch)
select distinct owner_user_id, true
from public.monitoring_watches
on conflict (user_id) do update
set has_created_watch = true,
    updated_at = now();

create or replace function public.create_ai_assistant_watch(p_original_request text, p_frame_id text default null)
returns public.monitoring_watches language plpgsql security definer set search_path = public as $$
declare
  cleaned_request text := public.ai_assistant_clean_request(p_original_request);
  created_watch public.monitoring_watches;
  current_user_id uuid := auth.uid();
  owned_ongoing_watch_count integer;
begin
  if current_user_id is null then raise exception 'not_authenticated'; end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select count(*) into owned_ongoing_watch_count
  from public.monitoring_watches mw
  where mw.owner_user_id = current_user_id
    and mw.status in ('active', 'paused', 'error');

  if owned_ongoing_watch_count >= 5 then raise exception 'watch_limit_reached'; end if;
  if char_length(cleaned_request) < 8 or cleaned_request !~ '[[:alnum:]]' then raise exception 'request_too_short'; end if;
  if char_length(cleaned_request) > 1000 then raise exception 'request_too_long'; end if;
  if p_frame_id is not null and not exists (select 1 from public.device_members dm where dm.device_id = p_frame_id and dm.user_id = current_user_id) then raise exception 'frame_not_available'; end if;

  insert into public.monitoring_watches (owner_user_id, frame_id, original_request, title, normalized_goal, trigger_description, search_guidance, frequency_minutes, next_check_at, status, show_in_app, show_on_frame, interpretation_status)
  values (current_user_id, p_frame_id, cleaned_request, public.ai_assistant_title(cleaned_request), cleaned_request, 'RE:MIND lets you know when something new and relevant happens.', jsonb_build_object('interpretation_status', 'temporary', 'future_ai_ready', true), 60, now(), 'active', true, false, 'pending') returning * into created_watch;

  insert into public.user_onboarding_state (user_id, has_created_watch)
  values (current_user_id, true)
  on conflict (user_id) do update
  set has_created_watch = true,
      updated_at = now();

  perform public.enqueue_ai_assistant_interpretation(created_watch.id, created_watch.owner_user_id, created_watch.original_request, now());
  insert into public.monitoring_queue (watch_id, run_after) values (created_watch.id, now()) on conflict do nothing;
  return created_watch;
end; $$;

revoke all on public.user_onboarding_state from public, anon;
grant select on public.user_onboarding_state to authenticated;
revoke execute on function public.create_ai_assistant_watch(text,text) from public, anon;
grant execute on function public.create_ai_assistant_watch(text,text) to authenticated;

notify pgrst, 'reload schema';
