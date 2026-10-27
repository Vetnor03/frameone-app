# R3: original font-screen 6 GFX metrics as JS geometry input

This is a **source-derived measurement-only adapter**, not a new renderer. The original bitmap glyphs **remain in F1 PR #1432**. Here we snapshot only integer dimensions and signed bearings from exact `RemindEditorialFonts.cpp` Git blob **`ce233c113d28bf9be01bbfdfb6d9ad9cac488495`**, reusing all 224 Latin-1 positions for each of Fraunces72/48 and DM24/18. No glyph bitmaps or substitutes are added. `shared/generate_date_gfx_metrics.py --check` guards deterministic ESM output.

`measureDateGfxInk(text,font)` reproduces F2's real GFX ink bounds semantics (glyph xAdvance vs xOffset, signed bearings; visible min/max union) for supported Latin-1. Normalizes NFC; invalid/unrenderable characters **fail closed**. The underlying F1 font build and F2 normalization also handle other Unicode cases; the simple JS adapter does not claim complete normalization equivalence.

`planDateWithRealGfx(cell,facts)` computes actual ink sizes for each real font variant and calls the independent role-based geometry planner from #1442. It tries Fraunces72 before 48 for the essential day, then full DM24/18 month/weekday labels, returns **one whole 3-fact plan** or `null` (legacy fallback). It does not select based on a grid ID or crop/truncate facts. Same geometry can select different modes depending on measured strings. A future priority stage can preserve a hero-only or two-fact safe fallback when the full three facts do not fit.

Scope note: This branch is stacked on #1442, **not directly on F1/F2**; the immutable F1 measurements are for JS/CI only. When integrating the C++ renderer, use **F2 `EditorialText::measureLine` and the original F1 glyph pointers directly** (avoid duplicating these measurements on ESP32).

**No production app import, firmware flag, renderer changes, Surf changes, physical flashing, or artwork.** Next: native real-F1/F2 parity verification, full content-priority/year/calendar/holiday preservation, then opt-in renderer QA and actual physical rollback.

**FLASH: NEI.**
