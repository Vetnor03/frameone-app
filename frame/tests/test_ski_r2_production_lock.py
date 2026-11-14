"""Lock the owner-approved Ski R2 16-geometry production renderer.

Native light/dark visual QA is performed on the isolated review branch;
the production code must reuse exactly that approved renderer, without
merging test harnesses, mock fixtures or diagnostic grid into firmware.
"""
from pathlib import Path

MODULES=Path(__file__).resolve().parents[1]/"src"/"modules"
SKI=(MODULES/"ModuleSki.cpp").read_text()
EDITORIAL=(MODULES/"SkiEditorialLayout.h").read_text()

def test_owner_approved_live_r2_is_default_and_precedes_fallback():
    dispatch=SKI[SKI.index("namespace ModuleSki {"):]
    assert 'if (renderSkiEditorial(c, data)) return;' in dispatch
    assert dispatch.index('if (renderSkiEditorial(c, data)) return;') < dispatch.index('if (c.h <= 150)')
    assert '#include "SkiEditorialLayout.h"' in SKI
    assert '#include "RemindEditorialFonts.h"' in SKI
    assert "REMIND_SKI_EDITORIAL_PREVIEW_ENABLED" not in EDITORIAL
    assert "REMIND_SKI_EDITORIAL_PREVIEW_ENABLED" not in SKI
    assert 'renderSkiEditorial(const Cell& cell,const SkiCache& data)' in EDITORIAL

def test_real_metric_preflight_and_approved_condensed_content():
    assert 'skiEditorialDraw(cell,data,false)' in EDITORIAL
    assert 'skiEditorialDraw(cell,data,true)' in EDITORIAL
    assert "RemindEditorialFonts::fraunces72()" in EDITORIAL
    assert "RemindEditorialFonts::dm18()" in EDITORIAL
    assert "const bool tiny=area.w<225" in EDITORIAL
    assert 'return skiEditorialMetric(freshNumber,freshCaption,hero,paint)' in EDITORIAL
    assert 'skiEditorialWeatherParts(data,temp,sizeof(temp),wind,sizeof(wind))' in EDITORIAL
    assert "const int weatherH=(bodyH-3)/2;" in EDITORIAL
    assert 'data.norwegian?"Heiser: %d/%d":"Lifts: %d/%d"' in EDITORIAL
    assert 'data.liftsOpen,data.liftsTotal' in EDITORIAL
    assert 'data.norwegian?"Pudderalarm":"Powder alert"' in EDITORIAL
    assert 'skiEditorialShortDay(data.powderDate,day,sizeof(day))' in EDITORIAL
    assert 'skiEditorialExact(facts[i],row,true,paint)' in EDITORIAL
    assert '(int)tw>r.w-4 || (int)th>r.h-2' in EDITORIAL

def test_existing_ski_data_lifecycle_and_legacy_fallback_intact():
    for original in (
        "constexpr int MAX_INSTANCES = 4;",
        "3UL * 60UL * 60UL * 1000UL",
        '"/api/device/ski-frame?device_id="',
        "avalancheAssessed", "avalancheAvailable",
        'doc["resort"]', 'doc["next_powder_day"]',
        "FrameText::normalizeUtf8ForDisplay",
        "drawShallow(c, data);", "drawNarrow(c, data);",
        "drawReference(c, data);", "drawExpanded(c, data);",
    ):
        assert original in SKI,original
    assert 'drawUnavailable(c);' in SKI
    assert "skiEditorialDraw" in EDITORIAL
    assert "drawGrid" not in EDITORIAL
    assert "CountdownImages" not in EDITORIAL
    assert "ski_r1_native" not in SKI
