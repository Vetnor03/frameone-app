"""R4.13 viewport contract: unknown V4 matte must not shrink the design.

Source-policy protection only. Original C++ pixel capture + gallery are in the
separate mandatory date-visual-review workflow. No physical optical approval.
"""
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]

def test_800x480_panel_is_only_default_date_design_viewport():
    policy=json.loads((ROOT/"shared/date-element-policy.json").read_text())
    panel=policy["panel"]
    assert (panel["width"],panel["height"])==(800,480)
    assert panel["matte"]==dict(x=0,y=0,width=800,height=480)
    history=panel["historicalMatte"]
    assert {k:history[k] for k in ("x","y","width","height")}==dict(
        x=58,y=39,width=680,height=436)
    assert history["verification"]=="unverified_for_current_V4"
    assert history["use"]=="diagnostic_scenario_only"
    assert panel["layoutViewportAuthority"]=="logical_800x480_until_real_V4_measurement"
    assert "Actual matte viewport and ink bounds" not in policy["evidence"]["approved"]
    assert "DateCellIntersectedWithFullLogicalPanel" in (
        policy["expressionPolicy"]["selectionInputs"])
    assert policy["guardrails"]["routeToRuntime"] is False

def test_cplusplus_and_javascript_generated_viewports_match_one_source():
    run=subprocess.run(
      ["python3","shared/generate_date_role_bindings.py","--check"],
      cwd=ROOT,text=True,capture_output=True,timeout=15)
    assert run.returncode==0,run.stderr
    cxx=(ROOT/"frame/src/display/DateRolePolicy.generated.h").read_text()
    js=(ROOT/"app/lib/dateRolePolicy.generated.mjs").read_text()
    for name,value in dict(PANEL_WIDTH=800,PANEL_HEIGHT=480,MATTE_X=0,
                           MATTE_Y=0,MATTE_WIDTH=800,MATTE_HEIGHT=480).items():
        assert f"static const int {name} = {value};" in cxx
        assert f"{name}: {value}," in js

def test_native_visual_qa_discloses_fallback_and_treats_history_as_hypothetical():
    code=(ROOT/"frame/tools/generate_date_16_native_layoutlab.py").read_text()
    assert "actualPanelTest=False" in code
    assert "flashed=False" in code
    assert "for cw in range(1,5)" in code
    assert "for rh in range(1,5)" in code
    assert "legacyFallback=not status" in code
    assert "hypotheticalHistoricalMattePixels=old_crop_impact" in code
    # Old crop count is metadata, never a failed acceptance condition.
    assert "if old_crop_impact(" not in code
    assert "if behind:" not in (
       ROOT/"frame/tools/generate_date_compact_native_review.py").read_text()
    assert "#define REMIND_DATE_COMPACT_PREVIEW_ENABLED 0" in (
       ROOT/"frame/src/modules/ModuleDate.cpp").read_text()
    assert "REMIND_DATE_COMPACT_PREVIEW_ENABLED=1" not in (
       ROOT/"frame/platformio.ini").read_text()
