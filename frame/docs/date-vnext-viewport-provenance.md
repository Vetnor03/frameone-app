# RE Date R4.13 — viewport provenance and Layout Lab acceptance

**Confirmed by owner (30 October 2026):** Current V4 passepartout opening follows the **outer edge of the display** and the **entire 800×480 panel is available**. Treat full panel as the layout authority. Retain comfortable, content-driven padding *inside each Date cell* for an airy editorial composition; this is intentional whitespace, **not** a fabricated hidden-pixel margin. The historical `58,39,680,436` crop is NOT the current V4 opening.

## What is actually known

- RE's 7.5-inch Waveshare e-paper controller addresses **800×480 source pixels**; four columns × four rows of logical slots (200×120 each). This is a confirmed software/display fact.
- An earlier (July 2026) physical matte calibration used a **different** nominal viewport, roughly **x=9, y=22, w=785, h=458**. On 31 August 2026, PR #1172 moved the shared viewport **from that crop to full 0,0,800,480**. Old per-matte coordinates do not establish the current 3D case, screen alignment or V4 mounting.
- `shared/date-element-policy.json` (created during role-first F3/Lab experiment) contains the much narrower `x=58,y=39,w=680,h=436`. Its original entries called it `matte` and the generated `DateRolePolicy` copied it verbatim. The work in R4.9/R4.10 treated it as physically measured, but **no V4 photo, caliper/pixel calibration or mechanical datum confirmed those values**. This is a provenance error, not evidence that the frame definitely hides these pixels.
- The Date original C++ host galleries show where text *would* be outside a **hypothetical** crop. They never measure an optical opening, contrast at 1–2m, actual e-paper SPI output or screen alignment.

## Implementation — experimental Date only, safe to revert

- The shared candidate policy explicitly distinguishes `panel.matte` (the default **design viewport**, now full 0,0,800,480) from `panel.historicalMatte` (unverified comparison 58,39,680,436). Both JS and C++ generated bindings now use **full panel**. No shape-specific coordinates or changes to the 4×4 grid.
- Existing original measured C++ ink planners and JS counterparts read that generated logical viewport without changing their composition scoring, font source, fallback, calendar reservations, source time/date, original botanical art or the availability of all 16 legal cells. Full-panel **does not mean that content may overlap a neighboring cell**.
- Standalone C++ native Light/Dark layout gallery: **16 shapes × 2 dates/themes = 32 scenes**, including October and December→January, from actual `ModuleDate.cpp` / Fraunces+DM Sans GFX. Every scene saves the whole 800×480 render and a crop of the Date-owned cell. Labels explicitly distinguish experimental editorial admission from **LEGACY fallback**, rather than claiming that all 16 already use new typography.
- For comparison only, the gallery manifest reports foreground pixels that *would* lie outside the historical crop, with `verifiedOnV4=false`. This is **not a failing test**. Real failures remain text outside owned Date cell, 800×480 panel, bad date calculations, lost calendar/holiday functionality, changed News/Surf source or failed native C++/JS measured parity.

## Physical QA remains a separate release check

The **viewport decision is settled by the owner** for current V4: full 800×480 screen, passepartout flush to the outer edge. Independent ruler/photo calibration is not a prerequisite for continuing Layout Lab design. Before release, visually smoke-test real screen alignment and readability from 1–2m, including Light/Dark and actual in-cell whitespace. If a contrary *measured* V4 issue appears later, record photos and measured pixel coordinates before revisiting policy.

**Release/flash remains blocked** on a separately verifiable working rollback firmware BIN + SHA256 and an explicit user decision to conduct a physical test. Do not expand the rollback analyzer or bring this into Date visual PR.

**Layout Lab rules:** one role/ink-driven algorithm; Fraunces hero + DM Sans headings/details; readable 1-bit calendar and ISO week detail; original simple botanical motifs only after factual content fits; no hardcoded shapes, no lost data, Surf source frozen. Continue from #1483 / #1480, master #1429, Date #1435.
