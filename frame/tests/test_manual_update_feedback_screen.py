from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INO = (ROOT / "src" / "frame_v2.5.1.ino").read_text(encoding="utf-8")
DISPLAY_H = (ROOT / "src" / "display" / "DisplayCore.h").read_text(encoding="utf-8")
DISPLAY_CPP = (ROOT / "src" / "display" / "DisplayCore.cpp").read_text(encoding="utf-8")


def _explicit_body() -> str:
    start = INO.index("static bool fetchAndRenderExplicit(")
    end = INO.index("static bool refreshContentSignatureBestEffort()", start)
    return INO[start:end]


def test_manual_update_starts_network_fetch_before_feedback_and_joins_before_render():
    body = _explicit_body()
    worker_start = body.index("xTaskCreatePinnedToCore(")
    show = body.index("DisplayCore::drawUpdatingScreen();")
    join = body.index("ulTaskNotifyTake(pdTRUE, portMAX_DELAY)")
    render = body.index("SmartDisplayPlan displayPlan = SmartRefresh::plan")
    assert worker_start < show < join < render
    assert "if (interactiveModeEnabled(pwr.usbPresent))" in body[:show]
    assert "FrameConfigApi::fetchWithStatus(g_cfg, DeviceIdentity::getToken())" in body
    assert "if (!parallelFetch)" in body
    assert "manualUpdatePrefetchTask" in INO
    assert "FrameConfigApi::fetchWithStatus(job->stagedConfig, job->token)" in INO


def test_updating_screen_is_not_used_by_scheduled_refresh_paths():
    assert INO.count("DisplayCore::drawUpdatingScreen();") == 1


def test_updating_screen_uses_full_panel_redraw_without_partial_overlay():
    assert "void drawUpdatingScreen();" in DISPLAY_H
    start = DISPLAY_CPP.index("void drawUpdatingScreen()")
    end = DISPLAY_CPP.index("void drawRechargeScreen()", start)
    body = DISPLAY_CPP[start:end]
    assert "beginFrameUpdate();" in body
    assert "fillThemeBackground();" in body
    assert 'drawCenteredTextInFrame("Updating...", 1);' in body
    assert "nextFrameUpdate()" in body
    assert "beginPartialUpdate" not in body
    assert "drawRoundRect" not in body


def test_firmware_version_is_2_7_2():
    assert 'static const char* FW_VER = "v2.7.2";' in INO
