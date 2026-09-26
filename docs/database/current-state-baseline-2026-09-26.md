# RE:MIND current-state database baseline — 2026-09-26

Status: locally restored and structurally checked; NOT approved for deployment.

Source:
- Schema-only production export dated 2026-09-26.
- SHA-256: 5251eec498cb07d98e6bee50385ce98ff9a88bdbe97ac9a2d1148473b520c084
- Original and working SQL copies are stored outside this repository.

Local validation:
- Restored successfully into isolated PostgreSQL 17.6.
- Import completed with 0 warnings and 0 errors.
- 63 public tables, 97 functions, 92 public RLS policies, 2 public views and 34 public triggers.
- 0 public tables without RLS.
- Isolated test database stopped after validation.

Not yet validated:
- Function behavior, RLS authorization behavior and application workflows.
- Historical migration replay and production migration-history reconciliation.
- Scheduled-job records, external services and application-level dependencies.
- A deployable fresh-install migration sequence.

Safety:
- This document is an audit record, not a migration.
- Do not replay the historical migration chain against production.
- Do not run db push, db reset or migration repair against production.
