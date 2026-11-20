# IRN — Norwegian prayer times (official PostgREST API)

The account-level integration keeps provider id `bonnetid` to preserve existing IRN Reminders filters, frame configuration, and user connections. It remains Experimental until the live authenticated endpoint is validated.

## Secret configuration

Configure **both** sensitive server-only Vercel environment variables in Preview / Production:

- `IRN_API_KEY` — exact IRN `apikey` header value
- `IRN_AUTHORIZATION` — complete IRN `Authorization` header value (including `Bearer ` prefix if supplied)

Never use a `NEXT_PUBLIC_` key, commit secrets, reveal secrets in logs/errors, or expose the upstream endpoint to the client. After editing environment variables, deploy again so the new deployment receives them.

## Official upstream

Base: `https://disp-api.bonnetider.eu/rest/v1/`

- `GET location_t?select=location_iso,fylke_name,location_name,prayer_method,asr_method`: Norwegian municipalities with ISO codes such as `NO3201` and their official calculation settings. No favorites or automatic location selection.
- `GET prayertime?select=date,location_iso,prayer_method,fajr,duhr,asr,maghrib,isha&and=(date.gte.YYYY-MM-DD,date.lte.YYYY-MM-DD)&location_iso=eq.NO3201&prayer_method=eq.3`: one server-side request for a rolling ten-day window. Five daily prayer entries only; the chosen city's `prayer_method` comes from IRN. No client-selected Asr multiplier: this endpoint returns the official `asr` field for its method.
- The provider also documents `hijri_dates`, `hijri_month`, `hijri_yearly_events`, `hijri_date_mapping`, `mosque_t`, `mosque_jamatperiode`, and `mosque_jummah`. **Not yet imported**; event title / row structure has not been provided or validated. Never guess religious dates or represent incomplete calendar support as live.

The source returns Norway-local clock times. We convert them to UTC instants with `Europe/Oslo` (DST-aware) before storing.

## Sync and display

User connects by selecting a municipality (no technical method selection). The backend fetches and verifies the ten-day prayer schedule before marking the integration connected, and refreshes at most every 12 hours per connected account. A stale refresh re-reads IRN's location settings in case its prayer method changes.

Prayers go to `integration_items`, not personal `reminders`, so the user's 20-reminder limit is unaffected. Prayer events are displayed only until their exact due minute and remain eligible for physical frame hard-wake boundaries. All IRN items share the existing IRN filter; no second filtering namespace.

A successful refresh upserts official prayer items and deletes only previous `raw.type = 'prayer_time'` items that were not returned. It does not delete official calendar/holiday items, which will be added in a later step. Disconnect removes all provider items.

## Verification checklist

- Preview deployment includes both sensitive variables without showing their values.
- Authenticated Connect → IRN lists Norwegian municipalities and includes Oslo, Bærum etc. Return `NO3201` for Bærum, not numeric city IDs from the legacy Zebra API.
- A selected city connects only if today's five complete official prayers are returned.
- For Bærum on 2026-11-20 using prayer method 3, IRN's sample response has Fajr 06:11, Dhuhr 12:08, Asr 13:46, Maghrib 15:44 and Isha 17:46. Verify against the live response, not hardcoded fallbacks.
- Events render in the existing IRN reminder filter and on frames, and are filtered after their minute boundary.
- On failure, no invented times, no client-side API credentials, and no imported holidays claimed.
- Existing old numeric city connections must explicitly reconnect with the new official `NO####` code.
