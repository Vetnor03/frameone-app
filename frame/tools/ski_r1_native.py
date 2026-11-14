#!/usr/bin/env python3
"""Review the *actual* Ski R1 C++ renderer using original Fraunces/DM Sans GFX pixels.

Render 12 data scenarios x 16 cell geometries x Light/Dark (384 frames).
The original production source provides SkiCache, text metrics, formatting,
localization, resort/avalanche logic and the tested editorial header.
"""
from __future__ import annotations
import argparse
import csv
import io
import re
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw

FRAME=Path(__file__).resolve().parents[1]
MODULE=FRAME/"src/modules/ModuleSki.cpp"
HOST=FRAME/"tests/ski_native/host.cpp"
FONTS=FRAME/"src/assets/fonts"
INCLUDE=FRAME/"tests/ski_native/include"
FUNCTIONS=[
    "measureText","textWidth","fitTextToWidth","drawCenteredInRect",
    "rounded","windDirection","snowText","conditionsText",
    "avalancheText","resortText","powderText"
]

def extract(source:str,name:str)->str:
    p=re.compile(r"(?m)^(?:void|int|bool|const char\*|static void|static bool)\s+"
                 +re.escape(name)+r"\s*\(")
    match=p.search(source)
    if not match:raise RuntimeError("Missing current production Ski helper: "+name)
    begin=source.index("{",match.end())
    depth=0
    for i in range(begin,len(source)):
        if source[i]=="{":depth+=1
        elif source[i]=="}":
            depth-=1
            if depth==0:return source[match.start():i+1]+"\n"
    raise RuntimeError("Unterminated helper "+name)

def struct(source:str)->str:
    i=source.find("struct SkiCache {")
    if i<0:raise RuntimeError("SkiCache was renamed")
    j=source.find("};",i)
    if j<0:raise RuntimeError("SkiCache unterminated")
    return source[i:j+2]+"\nstatic SkiCache g_cache;\n"

def contact(out:Path,scenario:str,theme:str,rows:list[dict])->None:
    # Full original 1-bit framebuffer source scaled nearest-neighbor for QA.
    cellW,cellH=400,240
    margin,caption=14,27
    canvas=Image.new("RGB",(margin+4*(cellW+margin),
       margin+4*(cellH+caption+margin)),"#dedede")
    pencil=ImageDraw.Draw(canvas)
    index={(int(q["cols"]),int(q["rows"])):q for q in rows}
    for height in range(1,5):
      for width in range(1,5):
        entry=index[(width,height)]
        p=out/"raw"/f"{scenario}_{theme}_{width}x{height}.pgm"
        with Image.open(p) as image:frame=image.convert("RGB")
        thumb=frame.resize((cellW,cellH),Image.Resampling.NEAREST)
        x=margin+(width-1)*(cellW+margin)
        y=margin+(height-1)*(cellH+caption+margin)
        canvas.paste(thumb,(x,y))
        # Draw cell boundary on CONTACT SHEET ONLY, never within firmware.
        pencil.rectangle((x,y,x+width*100-1,y+height*60-1),
           outline="#888888",width=1)
        pencil.text((x+3,y+cellH+5),
           f"{width}x{height} — {'EDITORIAL' if int(entry['preview']) else 'FALLBACK'}",
           fill="#333333")
    canvas.save(out/f"contact-{scenario}-{theme}.png")

def main()->None:
    ap=argparse.ArgumentParser()
    ap.add_argument("--output",type=Path,required=True)
    args=ap.parse_args()
    out=args.output.resolve()
    raw=out/"raw"
    raw.mkdir(parents=True,exist_ok=True)
    original=MODULE.read_text(encoding="utf-8")
    host=HOST.read_text(encoding="utf-8")
    host=host.replace("// === SKI_REAL_CACHE_STRUCT ===",struct(original))
    helpers="\n".join(extract(original,n) for n in FUNCTIONS)
    host=host.replace("// === SKI_REAL_PRODUCTION_HELPERS ===",helpers)
    cpp=out/"ski_native.cpp"
    cpp.write_text(host,encoding="utf-8")
    binary=out/"ski_native"
    command=["g++","-std=gnu++17","-O2","-Wall","-Wextra",
      "-Wno-unused-function","-Wno-unused-variable",
      "-I",str(INCLUDE),"-I",str(FONTS),
      "-I",str(FRAME/"src/modules"),
      str(cpp),str(FONTS/"RemindEditorialFonts.cpp"),"-o",str(binary)]
    subprocess.run(command,check=True)
    result=subprocess.check_output([str(binary),str(raw)],text=True)
    (out/"measurements.csv").write_text(result,encoding="utf-8")
    rows=list(csv.DictReader(io.StringIO(result)))
    scenarios=list(dict.fromkeys(row["scenario"] for row in rows))
    assert len(rows)==len(scenarios)*16*2,(len(rows),len(scenarios))
    failures=[]
    lines=["# RE:MIND Ski R1 native 1-bit QA", "",
      "384 true GFX bitmap frames: 12 data scenarios x 16 footprints x Light/Dark.",
      "Cell border is on contact sheets ONLY; never drawn in production.",
      "Original source SkiCache + formatting + font assets compiled into host.",
      "", "| Scenario | Successful / 32 | Overflow/offscreen pixels |",
      "|---|---:|---:|"]
    for scenario in scenarios:
      subset=[row for row in rows if row["scenario"]==scenario]
      success=sum(int(q["preview"]) for q in subset)
      escapes=sum(int(q["escaped"])+int(q["offscreen"]) for q in subset)
      lines.append(f"| {scenario} | {success} | {escapes} |")
      for theme in ("light","dark"):
        contact(out,scenario,theme,
          [q for q in subset if q["theme"]==theme])
      for q in subset:
        if (not int(q["preview"]) or int(q["escaped"]) or
            int(q["offscreen"]) or not int(q["ink_pixels"])):
          failures.append(
            f"{scenario} {q['theme']} {q['cols']}x{q['rows']}: "
            f"preview={q['preview']} escaped={q['escaped']} "
            f"offscreen={q['offscreen']} ink={q['ink_pixels']}")
    lines+=["","## Failures",*(
       ["- "+x for x in failures] if failures else ["None"])]
    (out/"QA.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
    print("\n".join(lines),flush=True)
    if failures:raise SystemExit(f"{len(failures)} Ski native pixel defects")

if __name__=="__main__":
    main()
