# AI subscription foundation operations

After the two deployed foundation migrations, apply
`20260716213000_complete_instant_watch_plans.sql` before deploying the updated
`monitoring-worker` Edge Function. Replace `<USER_UUID>` below with an
`auth.users.id`. These manual assignments are development-only; there is no
public plan selector or admin UI.

## Inspect

```sql
select * from public.get_ai_subscription_entitlements('<USER_UUID>');

select count(*) as ongoing_watches
from public.monitoring_watches
where owner_user_id = '<USER_UUID>' and status in ('active', 'paused', 'error');

select count(*) as occupied_instant_watches
from public.monitoring_watches
where owner_user_id = '<USER_UUID>'
  and status in ('active', 'paused', 'error') and is_instant;
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

Every total allowance is numeric, and Instant Watches are a subset of that total:

| State | Total ongoing Watches | Instant Watches | Instant interval |
| --- | ---: | ---: | ---: |
| Unexpired Trial | 2 | 1 | 15 minutes |
| Active Basic | 3 | 0 | Not available |
| Active Normal | 5 | 1 | 15 minutes |
| Active Pro | 10 | 5 | 15 minutes |
| Expired/inactive | 0 | 0 | Not available |

Ongoing and occupied means `active`, `paused`, or `error`. Completed/deleted and
non-owner shared Watches do not count. Downgrades keep Watches and history; the
preview RPC retains the oldest eligible Instant flags by `created_at`, then UUID.

## Instant scheduling and operations

The database due selector, existing monitoring queue, and worker implement the
15-minute cadence. Frame wakes and app reads only reuse stored results. Invoke
`monitoring-scheduler` at least every 15 minutes (recommended cron expression:
`*/15 * * * *`) with the existing `x-monitoring-secret` architecture, then let
the existing worker consume the queue. Redeploy both `monitoring-scheduler` and
`monitoring-worker` after applying the migration.

The repository defaults preserve the paid-run caps at 20 OpenAI runs per user
per day and 300 per user per month. Global daily/monthly defaults are disabled
unless their environment variables are configured; database per-user overrides
may lower or raise the two user caps. Thus the defaults stop one Instant Watch
at 20 of a theoretical 96 daily checks, and stop five Pro Instant Watches at the
same shared per-user daily cap of 20 out of 480. Operations must explicitly set
appropriate per-user overrides/defaults (and review configured global caps and
budget) before claiming full production cadence; the safety protections must not
be removed silently.
