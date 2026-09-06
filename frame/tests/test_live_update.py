from pathlib import Path
MAIN = Path('frame/src/frame_v2.5.1.ino').read_text()
LIVE = Path('frame/src/network/LiveUpdate.cpp').read_text()
NET = Path('frame/src/network/NetClient.cpp').read_text()
CHECKER = Path('frame/src/network/UpdateChecker.cpp').read_text()
SIGNATURE = Path('app/lib/device/contentSignature.mjs').read_text()

def test_revision_probe_uses_source_aware_idle_cadence_and_is_cheap():
    assert 'static const uint32_t REALTIME_UPDATE_POLL_MS = 1000;' in MAIN
    assert 'static const uint32_t BATTERY_CONNECTED_IDLE_LOOP_MS = 10000;' in MAIN
    loop = MAIN[MAIN.index('static InteractiveModeResult runInteractiveMode'):MAIN.index('// --------------------------------------\n// Setup')]
    assert 'delay(pwr.usbPresent ? REALTIME_UPDATE_POLL_MS : BATTERY_CONNECTED_IDLE_LOOP_MS);' in loop
    assert 'LiveUpdate::probe' in loop
    assert 'FrameConfigApi::fetchWithStatus' not in loop.split('// Exactly one cheap revision probe')[1]

def test_app_activity_is_not_a_firmware_gate():
    assert 'appActive' not in MAIN + LIVE
    assert 'app_active' not in LIVE

def test_manual_revision_fetches_new_config_then_renders_persists_and_acks():
    explicit = MAIN[MAIN.index('static bool fetchAndRenderExplicit'):MAIN.index('static bool retryRenderedAck')]
    assert explicit.index('FrameConfigApi::fetchWithStatus') < explicit.index('renderLoadedDashboard')
    assert explicit.index('renderLoadedDashboard') < explicit.index('saveRenderedAwaitingAck')
    retry = MAIN[MAIN.index('static bool retryRenderedAck'):MAIN.index('static void consumeNormalSyncPeriod')]
    assert retry.index('getRenderedAwaitingAck') < retry.index('LiveUpdate::acknowledge')

def test_renders_are_serial_and_new_layout_cannot_use_cached_config():
    assert 'while (true)' in MAIN
    assert MAIN.count('fetchAndRenderExplicit(batt, pwr, revisionToDisplay)') == 1
    explicit = MAIN[MAIN.index('static bool fetchAndRenderExplicit'):MAIN.index('static bool retryRenderedAck')]
    assert 'FrameConfigApi::fetchWithStatus(g_cfg' in explicit

def test_revision_safety_poll_replaces_four_hour_redraw_policy():
    assert 'MAX_REVISION_POLL_SECONDS = 10 * 60' in MAIN
    assert 'PROBE_WAKE_SECONDS = 10 * 60' in MAIN
    assert 'SCHEDULED_CONTENT_CHECK_SECONDS' not in MAIN
    assert '4 * 60 * 60' not in MAIN
    assert 'NORMAL_SYNC_SECONDS' not in MAIN
    assert 'WAKES_PER_REFRESH' not in MAIN
    assert 'shouldForcePeriodicRefresh' not in MAIN
    assert 'NORMAL_SYNC_SECONDS = 900' not in MAIN

def test_signature_uses_exact_active_instances_and_physical_endpoints():
    assert "INSTANCE_BASES = new Set(['weather', 'surf', 'soccer', 'stocks'])" in SIGNATURE
    assert "'/api/device/stocks'" in SIGNATURE and 'device_id: deviceId, id' in SIGNATURE
    assert "'/api/surf/score'" in SIGNATURE and 'frame: 1' in SIGNATURE
    assert 'competitionId: config.competitionId' in SIGNATURE
    assert 'optimizeFrameContent' not in SIGNATURE

def test_scheduled_same_signature_does_not_render_and_changed_content_uses_display_policy():
    scheduled = MAIN[MAIN.index('String nextSignature;'):MAIN.index('normalSyncDue = false;', MAIN.index('String nextSignature;'))]
    same = scheduled[scheduled.index('nextSignature =='):scheduled.index('} else {', scheduled.index('nextSignature =='))]
    assert 'renderLoadedDashboard' not in same
    assert 'postDeviceStatus(batt, pwr, false)' in same
    assert 'DisplayCore::forceNextFullRefresh(true)' not in scheduled
    assert scheduled.index('renderLoadedDashboard') < scheduled.index('saveContentSignature(nextSignature)')

