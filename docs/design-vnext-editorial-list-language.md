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
3. **Refined mark.** Where native cell width permits, a tiny four-point
   **lozenge/diamond dot** marks the beginning of each complete item. It uses
   1-bit ink pixels, so it works identically in Light and Dark, without
   photographs, illustration scaling or new font dependencies.
4. **Adaptive restraint.** Reserve the actual measured width of a marker;
   if space is constrained, remove the decoration rather than shrink or
   truncate the content. Complete text and true overflow accounting remain
   mandatory.
5. **No data semantics.** Visual markers do not alter sort order, selection,
   "next" prioritization, item count, dates, Skip, source feeds or APIs.

## Implementation status

- **News R2:** under isolated digital QA in [draft PR #1516](https://github.com/Vetnor03/frameone-app/pull/1516), in
  `frame/src/modules/NewsEditorialPreview.h`. Native C++ bitmaps,
  exact 16×2 Light/Dark QA and actual 1-bit marker bounds/pixel checks.
  Not production-approved, not flashed.
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
