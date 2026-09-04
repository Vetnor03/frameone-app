from pathlib import Path

NET = Path('frame/src/network/NetClient.cpp').read_text()
LIVE = Path('frame/src/network/LiveUpdate.cpp').read_text()


def test_short_lived_http_clients_do_not_advertise_keep_alive():
    assert 'http.setReuse(false);' in NET
    assert NET.index('http.setReuse(false);') < NET.index('http.GET()')


def test_repeated_transport_failures_force_a_real_wifi_stack_reset():
    assert 'TRANSPORT_FAILURES_BEFORE_WIFI_RESET = 2' in NET
    assert 'WiFi.disconnect(true, false);' in NET
    assert 'WiFiManagerV2::connectSaved(12000)' in NET
    assert 'recoverWifiTransport("consecutive-http-transport-failures")' in NET


def test_transport_reset_preserves_existing_wifi_power_save_policy():
    assert 'esp_wifi_get_ps(&previousPowerSave)' in NET
    assert 'esp_wifi_set_ps(previousPowerSave)' in NET


def test_live_update_uses_shared_hardened_network_client():
    assert '#include "NetClient.h"' in LIVE
    assert 'NetClient::httpGetAuth' in LIVE
    assert 'NetClient::httpPostAuthJson' in LIVE
    assert 'WiFiClientSecure' not in LIVE
    assert 'HTTPClient http' not in LIVE


def test_live_update_real_network_probe_is_limited_to_ten_seconds():
    assert 'LIVE_PROBE_MIN_NETWORK_INTERVAL_MS = 10000' in LIVE
    assert 'g_haveCachedProbeState' in LIVE
    assert 'nowMs - g_lastProbeNetworkAtMs' in LIVE


def test_successful_ack_updates_cached_probe_state_to_prevent_redraw_rollback():
    acknowledge = LIVE[LIVE.index('bool LiveUpdate::acknowledge'):LIVE.index('uint64_t LiveUpdate::getRenderedAwaitingAck')]
    assert 'g_cachedProbeState.displayedRevision = revision' in acknowledge
    assert 'g_cachedProbeState.requestedRevision = revision' in acknowledge
