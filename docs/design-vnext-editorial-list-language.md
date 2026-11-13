# RE:MIND Design vNext — Editorial List Language (proposed R2)

Design intent approved for exploration on 13 November 2026:
**individual items should be unmistakably distinct, without sacrificing
the elegance of Fraunces + DM Sans or room-distance readability.**

This is a reusable **visual rule**, not a backend or data-flow feature.

## Principles

1. **Meaning first.** Text (News headline, shopping-list item, or reminder)
   must remain the primary information and legible at 1–2 metres.
2. **Beautiful rhythm.** Give successive items consistent separation, with
   intentional whitespace. Avoid visually crowded rows and dominant module
   labels, rules or table-like borders.
3. **Refined mark.** When **two or more items are actually visible**,
   and native cell width permits, a tiny four-point **lozenge/diamond dot**
   marks the beginning of each complete item. A single visible item uses
   **no marker**, even when the source contains more items (`+N more`);
   reclaim its reserved marker lane for headline readability. It uses 1-bit
   ink pixels, so it works identically in Light and Dark, without
   photographs, illustration scaling or new font dependencies.
4. **Adaptive restraint.** Reserve the actual measured width of a marker;
   if space is constrained, remove the decoration rather than shrink or
   truncate the content. Complete text and true overflow accounting remain
   mandatory.
5. **No data semantics.** Visual markers do not alter sort order, selection,
   "next" prioritization, item count, dates, Skip, source feeds or APIs.

## Implementation status

- **News R2.3:** visually approved after physical V4 testing and integrated
  into the production source using a clean, gated PR. Original fonts,
  headline ordering and backend are untouched. The rule checks the
  **actually displayed headline count**: zero/one item has no dot;
  two or more items have the refined diamond if space permits. OTA/USB
  deployment requires separate authorization.
- **Reminders:** already physically approved and **locked**, so no
  retroactive marker or spacing changes.
- **Groceries/handleliste and future free-text bullet lists:** use this
  note as a *design reference* when their individual module redesigns
  begin; do not modify their existing behavior now.

For each future list module, inspect its current source and return to
visual review before implementing shared graphics. This document does not
authorize new data handling or universal rendering changes.

Only visual changes to News are implemented here. Locked Date, Weather,
Surf, Reminders and shared display framework remain untouched.
