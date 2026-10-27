# Date measured geometry JS/C++ parity — R3 prototype (27 Oct 2026)

**Stack:** [architecture #1440](https://github.com/Vetnor03/frameone-app/pull/1440) → [declarative policy #1441](https://github.com/Vetnor03/frameone-app/pull/1441) → this draft. **No PR in this series is merge/OTA/flash approved.**

## Implemented
1. `shared/date-element-policy.json` remains the **only source of geometry tokens**; `shared/generate_date_role_bindings.py` reproducibly emits one JS and one C++11 header binding. Freshness checked in native tests.
2. Pure `planMeasuredDate()` JavaScript and `DateRolePlanner::plan()` C++11 helpers accept an actual viewport cell and caller-supplied glyph **ink rectangles** (day, month, weekday). They evaluate **three composition grammars**: vertical stack, coherent horizontal ribbon, and mixed card. Every option is evaluated against the matte-visible rectangle and the chosen one minimizes the maximum occupied dimension. The geometry is centered using integer pixels and requires an **all-or-nothing fit**.
3. Python harness compiles native GNU++11 and invokes both planners with the **same 100 valid grid-shape/position combinations × four content-measurement scenarios = 400** cases, plus four invalid cases. Pixel-rectangle equality, overlap and physical aperture bounds are checked. A single cell is tested with different text measurements to ensure it can produce different expressions.
4. Existing Surf, ModuleDate, shared general renderer, real device firmware and API/backend unchanged. There is no renderer dispatch integration or font changes. Generated code is isolated and entirely unused by production builds.

## Important limitations (not yet a production Date engine)
- Synthetic bounding-box dimensions are **inputs to these parity tests**, not Fraunces/DM Sans glyph truth. The next slice must hook into F2 `EditorialText::measureLine/planLine` and equivalent test data. **Do not claim real ink clipping tested here**.
- Optional year, current/next calendar, holiday facts, theme contrast and figure are not yet placed; only day/month/weekday geometry is planned. A real pipeline must prioritize and degrade content before drawing and preserve the legacy Date fallback/calendar functionality.
- Three candidate grammars and their scoring are **engineering experiments**, not visually approved Layout Lab aesthetics. A valid numeric fit is not physical 1–2 m readability approval. 16 forms are test fixtures, not distinct renderers.
- No physical device test: **ALFRED V4 v2.7.3 known-good binary / rollback hash not yet verified**. R4 botanical illustrations are deliberately postponed.

### Check in CI
`pytest -q frame/tests/test_date_role_planner_parity.py`; existing firmware workflow runs full native suite plus PlatformIO and Arduino CLI. The extra JS/C++ parity check needs Node and g++, present on Ubuntu GitHub Actions runners.

**FLASH: NEI.**
