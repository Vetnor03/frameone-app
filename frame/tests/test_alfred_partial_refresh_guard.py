from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SMART = (ROOT / "frame/src/core/SmartRefresh.cpp").read_text()
DISPLAY = (ROOT / "frame/src/display/DisplayCore.cpp").read_text()


def test_alfred_promotes_partial_plan_to_full_after_dirty_detection():
    assert '#include "HardwareProfile.h"' in SMART
    partial_select = SMART.index("result.regionCount ? SmartDisplayPlan::PARTIAL : SmartDisplayPlan::NONE")
    guard = SMART.index("#if defined(FRAME_IS_ALFRED_V1_2)", partial_select)
    promotion = SMART.index("if (result.type == SmartDisplayPlan::PARTIAL) result.type = SmartDisplayPlan::FULL;", guard)
    full_region = SMART.index("if (result.type == SmartDisplayPlan::FULL) { result.regionCount = 1;", promotion)
    assert partial_select < guard < promotion < full_region


def test_alfred_reason_for_guard_is_controller_reinitialization_after_power_cut():
    assert "DisplayCore::end();" not in SMART  # policy belongs in planning, not renderer shutdown
    assert "display.init(115200);" in DISPLAY
    assert "digitalWrite(HardwareProfile::kEpdPower, LOW);" in DISPLAY
    assert "if (result.type == SmartDisplayPlan::PARTIAL) result.type = SmartDisplayPlan::FULL;" in SMART


def test_classic_partial_path_is_not_globally_removed():
    assert "SmartDisplayPlan::PARTIAL" in SMART
    assert "#if defined(FRAME_IS_ALFRED_V1_2)" in SMART
    assert "display.setPartialWindow(x, y, w, h);" in DISPLAY
