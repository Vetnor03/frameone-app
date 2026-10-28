"""Default-OFF factual editorial Date paint integration guard.

Physical output is not proven by compile/shape QA; rollback and on-frame
visual acceptance are separate hard gates.
"""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
DATE=(ROOT/"frame/src/modules/ModuleDate.cpp").read_text()
PIO=(ROOT/"frame/platformio.ini").read_text()
CI=(ROOT/".github/workflows/frame-firmware-build.yml").read_text()

def test_explicit_separate_feature_flag_and_only_ci_preview_enabled():
    assert "#define REMIND_DATE_EDITORIAL_PREVIEW_ENABLED 0" in DATE
    assert "#if REMIND_DATE_EDITORIAL_PREVIEW_ENABLED" in DATE
    assert "DateEditorialF2Adapter.h" in DATE
    assert "#error \"Editorial preview needs measured role preview" in DATE
    assert "[env:alfred_v1_2_date_editorial_preview]" in PIO
    assert "-DREMIND_DATE_EDITORIAL_PREVIEW_ENABLED=1" in PIO
    assert "-DREMIND_DATE_EDITORIAL_PREVIEW_ENABLED=1" not in PIO.split(
        "[env:alfred_v1_2_date_editorial_preview]")[0]
    assert "pio run -d frame -e alfred_v1_2_date_editorial_preview" in CI

def test_calendar_and_all_text_preflight_before_any_pixels():
    region=DATE[DATE.index("static bool tryDrawEditorialDatePreview("):
                DATE.index("#endif // REMIND_DATE_EDITORIAL_PREVIEW_ENABLED")]
    assert "DateEditorialF2::plan(" in region
    assert "DateMonthGridPlan::plan(" in region
    assert "gridFontFits(grid)" in region
    assert "radius<11" in region
    first_draw=region.index("auto& d=DisplayCore::get();")
    assert region.index("DateEditorialF2::plan(")<first_draw
    assert region.index("DateMonthGridPlan::plan(")<first_draw
    assert region.index("gridFontFits(grid)")<first_draw
    assert region.index("radius<11")<first_draw
    for fact in ("candidate.year","candidate.month","candidate.day",
                 "candidate.weekday"):
        assert "paintEditorialText("+fact+")" in region
    assert "drawMonthCalendar(" in region
    assert "d.drawCircle(cx,cy,radius,Theme::ink())" in region
    assert "if(p.art)paintEditorialSprig(p.botanical)" in region
    assert "cell.colSpan" not in region
    assert "cell.rowSpan" not in region

def test_legacy_calendar_and_holiday_data_not_silently_removed():
    preview=DATE[DATE.index("static bool tryDrawEditorialDatePreview("):
                 DATE.index("#endif // REMIND_DATE_EDITORIAL_PREVIEW_ENABLED")]
    assert "cell.w>=700&&cell.h>=330" in preview
    assert "cell.w>=520&&cell.h>=400" in preview
    assert "g_cfg&&g_cfg->date.holidayCount>0" in preview
    assert "return false; // Preserve legacy expanded current+next-month" in preview
    render=DATE[DATE.index("static void renderDate("):]
    assert "#if REMIND_DATE_EDITORIAL_PREVIEW_ENABLED" in render
    assert "tryDrawEditorialDatePreview(c,wday,month,year,month0,dayNum)" in render
    assert "drawAdaptiveDate(c, month, wday, year, month0, dayNum);" in render
    assert render.index("tryDrawEditorialDatePreview")<render.index("drawAdaptiveDate(")
    assert "#else\n#if REMIND_DATE_ROLE_PREVIEW_ENABLED" in render
    # In the editorial-only target, failed editorial admission must go
    # STRAIGHT to the untouched legacy renderer, not to the old 3-role proof.
    assert render.index("#else\n#if REMIND_DATE_ROLE_PREVIEW_ENABLED") < render.index("tryDrawMeasuredDatePreview")

def test_art_is_deterministic_bounded_original_strokes():
    area=DATE[DATE.index("static void paintEditorialSprig("):
              DATE.index("static void paintEditorialText(")]
    assert "box.x+x0*box.w/84" in area
    assert "box.y+y0*box.h/88" in area
    assert "stroke" not in area  # visual SVG not copied as runtime source
    assert "d.drawLine(" in area
    assert "DisplayCore::get()" in area
    assert "ModuleSurf" not in area
