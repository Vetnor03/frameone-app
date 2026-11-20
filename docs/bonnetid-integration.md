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
- `GET hijri_month`: official Norwegian, English and Arabic labels for each of the 12 Hijri month starts.
- `GET hijri_yearly_events`: eight recurring Islamic occasions, provided as Hijri month/day + `no`, `en`, `ar` names.
- `GET hijri_date_mapping`: confirmed first Gregorian day of each Hijri month (month/year and Gregorian day). Fetch roughly 40 days before the horizon to 40 days after the 366-day horizon, always requiring the next consecutive 29/30-day month boundary before publishing dates. No independent conversion or estimated holiday dates.
- The provider also documents `hijri_dates`, `mosque_t`, `mosque_jamatperiode`, and `mosque_jummah`. Mosque-level congregation times are **not yet imported**.

The source returns Norway-local clock times. We convert them to UTC instants with `Europe/Oslo` (DST-aware) before storing.

## Sync and display

User connects by selecting a municipality (no technical method selection). The backend fetches and verifies the ten-day prayer schedule before marking the integration connected, and refreshes at most every 12 hours per connected account. A stale refresh re-reads IRN's location settings in case its prayer method changes.

Prayers go to `integration_items`, not personal `reminders`, so the user's 20-reminder limit is unaffected. Prayer events are displayed only until their exact due minute and remain eligible for physical frame hard-wake boundaries. All IRN items share the existing IRN filter; no second filtering namespace.

A successful refresh upserts official prayer items and deletes only previous `raw.type = 'prayer_time'` items that were not returned. The calendar import independently upserts upcoming month beginnings and yearly events as `raw.type = 'holiday'` all-day items, tagged with `event_origin = 'irn_calendar'`, with localized `title_no`, `title_en` and `title_ar`. Only such tagged prior items may be cleaned up upon a **successful** calendar fetch. Calendar failures do not interrupt prayer times, and previous verified calendar records are retained. Both types appear under the **same IRN filter** and on the frame. Disconnect removes all provider items. In the current app, Norwegian and English labels follow the user's language, while Arabic is preserved for future use.

## Verification checklist

- Preview deployment includes both sensitive variables without showing their values.
- Authenticated Connect → IRN lists Norwegian municipalities and includes Oslo, Bærum etc. Return `NO3201` for Bærum, not numeric city IDs from the legacy Zebra API.
- A selected city connects only if today's five complete official prayers are returned.
- For Bærum on 2026-11-20 using prayer method 3, IRN's sample response has Fajr 06:11, Dhuhr 12:08, Asr 13:46, Maghrib 15:44 and Isha 17:46. Verify against the live response, not hardcoded fallbacks.
- Events render in the existing IRN reminder filter and on frames, and are filtered after their minute boundary.
- On failure, no invented times, no client-side API credentials, and no calendar items fabricated. If month starts stop in the provider's dataset, future holidays are omitted rather than projected.
- Existing old numeric city connections must explicitly reconnect with the new official `NO####` code.

## Calendar implementation verification

The provider samples confirm 12 months and 8 annual occasions. Notably, Islamic New Year, Ramadan start, and Eid ul-Fitr are included in the month table, not the eight-event table. Month beginnings are imported alongside event rows and displayed all-day in IRN Reminders. Event day N is Gregorian mapped month start + (N-1) days, **only** when both boundaries are present, consecutive, and 29/30 days apart. Exact source labels are retained; translations are not rewritten. Test sample 1442: Ramadan begins 2021-04-13; 27 Ramadan is 2021-05-09; Shawwal / Eid ul-Fitr begins 2021-05-13.

Calendar sync adds three upstream requests at most once per account per 12-hour refresh, and does not create any new client-side request or require schema changes. Validate real authorized PostgREST responses in Production after deployment; unit tests cover the user-supplied fixtures but not upstream response availability.
