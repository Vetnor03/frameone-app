create or replace function public.start_pairing(p_device_id text)
returns table(pair_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  code text;
  exp timestamptz;
begin
  if p_device_id is null or btrim(p_device_id) = '' then
    raise exception 'invalid_device_id' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.devices d
    where d.device_id = p_device_id
      and d.owner_user_id is not null
  ) or exists (
    select 1
    from public.device_members dm
    where dm.device_id = p_device_id
  ) then
    raise exception 'device_already_paired' using errcode = '42501';
  end if;

  code := public.generate_pair_code();
  exp := now() + interval '10 minutes';

  insert into public.device_pair_codes(device_id, pair_code, expires_at)
  values (p_device_id, code, exp);

  return query select code, exp;
end;
$$;
