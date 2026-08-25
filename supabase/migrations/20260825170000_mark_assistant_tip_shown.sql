-- The persisted values created before the landscape tip used indexes 0..2.
-- Record the version on each preference row so this data rewrite is safe if the
-- migration body is replayed during recovery.
alter table public.user_app_preferences
  add column if not exists assistant_tip_indexes_v2 boolean;

update public.user_app_preferences
set assistant_tips_shown = (
      select coalesce(array_agg(mapped_index order by first_position), '{}')
      from (
        select case legacy_index
            when 0 then 1
            when 1 then 2
            when 2 then 3
            else legacy_index
          end as mapped_index,
          min(position) as first_position
        from unnest(assistant_tips_shown) with ordinality as legacy(legacy_index, position)
        group by case legacy_index
          when 0 then 1
          when 1 then 2
          when 2 then 3
          else legacy_index
        end
      ) deduplicated
    ),
    assistant_tip_indexes_v2 = true
where assistant_tip_indexes_v2 is null;

alter table public.user_app_preferences
  alter column assistant_tip_indexes_v2 set default true,
  alter column assistant_tip_indexes_v2 set not null;

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
