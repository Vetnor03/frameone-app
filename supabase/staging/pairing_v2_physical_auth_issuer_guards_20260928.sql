-- STAGING ONLY: central hash-only physical auth and legacy issuer guards.
-- Exact target: Supabase ouwhfzjaahdipwmelzvf. No production migration replay.
-- No data insertion, credential provisioning or live HTTP v2 activation.

create function public.pair_v2_staging_device_auth_mode(
  p_device_id text, p_candidate_token_hash bytea
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_owner uuid;
  v_legacy_token text;
  v_legacy_hash text;
  v_active_hash bytea;
  v_active_at timestamptz;
  v_revoked_at timestamptz;
  v_has_v2 boolean;
begin
  if p_device_id is null or btrim(p_device_id) = ''
     or octet_length(p_candidate_token_hash) <> 32
  then return 'denied'; end if;

  select d.owner_user_id, d.device_token, d.device_token_hash,
         c.device_id is not null, c.active_token_hash, c.active_token_at,
         c.bootstrap_revoked_at
    into v_owner, v_legacy_token, v_legacy_hash,
         v_has_v2, v_active_hash, v_active_at, v_revoked_at
  from public.devices d
  left join pairing_v2.device_credentials c on c.device_id = d.device_id
  where d.device_id = p_device_id;

  if not found then return 'denied'; end if;

  if v_has_v2 then
    if v_owner is not null
       and v_legacy_token is null and v_legacy_hash is null
       and v_active_hash is not null and v_active_at is not null
       and v_revoked_at is not null
       and v_active_hash = p_candidate_token_hash
       and exists (
         select 1 from public.device_members m
         where m.device_id = p_device_id
           and m.user_id = v_owner and m.role = 'owner'
       )
    then return 'v2_valid'; end if;
    return 'v2_denied';
  end if;

  return 'legacy';
end;
$function$;

revoke all on function public.pair_v2_staging_device_auth_mode(text,bytea)
  from public, anon, authenticated, service_role;
grant execute on function public.pair_v2_staging_device_auth_mode(text,bytea)
  to service_role;

-- Blocks direct reintroduction of old-style credentials on any v2 row.
create function pairing_v2.reject_legacy_token_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (new.device_token is not null or new.device_token_hash is not null)
     and exists (
       select 1 from pairing_v2.device_credentials c
       where c.device_id = new.device_id
     )
  then
    raise exception 'legacy_token_disabled_for_v2_device' using errcode='42501';
  end if;
  return new;
end;
$function$;
revoke all on function pairing_v2.reject_legacy_token_write()
  from public, anon, authenticated, service_role;

create trigger pairing_v2_reject_legacy_token_update
before update of device_token,device_token_hash on public.devices
for each row execute function pairing_v2.reject_legacy_token_write();

-- Do not silently remove/reassign an activated (or provisioned) v2 frame
-- through the old app delete/reassign path. A reviewed v2 revocation and
-- tombstone lifecycle must be implemented before physical activation.
create function pairing_v2.reject_unreviewed_ownership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.owner_user_id is not null
     and new.owner_user_id is distinct from old.owner_user_id
     and exists (
       select 1 from pairing_v2.device_credentials c
       where c.device_id = new.device_id
     )
  then
    raise exception 'v2_device_revocation_required' using errcode='42501';
  end if;
  return new;
end;
$function$;
revoke all on function pairing_v2.reject_unreviewed_ownership_change()
  from public, anon, authenticated, service_role;

create trigger pairing_v2_reject_owner_reset
before update of owner_user_id on public.devices
for each row execute function pairing_v2.reject_unreviewed_ownership_change();

create function pairing_v2.reject_unreviewed_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from pairing_v2.device_credentials c
    where c.device_id = old.device_id
  ) then
    raise exception 'v2_device_revocation_required' using errcode='42501';
  end if;
  return old;
end;
$function$;
revoke all on function pairing_v2.reject_unreviewed_delete()
  from public, anon, authenticated, service_role;

create trigger pairing_v2_reject_cascade_delete
before delete on public.devices
for each row execute function pairing_v2.reject_unreviewed_delete();

-- The following existing functions are recreated with their exact existing
-- behavior and grants, plus a fail-closed guard for a v2 credential record.

