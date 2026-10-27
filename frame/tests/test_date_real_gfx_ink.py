"""Date vNext: exact recovered F1 glyph ink metrics, without runtime imports.

This is a source-derived F2-metrics equivalence check. It does NOT validate
original screen bitmap pixels or approve real physical display readability.
"""
import json
from collections import defaultdict
from itertools import product
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]
FIXTURE=json.loads((ROOT/"shared/date-gfx-metrics.json").read_text(encoding="utf-8"))
CLI=ROOT/"frame/tests/helpers/date_gfx_ink_cli.mjs"
CPP=ROOT/"frame/tests/helpers/date_policy_cpp_cli.cpp"
MONTHS=("January","February","March","April","May","June",
        "July","August","September","October","November","December")
DAYS=("Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday")


def invoke_js(requests):
    process=subprocess.run(["node",str(CLI)],cwd=ROOT,text=True,check=True,
                           capture_output=True,timeout=50,
                           input="".join(json.dumps(r,ensure_ascii=False)+"\n" for r in requests))
    rows=[json.loads(row) for row in process.stdout.splitlines()]
    assert len(rows)==len(requests),process.stderr
    return rows


def reference_ink(label,font):
    text=label
    glyphs=FIXTURE["fonts"][font]
    cursor=0
    xs,ys=[],[]
    for char in text:
        code=ord(char)
        if code<0x20 or code>0xFF:return None
        width,height,advance,dx,dy=glyphs[code-0x20]
        if width and height:
            xs.extend((cursor+dx,cursor+dx+width))
            ys.extend((dy,dy+height))
        cursor+=advance
    if not xs:return None
    return dict(w=max(xs)-min(xs),h=max(ys)-min(ys),minX=min(xs),
                minY=min(ys),advanceX=cursor)


def test_original_gfx_provenance_and_generated_binding():
    assert FIXTURE["source"]["blobSha"]=="ce233c113d28bf9be01bbfdfb6d9ad9cac488495"
    assert FIXTURE["measurementOnly"] is True
    assert FIXTURE["fields"]==["width","height","xAdvance","xOffset","yOffset"]
    for key in ("Fraunces72","Fraunces48","DM24","DM18"):
        assert len(FIXTURE["fonts"][key])==224
    subprocess.run(["python3","shared/generate_date_gfx_metrics.py","--check"],
                   cwd=ROOT,check=True,capture_output=True,text=True,timeout=10)


def test_true_f1_ink_bounds_follow_f2_advance_and_bearings():
    # 2,604 date-strings plus accented strings and explicit unsupported glyphs;
    # compare per-font original GFX width/height, actual bounds, advance.
    samples=["%s %d %s"%(weekday,day,month)
             for day,weekday,month in product(range(1,32),DAYS,MONTHS)]
    samples+=["ÅØÆ æøå","Lørdag 31. desember","Måned", "A Ø Å",
              "31","1","", "   ", "🙂","×","°","é"]
    requests=[{"measure":{"text":s,"font":font}} for s in samples
              for font in FIXTURE["fonts"]]
    values=invoke_js(requests)
    for request,result in zip(requests,values):
        val=request["measure"]
        label=val["text"]
        # Normalizer behavior for emoji rejected; NFC inputs have same codepoints.
        assert result["metrics"]==reference_ink(label,val["font"]),val
    assert len(requests)==(31*7*12+12)*4


def inside(inner,outer):
    return inner["w"]>0 and inner["h"]>0 and (
        outer["x"]<=inner["x"]<inner["x"]+inner["w"]<=outer["x"]+outer["w"]
        and outer["y"]<=inner["y"]<inner["y"]+inner["h"]<=outer["y"]+outer["h"])


def crosses(a,b):
    return min(a["x"]+a["w"],b["x"]+b["w"])>max(a["x"],b["x"]) and (
        min(a["y"]+a["h"],b["y"]+b["h"])>max(a["y"],b["y"]))


