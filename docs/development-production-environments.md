# RE:MIND: separated production and staging

**Current state (2026-09-28):** production Vercel project is healthy; separate Supabase staging schema and permission parity are prepared. The isolated `frameone-staging` project has the five required environment-variable names scoped to Production and Preview, as verified in its dashboard; key ownership is still unverified until the build check runs. The first successful deployment and branch tracking remain pending. Do not edit the live Vercel project.

## Architecture

| | Production | Staging |
| --- | --- | --- |
| GitHub repository | `Vetnor03/frameone-app` | Same repository |
| Git branch | `main` | `development` |
| Vercel project | Existing `frameone-app` (`prj_boLzA3f5Ntu4r4Ei0AeqYCPhNgv0`) | `frameone-staging` (`prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR`) |
| Vercel deployment target | Production | **Production in the staging project** |
| Supabase ref | `bzkqyllgccswrfudmexm` | `ouwhfzjaahdipwmelzvf` |
| Domain | `re-mind.no` | New project-generated `.vercel.app` domain only |
| Records and devices | Real | Synthetic only |

The existing Vercel project and its environment variables are frozen. Production's live app and frame were smoke-tested on 2026-09-28. Do not create new production credentials or overwrite production variables to set up staging. No automatic database schema push or firmware flash is authorized.

## How the staged build is protected

The `development` branch runs two checks during staging builds:
- `scripts/verify-preview-supabase.mjs` runs as npm `prebuild` and confirms **both keys actually authenticate with staging Supabase**. It neither lists user data in logs nor writes records. The historical filename remains for compatibility.
- `next.config.ts` checks the actual `VERCEL_PROJECT_ID` against hardcoded staging ID `prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR` AND an explicitly supplied matching `REMIND_STAGING_VERCEL_PROJECT_ID`, branch `development` for the new project's production target, exact staging Supabase ref/URL, and absence of known live external-integration secrets or direct database URLs.

The primary deployment of the separate staging project is `VERCEL_ENV=production`; its **project ID**, not that label, separates it from live production. Live `main` is not changed. If the system project ID is unavailable or the approved ID does not match, the staging build fails closed.

## Exact Vercel project creation hand-off

The connected Vercel integration cannot access the newly created staging project yet (403 on its deployments), and cannot edit credentials; use the new project's dashboard. The user must do the following in the Vercel dashboard. Do not use direct-file deployment: it would not provide the requested Git-linked setup.

1. **Done:** create separate `frameone-staging` (`prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR`) with the existing GitHub repo. The environment variable list in the user's screenshot includes inherited variables, including `MINRENOVASJON_APP_KEY`; cleanup is required **only inside staging** before deployment. The connected Vercel app currently cannot list the new project (403 permission), so use new-project dashboard screenshots, not inferred connector data.
2. Under `frameone-staging` **Settings → Environments → Production → Branch Tracking**, select `development`. If Vercel reports `No deployments found for development`, this is a bootstrap issue: first obtain a Git-linked deployment of `development` using the **new staging project**, after cleaning up inherited variables and configuring staging-only credentials. Then retry tracking. Do not deploy `main` to solve this. The project's `frameone-staging.vercel.app` domain is separate from `re-mind.no`.
3. The project ID has been captured. In **this new project's own** Environment Variables, keep only these five under **Production and Preview** during the initial bootstrap (because the first `development` deployment may be a Preview before Branch Tracking can be changed):
   - `REMIND_STAGING_VERCEL_PROJECT_ID` = `prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR` (Config).
   - `REMIND_STAGING_SUPABASE_REF` = `ouwhfzjaahdipwmelzvf` (Config).
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://ouwhfzjaahdipwmelzvf.supabase.co` (Config).
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = **staging** legacy anon key (Config; public in browser).
   - `SUPABASE_SERVICE_ROLE_KEY` = **staging** service-role key (Secret; never public).
