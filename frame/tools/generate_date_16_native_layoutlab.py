#!/usr/bin/env python3
"""Real ModuleDate.cpp native C++ Layout Lab — all 16 sizes × Light/Dark.

This is not 16 visual templates or a browser-simulated font. Capture ORIGINAL
GFX/F2 pixels on an 800x480 host 1-bit framebuffer. Both compact and full
editorial experimental flags are enabled ONLY in this offline native host.
Faithfully disclose legacy fallback; preserve all currently working functions.
The V4 optical opening has NOT been measured: historical matte is a diagnostic.
"""
import argparse
import html
import json
import tempfile
import struct
import zlib
from pathlib import Path
from generate_date_native_painter_capture import compile_native,capture,pgm_to_png

HEADER=b"P5\n800 480\n255\n"
OLD=(58,39,680,436)
def raster(pgm):
    if not pgm.startswith(HEADER) or len(pgm)!=len(HEADER)+800*480:
        raise ValueError("Capture is not a complete 800x480 1-bit host PGM")
    return memoryview(pgm)[len(HEADER):]

def old_crop_impact(pgm,dark):
    p=raster(pgm)
    bg=0 if dark else 255
    mx,my,mw,mh=OLD
    return sum(p[y*800+x]!=bg for y in range(480) for x in range(800)
               if not (mx<=x<mx+mw and my<=y<my+mh))

def crop_cell_png(pgm,x,y,w,h):
    p=raster(pgm)
    scan=b"".join(b"\x00"+p[yy*800+x:yy*800+x+w].tobytes()
                  for yy in range(y,y+h))
    def chunk(name,data):
        body=name+data
        return struct.pack("!I",len(data))+body+struct.pack(
            "!I",zlib.crc32(body)&0xffffffff)
    return (b"\x89PNG\r\n\x1a\n"+
      chunk(b"IHDR",struct.pack("!IIBBBBB",w,h,8,0,0,0,0))+
      chunk(b"IDAT",zlib.compress(scan,9))+chunk(b"IEND",b""))

def cases():
    scenes=[]
    for cw in range(1,5):
        for rh in range(1,5):
            w,h=cw*200,rh*120
            for dark,mon,day,x,y in (
                (0,9,21,0,0),
                (1,11,31,800-w,480-h)):
                scenes.append(dict(
                    name=f"{cw}x{rh} / {'Dark year turn' if dark else 'Light October'}",
                    shape=f"{cw}x{rh}",year=2026,month0=mon,day=day,
                    x=x,y=y,w=w,h=h,dark=dark,holiday=0))
    return scenes

def generate(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    rows=[]
    with tempfile.TemporaryDirectory(prefix="date_16_native_") as tmp:
        exe=compile_native(Path(tmp)/"capture",
                           ["-DREMIND_DATE_COMPACT_PREVIEW_ENABLED=1"])
        for i,case in enumerate(cases()):
            pgm=Path(tmp)/f"layout_{i}.pgm"
            status=capture(exe,case,pgm)
            if status["outOfBounds"] or status["inkOutside"] or                 status["packedBytes"]!=48000 or status["packedPixelMismatches"]:
                raise ValueError(f"Native logical bounds failed for {case}: {status}")
            content=pgm.read_bytes()
            full_name=f"date_{i:02d}_full.png"
            crop_name=f"date_{i:02d}_cell.png"
            (output/full_name).write_bytes(pgm_to_png(content))
            (output/crop_name).write_bytes(crop_cell_png(
                content,case["x"],case["y"],case["w"],case["h"]))
            rows.append(dict(
                shape=case["shape"],theme="Dark" if case["dark"] else "Light",
                case=case,editorialAdmitted=status["admitted"],
                legacyFallback=not status["admitted"],
                cellPixels=status["inkInside"],
                outsideOwnCell=status["inkOutside"],
                hypotheticalHistoricalMattePixels=old_crop_impact(content,case["dark"]),
                fullPng=full_name,croppedPng=crop_name,
                originalCppPixelHash=status["hash"],
                packedHash=status["packedHash"]))
    counts={shape:sum(v["editorialAdmitted"] for v in rows if v["shape"]==shape)
            for shape in sorted({v["shape"] for v in rows})}
    manifest=dict(version="Date R4.13 Layout Lab full logical viewport",
      panel=dict(x=0,y=0,w=800,h=480),
      historicalCrop=dict(x=58,y=39,w=680,h=436,verifiedOnV4=False,
                          diagnosticOnly=True),
      originalRenderer="frame/src/modules/ModuleDate.cpp",
      actualPanelTest=False,flashed=False,
      originalFrauncesDmSansGfx=True,
      sourceDataNotHardcoded=True,
      **{"scenes":rows,"editorialAdmissionsByShape":counts})
    (output/"manifest.json").write_text(json.dumps(manifest,indent=2))
    cards="".join(
        '<article data-shape="'+v["shape"]+'">'
        '<h2>'+html.escape(v["shape"]+" • "+v["theme"])+
        (' • EDITORIAL' if v["editorialAdmitted"] else ' • LEGACY FALLBACK')+
        '</h2><img src="'+v["croppedPng"]+'" alt="'+html.escape(v["shape"])+
        ' original C++ Date cell"><p>'+str(v["cellPixels"])+
        ' source ink pixels · hypothetical 680×436 crop: '+str(
            v["hypotheticalHistoricalMattePixels"])+
        ' pixels potentially hidden (UNVERIFIED)</p></article>'
        for v in rows)
    page=('<html><head><meta charset="utf-8"><title>RE Date 16 original native</title>'
       '<style>body{background:#eee;color:#181818;font-family:system-ui;padding:18px}'
       'main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}'
       'article{background:white;padding:12px;border:1px solid #aaa;overflow:hidden}'
       'h2{font-size:14px}img{max-width:100%;image-rendering:pixelated;border:1px solid #888}'
       'p{font-size:12px}header{max-width:1000px}</style></head>'
       '<header><h1>RE Design vNext • All 16 native Date sizes</h1>'
       '<p>32 original C++ GFX/F2 host scenes: October Light at upper left and '
       'December-to-January Dark at lower right. Every full 800×480 scene is '
       'also included as PNG. Both themes, actual original fonts, full logical '
       'canvas. Legacy fallback is explicitly marked. The 680×436 historical '
       'matte is an UNVERIFIED hypothetical diagnostic, never a render gate. '
       'NOT e-paper physical QA, NEVER flashed.</p></header><main>'+cards+'</main></html>')
    (output/"index.html").write_text(page)
    if len(rows)!=32 or len(counts)!=16:
        raise AssertionError("Expected all 16 shapes in both themes")
    # R4.14 acceptance is factual: not an empty screenshot / web rendering.
    # These two approved source-calendar dates should admit every original
    # 16-shape Date cell in BOTH native themes; all 100 legal user placements
    # are independently exercised by the original ModuleDate host QA.
    if any(n!=2 for n in counts.values()):
        raise AssertionError(f"Editorial native C++ fallback remains: {counts}")
    return manifest

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output",required=True,type=Path)
    options=p.parse_args()
    result=generate(options.output)
    print(json.dumps({"scenes":len(result["scenes"]),
      "admissions":result["editorialAdmissionsByShape"],
      "historicCropDiagnosticOnly":True}))
