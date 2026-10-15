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
    assert 'fetchCredentials(deviceToken, username, password)' in source
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
