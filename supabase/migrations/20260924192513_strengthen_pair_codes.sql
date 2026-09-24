create or replace function public.generate_pair_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  random_bytes bytea := gen_random_bytes(4);
  result text := '';
  i integer;
begin
  for i in 0..3 loop
    result := result || substr(alphabet, (get_byte(random_bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

revoke execute on function public.generate_pair_code() from public, anon, authenticated;

create or replace function public.start_pairing(p_device_id text)
returns table(pair_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  code text;
  exp timestamptz;
  attempt integer;
begin
  if p_device_id is null or btrim(p_device_id) = '' then
    raise exception 'invalid_device_id' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.devices d
    where d.device_id = p_device_id and d.owner_user_id is not null
  ) or exists (
    select 1 from public.device_members dm
    where dm.device_id = p_device_id
  ) then
    raise exception 'device_already_paired' using errcode = '42501';
  end if;

  delete from public.device_pair_codes pc where pc.expires_at <= now();
  exp := now() + interval '10 minutes';

  for attempt in 1..10 loop
    code := public.generate_pair_code();
    exit when not exists (
      select 1 from public.device_pair_codes pc
      where pc.pair_code = code and pc.expires_at > now()
    );
    code := null;
  end loop;

  if code is null then
    raise exception 'pair_code_generation_failed';
  end if;

  insert into public.device_pair_codes(device_id, pair_code, expires_at)
  values (p_device_id, code, exp);

  return query select code, exp;
end;
$$;

create or replace function public.create_member_pair_code(p_device_id text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text;
  attempt integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.device_members dm
    where dm.device_id = p_device_id
      and dm.user_id = v_user_id
  ) then
    raise exception 'Not allowed to share this frame';
  end if;

  delete from public.device_pair_codes pc where pc.expires_at <= now();

  for attempt in 1..10 loop
    v_code := public.generate_pair_code();
    exit when not exists (
      select 1 from public.device_pair_codes pc
      where pc.pair_code = v_code and pc.expires_at > now()
    );
    v_code := null;
  end loop;

  if v_code is null then
    raise exception 'pair_code_generation_failed';
  end if;

  insert into public.device_pair_codes (
    device_id,
    pair_code,
    expires_at,
    created_at
  )
  values (
    p_device_id,
    v_code,
    now() + interval '10 minutes',
    now()
  );

  return v_code;
end;
$$;
