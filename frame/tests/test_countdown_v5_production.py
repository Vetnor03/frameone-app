"""Countdown V5 production integration guardrails.

The approved layout must render live data for ALL footprints; the grid,
frozen bitmaps and app Studio geometry belong only in test tooling.
"""
from pathlib import Path

MODULES = Path(__file__).resolve().parents[1] / "src" / "modules"
CODE = (MODULES / "ModuleCountdown.cpp").read_text()
LAYOUT = (MODULES / "CountdownEditorialPreview.h").read_text()

def test_v5_dispatch_before_all_legacy_sizes():
    dispatch = CODE[CODE.index("void render(const Cell& c, const String& moduleName)"):]
    call = "if (renderEditorialCountdown(c)) return;"
    assert dispatch.count(call) == 1
    assert dispatch.index("ensureLoaded();") < dispatch.index(call)
    for legacy in ("CELL_ADAPTIVE", "CELL_SMALL", "CELL_MEDIUM", "CELL_LARGE", "CELL_XL"):
        assert dispatch.index(call) < dispatch.index("if (c.size == " + legacy + ")")

def test_live_selection_order_and_failure_fallback():
    assert "findNearestIdx()" in LAYOUT
    assert "collectAdaptiveUpcoming(heroIdx,events,MAX_EVENTS)" in LAYOUT
    assert "if (!g_cache.ok) return false" in LAYOUT
    assert "if (heroIdx < 0) return false" in LAYOUT
    assert "drawCountdownCalendarMonth(" in LAYOUT

def test_v5_uses_measured_glyphs_instead_of_fixed_bitmaps():
    assert "cdEditorialMetricHeight(" in LAYOUT
    assert "cdEditorialTitlePlan(" in LAYOUT
    assert "widestTitle" in LAYOUT
    assert "blockY=r.y+max(0,(r.h-blockH)/2)" in LAYOUT
    assert "CountdownImages.h" not in CODE
    assert "CountdownImages.h" not in LAYOUT
    assert "drawGrid" not in LAYOUT
    assert "REMIND_COUNTDOWN_EDITORIAL_PREVIEW_ENABLED" not in CODE
    assert "REMIND_COUNTDOWN_EDITORIAL_PREVIEW_ENABLED" not in LAYOUT
