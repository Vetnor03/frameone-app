import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).parents[1]
MAIN = (ROOT / "src/frame_v2.5.1.ino").read_text()
LIVE = (ROOT / "src/network/LiveUpdate.cpp").read_text()


def test_firmware_translation_units_declare_direct_wifi_dependency():
    tracked_files = subprocess.run(
        ["git", "ls-files", "frame"],
        cwd=ROOT.parent,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    translation_units = {".c", ".cc", ".cpp", ".cxx", ".ino"}

    missing_dependency = []
    for relative_path in tracked_files:
        path = ROOT.parent / relative_path
        if path.suffix not in translation_units:
            continue

        source = path.read_text()
        if re.search(r"WiFi\.|\bWL_CONNECTED\b", source):
            if not re.search(r"^\s*#\s*include\s*<WiFi\.h>", source, re.MULTILINE):
                missing_dependency.append(relative_path)

    assert missing_dependency == []


def test_live_update_declares_its_wifi_dependency():
    assert "#include <WiFi.h>" in LIVE


def test_elapsed_scheduler_is_approximately_15_minutes():
    elapsed = 0
    due_at = []
    for wake in range(1, 61):
        elapsed += 120
        if elapsed >= 900:
            elapsed -= 900
            due_at.append(wake * 120)
    assert due_at[:4] == [960, 1800, 2760, 3600]
    assert all(b - a in (840, 960) for a, b in zip(due_at, due_at[1:]))


def test_probe_wakes_do_not_advance_forced_refresh_counter():
    assert "if (normalSyncDue) UpdateChecker::noteWake();" in MAIN
    assert MAIN.count("UpdateChecker::noteWake();") == 1


def test_failed_live_probe_does_not_block_due_legacy_full_sync():
    probe = MAIN.index("const bool liveProbeOk = LiveUpdate::probe")
    legacy_checks = MAIN.index("UpdateChecker::hasConfigChanged", probe)
    flow = MAIN[probe:legacy_checks]

    # Probe failure only records a log. The only probe-era early-sleep guard is
    # explicitly disabled when the independent normal-sync clock is due.
    assert 'else {\n    Serial.println("LiveUpdate: probe failed");\n  }' in flow
    assert (
        "if (!normalSyncDue && !explicitRevisionPending && "
        "!(liveProbeOk && liveState.appActive))"
    ) in flow

    # A due wake still advances periodic-refresh accounting and reaches OTA
    # gating plus the legacy configuration/change-detection path.
    assert "if (normalSyncDue) UpdateChecker::noteWake();" in flow
    assert "if (normalSyncDue) runOtaCheckIfDue();" in flow
    assert "UpdateChecker::shouldForceRedrawForFirmware" in flow
    assert "UpdateChecker::shouldForcePeriodicRefresh" in flow

    # Without a valid probe, no revision can be pending or ACKed.
    assert "const bool explicitRevisionPending =\n    liveProbeOk &&" in flow
    assert "retryRenderedAck" not in flow.split("} else {", 1)[1]


def test_ack_is_persisted_after_render_and_before_network_ack():
    rendered = MAIN.index("renderLoadedDashboard(batt, pwr)", MAIN.index("fetchAndRenderExplicit"))
    persisted = MAIN.index("LiveUpdate::saveRenderedAwaitingAck(revision)", rendered)
    ack = MAIN.index("LiveUpdate::acknowledge", persisted)
    assert rendered < persisted < ack
    assert 'prefs.putULong64("live_render", revision)' in LIVE


def test_revision_contract_uses_uint64_and_rejects_invalid_shapes():
    assert "uint64_t requestedRevision" in (ROOT / "src/network/LiveUpdate.h").read_text()
    assert "value.is<bool>()" in LIVE
    assert "displayed > requested" in LIVE
