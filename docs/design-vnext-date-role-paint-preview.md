# R3: off-by-default Date drawing preview (27 Oct 2026)

**Stacked draft:** #1440 → #1441 → #1442 → #1443 → #1444 → [native F2 #1445](https://github.com/Vetnor03/frameone-app/pull/1445) → this PR.

## Exactly what is connected
The previously isolated `DateF2InkAdapter` now has one **compile-time-only** consumer in `ModuleDate.cpp`:

- `REMIND_DATE_ROLE_PREVIEW_ENABLED` defaults to `0`; normal Alfred `alfred_v1_2` build and Arduino IDE remain unchanged. The only enabled profile is `alfred_v1_2_date_role_preview`, compiled separately in CI. This profile is **not** an OTA or approved flash target.
- For an eligible `CELL_ADAPTIVE` region, the single role-first engine premeasures **all three** complete Date facts in original Fraunces/DM Sans via F2, derives a safe matte-clipped full layout, then draws the already-measured text only after a whole candidate succeeds. One code path for all eligible cell geometries, never a `colSpan`/`rowSpan`-specific design.
- **Conservative functional fallback:** No preview for any cell whose physical dimensions are large enough to potentially contain a legacy functional calendar (width ≥330 and height ≥210), or when there are any configured holidays. If preflight fails, the original renderer runs unchanged. These are *fallback protection thresholds*, not a new visual template.
- The standard Date renderers, their calendar/today markers/week numbers, holiday behavior, nonadaptive sizes, all other modules and Surf are still present, unchanged and used in every fallback case.

## Not production-ready
This first proof draws day/month/weekday only when the guard allows; it does not draw a calendar, holiday list or optional year. The purpose of the flag is **layout/ink prototype validation only**. More granular functionality-preserving calendar/holiday admission must follow, based on accurate font/functional grid rectangles, rather than making the legacy guard permanent. The three-grammar layout score is not owner-approved visual styling. Native tests and CI builds do not prove visual quality on e-paper or from 1–2 metres.

No merge, OTA, device flashing, Vercel deploy, Supabase updates or Surf changes. Known-good ALFRED V4 v2.7.3 original rollback binary/hash still missing.

**FLASH: NEI.**
