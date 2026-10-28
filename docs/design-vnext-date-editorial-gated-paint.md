# R4: Date editorial drawing path, compile-time OFF

This draft connects #1452's native all-facts editorial geometry and #1453's original Fraunces/DM Sans F2 glyph baseline preflight to an experimental `ModuleDate.cpp` painter behind a **second default-OFF flag** `REMIND_DATE_EDITORIAL_PREVIEW_ENABLED`.

## Exact conditions before *any* pixels
1. Only `CELL_ADAPTIVE`. Date/weekday/month source values come from the unchanged frame clock and existing Date module.
2. **Functional preservation gate:** existing expanded adaptive Date displays **current + next months**; the new ensemble currently holds only **current**, so expanded pixel areas (w≥700/h≥330 or w≥520/h≥400) are *not admitted*, and legacy Date renders both. This temporarily excludes a typical 4×4, despite the new 4×4 plan's excellent visual score. This is deliberate rather than dropping next month.
3. Any configured holiday means legacy: the new candidate currently cannot fit the complete holiday list; dots and rows must not disappear. A subsequent slice can add a factual holiday ledger to the editorial layout.
4. Complete F2 native original font preflight succeeds for year, month, day, weekday; one whole calendar is allocated and `DateMonthGridPlan`/legacy FreeSans 9/Bold 12 ink preflight confirms the complete grid and a sufficiently large today ring. On failure, fall through before touching the display.
5. Only then draw four exact glyph lines at measured cursor/baselines, restrained month rule, an *original deterministic 1-bit stroke botanical study* inside the optional botanical box, and **existing `drawMonthCalendar`** to preserve day number/weekday/week number/holiday dot logic. An explicit black ink circle is placed around today after legacy calendar draw to make it visible.

## QA boundaries

The artwork is a **first experimental e-paper stroke treatment**, not the final approved botanical reference or a hidden assumption. Exact GxEPD2 buffer comparison, mixed-module/Light-Dark and 1–2m viewing tests remain open. This opt-in environment is **compiled by CI only** (`alfred_v1_2_date_editorial_preview`); it inherits `REMIND_DATE_ROLE_PREVIEW_ENABLED` for the shared measured FreeSans calendar preflight, but standard Alfred and the separate older preview targets remain unaffected.

This is **not production, not OTA, not a user-approved flash package**. Reconcile F1/F2 branches before merging any stage. Original ALFRED V4 v2.7.3 rollback binary and SHA remain unverified. No Surf changes.

**FLASH: NEI.**
