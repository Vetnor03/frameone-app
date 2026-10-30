#!/usr/bin/env python3
"""Compile and capture *actual unmodified C++ ModuleDate::render calls* on host.

The output is rasterized by a bounded Adafruit_GFX-like host 1-bit device.
It is NOT the GxEPD2 internal controller framebuffer or actual e-paper photo.
It uses original firmware GFX bitmap assets and editorial F2 preflight.
"""
from __future__ import annotations
import argparse
import base64
import html
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import zlib

ROOT=Path(__file__).resolve().parents[2]
FRAME=ROOT/"frame"
HOST=FRAME/"tests/native_capture"
SOURCE=HOST/"native_date_capture_cli.cpp"

def compile_native(executable:Path):
    if not shutil.which("g++"):
        raise RuntimeError("GNU++ compiler required")
    cmd=[
        "g++","-std=c++11","-O1","-Wall","-Wextra","-Werror","-pedantic",
        # Native production code has legacy printf/unused-function warnings
        # under Linux GCC; these are unrelated to the pixel-capture ABI.
        "-Wno-error=format-truncation","-Wno-error=unused-function",
        "-DREMIND_DATE_ROLE_PREVIEW_ENABLED=1",
        "-DREMIND_DATE_EDITORIAL_PREVIEW_ENABLED=1",
        "-I",str(HOST/"include"),
        "-I",str(HOST),
        "-I",str(FRAME/"src/modules"),
        "-I",str(FRAME/"src/display"),
        "-I",str(FRAME/"src/core"),
        "-I",str(FRAME/"src/assets/fonts"),
        str(SOURCE),
        str(FRAME/"src/display/DateEditorialF2Adapter.cpp"),
        str(FRAME/"src/display/DateF2InkAdapter.cpp"),
        str(FRAME/"src/display/EditorialText.cpp"),
        str(FRAME/"src/display/FrameText.cpp"),
        str(FRAME/"src/assets/fonts/RemindEditorialFonts.cpp"),
        "-o",str(executable),
    ]
    result=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=110)
    if result.returncode:
        raise RuntimeError("Native renderer compile failed:\n"+result.stderr[-11000:])
    return executable

def cases():
    return [
        dict(name="Full October 2026 · light",year=2026,month0=9,day=21,
             x=0,y=0,w=800,h=480,dark=0,holiday=0),
        dict(name="Full October 2026 · dark",year=2026,month0=9,day=21,
             x=0,y=0,w=800,h=480,dark=1,holiday=0),
        dict(name="Full December 2026 · January 2027",year=2026,month0=11,day=31,
             x=0,y=0,w=800,h=480,dark=0,holiday=0),
        dict(name="Custom Date 3×4 beside another module",year=2026,month0=9,day=21,
             x=0,y=0,w=600,h=480,dark=0,holiday=0),
        dict(name="Upcoming holiday claims botanical space",year=2026,month0=9,day=21,
             x=0,y=0,w=800,h=480,dark=0,holiday=1),
    ]

def capture(executable:Path,item:dict,output:Path):
    args=[str(executable),str(output)]+[
        str(item[k]) for k in ("year","month0","day","x","y","w","h","dark","holiday")]
    p=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,timeout=20)
    if p.returncode:
        raise RuntimeError(f"Native painter failed ({item['name']}): "+
                           p.stderr[-3000:])
    record=json.loads(p.stdout)
    # Do not treat a source candidate as native-approved if strict C++
    # preflight returns to the original legacy painter.
    return record

def pgm_to_png(pgm:bytes):
    assert pgm.startswith(b"P5\n800 480\n255\n"),"PGM dimensions changed"
    raw=pgm[len(b"P5\n800 480\n255\n"):]
    assert len(raw)==800*480
    def chunk(kind,data):
        payload=kind+data
        return struct.pack("!I",len(data))+payload+struct.pack("!I",zlib.crc32(payload)&0xffffffff)
    scan=b"".join(b"\0"+raw[i:i+800] for i in range(0,len(raw),800))
    return (b"\x89PNG\r\n\x1a\n"+
        chunk(b"IHDR",struct.pack("!IIBBBBB",800,480,8,0,0,0,0))+
        chunk(b"IDAT",zlib.compress(scan,9))+chunk(b"IEND",b""))

def generate(output:Path):
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="date_native_capture_") as d:
        temp=Path(d)
        exe=compile_native(temp/"native_date")
        articles=[]
        summary={"cases":[],"nativePainterSource":"frame/src/modules/ModuleDate.cpp",
                 "actualGxEPD2Buffer":False,"flashed":False}
        for i,item in enumerate(cases()):
            pgm=temp/f"native_{i}.pgm"
            status=capture(exe,item,pgm)
            summary["cases"].append({"name":item["name"],**status})
            if not status["admitted"]:
                # The native painter returned legacy fallback. Never place its
                # mock legacy font pixels in an "editorial native" screenshot.
                figure='<div class="fallback">NATIVE EDITORIAL REJECTED → LEGACY FALLBACK<br>Legacy pixel output deliberately not displayed.</div>'
            else:
                png=pgm_to_png(pgm.read_bytes())
                image=base64.b64encode(png).decode("ascii")
                figure='<img alt="Real C++ Date painter rendered on host pixels" src="data:image/png;base64,'+image+'">'
            label=html.escape(item["name"])
            result="NATIVE EDITORIAL ACCEPTED" if status["admitted"] else "LEGACY FALLBACK"
            articles.append(
                f'<article>{figure}<h3>{label}</h3>'
                f'<p>{result}; ink in cell: {status["inkInside"]:,}; '
                f'out-of-cell: {status["inkOutside"]:,}; '
                f'outside logical panel: {status["inkOutsideMatte"]:,}; '
                f'host pixel hash: <code>{status["hash"]}</code></p></article>')
        doc=('<!doctype html><html lang="en"><meta charset="utf-8">'
             '<meta name="viewport" content="width=device-width,initial-scale=1">'
             '<title>RE Date native C++ painter host pixel capture — UNFLASHED</title>'
             '<style>body{font-family:system-ui;margin:24px;background:#ebeae6;color:#242424}'
             'main{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px}'
             'article{background:#fff;border:1px solid #ccc;border-radius:8px;padding:12px}'
             'img{width:100%;height:auto;background:white;image-rendering:pixelated}'
             'h3{font-size:17px}p{font-size:12px}header{max-width:1000px;margin-bottom:25px}'
             '.fallback{display:grid;place-items:center;min-height:200px;padding:18px;'
             'text-align:center;font-weight:bold;background:#ddd}</style>'
             '<header><h1>RE Date: actual C++ paint calls, host 1-bit buffer</h1>'
             '<p><strong>NOT a GxEPD2 controller framebuffer.</strong> '
             'The original ModuleDate.cpp C++ renderer, glyphs and strict native '
             'editorial gate run on a test-only Adafruit_GFX-like 1-bit 800×480 '
             'raster. Host line/circle pixels may differ from the production '
             'driver. This is not a physical panel capture, not an exact '
             'GxEPD2 paged transfer, and never flashes a frame. '
             'Full logical 800×480 viewport remains in view '
             'for verification. Legacy rejects are labelled, not painted '
             'with incomplete mock legacy fonts.</p></header><main>'+
             "".join(articles)+"</main></html>")
        output.write_text(doc,encoding="utf-8")
    return summary

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--output",type=Path,required=True)
    args=ap.parse_args()
    print(json.dumps(generate(args.output),ensure_ascii=False,sort_keys=True))
