"""R4.15: protect the airy original Date aesthetic with real 1-bit ink.

This is a global pixel-space rule, not a 16-shape template. The baseline
full 800x480 remains owner-confirmed; 12px is deliberate in-cell whitespace
rather than an invented optical crop. Not a 1–2m physical reading test.
"""
from pathlib import Path
import json
import sys
import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"frame/tools"))
from generate_date_16_native_layoutlab import (
    native_ink_quality,MIN_EDITORIAL_MARGIN,HEADER
)


def synth(case,strokes,extra=False):
    bg=0 if case["dark"] else 255
    color=255-bg
    data=bytearray([bg]*(800*480))
    for x,y in strokes:
        data[y*800+x]=color
    if extra:
        data[40*800+40]=127
    return HEADER+bytes(data)


@pytest.mark.parametrize("dark", [0,1])
def test_precise_original_bit_margin_is_measured_in_own_cell(dark):
    item=dict(x=200,y=120,w=200,h=120,dark=dark)
    # A 35x25 native ink body exactly 20px from the nearest edge.
    points=[(item["x"]+xx,item["y"]+yy)
            for xx in range(20,55) for yy in range(20,45)]
    q=native_ink_quality(synth(item,points),item)
    assert q["inkPixels"]==875
    assert q["marginsPx"]==dict(left=20,top=20,right=145,bottom=75)
    assert q["minimumMarginPx"]==20
    assert q["palette"]=="original-binary-1bit"


def test_near_edge_content_rejected_even_if_no_cell_overflow():
    cell=dict(x=0,y=0,w=200,h=120,dark=0)
    points=[(x,y) for x in range(4,24) for y in range(20,50)]
    with pytest.raises(ValueError,match="breathing room"):
        native_ink_quality(synth(cell,points),cell)


def test_antialiasing_or_nonbinary_ink_is_not_mistaken_for_original_bitmap():
    cell=dict(x=0,y=0,w=200,h=120,dark=0)
    points=[(x,y) for x in range(20,55) for y in range(20,45)]
    with pytest.raises(ValueError,match="1-bit"):
        native_ink_quality(synth(cell,points,extra=True),cell)


def test_gallery_keeps_original_fonts_full_screen_and_global_margin_rule():
    source=(ROOT/"frame/tools/generate_date_16_native_layoutlab.py").read_text()
    assert "compile_native" in source and "capture(exe,case,pgm)" in source
    assert "editorialAdmitted=status" in source
    assert "MIN_EDITORIAL_MARGIN=12" in source
    assert MIN_EDITORIAL_MARGIN==12
    assert "native_ink_quality(content,case)" in source
    assert "for cw in range(1,5)" in source
    assert "for rh in range(1,5)" in source
    assert "notCurrentV4=True" in source
    assert "openingFollowsDisplayOuterEdge=True" in source
    # Never falsely present native previews as live e-paper measurements.
    assert "actualPanelTest=False" in source and "flashed=False" in source
    src=json.loads((ROOT/"shared/date-element-policy.json").read_text())
    assert src["panel"]["layoutViewportAuthority"]=="owner_confirmed_current_V4_full_800x480"
