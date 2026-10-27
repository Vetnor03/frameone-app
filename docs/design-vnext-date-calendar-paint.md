# Date vNext R3 — gated calendar + holiday paint preflight (27 October 2026)

Stacked on draft #1447. No merging, no Vercel release, no OTA and no device flash.

**What is actually implemented in the test-only renderer**:
- The exact original screen-6 Fraunces + DM Sans three-fact role-first Date plan remains the entry point. One common F2-measured geometry path, no new renderer for a named grid span.
- `DateContextReservations` selects actual matte-clipped candidate areas for current/next calendar, year, and up to two ordered holiday rows. The Date module now supplies **real local year, month, today**, and actual config-backed holiday entries, plus original F2-measured glyph ink.
- The new pure C++11 `DateMonthGridPlan.h` validates Gregorian month length, first weekday, year rollover, 4–6 calendar rows, true 7-column cell dimensions, legacy six-row minimum, block bounds and matte clipping. It has no `mktime`, heap, display or module dependency.
- Before any e-paper pixels, `gridFontFits` additionally checks real existing **FreeSans 9 / Bold 12** ink against actual day/weekday/week-number/month-title cell dimensions. A calendar that cannot be fully drawn is rejected to the unchanged old Date renderer.
- Only after **complete** F2 hero, optional year, actual calendar(s) and all required upcoming holiday labels have passed their plan + text constraints does the opt-in branch paint. It reuses the **unchanged** `drawMonthCalendar(..., hardBounds=true)`: today highlight, holiday dots, month titles, week numbers, and legacy local-time semantics remain inside the original routine. Holiday rows use real `RemindEditorialFonts::dm18()` ink and chronological selection. Any unsupported/long label or insufficient space triggers a pre-draw legacy fallback; no chopped factual strings.
- Safety: eligible only for `CELL_ADAPTIVE`, and calendar-capable shapes must actually reserve a calendar. Expanded legacy shapes must still reserve next month. Registered holidays must be completely preflighted, not silently dropped. The existing default flag `REMIND_DATE_ROLE_PREVIEW_ENABLED=0` remains OFF. All other Date sizes use legacy output unchanged.

**Important limits:**
This uses the legacy calendar painter (real rendering calls in experimental branch), **not yet an independently redesigned full F2 grid renderer**. Python date arithmetic and native C++ preflight tests plus compile checks validate bounds/rows, not actual e-paper raster pixels or 1–2 metre visual quality. The original calendar's typography and theme rendering still need pixel QA; F1/F2 duplication in the stacked drafts and source branch merge strategy still need review. Existing fallback guard on unavailable area is intentionally conservative; neither UI style nor eligibility is fixed to a named 1×1/2×1/4×4 template.

No Surf changes. No standard firmware change. ALFRED V4 v2.7.3 original rollback binary + SHA is still unverified.

**FLASH: NEI.**

**Additional factual guard:** A second calendar may only be painted if its independently measured month title is visible. An unlabeled next-month grid falls back to legacy instead of silently removing the month identity.
