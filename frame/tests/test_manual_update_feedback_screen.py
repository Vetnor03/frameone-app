from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INO = (ROOT / "src" / "frame_v2.5.1.ino").read_text(encoding="utf-8")
DISPLAY_H = (ROOT / "src" / "display" / "DisplayCore.h").read_text(encoding="utf-8")
DISPLAY_CPP = (ROOT / "src" / "display" / "DisplayCore.cpp").read_text(encoding="utf-8")


def _explicit_body() -> str:
    start = INO.index("static bool fetchAndRenderExplicit(")
    end = INO.index("static bool refreshContentSignatureBestEffort()", start)
    return INO[start:end]


def test_manual_update_shows_feedback_before_network_fetch():
    body = _explicit_body()
    show = body.index("DisplayCore::drawUpdatingScreen();")
    fetch = body.index("FrameConfigApi::fetchWithStatus")
    assert show < fetch
    assert "if (!g_powerSaverMode)" in body[:show]


def test_updating_screen_is_not_used_by_scheduled_refresh_paths():
    assert INO.count("DisplayCore::drawUpdatingScreen();") == 1


def test_updating_screen_is_full_frame_and_theme_aware():
    assert "void drawUpdatingScreen();" in DISPLAY_H
    start = DISPLAY_CPP.index("void drawUpdatingScreen()")
    end = DISPLAY_CPP.index("void drawRechargeScreen()", start)
    body = DISPLAY_CPP[start:end]
    assert "display.setFullWindow();" in body
    assert "fillThemeBackground();" in body
    assert 'drawCenteredTextInFrame("Updating...", 1);' in body


def test_firmware_version_remains_2_7_2():
    assert 'static const char* FW_VER = "v2.7.2";' in INO