-- Guarded legacy function: claim_pair_code
CREATE OR REPLACE FUNCTION public.claim_pair_code(p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_user uuid;
  v_device text;
  v_has_owner boolean;
begin
  v_user := auth.uid();

  if v_user is null then
    return false;
  end if;

  -- Find valid code
  select device_id
  into v_device
  from public.device_pair_codes
  where pair_code = upper(p_code)
    and expires_at > now()
  limit 1;

  if v_device is null then
    return false;
  end if;

  if exists (select 1 from pairing_v2.device_credentials c where c.device_id=v_device) then
    return false;
  end if;

  -- Ensure device exists
  insert into public.devices (device_id)
  values (v_device)
  on conflict (device_id) do nothing;

  -- Check if device already has an owner
  select owner_user_id is not null
  into v_has_owner
  from public.devices
  where device_id = v_device;

  -- If no owner yet → set this user as owner
  if not v_has_owner then
    update public.devices
    set owner_user_id = v_user,
        paired_at = coalesce(paired_at, now())
    where device_id = v_device;

    insert into public.device_members (device_id, user_id, role)
    values (v_device, v_user, 'owner')
    on conflict do nothing;

  else
    -- Otherwise → normal member
    insert into public.device_members (device_id, user_id, role)
    values (v_device, v_user, 'member')
    on conflict do nothing;
  end if;

  -- Delete used code
  delete from public.device_pair_codes
  where pair_code = upper(p_code);

  return true;
end;
$function$

-- Guarded legacy function: create_member_pair_code
CREATE OR REPLACE FUNCTION public.create_member_pair_code(p_device_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_code text;
  attempt integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;


  if exists (
    select 1 from pairing_v2.device_credentials c
    where c.device_id = p_device_id
  ) then
    raise exception 'legacy_token_disabled_for_v2_device' using errcode='42501';
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
$function$

-- Guarded legacy function: device_pair_status
CREATE OR REPLACE FUNCTION public.device_pair_status(p_device_id text)
 RETURNS TABLE(paired boolean, device_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_has_member boolean;
  v_token text;
begin
  if exists (select 1 from pairing_v2.device_credentials c where c.device_id=p_device_id) then
    return query select false, null::text;
    return;
  end if;

  select exists(
    select 1
    from public.device_members
    where device_id = p_device_id
  ) into v_has_member;

  if not v_has_member then
    return query select false, null::text;
    return;
  end if;

  v_token := public.ensure_device_token(p_device_id);

  return query select true, v_token;
end;
$function$

-- Guarded legacy function: ensure_device_token
CREATE OR REPLACE FUNCTION public.ensure_device_token(p_device_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_token text;
begin
  perform 1 from public.devices d where d.device_id=p_device_id for update;
  if exists (
    select 1 from pairing_v2.device_credentials c
    where c.device_id = p_device_id
  ) then
    raise exception 'legacy_token_disabled_for_v2_device' using errcode='42501';
  end if;

  select device_token into v_token
  from public.devices
  where device_id = p_device_id;

  if v_token is null or length(v_token) = 0 then
    v_token := encode(gen_random_bytes(16), 'hex');
  end if;

  update public.devices
  set device_token = v_token,
      device_token_hash = encode(digest(v_token, 'sha256'), 'hex'),
      paired_at = coalesce(paired_at, now())
  where device_id = p_device_id;

  return v_token;
end;
$function$

-- Guarded legacy function: set_device_token
CREATE OR REPLACE FUNCTION public.set_device_token(p_device_id text)
 RETURNS TABLE(device_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_token text;
begin
  perform 1 from public.devices d where d.device_id=p_device_id for update;
  if exists (
    select 1 from pairing_v2.device_credentials c
    where c.device_id = p_device_id
  ) then
    raise exception 'legacy_token_disabled_for_v2_device' using errcode='42501';
  end if;

  -- generate random token (32 bytes -> 64 hex chars)
  v_token := encode(gen_random_bytes(32), 'hex');

  update public.devices
  set device_token_hash = public.hash_device_token(v_token)
  where device_id = p_device_id;

  if not found then
    raise exception 'Device not found: %', p_device_id;
  end if;

  return query select v_token;
end;
$function$

-- Guarded legacy function: start_pairing
CREATE OR REPLACE FUNCTION public.start_pairing(p_device_id text)
 RETURNS TABLE(pair_code text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  code text;
  exp timestamptz;
  attempt integer;
begin
  if p_device_id is null or btrim(p_device_id) = '' then
    raise exception 'invalid_device_id' using errcode = '22023';
  end if;


  if exists (
    select 1 from pairing_v2.device_credentials c
    where c.device_id = p_device_id
  ) then
    raise exception 'legacy_token_disabled_for_v2_device' using errcode='42501';
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
$function$
