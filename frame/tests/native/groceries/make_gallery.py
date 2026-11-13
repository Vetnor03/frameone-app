"""One-bit contact sheets made from the actual extracted C++ Groceries painter."""
import csv
from collections import defaultdict
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageOps

output=Path("groceries-native-output")
records=list(csv.DictReader((output/"manifest.csv").open()))
assert len(records)==12*16*2,len(records)
groups=defaultdict(dict)
for row in records:
    groups[(row["scenario"],row["cols"],row["rows"])][row["theme"]]=row
clipping=[]
marker_cases=0
for key,pair in groups.items():
    assert set(pair)=={"light","dark"},key
    light,dark=pair["light"],pair["dark"]
    for field in ("rotation","capacity","overflow","menu","low","ideas","clipped","diamonds"):
        assert light[field]==dark[field],(key,field)
    a=Image.open(output/light["pbm"]).convert("L")
    b=Image.open(output/dark["pbm"]).convert("L")
    assert a.size==b.size==(int(light["cols"])*200,int(light["rows"])*120),key
    assert ImageChops.difference(ImageOps.invert(a),b).getbbox() is None,key
    if int(light["clipped"]):
        clipping.append((key,int(light["clipped"])))
    if int(light["diamonds"]):marker_cases+=1
    if int(light["capacity"])<=1:
        assert light["diamonds"]=="0",(key,"dot despite <=1 visible")

for scenario in sorted({r["scenario"] for r in records}):
    for theme in ("light","dark"):
        subset={(int(r["cols"]),int(r["rows"])):r for r in records
                if r["scenario"]==scenario and r["theme"]==theme}
        bg="white" if theme=="light" else "black"
        fg="black" if theme=="light" else "white"
        sheet=Image.new("RGB",(1600,1200),bg)
        draw=ImageDraw.Draw(sheet)
        for rows in range(1,5):
            for cols in range(1,5):
                row=subset[(cols,rows)]
                x,y=(cols-1)*400+10,(rows-1)*300+10
                draw.rectangle((x,y,x+375,y+270),outline=(135,135,135))
                draw.text((x+8,y+6),
                          f"{cols}x{rows} · {cols*200}x{rows*120} · {row['capacity']} shown",
                          fill=fg)
                pic=Image.open(output/row["pbm"]).convert("RGB")
                pic.thumbnail((355,224),Image.Resampling.NEAREST)
                sheet.paste(pic,(x+(375-pic.width)//2,y+26+(224-pic.height)//2))
        sheet.save(output/f"review_{scenario}_{theme}.png")
print(f"Original 1-bit Groceries C++: {len(groups)} exact Light/Dark inverses; "
      f"{marker_cases} two-or-more-item diamond cases; "
      f"{len(clipping)} pixel-boundary cases across paired scenes.")
if clipping:
    print("Existing/adaptive renderer pixel-boundary cases (first 12):",clipping[:12])
    (output/"pixel_bounds_findings.txt").write_text(
        "\n".join(f"{key}: {count}" for key,count in clipping)+"\n")
