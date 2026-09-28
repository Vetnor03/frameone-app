# RE:MIND environments and release gate

Status: staging database baseline restored and ACL parity verified. Vercel Preview activation, API-level security testing and production migration-history reconciliation remain pending.

## Inventory (2026-09-28)

- GitHub source of truth: `Vetnor03/frameone-app`; `main` is the current live code branch.
- Vercel: one existing `frameone-app` project. Its production domain and production settings remain unchanged.
- Supabase: existing `FRAME_V2` project in `eu-west-1` is production; identifier `bzkqyllgccswrfudmexm`. Do not alter its data or migration ledger to create staging.
- Staging Supabase: `RE:MIND STAGING` (`ouwhfzjaahdipwmelzvf`) in `eu-west-1`; URL `https://ouwhfzjaahdipwmelzvf.supabase.co`. Verified active and healthy. The schema was restored on 2026-09-28; no real user/device data was copied, and there are no scheduled jobs.
- IMRPlanner (`iwyhhvahtqwftcasvvel`) is now `INACTIVE` after a successful pause on 2026-09-28, freeing the Free-plan slot; do not delete it. Its application is unavailable while paused and can be restored later, subject to provider retention rules.
- Organization `Vetnor03's Org` remains Free; the project-creation cost check returned $0/month.
- The existing GitHub `main` branch has no branch protection at this snapshot. Protection must be enabled before treating the release process as enforced.
- Repository is currently public. Do not commit .env files, project API secrets, OTA signing secrets, database exports, real device tokens or real user data.

## Target wiring

| Component | Development / staging | Production |
| --- | --- | --- |
| Git | `development` and short-lived feature branches | `main` |
| Vercel | Preview deployment from `development` | Existing production deployment |
| Supabase | `RE:MIND STAGING` (`ouwhfzjaahdipwmelzvf`) | Existing `FRAME_V2` |
| Users/data | Synthetic accounts, test devices, synthetic data | Customer accounts and devices |
| Domain | Vercel preview URL initially; staging domain only after isolation is proven | `re-mind.no` |

Do not create a second live Vercel *production* project from the development branch: its `VERCEL_ENV=production` would bypass the preview-specific build gate. Use the existing project's **Preview** environment.

## Preview build is fail closed

`next.config.ts` aborts any Vercel Preview build unless ALL of the following are configured:

1. `REMIND_STAGING_SUPABASE_REF` is the exact 20-character ref of a separate staging project, not `bzkqyllgccswrfudmexm`.
2. `NEXT_PUBLIC_SUPABASE_URL` resolves exactly to `https://<staging-ref>.supabase.co`.
3. `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are present. `npm run build` first executes `scripts/verify-preview-supabase.mjs`, which checks the public key at staging Auth settings and the server key at staging Auth's admin endpoint. Credentials and response bodies are never logged. The build fails closed on mismatched/unavailable credentials.
4. `SUPABASE_URL`, if supplied as a fallback, matches the staging URL. Direct database connection variables (`DATABASE_URL`, `DIRECT_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`) are forbidden in Preview.
5. Vendor secrets enabling email, external integrations, cron, AI, push and commerce are absent in Preview. The build displays offending variable names only, never values. The current staging setup intentionally tests core app behavior, not those integrations.

This blocks **new builds**, not older preview deployments that may already exist. Audit/revoke old previews that can access production. Do not visit/use any preview with production credentials.

## Staging activation: in order

1. **Done:** isolated `RE:MIND STAGING` project created in `eu-west-1` after $0/month cost confirmation. Database schema is now restored, but the staging app is not yet deployed.
2. **Staging-only restore done:** use the validated 2026-09-26 schema-only export (checksum below) as a candidate fresh-install baseline, apply the subsequent News cache migration, then repair effective ACL differences caused by new-project default grants. Staging's migration ledger has 34 staging-only entries, NOT the historical production ledger. The old 92-file migration chain remains unreconciled, so automated `db push` is not enabled. **Do not** run `supabase db push` or `db reset` against production. See `docs/migration-reconciliation.md` and `docs/security-rollback-playbook.md`. Do not copy live user/auth tables or tokens into staging.
3. Populate test data, review exposed-schema RLS/grants, and run two-account negative authorization checks.
4. In Vercel `frameone-app` project's **Preview** environment, set `REMIND_STAGING_SUPABASE_REF=ouwhfzjaahdipwmelzvf`, `NEXT_PUBLIC_SUPABASE_URL=https://ouwhfzjaahdipwmelzvf.supabase.co`, the **staging project's** legacy `anon` key as `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and its **staging** service-role key as `SUPABASE_SERVICE_ROLE_KEY`. Find both on staging's API Keys screen; never paste a secret into Git, a support chat, a browser console, or project documentation. The connected Vercel integration cannot edit secrets, so this remains a dashboard step.
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

## Staging schema restore evidence (2026-09-28)

