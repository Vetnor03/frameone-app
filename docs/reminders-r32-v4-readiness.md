# Reminders R3.2 — V4 physical QA readiness (preflight, **NOT approval**)

2026-11-11 · Draft [PR #1510](https://github.com/Vetnor03/frameone-app/pull/1510) · Tracker [#1429](https://github.com/Vetnor03/frameone-app/issues/1429)

## Decision
**Digital rendering is ready for owner visual review and preparation of a
separate, isolated V4 test build. It is NOT ready to merge or deploy.**
Do not flash, publish an OTA, or change device configuration without explicit
owner approval. Native CI is not the same as a physical hardware test.

## Locked rule: preserve existing functionality

The entire R3.2 visual delta is in the Reminders-only opt-in preview.
No changes are permitted to:

- API URLs/payloads, cache/HTTP limits, time/occurrence/all-day handling,
  configured title profiles, source order, date groups, and the established
  Today/Tomorrow evening transition or overdue rules;
- server Skip (frame-only), sync, battery, Wi-Fi, MQTT, pairing,
  refresh frequency, other module state, or the original legacy fallback;
- the locked Date, Weather and Surf production modules.

**Hero means stylistic emphasis for the first supplied item, not a claim
that the first item is the next chronological event.** For 1–5 items, a
spacious cell may use Fraunces48 on the first full title; for 6–10, favor
an even DM Sans24 overview. No new time-based sorting/filtering.

The current existing device limit is 10 (app supports up to 20). This is
not fixed in the visual-only R3.2 candidate; changing it would require
a separate functional proposal and explicit authorization.

## Digital QA already completed

- [x] Latest R3.2 firmware build: [Actions run](https://github.com/Vetnor03/frameone-app/actions/runs/43066185207) success for `94869868`.
- [x] R3.2 native GFX bitmaps: [Actions run](https://github.com/Vetnor03/frameone-app/actions/runs/43066185211) success.
- [x] **480 cases** = 15 data scenarios × 16 shapes × both themes.
- [x] 426 native editorial images / 54 explicit old-renderer fallbacks.
  These are **27 matching Light/Dark fallback pairs**:
  16 unavailable-data pairs; 7 long unbreakable-word pairs;
  4 overfull 1×1 pairs (long/many/Tomorrow-only/Norwegian).
- [x] No pixels outside framebuffer for native editorial output.
- [x] All 213 native Light/Dark output pairs are exact 1-bit inversions,
  with equivalent item counts/overflow and fallback choice.
- [x] Full task text, time and dates, source order and item indexes are
  unchanged across native preview execution.
- [x] Normal, sparse, six-item and ten-item scenarios render as planned,
  including all six/ten entries on 4×4 (for these test fixtures).
- [x] Native previews include empty, future-only, overdue, all-day, times,
  Norwegian ÆØÅæøå, very long words, and multi-day content.

The harness compiles the real R3.2 preview and original bitmap font arrays,
but substitutes minimal native adapters for backend and display dependencies.
It does **not** render the original firmware fallback. The 54 fallback cases
and the actual evening/Skip behavior need end-to-end regression testing.

## Physical V4 acceptance matrix (all 16 rectangles, both themes)

| Height / width | 1 col (200px) | 2 col (400px) | 3 col (600px) | 4 col (800px) |
|---|---:|---:|---:|---:|
| 1 row (120px) | 1×1 | 2×1 | 3×1 | 4×1 |
| 2 rows (240px) | 1×2 | 2×2 | 3×2 | 4×2 |
| 3 rows (360px) | 1×3 | 2×3 | 3×3 | 4×3 |
| 4 rows (480px) | 1×4 | 2×4 | 3×4 | 4×4 |

For each shape test:
- [ ] Light and Dark *on real V4 e-paper*, not a monitor: no clipping,
  weak strokes, ghosting obscuring labels, or collapsed rows.
- [ ] 1–2 m readability: task title must be immediately legible; Today/
  Tomorrow is only context. Times/dates must be sufficiently clear.
- [ ] Short, long, wrapped, all-day and timed tasks; no hidden/missing words.
- [ ] Empty and unavailable are visibly distinct.
- [ ] Overdue/future date labels, group order and exact Today/Tomorrow
  behavior, including the existing evening logic.
- [ ] 1, 2, 5, 6 and 10 visible-device entries; `+N more` is accurate and
  never implies that a hidden reminder was dismissed.
- [ ] Explicitly render each native-rejected fallback shape/data case via
  the **real production legacy path**, not just the native preview.
- [ ] Check configured compact, standard, and spacious titles.
- [ ] Compare source content and Skip behavior against untouched `main`.
- [ ] Regression smoke test locked Date / Weather / Surf modules.

## How to proceed safely after approval
1. Finish CI and inspect original native 1-bit artifact for **both** themes.
2. Prepare a dedicated V4 test image built from this unmerged design branch.
   Do not modify any production OTA manifest or auto-trigger firmware update.
3. Owner explicitly authorizes USB flashing to a designated test V4 frame.
4. Run complete physical matrix; record photographed screen results, defects,
   and approval/rejection per geometry and theme.
5. Only after the owner physically approves all 16 Light/Dark geometry
   classes: create a clean integration branch from current `main`, port only
   approved Reminders runtime changes, verify Date/Weather/Surf SHA and CI,
   then seek separate merge approval.

**No flash, merge, production lock or OTA is authorized by this document.**
