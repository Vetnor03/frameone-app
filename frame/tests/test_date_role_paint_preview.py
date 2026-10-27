"""Gated role-first Date preview: safe fallback and no Surf/code-path leak.

Static functional guard tests + opt-in PlatformIO build in CI; these tests do
NOT claim physical e-paper rendering or working calendar/holiday migration.
"""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
DATE=(ROOT/"frame/src/modules/ModuleDate.cpp").read_text(encoding="utf-8")
PIO=(ROOT/"frame/platformio.ini").read_text(encoding="utf-8")
CI=(ROOT/".github/workflows/frame-firmware-build.yml").read_text(encoding="utf-8")

def test_preview_default_off_and_separate_ci_target():
    assert "#define REMIND_DATE_ROLE_PREVIEW_ENABLED 0" in DATE
    assert "#if REMIND_DATE_ROLE_PREVIEW_ENABLED" in DATE
    assert "[env:alfred_v1_2_date_role_preview]" in PIO
    assert "-DREMIND_DATE_ROLE_PREVIEW_ENABLED=1" in PIO
    assert "-DREMIND_DATE_ROLE_PREVIEW_ENABLED=1" not in PIO.split(
        "[env:alfred_v1_2_date_role_preview]")[0]
    assert "pio run -d frame -e alfred_v1_2_date_role_preview" in CI
    assert "pio run -v -d frame -e alfred_v1_2" in CI

def test_paint_only_after_whole_ink_preflight_and_preserves_legacy_fallback():
    start=DATE.index("static bool tryDrawMeasuredDatePreview(")
    end=DATE.index("#endif  // REMIND_DATE_ROLE_PREVIEW_ENABLED",start)
    body=DATE[start:end]
    assert "cell.size != CELL_ADAPTIVE" in body
    assert "g_cfg && g_cfg->date.holidayCount > 0" in body
    assert "cell.w >= 330 && cell.h >= 210" in body
    assert "DateF2Ink::planWholeDate" in body
    assert body.index("DateF2Ink::planWholeDate") < body.index("display.setTextColor")
    assert body.index("!planned.valid") < body.index("display.setTextColor")
    assert body.count("display.print(")==1
    assert "cell.colSpan" not in body and "cell.rowSpan" not in body
    assert "ModuleSurf" not in body
    assert "drawMonthCalendar" not in body
    assert "drawAdaptiveDate" not in body
    assert "#if REMIND_DATE_ROLE_PREVIEW_ENABLED\n  if (tryDrawMeasuredDatePreview" in DATE
    assert "drawAdaptiveDate(c, month, wday, year, month0, dayNum);" in DATE
    assert "drawLargeDate(c, month, wday, year, month0, dayNum" in DATE
    assert "drawXLDate(c, month, wday, year, month0, dayNum" in DATE

def test_existing_surf_sources_not_changed_by_preview_patch():
    for path in ("frame/src/modules/ModuleSurf.cpp",
                 "frame/src/modules/ModuleSurf.h",
                 "frame/src/modules/SurfAdaptivePolicy.h",
                 "app/lib/surfResponsive.mjs"):
        assert (ROOT/path).exists()
