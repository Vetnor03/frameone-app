from pathlib import Path

ROOT = Path(__file__).parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_saved_wifi_association_uses_proven_preconnect_sequence_and_waits_for_ip():
    source = read("src/device/WiFiManager.cpp")
    assert "CONNECTED_IDLE_LISTEN_INTERVAL_BEACONS = 100" in source
    assert "config.sta.listen_interval = CONNECTED_IDLE_LISTEN_INTERVAL_BEACONS;" in source
    assert "return (uint32_t)ip != 0;" in source

    connect = source.split("bool connectSaved(uint32_t timeoutMs)", 1)[1].split(
        "bool applyOperationalPowerPolicy", 1
    )[0]
    assert connect.index("esp_wifi_set_ps(WIFI_PS_NONE)") < connect.index("WiFi.begin(")
    assert connect.index("WiFi.begin(") < connect.index("configureListenIntervalBeforeConnect();")
    assert connect.index("configureListenIntervalBeforeConnect();") < connect.index("esp_wifi_connect();")
    assert "while (!stationHasIp()" in connect
    assert "if (stationHasIp())" in connect
    assert "connectPsErr == ESP_OK && listenIntervalReady" in connect


def test_battery_policy_prefers_max_modem_and_requires_automatic_light_sleep():
    source = read("src/device/WiFiManager.cpp")
    policy = source.split("bool applyOperationalPowerPolicy(bool usbPresent, bool force)", 1)[1]
    assert "esp_wifi_set_ps(WIFI_PS_MAX_MODEM)" in policy
    assert "configureAutomaticLightSleep(true)" in policy
    assert policy.index("if (!stationHasIp())") < policy.index("WiFi.setSleep(true);")
    assert policy.index("WiFi.setSleep(true);") < policy.index("esp_wifi_set_ps(WIFI_PS_MAX_MODEM)")
    assert policy.index("esp_wifi_set_ps(WIFI_PS_MAX_MODEM)") < policy.index("configureAutomaticLightSleep(true)")
    assert "g_lastAssociationPreparedForConnectedIdle" in policy
    assert "psErr == ESP_OK &&" in policy
    assert "lightSleepReady;" in policy
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
    assert "waitForInteractiveCadence(pwr.usbPresent);" in interactive
    assert "waitForBatteryIdleCadenceOrUsbConnect" in source
    assert "gpio_wakeup_enable((gpio_num_t)POWER_SENSE_PIN, GPIO_INTR_LOW_LEVEL)" in source
    assert "ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(BATTERY_CONNECTED_IDLE_LOOP_MS))" in source
    setup = source.split("void setup()", 1)[1]
    assert "!pwrEarly.usbPresent && !connectedIdleReady && !normalSyncDue && !explicitRevisionPending" in setup
    assert "goToSleep(pwrEarly.usbPresent);" in setup
    sleep = source.split("static uint64_t nextDeepSleepDurationUs()", 1)[1].split("static void goToShelfSleep", 1)[0]
    assert "SmartRefresh::secondsUntilNextWake" in sleep
    assert "REVISION_SAFETY_SECONDS" in sleep
    assert "PROBE_WAKE_US" not in sleep


def test_normal_mode_applies_power_policy_before_time_sync():
    source = read("src/frame_v2.5.1.ino")
    setup = source.split("void setup()", 1)[1]
    connect = setup.index("WiFiManagerV2::connectSaved(12000)")
    startup_policy = setup.index("const bool startupOperationalPolicyReady")
    time_sync = setup.index("TimeSync::ensure(8000)")
    assert connect < startup_policy < time_sync
    policy_block = setup[startup_policy:time_sync]
    assert "WiFiManagerV2::applyOperationalPowerPolicy(pwrEarly.usbPresent, true)" in policy_block


def test_network_probe_is_capped_at_ten_seconds_and_restores_power_policy():
    source = read("src/network/LiveUpdate.cpp")
    assert "LIVE_PROBE_MIN_NETWORK_INTERVAL_MS = 10000" in source
    assert "restoreOperationalPowerPolicyAfterProbe();" in source
    helper = source.split("void restoreOperationalPowerPolicyAfterProbe()", 1)[1].split("}\n}\n\nbool LiveUpdate::probe", 1)[0]
    assert "applyOperationalPowerPolicy(usbPresent, true)" in helper

def test_production_http_read_timeout_is_twenty_seconds():
    source = read("src/network/NetClient.cpp")
    assert "HTTP_TIMEOUT_MS = 20000" in source
    assert "g_http.setTimeout(HTTP_TIMEOUT_MS);" in source



def test_manual_update_uses_realtime_network_burst_then_restores_als():
    wifi = read("src/device/WiFiManager.cpp")
    burst = wifi.split("bool beginRealtimeNetworkBurst()", 1)[1].split(
        "const char* operationalPowerMode()", 1
    )[0]
    assert "configureAutomaticLightSleep(false)" in burst
    assert "WiFi.setSleep(false);" in burst
    assert "esp_wifi_set_ps(WIFI_PS_NONE)" in burst

    source = read("src/frame_v2.5.1.ino")
    interactive = source.split("static InteractiveModeResult runInteractiveMode(", 1)[1].split(
        "void setup()", 1
    )[0]
    pending = interactive.split('Serial.printf("LiveUpdate: revision %"', 1)[1]
    assert pending.index("WiFiManagerV2::beginRealtimeNetworkBurst();") < pending.index(
        "fetchAndRenderExplicit"
    )
    assert pending.index("fetchAndRenderExplicit") < pending.index(
        "WiFiManagerV2::applyOperationalPowerPolicy(pwr.usbPresent, true)"
    )


def test_usb_connect_disables_als_before_power_edge_refresh():
    source = read("src/frame_v2.5.1.ino")
    interactive = source.split("static InteractiveModeResult runInteractiveMode(", 1)[1].split(
        "void setup()", 1
    )[0]
    edge = interactive.split('Serial.println(pwr.usbPresent ? "USB connected" : "USB disconnected");', 1)[1]
    edge = edge.split("if (WiFi.status() != WL_CONNECTED)", 1)[0]
    assert edge.index("applyOperationalPowerPolicy(true, true)") < edge.index(
        "refreshPowerOverlayIfNeeded(batt, pwr)"
    )
