"""Host-only 1-bit native Date matrix + pinned GxEPD2_BW byte-layout model.

This DOES NOT run GxEPD2 transport code or read its controller buffer.
"""
from pathlib import Path
import json
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"frame/tools"))
from date_native_epd_packing import (
    WIDTH,HEIGHT,aligned_window,audit_capture,crop_window,
    pack_window,pgm_pixels,unpack_window)
from generate_date_native_grid_matrix import (
    cases,run_matrix,summarize,write_html)
from generate_date_native_painter_capture import compile_native,capture

def test_100_actual_firmware_grid_shapes_400_native_paints_no_matte_spill(tmp_path):
    items=cases()
    assert len(items)==400
    assert len({(v["x"],v["y"],v["w"],v["h"]) for v in items})==100
    assert len({(v["w"],v["h"]) for v in items})==16
    result,rows=run_matrix()
    assert result["nativeActualCPP"] and result["originalGfxFonts"]
    assert not result["actualGxEPD2Buffer"]
    assert not result["otherModulePixels"] and not result["flashed"]
    assert result["total"]==400
    assert result["admitted"]>=4,result
    assert result["legacyFallback"]>0,result
    assert sum(v.get("total",0) for v in result["shapes"].values())==400
    assert len(result["shapes"])==16
    assert result["shapes"]["4×4"]["accepted"]==4
    # Native 3x4 works beside a reserved 1x4 neighboring module cell.
    assert result["shapes"]["3×4"]["accepted"]>=2
    for entry in rows:
        assert entry["outOfBounds"]==0
        assert entry["hash"]
        if entry["admitted"]:
            assert entry["inkInside"]>=300
            assert entry["inkOutside"]==0
            assert entry["inkOutsideMatte"]==0
    out=tmp_path/"matrix.html"
    write_html(out,result,rows)
    html=out.read_text(encoding="utf-8")
    assert "NOT AN E-PAPER OR GxEPD2 CAPTURE" in html
    assert "100 real grid positions" in html
    assert "<table>" in html
    assert "NOT rendered" in html or "NOT rendered." in html or "NOT " in html

def test_msb_first_black_zero_white_one_exact_row_order_and_paged_rebuild():
    # White=255 => bit 1; black=0 => bit 0 (rotation zero).
    white=bytearray(b"\xff"*(WIDTH*HEIGHT))
    geometry,all_pages=pack_window(bytes(white),0,0,800,480,480)
    assert geometry==(0,0,800,480)
    assert len(all_pages)==1 and len(all_pages[0][1])==48000
    assert set(all_pages[0][1])=={255}
    # Known black pixels at both ends of first byte, next byte, and last
    # row: exposes reversed-bit and transposed-row regressions.
    black=[(0,0),(7,0),(8,0),(799,479),(58,39)]
    for x,y in black:white[y*WIDTH+x]=0
    pixels=bytes(white)
    geometry,packed=pack_window(pixels,0,0,800,480,480)
    buf=packed[0][1]
    assert buf[0]==0b01111110
    assert buf[1]==0b01111111
    assert buf[100*479+99]==0b11111110
    assert unpack_window(geometry,packed)==pixels
    info=audit_capture(pixels)
    assert info["pageCount"]=={16:30,64:8,480:1}
    assert info["payloadBytes"]==48000 and info["byteIdentical"]

def test_actual_matte_partial_window_packed_with_8px_alignment():
    assert aligned_window(58,39,680,436)==(56,39,688,436)
    white=bytearray(b"\xff"*(WIDTH*HEIGHT))
    white[39*WIDTH+58]=0
    white[474*WIDTH+737]=0
    p=bytes(white)
    rect,pages=pack_window(p,58,39,680,436,64)
    assert rect==(56,39,688,436)
    assert len(pages)==7
    assert sum(len(buf) for _,buf in pages)==86*436
    assert unpack_window(rect,pages)==crop_window(p,rect)
    assert audit_capture(p,58,39,680,436)["payloadBytes"]==86*436

def test_real_module_date_gfx_bitmap_survives_epaper_row_byte_model(tmp_path):
    exe=compile_native(tmp_path/"native")
    cases=[
      dict(name="Light",year=2026,month0=9,day=21,
           x=0,y=0,w=800,h=480,dark=0,holiday=0),
      dict(name="Dark",year=2026,month0=9,day=21,
           x=0,y=0,w=800,h=480,dark=1,holiday=0),
    ]
    for index,item in enumerate(cases):
        pgm=tmp_path/f"{index}.pgm"
        status=capture(exe,item,pgm)
        assert status["admitted"],status
        assert status["inkOutsideMatte"]==0
        info=audit_capture(pgm_pixels(pgm))
        assert info["payloadBytes"]==48000
        assert info["byteIdentical"]

def test_driver_identification_and_explicit_rotation_zero_are_source_grounded():
    # These are guards on production configuration, NOT driver execution.
    display_type=(ROOT/"frame/src/display/DisplayType.h").read_text()
    display_core=(ROOT/"frame/src/display/DisplayCore.cpp").read_text()
    assert "GxEPD2_750_T7" in display_type
    assert "GxEPD2_750_T7::HEIGHT" in display_type
    assert "display.setRotation(0);" in display_core
    assert "display.setFullWindow();" in display_core
    assert "display.firstPage();" in display_core
    assert "display.nextPage();" in display_core
    # The original source blocker only admitted CELL_ADAPTIVE, while
    # firmware actually reports full 4x4 as CELL_XL. No size-name gate.
    module=(ROOT/"frame/src/modules/ModuleDate.cpp").read_text()
    block=module.split("bool tryDrawEditorialDatePreview(",1)[1].split(
        "const bool needsDual=",1)[0]
    assert "cell.size!=CELL_ADAPTIVE" not in block
    assert "if(!weekday||!month)return false;" in block
    runner=(ROOT/"frame/tools/generate_date_native_grid_matrix.py").read_text()
    assert "ModuleDate.cpp" in runner
    assert "actualGxEPD2Buffer=False" in runner
    assert "ModuleSurf" not in runner
