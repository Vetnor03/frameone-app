# Final Layout Lab 100-PDF rule audit — Date editorial candidate (2026-10-28)

**Status:** source/PDF-informed acceptance audit, **NOT production or physical approval**.
**Scope:** stacked draft #1451 over #1450; compare original Layout Lab, not a synthetic green CI screenshot. No current/legacy Date, other module, Surf, backend or firmware deployment is changed here.

## Evidence and reference hierarchy

1. **Original source examples**: `RE-MIND-layout-review-100 (2).pdf` (100 pages), especially **p1 / seed 347015390 / single-module 4×4 Date**. Supporting mixed-module and custom-size examples on p2–4, p15, p31, p38, p71, p80 and p94. The other original 100-page PDF batch includes mixed cases and varying aspect ratios. A PDF image is design evidence, **not a firmware framebuffer**.
2. **Human-approved design contract**: #1429 (locked decisions), #1430/phase-0, #1435 (all Date sizes), role-first contract in `docs/design-vnext-element-role-contract.md`. Physical font screen **6** chose Fraunces + DM Sans.
3. **Code evidence**: #1440→#1450 policy, F1 bitmap glyphs + F2 native metrics, JS/C++ parity, conditional calendar and default-OFF native experiments, and #1449 original-bitmap HTML gallery.
4. **CI evidence**: audit regression tests `frame/tests/test_date_100pdf_rule_audit.py`, existing cross-language/calendar tests, and original-gallery generator. CI success means **logic/build passes only**.

## Invariants matrix (one rule per measurable acceptance)

