#!/usr/bin/env python3
"""RE:MIND Date role-first VISUAL review. No firmware, hardware or production imports.

Run: python3 frame/tools/generate_date_review_gallery.py --output /tmp/date-review.html
Uses ORIGINAL F1 bitmap arrays and GFX bearings, not browser fallback fonts.
The calendar is a source-faithful *simulation* of the unchanged legacy painter,
NOT a captured GxEPD2 framebuffer. All decisions are labelled experimental.
"""
import argparse
import calendar
import html
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from date_editorial_svg import draw_editorial

ROOT=Path(__file__).resolve().parents[2]
FONT_SOURCE=ROOT/"frame/src/assets/fonts/RemindEditorialFonts.cpp"
FONT_DIR=ROOT/"frame/src/assets/fonts"
CLI=ROOT/"frame/tests/helpers/date_review_cases_cli.mjs"

@dataclass
class Font:
    bitmap: bytes
    glyphs: list

def load_font(path, name):
    src=path.read_text(encoding="utf-8")
    def block(suffix):
        pattern=rf"(?:static\s+)?const\s+(?:uint8_t|GFXglyph)\s+{re.escape(name+suffix)}\[\]\s+PROGMEM\s*=\s*\{{(.*?)\s+\}};"
        found=re.search(pattern,src,re.S)
        if not found:
            raise ValueError(f"Missing GFX {name+suffix}: {path}")
        return found.group(1)
    bits=bytes(int(b,16) for b in re.findall(r"0x([0-9a-fA-F]{2})",block("Bitmaps")))
    glyphs=[tuple(map(int,m)) for m in re.findall(
        r"\{\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\}",block("Glyphs"))]
    if len(glyphs)!=224 or not bits:
        raise ValueError(f"Incomplete GFX font: {name}: {len(glyphs)}")
    return Font(bits,glyphs)

def metrics(text,font):
    cursor=0
    left=top=10**9
    right=bottom=-10**9
    for char in text:
        cp=ord(char)
        if cp<32 or cp>255:
            raise ValueError(f"Unsupported in visual review: {text!r}")
        _,w,h,adv,dx,dy=font.glyphs[cp-32]
        if w>0 and h>0:
            left=min(left,cursor+dx);right=max(right,cursor+dx+w)
            top=min(top,dy);bottom=max(bottom,dy+h)
        cursor+=adv
    if left==10**9:
        raise ValueError("No visible ink")
    return (left,top,right-left,bottom-top)

