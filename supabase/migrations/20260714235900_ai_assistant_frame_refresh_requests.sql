-- Request physical-frame refreshes for genuine AI Assistant content changes by
-- touching the existing device_settings.updated_at content-version marker.
-- This does not create a new wake schedule; sleeping frames see the change on
-- their normal status/config check-in.

create or replace function public.request_ai_assistant_frame_content_refresh(p_watch_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_frame_id text;
  had_pending boolean := false;
  touched_count integer := 0;
begin
  if p_reason not in ('new_update', 'read_state_changed') then
    return jsonb_build_object('requested', false, 'reused_pending_request', false, 'frame_id', null, 'reason', p_reason);
  end if;

  select w.frame_id into target_frame_id
  from public.monitoring_watches w
  where w.id = p_watch_id
    and w.status = 'active'
    and w.show_on_frame = true
    and w.frame_id is not null;

  if target_frame_id is null then
    return jsonb_build_object('requested', false, 'reused_pending_request', false, 'frame_id', null, 'reason', p_reason);
  end if;

  select exists (
    select 1
    from public.device_settings ds
    left join public.device_status st on st.device_id = ds.device_id
    where ds.device_id = target_frame_id
      and ds.updated_at > coalesce(st.last_render_at, st.last_refresh_at, '-infinity'::timestamptz)
  ) into had_pending;

  if had_pending then
    return jsonb_build_object('requested', true, 'reused_pending_request', true, 'frame_id', target_frame_id, 'reason', p_reason);
  end if;

  update public.device_settings ds
  set updated_at = now()
  where ds.device_id = target_frame_id
    and exists (
      select 1
      from jsonb_array_elements(coalesce(ds.settings_json->'cells', '[]'::jsonb)) as cell(value)
      where split_part(coalesce(cell.value->>'module', ''), ':', 1) = 'assistant'
    );

  get diagnostics touched_count = row_count;
  return jsonb_build_object('requested', touched_count > 0, 'reused_pending_request', false, 'frame_id', target_frame_id, 'reason', p_reason);
end;
$$;

revoke execute on function public.request_ai_assistant_frame_content_refresh(uuid, text) from public, anon, authenticated;
grant execute on function public.request_ai_assistant_frame_content_refresh(uuid, text) to service_role;

create or replace function public.ai_assistant_update_read_state_refresh_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_read is distinct from new.is_read or old.dismissed_from_frame is distinct from new.dismissed_from_frame then
    perform public.request_ai_assistant_frame_content_refresh(new.watch_id, 'read_state_changed');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ai_assistant_update_read_state_refresh on public.monitoring_updates;
create trigger trg_ai_assistant_update_read_state_refresh
after update of is_read, dismissed_from_frame on public.monitoring_updates
for each row
when (old.is_read is distinct from new.is_read or old.dismissed_from_frame is distinct from new.dismissed_from_frame)
execute function public.ai_assistant_update_read_state_refresh_trigger();
