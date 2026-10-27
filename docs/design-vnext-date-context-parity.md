# R3 Date calendar/year/holidays context reservation parity (27 October 2026)

**Stack:** #1440 → #1441 → #1442 → #1443 → #1444 → #1445 → #1446 → this draft. No merge, flashing, or production activation.

## Scope
`frame/src/display/DateContextReservations.h` is a pure C++11 **geometry-only** planner that consumes an already-measured Date hero bounding group, its true matte-visible rectangle, valid calendar availability, F2-measured year size and up to two complete chronological holiday ink dimensions. It reserves non-overlapping free zones for **current calendar → year → next calendar → holidays**, matching the existing JS content disclosure planner. It exposes the same show-day-of-week, show-week-number and show-month-title eligibility flags based on usable reserved calendar size. Next month requires a current calendar. If any reservation cannot fully fit, it is omitted without cropping the hero.

The JS counterpart is the existing `app/lib/dateContentPlanner.mjs`. Admission thresholds, padding, maximum rectangle dimensions, maximum holiday lines and calendar feature minima are moved into the **same source** `shared/date-element-policy.json`, with generated JS + C++ tokens checked for freshness. No grid ID, shape-based visual template or hardcoded month/year sample data controls placement. One deliberate repair: use the **ASCII ` - `** holiday separator rather than ` · `, which the actual F2 UTF-8 normalizer would silently discard. This change is limited to an inactive planner and its tests; the old Date renderer is unaffected.

## Verification and caveats
`frame/tests/test_date_context_reservations.py` compiles C++11 and compares reservations with Node JS across **all 100 legal cells/positions × eight data presets × light/dark labels = 1,600 cases**. It asserts calendar-feature parity, fitted holiday/year ink, absence of overlap with Date facts, matte containment, no invented calendar data and no activity when Date is missing. The tests use original-F1 measured ink sizes in JS as inputs, not browser font estimates.

**This is NOT evidence of a working newly-drawn calendar.** The native reservations only plan rectangles, without drawing calendar grid lines, holiday dots, month rollovers or actual text. The JS Date planner still owns data selection; the existing C++ Date renderer still owns calendar/holiday display and is unchanged here. Direct end-to-end C++ factual selection and raster tests remain necessary. The numerical thresholds are experimental and must not be treated as approved final aesthetics.

The existing #1446 preview is still default-OFF and conservative about calendars/holidays. The old Date code, Surf files, other modules, firmware default behavior, backend and OTA remain intact. Known-good ALFRED V4 v2.7.3 rollback binary SHA is not yet verified.

**FLASH: NEI.**
