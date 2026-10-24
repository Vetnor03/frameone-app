#!/usr/bin/env python3
"""Compile OFL TrueType faces to one-bit Adafruit GFXfont glyphs (Latin-1).

Only used for the opt-in RE:MIND typography diagnostic. The default firmware
does NOT need external TTFs or carry these generated fonts.
"""
from __future__ import annotations
import argparse
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import ImageFont
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


FONTS = [
    ("RemindDM18", "dm", 18, {"wght": 500, "opsz": 14}),
    ("RemindDM24", "dm", 24, {"wght": 500, "opsz": 14}),
    ("RemindInstrument48", "instrument", 48, None),
    ("RemindInstrument72", "instrument", 72, None),
    ("RemindFraunces48", "fraunces", 48,
     {"wght": 450, "opsz": 48, "SOFT": 20, "WONK": 0}),
    ("RemindFraunces72", "fraunces", 72,
     {"wght": 450, "opsz": 72, "SOFT": 20, "WONK": 0}),
]


def make_gfx_font(name: str, source: Path, size: int, axes: dict | None) -> str:
    with TemporaryDirectory() as dirname:
        actual = source
        if axes:
            font = TTFont(source)
            axes_in_font = {
                axis.axisTag for axis in font["fvar"].axes
            } if "fvar" in font else set()
            selected = {axis: val for axis, val in axes.items()
                        if axis in axes_in_font}
            if selected:
                font = instantiateVariableFont(font, selected, inplace=False)
                actual = Path(dirname) / "static.ttf"
                font.save(actual)
        face = ImageFont.truetype(str(actual), size=size)
        glyphs: list[str] = []
        bitmap = bytearray()
        bit_acc = 0
        bit_count = 0

        def append_bit(value: bool) -> None:
            nonlocal bit_acc, bit_count
            bit_acc = (bit_acc << 1) | int(value)
            bit_count += 1
            if bit_count == 8:
                bitmap.append(bit_acc)
                bit_acc = bit_count = 0

        for code in range(0x20, 0x100):
            char = chr(code)
            offset = len(bitmap)
            if bit_count:
                # GFXglyph bitmapOffset is byte-addressed for each glyph.
                bitmap.append(bit_acc << (8 - bit_count))
                bit_acc = bit_count = 0
                offset = len(bitmap)
            advance = min(255, max(1, round(face.getlength(char))))
            if 0x7F <= code <= 0x9F:
                glyphs.append(f"  {{{offset},0,0,{advance},0,0}},")
                continue
            mask, (x, y) = face.getmask2(char, mode="L", anchor="ls")
            width, height = mask.size
            if width > 255 or height > 255:
                raise ValueError(f"{name} {char!r} glyph outside GFX limits")
            if not (-128 <= x <= 127 and -128 <= y <= 127):
                raise ValueError(f"{name} {char!r} exceeds signed glyph offset")
            pixels = bytes(mask)
            for pixel in pixels:
                append_bit(pixel >= 138)
            if bit_count:
                bitmap.append(bit_acc << (8 - bit_count))
                bit_acc = bit_count = 0
            glyphs.append(f"  {{{offset},{width},{height},{advance},{x},{y}}},"
                          f" // U+{code:04X}")
        line_h = min(255, sum(face.getmetrics()) + 2)
        chars = [f"0x{byte:02X}" for byte in bitmap]
        chunks = [", ".join(chars[i:i + 18]) for i in range(0, len(chars), 18)]
        result = [
            f"// {name}: rasterized Latin-1 bitmap candidate at {size}px.",
            "// Source font: SIL Open Font License 1.1. See docs in repository.",
            f"static const uint8_t {name}Bitmaps[] PROGMEM = {{",
            *["  " + chunk + "," for chunk in chunks],
            "};",
            f"static const GFXglyph {name}Glyphs[] PROGMEM = {{",
            *glyphs,
            "};",
            f"static const GFXfont {name} PROGMEM = {{",
            f"  (uint8_t*){name}Bitmaps, (GFXglyph*){name}Glyphs,",
            f"  0x20, 0xFF, {line_h}",
            "};",
        ]
        return "\n".join(result)


def main() -> None:
    parser = argparse.ArgumentParser()
    for name in ("dm", "instrument", "fraunces"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    chunks = [
        "#pragma once",
        "// Diagnostic-only image assets. Never publish as regular firmware.",
        "// Latin-1 bytes (0x20–0xFF) are supplied by FrameText normalization.",
        "// Instrument Serif: Copyright 2022 The Instrument Serif Project Authors.",
        "// Fraunces: Copyright 2018 The Fraunces Project Authors.",
        "// DM Sans: Copyright the DM Sans Project Authors.",
        "// All used here under the SIL Open Font License, Version 1.1.",
    ]
    for name, family, size, axes in FONTS:
        chunks.append(make_gfx_font(name, getattr(args, family), size, axes))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n\n".join(chunks) + "\n", encoding="utf-8")
    print(f"Wrote {len(FONTS)} one-bit Latin-1 font faces to {args.output}")


if __name__ == "__main__":
    main()
