from pathlib import Path

ROOT = Path(__file__).parents[1]
read = lambda p: (ROOT / p).read_text()


def test_production_has_mqtt_disabled_by_default_and_http_fallback():
    header = read('src/network/MqttPushPilot.h')
    source = read('src/frame_v2.5.1.ino')
    cpp = read('src/network/MqttPushPilot.cpp')
    assert '#define FRAME_MQTT_PILOT_ENABLED 0' in header
    assert '#if FRAME_MQTT_PILOT_ENABLED' in cpp
    assert 'bool poll(const String&, bool) { return false; }' in cpp
    assert 'const bool pushConnected = MqttPushPilot::poll(' in source
    assert 'if (pushConnected && !pushHint && !safetyProbeDue) continue;' in source
    assert '15UL * 60UL * 1000UL' in source
    assert 'LiveUpdate::probe(DeviceIdentity::getToken(), next, pushHint)' in source


def test_mqtt_messages_only_hint_at_secure_authoritative_revision_check():
    source = read('src/network/MqttPushPilot.cpp')
    client = read('src/network/LiveUpdate.cpp')
    assert 'g_tls.setCACert(kMqttPilotRootCaPem);' in source
    assert 'g_mqtt.subscribe(g_topic.c_str(), 1)' in source
    assert 'fetchCredentials(deviceToken, username, password, brokerHost, brokerPort)' in source
    assert 'g_mqtt.setServer(g_brokerHost.c_str(), brokerPort);' in source
    assert 'doc["broker_host"]' in source
    assert 'NetClient::httpGetAuth(url, deviceToken, code, body)' in source
    assert 'g_mqtt.connect(' in source
    assert 'username.c_str(), password.c_str()' in source
    assert 'username = "";' in source and 'password = "";' in source
    assert '"i5138504.ala.us-east-1.emqxsl.com"' in source
    assert 'DigiCert Global Root G2' in read('src/network/MqttPilotTrust.h')
    assert 'g_notificationPending = true;' in source
    assert 'void restoreNotification()' in source
    assert 'if (pushHint) MqttPushPilot::restoreNotification();' in read('src/frame_v2.5.1.ino')
    assert 'g_mqtt.setKeepAlive(90)' in source
    assert 'CONNECT_RETRY_MS = 60000' in source
    assert 'bool LiveUpdate::probe(const String& deviceToken, LiveUpdateState& out, bool forceNetwork)' in client
    assert '!forceNetwork && g_haveCachedProbeState' in client
    assert 'WiFiManagerV2::applyOperationalPowerPolicy(usbPresent, true)' in source


def test_mqtt_pilot_separate_build_cannot_change_production_firmware_flags():
    ini = read('platformio.ini')
    ci = (ROOT.parent / '.github/workflows/frame-firmware-build.yml').read_text()
    assert '[env:alfred_v1_2_mqtt_pilot]' in ini
    assert '-DFRAME_MQTT_PILOT_ENABLED=1' in ini
    assert 'knolleary/PubSubClient@2.8' in ini
    assert 'pio run -d frame -e alfred_v1_2_mqtt_pilot' in ci
    assert ini.index('[env:alfred_v1_2_mqtt_pilot]') > ini.index('[env:alfred_v1_2]')



def test_connected_mqtt_local_service_runs_without_hotloop_or_extra_https_probes():
    source = read('src/frame_v2.5.1.ino')
    header = read('src/network/MqttPushPilot.h')
    cpp = read('src/network/MqttPushPilot.cpp')
    interactive = source.split('static InteractiveModeResult runInteractiveMode(', 1)[1].split('void setup()', 1)[0]
    assert 'uint32_t lastMqttServiceAtMs = 0;' in interactive
    assert 'MqttPushPilot::appActivityIsActive() ? 1000UL : MANUAL_UPDATE_POLL_MS' in interactive
    assert 'const uint32_t lastProbeStartedAtMs = lastMqttServiceAtMs;' in interactive
    assert 'lastMqttServiceAtMs = millis();' in interactive
    assert 'if (remainingProbeWaitMs > 0 &&' in interactive
    assert 'waitForInteractiveCadence(pwr.usbPresent, remainingProbeWaitMs)' in interactive
    assert 'const bool debounceNow =' in interactive
    assert 'const PowerSenseDebug sampledPower = debounceNow ? readPowerSenseDebug() : pwr;' in interactive
    assert 'bool connected();' in header
    assert 'bool connected() { return g_mqtt.connected(); }' in cpp
    assert 'bool connected() { return false; }' in cpp
    # No new HTTP probes from the fast loop: connected idle still skips them
    # unless a push hint arrives or the 15-minute safety check becomes due.
    assert 'if (pushConnected && !pushHint && !safetyProbeDue) continue;' in interactive



def test_smart_instant_only_accelerates_while_authenticated_app_is_active():
    mqtt = read('src/network/MqttPushPilot.cpp')
    header = read('src/network/MqttPushPilot.h')
    wifi = read('src/device/WiFiManager.cpp')
    main = read('src/frame_v2.5.1.ino')
    assert 'if (length == 10 && memcmp(payload, "active:120", 10) == 0)' in mqtt
    assert 'ACTIVITY_TTL_MS = 120000UL' in mqtt
    assert 'g_appActiveDeadlineMs = millis() + ACTIVITY_TTL_MS;' in mqtt
    assert 'bool appActivityIsActive()' in mqtt
    assert 'bool appActivityIsActive();' in header
    assert 'MqttPushPilot::appActivityIsActive() ? 1000UL : MANUAL_UPDATE_POLL_MS' in main
    assert 'MqttPushPilot::maintainActivityPowerPolicy(pwr.usbPresent);' in main
    assert 'applyAppActiveLightSleepPolicy(bool usbPresent)' in wifi
    assert 'esp_wifi_set_ps(WIFI_PS_MIN_MODEM)' in wifi
    assert 'esp_wifi_set_ps(WIFI_PS_MAX_MODEM)' in wifi
    assert 'configureAutomaticLightSleep(true)' in wifi
    assert 'battery_app_active' in wifi
    assert 'g_mqtt.connected() && !usbPresent' in mqtt
    assert 'WiFiManagerV2::applyOperationalPowerPolicy(usbPresent, true);' in mqtt
    assert 'if (g_appActiveLightSleep) return "battery_app_active";' in wifi
    assert 'void maintainActivityPowerPolicy(bool) {}' in mqtt
    assert 'bool appActivityIsActive() { return false; }' in mqtt
