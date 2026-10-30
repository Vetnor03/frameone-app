#!/usr/bin/env python3
"""R4 Date: mixed-module *source-ink* review at real firmware grid coordinates.

This is deliberately NOT a GxEPD2 framebuffer or captured other-module paint.
Other modules are unmistakable placeholders, not mocks of their appearance.
Only the Date F1/F2 text glyph bitmaps, native-sourced botanical lines,
calendar source-GFX pixels and existing measured JS plan are visualized.
Actual per-cell renderer arbitration/physical output remains unverified.
"""
import argparse
import copy
import html
import json
import subprocess
from pathlib import Path
from generate_date_review_gallery import (
    ROOT, FONT_SOURCE, FONT_DIR, load_font, render_calendar, glyph_paths,
    bbox_markup)
from date_editorial_svg import draw_editorial

CLI=ROOT/"frame/tests/helpers/date_dual_holiday_visual_cli.mjs"
PANEL=(800,480)
MATTE=(0,0,800,480)

def grid_cell(col,row,columns,rows,module):
    return dict(col=col,row=row,columns=columns,rows=rows,module=module,
                x=col*200,y=row*120,w=columns*200,h=rows*120)

def scenarios():
    def scene(name,tiles,month0=9,year=2026,day=21,weekday="Wednesday",
              month="October",holidays=(),theme="Light"):
        return dict(name=name,
                    cells=[grid_cell(*t) for t in tiles],
                    facts=dict(year=year,month0=month0,day=day,
                               weekday=weekday,month=month,
                               holidays=list(holidays)),theme=theme)
    return [
        scene("Full 4×4 editorial Date",[ (0,0,4,4,"date") ]),
        scene("Named default: Weather / Date / Reminders",[
            (0,0,4,1,"weather:1"),(0,1,4,1,"date"),
            (0,2,4,2,"reminders")]),
        scene("Named pyramid: two Date slots, Surf untouched",[
            (0,0,4,1,"date"),(0,1,4,1,"news"),
            (0,2,2,2,"date"),(2,2,2,2,"surf:1")]),
        scene("Named square: Date / Weather / Groceries / blank",[
            (0,0,2,2,"date"),(2,0,2,2,"weather:1"),
            (0,2,2,2,"groceries"),(2,2,2,2,"")]),
        scene("Custom 3×4 Date beside Weather",[
            (0,0,3,4,"date"),(3,0,1,4,"weather:1")]),
        scene("Custom 3×4 Date plus Surf and empty slot",[
            (0,0,3,4,"date"),(3,0,1,2,"surf:2"),(3,2,1,2,"")]),
        scene("Custom 1×4 Date left, 3×4 Date right",[
            (0,0,1,4,"date"),(1,0,3,4,"date")],theme="Dark"),
        scene("Two Date halves; both remain independently assigned",[
            (0,0,2,4,"date"),(2,0,2,4,"date")]),
        scene("Four repeated Dates; no implicit deduplication",[
            (0,0,2,2,"date"),(2,0,2,2,"date"),
            (0,2,2,2,"date"),(2,2,2,2,"date")],theme="Dark"),
        scene("Holidays replace optional art in custom 3×4 Date",[
            (0,0,3,4,"date"),(3,0,1,2,"stocks:1"),(3,2,1,2,"")],
            holidays=[dict(dateLabel="31.10",title="Halloween")]),
        scene("Year rollover in a full 4×4 Date",[
            (0,0,4,4,"date")],year=2026,month0=11,day=31,
            weekday="Thursday",month="December",theme="Dark"),
    ]

def validate_cells(cells):
    # Same 4x4 coverage/unique-slot requirements as native Layout::validateGridLayout.
    occupied=set()
    for cell in cells:
        c,r,w,h=(cell[k] for k in ("col","row","columns","rows"))
        assert 0<=c<4 and 0<=r<4 and 1<=w<=4-c and 1<=h<=4-r
        assert (cell["x"],cell["y"],cell["w"],cell["h"])==(
            c*200,r*120,w*200,h*120)
        for row in range(r,r+h):
            for col in range(c,c+w):
                assert (col,row) not in occupied, ("overlap",cell)
                occupied.add((col,row))
    assert len(occupied)==16, "layout must exactly cover 4x4"

