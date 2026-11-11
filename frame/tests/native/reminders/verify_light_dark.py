"""Verify real native P4 one-bit Light/Dark raster parity.

Unlike checking equivalent layout parameters, this compares every pixel of the
actual ORIGINAL-GFX-bitmapped C++ renderer output. A dark image must be a true
bitwise complement of its Light counterpart at the same dimensions; BOTH must
agree on selected rows, exact overflow and whether editorial preflight passed.

Usage: python3 frame/tests/native/reminders/verify_light_dark.py
"""
import csv
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

OUTPUT = Path("reminders-native-output")
rows = list(csv.DictReader((OUTPUT / "manifest.csv").open()))
assert len(rows) == 15 * 16 * 2, f"expected 480 scenes, got {len(rows)}"
pairs = defaultdict(dict)
for row in rows:
    key = (row["scenario"], row["cols"], row["rows"])
    assert row["theme"] in {"light", "dark"}
    assert row["theme"] not in pairs[key], f"duplicate: {key} {row['theme']}"
    pairs[key][row["theme"]] = row

assert len(pairs) == 15 * 16
pixel_pairs = 0
fallback_pairs = 0
for key, themed in pairs.items():
    assert len(themed) == 2, f"missing theme: {key}"
    light, dark = themed["light"], themed["dark"]
    for col in ("rendered", "shown", "overflow"):
        assert light[col] == dark[col], f"{key} Light/Dark {col} differs"
    assert light["clipped"] == dark["clipped"] == "0", f"{key} clipped"
    if light["rendered"] != "1":
        fallback_pairs += 1
        assert not light["pbm"] and not dark["pbm"], f"fallback wrote raster: {key}"
        continue

    a = Image.open(OUTPUT / light["pbm"]).convert("L")
    b = Image.open(OUTPUT / dark["pbm"]).convert("L")
    expected_size = (int(light["cols"]) * 200, int(light["rows"]) * 120)
    assert a.size == b.size == expected_size, f"unexpected geometry: {key}"
    assert not ImageChops.difference(ImageOps.invert(a), b).getbbox(), (
        f"Light and Dark differ beyond pixel polarity: {key}"
    )
    pixel_pairs += 1

assert pixel_pairs == 213, f"expected 213 native light/dark pairs, got {pixel_pairs}"
assert fallback_pairs == 27, f"expected 27 matched legacy fallbacks, got {fallback_pairs}"
print(
    f"R3.2 one-bit pixel polarity verified: {pixel_pairs}/213 native pairs, "
    f"{fallback_pairs}/27 matched fallbacks; 16 geometries, 15 scenarios."
)
