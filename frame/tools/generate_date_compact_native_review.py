#!/usr/bin/env python3
"""Render the original ModuleDate.cpp compact, medium and tall host pixels.

Separate default-OFF, host-only compile define. No real panel/OTA/flash.
"""
import argparse
import html
import json
import tempfile
from pathlib import Path
from generate_date_native_painter_capture import compile_native,capture,pgm_to_png

def scenarios():
    return [
        dict(name="1x1 micro / October / Light",year=2026,month0=9,
             day=21,x=0,y=0,w=200,h=120,dark=0,holiday=0),
        dict(name="1x1 micro / December / Dark",year=2026,month0=11,
             day=31,x=200,y=240,w=200,h=120,dark=1,holiday=0),
        dict(name="2x1 ribbon / October / Light",year=2026,month0=9,
             day=21,x=0,y=0,w=400,h=120,dark=0,holiday=0),
        dict(name="3x1 ribbon with year / December / Dark",year=2026,month0=11,
             day=31,x=200,y=120,w=600,h=120,dark=1,holiday=0),
        dict(name="4x1 ribbon with year / October / Light",year=2026,month0=9,
             day=21,x=0,y=0,w=800,h=120,dark=0,holiday=0),
        dict(name="1x2 four-fact stack / October / Light",year=2026,month0=9,
             day=21,x=0,y=0,w=200,h=240,dark=0,holiday=0),
        dict(name="2x2 four-fact stack / October / Light",year=2026,month0=9,
             day=21,x=0,y=0,w=400,h=240,dark=0,holiday=0),
        dict(name="1x2 four-fact stack / December / Dark",year=2026,month0=11,
             day=31,x=600,y=240,w=200,h=240,dark=1,holiday=0),
        dict(name="2x2 four-fact stack / December / Dark",year=2026,month0=11,
             day=31,x=400,y=240,w=400,h=240,dark=1,holiday=0),
    ]

def generate(output):
    output=Path(output)
    output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="date_compact_host_") as dirname:
        temp=Path(dirname)
        exe=compile_native(temp/"capture",
            ["-DREMIND_DATE_COMPACT_PREVIEW_ENABLED=1"])
        scenes=[]
        for i,item in enumerate(scenarios()):
            pgm=temp/f"compact_{i}.pgm"
            status=capture(exe,item,pgm)
            if not status["admitted"] or status["inkOutside"] or status["outOfBounds"]:
                raise ValueError(f"Actual Date painter did not safely admit {item['name']}: {status}")
            filename=f"compact_{i}.png"
            (output/filename).write_bytes(pgm_to_png(pgm.read_bytes()))
            scenes.append(dict(name=item["name"],png=filename,
                               cell={k:item[k] for k in ("x","y","w","h")},
                               inkInside=status["inkInside"],
                               hash=status["hash"],admitted=status["admitted"]))
        summary=dict(scenes=scenes,physicalPanel=False,flashed=False,
                     standardFirmwareFlagEnabled=False,
                     renderer="original ModuleDate.cpp/Fraunces+DM Sans F2 host-pixel")
        (output/"manifest.json").write_text(json.dumps(summary,indent=2))
        cards="".join(
          f'<article><img alt="{html.escape(item["name"])}" src="{item["png"]}">'
          f'<h2>{html.escape(item["name"])}</h2>'
          f'<p>{item["inkInside"]} original C++ foreground pixels; '
          f'host hash {item["hash"]}</p></article>'
          for item in scenes)
        doc=('<html lang="en"><meta charset="utf-8">'
           '<meta name="viewport" content="width=device-width,initial-scale=1">'
           '<title>RE Date R4.7 original C++ compact and medium pixel study</title>'
           '<style>body{font-family:system-ui;background:#eae9e5;margin:20px;color:#222}'
           'main{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}'
           'article{background:white;padding:10px;border:1px solid #aaa}'
           'img{width:100%;image-rendering:pixelated}h2{font-size:15px}p{font-size:12px}'
           '</style><h1>RE Date R4.7: actual compact and medium C++ painter</h1>'
           '<p>Separate default-OFF host-only compact preview, original Fraunces / DM Sans '
           'GFX bitmaps, all Date labels are runtime facts. NOT a physical e-paper '
           'capture, GxEPD2 controller output, shipping firmware or flashing approval.</p>'
           '<main>'+cards+'</main></html>')
        (output/"index.html").write_text(doc)
        return summary

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--output",type=Path,required=True)
    a=p.parse_args()
    print(json.dumps(generate(a.output),sort_keys=True))
