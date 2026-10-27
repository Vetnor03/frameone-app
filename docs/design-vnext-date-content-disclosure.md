# R3: Date content disclosure and conditional reservations (draft)

Stack: #1440 architecture → #1441 policy → #1442 measured JS/C++ geometry → #1443 original F1 glyph metrics → this PR.

**Implemented, inactive:** `app/lib/dateContentPlanner.mjs` uses original F1 Fraunces + DM Sans ink metrics and the measured Date group as the authority. It prefers a complete day/month/weekday group; if that cannot fit, tries measured day+month, then day+weekday, then day alone. Every glyph rectangle is premeasured, no factual string is cropped. If the day itself cannot fit, `null` requests existing legacy fallback.

Four **disjoint free rectangles** are derived from the actual measured group inside the matte viewport. Current calendar may reserve a region only for valid month/year and the existing Studio calendar minimum; optional year follows. A second calendar requires both the first and real next-month data. Zero to two chronological holiday rows must fit as complete DM Sans18 ink. All reservations are separate from the essential day. Art is **always null** until R4 after typography/calendar QA.

**Caveats:** A calendar reservation is NOT working calendar rendering. Existing `drawMonthCalendar`, holiday logic and actual display `ModuleDate` have not been connected or modified. The visual grammar and numeric thresholds are experiments, not signed-off layouts. No data/API changes; no fixed per-cell-size design. Test exercises 100 legal grid size/positions × four factual cases × two theme labels = 800 geometry inputs, preserving no-overlap, fallback and conditional availability. Theme labels do not constitute pixel/theme QA.

**Surf remains source-frozen.** No app runtime, firmware, OTA, merge, painting, or physical test. ALFRED V4 v2.7.3 known-good binary and hash are still unverified. Next: actual F2/C++ measurement adapter and guarded full Date rendering with untouched calendar/holiday fallback, followed by a safe physical comparison.

**FLASH: NEI.**