def plans(scenes):
    slots=[(i,j,c,scene["facts"]) for i,scene in enumerate(scenes)
           for j,c in enumerate(scene["cells"]) if c["module"]=="date"]
    stdin="".join(json.dumps(dict(cell={k:c[k] for k in ("x","y","w","h")},
                                  facts=f),ensure_ascii=False)+"\n"
                  for _,_,c,f in slots)
    out=subprocess.run(["node",str(CLI)],input=stdin,
        cwd=ROOT,text=True,capture_output=True,timeout=40)
    if out.returncode:raise RuntimeError(out.stderr)
    lines=out.stdout.splitlines()
    if len(lines)!=len(slots):raise ValueError("Mixed Date plans missing")
    by_scenario={}
    for (i,j,_c,_f),line in zip(slots,lines):
        by_scenario[i,j]=json.loads(line)
    return by_scenario

def rect_inside(a,b):
    return a["w"]>0 and a["h"]>0 and (b["x"]<=a["x"] and
        b["y"]<=a["y"] and a["x"]+a["w"]<=b["x"]+b["w"] and
        a["y"]+a["h"]<=b["y"]+b["h"])

def intersects(a,b):
    return min(a["x"]+a["w"],b["x"]+b["w"])>max(a["x"],b["x"]) and (
        min(a["y"]+a["h"],b["y"]+b["h"])>max(a["y"],b["y"]))

def ink_rects(pl):
    e=pl["editorial"]
    if not pl["accepted"]:return []
    result=list(e["boxes"].values())
    if e["ornaments"]["monthRule"]:result.append(e["ornaments"]["monthRule"])
    if pl["holiday"]["count"]:
        result.append(pl["holiday"]["heading"])
        result.extend(pl["holiday"]["rows"])
    elif e["ornaments"]["botanical"]:
        result.append(e["ornaments"]["botanical"])
    result.extend([pl["dual"]["current"]["rect"],pl["dual"]["next"]["rect"]])
    return result

def checked(scenes,decisions):
    info=dict(scenarios=len(scenes),dateSlots=0,admitted=0,
              legacyFallback=0,mixedAdmitted=0,art=0,holiday=0,
              nativeFramebufferCaptures=0)
    matte=dict(zip(("x","y","w","h"),MATTE))
    for i,scene in enumerate(scenes):
        validate_cells(scene["cells"])
        for j,cell in enumerate(scene["cells"]):
            if cell["module"]!="date":continue
            info["dateSlots"]+=1
            plan=decisions[i,j]
            if not plan["accepted"]:
                info["legacyFallback"]+=1
                continue
            info["admitted"]+=1
            if len(scene["cells"])>1:info["mixedAdmitted"]+=1
            if plan["holiday"]["count"]:info["holiday"]+=1
            elif plan["editorial"]["illustration"]:info["art"]+=1
            for rect in ink_rects(plan):
                assert rect_inside(rect,cell),("cell ink overflow",scene["name"],rect,cell)
                assert rect_inside(rect,matte),("matte overflow",scene["name"],rect)
                for n,other in enumerate(scene["cells"]):
                    if n!=j:assert not intersects(rect,other),(
                        "foreign-module ink collision",scene["name"],rect,other)
    return info

