# R3/R4 bridge — restore editorial Date (candidate, not live rendering)

**Design authority:** user-supplied `RE-MIND-layout-review-100 (2).pdf`, **page 1 of 100**, seed **347015390**: the single-module 4×4 Date is a composed 2-column print, NOT merely a centered day number. The year, heading, large serif day, weekday, fine decorative separator, quiet botanical sprig and **complete current monthly calendar** are integral to that reference.

## This draft implements a real composition candidate

- New pure JS `app/lib/dateEditorialComposition.mjs` attempts the **whole** date+calendar ensemble with original F1 GFX ink measurements, 800×480 physical screen and 680×436 actual matte intersection. Facts are peers: it reserves usable calendar space **together with** text, not from arbitrary leftover rectangles.
- Candidate left/right divisions are content-measured and scored on whitespace/balance. No named cell shape/colSpan/rowSpan branch or sample-specific coordinates. The same expression can be selected for **any** geometry where all content meets the functional and readability requirements.
- The year, month, day and weekday each retain complete original strings and original Fraunces/DM Sans variants. A month title/DOW-capable functional calendar is required before admission. Decorative month rule and optional botanical region are allowed only when the facts and calendar fit. Insufficient space produces `null` for the existing compact/full legacy fallback.
- **Safety limit:** any upcoming holiday rows fail closed until full holiday placement is supported. No missing holiday information, and no misleading partial new module output.

## First visual comparison

The separate offline 116-sample original F1 bitmap gallery (PR #1449) is extended with this editorial candidate. The fonts and calendar use actual source GFX bitmaps. The hairline ornament and hand-drawn botanical sprig in `frame/tools/date_editorial_svg.py` are **SVG visual concepts only** — they do NOT exist as ESP32 e-paper glyphs yet.

**Must not claim:** a physical screenshot, final layout, approved flower, C++ rendering parity, light/dark waveform, 1–2m legibility, or finished functional holiday representation. Calendar is currently a *legacy painter simulation*. Feedback on visual comparisons will govern the R4 bitmap/stroke art rendering and F2 C++ native parity work.

Everything remains **DRAFT, unmerged**. The active Date and all four Surf paths are untouched; preview flag OFF by default; no firmware, config, pairing, backend, MQTT, Supabase, OTA or physical device changes. Known-good original ALFRED V4 v2.7.3 rollback binary + SHA still unverified. **FLASH: NEI.**
