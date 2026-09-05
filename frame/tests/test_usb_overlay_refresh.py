from pathlib import Path

ROOT = Path(__file__).parents[1]


def test_dashboard_overlay_is_usb_only_even_when_forced():
    source = (ROOT / "src/display/DisplayCore.cpp").read_text()
    overlay = source.split("void drawBatteryOverlay(bool forceShow) {", 1)[1]
    assert overlay.index("if (!g_batteryUsbPresent || g_batteryPercent < 0) return;") < overlay.index("drawBatteryIcon(")


def test_realtime_samples_power_and_defers_redraw_for_pending_ack():
    source = (ROOT / "src/frame_v2.5.1.ino").read_text()
    loop = source.split("static InteractiveModeResult runInteractiveMode(", 1)[1].split("void setup()", 1)[0]
    assert "sampledPower.stable && sampledPower.usbPresent != pwr.usbPresent" in loop
    assert "batt = BatteryManager::readAndUpdate(pwr.usbPresent);" in loop
    assert loop.index("readPowerSenseDebug()") < loop.index("WiFi.status()")
    assert "LiveUpdate::getRenderedAwaitingAck() == 0 &&" in loop
    assert "state.requestedRevision <= state.displayedRevision" in loop
    assert "refreshPowerOverlayIfNeeded(batt, pwr);" in loop


def test_power_refresh_preserves_revision_and_content_clock():
    source = (ROOT / "src/frame_v2.5.1.ino").read_text()
    helper = source.split("static void refreshPowerOverlayIfNeeded(", 1)[1].split("static InteractiveModeResult runInteractiveMode(", 1)[0]
    assert "renderLoadedDashboard(batt, pwr)" in helper
    for forbidden in ("acknowledge(", "saveRenderedAwaitingAck(", "saveContentSignature(", "normalSyncElapsedSeconds ="):
        assert forbidden not in helper
    render = source.split("static bool renderLoadedDashboard(", 1)[1].split("static uint64_t explicitTimingRevision", 1)[0]
    assert render.index("DisplayCore::setBatteryStatus(") < render.index("Layout::drawWithContent(")
    assert render.index("g_powerRefreshPending = false;") > render.index("shutdownDisplay();")
