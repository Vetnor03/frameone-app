#!/usr/bin/env python3
"""Real ModuleDate.cpp native C++ Layout Lab — all 16 sizes × Light/Dark.

This is not 16 visual templates or a browser-simulated font. Capture ORIGINAL
GFX/F2 pixels on an 800x480 host 1-bit framebuffer. Both compact and full
editorial experimental flags are enabled ONLY in this offline native host.
Faithfully disclose legacy fallback; preserve all currently working functions.
Owner confirms today's V4 passepartout follows all 800x480 screen edges.
Historical narrower matte coordinates are archival diagnostics, NOT a V4 limit.
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
# Measured native-ink breathing-room design token in full framebuffer pixels.
# This is NOT an assumption that the panel bezel hides these pixels.
MIN_EDITORIAL_MARGIN=12
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

def native_ink_quality(pgm,case):
    """Real binary C++ raster quality. Never uses simulated browser fonts.

    Ensure every accepted editorial composition leaves actual, measurable
    breathing room inside its OWN logical Date cell. This is not physical
    optical contrast or a 1–2m readability approval.
    """
    data=raster(pgm)
    bg=0 if case["dark"] else 255
    x,y,w,h=(case[k] for k in ("x","y","w","h"))
    if any(v not in (0,255) for v in data):
        raise ValueError("Date is no longer genuine 1-bit original GFX ink")
    left,top,right,bottom=w,h,0,0
    pixels=0
    for local_y in range(h):
        yy=y+local_y
        line=data[yy*800+x:yy*800+x+w]
        for local_x,v in enumerate(line):
            if v==bg:continue
            pixels+=1
            left=min(left,local_x)
            top=min(top,local_y)
            right=max(right,local_x+1)
            bottom=max(bottom,local_y+1)
    if pixels<300:
        raise ValueError(f"Original Date native ink unexpectedly absent: {case}")
    margins={"left":left,"top":top,"right":w-right,"bottom":h-bottom}
    if min(margins.values())<MIN_EDITORIAL_MARGIN:
        raise ValueError(f"Date editorial ink lacks visual breathing room "
            f"(expected >= {MIN_EDITORIAL_MARGIN}px): {case}, {margins}")
    return {"marginsPx":margins,"minimumMarginPx":min(margins.values()),
            "inkBox":dict(x=left,y=top,w=right-left,h=bottom-top),
            "inkPixels":pixels,"inkCoverageFraction":round(pixels/(w*h),6),
            "palette":"original-binary-1bit"}


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
            quality=native_ink_quality(content,case)
            if quality["inkPixels"]!=status["inkInside"]:
                raise ValueError(f"Source pixels differ from host ink count: {case}")
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
                visualQuality=quality,
                outsideOwnCell=status["inkOutside"],
                hypotheticalHistoricalMattePixels=old_crop_impact(content,case["dark"]),
                fullPng=full_name,croppedPng=crop_name,
                originalCppPixelHash=status["hash"],
                packedHash=status["packedHash"]))
    counts={shape:sum(v["editorialAdmitted"] for v in rows if v["shape"]==shape)
            for shape in sorted({v["shape"] for v in rows})}
    manifest=dict(version="Date R4.15 native all-shape breathing-room audit",
      panel=dict(x=0,y=0,w=800,h=480),
      historicalCrop=dict(x=58,y=39,w=680,h=436,verifiedOnV4=False,
                          diagnosticOnly=True,notCurrentV4=True),
      ownerConfirmedViewport=dict(x=0,y=0,w=800,h=480,
                                  openingFollowsDisplayOuterEdge=True),
      minimumAllowedEditorialMarginPixels=MIN_EDITORIAL_MARGIN,
      minimumMeasuredEditorialMarginPixels=min(
          v["visualQuality"]["minimumMarginPx"] for v in rows),
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
        ' pixels outside obsolete crop (ARCHIVE ONLY) · min ink margin: '+
        str(v["visualQuality"]["minimumMarginPx"])+
        'px</p></article>'
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
       'matte is an obsolete historical diagnostic, NOT a V4 render gate. '
       'An original 1-bit margin audit checks every Date cell for airy editorial '
       'composition, without claiming actual physical 1–2m readability. '
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