def test_signature_failure_preserves_display_and_backs_off():
    scheduled = MAIN[MAIN.index('String nextSignature;'):]
    failed = scheduled[:scheduled.index('} else if')]
    assert 'renderLoadedDashboard' not in failed
    assert 'preserving display' in failed

def test_manual_ack_precedes_signature_bookkeeping():
    loop = MAIN[MAIN.index('static InteractiveModeResult runInteractiveMode'):MAIN.index('void setup()')]
    accepted = loop[loop.index('if (!fetchAndRenderExplicit'):loop.index('// Exactly one cheap revision probe')]
    assert accepted.index('retryRenderedAck') < accepted.index('refreshContentSignatureBestEffort')
    explicit = MAIN[MAIN.index('static bool fetchAndRenderExplicit'):MAIN.index('static bool refreshContentSignatureBestEffort')]
    assert explicit.index('renderLoadedDashboard') < explicit.index('saveRenderedAwaitingAck')
    assert 'fetchContentSignature' not in explicit


def test_status_reporting_is_outside_render_and_after_manual_ack():
    render = MAIN[MAIN.index('static bool renderLoadedDashboard'):MAIN.index('static bool fetchAndRenderExplicit')]
    assert 'postDeviceStatus' not in render
    loop = MAIN[MAIN.index('static InteractiveModeResult runInteractiveMode'):MAIN.index('// Exactly one cheap revision probe')]
    accepted = loop[loop.index('if (!fetchAndRenderExplicit'):]
    assert accepted.index('retryRenderedAck') < accepted.index('postDeviceStatus')
    assert accepted.index('postDeviceStatus') < accepted.index('refreshContentSignatureBestEffort')


def test_later_ack_success_reports_completed_render_once_without_redraw():
    loop = MAIN[MAIN.index('static InteractiveModeResult runInteractiveMode'):MAIN.index('void setup()')]
    retry = loop[loop.index('uint64_t awaitingAck'):loop.index('uint64_t rendered')]
    assert retry.index('retryRenderedAck') < retry.index('postDeviceStatus(batt, pwr, true)')
    assert retry.index('postDeviceStatus(batt, pwr, true)') < retry.index('refreshContentSignatureBestEffort')
    assert 'renderLoadedDashboard' not in retry
    assert 'fetchAndRenderExplicit' not in retry
    assert retry.count('postDeviceStatus(batt, pwr, true)') == 1

    immediate = loop[loop.index('if (!fetchAndRenderExplicit'):loop.index('// Exactly one cheap revision probe')]
    assert immediate.count('postDeviceStatus(batt, pwr, true)') == 1
    assert immediate.index('retryRenderedAck') < immediate.index('postDeviceStatus(batt, pwr, true)')


def test_manual_timing_diagnostics_and_safe_request_paths_are_present():
    for metric in ('probe_to_pending_ms', 'config_fetch_ms', 'render_total_ms',
                   'display_update_ms', 'ack_ms', 'total_ms'):
        assert f'LiveUpdate timing {metric}=' in MAIN
    assert 'NetClient timing method=%s path=%s status=%d elapsed_ms=%lu' in NET
    assert "url.indexOf('?', pathStart)" in NET
    assert 'bearerToken->c_str()' not in NET
    assert 'Authorization' not in NET[NET.index('Serial.printf('):]