def glyph_paths(text,font,ink_x,ink_y,fill):
    minx,miny,_,_=metrics(text,font)
    pen=int(ink_x)-minx
    baseline=int(ink_y)-miny
    paths=[]
    for char in text:
        cp=ord(char)
        offset,w,h,advance,dx,dy=font.glyphs[cp-32]
        if w>0 and h>0:
            terms=[]
            for gy in range(h):
                x=0
                while x<w:
                    bit=gy*w+x
                    on=lambda n: bool(font.bitmap[offset+n//8] & (0x80>>(n%8)))
                    if not on(bit):
                        x+=1
                        continue
                    start=x
                    while x<w and on(gy*w+x):
                        x+=1
                    terms.append(f"M{pen+dx+start},{baseline+dy+gy}h{x-start}v1h{- (x-start)}z")
            if terms:
                paths.append('<path fill="'+fill+'" d="'+"".join(terms)+'"/>')
        pen+=advance
    return "".join(paths)

def text_centered(text,font,x,y,w,h,fill):
    _,_,tw,th=metrics(text,font)
    ix=int(x+(w-tw)//2); iy=int(y+(h-th)//2)
    return glyph_paths(text,font,ix,iy,fill)

def bbox_markup(rect,color):
    return f'<rect class="qa-box" x="{rect["x"]}" y="{rect["y"]}" width="{rect["w"]}" height="{rect["h"]}" fill="none" stroke="{color}" stroke-width="1" stroke-dasharray="3 3"/>'

def render_calendar(entry,today,holiday_set,fonts):
    if not entry:
        return ""
    box=entry["rect"]
    year=entry["year"]; month=entry["month0"]+1
    opts=entry["features"]
    title=bool(opts["showMonthTitle"]); dow=bool(opts["showDowHeader"])
    weeks=bool(opts["showWeekNums"])
    offset=calendar.monthrange(year,month)[0]
    dim=calendar.monthrange(year,month)[1]
    rows=min(6,max(4,(offset+dim+6)//7))
    titleH=22 if title else 0
    titleGap=10 if title else 0
    dowH=18 if dow else 0
    weekW=26 if weeks else 0
    availW=box["w"]-24; availH=box["h"]-16
    cw=(availW-weekW)//7
    ch=(availH-titleH-titleGap-dowH)//rows
    if cw<9 or ch<10 or availH<titleH+titleGap+dowH+60:
        return '<text x="'+str(box["x"])+'" y="'+str(box["y"]+12)+'" fill="#888" font-size="9">CAL GRID DOES NOT FIT</text>'
    bw=weekW+7*cw; bh=titleH+titleGap+dowH+rows*ch
    bx=box["x"]+(box["w"]-bw)//2; by=box["y"]+(box["h"]-bh)//2
    top=by
    ink="#222"
    out=[]
    if title:
        month_name=calendar.month_name[month]
        out.append(text_centered(month_name,fonts["B12"],bx,top,bw,titleH,ink))
        top+=titleH+titleGap
    dowx=bx+weekW
    if dow:
        for i,label in enumerate(("Mo","Tu","We","Th","Fr","Sa","Su")):
            out.append(text_centered(label,fonts["S9"],dowx+i*cw,top,cw,dowH,ink))
    gridtop=top+dowH
    if weeks:
        out.append(f'<path stroke="#222" stroke-width="1" d="M{bx+weekW-1} {gridtop+2}v{rows*ch-4}"/>')
        for row in range(rows):
            firstday=row*7-offset+1
            lastday=firstday+6
            if lastday<1 or firstday>dim:
                continue
            sample=min(dim,max(1,firstday))
            iso=__import__("datetime").date(year,month,sample).isocalendar().week
            out.append(text_centered(str(iso),fonts["S9"],bx+2,gridtop+row*ch,18,ch,ink))
    for day in range(1,dim+1):
        index=offset+day-1
        row,col=divmod(index,7)
        cx=dowx+col*cw
        cy=gridtop+row*ch
        is_today=(year,month,day)==today
        if is_today:
            rad=min(16,max(1,min(cw,ch)//2-2))
            out.append(f'<circle cx="{cx+cw//2}" cy="{cy+ch//2}" r="{rad}" fill="none" stroke="#292929" stroke-width="1.2"/>')
        out.append(text_centered(str(day),fonts["S9"],cx,cy,cw,ch,"#000" if is_today else ink))
        if (month,day) in holiday_set:
            out.append(f'<circle cx="{cx+cw//2}" cy="{cy+ch-3}" r="2" fill="#000"/>')
    return "".join(out)

def sample_inputs():
    cases=[]
    presets=[
      ("ordinary",dict(day=27,weekday="Tuesday",month="October",month0=9,year=2026,nextMonth0=10,nextMonthYear=2026,holidays=[])),
      ("year-turn",dict(day=31,weekday="Thursday",month="December",month0=11,year=2026,nextMonth0=0,nextMonthYear=2027,holidays=[dict(dateLabel="01.01",title="New Year")])),
      ("long",dict(day=30,weekday="Wednesday",month="September",month0=8,year=2026,nextMonth0=9,nextMonthYear=2026,holidays=[])),
      ("holiday",dict(day=17,weekday="Sunday",month="May",month0=4,year=2026,nextMonth0=5,nextMonthYear=2026,holidays=[dict(dateLabel="17.05",title="Constitution Day")])),
    ]
    # All 16 shapes get a centered-ish example. Every one of the 100 legal
    # placements is included exactly once as an independent QA sample.
    for cw in range(1,5):
        for rh in range(1,5):
            x=(4-cw)//2;y=(4-rh)//2
            label,scenario=presets[(cw*5+rh)%len(presets)]
            cases.append(dict(kind="size",title=f"{cw}x{rh} · {label}",size=f"{cw}x{rh}",
                x=x,y=y,cw=cw,rh=rh,facts=scenario))
    n=0
    for cw in range(1,5):
        for rh in range(1,5):
            for x in range(5-cw):
                for y in range(5-rh):
                    label,scenario=presets[n%len(presets)]
                    cases.append(dict(kind="placement",title=f"Position {n+1}: {cw}x{rh} · {label}",
                      size=f"{cw}x{rh}",x=x,y=y,cw=cw,rh=rh,facts=scenario))
                    n+=1
    assert len(cases)==116 and n==100
    return cases

def get_plans(cases):
    p=subprocess.run(["node",str(CLI)],cwd=ROOT,input="".join(json.dumps({
        "cell":dict(x=c["x"]*200,y=c["y"]*120,w=c["cw"]*200,h=c["rh"]*120),
        "facts":c["facts"]})+"\n" for c in cases),text=True,capture_output=True,timeout=30)
    if p.returncode!=0:
        raise RuntimeError(p.stderr)
    data=[json.loads(line) for line in p.stdout.splitlines()]
    if len(data)!=len(cases):
        raise ValueError(f"Expected {len(cases)} plans, received {len(data)}")
    return data

def render_tile(case, result, fonts, serial):
    cell=dict(x=case["x"]*200,y=case["y"]*120,w=case["cw"]*200,h=case["rh"]*120)
    facts=case["facts"]
    context=result.get("context")
    hero=result.get("hero")
    editorial=result.get("editorial")
    # Only a *three-fact* plan can be considered by the current C++ role
    # painter. JS partial disclosure is not incorrectly shown as firmware.
    if context and context.get("disclosed")!=["day","month","weekday"]:
        context=None
    if hero is None:
        context=None
    arts=[f'<defs><clipPath id="matte{serial}"><rect x="58" y="39" width="680" height="436"/></clipPath></defs>',
          '<rect width="800" height="480" fill="#d1d1d1"/>',
          '<rect x="58" y="39" width="680" height="436" fill="#f9f9f7"/>',
          f'<g clip-path="url(#matte{serial})">',
          f'<rect x="{cell["x"]}" y="{cell["y"]}" width="{cell["w"]}" height="{cell["h"]}" fill="#fff"/>']
    if editorial:
        arts.append(draw_editorial(editorial,facts,fonts,glyph_paths,bbox_markup,render_calendar))
    elif hero:
        for key in ("day","month","weekday"):
            area=hero[key]
            font=fonts[hero["fonts"][key]]
            arts.append(glyph_paths(hero["text"][key],font,area["x"],area["y"],"#191919"))
            arts.append(bbox_markup(area,{"day":"#b45e2d","month":"#5c7790","weekday":"#5c7790"}[key]))
    if context and not editorial:
        if context["year"]:
            t=context["year"]
            arts.append(glyph_paths(t["text"],fonts[t["font"]],t["rect"]["x"],t["rect"]["y"],"#333"))
        holidays=set()
        for item in facts["holidays"]:
            m=re.match(r"(\d{1,2})\.(\d{1,2})",item["dateLabel"])
            if m:
                holidays.add((int(m.group(2)),int(m.group(1))))
        for cal in (context["calendar"],context["nextCalendar"]):
            if cal:
                arts.append(render_calendar(cal,(facts["year"],facts["month0"]+1,facts["day"]),holidays,fonts))
                arts.append(bbox_markup(cal["rect"],"#708b6f"))
        for h in context["holidays"]:
            arts.append(glyph_paths(h["text"],fonts[h["font"]],h["rect"]["x"],h["rect"]["y"],"#333"))
        for area in (context["year"], *context["holidays"]):
            if area:
                arts.append(bbox_markup(area["rect"],"#a87a44"))
    arts.append('</g>')
    arts.append(f'<rect x="{cell["x"]}" y="{cell["y"]}" width="{cell["w"]}" height="{cell["h"]}" fill="none" stroke="#a3a3a3" stroke-width="2"/>')
    arts.append('<rect x="58" y="39" width="680" height="436" stroke="#888" stroke-width="1" fill="none"/>')
    status="FULL EDITORIAL DATE + CALENDAR + ART CONCEPT" if editorial else "3-fact candidate" if hero else "No full 3-fact fit — legacy fallback"
    if hero and context and not editorial:
        status+=", contextual reservation candidate"
    if hero and not context and not editorial:
        status+=", no context approved"
    svg='<svg viewBox="0 0 800 480" role="img" aria-label="'+html.escape(case["title"])+'">'+ "".join(arts)+"</svg>"
    return (f'<article class="tile" data-kind="{case["kind"]}" data-size="{case["size"]}">'
      f'<div class="preview">{svg}</div>'
      f'<h3>{html.escape(case["title"])}</h3>'
      f'<p>{html.escape(status)}. Experimental pixel-font simulation.</p></article>')

def generate(output):
    fonts={}
    for key in ("Fraunces72","Fraunces48","DM24","DM18"):
        fonts[key]=load_font(FONT_SOURCE,"Remind"+key)
    fonts["S9"]=load_font(FONT_DIR/"FreeSans9ptNO.h","FreeSans9pt8b")
    fonts["B12"]=load_font(FONT_DIR/"FreeSansBold12ptNO.h","FreeSansBold12pt8b")
    cases=sample_inputs()
    plans=get_plans(cases)
    tiles=[render_tile(case,plan,fonts,i) for i,(case,plan) in enumerate(zip(cases,plans))]
    summary=dict(total=len(cases),shapes=16,placements=100,
                 fullCore=sum(bool(x["hero"]) for x in plans),
                 contextCandidates=sum(bool(x["context"]) for x in plans),
                 editorialCandidates=sum(bool(x["editorial"]) for x in plans))
    css="""<style>
    body{margin:0;padding:24px;font-family:system-ui,sans-serif;background:#ebebeb;color:#222}
    header{max-width:1050px;margin:auto auto 20px}
    header h1{font-size:23px;letter-spacing:-.03em;margin:0}
    header p{font-size:14px;line-height:1.5;max-width:900px}
    .controls{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:16px 0}
    select,label{font:inherit;font-size:14px}
    .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;max-width:1600px;margin:auto}
    .tile{background:white;border:1px solid #ccc;padding:9px;border-radius:8px}
    .tile h3{font-size:13px;margin:7px 0 3px}
    .tile p{font-size:11px;color:#555;margin:0 0 7px}
    .preview{background:#dadada;aspect-ratio:5/3;display:flex;align-items:center}
    svg{width:100%;height:100%}
    body.dark .preview svg{filter:invert(1)}
    body.hidebox .qa-box{display:none}
    .tile.hidden{display:none}
    footer{max-width:1200px;margin:24px auto;font-size:12px}
    </style>"""
    controls="""<div class="controls">
      <label>Set <select id="kind"><option value="size">16 grid sizes</option><option value="placement">100 placements</option><option value="all">All 116</option></select></label>
      <label>Cell <select id="size"><option value="all">All cell shapes</option></select></label>
      <label><input id="dark" type="checkbox"> Inverted grayscale inspection</label>
      <label><input id="outlines" type="checkbox" checked> Show measured ink boxes</label>
    </div>"""
    js="""<script>
    const kind=document.querySelector('#kind'), size=document.querySelector('#size');
    for(let w=1;w<=4;w++)for(let h=1;h<=4;h++){
      const o=document.createElement('option');o.value=w+'x'+h;o.textContent=w+'x'+h;size.append(o);
    }
    const cards=[...document.querySelectorAll('.tile')];
    function apply(){
      for(const c of cards)c.classList.toggle('hidden',
        (kind.value!=='all'&&c.dataset.kind!==kind.value)||
        (size.value!=='all'&&c.dataset.size!==size.value));
      document.body.classList.toggle('dark',document.querySelector('#dark').checked);
      document.body.classList.toggle('hidebox',!document.querySelector('#outlines').checked);
    }
    for(const el of document.querySelectorAll('select,input'))el.addEventListener('change',apply);
    apply();
    </script>"""
    doc=('<!doctype html><html lang="en"><meta charset="utf-8">'
     '<meta name="viewport" content="width=device-width,initial-scale=1">'
     '<title>RE:MIND Date vNext — original F1 pixel-font review</title>'+css
     +'<header><h1>RE:MIND Date vNext • original F1 pixel-font review</h1>'
     +'<p><strong>OFFLINE SIMULATION ONLY — NOT APPROVED FRAME OUTPUT.</strong> '
      'The Date lettering uses original Fraunces/DM Sans GFX 1-bit bitmap glyphs from repository F1 assets. '
      'Calendar uses the legacy FreeSans font bitmaps and source-matched grid calculations; this is '
      '<em>not</em> a captured GxEPD2 framebuffer. C++ preview has additional preflight/fallback rules '
      'that can reject a shown candidate. Use for legibility/layout review, not proof of actual firmware rendering. Editorial botanical SVG is a visual direction only, NOT a firmware asset.</p>'
     +f'<p>16 size fixtures + 100 legal placements = {summary["total"]} views; '
       f'{summary["fullCore"]} can fit full Date glyphs; {summary["contextCandidates"]} show contextual candidates. '
      'Panel 800×480, visible matte x58 y39 w680 h436. No Surf or other module content is simulated.</p>'
     +controls+'</header><main class="gallery">'+''.join(tiles)+'</main>'
     +'<footer>Static report, no requests, no telemetry, no runtime configuration. '
      'Dark mode is an inverted preview, not the e-paper grayscale waveform. '
      'Generated from this PR head; do not flash based on this report.</footer>'
     +js+'</html>')
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(doc,encoding="utf-8")
    return summary

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    print(json.dumps(generate(args.output),sort_keys=True))
