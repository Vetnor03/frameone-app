"""R2B/2: Date 2x1 horizontal original-font metrics and opt-in isolation.

Source-derived GFX glyph sizes (not screenshots or physical QA).
The 2x1 target is a separate compile-time opt-in, off on ordinary devices.
"""
from pathlib import Path
import re

FRAME = Path(__file__).resolve().parents[1]
MODULE = FRAME / "src" / "modules" / "ModuleDate.cpp"
FONT_SOURCE = FRAME / "src" / "assets" / "fonts" / "RemindEditorialFonts.cpp"
PIO = FRAME / "platformio.ini"
CI = FRAME.parent / ".github" / "workflows" / "frame-firmware-build.yml"

MONTHS = ("January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December")
WEEKDAYS = ("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday",
            "Friday", "Saturday")


def _glyphs(name):
    source = FONT_SOURCE.read_text(encoding="utf-8")
    block = re.search(r"static const GFXglyph " + name +
                      r"Glyphs\[\] PROGMEM = \{(.*?)\};", source, re.S)
    assert block, name
    rows = re.findall(
        r"\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(-?\d+),\s*(-?\d+)\s*\}",
        block.group(1),
    )
    assert len(rows) == 224
    return [tuple(map(int, row)) for row in rows]


def _ink(font, text):
    cursor = 0
    boxes = []
    for ch in text:
        cp = ord(ch)
        assert 0x20 <= cp <= 0xFF
        _, w, h, adv, dx, dy = font[cp - 0x20]
        if w and h:
            boxes.append((cursor + dx, dy, cursor + dx + w, dy + h))
        cursor += adv
    assert boxes, text
    return (max(x[2] for x in boxes) - min(x[0] for x in boxes),
            max(x[3] for x in boxes) - min(x[1] for x in boxes))


def _centered_ink(font, text, box):
    x, y, width, height = box
    ink_w, ink_h = _ink(font, text)
    assert width >= ink_w + 4, (box, text, "width", ink_w)
    assert height >= ink_h + 4, (box, text, "height", ink_h)
    return (x + (width - ink_w) // 2, y + (height - ink_h) // 2,
            ink_w, ink_h)


def test_wide_date_flag_off_by_default_and_not_shared():
    source = MODULE.read_text()
    pio = PIO.read_text()
    ci = CI.read_text()
    assert "#define REMIND_R2B_DATE_WIDE_ENABLED 0" in source
    assert "#if REMIND_R2B_DATE_WIDE_ENABLED && !REMIND_F3_DATE_PREVIEW_ENABLED" in source
    assert "c.size != CELL_ADAPTIVE || c.colSpan != 2 || c.rowSpan != 1" in source
    assert "if (tryDrawEditorialWideDatePreview(c, wday, month, year, dayNum)) return;" in source
    assert "if (tryDrawEditorialTallDatePreview(c, wday, month, year, dayNum)) return;" in source
    assert "if (!planDatePreviewLine(mo, 2)) return false;" in source
    assert "if (!planDatePreviewLine(wd, 2)) return false;" in source
    assert "if (!planDatePreviewLine(day, 2)) return false;" in source
    assert "[env:alfred_v1_2_date_wide_preview]" in pio
    assert "-DREMIND_R2B_DATE_WIDE_ENABLED=1" in pio
    assert "-DREMIND_R2B_DATE_WIDE_ENABLED=1" not in (
        pio.split("[env:alfred_v1_2_date_wide_preview]")[0]
    )
    assert "pio run -d frame -e alfred_v1_2_date_wide_preview" in ci
    assert "default_envs = alfred_v1_2" in pio


def test_all_12_grid_positions_glyph_fit_and_disjoint_info():
    fonts = {k: _glyphs(k) for k in
             ("RemindFraunces72", "RemindDM24", "RemindDM18")}
    checks = 0
    for col in range(3):
        for row in range(4):
            cell_x, cell_y = col * 200, row * 120
            left, top = max(cell_x, 58), max(cell_y, 39)
            right, bottom = min(cell_x + 400, 738), min(cell_y + 120, 475)
            x, y = left + 6, top + 6
            w, h = right - left - 12, bottom - top - 12
            assert w >= 220 and h >= 63
            day_w = w * 35 // 100
            context_x = x + day_w + 9
            context_w = w - day_w - 9
            assert day_w >= 90 and context_w >= 115
            show_year = h >= 100
            assert show_year == (row != 0)
            month_h, weekday_h, year_h = 35 if show_year else 33, 35 if show_year else 32, 22 if show_year else 0
            group_h = month_h + weekday_h + year_h + (8 if show_year else 4)
            assert group_h <= h
            group_y = y + (h - group_h) // 2

            boxes = (
                (x, y, day_w, h),
                (context_x, group_y, context_w, month_h),
                (context_x, group_y + month_h + 4, context_w, weekday_h),
            )
            year_box = (context_x, group_y + month_h + 4 + weekday_h + 4,
                        context_w, year_h) if show_year else None

            for day in range(1, 32):
                for weekday in WEEKDAYS:
                    for month in MONTHS:
                        dy = _centered_ink(fonts["RemindFraunces72"], str(day), boxes[0])
                        mo = _centered_ink(fonts["RemindDM24"], month, boxes[1])
                        wd = _centered_ink(fonts["RemindDM24"], weekday, boxes[2])
                        for ink in (dy, mo, wd):
                            ix, iy, iw, ih = ink
                            assert left <= ix < ix + iw <= right
                            assert top <= iy < iy + ih <= bottom
                        assert dy[0] + dy[2] < mo[0]
                        assert mo[1] + mo[3] < wd[1]
                        if year_box:
                            yr = _centered_ink(fonts["RemindDM18"], "2026", year_box)
                            assert wd[1] + wd[3] < yr[1]
                            assert top <= yr[1] < yr[1] + yr[3] <= bottom
                        checks += 1
    assert checks == 3 * 4 * 31 * 7 * 12 == 31_248


def test_wide_date_preserves_prior_variants_and_data():
    src = MODULE.read_text()
    a = src.index("bool tryDrawEditorialWideDatePreview(")
    b = src.index("#endif  // REMIND_R2B_DATE_WIDE_ENABLED", a)
    f = src[a:b]
    assert "c.colSpan != 2 || c.rowSpan != 1" in f
    assert "yearH = showYear ? 22 : 0;" in f
    assert "drawDatePreviewLine(day);" in f
    assert "drawDatePreviewLine(mo);" in f
    assert "drawDatePreviewLine(wd);" in f
    assert "if (showYear) drawDatePreviewLine(yr);" in f
    for forbidden in ("g_cfg", "holiday", "calendar", "setRotation", "setFullWindow"):
        assert forbidden not in f
    assert "if (c.size == CELL_ADAPTIVE)" in src