| Rule from reviews | Status after audit | Evidence / remaining gate |
| --- | --- | --- |
| Rich, composed 4×4 Date; no giant lonely day | **Candidate PASS, unapproved visually** | Original p1 2-column year/month/day/weekday/botanical/calendar reproduced as one **joint** layout candidate and test fixture. User likes current direction. Pixel-perfect comparison still pending. |
| Adaptive layout, all 16 shapes, 100 legal placements; no prohibited drawn layouts | **Geometry PASS** | Existing 116 original-GFX gallery + 100-placement role tests; this audit adds 100×normal/long/Norwegian/invalid/holiday×theme regression. Empty/too small uses safe fallback, never disables a grid shape. |
| Grid cell is a constraint, not a fixed named visual template | **PASS in candidate** | Candidate divisions scored from actual safe area/ink. No `colSpan`/`rowSpan` branching or special 4×4 renderer. Actual firmware editorial C++ parity **PENDING**. |
| Approved font screen 6: real Fraunces + DM Sans | **Source PASS; physical PENDING** | Original F1 GFX and F2 measured ink; no CSS substitute in gallery. F1/F2 original asset merge/physical QA pending. |
| Content priority HERO → important → optional → decorative | **Improved; runtime PENDING** | Date + current readable calendar are jointly reserved. Revision prefers larger factual glyphs over ornament and offers non-art variants; complete hero/current functional data wins. Full optional-year/holiday family still needs C++ parity. |
| Art and rule OPTIONAL and subordinate to facts | **Corrected in candidate; R4 pending** | Previous planner demanded an 82px botanical even when data/calendar fit without it. Now tries full ornament, reduced ornament, and no ornament; original 4×4 can retain art, constrained layouts need not. R4 needs 2–3 curated 1-bit motifs. |
| Avoid hardcoded per-size art; deterministic, crisp, no noisy scaling | **Partial / visual concept only** | New visual sprig is fixed SVG QA concept, not hardware asset. Deterministic; true 1-bit R4 design, Light/Dark, motif selection still open. |
| 18pt primaries, 12pt secondary from 1–2m; 9pt only low priority | **Unverified physically** | Fraunces 72/48 bitmap and DM24/18 used as role candidates; direct pt/pixel equivalence **not assumed**. Critical font size/reach checks and calendar 9pt legibility pending physical. |
| Never truncate day/month/weekday, including ÆØÅæøå | **Geometry PASS; full locale QA pending** | Real GFX measurement accepts Latin-1 characters, complete strings or fallback. Actual alternative language month/date labels, punctuation/dot/spacing and unsupported glyph behavior need end-to-end native QA. |
| Correct Gregorian month, leap dates, month/year rollover | **Improved** | Candidate now rejects e.g. 31 April or 29 Feb 2025 while retaining 29 Feb 2024; native `DateMonthGridPlan` separately verifies 4–6 weeks, weekday and year transitions. Actual DST/local-time source correctness unchanged and unverified here. |
| Functional current calendar: useful cells, today ring, optional week header/number, holiday dots | **Partial** | Existing native preview reuses unchanged legacy calendar painter behind default-OFF flag; gallery is a simulation. Real 1-bit bitmap/framebuffer parity unverified. |
| Next calendar and incoming holiday context must not disappear | **SAFE fallback; not editorial-complete** | Editorial candidate refuses nonempty holiday lists, rather than silently replacing useful information; next-month and holiday editorial admission are pending. Legacy handles functionality in normal firmware. |
| No overlap, overflow behind matte or adjacent modules | **Geometry PASS; raster pending** | Physical 800×480 and visible x58,y39,w680,h436 in tests. F2 ink boxes, decorative zones, calendar region all constrained; physical raster proof and divider consistency pending. |
| Manual custom 4×4 merge/repeat/empty allowed | **Source coverage PASS; full integration pending** | Shapes/placements validated without bans; editable user layouts and repeated/empty instances in live simulator/firmware not directly tested in this Date-only candidate. |
| Same design policy in Lab, Mirror and physical frame | **NOT YET** | Current JS candidate is not imported by active Date or mirrored by final C++ renderer. Existing native proof uses older measured layout; do not claim pixel parity. |
| Do not alter Surf, other modules, OTA, MQTT, pairing, backend | **Source/diff PASS** | New PR changes only isolated Date JS, its offline visual renderer/test fixtures and documentation. Verify unchanged hashes across all four Surf paths and no production paths in diff before merge. |
| Date designs must coexist with Weather/News/Reminders/Groceries in mixed grid | **PENDING** | Original p2–4/p38/p71/p94 show mixed compositions. #1449/1450 HTML report simulates **Date only**, not adjacent real-module pixels or shared borders. Separate mixed-module gallery/physical smoke needed. |
| Light/Dark contrast and real e-paper 1-bit/gray behavior | **NOT YET** | Current dark-gallery option uses SVG inversion, not actual e-paper LUT/theme rendering. Need dual-theme physical or native framebuffer comparisons. |
| Retain today/holiday priorities, TZ/DST and after-20 behavior | **NOT REGRESSED BY PATCH** | Experimental Date does not mutate backend/clock/data or standard Date runtime. End-to-end semantics require dedicated smoke tests before default enable. |
| CE/pilot stability, known-good rollback before flash | **BLOCKED** | Original ALFRED V4 v2.7.3 binary + cryptographic hash not verified. No merge, OTA, flash or pilot activation. **FLASH: NEI**. |

## Material corrections in this audit slice

1. **Optional art / no-art fallback**: the old formulation made art fit a precondition of the entire editorial layout even while calling it optional. This is now corrected by evaluating distinct complete candidate compositions. Ornament never claims area when absent.
2. **Real font fallback**: candidate loops try Fraunces72→48 and DM24→18 variants measured from original F1; the score gives essential/important legibility preference **before** extra decorative artwork. No hardcoded text-specific dimensions.
3. **Impossible Gregorian dates**: reject dates beyond actual month length, including non-leap Feb 29.
4. **Artwork review rendering**: gallery SVG accepts nullable rule/art; passing HTML QA does not mean a drawable 1-bit firmware illustration.
5. **Fixture accuracy**: fix a known old synthetic 2026 May 1 `Sunday` label (actual **Friday**); preserve original PDF 21 October 2026 **Wednesday** seed unchanged.

## Outstanding blockers (do not mark complete)

The candidate needs owner-facing 4×4 side-by-side PDF/HTML comparison; alternative text and calendar-density style tuning; full current/next calendar + holidays as one C++ role-first composition; 2–3 high-quality botanical 1-bit drawings with deterministic placement; real GxEPD2 raster/Mirror parity (not an SVG mock); Light/Dark and 1–2m viewing tests; source stack clean merge, stable OTA, and known-good v2.7.3 rollback binary hash. All other modules may be reviewed later but **Surf remains frozen**.

**No runtime enable, no production merge and FLASH: NEI.**
