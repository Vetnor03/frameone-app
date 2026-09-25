# Production migration reconciliation — inventory

Snapshot: 2026-09-25. This is a *history* audit, not evidence that all listed schema objects are absent.

## Current state

- Repository: **92** migration SQL files after assigning the update-probe migration its own version; each filename has a unique 14-digit version.
- Production migration ledger: **59** versions at this snapshot.
- **35** repository versions are not in the production ledger (several effects were manually applied).
- **2** production versions have no matching filename/version in the repo:
  - `20260923172402_add_device_power_mode_telemetry` (repository file: `20260923193000_add_device_power_mode_telemetry.sql`).
  - `20260924180127_add_openai_cost_controls` (repository file: `20260924183000_add_openai_cost_controls.sql`).
- The previous duplicate `20260810120000` is resolved by renaming `track_device_update_probes` to `20260810120001`. Production had neither August 10 version recorded.

## Safety rules

**Do not run `supabase db push` blindly against this production database.** That can replay historical SQL whose effects already exist, including older migration bodies that aren't safe to rerun.

Do not insert/delete raw rows in `supabase_migrations.schema_migrations` as a shortcut. Reconcile using the official migration workflow only after checking the actual schema and data effects for each version.

Do not rename a version that is already recorded in production merely to make filenames match; reconcile those two intentionally different version IDs separately.

## Next reconciliation work (separate reviewed change)

1. Capture a fresh `supabase migration list` and schema snapshot from the linked project.
2. Compare each untracked repository migration against *actual production objects, grants, policies, triggers, indexes and data migrations*, not just against a table name.
3. Classify each as fully applied, partially applied, intentionally retired, or missing.
4. For fully verified effects, use official `supabase migration repair --status applied <version>` rather than executing the SQL again. Record evidence and the precise version repaired.
5. For partial/missing effects, write a new, forward-only, idempotent corrective migration; test it on a disposable database or in a transaction before production.
6. Resolve the two production-only version IDs without pretending their timestamps match different local files.
7. Test a fresh local database from the migration chain before allowing automated production migration deployment.

The CI migration checker currently validates **filenames and duplicate versions only**. It intentionally does not mutate or assume access to the production database.


## 2026-09-25 read-only production audit — first pass

This evidence was gathered with read-only catalog queries and migration-history reads. No production schema, user rows, cron schedule, RLS policy or migration-history entry was changed.

### History comparison

| Category | Count | Meaning |
| --- | ---: | --- |
| Repo migration files / unique versions | 92 / 92 | All filenames pass the duplicate-version CI check. |
| Production ledger versions | 59 | `supabase_migrations.schema_migrations`. |
| Exact version overlap | 57 | Version appears in both ledgers; this alone does not prove identical SQL. |
| Repo-only versions | 35 | May be manually applied, superseded, partially applied or missing. |
| Production-only versions | 2 | Same migration names as differently timestamped repo files; detailed comparison below. |

The **stored production SQL**, not merely the migration names, was compared against both corresponding repo files:

- Production `20260923172402_add_device_power_mode_telemetry` is text-identical after trimming the final newline to repo `20260923193000_add_device_power_mode_telemetry.sql`. Live `device_status.power_mode` and `wake_reason` also exist as nullable text.
- Production `20260924180127_add_openai_cost_controls` is text-identical after trimming the final newline to repo `20260924183000_add_openai_cost_controls.sql`. The live usage/cache tables, expected core columns, indexes, status/token constraints and service-only RLS/grants were inspected.

**Preserve the original production versions and original Git filenames until an explicit reconciliation plan is reviewed.** The pairs contain identical SQL but have different version identities. They should not be replayed or casually renamed.

### Evidence of current schema (not proof of full historical execution)

For the following repo-only files, core table shape was verified live, including expected columns/types/defaults, keys/constraints/indexes where applicable, RLS and data-API grants:

