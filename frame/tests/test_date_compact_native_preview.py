"""Real C++ Date compact micro/ribbon/stack native-pixel proof.

The entire new variant stays behind a separate default-OFF flag, including
the editorial CI build; this test alone enables it in a Linux host raster.
Original F1/F2 GFX data are compiled, never substituted by browser fonts.
"""
from pathlib import Path
import json
import subprocess
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
    (0,0,200,240,9,21,0,True),   # 1x2 — all four original facts
    (0,0,400,240,9,21,0,True),   # 2x2 — all four original facts
    (600,240,200,240,11,31,1,True), # 1x2 / December / Dark
    (400,240,400,240,11,31,1,True), # 2x2 / December / Dark
    (0,0,200,360,9,21,0,True),   # 1x3 no calendar
    (0,0,400,360,9,21,0,True),   # 2x3 no calendar
    (0,0,200,480,9,21,0,True),   # 1x4 no calendar
    (0,0,400,480,9,21,0,False),  # 2x4 legacy calendar retained
    (0,0,600,240,9,21,0,False),  # 3x2 legacy calendar retained
    (0,0,800,360,9,21,0,False),  # 4x3 legacy calendar retained
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
        # Original editorial two-calendar planner is not faking compact success.
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


@pytest.mark.parametrize("cw,rh",[(w,h) for w in range(1,5) for h in range(1,5)])
def test_all_16_grid_shapes_preserve_native_bounds_and_calendar_fallback(
        native_compact,tmp_path,cw,rh):
    # Invoke the actual Date firmware entry point for all 16 *real* shapes.
    # A calendar-capable shape may be admitted by the full editorial stage;
    # the four-fact stack itself must never replace a calendar.
    w,h=cw*200,rh*120
    file=tmp_path/f"date_{cw}x{rh}.pgm"
    case=dict(year=2026,month0=9,day=21,x=0,y=0,w=w,h=h,
              dark=0,holiday=0)
    result=capture(native_compact,case,file)
    assert result["packedPixelMismatches"]==0,result
    assert result["packedBytes"]==48000,result
    assert result["outOfBounds"]==0,result
    if result["admitted"]:
        assert result["inkOutside"]==0,result
        assert result["inkOutsideMatte"]==0,result
    # The no-calendar micro/ribbon/stack family always admits four-fact
    # source ink in these nine physical shapes, including both 1x2/2x2.
    if (cw,rh) in {(1,1),(2,1),(3,1),(4,1),
                   (1,2),(2,2),(1,3),(2,3),(1,4)}:
        assert result["admitted"],(cw,rh,result)


@pytest.mark.parametrize("w,h",[(200,240),(400,240)])
def test_holidays_do_not_remove_or_change_compact_factual_date(
        native_compact,tmp_path,w,h):
    # In these two legacy sizes the configured holiday list is not drawn,
    # so adding one must not change the displayed four factual lines.
    def rendered(holiday):
        target=tmp_path/f"stack_{w}_{h}_{holiday}.pgm"
        return capture(native_compact,dict(
            year=2026,month0=9,day=21,x=0,y=0,w=w,h=h,
            dark=0,holiday=holiday),target)
    plain,with_holiday=rendered(0),rendered(1)
    assert plain["admitted"] and with_holiday["admitted"]
    assert plain["hash"]==with_holiday["hash"]


@pytest.mark.parametrize("w,h",[(200,240),(400,240),(200,360)])
def test_original_cpp_native_pixels_contain_actual_botanical_strokes(
        native_compact,tmp_path,w,h):
    # Not just a proposed JS composition: prove original ModuleDate.cpp draws
    # the shared 1-bit stroke source in exactly the measured reserved box.
    p=tmp_path/f"date_flower_{w}_{h}.pgm"
    result=capture(native_compact,dict(year=2026,month0=9,day=21,
        x=0,y=0,w=w,h=h,dark=0,holiday=0),p)
    assert result["admitted"],result
    query=dict(cell=dict(x=0,y=0,w=w,h=h),
        day=dict(w=71,h=53),month=dict(w=95,h=19),
        weekday=dict(w=100,h=17),year=dict(w=43,h=14))
    cli=ROOT/"frame/tests/helpers/date_compact_js_cli.mjs"
    proc=subprocess.run(["node",str(cli)],input=json.dumps(query)+"\n",
        text=True,capture_output=True,cwd=ROOT,timeout=15)
    assert proc.returncode==0,proc.stderr
    layout=json.loads(proc.stdout)
    assert layout and layout["art"]
    art=layout["botanical"]
    buf=p.read_bytes()
    header=b"P5\n800 480\n255\n"
    assert buf.startswith(header)
    pixels=buf[len(header):]
    assert len(pixels)==800*480
    ink=sum(pixels[yy*800+xx]==0
      for yy in range(art["y"],art["y"]+art["h"])
      for xx in range(art["x"],art["x"]+art["w"]))
    assert ink>=25,(w,h,ink,art)
    assert result["inkOutside"]==0