4. Enable **System Environment Variables** in the new project, so Vercel supplies `VERCEL_PROJECT_ID` and `VERCEL_GIT_COMMIT_REF`; never manually set or override these.
5. Remove any inherited live credentials **from `frameone-staging` only**; do not change `frameone-app` or its production variables. Do **not** add live `OPENAI_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, Teams/Spond credentials, Shopify, private push keys, direct Postgres URLs or any production-domain aliases. An inherited integration secret intentionally blocks the build. The repository still has a scheduled cron definition; without `CRON_SECRET`, its route returns unauthorized and cannot run the sync logic. Review whether to disable cron separately.
6. After cleanup and five staging-only variables, create a Git-linked **Preview** deployment from `development` in `frameone-staging` to establish that branch; once it exists, save Production Branch Tracking = `development`. Deploy it again and check `target=production`, `Git ref=development`, successful Supabase key validation and actual staging URL. The staging project must not contain customer accounts or production device tokens. Keep Preview/deployment access protected while testing.
7. Configure **staging Supabase Auth** Site URL and permitted redirect URLs only for the new project domain before testing email OTP. Do not send real customer emails; run synthetic tests first. Test backend and browser environment, actual two-account API isolation, pairing/recovery and a spare frame with a separate staged firmware target.

**Never ask the user to paste API keys into chat or GitHub.** The existing production project's previously added Preview Supabase variables can be left alone during this transition; do not use or redeploy its old previews. Protect/revoke older previews that might have embedded older production variables when safe.

## Release gate and further work

- Two-user SQL RLS smoke test has passed and test data was rolled back. This is NOT an API security acceptance test.
- Production's older migration history is not reconciled. Staging uses 34 staging-only migration entries. Do not run `db push`, `db reset` or blind migration replay against production.
- Review 21 authenticated-callable security-definer function warnings, auth/token and pairing v2 hardening, live two-user API isolation, cron and third-party side effects.
- Merge changes through reviewed PRs only, require CI on `main`, and verify physical firmware separately. Production is not a testing target.

## Staging schema restore evidence (2026-09-28)

- Source: saved schema-only export `production_schema_2026-09-26.sql` (stored outside Git), SHA-256 `5251eec498cb07d98e6bee50385ce98ff9a88bdbe97ac9a2d1148473b520c084`.
- A one-request import exceeded the tool's capacity and was verified to leave staging empty. The 1,203 top-level SQL statements were split safely on statement boundaries into **29 ordered** staging-only migration entries (`staging_schema_baseline_20260926_part_01` through `part_29`). Each succeeded. The snapshot has no top-level data imports or scheduled cron jobs.
- The subsequent repository migration `20260927063000_add_bounded_news_feed_cache.sql` was applied to staging as `staging_add_bounded_news_feed_cache`; it added the 64th public table.
- Initial ACL verification found **117 effective grant mismatches** (83 functions, 34 tables) due to new Supabase project's default grants. Those were repaired in 4 staging-only migrations. The reproducible repair SQL is `supabase/staging/staging_permission_parity_20260928.sql`; it must not be added to production's migration chain. Afterward 166 function/table/sequence effective grant matrices matched production exactly for anon/authenticated/service_role.
- Structural comparison: identical object names and counts for 64 public tables, 97 public/private functions (95 public), 92 policies, 34 triggers, 2 views, 186 indexes and 241 constraints. Four analytics CHECK constraints differ only in equivalent parentheses formatting; function bodies match once original CRLF line endings are normalized. No public table lacks RLS.
- Two synthetic authenticated accounts and devices were inserted inside a transaction, each role's JWT subject was simulated, and reciprocal row-isolation checks for devices, memberships, settings, reminders, countdowns and groceries passed. Cross-device reminder writes and grocery deletes were blocked. The transaction was rolled back; afterward staging had zero auth users, devices, memberships, reminders, countdowns, groceries, settings and cron jobs.
- Supabase security advisor: the temporary 69 anonymous SECURITY DEFINER findings caused by initial grants disappeared after ACL parity repair. Remaining findings include 34 INFO no-policy server-only/RLS tables and 21 WARN authenticated-callable SECURITY DEFINER functions. They require a separate behavior and privilege audit; an identical permission matrix is not proof of safe function behavior. Relevant advisor: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable .
- The baseline is **staging-only** and not an approved future production migration. Existing broad default privileges still need a deliberate reviewed cleanup on both environments. Do not connect Vercel Preview or customer hardware until its own secrets, email/OAuth/payment/cron side effects and real two-account API tests are configured and verified.
