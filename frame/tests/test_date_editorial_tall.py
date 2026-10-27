"""R2B 1×2 Date: real Fraunces + DM Sans GFX metrics for every placement.

Metric simulation is NOT a physical golden screenshot. The opt-in preview
itself is separately compiled by PlatformIO CI with the same real assets.
"""
from pathlib import Path
import re
from itertools import product

FRAME = Path(__file__).resolve().parents[1]
MODULE = FRAME / "src" / "modules" / "ModuleDate.cpp"
FONTS = FRAME / "src" / "assets" / "fonts" / "RemindEditorialFonts.cpp"
PIO = FRAME / "platformio.ini"
WORKFLOW = FRAME.parent / ".github" / "workflows" / "frame-firmware-build.yml"
WEEKDAYS = ("Sunday", "Monday", "Tuesday", "Wednesday",
            "Thursday", "Friday", "Saturday")
MONTHS = ("January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December")


def font_glyphs(font_name):
    source = FONTS.read_text()
    m = re.search(
        r"static const GFXglyph " + re.escape(font_name) +
        r"Glyphs\[\] PROGMEM = \{(.*?)\};", source, re.S,
    )
    assert m, font_name
    values = re.findall(
        r"\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(-?\d+),\s*(-?\d+)\s*\}",
        m.group(1),
    )
    assert len(values) == 224
    return [tuple(map(int, x)) for x in values]


def ink(glyphs, value):
    pos = 0
    xmin, ymin, xmax, ymax = 9999, 9999, -9999, -9999
    for c in value:
        assert 0x20 <= ord(c) <= 0xFF, repr(value)
        _, w, h, adv, ox, oy = glyphs[ord(c) - 32]
        if w and h:
            xmin = min(xmin, pos + ox)
            xmax = max(xmax, pos + ox + w)
            ymin = min(ymin, oy)
            ymax = max(ymax, oy + h)
        pos += adv
    assert xmax >= xmin and ymax >= ymin
    return xmax - xmin, ymax - ymin


def select_font(fonts, value, names, width, height):
    for name in names:
        ink_w, ink_h = ink(fonts[name], value)
        if ink_w <= width - 4 and ink_h <= height - 4:
            return name, ink_w, ink_h
    return None


def test_only_tall_date_uses_opt_in_engine():
    s = MODULE.read_text()
    ini = PIO.read_text()
    workflow = WORKFLOW.read_text()
    assert "#define REMIND_R2B_DATE_TALL_ENABLED 0" in s
    assert "#if REMIND_R2B_DATE_TALL_ENABLED && !REMIND_F3_DATE_PREVIEW_ENABLED" in s
    assert "c.size != CELL_ADAPTIVE || c.colSpan != 1 || c.rowSpan != 2" in s
    assert "if (tryDrawEditorialTallDatePreview(c, wday, month, year, dayNum)) return;" in s
    assert "if (tryDrawEditorialMicroDatePreview(c, wday, dayNum)) return;" in s
    assert "if (tryDrawEditorialDatePreview(c, wday, month, year, dayNum)) return;" in s
    assert "[env:alfred_v1_2_date_tall_preview]" in ini
    assert "-DREMIND_R2B_DATE_TALL_ENABLED=1" in ini
    assert "REMIND_R2B_DATE_TALL_ENABLED=1" not in (
        ini.split("[env:alfred_v1_2_date_tall_preview]")[0]
    )
    assert "pio run -d frame -e alfred_v1_2_date_tall_preview" in workflow
    src = s[s.index("bool tryDrawEditorialTallDatePreview("):
            s.index("#endif  // REMIND_R2B_DATE_TALL_ENABLED")]
    assert src.index("if (!planDatePreviewLine(wd, 2))") < src.index("drawDatePreviewLine(mo);")
    assert src.index("if (!planDatePreviewLine(day, 2))") < src.index("drawDatePreviewLine(day);")
    assert "if (showYear) drawDatePreviewLine(yr);" in src
    assert "if (h <" not in src or "h < 125" in src


def test_all_12_cell_positions_and_31248_day_weekday_month_combinations():
    faces = {
        n: font_glyphs(n) for n in (
            "RemindFraunces72", "RemindFraunces48", "RemindDM24", "RemindDM18")
    }
    combinations = 0
    month_fallbacks = weekday_fallbacks = 0
    for col, row in product(range(4), range(3)):
        left = max(col * 200, 58)
        right = min((col + 1) * 200, 738)
        top = max(row * 120, 39)
        bottom = min((row + 2) * 120, 475)
        x, y = left + 10, top + 10
        w, h = right - left - 20, bottom - top - 20
        assert w >= 95 and h >= 125
        show_year = h >= 205
        month_h, weekday_h, gap = 34, 33, 8
        year_h = 24 if show_year else 0
        day_h = h - month_h - weekday_h - year_h - (3 if show_year else 2) * gap
        assert day_h >= 58
        assert show_year == (row != 0)
        fact_y = y + (year_h + gap if show_year else 0)
        region = [
            (fact_y, month_h),
            (fact_y + month_h + gap, day_h),
            (fact_y + month_h + gap + day_h + gap, weekday_h)
        ]
        if show_year:
            yr = select_font(faces, "2026", ("RemindDM18",), w, year_h)
            assert yr is not None
            assert y <= y + (year_h - yr[2]) // 2 < y + year_h
        assert region[0][0] >= y
        assert region[-1][0] + weekday_h <= y + h
        for day, weekday, month in product(range(1, 32), WEEKDAYS, MONTHS):
            choices = (
                select_font(faces, month, ("RemindDM24", "RemindDM18"), w, month_h),
                select_font(faces, str(day), ("RemindFraunces72", "RemindFraunces48"), w, day_h),
                select_font(faces, weekday, ("RemindDM24", "RemindDM18"), w, weekday_h),
            )
            assert all(choices), (col, row, day, weekday, month)
            if choices[0][0] == "RemindDM18":
                month_fallbacks += 1
            if choices[2][0] == "RemindDM18":
                weekday_fallbacks += 1

            extents = []
            for (zone_y, zone_h), (_, ink_w, ink_h) in zip(region, choices):
                ink_x = x + (w - ink_w) // 2
                ink_y = zone_y + (zone_h - ink_h) // 2
                assert left < ink_x < ink_x + ink_w < right
                assert top < ink_y < ink_y + ink_h < bottom
                extents.append((ink_y, ink_y + ink_h))
            assert extents[0][1] < extents[1][0]
            assert extents[1][1] < extents[2][0]
            combinations += 1

    assert combinations == 4 * 3 * 31 * 7 * 12 == 31248
    assert month_fallbacks > 0
    assert weekday_fallbacks > 0


def test_no_r2b_changes_to_date_data_or_other_modules():
    code = MODULE.read_text()
    fragment = code[code.index("bool tryDrawEditorialTallDatePreview("):
                    code.index("#endif  // REMIND_R2B_DATE_TALL_ENABLED")]
    assert "holiday" not in fragment
    assert "calend" not in fragment
    assert "g_cfg" not in fragment
    assert "dayNum < 1 || dayNum > 31" in fragment
    assert "if (!planDatePreviewLine(mo, 2)) return false;" in fragment
    assert "if (!planDatePreviewLine(wd, 2)) return false;" in fragment
