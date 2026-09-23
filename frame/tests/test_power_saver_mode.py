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


def test_power_saver_removes_both_routine_polling_ceilings():
    source = read("src/frame_v2.5.1.ino")
    smart_h = read("src/core/SmartRefresh.h")
    smart_cpp = read("src/core/SmartRefresh.cpp")

    assert "RTC_DATA_ATTR static bool g_powerSaverMode = false;" in source
    sleep = source.split("static uint64_t nextDeepSleepDurationUs()", 1)[1].split(
        "static void goToShelfSleep", 1
    )[0]
    assert "SmartRefresh::secondsUntilNextWake" in sleep
    assert "!g_powerSaverMode && seconds > SmartRefresh::MANUAL_PROBE_SECONDS" in sleep
    assert "bool includeRevisionSafety = true" in smart_h
    assert "includeRevisionSafety && revisionCheckedAt > 0" in smart_cpp


def test_power_saver_skips_live_probe_and_interactive_listening():
    source = read("src/frame_v2.5.1.ino")
    setup = source.split("void setup()", 1)[1]

    assert "Power Saver: live update probe skipped" in setup
    assert "if (!g_powerSaverMode) {" in setup
    assert "liveProbeOk = LiveUpdate::probe" in setup
    assert setup.count("!g_powerSaverMode &&\n      runInteractiveMode") >= 2


def test_power_saver_applies_current_app_setting_on_every_planned_wake():
    source = read("src/frame_v2.5.1.ino")
    setup = source.split("void setup()", 1)[1]
    config_fetch = setup.index("FrameConfigApi::fetchWithStatus(g_cfg")
    apply_mode = setup.index("setPowerSaverMode(g_cfg.powerSaver)", config_fetch)
    revision_probe = setup.index("SmartRefresh::probeRevision", apply_mode)

    assert config_fetch < apply_mode < revision_probe


def test_switching_into_power_saver_leaves_interactive_mode_after_commit():
    source = read("src/frame_v2.5.1.ino")
    interactive = source.split("static InteractiveModeResult runInteractiveMode(", 1)[1].split(
        "void setup()", 1
    )[0]

    committed = interactive.index("setPowerSaverMode(g_cfg.powerSaver);")
    exit_log = interactive.index(
        "Power Saver: explicit update committed; leaving interactive mode for deep sleep"
    )
    return_finished = interactive.index("return INTERACTIVE_FINISHED;", exit_log)
    assert committed < exit_log < return_finished


def test_ten_minute_normal_sync_counter_is_disabled_in_power_saver():
    source = read("src/frame_v2.5.1.ino")
    setup = source.split("void setup()", 1)[1]
    assert "wakeCause == ESP_SLEEP_WAKEUP_TIMER && !g_powerSaverMode" in setup
    assert "!g_powerSaverMode && normalSyncElapsedSeconds >= MAX_REVISION_POLL_SECONDS" in setup
