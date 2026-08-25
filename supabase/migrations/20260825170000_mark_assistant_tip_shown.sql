create or replace function public.mark_assistant_tip_shown(p_tip integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or p_tip < 0 then
    raise exception 'invalid_tip';
  end if;

  insert into public.user_app_preferences(user_id, assistant_tips_shown)
  values(uid, array[p_tip])
  on conflict(user_id) do update
    set assistant_tips_shown = case
      when p_tip = any(user_app_preferences.assistant_tips_shown) then user_app_preferences.assistant_tips_shown
      else array_append(user_app_preferences.assistant_tips_shown, p_tip)
    end;
end
$$;

revoke all on function public.mark_assistant_tip_shown(integer) from public;
grant execute on function public.mark_assistant_tip_shown(integer) to authenticated;
