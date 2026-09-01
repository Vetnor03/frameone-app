from pathlib import Path
MAIN = Path('frame/src/frame_v2.5.1.ino').read_text()
LIVE = Path('frame/src/network/LiveUpdate.cpp').read_text()
CHECKER = Path('frame/src/network/UpdateChecker.cpp').read_text()
SIGNATURE = Path('app/api/device/content-signature/route.ts').read_text()

def test_revision_probe_is_one_second_and_idle_is_cheap():
    assert 'static const uint32_t REALTIME_UPDATE_POLL_MS = 1000;' in MAIN
    loop = MAIN[MAIN.index('static InteractiveModeResult runInteractiveMode'):MAIN.index('// --------------------------------------\n// Setup')]
    assert 'delay(REALTIME_UPDATE_POLL_MS);' in loop
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

def test_single_four_hour_content_policy():
    assert 'SCHEDULED_CONTENT_CHECK_SECONDS = 4 * 60 * 60' in MAIN
    assert 'NORMAL_SYNC_SECONDS' not in MAIN
    assert 'WAKES_PER_REFRESH' not in MAIN
    assert 'shouldForcePeriodicRefresh' not in MAIN
    assert 'NORMAL_SYNC_SECONDS = 900' not in MAIN

def test_signature_covers_all_physical_modules_and_sha256():
    for module in ('date','weather','reminders','surf','countdown','soccer','stocks','groceries','assistant'):
        assert f"active.has('{module}')" in SIGNATURE
    assert "createHash('sha256')" in SIGNATURE
    assert 'buildFrameConfigPayload' in SIGNATURE
    assert 'optimizeFrameContent' not in SIGNATURE

def test_scheduled_same_signature_does_not_render_and_change_forces_full_refresh():
    scheduled = MAIN[MAIN.index('String nextSignature;'):MAIN.index('normalSyncDue = false;', MAIN.index('String nextSignature;'))]
    same = scheduled[scheduled.index('nextSignature =='):scheduled.index('} else {', scheduled.index('nextSignature =='))]
    assert 'renderLoadedDashboard' not in same
    assert 'postDeviceStatus(batt, pwr, false)' in same
    assert 'DisplayCore::forceNextFullRefresh(true)' in scheduled
    assert scheduled.index('renderLoadedDashboard') < scheduled.index('saveContentSignature(nextSignature)')

def test_signature_failure_preserves_display_and_backs_off():
    scheduled = MAIN[MAIN.index('String nextSignature;'):]
    failed = scheduled[:scheduled.index('} else if')]
    assert 'renderLoadedDashboard' not in failed
    assert 'preserving display' in failed

def test_manual_render_updates_signature_without_blocking_ack():
    explicit = MAIN[MAIN.index('static bool fetchAndRenderExplicit'):MAIN.index('static bool retryRenderedAck')]
    assert explicit.index('saveRenderedAwaitingAck') < explicit.index('fetchContentSignature')
    assert 'rendered content signature could not be persisted' in explicit

def test_recharge_pairing_wifi_and_ota_maintenance_remain():
    for token in ('requiresRecharge', 'ensurePairedNoReboot', 'WiFiManagerV2::connectSaved', 'runOtaCheckIfDue'):
        assert token in MAIN
