-- Emergency: Assistant-only content must not request physical refreshes until the
-- installed firmware explicitly reports Assistant rendering capability.
create or replace function public.request_ai_assistant_frame_content_refresh(p_watch_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_frame_id text;
  has_assistant_capability boolean := false;
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

  select coalesce(st.current_version, '') like '%assistant_module_v1%'
    into has_assistant_capability
  from public.device_status st
  where st.device_id = target_frame_id;

  if not coalesce(has_assistant_capability, false) then
    return jsonb_build_object('requested', false, 'reused_pending_request', false, 'frame_id', target_frame_id, 'reason', p_reason, 'requires_capability', 'assistant_module_v1');
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
