from pathlib import Path

ROOT = Path(__file__).parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_power_saver_defaults_off_and_parses_top_level_setting():
    header = read("src/core/FrameConfig.h")
    parser = read("src/core/FrameConfig.cpp")
    assert "bool powerSaver = false;" in header
    assert "out.powerSaver = false;" in parser
    assert 'settings["powerSaver"] | false' in parser


def test_power_saver_persists_across_deep_sleep_and_removes_manual_probe_ceiling():
    source = read("src/frame_v2.5.1.ino")
    assert "RTC_DATA_ATTR static bool g_powerSaverMode = false;" in source
    sleep = source.split("static uint64_t nextDeepSleepDurationUs()", 1)[1].split("static void goToShelfSleep", 1)[0]
    assert "if (!g_powerSaverMode && seconds > SmartRefresh::MANUAL_PROBE_SECONDS)" in sleep


def test_power_saver_skips_live_probe_and_both_interactive_listening_paths():
    source = read("src/frame_v2.5.1.ino")
    setup = source.split("void setup()", 1)[1]
    assert "Power Saver: live update probe skipped" in setup
    assert "if (!g_powerSaverMode) {" in setup
    assert "liveProbeOk = LiveUpdate::probe" in setup

    first_idle = setup.index("if (!normalSyncDue)")
    first_interactive = setup.index("runInteractiveMode(batt, pwr, liveState)", first_idle)
    assert "!g_powerSaverMode" in setup[first_idle:first_interactive]

    final_sync = setup.index("normalSyncDue = false;", first_interactive)
    final_interactive = setup.index("runInteractiveMode(batt, pwr, liveState)", final_sync)
    assert "!g_powerSaverMode" in setup[final_sync:final_interactive]


def test_power_saver_still_uses_scheduled_revision_content_path():
    source = read("src/frame_v2.5.1.ino")
    assert "SmartRefresh::secondsUntilNextWake" in source
    assert "SmartRefresh::dueModuleCsv" in source
    assert "SmartRefresh::probeRevision" in source
