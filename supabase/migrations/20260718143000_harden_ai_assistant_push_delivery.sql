-- Harden RE:MIND push subscriptions and delivery retries.

alter table public.monitoring_update_push_deliveries
  add column if not exists next_attempt_at timestamptz not null default now();

alter table public.monitoring_update_push_deliveries
  drop constraint if exists monitoring_update_push_deliveries_status_check;
alter table public.monitoring_update_push_deliveries
  add constraint monitoring_update_push_deliveries_status_check check (status in ('pending','sending','sent','suppressed','no_subscription','failed'));

-- Existing duplicate endpoints are collapsed to the most recently updated row so
-- a browser endpoint cannot remain attached to multiple accounts.
with ranked as (
  select id, row_number() over (partition by endpoint order by updated_at desc, created_at desc, id desc) as rn
  from public.user_push_subscriptions
)
delete from public.user_push_subscriptions s using ranked r
where s.id = r.id and r.rn > 1;

alter table public.user_push_subscriptions
  drop constraint if exists user_push_subscriptions_user_endpoint_unique;
alter table public.user_push_subscriptions
  add constraint user_push_subscriptions_endpoint_unique unique (endpoint);

create index if not exists monitoring_update_push_deliveries_retry_idx
  on public.monitoring_update_push_deliveries (next_attempt_at, created_at)
  where status in ('pending','failed','sending');

create or replace function public.service_register_push_subscription(
  p_user_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare subscription_id uuid;
begin
  if p_user_id is null then
    raise exception 'missing_user_id' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_endpoint, ''))) = 0 or char_length(btrim(coalesce(p_p256dh, ''))) = 0 or char_length(btrim(coalesce(p_auth, ''))) = 0 then
    raise exception 'invalid_subscription' using errcode = '22023';
  end if;

  insert into public.user_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, enabled, last_error)
  values (p_user_id, p_endpoint, p_p256dh, p_auth, p_user_agent, true, null)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        enabled = true,
        last_error = null,
        updated_at = now()
  returning id into subscription_id;

  return subscription_id;
end; $$;

create or replace function public.claim_monitoring_update_push_deliveries(
  p_monitoring_update_id uuid default null,
  max_count integer default 10,
  max_attempts integer default 5
)
returns setof public.monitoring_update_push_deliveries language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidates as (
    select id from public.monitoring_update_push_deliveries
    where (
        status in ('pending','failed')
        or (status = 'sending' and updated_at < now() - interval '15 minutes')
      )
      and attempts < greatest(1, max_attempts)
      and next_attempt_at <= now()
      and (p_monitoring_update_id is null or monitoring_update_id = p_monitoring_update_id)
    order by next_attempt_at asc, created_at asc
    limit greatest(1, least(max_count, 50))
    for update skip locked
  )
  update public.monitoring_update_push_deliveries d
  set status = 'sending', attempts = attempts + 1, updated_at = now()
  from candidates c
  where d.id = c.id
  returning d.*;
end; $$;

drop function if exists public.register_push_subscription_for_user(uuid,text,text,text,text);
revoke execute on function public.service_register_push_subscription(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.service_register_push_subscription(uuid,text,text,text,text) to service_role;
revoke execute on function public.claim_monitoring_update_push_deliveries(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_monitoring_update_push_deliveries(uuid,integer,integer) to service_role;