| Repo-only file | Evidence / current-state status |
| --- | --- |
| `20260728120000_add_newsletter_subscribers.sql` | Newsletter table, email checks, active/unique indexes, RLS and denied direct anon/authenticated reads present. |
| `20260728150000_add_shop_frame_interest.sql` | Table, composite key, RLS and denied direct anon/authenticated reads present. |
| `20260809120000_add_device_update_state.sql` | Revision table, nonnegative/ordering checks, FK, RLS, service-only access and expected base columns present. The production functions must be compared with **latest**, not initial, revisions. |
| `20260810120000_add_user_app_preferences.sql` | Table, own-user RLS policy, check/FK, timestamp trigger and core columns present. Later Assistant-related columns also exist. |
| `20260810120001_track_device_update_probes.sql` | `last_probe_at` exists. |
| `20260901120000_repair_device_update_telemetry.sql` | `last_probe_at` and `app_active_until` exist. |
| `20260901130000_add_frame_content_title_cache.sql` | Cache table exists, RLS enabled, anon/authenticated direct reads denied. |
| `20260925060000_add_surf_frame_result_cache.sql` | Cache table, primary key, refreshed-at index, RLS and service-only access present. |

Additional live objects with RLS enabled were verified as existing: `device_update_requests`, `custom_layouts`, `assistant_pending_actions`, `product_analytics_events`, `assistant_capability_gaps`, `frame_content_revisions`, `frame_content_revision_changes`, `temp_refresh_audit_logs`, `grocery_recipes`, `grocery_recipe_ingredients`, and `waste_provider_registry`.

The current RPC signatures/access roles were also observed for heartbeat/ACK/request update, OpenAI budget, recipe save/update, initial onboarding, Assistant tips, and content revision bump. Presence of the *current* function is not proof that an older function-replacement migration can safely be run again.

For `20260924190500_disable_ai_follow_cron.sql`, the live cron table currently has **zero** jobs matching its three target endpoints. Current absence cannot prove when/how those jobs were removed.

For `20260906120000_authoritative_waste_provider_families.sql`, the current registry uses the five provider-family values in its intended check and has **17** municipality rows (counts: him 1; minrenovasjon 8; norconsult_unresolved 2; oslo 1; renovasjonsportal 5). This confirms current shape and population, not that destructive seeding can be repeated safely.

### Explicit replay hazards — do NOT bulk apply

| File | Why it is unsafe to infer or replay |
| --- | --- |
| `20260906120000_authoritative_waste_provider_families.sql` | Executes `DELETE FROM public.waste_provider_registry` followed by seeding; can erase newer registry data. |
| `20260825170000_mark_assistant_tip_shown.sql` | Data migration remaps historical integer tip indexes in existing user preference rows. Current schema alone cannot prove which rows underwent that rewrite. |
| `20260811130000_add_device_update_request_ledger.sql` | Seeds idempotency rows from live update state; request history and current function behavior must be checked separately. |
| `20260908120000_temp_refresh_audit.sql` | Plain `CREATE TABLE` on an existing table and a cron schedule; do not replay. |
| `20260824130000_repair_saved_recipe_schema.sql` and `20260824140000_reconcile_saved_recipe_legacy_schema.sql` | Reconcile legacy columns/data and may remove old columns. Validate actual historical/data state and all dependencies. |
| `20260718190000_add_ai_watch_canonical_dedup.sql` | Large shared-cache/AI migration and privileged-function changes; audit it separately before any repair. |
| `20260906190000_frame_content_revisions.sql` and the August update-state migrations | Replace the update-request function across several versions; replaying old bodies could downgrade current idempotency/revision logic. |
| `20260924190500_disable_ai_follow_cron.sql` | Unschedules jobs. Current zero-job state is not independent proof of historical application. |

### Stop point and required continuation

**No production migration-history repair or `db push` was performed in this audit.** The current observations establish portions of the desired *final state* but not that every historical migration's data effects happened. The available Supabase connector lists/applies migrations but does not expose the dedicated CLI `migration repair` operation; writing the ledger directly would bypass the supported workflow.

Next, classify all 35 repo-only migrations against a reviewed baseline, compare current function/policy definitions rather than just object names, and use a disposable local/branch database to validate the replay chain. Reconcile version IDs via the official CLI only after that evidence is complete, avoiding direct SQL against `supabase_migrations.schema_migrations`. Do not mark all entries applied merely to silence the history mismatch.

Source reference: Supabase Database Migrations guide, “Diagnosing and fixing sync errors” (migration repair changes tracking only; it does not apply SQL).
