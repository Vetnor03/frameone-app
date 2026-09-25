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


def test_updating_screen_prefers_small_partial_update_and_keeps_full_fallback():
    assert "void drawUpdatingScreen();" in DISPLAY_H
    start = DISPLAY_CPP.index("void drawUpdatingScreen()")
    end = DISPLAY_CPP.index("void drawRechargeScreen()", start)
    body = DISPLAY_CPP[start:end]
    partial = body.index("beginPartialUpdate(boxX, boxY, boxW, boxH, false)")
    fallback = body.index("display.setFullWindow();")
    assert partial < fallback
    assert "const int boxW = 220;" in body
    assert "const int boxH = 64;" in body
    assert "display.fillRect(boxX, boxY, boxW, boxH, Theme::paper());" in body
    assert 'const char* text = "Updating...";' in body
    assert "display.drawRoundRect" in body
    assert 'drawCenteredTextInFrame("Updating...", 1);' in body


def test_firmware_version_remains_2_7_2():
    assert 'static const char* FW_VER = "v2.7.2";' in INO
