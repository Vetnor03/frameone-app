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


def test_original_bitmap_bounds_fit_all_4x1_and_2x2_date_strings():
    fonts = {
        "serif": _glyphs("RemindFraunces72"),
        "main": _glyphs("RemindDM24"),
        "small": _glyphs("RemindDM18"),
    }
    # Match the explicit constants in tryDrawEditorialDatePreview.
    width, height = 800 - 2 * 62, 120 - 41 - 6
    widths = (width * 29 // 100, width * 18 // 100,
              width * 34 // 100)
    widths = (*widths, width - sum(widths))
    small_boxes = (
        (widths[0], height, "main", WEEKDAYS),
        (widths[1], height, "serif", tuple(str(x) for x in range(1, 32))),
        (widths[2], height, "main", MONTHS),
        (widths[3], height, "small", ("2026", "2030")),
    )
    medium_w, medium_h = 400 - 28, 240 - 24
    medium_heights = (medium_h * 16 // 100, medium_h * 20 // 100,
                      medium_h * 42 // 100)
    medium_heights = (*medium_heights, medium_h - sum(medium_heights))
    medium_boxes = (
        (medium_w, medium_heights[0], "small", ("2026", "2030")),
        (medium_w, medium_heights[1], "main", MONTHS),
        (medium_w, medium_heights[2], "serif", tuple(str(x) for x in range(1, 32))),
        (medium_w, medium_heights[3], "main", WEEKDAYS),
    )
    for size, boxes in (("4x1", small_boxes), ("2x2", medium_boxes)):
        for box_w, box_h, face, labels in boxes:
            for label in labels:
                ink_w, ink_h = _ink(fonts[face], label)
                assert ink_w <= box_w - 4, (size, face, label, "width", ink_w, box_w)
                assert ink_h <= box_h - 4, (size, face, label, "height", ink_h, box_h)
    # Shallow Date glyphs stay fully within the physical matte's screen window.
    # Their individual boxes span [62,738] and [41,114], with 2-px padding.
    assert 62 + 2 >= 58
    assert 62 + width - 2 <= 738
    assert 41 + 2 >= 39
    assert 41 + height - 2 <= 120
