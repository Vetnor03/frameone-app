"""CI proof: compile real native ModuleDate.cpp and capture its pixel calls.

This is a host-only 800x480 Adafruit_GFX-like raster, NOT GxEPD2 memory.
No static SVG/JS plan may substitute for the native renderer in this test.
"""
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"frame/tools"))
from generate_date_native_painter_capture import generate

def test_actual_firmware_date_renderer_on_host_1bit_buffer(tmp_path):
    output=tmp_path/"native_date.html"
    data=generate(output)
    assert data["actualGxEPD2Buffer"] is False
    assert data["flashed"] is False
    assert data["nativePainterSource"]=="frame/src/modules/ModuleDate.cpp"
    records=data["cases"]
    assert len(records)==5
    # The old 26px week-number gutter silently rejected every editorial Date
    # because some original FreeSans9 ISO-week pairs need 19px (not 18px).
    # Native proof must actually admit BOTH a regular and year-turn month.
    assert records[0]["admitted"],records[0]["preflight"]
    assert records[2]["admitted"],records[2]["preflight"]
    assert records[0]["preflight"]["gridFont"]
    assert records[0]["preflight"]["nextFont"]
    assert len([r for r in records if r["admitted"]])>=2,records
    assert all(r["inkInside"]>=300 for r in records if r["admitted"])
    assert all(r["outOfBounds"]==0 for r in records if r["admitted"])
    assert all(r["inkOutside"]==0 and r["inkOutsideMatte"]==0
               for r in records if r["admitted"])
    assert all(r["hash"] for r in records)
    assert records[0]["admitted"]==records[1]["admitted"]
    text=output.read_text(encoding="utf-8")
    assert text.count("<article>")==5
    assert "NOT a GxEPD2 controller framebuffer" in text
    assert "NOT a physical panel capture" not in text or "not a physical panel" in text
    assert text.count("data:image/png;base64,")==sum(r["admitted"] for r in records)
    assert "LEGACY FALLBACK" in text or sum(r["admitted"] for r in records)==5

def test_capture_is_host_only_and_executes_unmodified_native_painter():
    cli=(ROOT/"frame/tests/native_capture/native_date_capture_cli.cpp").read_text()
    runner=(ROOT/"frame/tools/generate_date_native_painter_capture.py").read_text()
    workflow=(ROOT/".github/workflows/frame-firmware-build.yml").read_text()
    module=(ROOT/"frame/src/modules/ModuleDate.cpp").read_text()
    assert '#include "../../src/modules/ModuleDate.cpp"' in cli
    assert "ModuleDate::render(cell);" in cli
    assert "tryDrawEditorialDatePreview(" in cli
    assert "RemindEditorialFonts.cpp" in runner
    assert "DateEditorialF2Adapter.cpp" in runner
    assert "-std=c++11" in runner
    assert "#define REMIND_DATE_EDITORIAL_PREVIEW_ENABLED 0" in module
    assert "date-vnext-native-cpp-painter-1bit-unflashed" in workflow
    assert "ModuleSurf.cpp" not in runner
    # Week gutter is calibrated to the ORIGINAL FreeSans9 ISO week text.
    module=(ROOT/"frame/src/modules/ModuleDate.cpp").read_text()
    planner=(ROOT/"frame/src/display/DateMonthGridPlan.h").read_text()
    source_gallery=(ROOT/"frame/tools/generate_date_review_gallery.py").read_text()
    assert "editorialTitleFont ? 27 : 26" in module
    assert "width>grid.weekW-8" in module
    assert "editorialWeekWidth?27:26" in planner
    assert 'entry.get("editorialTitle") else 26' in source_gallery
