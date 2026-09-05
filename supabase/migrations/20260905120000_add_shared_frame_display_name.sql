-- A frame name belongs to the physical/shared frame, never to a membership.
alter table public.devices
  add column if not exists display_name text;

alter table public.devices
  drop constraint if exists devices_display_name_valid;
alter table public.devices
  add constraint devices_display_name_valid
  check (display_name is null or char_length(btrim(display_name)) between 1 and 40);

create or replace function public.enforce_frame_display_name_owner()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.display_name is distinct from old.display_name and not exists (
    select 1 from public.device_members
    where device_id = old.device_id
      and user_id = auth.uid()
      and lower(role) = 'owner'
  ) then
    raise exception 'frame_owner_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_frame_display_name_owner on public.devices;
create trigger enforce_frame_display_name_owner
before update of display_name on public.devices
for each row execute function public.enforce_frame_display_name_owner();

create or replace function public.rename_owned_frame(p_device_id text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := btrim(p_display_name);
  changed public.devices;
begin
  if clean_name is null or char_length(clean_name) not between 1 and 40 then
    raise exception 'invalid_frame_name' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.device_members
    where device_id = p_device_id and user_id = auth.uid() and lower(role) = 'owner'
  ) then
    raise exception 'frame_owner_required' using errcode = '42501';
  end if;

  update public.devices set display_name = clean_name where device_id = p_device_id returning * into changed;
  if changed.device_id is null then raise exception 'frame_not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('device_id', changed.device_id, 'display_name', changed.display_name);
end;
$$;

revoke all on function public.rename_owned_frame(text, text) from public;
grant execute on function public.rename_owned_frame(text, text) to authenticated;

create or replace function public.get_accessible_frame_names()
returns table(device_id text, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select d.device_id, d.display_name
  from public.devices d
  join public.device_members m on m.device_id = d.device_id
  where m.user_id = auth.uid();
$$;

revoke all on function public.get_accessible_frame_names() from public;
grant execute on function public.get_accessible_frame_names() to authenticated;
