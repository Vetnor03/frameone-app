# Date vNext R4 — first 4×4 visual finding: week-row rhythm

**Reference:** `RE-MIND-layout-review-100 (2).pdf` page 1, seed **347015390**. This is the original single-calendar, two-column editorial Date with spacious botanical and generous whitespace. The full 800×480 simulation must be reviewed at the real matte (58,39,680,436); it is NOT physical e-paper evidence.

## Reproduced failure in draft #1458

The October 2026 + November 2026 gallery shows **overlapping November numbers**. October has **5** Gregorian rows; November has **6**. The previous `56% / 44%` calendar split gave October roughly 29px row pitch and November roughly **16px**, while both use identical original FreeSans9 glyph pixels. Labels collided despite geometry tests passing. In the gallery, all seven cases were *simulator-only*; native firmware still has extra strict guards that may reject a visually simulated candidate.

## Isolated correction (stacked, default OFF)

- Allocate each calendar from **actual Gregorian month row count** (4–6), never grid-size templates or a fixed 56/44 height split.
- Reserve 66px/calendar for 8px top+bottom padding, 22px title, 10px title gap, 18px weekday heading, exactly as existing C++ `drawMonthCalendar` / `DateMonthGridPlan` do.
- Current month: minimum **26px per week row**, protecting the physical Date painter's >=11px outlined today-ring radius. Following month: at least **21px per week row** to separate original FreeSans9 pixel bounds. Further actual glyph fitting still runs in native `gridFontFits`.
- The 8px inter-calendar gutter is in addition to both calendars' 8px internal vertical paddings. Outer margins 4px; any spare height is shared by actual row counts.
- If two complete calendars cannot meet these constraints, reject the *experimental* two-calendar plan **before painting anything** and use unchanged legacy Date. Do not hide or drop either month, holidays or other facts.
- Oct→Nov 2026 therefore reserves **more height for the six-row November** than for five-row October. December 2026→January 2027 keeps year rollover title.
- This is an interim density fix, **not final artistic approval**. Original PDF is still visually cleaner; week-number display, text contrast, ornamental details, other themes and mixed modules need independent review.

## Evidence and remaining gates

`frame/tests/test_date_dual_calendar.py` now asserts row-count-derived minimum pitch on **all admitted 100-placement × scenario × theme samples**, in addition to C++/JS geometry parity. The new offline gallery on this branch must be inspected for visible collisions. Existing C++ strict glyph preflight, actual native framebuffer pixels, physical 1–2 m test, rollback BIN+SHA, Light/Dark and mixed-module integration are **not** proven by this fix.

**No Surf/standard firmware/App/MQTT/Supabase changes. No production merge, deploy or flash. FLASH: NEI.**
