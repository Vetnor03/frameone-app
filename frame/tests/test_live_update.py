import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).parents[1]
MAIN = (ROOT / "src/frame_v2.5.1.ino").read_text()
LIVE = (ROOT / "src/network/LiveUpdate.cpp").read_text()
INTERACTIVE = MAIN[MAIN.index("static InteractiveModeResult runInteractiveMode"):MAIN.index("// --------------------------------------\n// Setup")]


def test_firmware_translation_units_declare_direct_wifi_dependency():
    tracked = subprocess.run(["git", "ls-files", "frame"], cwd=ROOT.parent, check=True,
                             capture_output=True, text=True).stdout.splitlines()
    missing = []
    for relative in tracked:
        path = ROOT.parent / relative
        if path.suffix not in {".c", ".cc", ".cpp", ".cxx", ".ino"}:
            continue
        source = path.read_text()
        if re.search(r"WiFi\.|\bWL_CONNECTED\b", source) and not re.search(
                r"^\s*#\s*include\s*<WiFi\.h>", source, re.MULTILINE):
            missing.append(relative)
    assert missing == []


def test_live_update_declares_its_wifi_dependency():
    assert "#include <WiFi.h>" in LIVE


def test_realtime_test_mode_is_explicit_and_enabled_at_one_second():
    assert "static const bool REALTIME_TEST_MODE = true;" in MAIN
    assert "static const uint32_t REALTIME_UPDATE_POLL_MS = 1000;" in MAIN
    assert "delay(REALTIME_UPDATE_POLL_MS);\n    LiveUpdateState next{};" in INTERACTIVE


def test_paired_realtime_loop_does_not_gate_on_app_active_or_finish_when_inactive():
    assert "while (true)" in INTERACTIVE
    assert "if (!state.appActive" not in INTERACTIVE
    assert "activity expired" not in INTERACTIVE
    assert "REALTIME_TEST_MODE || (liveProbeOk && liveState.appActive)" in MAIN


def test_realtime_paired_flow_bypasses_normal_sleep():
    assert "if (!REALTIME_TEST_MODE) goToSleep(pwr.usbPresent);" in MAIN
    initial_gate = MAIN[MAIN.index("bool explicitRevisionPending"):MAIN.index("run_normal_sync:")]
    assert "if (!REALTIME_TEST_MODE &&" in initial_gate
    assert "goToShelfSleep" not in INTERACTIVE
    assert "goToRechargeSleep" not in INTERACTIVE


def test_idle_loop_only_uses_cheap_live_update_probe():
    cadence = INTERACTIVE[INTERACTIVE.index("delay(REALTIME_UPDATE_POLL_MS)"):]
    assert "LiveUpdate::probe(DeviceIdentity::getToken(), next)" in cadence
    assert "FrameConfigApi::fetchWithStatus" not in cadence
    assert "postDeviceStatus" not in cadence


def test_new_revision_uses_existing_serial_physical_render_pipeline():
    pending = INTERACTIVE.index("state.requestedRevision > state.displayedRevision")
    render = INTERACTIVE.index("fetchAndRenderExplicit(batt, pwr, revisionToDisplay)", pending)
    ack = INTERACTIVE.index("retryRenderedAck(state.displayedRevision)", render)
    probe = INTERACTIVE.index("LiveUpdate::probe(DeviceIdentity::getToken(), next)", ack)
    adopt = INTERACTIVE.index("state = next", probe)
    assert pending < render < ack < probe < adopt
    explicit = MAIN[MAIN.index("static bool fetchAndRenderExplicit"):MAIN.index("static bool retryRenderedAck")]
    assert "FrameConfigApi::fetchWithStatus" in explicit
    assert explicit.index("renderLoadedDashboard") < explicit.index("LiveUpdate::saveRenderedAwaitingAck")


def test_displayed_revision_is_durable_and_acked_only_after_render():
    render = MAIN.index("renderLoadedDashboard(batt, pwr)", MAIN.index("fetchAndRenderExplicit"))
    persist = MAIN.index("LiveUpdate::saveRenderedAwaitingAck(revision)", render)
    ack = MAIN.index("LiveUpdate::acknowledge", persist)
    assert render < persist < ack
    assert 'prefs.putULong64("live_render", revision)' in LIVE


def test_awake_elapsed_time_makes_normal_sync_due_every_900_seconds():
    assert "static const uint32_t NORMAL_SYNC_SECONDS = 900;" in MAIN
    assert "baselineElapsedAtEntry + awakeSeconds >= NORMAL_SYNC_SECONDS" in INTERACTIVE
    assert "normalSyncElapsedSeconds = baselineElapsedAtEntry + awakeSeconds" in MAIN
    assert "consumeNormalSyncPeriod();\n        goto run_normal_sync;" in MAIN
    assert 600 + 300 == 900


def test_normal_sync_returns_to_polling_not_sleep_in_realtime_mode():
    no_redraw = MAIN[MAIN.index("// ---------------- No redraw"):MAIN.index("// ---------------- Redraw")]
    assert "REALTIME_TEST_MODE || (liveProbeOk && liveState.appActive)" in no_redraw
    applied = MAIN[MAIN.index('Serial.println("✅ Applied")'):]
    assert "REALTIME_TEST_MODE || (liveProbeOk && liveState.appActive)" in applied
    assert "runInteractiveMode" in no_redraw and "runInteractiveMode" in applied


def test_probe_and_network_failures_back_off_without_sleep():
    assert "static const uint32_t REALTIME_FAILURE_BACKOFF_MS = 5000;" in MAIN
    assert "WiFiManagerV2::connectSaved(12000)" in INTERACTIVE
    failure = INTERACTIVE[INTERACTIVE.index("if (!LiveUpdate::probe"):]
    assert "delay(REALTIME_FAILURE_BACKOFF_MS - REALTIME_UPDATE_POLL_MS)" in failure
    assert "goToSleep" not in failure
    assert "return finishInteractiveMode" not in failure


def test_special_safety_and_setup_sleep_paths_remain():
    assert "if (battEarly.requiresRecharge)" in MAIN
    assert "showRechargeAndSleep(battEarly, pwrEarly);" in MAIN
    assert "static void goToRechargeSleep" in MAIN
    assert "static void goToShelfSleep" in MAIN
    assert "showPairingShelfAndSleep" in MAIN
    assert "PairingResult pairing = ensurePairedNoReboot" in MAIN


def test_legacy_ten_second_sleep_policy_remains_available_but_not_realtime_cadence():
    assert "static const uint32_t PROBE_WAKE_SECONDS = 10;" in MAIN
    assert "goToSleepForUs(PROBE_WAKE_US, usbPresent);" in MAIN
    assert "delay(PROBE_WAKE_SECONDS" not in INTERACTIVE
