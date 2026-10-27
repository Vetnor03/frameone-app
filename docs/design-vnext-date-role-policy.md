# Date role policy candidate — R3 preparatory slice (27 Oct 2026)

## Scope and evidence
Built on the role-first architecture correction [#1440](https://github.com/Vetnor03/frameone-app/pull/1440), **not** on the old per-size Date renderer PR stack. This slice defines a single machine-readable `shared/date-element-policy.json` for all Date cell geometries, plus illustrative, non-production shape fixtures and native contract tests. The source is intentionally **not imported into the firmware or Studio rendering path**.

**Approved design direction:** screen 6 Fraunces + DM Sans; fact/role hierarchy; essential day first; ink-bound checking; physical matte; no truncated factual date; preserve calendar/holiday semantics and Surf. **Only candidate/NOT approved:** the numeric geometry thresholds inherited from the experimental Lab branch #1423, font fallback sizing decisions, and art/calendar area thresholds.

## What tests prove — and do not prove
`pytest -q frame/tests/test_date_element_policy.py` validates unique semantic descriptors, guardrails, named compact/vertical/ribbon/card/spread fixtures, matte intersections, and the 16 shapes at all 100 valid placements × Light/Dark × four factual presets = 800 candidate-policy cases. The data preset/theme loop is a **geometry invariance assertion**, *not* a pixel, raster, data-selection or render test. No JS/C++ parity or font/glyph/calendar QA is claimed yet.

Date 1×2 and 2×1 already exist in [#1438](https://github.com/Vetnor03/frameone-app/pull/1438) and [#1439](https://github.com/Vetnor03/frameone-app/pull/1439) as draft ink experiments. No new independent renderer is introduced here.

## Next gate
Generate/consume the semantic contract in one **shared, element-based JS/C++ planner** with parity fixtures. Integrate F2 GFX glyph bounds and the original calendar/holiday logic in a separately flagged path. Before promotion to runtime, compare with original approved 100-review Layout Lab samples, then test physical Dark/Light only after recovering a known-good ALFRED V4 v2.7.3 rollback binary/hash.

**No active firmware, Studio UI, Surf, MQTT, backend, flash or OTA changes. FLASH: NEI.**
