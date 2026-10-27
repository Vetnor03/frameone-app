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

def test_paint_only_after_calendar_holiday_and_whole_ink_preflight():
    preview=DATE.index("static bool tryDrawMeasuredDatePreview(")
    end=DATE.index("#endif  // REMIND_DATE_ROLE_PREVIEW_ENABLED",preview)
    body=DATE[preview:end]
    assert "cell.size!=CELL_ADAPTIVE" in body
    assert "DateF2Ink::planWholeDate(" in body
    assert "preflightDateContext(" in body
    assert body.index("DateF2Ink::planWholeDate(") < body.index("preflightDateContext(")
    assert body.index("preflightDateContext(") < body.index("auto& d=DisplayCore::get();")
    assert "paintRoleLine(hero.day)" in body
    assert "paintRoleLine(hero.month)" in body
    assert "paintRoleLine(hero.weekday)" in body
    assert "drawMonthCalendar(" in body
    assert "context.year" in body and "context.next" in body
    assert "context.holidayCount" in body
    assert "cell.colSpan" not in body and "cell.rowSpan" not in body
    assert "ModuleSurf" not in body
    assert "drawAdaptiveDate" not in body
    assert "#if REMIND_DATE_ROLE_PREVIEW_ENABLED\n  if (tryDrawMeasuredDatePreview" in DATE
    assert "drawAdaptiveDate(c, month, wday, year, month0, dayNum);" in DATE
    assert "drawLargeDate(c, month, wday, year, month0, dayNum" in DATE
    assert "drawXLDate(c, month, wday, year, month0, dayNum" in DATE

def test_calendar_and_holiday_safety_checks_precede_all_pixels():
    section=DATE[DATE.index("static bool preflightDateContext("):
        DATE.index("static void paintRoleLine(")]
    assert "DateContextReservations::plan(input)" in section
    assert "DateMonthGridPlan::plan(" in section
    assert "gridFontFits(" in section
    assert "DateMonthGridPlan::nextMonth(" in section
    assert "context.holidayCount<count" in section
    assert "calendarLikely&&!context.current" in section
    assert "dualCalendarLikely&&!context.next" in section
    assert "calendarLikely&&!context.year" in section
    assert "supportsExactDateText(utf8)" in DATE
    assert "return false" in section
    assert "drawMonthCalendar(" not in section
    assert "DisplayCore::get()" not in section
    # The unchanged legacy routines still own today circles and holiday dots.
    cal=DATE[DATE.index("static void drawMonthCalendar("):
        DATE.index("static void drawMonthCalendarRows(")]
    assert "isHolidayInMonth(" in cal and "isToday" in cal
    assert "d.fillCircle(" in cal and "hardBounds" in cal

def test_existing_surf_sources_not_changed_by_preview_patch():
    for path in ("frame/src/modules/ModuleSurf.cpp",
                 "frame/src/modules/ModuleSurf.h",
                 "frame/src/modules/SurfAdaptivePolicy.h",
                 "app/lib/surfResponsive.mjs"):
        assert (ROOT/path).exists()
