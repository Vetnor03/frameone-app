# R4 follow-up — measured dual calendars in editorial Date, safe fallback

**Separate stacked draft:** #1455 over #1454. This is still default-OFF
`REMIND_DATE_EDITORIAL_PREVIEW_ENABLED`, not standard firmware.

The existing spacious legacy Date draws **current and next months**. Previous
editorial preview rejected spacious shapes to avoid silently omitting next
month. This change adds `DateEditorialDualCalendar.h` and
`app/lib/dateDualCalendar.mjs`: one height-based two-calendar reservation
inside the *already measured* right-hand calendar column. The current
calendar is slightly taller (56% of available height); next is smaller
but must still contain complete title, weekday heading and all 4–6
calendar rows. No 4×4-specific appearance templates.

The experimental Date painter now:
1. Uses actual F2 original Fraunces/DM Sans glyph ink for four editorial
   facts, and the already-tested shared editorial two-column composition.
2. Determines if the **unchanged legacy** adaptive Date would draw two
   months, then demands a valid dual reservation; no one-calendar
   substitution for expanded shapes.
3. Checks **both** months' `DateMonthGridPlan` dimensions and each day's,
   week number's, weekday's and title's **actual FreeSans ink** before
   drawing anything. If any data/area/label does not fit, returns
   directly to untouched legacy Date.
4. Shows the next calendar's actual title, *including its year* at a
   December→January rollover (e.g., January 2027). The original
   `drawMonthCalendar` has a new optional default-false
   `titleWithYear` parameter; all legacy calls remain unchanged.
5. Preserves current-day ring on the primary calendar, optional art on
   the separate hero, actual day numbers, week numbers and dots.

**Holidays are deliberately NOT silently dropped.** This intermediate
PR still rejects *any* configured holiday, returning directly to legacy,
until full original-text holiday lines can be preflighted in the editorial
composition. No custom user grid is disabled by this new planner.

Verification: C++11/JS paired native tests for 100 legal positions
× five factual scenarios × both theme labels, including year rollover and
9999 December safe fallback; focused original full 4×4 example; standard
and opt-in PlatformIO/Arduino builds. These tests do not demonstrate
legible real e-paper bitmap output or 1–2 m viewing distance. True
mixed-module and physical comparison against the original 4×4 PDF is
still required. This first two-month layout may need further aesthetic
refinement.

**No production merge, no Surf changes, no OTA, no physical flash.
FLASH: NEI.**
