#!/usr/bin/env python3
"""Create isolated F1 GFX font assets from the verified private screen-6 ZIP.

This *developer-only* recovery tool requires an original locally archived ZIP.
It does not download fonts, install anything on test devices, or change Surf.
CI must not be claimed to verify generated assets until RemindEditorialFonts.cpp
has actually been committed (it is not stored on this branch yet).
"""
from __future__ import annotations

import argparse
import hashlib
import pathlib
import re
import zipfile

ZIP_SHA256 = "32a4191d457abcbe7358da4bb60c63320042d7937ac992f5beff762f9221ee73"
HEADER_SHA256 = "e137146a5370a2dca70113a110d40b7a2e9638dfdb4228f733ed4d011fc1769a"
FONT_NAMES = ("RemindFraunces72", "RemindFraunces48", "RemindDM24", "RemindDM18")
BITMAP_SHA256 = {
    "RemindFraunces72": "f0153afa4c6bec182ac04566c0e3d21a6d5dd39905291dd585b38abf71c5d216",
    "RemindFraunces48": "1001c2bcbf3ab7756f2d9dbc3cae16167d420b7284a319fca2afa17bfe579eaa",
    "RemindDM24": "a3ea67d87a83b7f52811992aa28fd71f0ec735c0bda7847cf2f0f1ed971c1033",
    "RemindDM18": "de84365734e30c07a660fb1d2b3607ee5763d15e2ad9c69ee3882575fc8dd690",
}
HEADER = """#pragma once
// F1 isolated fonts. No production module currently references this API.
// License notices: frame/src/assets/fonts/licenses/Fraunces-OFL.txt and DM-Sans-OFL.txt.
#include <Adafruit_GFX.h>

namespace RemindEditorialFonts {
const GFXfont* fraunces72();
const GFXfont* fraunces48();
const GFXfont* dm24();
const GFXfont* dm18();
}
"""

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def extract(original: str, symbol: str) -> tuple[list[str], int]:
    output = []
    for suffix, typename in (("Bitmaps", "uint8_t"), ("Glyphs", "GFXglyph"), ("", "GFXfont")):
        array = r"\[\]" if suffix else ""
        pat = r"static\s+const\s+" + typename + r"\s+" + symbol + suffix + array + r"\s+PROGMEM\s*=\s*\{.*?\};"
        match = re.search(pat, original, re.S)
        if not match:
            raise ValueError(f"Missing {symbol}{suffix} in original ZIP")
        output.append(match.group(0))
    values = bytes(int(s, 16) for s in re.findall(r"0x([0-9a-fA-F]{2})", output[0]))
    if sha256(values) != BITMAP_SHA256[symbol]:
        raise ValueError(f"Original bitmap bytes changed for {symbol}")
    glyphs = re.findall(r"\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(-?\d+),\s*(-?\d+)\s*\}", output[1])
    if len(glyphs) != 224:
        raise ValueError(f"Invalid Latin-1 glyph count {symbol}")
    for codepoint in (0x20, 0xB0, 0xC5, 0xC6, 0xD8, 0xE5, 0xE6, 0xF8):
        offset, width, height, advance, _, _ = map(int, glyphs[codepoint - 0x20])
        if not advance or (codepoint != 0x20 and not (width and height)):
            raise ValueError(f"Empty required glyph {symbol}: {codepoint:x}")
        if offset + (width * height + 7) // 8 > len(values):
            raise ValueError(f"Glyph bitmap out of bounds {symbol}: {codepoint:x}")
    return output, len(values)

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("zip", type=pathlib.Path, help="Original RE-MIND-Fancy-Fonts-Arduino-IDE.zip")
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("frame/src/assets/fonts"))
    args = ap.parse_args()

    if sha256(args.zip.read_bytes()) != ZIP_SHA256:
        raise SystemExit("Unexpected source ZIP: refusing to regenerate original fonts")
    with zipfile.ZipFile(args.zip) as archive:
        original_bytes = archive.read("frame_v2.5.1/EditorialCandidates.h")
    if sha256(original_bytes) != HEADER_SHA256:
        raise SystemExit("Unexpected original EditorialCandidates.h")
    original = original_bytes.decode("utf-8")
    output = [
        "// F1 isolated original screen-6 font rasters, NOT yet used by the renderer.",
        "// Copyright 2018 The Fraunces Project Authors; Copyright the DM Sans Project Authors.",
        "// SIL Open Font License 1.1. Preserve both upstream license files.",
        '#include <Arduino.h>',
        '#include <Adafruit_GFX.h>',
        '#include "RemindEditorialFonts.h"',
    ]
    for font in FONT_NAMES:
        definitions, bitmap_bytes = extract(original, font)
        print(f"{font}: {bitmap_bytes} bitmap bytes, 224 glyphs, SHA verified")
        output.extend(definitions)
    output.extend([
        "namespace RemindEditorialFonts {",
        "const GFXfont* fraunces72() { return &RemindFraunces72; }",
        "const GFXfont* fraunces48() { return &RemindFraunces48; }",
        "const GFXfont* dm24() { return &RemindDM24; }",
        "const GFXfont* dm18() { return &RemindDM18; }",
        "}",
    ])
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "RemindEditorialFonts.h").write_text(HEADER)
    (args.out / "RemindEditorialFonts.cpp").write_text("\n\n".join(output) + "\n")
    print("Assets written; do NOT merge into production without firmware build and full regression.")

if __name__ == "__main__":
    main()
