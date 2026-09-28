# RE:MIND environments and release gate

Status: foundation in the `development` branch. This document does not mean staging is deployed or production migration history is repaired.

## Inventory (2026-09-28)

- GitHub source of truth: `Vetnor03/frameone-app`; `main` is the current live code branch.
- Vercel: one existing `frameone-app` project. Its production domain and production settings remain unchanged.
- Supabase: existing `FRAME_V2` project in `eu-west-1` is production; identifier `bzkqyllgccswrfudmexm`. Do not alter its data or migration ledger to create staging.
- There is no second RE:MIND Supabase project yet. IMRPlanner is unrelated and must not be used.
- The existing GitHub `main` branch has no branch protection at this snapshot. Protection must be enabled before treating the release process as enforced.
- Repository is currently public. Do not commit .env files, project API secrets, OTA signing secrets, database exports, real device tokens or real user data.

## Target wiring

| Component | Development / staging | Production |
| --- | --- | --- |
| Git | `development` and short-lived feature branches | `main` |
| Vercel | Preview deployment from `development` | Existing production deployment |
| Supabase | New separate RE:MIND staging project | Existing `FRAME_V2` |
| Users/data | Synthetic accounts, test devices, synthetic data | Customer accounts and devices |
| Domain | Vercel preview URL initially; staging domain only after isolation is proven | `re-mind.no` |

Do not create a second live Vercel *production* project from the development branch: its `VERCEL_ENV=production` would bypass the preview-specific build gate. Use the existing project's **Preview** environment.

## Preview build is fail closed

`next.config.ts` aborts any Vercel Preview build unless ALL of the following are configured:

1. `REMIND_STAGING_SUPABASE_REF` is the exact 20-character ref of a separate staging project, not `bzkqyllgccswrfudmexm`.
2. `NEXT_PUBLIC_SUPABASE_URL` resolves exactly to `https://<staging-ref>.supabase.co`.
3. `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are present. These must actually belong to the staging project; a build guard cannot prove that a secret key came from that project.

This blocks **new builds**, not older preview deployments that may already exist. Audit/revoke old previews that can access production. Do not visit/use any preview with production credentials.

## Staging activation: in order

1. Confirm the intended Supabase organization and pricing for an additional project; create an isolated project in the intended region.
2. Reconcile schema migration history in an isolated disposable database first. **Do not** run `supabase db push` or `db reset` against production. See `docs/migration-reconciliation.md` and `docs/security-rollback-playbook.md`. Do not copy live user/auth tables or tokens into staging.
3. Populate test data, review exposed-schema RLS/grants, and run two-account negative authorization checks.
4. In Vercel project's Preview environment, configure the staging project's **own** URL, anon/publishable key, service-role key and `REMIND_STAGING_SUPABASE_REF`. Make sure preview variables are not shared from production. Do not print secrets in CI or PR logs.
5. Configure staging-safe values for every side-effecting integration: auth site URL and callback redirects, email sender/recipient, Teams/Spond OAuth, payments/Shopify, OpenAI, push notifications, cron secrets and any external synchronization. Disable unnecessary jobs, payments, notifications and live provider writes until separately tested.
6. Redeploy the `development` preview. Verify the build gate passes, the app creates only synthetic staging data, and the staging app cannot modify the live Supabase project. Check both server and browser configurations.
7. Only then point a **spare test frame** at the staging origin using an explicitly separate firmware build/configuration. Do not reuse production device credentials or flash a production pilot frame with a staging firmware URL.

Staging readiness requires a successful build, two-user isolation test, pairing/reset/manual-update smoke test, and proof that live production remains unchanged. A green frontend build alone is insufficient.

## Change promotion

- Branch from `development`, open a pull request into `development`, pass app/firmware checks and staging tests.
- Promote the exact tested changes through a reviewed pull request from `development` to `main`, preferably in small release batches. Re-run required tests against the merge commit.
- Migrations must be independently reviewed and applied forward-only; a Git merge does not automatically authorize production database changes.
- Release firmware separately after physical acceptance, with explicit version and rollback plan. A web deployment is not a firmware flash.
- Production credentials must remain production-only; a failed preview isolation check is a blocking failure, never a reason to turn off the guard.

## GitHub protection required (repository Settings)

Configure a ruleset or branch protection on `main`: require a pull request and successful `Stable test gate`, `Typecheck and frame layouts` and `No new lint debt` checks; include firmware checks for firmware changes. Set up `development` with the same required app checks as appropriate. Avoid a mandatory second reviewer if a solo-owner account cannot satisfy it. Rules must apply to the repository owner too, rather than silently permitting direct pushes to production. Verify rules in the GitHub UI; the connected GitHub tool cannot change branch protection.

## Exit criteria before pilot expansion

Pairing v2 replaces the public ID-only/token-return legacy flow; migrated tokens are rotated; RLS/API isolation passes for two independent users; staging database reproduction is documented; real spare hardware completes pairing/recovery tests; production release checks and rollback are exercised.
