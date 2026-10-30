#!/usr/bin/env python3
"""Generate a review-only SVG of the documented 800x480 Date aperture.

No sensor, camera, panel, USB or flashing action. The mechanical aperture in
this source is a PHASE-0 estimate and must be verified on actual V4 assembly.
"""
from pathlib import Path
import argparse
import html
import re

ROOT=Path(__file__).resolve().parents[2]
POLICY=ROOT/"frame/src/display/DateRolePolicy.generated.h"

FIELDS=("PANEL_WIDTH","PANEL_HEIGHT","MATTE_X","MATTE_Y",
        "MATTE_WIDTH","MATTE_HEIGHT")


def policy_dimensions(source: str) -> dict:
    values={}
    for field in FIELDS:
        matches=re.findall(
            rf"^static const int {re.escape(field)} = (\d+);\s*$",
            source,re.MULTILINE)
        if len(matches)!=1:
            raise ValueError(f"Expected one generated DateRolePolicy {field}")
        values[field]=int(matches[0])
    pw,ph=values["PANEL_WIDTH"],values["PANEL_HEIGHT"]
    x,y,w,h=(values[z] for z in ("MATTE_X","MATTE_Y","MATTE_WIDTH","MATTE_HEIGHT"))
    if not (pw==800 and ph==480 and 0<=x<pw and 0<=y<ph and
            w>0 and h>0 and x+w<=pw and y+h<=ph):
        raise ValueError("Documented aperture is incompatible with logical panel")
    return values


def svg_document(dims: dict) -> str:
    pw,ph=dims["PANEL_WIDTH"],dims["PANEL_HEIGHT"]
    x,y,w,h=(dims[z] for z in ("MATTE_X","MATTE_Y","MATTE_WIDTH","MATTE_HEIGHT"))
    # The user owns FOUR 200x120 logical tile columns/rows. Preserve it.
    grid="".join(
        f'<line x1="{i*pw//4}" y1="0" x2="{i*pw//4}" y2="{ph}" '
        'stroke="#2758A5" stroke-width="1" stroke-dasharray="5,4"/>'
        for i in range(1,4))
    grid+="".join(
        f'<line x1="0" y1="{i*ph//4}" x2="{pw}" y2="{i*ph//4}" '
        'stroke="#2758A5" stroke-width="1" stroke-dasharray="5,4"/>'
        for i in range(1,4))
    corners=""
    for cx,cy,dx,dy in ((x,y,1,1),(x+w,y,-1,1),
                        (x,y+h,1,-1),(x+w,y+h,-1,-1)):
        corners+=(
            f'<path d="M {cx+dx*18} {cy} L {cx} {cy} L {cx} {cy+dy*18}" '
            'fill="none" stroke="#B82222" stroke-width="3"/>')
    caption=html.escape(
        f"Phase-0 aperture {w}×{h}, origin ({x},{y}) — NOT physically verified")
    return f'''<svg xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 {pw} {ph}" width="{pw}" height="{ph}"
      role="img" aria-label="RE Date physical aperture diagnostic, review only">
      <rect width="{pw}" height="{ph}" fill="#C8C8C8"/>
      <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#F9F9F9"/>
      {grid}
      <rect x="{x}" y="{y}" width="{w}" height="{h}"
            fill="none" stroke="#B82222" stroke-width="2"/>
      {corners}
      <text x="{x+8}" y="{y+22}" font-family="sans-serif"
            font-size="14" fill="#111">{caption}</text>
      <text x="{x+8}" y="{y+h-12}" font-family="sans-serif"
            font-size="12" fill="#111">Logical panel {pw}×{ph}; dotted lines = 4×4 grid</text>
      <text x="{pw-8}" y="18" text-anchor="end" font-family="sans-serif"
            font-size="12" fill="#111">RE Date — NOT A FLASH IMAGE</text>
    </svg>'''


def generate(output:Path)->dict:
    dims=policy_dimensions(POLICY.read_text(encoding="utf-8"))
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(svg_document(dims),encoding="utf-8")
    return {"svg_path":str(output),"dimensions":dims,
            "hardware_verified":False,"flashing_performed":False}


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output",required=True,type=Path)
    args=parser.parse_args()
    import json
    print(json.dumps(generate(args.output),indent=2))
