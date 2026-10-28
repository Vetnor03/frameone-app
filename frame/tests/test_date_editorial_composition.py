"""Editorial Date is a measured candidate, not a grid-span preset or live renderer.

Original visual benchmark: RE-MIND-layout-review-100 (2).pdf p1, seed 347015390.
"""
import json
from itertools import product
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]
CLI=ROOT/"frame/tests/helpers/date_review_cases_cli.mjs"

def plan(requests):
    proc=subprocess.run(["node",str(CLI)],cwd=ROOT,
        input="".join(json.dumps(x,ensure_ascii=False)+"\n" for x in requests),
        capture_output=True,text=True,timeout=40)
    assert proc.returncode==0,proc.stderr
    return [json.loads(s)["editorial"] for s in proc.stdout.splitlines()]

def inside(a,b):
    return a["w"]>0 and a["h"]>0 and (
        b["x"]<=a["x"]<a["x"]+a["w"]<=b["x"]+b["w"] and
        b["y"]<=a["y"]<a["y"]+a["h"]<=b["y"]+b["h"])

def overlapping(a,b):
    return min(a["x"]+a["w"],b["x"]+b["w"])>max(a["x"],b["x"]) and (
        min(a["y"]+a["h"],b["y"]+b["h"])>max(a["y"],b["y"]))

def test_original_fullscreen_date_is_a_complete_editorial_ensemble():
    fixture=dict(day=21,month="October",weekday="Wednesday",
                 year=2026,month0=9,holidays=[])
    request=dict(cell=dict(x=0,y=0,w=800,h=480),facts=fixture)
    result=plan([request])[0]
    assert result is not None, "Original PDF 4x4 must not degrade into date-only"
    assert result["kind"]=="editorial-two-column"
    assert result["calendar"]["year"]==2026
    assert result["calendar"]["month0"]==9
    assert result["calendar"]["features"]["showMonthTitle"]
    assert result["calendar"]["features"]["showDowHeader"]
    assert result["text"]==dict(day="21",month="October",
                                weekday="Wednesday",year="2026")
    assert result["illustration"]["role"]=="botanical-sprig"
    assert inside(result["ornaments"]["botanical"],result["regions"]["hero"])
    assert inside(result["calendar"]["rect"],result["regions"]["calendar"])

def test_full_date_and_real_calendar_never_overlap_over_100_cell_placements():
    samples=[
        dict(day=21,month="October",weekday="Wednesday",year=2026,month0=9,holidays=[]),
        dict(day=31,month="December",weekday="Thursday",year=2026,month0=11,holidays=[]),
        dict(day=30,month="September",weekday="Wednesday",year=2099,month0=8,holidays=[]),
        dict(day=1,month="May",weekday="Friday",year=2026,month0=4,holidays=[]),
        dict(day=17,month="May",weekday="Sunday",year=2026,month0=4,
             holidays=[dict(dateLabel="17.05",title="Constitution Day")]),
    ]
    requests=[]
    for cw,rh in product(range(1,5),repeat=2):
        for col,row in product(range(5-cw),range(5-rh)):
            cell=dict(x=col*200,y=row*120,w=cw*200,h=rh*120)
            for facts in samples:requests.append(dict(cell=cell,facts=facts))
    assert len(requests)==500
    results=plan(requests)
    accepted=0
    for req,item in zip(requests,results):
        if req["facts"]["holidays"]:
            assert item is None  # fail closed until holiday roles integrated
        if item is None:continue
        accepted+=1
        matte=dict(x=58,y=39,w=680,h=436)
        assert inside(item["visible"],matte)
        assert inside(item["safe"],item["visible"])
        rects=list(item["boxes"].values())+[item["calendar"]["rect"]]
        assert all(inside(x,item["safe"]) for x in rects)
        for i,a in enumerate(rects):
            assert not any(overlapping(a,b) for b in rects[i+1:])
        assert not overlapping(item["regions"]["hero"],item["calendar"]["rect"])
        assert item["text"]["day"]==str(req["facts"]["day"])
        assert item["text"]["month"]==req["facts"]["month"]
        assert item["text"]["weekday"]==req["facts"]["weekday"]
        assert item["text"]["year"]==str(req["facts"]["year"])
    assert accepted>0
    assert plan([dict(cell=dict(x=0,y=0,w=200,h=120),facts=samples[0])])[0] is None

def test_no_shape_specific_expression_or_runtime_wiring():
    s=(ROOT/"app/lib/dateEditorialComposition.mjs").read_text()
    assert "colSpan" not in s and "rowSpan" not in s
    assert "grid4x4" not in s and "fourByThree" not in s
    assert "measureDateGfxInk as measure" in s
    assert "dateCalendarFeatures" in s
    assert "return candidates[0]??null" in s
    assert "holiday" in s
    mod=(ROOT/"frame/src/modules/ModuleDate.cpp").read_text()
    assert "dateEditorialComposition" not in mod
