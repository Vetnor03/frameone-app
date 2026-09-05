# Initial onboarding deployment order

The migration `20260905160000_atomic_initial_onboarding.sql` is additive and does not seed established devices. It adds the onboarding lifecycle table, nullable `starter_key` columns, partial unique indexes, and the atomic completion RPC.

## Required order

1. Apply the Supabase migration.
2. Verify PostgREST has reloaded the schema and exposes `complete_initial_device_onboarding` to authenticated users.
3. Deploy the web/API application. The new code selects `starter_key` and calls the new RPC, so deploying it before the migration will break onboarding and countdown/reminder reads.
4. Deploy firmware with setup-pending support.

Do not apply the production migration from a local development task. Use the normal reviewed production migration process. Existing completed devices receive no lifecycle row and no starter content unless they enter the explicitly fresh-device onboarding flow.
