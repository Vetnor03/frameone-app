# R4: complete upcoming holidays in the editorial Date painter (draft)

**Stack:** #1455 two current/next month reservations → this PR.
The existing standard Date and Surf remain untouched in normal firmware;
all this code is behind the editorial test-only flag
`REMIND_DATE_EDITORIAL_PREVIEW_ENABLED=0` by default.

## Functional priority is intact

- The full year/month/day/weekday typography and both required calendars are
  still fully planned and measured before any physical pixel.
- Configured holidays are selected from actual `g_cfg->date.holidays`, by
  ascending `holidayYMD` and with duplicate dates suppressed, matching the
  existing legacy maximum of two upcoming entries.
- If there are no upcoming entries, the original optional botanical remains.
  If one or two actual upcoming entries exist, the botanical is replaced with
  a complete **UPCOMING HOLIDAYS** title and 1–2 dated labels, all using the
  original F1/F2 DM Sans18 measured glyphs and baselines. The full
  botanical *region* is repurposed for information; it never overlaps
  the essential day or calendar.
- `DateEditorialHolidays::plan` is a pure C++11 geometry calculator with a
  paired JS candidate; it demands the entire header, all requested rows and
  true hero/weekday/matte containment. Text is never cut, ellipsized or
  normalized by silently dropping unsupported glyphs. If any label is too
  long or a space is insufficient, the experiment returns directly to
  original legacy Date **before painting**.
- The original `drawMonthCalendar` still draws its own holiday dots from
  actual configured data in both current and next month. It remains fully
  responsible for date grid number and marker semantics.
- Data takes priority over decoration. No 4×4-specific appearance or
  requirement to always show art.

## Evidence/gates

`frame/tests/test_date_editorial_holidays.py` compares measured real F1
DM18 text rectangles and native C++ geometry for all **100 legal grid
positions × six holiday fixtures × Light/Dark = 1200 combinations**. Checks
full strings, both-row admission, no overlap, matte fit and conservative
fallback for long/unsupported text. The CI firmware job independently
compiles normal Alfred, old role-only preview and separate
`alfred_v1_2_date_editorial_preview`.

Still not approved: actual GxEPD2 image capture, 1–2m physical readability,
full mixed-module layout screenshot, approved botanical artwork, pilot/CE
integration and original v2.7.3 rollback binary with hash. CI success alone
is not design acceptance. All stacked PRs remain drafts.

**FLASH: NEI.**
