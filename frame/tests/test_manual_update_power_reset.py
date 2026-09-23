from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAIN = (ROOT / "frame/src/frame_v2.5.1.ino").read_text()
SMART = (ROOT / "frame/src/core/SmartRefresh.h").read_text()


def test_battery_deep_sleep_keeps_ten_second_manual_update_ceiling():
    assert "MANUAL_PROBE_SECONDS = 10" in SMART
    start = MAIN.index("static uint64_t nextDeepSleepDurationUs()")
    end = MAIN.index("static void goToSleep(bool usbPresent)", start)
    block = MAIN[start:end]
    assert "SmartRefresh::secondsUntilNextWake" in block
    assert "if (!g_powerSaverMode && seconds > SmartRefresh::MANUAL_PROBE_SECONDS)" in block
    assert "seconds = SmartRefresh::MANUAL_PROBE_SECONDS;" in block


def test_power_edge_orders_usb_and_battery_policies_safely():
    start = MAIN.index("if (sampledPower.stable && sampledPower.usbPresent != pwr.usbPresent)")
    end = MAIN.index("if (WiFi.status() != WL_CONNECTED)", start)
    block = MAIN[start:end]
    pending = block.index("g_powerRefreshPending = true")
    usb_policy = block.index("WiFiManagerV2::applyOperationalPowerPolicy(true, true)")
    refresh = block.index("refreshPowerOverlayIfNeeded(batt, pwr)")
    battery_policy = block.index("WiFiManagerV2::applyOperationalPowerPolicy(false, true)")
    assert pending < usb_policy < refresh < battery_policy


def test_power_edge_is_forced_full_screen_reset_not_partial_update():
    start = MAIN.index("static void refreshPowerOverlayIfNeeded")
    end = MAIN.index("static InteractiveModeResult runInteractiveMode", start)
    block = MAIN[start:end]
    assert "DisplayCore::forceNextFullRefresh(true);" in block
    assert "renderLoadedDashboard(batt, pwr)" in block
    assert "drawRegionWithContent" not in block