def test_real_f1_font_measures_feed_same_cpp_layout_across_100_locations(tmp_path):
    exe=tmp_path/"cpp_date_layout"
    subprocess.run(["g++","-std=c++11","-Wall","-Wextra","-Werror",
                    "-I",str(ROOT/"frame/src/display"),str(CPP),"-o",str(exe)],
                   cwd=ROOT,check=True,capture_output=True,text=True,timeout=35)
    labels=[
        {"day":1,"weekday":"Sunday","month":"May"},
        {"day":31,"weekday":"Wednesday","month":"September"},
        {"day":30,"weekday":"Thursday","month":"December"},
        {"day":8,"weekday":"Monday","month":"July"},
        {"day":2,"weekday":"Saturday","month":"February"},
        {"day":17,"weekday":"Wednesday","month":"January"},
        {"day":27,"weekday":"Tuesday","month":"October"},
        {"day":29,"weekday":"Friday","month":"August"},
    ]
    requests=[];gridkeys=[]
    for cw,rh in product(range(1,5),repeat=2):
        for col,row in product(range(5-cw),range(5-rh)):
            cell=dict(x=col*200,y=row*120,w=cw*200,h=rh*120)
            for facts in labels:
                requests.append({"cell":cell,"facts":facts})
                gridkeys.append((cw,rh,col,row))
    assert len(requests)==800 and len(set(gridkeys))==100
    results=invoke_js(requests)
    cxx_inputs=[]
    valid=[]
    for request,result in zip(requests,results):
        if not result["valid"]:continue
        boxes=result["boxes"];ink=result["ink"]
        assert inside(boxes["group"],boxes["visible"])
        for part in ("day","month","weekday"):
            assert inside(boxes[part],boxes["group"])
            assert boxes[part]["w"]==ink[part]["w"]
            assert boxes[part]["h"]==ink[part]["h"]
        assert inside(boxes["visible"],dict(x=58,y=39,w=680,h=436))
        assert not any(crosses(boxes[a],boxes[b]) for a,b in (
            ("day","month"),("day","weekday"),("weekday","month")))
        assert result["fonts"]["day"] in ("Fraunces72","Fraunces48")
        c=request["cell"]
        cxx_inputs.append(" ".join(str(v) for v in
            (c["x"],c["y"],c["w"],c["h"],
             ink["day"]["w"],ink["day"]["h"],
             ink["month"]["w"],ink["month"]["h"],
             ink["weekday"]["w"],ink["weekday"]["h"]))+"\n")
        valid.append(result)
    assert len(valid)>0 and len(valid)<len(requests)
    proc=subprocess.run([str(exe)],cwd=ROOT,input="".join(cxx_inputs),
                        text=True,check=True,capture_output=True,timeout=40)
    values=proc.stdout.splitlines()
    assert len(values)==len(valid)
    for actual,result in zip(values,valid):
        boxes=result["boxes"]
        expected=result["mode"]+"|"+"|".join(
            ",".join(str(boxes[k][f]) for f in ("x","y","w","h"))
            for k in ("visible","group","month","day","weekday"))
        assert actual==expected, (actual,expected)
    # Different day/month strings (same grid) must not force identical ink
    # positions, metric or font decisions.
    grouped=defaultdict(set)
    for key,result in zip(gridkeys,results):
        if result["valid"]:
            grouped[key].add(json.dumps([result["mode"],result["boxes"],
                                         result["fonts"]],sort_keys=True))
    assert any(len(outcomes)>1 for outcomes in grouped.values())


def test_unsupported_facts_safely_fail_no_half_plan():
    c={"x":0,"y":0,"w":200,"h":240}
    inputs=[
        {"cell":c,"facts":{"day":31,"month":"October","weekday":"☃"}},
        {"cell":c,"facts":{"day":0,"month":"October","weekday":"Friday"}},
        {"cell":c,"facts":{"day":32,"month":"October","weekday":"Friday"}},
        {"cell":c,"facts":{"day":1,"month":"","weekday":"Friday"}},
        {"cell":c,"facts":{"day":1,"month":"May","weekday":"🙂"}},
    ]
    assert all(not r["valid"] for r in invoke_js(inputs))
