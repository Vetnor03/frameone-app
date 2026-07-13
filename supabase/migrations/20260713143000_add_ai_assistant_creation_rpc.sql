-- RE:MIND AI Assistant app-facing helpers.
-- Browser clients can read safe task/update fields through RLS, but mutations are narrow RPCs.

create or replace function public.ai_assistant_clean_request(input text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(btrim(coalesce(input, '')), '\s+', ' ', 'g');
$$;

create or replace function public.ai_assistant_title(input text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when char_length(public.ai_assistant_clean_request(input)) <= 58 then public.ai_assistant_clean_request(input)
    else btrim(left(public.ai_assistant_clean_request(input), 55)) || '…'
  end;
$$;

create or replace function public.create_ai_assistant_watch(
  p_original_request text,
  p_frame_id text default null
)
returns public.monitoring_watches
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_request text := public.ai_assistant_clean_request(p_original_request);
  created_watch public.monitoring_watches;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if char_length(cleaned_request) < 8 or cleaned_request !~ '[[:alnum:]]' then
    raise exception 'request_too_short';
  end if;

  if char_length(cleaned_request) > 1000 then
    raise exception 'request_too_long';
  end if;

  if p_frame_id is not null and not exists (
    select 1 from public.device_members dm
    where dm.device_id = p_frame_id and dm.user_id = auth.uid()
  ) then
    raise exception 'frame_not_available';
  end if;

  insert into public.monitoring_watches (
    owner_user_id,
    frame_id,
    original_request,
    title,
    normalized_goal,
    trigger_description,
    search_guidance,
    frequency_minutes,
    next_check_at,
    status,
    show_in_app,
    show_on_frame
  ) values (
    auth.uid(),
    p_frame_id,
    cleaned_request,
    public.ai_assistant_title(cleaned_request),
    cleaned_request,
    'RE:MIND lets you know when something new and relevant happens.',
    jsonb_build_object('interpretation_status', 'temporary', 'future_ai_ready', true),
    60,
    now(),
    'active',
    true,
    false
  ) returning * into created_watch;

  insert into public.monitoring_queue (watch_id, run_after)
  values (created_watch.id, now())
  on conflict do nothing;

  return created_watch;
end;
$$;

create or replace function public.update_ai_assistant_watch_request(
  p_watch_id uuid,
  p_original_request text
)
returns public.monitoring_watches
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_request text := public.ai_assistant_clean_request(p_original_request);
  updated_watch public.monitoring_watches;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if char_length(cleaned_request) < 8 or cleaned_request !~ '[[:alnum:]]' then
    raise exception 'request_too_short';
  end if;

  if char_length(cleaned_request) > 1000 then
    raise exception 'request_too_long';
  end if;

  update public.monitoring_watches
  set original_request = cleaned_request,
      title = public.ai_assistant_title(cleaned_request),
      normalized_goal = cleaned_request,
      trigger_description = 'RE:MIND lets you know when something new and relevant happens.',
      search_guidance = jsonb_build_object('interpretation_status', 'temporary', 'future_ai_ready', true),
      status = 'active',
      frequency_minutes = 60,
      next_check_at = now(),
      show_in_app = true,
      show_on_frame = false
  where id = p_watch_id and owner_user_id = auth.uid()
  returning * into updated_watch;

  if updated_watch.id is null then
    raise exception 'watch_not_found';
  end if;

  insert into public.monitoring_queue (watch_id, run_after)
  values (updated_watch.id, now())
  on conflict do nothing;

  return updated_watch;
end;
$$;

create or replace function public.pause_ai_assistant_watch(p_watch_id uuid)
returns public.monitoring_watches
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_watch public.monitoring_watches;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.monitoring_watches
  set status = 'paused', show_in_app = true, show_on_frame = false
  where id = p_watch_id and owner_user_id = auth.uid()
  returning * into updated_watch;

  if updated_watch.id is null then
    raise exception 'watch_not_found';
  end if;

  return updated_watch;
end;
$$;

create or replace function public.resume_ai_assistant_watch(p_watch_id uuid)
returns public.monitoring_watches
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_watch public.monitoring_watches;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.monitoring_watches
  set status = 'active', frequency_minutes = 60, next_check_at = now(), show_in_app = true, show_on_frame = false
  where id = p_watch_id and owner_user_id = auth.uid()
  returning * into updated_watch;

  if updated_watch.id is null then
    raise exception 'watch_not_found';
  end if;

  insert into public.monitoring_queue (watch_id, run_after)
  values (updated_watch.id, now())
  on conflict do nothing;

  return updated_watch;
end;
$$;

create or replace function public.delete_ai_assistant_watch(p_watch_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.monitoring_watches
  where id = p_watch_id and owner_user_id = auth.uid();

  get diagnostics deleted_count = row_count;
  if deleted_count <> 1 then
    raise exception 'watch_not_found';
  end if;

  return true;
end;
$$;

revoke insert, update, delete on public.monitoring_watches from authenticated;
grant select on public.monitoring_watches to authenticated;

revoke execute on function public.ai_assistant_clean_request(text) from public, anon, authenticated;
revoke execute on function public.ai_assistant_title(text) from public, anon, authenticated;
revoke execute on function public.create_ai_assistant_watch(text,text) from public, anon;
revoke execute on function public.update_ai_assistant_watch_request(uuid,text) from public, anon;
revoke execute on function public.pause_ai_assistant_watch(uuid) from public, anon;
revoke execute on function public.resume_ai_assistant_watch(uuid) from public, anon;
revoke execute on function public.delete_ai_assistant_watch(uuid) from public, anon;

grant execute on function public.create_ai_assistant_watch(text,text) to authenticated;
grant execute on function public.update_ai_assistant_watch_request(uuid,text) to authenticated;
grant execute on function public.pause_ai_assistant_watch(uuid) to authenticated;
grant execute on function public.resume_ai_assistant_watch(uuid) to authenticated;
grant execute on function public.delete_ai_assistant_watch(uuid) to authenticated;