def test_firmware_version_change_redraws_once_and_success_persists_version():
    checker = Path('frame/src/network/UpdateChecker.cpp').read_text()
    assert 'prefs.getString("fw_ver", "") != String(fwVer)' in checker
    maintenance = MAIN[MAIN.index('static void runFirmwareMaintenanceIfNeeded'):MAIN.index('static InteractiveModeResult finishInteractiveMode')]
    assert maintenance.index('shouldForceRedrawForFirmware') < maintenance.index('forceNextFullRefresh(true)')
    assert maintenance.index('renderLoadedDashboard') < maintenance.index('saveFirmwareVersion(FW_VER)')
    assert maintenance.count('saveFirmwareVersion(FW_VER)') == 1
    setup = MAIN[MAIN.index('void setup()'):]
    assert setup.index('runFirmwareMaintenanceIfNeeded') < setup.index('LiveUpdate::probe')
    manual = MAIN[MAIN.index('static bool fetchAndRenderExplicit'):MAIN.index('static bool refreshContentSignatureBestEffort')]
    assert manual.index('renderLoadedDashboard') < manual.index('saveFirmwareVersion(FW_VER)')

def test_recharge_pairing_wifi_and_ota_maintenance_remain():
    for token in ('requiresRecharge', 'ensurePairedNoReboot', 'WiFiManagerV2::connectSaved', 'runOtaCheckIfDue'):
        assert token in MAIN


def test_revision_fields_are_uint64_and_malformed_values_are_rejected():
    header = Path('frame/src/network/LiveUpdate.h').read_text()
    assert header.count('uint64_t') >= 2
    assert 'value.is<bool>()' in LIVE
    assert '!value.is<uint64_t>()' in LIVE
    assert 'displayed > requested' in LIVE
    assert 'if (deserializeJson(doc, body)) {' in LIVE


def test_wifi_reconnect_restores_source_aware_power_policy():
    loop = MAIN[MAIN.index('static InteractiveModeResult runInteractiveMode'):MAIN.index('void setup()')]
    reconnect = loop[loop.index('WiFiManagerV2::connectSaved'):loop.index('Serial.println("LiveUpdate: Wi-Fi reconnected")')]
    assert 'applyOperationalPowerPolicy(pwr.usbPresent, true)' in reconnect
    assert 'WIFI_PS_NONE' not in reconnect
    assert 'connected light sleep is unavailable' in reconnect


def test_probe_and_render_failures_have_bounded_retry_backoff():
    loop = MAIN[MAIN.index('static InteractiveModeResult runInteractiveMode'):MAIN.index('void setup()')]
    assert 'REALTIME_FAILURE_BACKOFF_MS = 5000' in MAIN
    assert 'delay(REALTIME_FAILURE_BACKOFF_MS)' in loop
    assert 'delay(configRetryMs)' in loop
    assert 'configRetryMs = (configRetryMs >= 2500U)' in loop
    assert ': configRetryMs * 2U' in loop


def test_probe_failure_diagnostics_are_safe_and_specific():
    assert 'LiveUpdate probe transport failure' in LIVE
    assert 'LiveUpdate probe HTTP %d' in LIVE
    assert 'LiveUpdate probe invalid JSON' in LIVE
    assert 'LiveUpdate probe invalid revision values' in LIVE
    assert 'Serial.println(body)' not in LIVE


def test_render_persistence_ack_order_and_serial_retry_are_preserved():
    explicit = MAIN[MAIN.index('static bool fetchAndRenderExplicit'):MAIN.index('static InteractiveModeResult runInteractiveMode')]
    assert explicit.index('renderLoadedDashboard') < explicit.index('saveRenderedAwaitingAck')
    assert explicit.index('saveRenderedAwaitingAck') < explicit.index('LiveUpdate::acknowledge')
    loop = MAIN[MAIN.index('static InteractiveModeResult runInteractiveMode'):MAIN.index('void setup()')]
    assert loop.count('fetchAndRenderExplicit(batt, pwr, revisionToDisplay)') == 1
    assert 'if (!fetchAndRenderExplicit' in loop


def test_charger_events_do_not_trigger_or_reset_content_clock():
    setup = MAIN.index('void setup()')
    scheduler = MAIN[MAIN.index('const esp_sleep_wakeup_cause_t wakeCause', setup):MAIN.index('Serial.print("device_id: ")', setup)]
    due = scheduler[scheduler.index('bool normalSyncDue'):scheduler.index('if (normalSyncDue)')]
    assert 'chargerStateChanged' not in due
    assert 'wakeCause == ESP_SLEEP_WAKEUP_UNDEFINED' in due
    assert 'normalSyncElapsedSeconds >= MAX_REVISION_POLL_SECONDS' in due
