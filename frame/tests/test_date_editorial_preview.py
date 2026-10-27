"""F3 preview regression: exact recovered font metrics, no rendering on default.

The source fixture proves the inactive/default gate and geometric fit for
every weekday/month and day on both 4x1 and 2x2 preview compositions.
The real enabled firmware is compiled in its own PlatformIO profile by CI.
"""
from pathlib import Path
import re

FRAME = Path(__file__).resolve().parents[1]
SOURCE = FRAME / "src" / "modules" / "ModuleDate.cpp"
FONT_SOURCE = FRAME / "src" / "assets" / "fonts" / "RemindEditorialFonts.cpp"
PIO = FRAME / "platformio.ini"
WEEKDAYS = ("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December")


def _glyphs(font):
    source = FONT_SOURCE.read_text(encoding="utf-8")
    match = re.search(
        r"static const GFXglyph " + re.escape(font) +
        r"Glyphs\[\] PROGMEM = \{(.*?)\};", source, re.S
    )
    assert match, f"Original GFX glyph array missing: {font}"
    rows = re.findall(
        r"\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(-?\d+),\s*(-?\d+)\s*\}",
        match.group(1),
    )
    assert len(rows) == 224
    return [tuple(map(int, row)) for row in rows]


def _ink(font_glyphs, text):
    advance = 0
    extents = []
    for ch in text:
        cp = ord(ch)
        assert 0x20 <= cp <= 0xFF
        _, w, h, step, ox, oy = font_glyphs[cp - 0x20]
        if w and h:
            extents.append((advance + ox, oy, advance + ox + w, oy + h))
        advance += step
    return (max(e[2] for e in extents) - min(e[0] for e in extents),
            max(e[3] for e in extents) - min(e[1] for e in extents))


def test_preview_off_by_default_and_no_global_switch():
    code = SOURCE.read_text(encoding="utf-8")
    pio = PIO.read_text(encoding="utf-8")
    assert "#define REMIND_F3_DATE_PREVIEW_ENABLED 0" in code
    assert "#if REMIND_F3_DATE_PREVIEW_ENABLED" in code
    assert "if (tryDrawEditorialDatePreview(c, wday, month, year, dayNum)) return;" in code
    assert code.index("if (tryDrawEditorialDatePreview(") < code.index("if (c.size == CELL_ADAPTIVE)")
    assert "const bool shallow = c.size == CELL_SMALL;" in code
    assert "if (!shallow && c.size != CELL_MEDIUM) return false;" in code
    assert "if (!planDatePreviewLine(lines[i], 2)) return false;" in code
    assert "for (int i = 0; i < 4; ++i) drawDatePreviewLine(lines[i]);" in code
    assert "default_envs = alfred_v1_2" in pio
    assert "[env:alfred_v1_2_date_preview]" in pio
    assert "-DREMIND_F3_DATE_PREVIEW_ENABLED=1" in pio
    assert "REMIND_F3_DATE_PREVIEW_ENABLED=1" not in (
        pio.split("[env:alfred_v1_2_date_preview]")[0]
    )


def test_original_bitmap_bounds_fit_all_visible_anchor_positions():
    fonts = {
        "serif": _glyphs("RemindFraunces72"),
        "main": _glyphs("RemindDM24"),
        "small": _glyphs("RemindDM18"),
    }
    # The same x=58..737, y=39..474 visible-pixel intersection as F3.
    # Exercise 4x1 at every row and 2x2 at all 4 anchor placements.
    anchors = [
        (0, y, 800, 120, "4x1") for y in (0, 120, 240, 360)
    ] + [
        (x, y, 400, 240, "2x2")
        for x in (0, 400) for y in (0, 240)
    ]
    examined = 0
    for cell_x, cell_y, cell_w, cell_h, mode in anchors:
        left, top = max(cell_x, 58), max(cell_y, 39)
        right, bottom = min(cell_x + cell_w, 738), min(cell_y + cell_h, 475)
        assert left < right and top < bottom
        if mode == "4x1":
            x, y = left + 4, top + 2
            width = right - left - 8
            height = bottom - top - 2 - 6
            widths = (width * 29 // 100, width * 18 // 100,
                      width * 34 // 100)
            widths = (*widths, width - sum(widths))
            boxes = (
                (widths[0], height, "main", WEEKDAYS),
                (widths[1], height, "serif", tuple(str(v) for v in range(1, 32))),
                (widths[2], height, "main", MONTHS),
                (widths[3], height, "small", ("2026", "2030")),
            )
            box_rects = []
            for w, h, face, labels in boxes:
                box_rects.append((x, y, w, h, face, labels))
                x += w
        else:
            x, y = left + 12, top + 8
            width = right - left - 24
            height = bottom - top - 16
            heights = (height * 16 // 100, height * 20 // 100,
                       height * 42 // 100)
            heights = (*heights, height - sum(heights))
            boxes = (
                (width, heights[0], "small", ("2026", "2030")),
                (width, heights[1], "main", MONTHS),
                (width, heights[2], "serif", tuple(str(v) for v in range(1, 32))),
                (width, heights[3], "main", WEEKDAYS),
            )
            box_rects = []
            for w, h, face, labels in boxes:
                box_rects.append((x, y, w, h, face, labels))
                y += h
        for box_x, box_y, box_w, box_h, face, labels in box_rects:
            for label in labels:
                ink_w, ink_h = _ink(fonts[face], label)
                assert ink_w <= box_w - 4, (mode, cell_x, cell_y, face, label, "width")
                assert ink_h <= box_h - 4, (mode, cell_x, cell_y, face, label, "height")
                # Centering ink box can never draw behind the passepartout.
                ink_x = box_x + (box_w - ink_w) // 2
                ink_y = box_y + (box_h - ink_h) // 2
                assert left <= ink_x <= ink_x + ink_w <= right
                assert top <= ink_y <= ink_y + ink_h <= bottom
                examined += 1
    assert examined >= 400
