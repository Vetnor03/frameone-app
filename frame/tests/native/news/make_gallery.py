"""Contact sheets from ORIGINAL native C++ GFX P4 one-bit News rasters."""
import csv
from collections import defaultdict
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops, ImageOps

output=Path("news-native-output")
records=list(csv.DictReader((output/"manifest.csv").open()))
assert len(records)==10*16*2, len(records)
groups=defaultdict(dict)
for r in records:
    groups[(r["scenario"],r["cols"],r["rows"])][r["theme"]]=r
native=0
legacy=0
for key,items in groups.items():
    assert set(items)=={"light","dark"}
    a,b=items["light"],items["dark"]
    for field in ("rendered","shown","overflow","clipped"):
        assert a[field]==b[field],(key,field)
    if a["rendered"]!="1":
        assert a["pbm"]==b["pbm"]==""
        legacy+=1
        continue
    light=Image.open(output/a["pbm"]).convert("L")
    dark=Image.open(output/b["pbm"]).convert("L")
    assert light.size==dark.size==(int(a["cols"])*200,int(a["rows"])*120)
    assert not ImageChops.difference(ImageOps.invert(light),dark).getbbox(),key
    native+=1

for scenario in {r["scenario"] for r in records}:
    for theme in ("light","dark"):
        scene_records={(int(r["cols"]),int(r["rows"])):r for r in records
                       if r["scenario"]==scenario and r["theme"]==theme}
        bg="white" if theme=="light" else "black"
        fg="black" if theme=="light" else "white"
        canvas=Image.new("RGB",(4*400,4*300),bg)
        d=ImageDraw.Draw(canvas)
        for rows in range(1,5):
            for cols in range(1,5):
                r=scene_records[(cols,rows)]
                x=(cols-1)*400+10;y=(rows-1)*300+10
                d.rectangle([x,y,x+375,y+270],outline=(120,120,120),width=1)
                d.text((x+9,y+6),f"{cols}x{rows} / {cols*200}x{rows*120}",fill=fg)
                if r["rendered"]=="1":
                    img=Image.open(output/r["pbm"]).convert("RGB")
                    img.thumbnail((355,230),Image.Resampling.NEAREST)
                    canvas.paste(img,(x+int((375-img.width)/2),y+25+int((230-img.height)/2)))
                else:
                    d.text((x+20,y+110),"EXISTING LEGACY FALLBACK",fill=fg)
        canvas.save(output/f"review_{scenario}_{theme}.png")
print(f"News native exact Light/Dark inverse: {native} rendered pairs; {legacy} matching fallback pairs.")
