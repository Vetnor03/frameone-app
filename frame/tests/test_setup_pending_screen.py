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


def test_shelf_screen_has_no_bottom_explanatory_footer():
    display = (ROOT / 'src/display/DisplayCore.cpp').read_text()
    shelf = display.split('void drawShelfScreen(', 1)[1].split('} // namespace DisplayCore', 1)[0]
    assert 'Plug in the frame to begin setup' in shelf
    assert 'display.print(idLine);' in shelf
    assert 'This display stays visible without power' not in shelf
    assert 'line4' not in shelf


def test_shelf_welcome_is_centered_and_setup_instruction_is_in_footer():
    display = (ROOT / 'src/display/DisplayCore.cpp').read_text()
    shelf = display.split('void drawShelfScreen(', 1)[1].split('} // namespace DisplayCore', 1)[0]
    assert 'int titleY = FRAME_Y + FRAME_H / 2 - 22;' in shelf
    assert 'int welcomeY = titleY + 56;' in shelf
    for name in ('titleX', 'welcomeX', 'idX', 'infoX'):
        assert f'int {name} = FRAME_X + (FRAME_W - (int)w) / 2 - x1;' in shelf
    assert 'int idY = FRAME_Y + FRAME_H - 62;' in shelf
    assert 'int infoY = FRAME_Y + FRAME_H - 26;' in shelf
    assert shelf.index('display.print(idLine);') < shelf.index('display.print(line3);')
    assert 'welcomeY + 74' not in shelf
