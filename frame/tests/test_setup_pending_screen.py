from pathlib import Path

ROOT = Path(__file__).parents[1]
LOOP = (ROOT / 'src/frame_v2.5.1.ino').read_text()
CONFIG = (ROOT / 'src/core/FrameConfig.cpp').read_text()
SCREEN = (ROOT / 'src/display/ScreenPairing.cpp').read_text()


def test_setup_pending_is_a_distinct_fetch_result():
    assert 'FETCH_SETUP_PENDING' in CONFIG
    assert 'waiting_for_setup' in CONFIG


def test_waiting_screen_is_retained_across_short_wakes():
    assert 'RTC_DATA_ATTR static bool setupPendingScreenDisplayed = false' in LOOP
    assert 'if (!setupPendingScreenDisplayed)' in LOOP
    assert 'skipping e-paper redraw' in LOOP
    assert 'setupPendingScreenDisplayed = false' in LOOP
    assert 'Waiting for setup' in SCREEN
