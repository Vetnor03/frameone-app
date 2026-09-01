# Update-state telemetry repair

The revision read routes do not depend on these fields. If migration deployment
is delayed, run the following idempotent SQL manually in production Supabase:

```sql
alter table public.device_update_state
  add column if not exists last_probe_at timestamptz,
  add column if not exists app_active_until timestamptz;
```

This only repairs optional telemetry columns. It does not recreate the table or
modify `requested_revision` or `displayed_revision`.

## Physical-settings write audit

- `app/api/device/save-settings/route.ts` is the post-setup commit endpoint and
  is called only by the explicit Update flow.
- `commitInitialFrameSetup` in `HomePageClient.tsx` is the named onboarding-only
  exception used for an empty settings row and first-frame setup.
- Custom-layout activation and deletion, module assignment/configuration,
  layout, theme, font and pinned-module changes remain local dirty draft edits.
- Assistant capability handlers are an explicit non-editor command surface;
  their existing user-confirmed configuration actions are unchanged by this
  focused editor hotfix. Domain-data handlers (groceries, reminders,
  countdowns and surf logs) are likewise unchanged.
- Firmware config/meta/grocery/stock routes only read `device_settings`; frame
  deletion intentionally deletes it. No settings-save path publishes a display
  revision. The sole normal publisher is explicit Update through
  `/api/device/update-state/request`.
