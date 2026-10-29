# RE Design vNext — original GFX/BW mixed-Date scene proof

## Purpose and base

This is a test-only follow-up to draft #1468, using **exact original firmware `ModuleDate.cpp`, pinned original Adafruit_GFX v1.12.6 and GxEPD2_BW v1.6.4**, with a host-only mocked T7 transport. It extends the original-GFX chain from five single-Date cases to **all 11 established 4×4 mixed-layout scenarios**, including default, pyramid, square, repeated Date, 3×4 neighbor, holidays, dark mode, and year rollover.

The input is the **existing scene list** in `generate_date_mixed_layout_review.py` (no new grid-size hardcodes, no changes to Surf). For every Date slot the true C++ editorial gate is independently checked. For admitted slots, `ModuleDate::render` runs in the genuine GFX/BW host chain. Non-Date slots and legacy Date fallback slots are **not painted at all**, explicitly identified as omitted in the manifest and human gallery.

## New independent checks

- Date admission is compared across the existing JS/SVG source planner, the original native Date C++ host gate, and the genuine upstream GFX/BW direct-gate execution. Disagreement is reported and is an error if it occurs between C++ gates.
- Each admitted Date slot is painted individually through the original GFX/BW chain. Independently combine these exact 48k byte streams as black-on-white or white-on-black, then compare every bit to the **single combined page render** of all admitted Dates in that scene.
- A scene fails if Date ink escapes any of its admitted grid cells or the visible 680×436 matte. Output includes per-cell results and original renderer vs earlier host pixel deltas, if any.
- CI uploads an 11-scene **Date-only** 800×480 HTML/PNG gallery, per-scene raw one-page 48,000-byte buffers, their SHA-256 hashes and a JSON report.
- No tests falsely claim that an ignored legacy Date slot, Surf, Weather, Groceries, Reminders, News or Stocks module was rendered. Source scenario entries remain placeholders and *no full mixed-module firmware page* has been captured.

## Evidence boundaries

This validates original GFX + GxEPD2_BW **Date-only** multi-cell composition. It does not run the actual GxEPD2_750_T7 SPI/controller transport, waveform, physical panel, real other-module renderers, or verify physical readability at 1–2 metres. It does not certify aesthetic equivalence to the original Layout Lab reference `RE-MIND-layout-review-100 (2).pdf`, p1 seed `347015390`. These remain open review requirements.

**FLASH: NEI**. No production changes under `frame/src/`, no changes to Surf, GFX fonts, content, dates/week numbers/holidays, feature flags, deployment, OTA, or existing stacked PRs. The known-good v2.7.3 BIN and SHA must be independently obtained and verified before any future physical test.
