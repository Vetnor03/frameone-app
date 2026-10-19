from pathlib import Path

ROOT = Path(__file__).parents[1]
SCREEN = (ROOT / "src/display/ScreenPairing.cpp").read_text()
PORTAL = (ROOT / "src/device/ProvisioningPortal.cpp").read_text()
WIFI = SCREEN.split("static void drawWifiSetup(void* vctx) {", 1)[1].split("\nvoid showWifiSetup(", 1)[0]


def test_wifi_setup_has_large_real_ap_name_then_four_clear_steps():
    assert 'drawCenteredInFrame("Connect your frame to Wi-Fi", FRAME_Y + 68, &FreeMonoBold12pt7b);' in WIFI
    assert 'drawCenteredInFrame(ctx->ssid, FRAME_Y + 150, &FreeMonoBold18pt7b);' in WIFI
    assert 'snprintf(connectLine, sizeof(connectLine), "2. Connect to %s", ctx->ssid);' in WIFI
    steps = [
        '1. Open Wi-Fi settings on your phone',
        'drawCenteredInFrame(connectLine,',
        '3. Choose your home Wi-Fi',
        '4. Enter your Wi-Fi password',
    ]
    indices = [WIFI.index(value) for value in steps]
    assert indices == sorted(indices)
    for line in (
        'drawCenteredInFrame("1. Open Wi-Fi settings on your phone", FRAME_Y + 220, &FreeMonoBold12pt7b);',
        'drawCenteredInFrame(connectLine, FRAME_Y + 258, &FreeMonoBold12pt7b);',
        'drawCenteredInFrame("3. Choose your home Wi-Fi", FRAME_Y + 296, &FreeMonoBold12pt7b);',
        'drawCenteredInFrame("4. Enter your Wi-Fi password", FRAME_Y + 334, &FreeMonoBold12pt7b);',
    ):
        assert line in WIFI


def test_wifi_fallback_text_is_at_bottom_and_not_an_extra_step():
    assert 'Setup can take up to 1 minute", FRAME_Y + 393, &FreeMonoBold9pt7b' in WIFI
    assert 'If nothing happens, reconnect the charging cable", FRAME_Y + 432, &FreeMonoBold9pt7b' in WIFI
    assert 'After connecting, add your Wi-Fi credentials' not in WIFI
    assert 'Reconnect charger to restart Wi-Fi setup' not in WIFI
    assert 'Can take up to a minute to receive credentials' not in WIFI


def test_phone_captive_portal_really_allows_home_network_and_password():
    assert 'apSsid = String("FRAME-000-") + suffix;' in PORTAL
    assert 'ScreenPairing::showWifiSetup(apSsid.c_str())' in PORTAL
    assert '<label>Wi-Fi network</label>' in PORTAL
    assert "name='pass' type='password'" in PORTAL
    assert 'server.on("/save", HTTP_POST' in PORTAL
