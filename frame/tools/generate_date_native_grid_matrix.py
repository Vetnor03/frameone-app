#!/usr/bin/env python3
"""Native Date admission at all 100 legal physical grid positions (NO FLASH).

Compiles actual ModuleDate.cpp once, then renders 100 positions × two actual
Gregorian fixtures × two themes to an 800x480 host raster. A rejected
candidate remains LEGACY FALLBACK; never count it as a visual acceptance.
Does not render neighboring modules or capture a GxEPD2 controller buffer.
"""
from __future__ import annotations
from collections import Counter,defaultdict
from pathlib import Path
import argparse
import html
import json
import subprocess
import tempfile
from generate_date_native_painter_capture import compile_native,capture,ROOT

FIXTURES=[
    ("October 2026",2026,9,21,0),
    ("December → January 2027",2026,11,31,0),
]

def cases():
    generated=[]
    for colspan in range(1,5):
        for rowspan in range(1,5):
            for x in range(5-colspan):
                for y in range(5-rowspan):
                    for name,year,month0,day,holiday in FIXTURES:
                        for dark in (0,1):
                            generated.append(dict(
                                name=f"{colspan}×{rowspan} at {x},{y}; {name}; "
                                     f"{'Dark' if dark else 'Light'}",
                                year=year,month0=month0,day=day,
                                x=x*200,y=y*120,w=colspan*200,h=rowspan*120,
                                dark=dark,holiday=holiday,
                                grid=dict(col=x,row=y,colSpan=colspan,
                                          rowSpan=rowspan)))
    assert len(generated)==400
    return generated

def summarize(records):
    aggregate=defaultdict(lambda:Counter())
    admitted=0
    for row in records:
        g=row["grid"]
        shape=f'{g["colSpan"]}×{g["rowSpan"]}'
        agg=aggregate[shape]
        agg["total"]+=1
        if row["admitted"]:
            admitted+=1
            agg["accepted"]+=1
            if (row["inkOutside"] or row["inkOutsideMatte"] or
                    row["outOfBounds"] or row["inkInside"]<300):
                raise AssertionError(("Native ink escaped physical cell/matte",row))
        else:
            agg["fallback"]+=1
    result=dict(total=len(records),admitted=admitted,
        legacyFallback=len(records)-admitted,
        shapes={k:dict(v) for k,v in sorted(aggregate.items())},
        nativeActualCPP=True,originalGfxFonts=True,
        actualGxEPD2Buffer=False,otherModulePixels=False,
        flashed=False)
    return result

def run_matrix():
    output=[]
    with tempfile.TemporaryDirectory(prefix="date_native_grid_") as tmp:
        executable=compile_native(Path(tmp)/"date_native")
        for item in cases():
            info=capture(executable,item,Path("-"))
            output.append({**item,**info})
    report=summarize(output)
    return report,output

def write_html(path:Path,summary,records):
    rows=[]
    for shape,v in summary["shapes"].items():
        rows.append(f'<tr><th scope="row">{html.escape(shape)}</th>'
                    f'<td>{v.get("total",0)}</td>'
                    f'<td>{v.get("accepted",0)}</td>'
                    f'<td>{v.get("fallback",0)}</td></tr>')
    matrix=html.escape(json.dumps(records,ensure_ascii=False,
                                   separators=(",",":"),sort_keys=True))
    page=('<!doctype html><html lang="en"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>R4 Date actual native painter all-grid audit — unflashed</title>'
        '<style>body{font-family:system-ui;background:#f7f6f3;color:#252525;'
        'margin:32px auto;max-width:820px;padding:0 16px;line-height:1.5}'
        'table{width:100%;border-collapse:collapse}td,th{border-bottom:1px '
        'solid #ddd;padding:8px;text-align:left}caption{text-align:left;'
        'font-weight:700;padding:10px 0}summary{cursor:pointer}'
        'pre{white-space:pre-wrap;word-break:break-word;font-size:11px}</style>'
        f'<h1>RE Date · 100 real grid positions</h1><p>Actual compiled '
        f'<code>ModuleDate::render</code> called for <b>{summary["total"]}</b> '
        'cases (100 legal shapes/positions × Oct/Dec × Light/Dark). '
        f'Native-admitted: <strong>{summary["admitted"]}</strong>; '
        f'original legacy fallback: <strong>{summary["legacyFallback"]}</strong>.</p>'
        '<p><strong>NOT AN E-PAPER OR GxEPD2 CAPTURE.</strong> Pixel positions '
        'are host Adafruit-GFX-like 1-bit outputs, with actual C++ source, '
        'original glyph bitmaps and real 800×480 coordinates. The '
        'matte-visible area is 58,39,680,436. Other modules are NOT '
        'rendered. Source-admitted cases with any out-of-bounds ink FAIL '
        'the audit. This report does not authorize flashing.</p>'
        '<table><caption>Native admission across all Date slot sizes</caption>'
        '<thead><tr><th>Grid cell</th><th>Cases</th>'
        '<th>Editorial</th><th>Legacy fallback</th></tr></thead><tbody>'+
        "".join(rows)+'</tbody></table><details><summary>Detailed reproducible '
        'fixture and native result data</summary><pre>'+matrix+'</pre></details>'
        '</html>')
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(page,encoding="utf-8")

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,required=True)
    options=parser.parse_args()
    result,records=run_matrix()
    write_html(options.output,result,records)
    print(json.dumps(result,ensure_ascii=False,sort_keys=True))
