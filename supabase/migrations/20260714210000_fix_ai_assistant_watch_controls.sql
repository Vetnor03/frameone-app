-- Repair AI Assistant / Watch mutation semantics.

create or replace function public.update_ai_assistant_watch_request(
  p_watch_id uuid,
  p_original_request text,
  p_title text default null,
  p_frequency_minutes integer default null,
  p_completion_condition text default null,
  p_preferred_language text default 'en',
  p_frame_id text default null,
  p_show_on_frame boolean default false
)
returns public.monitoring_watches language plpgsql security definer set search_path = public as $$
declare
  cleaned_request text := public.ai_assistant_clean_request(p_original_request);
  cleaned_title text := nullif(left(public.ai_assistant_clean_request(coalesce(p_title, '')), 90), '');
  updated_watch public.monitoring_watches;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(cleaned_request) < 8 or cleaned_request !~ '[[:alnum:]]' then raise exception 'request_too_short'; end if;
  if char_length(cleaned_request) > 1000 then raise exception 'request_too_long'; end if;
  if p_show_on_frame and p_frame_id is null then raise exception 'frame_required'; end if;
  if p_frame_id is not null and not exists (select 1 from public.device_members dm where dm.device_id = p_frame_id and dm.user_id = auth.uid()) then raise exception 'frame_not_available'; end if;

  update public.monitoring_watches
  set original_request = cleaned_request,
      title = coalesce(cleaned_title, public.ai_assistant_title(cleaned_request)),
      normalized_goal = cleaned_request,
      trigger_description = cleaned_request,
      frequency_minutes = greatest(5, least(coalesce(p_frequency_minutes, frequency_minutes), 10080)),
      completion_condition = nullif(left(public.ai_assistant_clean_request(coalesce(p_completion_condition, '')), 500), ''),
      preferred_language = case when p_preferred_language in ('en','no') then p_preferred_language else preferred_language end,
      status = 'active',
      next_check_at = now(),
      show_in_app = true,
      show_on_frame = p_show_on_frame,
      frame_id = case when p_show_on_frame then p_frame_id else frame_id end,
      interpretation_status = 'pending',
      interpretation_error = null
  where id = p_watch_id and owner_user_id = auth.uid()
  returning * into updated_watch;

  if updated_watch.id is null then raise exception 'watch_not_found'; end if;
  perform public.enqueue_ai_assistant_interpretation(updated_watch.id, updated_watch.owner_user_id, updated_watch.original_request, now());
  insert into public.monitoring_queue (watch_id, run_after) values (updated_watch.id, now()) on conflict do nothing;
  return updated_watch;
end; $$;

create or replace function public.pause_ai_assistant_watch(p_watch_id uuid)
returns public.monitoring_watches language plpgsql security definer set search_path = public as $$
declare updated_watch public.monitoring_watches;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.monitoring_watches set status = 'paused', show_in_app = true where id = p_watch_id and owner_user_id = auth.uid() returning * into updated_watch;
  if updated_watch.id is null then raise exception 'watch_not_found'; end if;
  update public.monitoring_queue set completed_at = now(), claimed_at = null, claimed_by = null, last_error = 'watch_paused' where watch_id = updated_watch.id and completed_at is null;
  return updated_watch;
end; $$;

create or replace function public.resume_ai_assistant_watch(p_watch_id uuid)
returns public.monitoring_watches language plpgsql security definer set search_path = public as $$
declare updated_watch public.monitoring_watches;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.monitoring_watches set status = 'active', show_in_app = true, next_check_at = greatest(coalesce(next_check_at, now()), now()) where id = p_watch_id and owner_user_id = auth.uid() returning * into updated_watch;
  if updated_watch.id is null then raise exception 'watch_not_found'; end if;
  return updated_watch;
end; $$;

drop function if exists public.update_ai_assistant_watch_request(uuid,text,text,boolean);
revoke execute on function public.update_ai_assistant_watch_request(uuid,text,text,integer,text,text,text,boolean) from public, anon;
grant execute on function public.update_ai_assistant_watch_request(uuid,text,text,integer,text,text,text,boolean) to authenticated;