def card(scene,index,decisions,fonts):
    light=scene["theme"]=="Light"
    parts=['<defs><clipPath id="matte%d"><rect x="0" y="0" width="800" height="480"/></clipPath></defs>'%index,
           '<rect width="800" height="480" fill="#c8c8c8"/>',
           '<rect x="0" y="0" width="800" height="480" fill="#f8f8f5"/>',
           '<g clip-path="url(#matte%d)">'%index]
    for j,c in enumerate(scene["cells"]):
        box=(c["x"],c["y"],c["w"],c["h"])
        if c["module"]!="date":
            # These are deliberately placeholders, never other module captures.
            label=("BLANK SLOT" if not c["module"] else
                   "NOT RENDERED: "+c["module"].upper())
            parts.append('<rect x="%d" y="%d" width="%d" height="%d" fill="none" stroke="#888" stroke-dasharray="4 5"/>'%box)
            parts.append('<text x="%d" y="%d" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#888">%s</text>'%(
                c["x"]+c["w"]//2,c["y"]+c["h"]//2,html.escape(label)))
            continue
        pl=decisions[index,j]
        if not pl["accepted"]:
            parts.append('<text x="%d" y="%d" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#777">LEGACY DATE FALLBACK — NOT CAPTURED</text>'%(
                c["x"]+c["w"]//2,c["y"]+c["h"]//2))
            continue
        e=copy.deepcopy(pl["editorial"])
        holidays=pl["holiday"]
        if holidays["count"]:
            e["illustration"]=None
            e["ornaments"]["botanical"]=None
        e["calendar"]=pl["dual"]["current"]
        parts.append(draw_editorial(e,scene["facts"],fonts,glyph_paths,
                                    bbox_markup,lambda *_:""))
        dots=set()
        for day in scene["facts"]["holidays"]:
            from re import match
            m=match(r"(\d{1,2})\.(\d{1,2})",day["dateLabel"])
            if m:dots.add((int(m.group(2)),int(m.group(1))))
        for cal in (pl["dual"]["current"],pl["dual"]["next"]):
            parts.append(render_calendar({**cal,"editorialTitle":True},
                 (scene["facts"]["year"],scene["facts"]["month0"]+1,scene["facts"]["day"]),
                 dots,fonts))
        if holidays["count"]:
            h=holidays["heading"]
            parts.append(glyph_paths("UPCOMING HOLIDAYS",fonts["DM18"],
                                    h["x"],h["y"],"#191919"))
            for label,region in zip(pl["labels"],holidays["rows"]):
                parts.append(glyph_paths(label,fonts["DM18"],
                                         region["x"],region["y"],"#191919"))
    parts+=['</g>','<rect x="0" y="0" width="800" height="480" fill="none" stroke="#888"/>']
    invert=" inverted" if not light else ""
    return ('<article><svg viewBox="0 0 800 480" class="panel%s">'%invert+
            "".join(parts)+'</svg><h3>'+html.escape(scene["name"])+
            '</h3><p>Actual original-GFX Date ink study only. Other modules and legacy Date are placeholders, NOT screenshots or framebuffer pixels.</p></article>')

def generate(output):
    scenes=scenarios()
    plans_=plans(scenes)
    summary=checked(scenes,plans_)
    fonts={name:load_font(FONT_SOURCE,"Remind"+name) for name in
           ("Fraunces72","Fraunces48","DM24","DM18")}
    fonts["S9"]=load_font(FONT_DIR/"FreeSans9ptNO.h","FreeSans9pt8b")
    fonts["B12"]=load_font(FONT_DIR/"FreeSansBold12ptNO.h","FreeSansBold12pt8b")
    cards="".join(card(s,i,plans_,fonts) for i,s in enumerate(scenes))
    page=('<!doctype html><html lang="en"><meta charset="utf-8">'
       '<meta name="viewport" content="width=device-width,initial-scale=1">'
       '<title>RE Date mixed-layout source-ink QA — UNFLASHED</title>'
       '<style>body{margin:0;padding:24px;background:#efeeea;font-family:system-ui;color:#222}'
       'header{max-width:850px;margin:0 auto 24px}h1{font-size:22px}'
       'main{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px}'
       'article{background:white;border:1px solid #ccc;padding:10px;border-radius:8px}'
       'svg{width:100%;display:block}.inverted{filter:invert(1)}'
       '.qa-box{display:none}body.guides .qa-box{display:block}'
       'h3{font-size:15px;margin:12px 0 4px}p{font-size:12px;line-height:1.45}</style>'
       '<header><h1>RE Date — real 800×480 grid, mixed layouts</h1>'
       '<p><strong>NOT A NATIVE FRAMEBUFFER OR OTHER MODULE CAPTURE.</strong> '
       'Only experimental Date ink is from original source-GFX bitmaps and '
       'measured JS/C++-parity geometry. All other modules and legacy Date '
       'are visibly labelled placeholders. The full logical Date viewport is 0,0,800,480; physical housing not approved. '
       'Dark case is an inverted contrast study, not a hardware theme capture. '
       'Custom layouts include multiple Dates and empty cells.</p>'
       '<label><input type="checkbox" onchange="document.body.classList.toggle(\'guides\',this.checked)"> Show original-ink measurement guides</label>'
       '</header><main>'+cards+'</main></html>')
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(page,encoding="utf-8")
    return summary

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    print(json.dumps(generate(args.output),sort_keys=True))
