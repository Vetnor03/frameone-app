# RE:MIND migration baseline reconciliation plan

Status: DRAFT — planning only. No production changes approved.

## Established facts
- The repository contains 92 historical migration files.
- The production ledger contains 59 versions.
- There are 35 repository-only versions and 2 production-only versions.
- The historical chain lacks its original starting schema.
- The 2026-09-26 current-state schema restored successfully in isolated PostgreSQL 17.6.

## Proposed approach
1. Preserve all historical migration files and their original version IDs.
2. Use the validated current-state export as a candidate for a NEW baseline, not as a migration preceding the old chain.
3. Test a fresh-install migration sequence in a disposable, unlinked local environment.
4. Validate grants, RLS behavior, functions, dependencies and synthetic application workflows.
5. Reconcile production migration history separately, using the official workflow only after verifying each outstanding version.
6. Do not activate a new baseline in the production migration path until its deployment and history implications have been reviewed.

## Restrictions
- Do not replay the historical chain against production.
- Do not execute the current-state baseline against the existing production database.
- Do not bulk-mark outstanding migrations as applied.
- Do not run production db push, db reset or migration repair during this planning phase.
- Keep the raw production schema export outside Git.
