# TEMP_REFRESH_AUDIT

Temporary diagnostic instrumentation for tuning RE:MIND refresh/wake behaviour.

## Operation

Firmware builds default to disabled. Enable with the PlatformIO build flag
`-DTEMP_REFRESH_AUDIT_ENABLED=1`. The authenticated ingestion API independently
requires server environment variable `TEMP_REFRESH_AUDIT_ENABLED=true`; set it
to `false` (or omit it) to reject uploads.

Records are held in an eight-entry NVS ring. Old records are overwritten rather
than increasing storage or changing sleep. On battery, upload waits for four
queued events and sends at most eight. Manual refresh and USB-powered sessions
may flush any non-empty queue opportunistically. Every attempt occurs after an
existing application request, requires connected Wi-Fi, makes one attempt,
never reconnects/retries, and leaves the batch queued on failure. It does not
add a timer, wakeup, Wi-Fi session, or awake-time extension.

Each event receives an NVS-persisted monotonic `event_seq` and, when device wall
time is valid, an on-device `occurred_at`. Supabase `created_at` remains ingestion
time. `(device_id, event_seq)` is unique and ingestion uses conflict-ignore
upsert, so resending a batch after a lost response cannot inflate counts.

The canonical per-module render hashes from the existing render-state endpoint
are aggregated over the evaluated scope. The previous aggregate is built from
successfully displayed hashes in NVS; the next aggregate comes from the desired
render state. Physical hashes remain committed only after synchronous panel
success. `raw_changes` is nullable/empty where firmware cannot reliably retain
the upstream payload; `display_changes` records the canonical aggregate pair.
The current revision ledger only identifies changed modules, not trustworthy
field-level before/after values. Surf/Weather field causes therefore remain a
documented module-level limitation rather than adding a second renderer or
manufacturing diagnostic values.

Normal operational physical paths covered are smart partial/full updates,
manual refreshes, charger-connected full refreshes, charger-disconnected full
refreshes, and renderer-version maintenance full refreshes. Power and maintenance
updates are `intentional_refresh` because local pixels can change independently
of backend hashes. Pairing, setup, recharge, and shelf-recovery screens are
explicitly outside the normal operational audit set.

`display_attempted` records whether the refresh plan requested panel work,
`refresh_type_attempted` records partial/full/none before the operation, and
`display_succeeded` records the synchronous result (null for an intentional
no-op). `physical_refresh` is true only on success. A required but failed panel
operation is classified as `display_failed`, never `no_redraw`, and the stored
physical hash is not advanced.

`avoidable_wake` has a deliberately conservative TEMP_REFRESH_AUDIT definition:
the producer must provide `metadata.avoidable_wake_confident=true`, and the event
must also be a timer-driven, non-empty-module `scheduled_revision_poll` where the
backend revision and canonical render were unchanged and no display was
attempted. Current firmware does not assert that confidence because its due-work
state does not retain enough context to distinguish a genuinely unnecessary wake
from a required hard deadline, midnight rollover, or due source refresh. Those
legitimate no-redraw evaluations remain `no_redraw`; no wake is called avoidable
merely because it had no visual consequence.

## Queries

```sql
-- Recent decisions for one device
select * from public.temp_refresh_audit_logs
where device_id = 'DEVICE_ID' order by created_at desc;

-- Physical redraws with identical rendered output
select * from public.temp_refresh_audit_logs
where physical_refresh = true and render_changed = false
order by created_at desc;

-- Refreshes grouped by reason
select trigger, module, source, decision_reason, count(*)
from public.temp_refresh_audit_logs
group by trigger, module, source, decision_reason order by count(*) desc;

-- Surf-specific filtered changes and wasted redraws
select * from public.temp_refresh_audit_logs
where (module like '%surf%' or source like '%surf%')
  and decision in ('filtered_change', 'wasted_redraw')
order by created_at desc;
```

## Removal procedure

1. Search repository for `TEMP_REFRESH_AUDIT`.
2. Remove firmware/backend audit helper and feature flag.
3. Remove audit upload path.
4. Remove diagnostic tests.
5. Add a new `TEMP_REFRESH_AUDIT` cleanup migration (do not delete applied
   migration history) that unschedules `TEMP_REFRESH_AUDIT_retention`, drops
   `public.temp_refresh_audit_cleanup()`, and drops
   `public.temp_refresh_audit_logs`.

## TEMP_REFRESH_AUDIT activation checklist

1. Build the explicitly opt-in Alfred image with
   `pio run -d frame -e alfred_v1_2_refresh_audit`; the normal
   `alfred_v1_2` environment remains audit-off.
2. Flash that diagnostic image onto only the intended Alfred frames.
3. Set production backend environment variable
   `TEMP_REFRESH_AUDIT_ENABLED=true` and redeploy the backend.
4. Apply `20260908120000_temp_refresh_audit.sql` before accepting batches.
5. To stop collection immediately, set the backend flag to `false` and return
   frames to the normal `alfred_v1_2` firmware.
