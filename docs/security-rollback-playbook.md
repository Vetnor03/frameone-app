# Security rollback playbook

This file records the September 24, 2026 RE:MIND security hardening sequence and the safest way to recover if a regression appears later.

## Ground rule

Do **not** delete rows from `supabase_migrations.schema_migrations` and do not try to roll the production database backward in place.

Use a new forward repair migration that restores the previous known-good behavior for only the affected object.

For application/API regressions, revert the relevant Git PR or redeploy the previous known-good Vercel production deployment.

For database regressions, prefer a narrow repair migration over disabling security globally.

## Known-good sequence

| PR | Production change | Migration / file | Safe recovery strategy |
| --- | --- | --- | --- |
| #1276 | Removed anonymous access to membership/grocery views and privileged RPCs | `20260924190059_restrict_anonymous_security_surface.sql` | Re-grant only the specific privilege proven necessary. Never restore broad `PUBLIC` access. |
| #1277 | Enabled non-recursive RLS on `device_members` | `20260924190525_enable_safe_device_members_rls.sql` | Repair the policy/helper that is failing. Do not disable RLS as the normal rollback. |
| #1278 | Grocery views use caller RLS; fixed function search paths | `20260924191231_make_grocery_views_security_invoker.sql`, `20260924191344_fix_function_search_paths.sql` | Restore only the affected view/function option if a compatibility problem is proven. |
| #1279 | Removed direct authenticated execution from internal RPCs and legacy grocery overload | `20260924191536_restrict_internal_security_definer_rpcs.sql`, `20260924191748_restrict_legacy_grocery_purchase_rpc.sql` | `GRANT EXECUTE` back only to the exact function/role that is required. |
| #1280 | Owner frame delete also clears `devices.owner_user_id` | `app/api/frame/delete/route.ts` | Revert PR #1280 if delete/reset behavior regresses. This is app code, not a schema migration. |
| #1281 | Already-owned/member frames cannot start a fresh pairing session | `20260924192134_block_pairing_for_owned_devices.sql` | Restore the previous `start_pairing(text)` definition with a new repair migration. |
| #1282 | Stronger 4-character pair/share codes; collision retry; internal generator | `20260924192513_strengthen_pair_codes.sql` | Restore the prior pair-code functions with a new repair migration. Existing codes need no data conversion. |

## Fast triage

Before changing anything, answer these in order:

1. Is the failure app/API only, or does direct database behavior also fail?
2. Is the physical frame still returning HTTP 200 on normal authenticated endpoints?
3. Does the affected signed-in user still appear in `device_members`?
4. Is the issue limited to one RPC/view/policy?
5. Can the failure be reproduced inside a transaction with `ROLLBACK`?

If yes to 4 or 5, repair only that object.

## Emergency checks

### Device membership RLS

Confirm RLS is enabled:

```sql
select relrowsecurity
from pg_class
where oid = 'public.device_members'::regclass;
```

Confirm an authenticated owner/member sees the expected device rows by testing with the appropriate JWT/session. An unrelated authenticated user should see zero memberships.

If a membership regression appears, first restore/recreate the private helper functions and policies from:

`supabase/migrations/20260924190525_enable_safe_device_members_rls.sql`

Do **not** use `alter table public.device_members disable row level security` as the normal recovery.

### Internal RPC permissions

If a server route suddenly reports permission denied, check the exact function:

```sql
select
  has_function_privilege('authenticated', 'public.FUNCTION_SIGNATURE', 'execute') as authenticated_execute,
  has_function_privilege('service_role', 'public.FUNCTION_SIGNATURE', 'execute') as service_execute;
```

If the server uses the service role, restore service-role access only. If a browser-authenticated user legitimately needs the RPC, grant `authenticated` only to that exact function.

### Grocery views

Current intended state:

```sql
select relname, reloptions
from pg_class
where oid in (
  'public.grocery_running_low'::regclass,
  'public.grocery_recipe_suggestions'::regclass
);
```

Both views should contain `security_invoker=true`.

If a proven compatibility problem requires reverting temporarily:

```sql
alter view public.grocery_running_low reset (security_invoker);
alter view public.grocery_recipe_suggestions reset (security_invoker);
```

Use a new repair migration and re-evaluate underlying RLS before leaving this state.

### Function search paths

Current hardened functions use:

`search_path = public, extensions`

If a function cannot resolve a dependency after the hardening, fix the function by schema-qualifying the dependency or set the smallest required explicit search path. Avoid restoring a caller-controlled/default search path.

### Pairing

Expected behavior:

- Unowned/reset frame: `start_pairing` succeeds.
- Owned/member frame: `start_pairing` rejects with `device_already_paired`.
- Owner delete/reset clears `owner_user_id`, token fields and memberships, after which pairing works again.
- Pair/share codes remain 4 characters.
- Current alphabet: `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`.

Do not restrict token recovery in `pair/status` until firmware has a separate device proof/recovery mechanism. Firmware currently relies on that endpoint when its locally saved token is missing.

## Useful Git checkpoints

Security hardening landed in this order:

- #1276
- #1277
- #1278
- #1279
- #1280
- #1281
- #1282

When creating a repair, inspect the immediately preceding main commit/PR and copy only the previous definition of the affected object into a **new** migration.

## Verification after any repair

Always verify all four:

1. The affected flow works with the real authenticated role.
2. An unrelated/anonymous caller still cannot access protected data.
3. Service-role backend calls still work where intended.
4. Vercel production runtime errors remain clean and physical-frame requests keep returning 200.
