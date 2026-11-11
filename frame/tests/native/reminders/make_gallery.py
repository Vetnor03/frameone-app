"""Convert native 1-bit PBM renders to review PNGs without rerasterizing fonts.

The original PBM files remain in the CI artifact as native, unscaled output.
Contact sheets only arrange those images; individual PNGs retain 1:1 pixels.
"""
import csv
from pathlib import Path
from PIL import Image, ImageDraw

root = Path("reminders-native-output")
records = list(csv.DictReader((root / "manifest.csv").open()))
(root / "png").mkdir(exist_ok=True)

for record in records:
    if record["rendered"] != "1":
        continue
    pbm = root / record["pbm"]
    img = Image.open(pbm).convert("1")
    img.save(root / "png" / (pbm.stem + ".png"), optimize=True)

for scenario in ("single", "few", "normal", "six", "long", "many", "tomorrow",
                 "norwegian", "future", "overdue", "distant", "mixed",
                 "unbreakable", "empty", "unavailable"):
    for theme in ("light", "dark"):
        background = "white" if theme == "light" else "black"
        foreground = "black" if theme == "light" else "white"
        tile_w, tile_h = 820, 520
        sheet = Image.new("RGB", (4 * tile_w, 4 * tile_h), background)
        draw = ImageDraw.Draw(sheet)
        selected = [
            row for row in records
            if row["scenario"] == scenario and row["theme"] == theme
        ]
        for row in selected:
            cols, rows = int(row["cols"]), int(row["rows"])
            ox, oy = (cols - 1) * tile_w, (rows - 1) * tile_h
            title = f"{cols} × {rows} · {cols * 200}×{rows * 120}px"
            draw.text((ox + 10, oy + 10), title, fill=foreground)
            if row["rendered"] == "1":
                img = Image.open(root / "png" / (Path(row["pbm"]).stem + ".png")).convert("RGB")
                # Unscaled native 1-bit raster, centered inside its tile.
                sheet.paste(img, (ox + (tile_w - img.width) // 2,
                                  oy + 35 + (tile_h - 45 - img.height) // 2))
            else:
                draw.text((ox + 18, oy + 80), "PREVIEW PREFLIGHT FAILED — LEGACY FALLBACK",
                          fill=foreground)
        sheet.save(root / f"review_{scenario}_{theme}.png", optimize=True)

print(f"Rasterized {sum(row['rendered'] == '1' for row in records)}/{len(records)} native scenes")
print(f"Unsafe out-of-bounds pixels: {sum(int(row['clipped']) for row in records)}")
print("Original 1-bit PBM, 1:1 PNG, and scenario contact sheets: reminders-native-output/")
