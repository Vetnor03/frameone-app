"""Ski R1 is test-only pending visual/physical owner approval."""
from pathlib import Path
FRAME=Path(__file__).resolve().parents[1]
MOD=(FRAME/"src/modules/ModuleSki.cpp").read_text()
PREVIEW=(FRAME/"src/modules/SkiEditorialPreview.h").read_text()
PIO=(FRAME/"platformio.ini").read_text()

def test_original_ski_api_cache_and_status_contract_remains():
    for part in (
       '"/api/device/ski-frame?device_id="',
       "constexpr int MAX_INSTANCES = 4;",
       "3UL * 60UL * 60UL * 1000UL",
       "avalancheAssessed", "avalancheAvailable",
       "resortText(data", "powderText(data",
       "drawShallow(c, data)", "drawNarrow(c, data)",
       "drawReference(c, data)", "drawExpanded(c, data)",
       'FrameText::normalizeUtf8ForDisplay',
    ):
       assert part in MOD or part in PREVIEW,part

def test_review_is_opt_in_and_prior_to_legacy_dispatch():
    assert "#define REMIND_SKI_EDITORIAL_PREVIEW_ENABLED 0" in PREVIEW
    assert "-DREMIND_SKI_EDITORIAL_PREVIEW_ENABLED=1" in PIO
    assert "alfred_v1_2_ski_r1_preview" in PIO
    assert "if (renderSkiEditorialPreview(c, data)) return;" in MOD
    assert MOD.index("if (renderSkiEditorialPreview(c, data)) return;") < MOD.index("drawShallow(c, data);")
    assert "skiEditorialDraw(cell,data,false)" in PREVIEW
    assert "skiEditorialDraw(cell,data,true)" in PREVIEW
    assert "RemindEditorialFonts::fraunces72()" in PREVIEW
    assert "RemindEditorialFonts::dm18()" in PREVIEW

def test_preview_has_no_grid_numbers_or_static_bitmap_shortcuts():
    assert "CountdownImages.h" not in MOD
    assert "drawGrid" not in PREVIEW
    assert "drawPixel" not in PREVIEW # no decorative pixels; original GFX fonts only
