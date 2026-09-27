from pathlib import Path

SOURCE = (Path(__file__).parents[1] / "src" / "frame_v2.5.1.ino").read_text()


def test_usb_is_a_temporary_override_not_a_setting_change():
    assert "return usbPresent || !g_powerSaverMode;" in SOURCE
    assert 'setPowerSaverMode(g_cfg.powerSaver);' in SOURCE
    assert "if (g_powerSaverMode && !pwr.usbPresent && explicitAcked)" in SOURCE
    assert 'g_powerSaverMode && !pwr.usbPresent ? "power_saver_deep_sleep"' in SOURCE


def test_power_saver_usb_wake_starts_realtime_and_refreshes_overlay():
    setup = SOURCE.split("void setup()", 1)[1]
    assert "const bool startupOperationalPolicyReady = interactiveModeEnabled(pwrEarly.usbPresent)" in setup
    assert "if (interactiveModeEnabled(pwrEarly.usbPresent)) {" in setup
    assert "liveProbeOk = LiveUpdate::probe(DeviceIdentity::getToken(), liveState);" in setup
    assert "if (interactiveModeEnabled(pwrEarly.usbPresent) &&\n      !explicitRevisionPending" in setup
    assert "refreshPowerOverlayIfNeeded(overlayBatt, overlayPwr);" in setup
    assert setup.count("interactiveModeEnabled(pwr.usbPresent) &&\n") == 2


def test_unplug_redraws_first_then_returns_to_power_save():
    interactive = SOURCE.split("static InteractiveModeResult runInteractiveMode(", 1)[1].split("void setup()", 1)[0]
    edge = interactive.split("if (sampledPower.stable && sampledPower.usbPresent != pwr.usbPresent)", 1)[1]
    edge = edge.split("if (WiFi.status() != WL_CONNECTED)", 1)[0]
    assert edge.index("refreshPowerOverlayIfNeeded(batt, pwr);") < edge.index(
        'Power Saver: USB removed; returning to scheduled deep sleep'
    )
    assert edge.index("WiFiManagerV2::applyOperationalPowerPolicy(false, true)") < edge.index(
        "if (g_powerSaverMode)"
    )
    assert "return INTERACTIVE_FINISHED;" in edge


def test_manual_update_feedback_is_available_while_charging_in_power_save():
    explicit = SOURCE.split("static bool fetchAndRenderExplicit(", 1)[1].split(
        "static bool refreshContentSignatureBestEffort()", 1
    )[0]
    assert "if (interactiveModeEnabled(pwr.usbPresent)) {" in explicit
    assert "DisplayCore::drawUpdatingScreen();" in explicit
