"""R4.10: full editorial Date original-C++ pixels vs documented physical aperture.

Tests C++ actual ModuleDate::render, not browser/source-only geometry.
No ESP32/physical panel or rollback approval is inferred.
"""
from itertools import product
from pathlib import Path
import sys
import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"frame/tools"))
from generate_date_native_painter_capture import compile_native,capture

MATTE=(58,39,680,436)
HEADER=b"P5\n800 480\n255\n"

@pytest.fixture(scope="module")
def native_editorial(tmp_path_factory):
    target=tmp_path_factory.mktemp("date_visible")/"date_native"
    return compile_native(target)

def behind_opening(pgm:Path,dark:bool):
    content=pgm.read_bytes()
    assert content.startswith(HEADER)
    pix=memoryview(content)[len(HEADER):]
    assert len(pix)==800*480
    bg=0 if dark else 255
    x,y,w,h=MATTE
    return sum(pix[yy*800+xx]!=bg
      for yy in range(480)
      for xx in range(800)
      if not (x<=xx<x+w and y<=yy<y+h))

@pytest.mark.parametrize("year,month0,day,dark",[
    (2026,9,21,0),       # Oct/Nov: 5 + 6 week rows
    (2026,9,21,1),
    (2026,11,31,0),      # December 2026 / January 2027
    (2026,11,31,1),
    (2024,1,29,0),       # leap-day checks
])
def test_full_4x4_both_complete_calendar_months_inside_aperture(
        native_editorial,tmp_path,year,month0,day,dark):
    target=tmp_path/f"full_{year}_{month0}_{dark}.pgm"
    case=dict(name="full Date 4x4",year=year,month0=month0,
              day=day,x=0,y=0,w=800,h=480,dark=dark,holiday=0)
    status=capture(native_editorial,case,target)
    assert status["admitted"],status
    assert status["preflight"]["needsDual"],status
    assert status["preflight"]["dual"],status
    assert status["preflight"]["grid"] and status["preflight"]["nextGrid"],status
    assert status["preflight"]["gridFont"] and status["preflight"]["nextFont"],status
    assert status["preflight"]["ring"],status
    assert status["packedBytes"]==48000
    assert status["packedPixelMismatches"]==0
    assert status["inkOutside"]==0 and status["outOfBounds"]==0
    assert behind_opening(target,bool(dark))==0,status

def test_all_100_legal_positions_clip_only_their_own_full_editorial_ink(
        native_editorial,tmp_path):
    # Physical QA of actual 1-bit pixels wherever the full-editorial
    # candidate is admitted; valid smaller layouts stay with legacy.
    admitted=0
    for w,h in product(range(1,5),repeat=2):
        for col,row in product(range(5-w),range(5-h)):
            x,y=col*200,row*120
            # Include dark once per legal location, light everywhere else.
            dark=(col+row)%2
            target=tmp_path/f"cell_{w}_{h}_{col}_{row}.pgm"
            case=dict(name="grid slot",year=2026,month0=9,day=21,
                x=x,y=y,w=200*w,h=120*h,dark=dark,holiday=0)
            state=capture(native_editorial,case,target)
            assert state["packedBytes"]==48000,state
            assert state["packedPixelMismatches"]==0,state
            assert state["outOfBounds"]==0,state
            if not state["admitted"]:continue
            admitted+=1
            assert state["inkOutside"]==0,case
            assert behind_opening(target,bool(dark))==0,(case,state)
    assert admitted>0

def test_known_legacy_fallback_and_missing_holiday_info_not_misrepresented(
        native_editorial,tmp_path):
    for item in [
      dict(name="full with holiday",x=0,y=0,w=800,h=480,
           month0=9,day=21,holiday=1,dark=0),
      dict(name="calendar too shallow",x=0,y=0,w=800,h=240,
           month0=11,day=31,holiday=0,dark=1),
    ]:
        target=tmp_path/f"legacy_{item['holiday']}_{item['h']}.pgm"
        state=capture(native_editorial,dict(year=2026,**item),target)
        if item["holiday"]:
            # Original Date may paint configured holidays if all fully fit,
            # otherwise it must refuse the new painter before drawing.
            assert state["admitted"]==state["preflight"]["holiday"] or not state["admitted"]
        else:
            assert not state["admitted"]
        assert state["packedPixelMismatches"]==0
