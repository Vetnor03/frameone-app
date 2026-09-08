# TEMP_REFRESH_AUDIT

Temporary diagnostic instrumentation for tuning RE:MIND refresh/wake behaviour.

## Operation

Firmware builds default to disabled. Enable with the PlatformIO build flag
`-DTEMP_REFRESH_AUDIT_ENABLED=1`. The authenticated ingestion API independently
requires server environment variable `TEMP_REFRESH_AUDIT_ENABLED=true`; set it
to `false` (or omit it) to reject uploads.

Records are held in an eight-entry NVS ring. Old records are overwritten rather
than increasing storage or changing sleep. A batch is attempted only immediately
after an existing revision/render-state communication session in scheduled or
manual refresh handling. The upload method requires connected Wi-Fi, makes one
attempt, never reconnects/retries, and leaves the batch queued on failure. It
does not add a timer, wakeup, or Wi-Fi session.

The canonical per-module render hashes from the existing render-state endpoint
are aggregated over the evaluated scope. The previous aggregate is built from
successfully displayed hashes in NVS; the next aggregate comes from the desired
render state. Physical hashes remain committed only after synchronous panel
success. `raw_changes` is nullable/empty where firmware cannot reliably retain
the upstream payload; `display_changes` records the canonical aggregate pair.

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
5. Drop the temporary Supabase audit table/migration cleanup.