- Source: saved schema-only export `production_schema_2026-09-26.sql` (stored outside Git), SHA-256 `5251eec498cb07d98e6bee50385ce98ff9a88bdbe97ac9a2d1148473b520c084`.
- A one-request import exceeded the tool's capacity and was verified to leave staging empty. The 1,203 top-level SQL statements were split safely on statement boundaries into **29 ordered** staging-only migration entries (`staging_schema_baseline_20260926_part_01` through `part_29`). Each succeeded. The snapshot has no top-level data imports or scheduled cron jobs.
- The subsequent repository migration `20260927063000_add_bounded_news_feed_cache.sql` was applied to staging as `staging_add_bounded_news_feed_cache`; it added the 64th public table.
- Initial ACL verification found **117 effective grant mismatches** (83 functions, 34 tables) due to new Supabase project's default grants. Those were repaired in 4 staging-only migrations. The reproducible repair SQL is `supabase/staging/staging_permission_parity_20260928.sql`; it must not be added to production's migration chain. Afterward 166 function/table/sequence effective grant matrices matched production exactly for anon/authenticated/service_role.
- Structural comparison: identical object names and counts for 64 public tables, 97 public/private functions (95 public), 92 policies, 34 triggers, 2 views, 186 indexes and 241 constraints. Four analytics CHECK constraints differ only in equivalent parentheses formatting; function bodies match once original CRLF line endings are normalized. No public table lacks RLS.
- Two synthetic authenticated accounts and devices were inserted inside a transaction, each role's JWT subject was simulated, and reciprocal row-isolation checks for devices, memberships, settings, reminders, countdowns and groceries passed. Cross-device reminder writes and grocery deletes were blocked. The transaction was rolled back; afterward staging had zero auth users, devices, memberships, reminders, countdowns, groceries, settings and cron jobs.
- Supabase security advisor: the temporary 69 anonymous SECURITY DEFINER findings caused by initial grants disappeared after ACL parity repair. Remaining findings include 34 INFO no-policy server-only/RLS tables and 21 WARN authenticated-callable SECURITY DEFINER functions. They require a separate behavior and privilege audit; an identical permission matrix is not proof of safe function behavior. Relevant advisor: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable .
- The baseline is **staging-only** and not an approved future production migration. Existing broad default privileges still need a deliberate reviewed cleanup on both environments. Do not connect Vercel Preview or customer hardware until its own secrets, email/OAuth/payment/cron side effects and real two-account API tests are configured and verified.

## Vercel dashboard hand-off: Preview only (2026-09-28)

**Not yet done.** A healthy Supabase project or passing GitHub CI run is not a connected preview deployment.
Vercel: https://vercel.com/vetle-norstads-projects/frameone-app/settings/environment-variables
Staging API keys: https://supabase.com/dashboard/project/ouwhfzjaahdipwmelzvf/settings/api-keys

1. Open the existing frameone-app Vercel Environment Variables. If production Supabase variables are currently scoped to BOTH Production and Preview, edit the scopes so their original values remain Production only. Add separate Preview-only values below. Do not change the Production deployment or domain.
2. Add Preview-only REMIND_STAGING_SUPABASE_REF = ouwhfzjaahdipwmelzvf, and NEXT_PUBLIC_SUPABASE_URL = https://ouwhfzjaahdipwmelzvf.supabase.co.
3. Add Preview-only NEXT_PUBLIC_SUPABASE_ANON_KEY from staging's legacy anon key, and SUPABASE_SERVICE_ROLE_KEY from staging's service_role key. The latter is server-only and must NEVER use the NEXT_PUBLIC_ prefix. Do not copy production keys or send key values in chat.
4. Remove Preview scope from inherited RESEND_API_KEY, CRON_SECRET, MINRENOVASJON_APP_KEY, MICROSOFT_CLIENT_SECRET, INTEGRATION_CREDENTIALS_KEY, SPOND_CREDENTIALS_KEY, OPENAI_API_KEY, VAPID_PRIVATE_KEY, WEB_PUSH_PRIVATE_KEY, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_STOREFRONT_ACCESS_TOKEN and direct Postgres URLs. Preserve the existing Production scopes. If SUPABASE_URL exists in Preview, change it to the staging URL or remove Preview scope.
5. Configure staging Supabase Auth Site URL / allowed redirect URLs for the eventual Vercel Preview URL. Do not edit production Auth URLs. Limit staging logins to controlled test inboxes until email configuration is reviewed.
6. Secure or remove OLDER Vercel Preview deployments that predate the new safeguards. Environment variable changes do NOT rewrite existing deployments that may have production settings baked into browser bundles. Use Vercel Deployment Protection or revoke old preview URLs.
7. Redeploy development as a Preview. The prebuild verifier checks both keys against staging Auth without logging user or key data; next.config.ts then checks project ID, URL and disabled external integrations. Do not override failing safeguards merely to make a preview green.

External integration tests, user isolation through real authenticated APIs, and physical frame tests are separate release gates. The connected Vercel integration is read-only for environment settings, so those dashboard changes are not yet applied.
