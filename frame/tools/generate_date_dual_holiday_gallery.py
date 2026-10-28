#!/usr/bin/env python3
"""Standalone source-GFX editorial Date dual-month and holiday REVIEW.
Seven deterministic fixtures; NOT a GxEPD2 framebuffer or flash build.
"""
import argparse
import copy
import html
import json
import re
import subprocess
from pathlib import Path
from generate_date_review_gallery import (ROOT,FONT_SOURCE,FONT_DIR,
    load_font,render_calendar,glyph_paths,bbox_markup)
from date_editorial_svg import draw_editorial

CLI=ROOT/"frame/tests/helpers/date_dual_holiday_visual_cli.mjs"

def scenarios():
    base=dict(day=21,weekday="Wednesday",month="October",
              month0=9,year=2026,holidays=[])
    cell=dict(x=0,y=0,w=800,h=480)
    def scenario(name,overrides=None,area=None):
        return dict(name=name,cell=area or cell,
                    facts={**base,**(overrides or {})})
    return [
        scenario("4×4 / October + November — botanical"),
        scenario("4×4 / December 2026 + January 2027",dict(
            day=31,weekday="Thursday",month="December",month0=11)),
        scenario("4×4 / One upcoming holiday",dict(
            holidays=[dict(dateLabel="31.10",title="Halloween")])),
        scenario("4×4 / Two upcoming holidays",dict(
            holidays=[dict(dateLabel="31.10",title="Halloween"),
                      dict(dateLabel="01.11",title="Family day")])),
        scenario("4×4 / Long holiday label — legacy fallback",dict(
            holidays=[dict(dateLabel="31.10",
                           title="Very long holiday name that cannot fit without cropping")])),
        scenario("4×4 / Unsupported holiday glyph — legacy fallback",dict(
            holidays=[dict(dateLabel="31.10",title="Snowman ☃")])),
        scenario("4×3 / Constraint comparison",area=dict(x=0,y=0,w=800,h=360)),
    ]

def plans(samples):
    p=subprocess.run(["node",str(CLI)],cwd=ROOT,text=True,capture_output=True,
        input="".join(json.dumps(dict(cell=s["cell"],facts=s["facts"]),
                                 ensure_ascii=False)+"\n" for s in samples),timeout=35)
    if p.returncode:raise ValueError(p.stderr)
    data=[json.loads(x) for x in p.stdout.splitlines()]
    if len(data)!=len(samples):raise ValueError("Missing native-aligned candidates")
    return data

def show(sample,plan,fonts,index):
    cell=sample["cell"]; facts=sample["facts"]
    items=[f'<defs><clipPath id="matte{index}"><rect x="58" y="39" width="680" height="436"/></clipPath></defs>',
      '<rect width="800" height="480" fill="#d4d4d4"/>',
      '<rect x="58" y="39" width="680" height="436" fill="#f8f8f6"/>',
      f'<g clip-path="url(#matte{index})">']
    valid=plan["accepted"]
    if valid:
        editorial=copy.deepcopy(plan["editorial"])
        dual=plan["dual"]
        holiday=plan["holiday"]
        if holiday["count"]:
            editorial["illustration"]=None
            editorial["ornaments"]["botanical"]=None
        editorial["calendar"]=dual["current"]
        # All factual F1 bitmaps plus optional native-source 1-bit strokes.
        # Override the previous single-month grid with two measured months.
        items.append(draw_editorial(editorial,facts,fonts,glyph_paths,
                                   bbox_markup,lambda *_:""))
        dots=set()
        for item in facts["holidays"]:
            match=re.match(r"(\d{1,2})\.(\d{1,2})",item["dateLabel"])
            if match:dots.add((int(match.group(2)),int(match.group(1))))
        today=(facts["year"],facts["month0"]+1,facts["day"])
        for month in (dual["current"],dual["next"]):
            items.append(render_calendar(month,today,dots,fonts))
            items.append(bbox_markup(month["rect"],"#759075"))
        if holiday["count"]:
            header=holiday["heading"]
            items.append(glyph_paths("UPCOMING HOLIDAYS",fonts["DM18"],
                                     header["x"],header["y"],"#171717"))
            for text,area in zip(plan["labels"],holiday["rows"]):
                items.append(glyph_paths(text,fonts["DM18"],
                    area["x"],area["y"],"#171717"))
                items.append(bbox_markup(area,"#9c8266"))
    items+=['</g>',
      '<rect x="58" y="39" width="680" height="436" fill="none" stroke="#aaa"/>']
    if not valid:
        items.append('<text x="400" y="240" text-anchor="middle" '
          'fill="#777" font-size="24">Legacy fallback — no candidate drawn</text>')
    return ('<article><svg viewBox="0 0 800 480" role="img" aria-label="'
      +html.escape(sample["name"])+'">'+"".join(items)+'</svg>'
      +'<h3>'+html.escape(sample["name"])+'</h3>'
      +'<p>'+("Dual-calendar + complete text candidate" if valid else
              "Safe legacy fallback")+
        ". Offline original-GFX visual study, not verified frame pixels.</p></article>")

