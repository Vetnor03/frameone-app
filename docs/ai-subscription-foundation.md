# AI subscription foundation operations

Apply `20260716180000_add_ai_subscription_foundation.sql` before deploying the
updated `monitoring-worker` Edge Function. Replace `<USER_UUID>` below with an
`auth.users.id`. These manual assignments are development-only; there is no
public plan selector or admin UI.

## Inspect

```sql
select * from public.get_ai_subscription_entitlements('<USER_UUID>');

select count(*) as ongoing_watches
from public.monitoring_watches
where owner_user_id = '<USER_UUID>' and status in ('active', 'paused', 'error');

select count(*) as active_instant_watches
from public.monitoring_watches
where owner_user_id = '<USER_UUID>' and status = 'active' and is_instant;
```

## Trialing Basic (fresh 30-day trial)

```sql
insert into public.ai_subscription_accounts
  (user_id, plan, status, trial_started_at, trial_ends_at, billing_provider)
values
  ('<USER_UUID>', 'basic', 'trialing', now(), now() + interval '30 days', null)
on conflict (user_id) do update set
  plan = 'basic', status = 'trialing', trial_started_at = now(),
  trial_ends_at = now() + interval '30 days', subscription_started_at = null,
  current_period_end = null, billing_provider = null,
  provider_customer_id = null, provider_subscription_id = null,
  cancel_at_period_end = false;
```

Expire a trial:

```sql
update public.ai_subscription_accounts
set status = 'trialing', plan = 'basic', trial_ends_at = now() - interval '1 second'
where user_id = '<USER_UUID>';
```

## Active paid/manual plans

Use the same statement with `basic`, `normal`, or `pro` as the plan value:

```sql
update public.ai_subscription_accounts
set
  plan = 'pro',
  status = 'active',
  trial_started_at = null,
  trial_ends_at = null,
  subscription_started_at = now(),
  current_period_end = now() + interval '1 month',
  billing_provider = 'manual',
  provider_customer_id = null,
  provider_subscription_id = null,
  cancel_at_period_end = false
where user_id = '<USER_UUID>';
```

For Basic set `plan = 'basic'`; for Normal set `plan = 'normal'`; for Pro set
`plan = 'pro'`.

Set inactive:

```sql
update public.ai_subscription_accounts
set status = 'inactive', current_period_end = now(), cancel_at_period_end = false
where user_id = '<USER_UUID>';
```

## Entitlement behavior

An unexpired `trialing` row always receives Basic limits: five ongoing Watches
and no Instant Watches. Active Basic has the same limits. Active Normal and Pro
have unlimited ongoing Watches (represented as SQL `null`, never a large fake
number). Only active Pro receives five active Instant slots and the future
15-minute interval. Expired trials and every non-active state disable monitoring.

## Follow-up: Instant scheduling contract

The Instant executor is intentionally **not** implemented here. The follow-up
must schedule active Pro Instant Watches server-side every exactly **15 minutes**,
independent of physical frame wake-ups. Frame/app reads reuse the latest stored
result and must not initiate an OpenAI call. Workers must prevent concurrent work
for one Watch; skip paused, completed, deleted, inactive-subscription, and expired
trial Watches; retain rows/history after downgrade; and safely disable or treat
old Instant flags as normal after a Pro downgrade. The maximum remains five
ongoing Instant Watches per owner. Existing per-user/global paid-run caps remain
mandatory, and non-Instant Watches retain the adaptive schedule. No five-minute
or frame-wake-based Instant path may be introduced.
