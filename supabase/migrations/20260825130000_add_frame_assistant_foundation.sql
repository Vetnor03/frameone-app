alter table public.user_app_preferences
  add column if not exists show_ai_assistant boolean not null default true,
  add column if not exists proactive_assistant_tips boolean not null default true,
  add column if not exists assistant_tips_shown integer[] not null default '{}';

create table if not exists public.assistant_pending_actions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null, action text not null check (action = 'create_reminder'), payload jsonb not null,
  expires_at timestamptz not null default now() + interval '10 minutes', created_at timestamptz not null default now()
);
alter table public.assistant_pending_actions enable row level security;
revoke all on public.assistant_pending_actions from anon, authenticated;

create table if not exists public.assistant_request_limits (
  user_id uuid not null references auth.users(id) on delete cascade, bucket timestamptz not null,
  request_kind text not null check (request_kind in ('action','intent')), request_count integer not null default 0,
  primary key (user_id, bucket, request_kind)
);
alter table public.assistant_request_limits enable row level security;
revoke all on public.assistant_request_limits from anon, authenticated;

create or replace function public.consume_assistant_request(p_kind text, p_limit integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); current_count integer;
begin
  if uid is null or p_kind not in ('action','intent') or p_limit < 1 then return false; end if;
  insert into assistant_request_limits(user_id,bucket,request_kind,request_count)
  values(uid,date_trunc('minute',now()),p_kind,1)
  on conflict(user_id,bucket,request_kind) do update set request_count=assistant_request_limits.request_count+1
  returning request_count into current_count;
  return current_count <= p_limit;
end $$;
revoke all on function public.consume_assistant_request(text,integer) from public;
grant execute on function public.consume_assistant_request(text,integer) to authenticated;

create table if not exists public.grocery_add_requests (
  user_id uuid not null references auth.users(id) on delete cascade, device_id text not null, request_id uuid not null,
  result jsonb, created_at timestamptz not null default now(), primary key(user_id,device_id,request_id)
);
alter table public.grocery_add_requests enable row level security;
revoke all on public.grocery_add_requests from anon, authenticated;

create or replace function public.add_grocery_items_canonical(p_device_id text, p_items jsonb, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); entry jsonb; clean_name text; clean_key text; qty integer; cat text; existing grocery_items%rowtype; history grocery_item_history%rowtype; ids uuid[] := '{}'; prior jsonb; claimed boolean;
begin
  if uid is null or not exists(select 1 from device_members where device_id=p_device_id and user_id=uid) then raise exception 'not_available'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'invalid_items'; end if;
  select result into prior from grocery_add_requests where user_id=uid and device_id=p_device_id and request_id=p_request_id;
  if prior is not null then return prior; end if;
  insert into grocery_add_requests(user_id,device_id,request_id) values(uid,p_device_id,p_request_id) on conflict do nothing returning true into claimed;
  if not coalesce(claimed,false) then
    select result into prior from grocery_add_requests where user_id=uid and device_id=p_device_id and request_id=p_request_id;
    return coalesce(prior,jsonb_build_object('ok',false));
  end if;
  for entry in select * from jsonb_array_elements(p_items) loop
    clean_name := regexp_replace(btrim(entry->>'name'),'\s+',' ','g'); clean_key := lower(clean_name);
    qty := greatest(1,least(99,coalesce((entry->>'quantity')::integer,1))); cat := coalesce(entry->>'category','other');
    if clean_name='' or length(clean_name)>80 or cat not in ('fruit_veg','bread','dairy','cold_cuts','meat_fish','frozen','dry_goods','spices','toiletries','snacks','drinks','household','other') then raise exception 'invalid_item'; end if;
    select * into existing from grocery_items where device_id=p_device_id and lower(regexp_replace(btrim(name),'\s+',' ','g'))=clean_key and amount is null and unit is null and (not is_checked or checked_at > now()-interval '10 minutes') order by is_checked asc, updated_at desc limit 1 for update;
    if found then
      update grocery_items set quantity=existing.quantity+qty,is_checked=false,checked_at=null where id=existing.id returning id into existing.id;
    else
      insert into grocery_items(device_id,created_by,name,quantity,category,is_checked) values(p_device_id,uid,clean_name,qty,cat,false) returning * into existing;
    end if;
    ids := array_append(ids,existing.id);
    select * into history from grocery_item_history where device_id=p_device_id and lower(regexp_replace(btrim(name),'\s+',' ','g'))=clean_key order by last_used_at desc limit 1 for update;
    if found then
      update grocery_item_history set name=clean_name,usage_count=history.usage_count+1,last_used_at=now(),category=cat where id=history.id;
      delete from grocery_item_history where device_id=p_device_id and id<>history.id and lower(regexp_replace(btrim(name),'\s+',' ','g'))=clean_key;
    else
      insert into grocery_item_history(device_id,name,usage_count,category,last_used_at) values(p_device_id,clean_name,1,cat,now());
    end if;
    perform mark_grocery_item_probably_out(p_device_id,clean_name);
  end loop;
  prior := jsonb_build_object('ok',true,'item_ids',to_jsonb(ids));
  update grocery_add_requests set result=prior where user_id=uid and device_id=p_device_id and request_id=p_request_id;
  return prior;
end $$;
revoke all on function public.add_grocery_items_canonical(text,jsonb,uuid) from public;
grant execute on function public.add_grocery_items_canonical(text,jsonb,uuid) to authenticated;
