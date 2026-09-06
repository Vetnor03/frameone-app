from pathlib import Path

ROOT = Path(__file__).parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_saved_wifi_association_sets_roughly_ten_second_listen_interval():
    source = read("src/device/WiFiManager.cpp")
    assert "CONNECTED_IDLE_LISTEN_INTERVAL_BEACONS = 100" in source
    connect = source.split("bool connectSaved(uint32_t timeoutMs)", 1)[1]
    assert "WiFi.begin(ssid.c_str(), pass.c_str(), 0, nullptr, false);" in connect
    assert connect.index("WiFi.begin(") < connect.index("configureListenIntervalBeforeConnect();")
    assert connect.index("configureListenIntervalBeforeConnect();") < connect.index("esp_wifi_connect();")
    assert "config.sta.listen_interval = CONNECTED_IDLE_LISTEN_INTERVAL_BEACONS;" in source


def test_battery_policy_prefers_max_modem_and_requires_automatic_light_sleep():
    source = read("src/device/WiFiManager.cpp")
    policy = source.split("bool applyOperationalPowerPolicy(bool usbPresent, bool force)", 1)[1]
    assert "esp_wifi_set_ps(WIFI_PS_MAX_MODEM)" in policy
    assert "configureAutomaticLightSleep(true)" in policy
    assert "psErr == ESP_OK && lightSleepReady" in policy
    assert "CONFIG_PM_ENABLE" in source
    assert "CONFIG_FREERTOS_USE_TICKLESS_IDLE" in source
    assert "return false;" in policy


def test_usb_policy_remains_full_realtime():
    source = read("src/device/WiFiManager.cpp")
    policy = source.split("bool applyOperationalPowerPolicy(bool usbPresent, bool force)", 1)[1]
    usb = policy.split("if (usbPresent)", 1)[1].split("// Battery policy", 1)[0]
    assert "WiFi.setSleep(false);" in usb
    assert "esp_wifi_set_ps(WIFI_PS_NONE)" in usb


def test_main_uses_ten_second_connected_idle_and_dynamic_deep_sleep_fallback():
    source = read("src/frame_v2.5.1.ino")
    assert "REALTIME_TEST_MODE" not in source
    assert "BATTERY_CONNECTED_IDLE_LOOP_MS = 10000" in source
    interactive = source.split("static InteractiveModeResult runInteractiveMode(", 1)[1].split("void setup()", 1)[0]
    assert "applyOperationalPowerPolicy(pwr.usbPresent, true)" in interactive
    assert "connected light sleep unavailable; use dynamic deep-sleep fallback" in interactive
    assert "delay(pwr.usbPresent ? REALTIME_UPDATE_POLL_MS : BATTERY_CONNECTED_IDLE_LOOP_MS);" in interactive
    setup = source.split("void setup()", 1)[1]
    assert "!pwrEarly.usbPresent && !connectedIdleReady && !normalSyncDue && !explicitRevisionPending" in setup
    assert "goToSleep(pwrEarly.usbPresent);" in setup
    sleep = source.split("static uint64_t nextDeepSleepDurationUs()", 1)[1].split("static void goToShelfSleep", 1)[0]
    assert "SmartRefresh::secondsUntilNextWake" in sleep
    assert "REVISION_SAFETY_SECONDS" in sleep
    assert "PROBE_WAKE_US" not in sleep


def test_network_probe_is_capped_at_ten_seconds_and_restores_power_policy():
    source = read("src/network/LiveUpdate.cpp")
    assert "LIVE_PROBE_MIN_NETWORK_INTERVAL_MS = 10000" in source
    assert "restoreOperationalPowerPolicyAfterProbe();" in source
    helper = source.split("void restoreOperationalPowerPolicyAfterProbe()", 1)[1].split("}\n}\n\nbool LiveUpdate::probe", 1)[0]
    assert "applyOperationalPowerPolicy(usbPresent, true)" in helper
