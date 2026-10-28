"""EXPERIMENTAL Date botanical 1-bit inspection; NOT a GxEPD2 framebuffer.

Read the *native C++* line source directly. Never invent separate SVG curves:
both physical preview and original-font gallery use the same integer endpoints.
A software Bresenham pixel study approximates Adafruit GFX rasterization, but
must not be represented as an actual display transfer or waveform capture.
"""
from pathlib import Path
import re
from html import escape

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/"frame/src/display/DateEditorialBotanical.h"

def native_strokes():
    text=SOURCE.read_text(encoding="utf-8")
    width=int(re.search(r"DESIGN_W=(\d+)",text).group(1))
    height=int(re.search(r"DESIGN_H=(\d+)",text).group(1))
    block=text.split("// BOTANICAL_STROKES_BEGIN",1)[1].split(
        "// BOTANICAL_STROKES_END",1)[0]
    segments=[tuple(map(int,m)) for m in re.findall(
        r"\{\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\}",block)]
    assert len(segments)>=60,"Botanical source missing or incomplete"
    assert all(0<=x<width and 0<=y<height for a,b,c,d in segments
               for x,y in ((a,b),(c,d))),"Unbounded 1-bit botanical point"
    return width,height,segments

def bresenham(x0,y0,x1,y1):
    # Adafruit_GFX writeLine integer variant; source geometry is exact even
    # if a target renderer's diagonal tie-break differs by one pixel.
    steep=abs(y1-y0)>abs(x1-x0)
    if steep: x0,y0=y0,x0; x1,y1=y1,x1
    if x0>x1: x0,x1=x1,x0; y0,y1=y1,y0
    dx=x1-x0
    dy=abs(y1-y0)
    err=dx//2
    ystep=1 if y0<y1 else -1
    y=y0
    for x in range(x0,x1+1):
        yield (y,x) if steep else (x,y)
        err-=dy
        if err<0:
            y+=ystep
            err+=dx

def motif_pixels(box):
    width,height,segments=native_strokes()
    if box["w"]<=0 or box["h"]<=0:return set()
    xs=lambda x: box["x"]+x*box["w"]//width
    ys=lambda y: box["y"]+y*box["h"]//height
    points=set()
    for a,b,c,d in segments:
        points.update(bresenham(xs(a),ys(b),xs(c),ys(d)))
    assert all(box["x"]<=x<box["x"]+box["w"] and
               box["y"]<=y<box["y"]+box["h"] for x,y in points)
    return points

def render_ink_botanical(box, ink="#191919"):
    points=sorted(motif_pixels(box))
    if not points:return ""
    path="".join(f"M{x},{y}h1v1h-1z" for x,y in points)
    return ('<path data-botanical="native-line-ink-v1" '
            f'fill="{escape(ink)}" d="{path}"/>')
