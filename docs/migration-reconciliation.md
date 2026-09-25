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
