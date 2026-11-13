#!/usr/bin/env python3
"""Countdown R3: compile production C++ drawing + original GFX bitmaps on host.

Produces native one-bit 800x480 framebuffer frames, 4x4 geometry contact
sheets, CSV diagnostics and a markdown QA summary. PIL is used only to
assemble the resulting C++-rendered pixels, never to paint production text.
"""
from __future__ import annotations

import argparse
import csv
import io
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

FRAME = Path(__file__).resolve().parents[1]
ROOT = FRAME.parent
SOURCE = FRAME / "src/modules/ModuleCountdown.cpp"
HOST = FRAME / "tests/countdown_native/host.cpp"
FONTS = FRAME / "src/assets/fonts"
INCLUDE = FRAME / "tests/countdown_native/include"

HELPERS = [
    "safeCopy", "measureText", "textWidth", "fontLineHeight", "drawLeft",
    "drawCenteredLine", "fitTextToWidth", "parseYMD10", "getLocalTmQuick",
    "drawEmptyState", "countdownItemLess", "sortCacheItems", "findNearestIdx",
    "formatDaysNumber", "formatDaysUnit", "drawTopCenteredLine"
]


def extract_function(source: str, name: str) -> str:
    # Anchored to an actual function declaration rather than a call site.
    pattern = re.compile(r"(?m)^static\s+[^{;\n]+?\b" + re.escape(name) + r"\s*\(")
    match = pattern.search(source)
    if not match:
        raise ValueError(f"Production function absent: {name}")
    begin = source.index("{", match.end())
    depth = 0
    for pos in range(begin, len(source)):
        if source[pos] == "{":
            depth += 1
        elif source[pos] == "}":
            depth -= 1
            if depth == 0:
                return source[match.start():pos + 1] + "\n"
    raise ValueError(f"Production function unterminated: {name}")


def extract_between(source: str, a: str, b: str) -> str:
    start = source.find(a)
    end = source.find(b, start + len(a))
    if start < 0 or end < 0:
        raise ValueError(f"Source markers missing: {a} / {b}")
    return source[start:end]


def construct_cpp() -> str:
    src = SOURCE.read_text(encoding="utf-8")
    # Use exact production semantics, not duplicate sorting/layout rules.
    helpers = "\n".join(extract_function(src, n) for n in HELPERS)
    calendar = extract_between(src, "// XL sketch/calendar helpers", "// Small line builder")
    adaptive = extract_between(src, "// Exact-pixel adaptive renderer",
                               "// The opt-in header is included")
    host = HOST.read_text(encoding="utf-8")
    for marker, value in [
        ("// === EXTRACTED_PRODUCTION_HELPERS ===", helpers),
        ("// === EXTRACTED_PRODUCTION_CALENDAR ===", calendar),
        ("// === EXTRACTED_PRODUCTION_ADAPTIVE ===", adaptive),
    ]:
        if host.count(marker) != 1:
            raise ValueError(f"Missing exactly one host insertion point: {marker}")
        host = host.replace(marker, value)
    return host


def make_gallery(path: Path, scenario: str, theme: str, rows: list[dict]) -> None:
    margin = 20
    image_w, image_h = 400, 240
    label_h = 32
    canvas = Image.new("RGB", (margin + 4 * (image_w + margin),
                              margin + 4 * (image_h + label_h + margin)),
                       "#e8e8e8")
    painter = ImageDraw.Draw(canvas)
    by_geometry = {(int(item["cols"]), int(item["rows"])): item for item in rows}
    for height in range(1, 5):
        for width in range(1, 5):
            row = by_geometry[(width, height)]
            source = path / "raw" / f"{scenario}_{theme}_{width}x{height}.pgm"
            with Image.open(source) as image:
                original = image.convert("RGB")
            # Content was rasterized in C++; this is display-only scaling.
            thumb = original.resize((image_w, image_h), Image.Resampling.NEAREST)
            x = margin + (width - 1) * (image_w + margin)
            y = margin + (height - 1) * (image_h + label_h + margin)
            canvas.paste(thumb, (x, y))
            # Non-production labels, not included in the framebuffer.
            painter.rectangle((x, y, x + width * 100 - 1, y + height * 60 - 1),
                              outline="#9b9b9b", width=1)
            label = (f"{width}x{height}   "
                     f"{'EDITORIAL' if int(row['preview']) else 'LEGACY FALLBACK'}")
            painter.text((x + 4, y + image_h + 5), label, fill="#292929")
    canvas.save(path / f"contact-{scenario}-{theme}.png")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "countdown-r3-gallery")
    args = parser.parse_args()
    out = args.output.resolve()
    raw = out / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    cpp = out / "native.cpp"
    binary = out / "native"
    cpp.write_text(construct_cpp(), encoding="utf-8")
    cmd = ["g++", "-std=gnu++17", "-O2", "-Wall", "-Wextra",
           "-Wno-unused-function", "-Wno-unused-variable",
           "-I", str(INCLUDE), "-I", str(FONTS),
           "-I", str(FRAME / "src/modules"),
           str(cpp), str(FONTS / "RemindEditorialFonts.cpp"),
           "-o", str(binary)]
    print("Compiling production C++ GFX render with native font data", flush=True)
    subprocess.run(cmd, check=True)
    csv_text = subprocess.check_output([str(binary), str(raw)], text=True)
    (out / "measurements.csv").write_text(csv_text, encoding="utf-8")
    records = list(csv.DictReader(io.StringIO(csv_text)))
    scenarios = list(dict.fromkeys(row["scenario"] for row in records))
    assert len(records) == len(scenarios) * 16 * 2
    report = ["# Countdown R3 - native 1-bit QA",
              "",
              "Pixel source: current CountdownEditorialPreview.h, exact",
              "production helper/calendar/adaptive C++ extracted from",
              "ModuleCountdown.cpp, original checked-in Fraunces/DM Sans",
              "and FreeSans GFX glyph bitmap data (NO CSS fonts).",
              "Display: 800x480, 4x4 200x120 pixel cells, Light and Dark.",
              "Date fixture: 13 November 2026. Grids/labels are contact-sheet",
              "annotations only, not part of the native framebuffer.",
              "",
              "| Scenario | Editorial / 32 | Fallback / 32 | Out-of-cell pixels |",
              "|---|---:|---:|---:|"]
    failures = []
    for scenario in scenarios:
        subset = [row for row in records if row["scenario"] == scenario]
        preview = sum(int(row["preview"]) for row in subset)
        fallbacks = 32 - preview
        escapes = sum(int(row["escaped"]) + int(row["offscreen"]) for row in subset)
        report.append(f"| {scenario} | {preview} | {fallbacks} | {escapes} |")
        for theme in ("light", "dark"):
            make_gallery(out, scenario, theme,
                         [row for row in subset if row["theme"] == theme])
    for row in records:
        if int(row["preview"]) and (
                int(row["escaped"]) or int(row["offscreen"])
                or int(row["ink_pixels"]) == 0):
            failures.append(
                f"{row['scenario']} {row['theme']} {row['cols']}x{row['rows']}: "
                f"escaped={row['escaped']} offscreen={row['offscreen']} "
                f"ink={row['ink_pixels']}"
            )
    report += ["", "## Pixel-guard failures",
               *(["- " + error for error in failures]
                 if failures else ["None in the active editorial render paths."]),
               "", "Individual raw 800x480 PGM files are included for forensic QA.",
               "Fallback rows render existing production adaptive code."]
    (out / "QA.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print("\n".join(report), flush=True)
    if failures:
        raise SystemExit(f"R3 detected {len(failures)} editorial pixel defects")


if __name__ == "__main__":
    main()
