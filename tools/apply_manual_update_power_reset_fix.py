from pathlib import Path

main_path = Path('frame/src/frame_v2.5.1.ino')
text = main_path.read_text()

old_sleep = '''  // Invalid/unset wall time or scheduler state falls back to the revision
  // safety maximum, never the connected-mode manual probe cadence.
  if (now < 1000000000 || seconds == 0) seconds = SmartRefresh::REVISION_SAFETY_SECONDS;
  return (uint64_t)seconds * 1000000ULL;
'''
new_sleep = '''  // Invalid/unset wall time or scheduler state falls back to the revision
  // safety maximum for normal smart-refresh work.
  if (now < 1000000000 || seconds == 0) seconds = SmartRefresh::REVISION_SAFETY_SECONDS;
  // Deep sleep cannot receive a cloud manual-update request. Keep the smart
  // scheduler's due-work calculation, but never sleep longer than the manual
  // discovery ceiling so the app Update button remains responsive on battery.
  if (seconds > SmartRefresh::MANUAL_PROBE_SECONDS)
    seconds = SmartRefresh::MANUAL_PROBE_SECONDS;
  return (uint64_t)seconds * 1000000ULL;
'''
if old_sleep not in text:
    raise SystemExit('manual-probe sleep block not found')
text = text.replace(old_sleep, new_sleep, 1)

old_comment = '''// A cable event refreshes the current dashboard without inventing a revision
// or changing the normal content-check clock. An actual revision render can
// satisfy this refresh too, and clears the pending flag in renderLoadedDashboard.
'''
new_comment = '''// Plugging or unplugging the charger is also the user's physical display-reset
// gesture. Always perform a full-screen dashboard refresh: never partial-update
// a power edge, and never let it advance the normal content-check clock.
// An actual full render clears the pending flag in renderLoadedDashboard.
'''
if old_comment not in text:
    raise SystemExit('power-refresh comment block not found')
text = text.replace(old_comment, new_comment, 1)
text = text.replace(
    '    Serial.println("Power state change: dashboard refreshed");',
    '    Serial.println("Power state change: full-screen dashboard reset refresh complete");',
    1,
)

old_edge = '''      pwr = sampledPower;
      batt = BatteryManager::readAndUpdate(pwr.usbPresent);
      if (!WiFiManagerV2::applyOperationalPowerPolicy(pwr.usbPresent, true) && !pwr.usbPresent) {
        Serial.println("LiveUpdate: unplugged -> dynamic deep-sleep fallback");
        return INTERACTIVE_FINISHED;
      }
      bool hadPrevious = false;
      UpdateChecker::detectAndPersistUsbStateChange(pwr.usbPresent, true, hadPrevious);
      g_powerRefreshPending = true;
      Serial.println(pwr.usbPresent ? "USB connected" : "USB disconnected");
      if (batt.requiresRecharge) {
        showRechargeAndSleep(batt, pwr);
        return INTERACTIVE_FINISHED;
      }
'''
new_edge = '''      pwr = sampledPower;
      batt = BatteryManager::readAndUpdate(pwr.usbPresent);
      bool hadPrevious = false;
      UpdateChecker::detectAndPersistUsbStateChange(pwr.usbPresent, true, hadPrevious);
      g_powerRefreshPending = true;
      Serial.println(pwr.usbPresent ? "USB connected" : "USB disconnected");
      if (batt.requiresRecharge) {
        showRechargeAndSleep(batt, pwr);
        return INTERACTIVE_FINISHED;
      }

      // A charger edge is a deliberate full-screen reset gesture. Complete the
      // physical refresh while the current network session is still alive,
      // before an unplug can transition the device into deep-sleep fallback.
      refreshPowerOverlayIfNeeded(batt, pwr);
      if (!WiFiManagerV2::applyOperationalPowerPolicy(pwr.usbPresent, true) && !pwr.usbPresent) {
        Serial.println("LiveUpdate: unplugged after full-screen reset -> dynamic deep-sleep fallback");
        return INTERACTIVE_FINISHED;
      }
'''
if old_edge not in text:
    raise SystemExit('interactive power-edge block not found')
text = text.replace(old_edge, new_edge, 1)
main_path.write_text(text)

test_path = Path('frame/tests/test_manual_update_power_reset.py')
test_path.write_text('''from pathlib import Path\n\nROOT = Path(__file__).resolve().parents[2]\nMAIN = (ROOT / "frame/src/frame_v2.5.1.ino").read_text()\nSMART = (ROOT / "frame/src/core/SmartRefresh.h").read_text()\n\n\ndef test_battery_deep_sleep_keeps_ten_second_manual_update_ceiling():\n    assert "MANUAL_PROBE_SECONDS = 10" in SMART\n    start = MAIN.index("static uint64_t nextDeepSleepDurationUs()")\n    end = MAIN.index("static void goToSleep(bool usbPresent)", start)\n    block = MAIN[start:end]\n    assert "SmartRefresh::secondsUntilNextWake" in block\n    assert "if (seconds > SmartRefresh::MANUAL_PROBE_SECONDS)" in block\n    assert "seconds = SmartRefresh::MANUAL_PROBE_SECONDS;" in block\n\n\ndef test_power_edge_full_refresh_happens_before_battery_sleep_fallback():\n    start = MAIN.index("if (sampledPower.stable && sampledPower.usbPresent != pwr.usbPresent)")\n    end = MAIN.index("if (WiFi.status() != WL_CONNECTED)", start)\n    block = MAIN[start:end]\n    pending = block.index("g_powerRefreshPending = true")\n    refresh = block.index("refreshPowerOverlayIfNeeded(batt, pwr)")\n    policy = block.index("WiFiManagerV2::applyOperationalPowerPolicy")\n    assert pending < refresh < policy\n\n\ndef test_power_edge_is_forced_full_screen_reset_not_partial_update():\n    start = MAIN.index("static void refreshPowerOverlayIfNeeded")\n    end = MAIN.index("static InteractiveModeResult runInteractiveMode", start)\n    block = MAIN[start:end]\n    assert "DisplayCore::forceNextFullRefresh(true);" in block\n    assert "renderLoadedDashboard(batt, pwr)" in block\n    assert "drawRegionWithContent" not in block\n''')
