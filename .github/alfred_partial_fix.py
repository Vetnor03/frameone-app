from pathlib import Path

root = Path(__file__).resolve().parents[1]
smart = root / "frame/src/core/SmartRefresh.cpp"
text = smart.read_text()

include_old = '#include "SmartRefresh.h"\n#include "Config.h"'
include_new = '#include "SmartRefresh.h"\n#include "HardwareProfile.h"\n#include "Config.h"'
if include_old not in text:
    raise SystemExit("SmartRefresh include anchor not found")
text = text.replace(include_old, include_new, 1)

old = '''  if (result.type != SmartDisplayPlan::FULL && (partialCount >= 20 || dirtyArea + addedArea >= 3UL * 800UL * 480UL)) result.type = SmartDisplayPlan::FULL;\n  if (result.type != SmartDisplayPlan::FULL) result.type = result.regionCount ? SmartDisplayPlan::PARTIAL : SmartDisplayPlan::NONE;\n  if (result.type == SmartDisplayPlan::FULL) { result.regionCount = 1; result.regions[0] = Cell{0, 0, 800, 480, 0, 0, 0, 4, 4, CELL_XL}; }\n  return result;\n'''
new = '''  if (result.type != SmartDisplayPlan::FULL && (partialCount >= 20 || dirtyArea + addedArea >= 3UL * 800UL * 480UL)) result.type = SmartDisplayPlan::FULL;\n  if (result.type != SmartDisplayPlan::FULL) result.type = result.regionCount ? SmartDisplayPlan::PARTIAL : SmartDisplayPlan::NONE;\n#if defined(FRAME_IS_ALFRED_V1_2)\n  // Alfred switches the e-paper rail fully off after each display transaction.\n  // The next DisplayCore::begin() therefore reinitializes GxEPD2/controller state,\n  // so a controller-level partial update is not safe across wake cycles. Keep\n  // smart hash/deadline detection, but promote any actual partial draw to a full\n  // physical refresh until panel/controller state is intentionally retained.\n  if (result.type == SmartDisplayPlan::PARTIAL) result.type = SmartDisplayPlan::FULL;\n#endif\n  if (result.type == SmartDisplayPlan::FULL) { result.regionCount = 1; result.regions[0] = Cell{0, 0, 800, 480, 0, 0, 0, 4, 4, CELL_XL}; }\n  return result;\n'''
if old not in text:
    raise SystemExit("SmartRefresh plan anchor not found")
text = text.replace(old, new, 1)
smart.write_text(text)

test = root / "frame/tests/test_alfred_partial_refresh_guard.py"
test.write_text('''from pathlib import Path\n\nROOT = Path(__file__).resolve().parents[2]\nSMART = (ROOT / "frame/src/core/SmartRefresh.cpp").read_text()\nDISPLAY = (ROOT / "frame/src/display/DisplayCore.cpp").read_text()\n\n\ndef test_alfred_promotes_partial_plan_to_full_after_dirty_detection():\n    assert '#include "HardwareProfile.h"' in SMART\n    partial_select = SMART.index("result.regionCount ? SmartDisplayPlan::PARTIAL : SmartDisplayPlan::NONE")\n    guard = SMART.index("#if defined(FRAME_IS_ALFRED_V1_2)", partial_select)\n    promotion = SMART.index("if (result.type == SmartDisplayPlan::PARTIAL) result.type = SmartDisplayPlan::FULL;", guard)\n    full_region = SMART.index("if (result.type == SmartDisplayPlan::FULL) { result.regionCount = 1;", promotion)\n    assert partial_select < guard < promotion < full_region\n\n\ndef test_alfred_reason_for_guard_is_controller_reinitialization_after_power_cut():\n    assert "DisplayCore::end();" not in SMART  # policy belongs in planning, not renderer shutdown\n    assert "display.init(115200);" in DISPLAY\n    assert "digitalWrite(HardwareProfile::kEpdPower, LOW);" in DISPLAY\n    assert "if (result.type == SmartDisplayPlan::PARTIAL) result.type = SmartDisplayPlan::FULL;" in SMART\n\n\ndef test_classic_partial_path_is_not_globally_removed():\n    assert "SmartDisplayPlan::PARTIAL" in SMART\n    assert "#if defined(FRAME_IS_ALFRED_V1_2)" in SMART\n    assert "display.setPartialWindow(x, y, w, h);" in DISPLAY\n''')
