"""Real C++ Date compact micro/ribbon first-stage native-pixel proof.

The entire new variant stays behind a separate default-OFF flag, including
the editorial CI build; this test alone enables it in a Linux host raster.
Original F1/F2 GFX data are compiled, never substituted by browser fonts.
"""
from pathlib import Path
import pytest
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"frame/tools"))
from generate_date_native_painter_capture import compile_native,capture

@pytest.fixture(scope="module")
def native_compact(tmp_path_factory):
    target=tmp_path_factory.mktemp("date_compact")/"capture"
    return compile_native(target,["-DREMIND_DATE_COMPACT_PREVIEW_ENABLED=1"])

@pytest.mark.parametrize("x,y,w,h,month0,day,dark,expected",[
    (0,0,200,120,9,21,0,True),    # 1x1 micro — only day & weekday
    (200,240,200,120,11,31,1,True),
    (0,0,400,120,9,21,0,True),    # 2x1 ribbon — three facts
    (200,120,600,120,11,31,1,True), # 3x1 — year included
    (0,0,800,120,9,21,0,True),    # 4x1 — year included
    (0,0,200,240,9,21,0,False),  # 1x2 — no replacement (yet)
    (0,0,400,240,9,21,0,False),  # 2x2 — no replacement (yet)
])
def test_original_cpp_compact_admission_and_ink_bounds(
        native_compact,tmp_path,x,y,w,h,month0,day,dark,expected):
    pgm=tmp_path/f"date_{x}_{y}_{w}_{h}_{dark}.pgm"
    fixture=dict(year=2026,month0=month0,day=day,
                 x=x,y=y,w=w,h=h,dark=dark,holiday=0)
    result=capture(native_compact,fixture,pgm)
    assert result["admitted"] is expected,result
    assert result["inkOutside"]==0,result
    assert result["outOfBounds"]==0,result
    assert result["inkOutsideMatte"]==0,result
    assert result["packedBytes"]==48000,result
    assert result["packedPixelMismatches"]==0,result
    assert pgm.is_file()
    if expected:
        assert result["inkInside"]>=300,result
        # Original editorial two-calendar planner is not faking small success.
        assert result["preflight"]["f2"] is False,result

def test_compact_feature_disabled_in_normal_firmware_and_prior_preview():
    source=(ROOT/"frame/src/modules/ModuleDate.cpp").read_text()
    pio=(ROOT/"frame/platformio.ini").read_text()
    assert "#define REMIND_DATE_COMPACT_PREVIEW_ENABLED 0" in source
    assert "REMIND_DATE_COMPACT_PREVIEW_ENABLED=1" not in pio
    assert "#if REMIND_DATE_COMPACT_PREVIEW_ENABLED" in source
    assert "tryDrawEditorialCompactDatePreview" in source
    assert 'if(tryDrawEditorialCompactDatePreview(c,wday,month,year,month0,dayNum))' in source
    assert "DateEditorialCompactPlan.h" in source
    compact=(ROOT/"frame/src/display/DateEditorialCompactPlan.h").read_text()
    assert "colSpan" not in compact and "rowSpan" not in compact
    assert "DateRolePolicy::PANEL_WIDTH" in compact
    assert "showYear=year" in compact