def generate(output):
    fonts={}
    for name in ("Fraunces72","Fraunces48","DM24","DM18"):
        fonts[name]=load_font(FONT_SOURCE,"Remind"+name)
    fonts["S9"]=load_font(FONT_DIR/"FreeSans9ptNO.h","FreeSans9pt8b")
    fonts["B12"]=load_font(FONT_DIR/"FreeSansBold12ptNO.h","FreeSansBold12pt8b")
    samples=scenarios()
    decisions=plans(samples)
    accepted=sum(bool(p["accepted"]) for p in decisions)
    holidays=sum(bool(p["accepted"] and p["holiday"]["count"]) for p in decisions)
    rolled=sum(bool(p["accepted"] and p["dual"]["next"]["showYear"]) for p in decisions)
    panels="".join(show(s,p,fonts,i) for i,(s,p) in enumerate(zip(samples,decisions)))
    css="""<style>
    body{font-family:system-ui,sans-serif;background:#ecebe8;color:#222;margin:0;padding:25px}
    header{max-width:900px;margin:auto auto 28px}h1{font-size:24px}p{font-size:14px;line-height:1.5}
    main{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px}
    article{padding:12px;border:1px solid #ccc;border-radius:8px;background:white}
    svg{width:100%;display:block}h3{font-size:15px;margin:12px 0 4px}
    article p{font-size:12px;color:#666;margin:0 0 5px}
    body.dark svg{filter:invert(1)}body.hide .qa-box{display:none}
    </style>"""
    toggles="""<label><input type="checkbox" id="dark"> Invert black/white inspection</label>
    <label><input type="checkbox" id="guides"> Show measurement guides</label>
    <script>document.getElementById('dark').addEventListener('change',e=>
      document.body.classList.toggle('dark',e.target.checked));
    document.getElementById('guides').addEventListener('change',e=>
      document.body.classList.toggle('hide',!e.target.checked));</script>"""
    body=('<!doctype html><html lang="en"><meta charset="utf-8">'
      '<meta name="viewport" content="width=device-width,initial-scale=1">'
      '<title>RE:MIND Date 4x4 dual calendar and holiday visual QA</title>'+css+
      '<body class="hide"><header><h1>RE:MIND Date vNext — full editorial composition</h1>'
      '<p><strong>EXPERIMENTAL OFFLINE SIMULATION — NOT A FRAME CAPTURE.</strong> '
      'Original Fraunces/DM Sans and FreeSans GFX pixels, 800×480 panel, '
      'physical matte x58/y39/w680/h436. Second month and fully measured '
      'holiday labels included; optional botanical uses exact native '
      'C++ stroke endpoints with software 1-bit Bresenham pixels. '
      'This is still NOT a GxEPD2 framebuffer; the actual C++ painter '
      'may reject additional candidates after strict '
      'calendar font checks. Compare with the 100-page Layout Lab 4×4 PDF '
      'before approving artwork or density.</p>'+toggles+'</header><main>'
      +panels+'</main></html>')
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(body,encoding="utf-8")
    return dict(total=len(samples),admitted=accepted,
                holidaysRendered=holidays,yearRollover=rolled,
                fallback=len(samples)-accepted)

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--output",type=Path,required=True)
    args=p.parse_args()
    print(json.dumps(generate(args.output),sort_keys=True))
