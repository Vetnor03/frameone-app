"""R2A Date micro: byte-backed font geometry for every physical grid position.

This is a pure metrics contract, not a simulator / physical e-paper golden.
Date R2A remains off in the ordinary production build.
"""
from pathlib import Path
import re

FRAME = Path(__file__).resolve().parents[1]
MODULE = FRAME / "src" / "modules" / "ModuleDate.cpp"
FONTS = FRAME / "src" / "assets" / "fonts" / "RemindEditorialFonts.cpp"
PIO = FRAME / "platformio.ini"
WORKFLOW = FRAME.parent / ".github" / "workflows" / "frame-firmware-build.yml"

WEEKDAYS = ("SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY",
            "THURSDAY", "FRIDAY", "SATURDAY")
DAYS = tuple(str(day) for day in range(1, 32))


def glyphs(name):
    source = FONTS.read_text()
    block = re.search(r"static const GFXglyph " + name +
                      r"Glyphs\[\] PROGMEM = \{(.*?)\};", source, re.S)
    assert block, name
    rows = re.findall(
        r"\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(-?\d+),\s*(-?\d+)\s*\}",
        block.group(1),
    )
    assert len(rows) == 224
    return [tuple(map(int, row)) for row in rows]


def ink_rect(font, text):
    x = 0
    visible = []
    for char in text:
        assert 0x20 <= ord(char) <= 0xFF
        _, w, h, adv, bearing_x, bearing_y = font[ord(char) - 32]
        if w and h:
            visible.append((x + bearing_x, bearing_y,
                            x + bearing_x + w, bearing_y + h))
        x += adv
    assert visible, text
    left = min(b[0] for b in visible)
    top = min(b[1] for b in visible)
    right = max(b[2] for b in visible)
    bottom = max(b[3] for b in visible)
    return right - left, bottom - top


def fits(font, label, box):
    width, height = ink_rect(font, label)
    return width <= box[0] - 4 and height <= box[1] - 4


def test_r2a_explicitly_off_by_default_and_no_global_regression():
    source = MODULE.read_text()
    pio = PIO.read_text()
    workflow = WORKFLOW.read_text()
    assert "#define REMIND_R2A_DATE_MICRO_ENABLED 0" in source
    assert "#if REMIND_R2A_DATE_MICRO_ENABLED && !REMIND_F3_DATE_PREVIEW_ENABLED" in source
    assert "c.size != CELL_ADAPTIVE || c.colSpan != 1 || c.rowSpan != 1" in source
    assert "if (tryDrawEditorialMicroDatePreview(c, wday, dayNum)) return;" in source
    assert "if (tryDrawEditorialDatePreview(c, wday, month, year, dayNum)) return;" in source
    assert "if (!planDatePreviewLine(day, 2)) return false;" in source
    assert "if (showWeekday) drawDatePreviewLine(weekdayLine);" in source
    assert "[env:alfred_v1_2_date_micro_preview]" in pio
    assert "-DREMIND_R2A_DATE_MICRO_ENABLED=1" in pio
    assert "REMIND_R2A_DATE_MICRO_ENABLED=1" not in (
        pio.split("[env:alfred_v1_2_date_micro_preview]")[0]
    )
    assert "pio run -d frame -e alfred_v1_2_date_micro_preview" in workflow


def test_all_16_physical_positions_fit_day_and_weekday_without_mat_overlap():
    fraunces72 = glyphs("RemindFraunces72")
    fraunces48 = glyphs("RemindFraunces48")
    dm18 = glyphs("RemindDM18")
    checked = 0
    for col in range(4):
        for row in range(4):
            left = max(col * 200, 58)
            right = min((col + 1) * 200, 738)
            top = max(row * 120, 39)
            bottom = min((row + 1) * 120, 475)
            x, y = left + 6, top + 4
            width = right - left - 12
            height = bottom - top - 8
            assert width >= 70 and height >= 40

            # R2A reserves the secondary row only after confirming every
            # candidate string can be positioned using real GFX ink data.
            weekday_h, gap = 22, 3
            show_weekday = height >= 63 and all(
                fits(dm18, weekday, (width, weekday_h)) for weekday in WEEKDAYS
            )
            assert show_weekday, (col, row)  # no unknown weekday lost
            day_h = height - weekday_h - gap
            expected_font = fraunces48 if row == 0 else fraunces72
            for day in DAYS:
                assert fits(expected_font, day, (width, day_h)), (col, row, day)
                for weekday in WEEKDAYS:
                    dwidth, dheight = ink_rect(expected_font, day)
                    wwidth, wheight = ink_rect(dm18, weekday)
                    # Check actual centered ink after the precise F2 planner.
                    dx = x + (width - dwidth) // 2
                    dy = y + (day_h - dheight) // 2
                    wx = x + (width - wwidth) // 2
                    wy = y + day_h + gap + (weekday_h - wheight) // 2
                    assert left <= dx < dx + dwidth <= right
                    assert top <= dy < dy + dheight <= bottom
                    assert left <= wx < wx + wwidth <= right
                    assert top <= wy < wy + wheight <= bottom
                    assert dy + dheight < wy, (col, row, day, weekday)
                    checked += 1
    assert checked == 16 * len(DAYS) * len(WEEKDAYS)


def test_one_by_one_does_not_add_month_or_year_and_keeps_legacy_fallback():
    code = MODULE.read_text()
    start = code.index("bool tryDrawEditorialMicroDatePreview(")
    end = code.index("#endif  // REMIND_R2A_DATE_MICRO_ENABLED", start)
    micro = code[start:end]
    assert "month" not in micro.lower()
    assert "year" not in micro.lower()
    assert "dayNum < 1 || dayNum > 31" in micro
    assert "day.font = RemindEditorialFonts::fraunces72();" in micro
    assert "day.font = RemindEditorialFonts::fraunces48();" in micro
    assert "return false;" in micro
    assert "if (c.size == CELL_ADAPTIVE)" in code
