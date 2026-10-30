"""R4.14 original ModuleDate C++ single-calendar visual and functional gate.

Safely admit each required geometry by measured content, preserving calendar
headers, original ring, full month, and legacy fallback on unsafe holidays.
Only host 1-bit source pixels. Not an e-paper/SPI/on-frame acceptance.
"""
from pathlib import Path
import sys
import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"frame/tools"))
from generate_date_native_painter_capture import compile_native,capture

# These are named only as TEST CASES; implementation uses glyph and month
# geometry rather than dedicated size-specific renderers.
SINGLE_MONTH_CELLS=[
    (400,480), # Tall: date above the single legacy calendar
    (600,240), # Shallow spread: calendar to the right
    (800,240),
    (800,360), # Legacy short spread, NOT a two-month expanded Date
]

@pytest.fixture(scope="module")
def actual_date_cpp(tmp_path_factory):
    return compile_native(tmp_path_factory.mktemp("adaptive_date")/"date_cpp")

@pytest.mark.parametrize("w,h",SINGLE_MONTH_CELLS)
@pytest.mark.parametrize("year,month0,day,dark",[
  (2026,9,21,0),       # October 2026 — 5 real week rows
  (2026,11,31,1),      # Dec 2026 — 5 real rows and rollover elsewhere
  (2026,2,15,0),       # March 2026 — 6 actual week rows
])
def test_original_cpp_one_complete_calendar_and_all_facts(
        actual_date_cpp,tmp_path,w,h,year,month0,day,dark):
    output=tmp_path/f"date_{w}_{h}_{month0}_{dark}.pgm"
    state=capture(actual_date_cpp,dict(year=year,month0=month0,day=day,
        x=0,y=0,w=w,h=h,dark=dark,holiday=0),output)
    assert state["admitted"],(w,h,month0,state)
    assert state["preflight"]["f2"]
    assert not state["preflight"]["needsDual"] # legacy one-month semantics
    assert state["preflight"]["grid"] and state["preflight"]["gridFont"]
    assert state["preflight"]["ring"]
    assert state["packedBytes"]==48000
    assert state["packedPixelMismatches"]==0
    assert state["inkOutside"]==0 and state["inkOutsideMatte"]==0
    assert state["outOfBounds"]==0
    assert state["inkInside"]>=500

@pytest.mark.parametrize("w,h",[(400,480),(800,360)])
def test_original_legacy_holiday_facts_are_never_silently_removed(
        actual_date_cpp,tmp_path,w,h):
    # Existing Date displays holidays in tall/card contexts. A missing
    # editorial holiday preflight MUST fail entirely back to original Date.
    state=capture(actual_date_cpp,dict(year=2026,month0=9,day=21,
        x=0,y=0,w=w,h=h,dark=0,holiday=1),
        tmp_path/f"holiday_{w}_{h}.pgm")
    assert state["outOfBounds"]==0
    assert state["inkOutside"]==0
    assert state["packedPixelMismatches"]==0
    assert not state["admitted"] or state["preflight"]["holiday"]

def test_no_hardcoded_shape_or_runtime_enable():
    cpp=(ROOT/"frame/src/display/DateEditorialPlan.h").read_text()
    js=(ROOT/"app/lib/dateEditorialComposition.mjs").read_text()
    firmware=(ROOT/"frame/src/modules/ModuleDate.cpp").read_text()
    assert "alternateCalendar" in cpp
    assert "planSingleCalendarAlternative" in js
    for t in ("colSpan","rowSpan","layoutFor2x4","layoutFor4x3"):
        assert t not in cpp and t not in js
    assert "#define REMIND_DATE_EDITORIAL_PREVIEW_ENABLED 0" in firmware
    assert "#define REMIND_DATE_COMPACT_PREVIEW_ENABLED 0" in firmware
    assert "DateEditorialDual::plan" in firmware
