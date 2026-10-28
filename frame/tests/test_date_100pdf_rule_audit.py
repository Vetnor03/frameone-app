"""Final Layout Lab audit regression suite (Date experimental branch only).

Sources: reviewed 100-page PDFs, role-first contract, phase-0 physical rules.
A green geometry test is NOT visual approval nor production/firmware parity.
"""
import json
from itertools import product
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]
CLI=ROOT/"frame/tests/helpers/date_review_cases_cli.mjs"

def plans(requests):
    process=subprocess.run(["node",str(CLI)],cwd=ROOT,
        input="".join(json.dumps(r,ensure_ascii=False)+"\n" for r in requests),
        text=True,capture_output=True,timeout=70)
    assert process.returncode==0,process.stderr
    result=[json.loads(line)["editorial"] for line in process.stdout.splitlines()]
    assert len(result)==len(requests)
    return result

def rectangle_inside(a,b):
    return a["w"]>0 and a["h"]>0 and (
        b["x"]<=a["x"] and b["y"]<=a["y"] and
        a["x"]+a["w"]<=b["x"]+b["w"] and
        a["y"]+a["h"]<=b["y"]+b["h"])

def overlap(a,b):
    return min(a["x"]+a["w"],b["x"]+b["w"])>max(a["x"],b["x"]) and (
        min(a["y"]+a["h"],b["y"]+b["h"])>max(a["y"],b["y"]))

def facts(day=21,month="October",weekday="Wednesday",
          year=2026,month0=9,holidays=None,theme="light"):
    return dict(day=day,month=month,weekday=weekday,
                year=year,month0=month0,
                holidays=[] if holidays is None else holidays,theme=theme)

def test_pdf_4x4_original_editorial_design_retains_full_calendar_and_art():
    case=dict(cell=dict(x=0,y=0,w=800,h=480),facts=facts())
    item=plans([case])[0]
    assert item and item["kind"]=="editorial-two-column"
    assert item["illustration"] and item["ornaments"]["monthRule"]
    assert item["calendar"]["year"]==2026 and item["calendar"]["month0"]==9
    assert item["calendar"]["features"]["showMonthTitle"]
    assert item["calendar"]["features"]["showDowHeader"]
    assert item["fonts"]["day"]=="Fraunces72"
    assert item["fonts"]["month"]=="DM24"
    assert item["text"]==dict(day="21",month="October",
                               weekday="Wednesday",year="2026")

def test_botanical_and_ornament_are_real_options_not_preconditions():
    # Non-grid-locked intermediate rectangles test actual fitting decisions.
    # Both visual and bare-facts variants must be possible in available space.
    reqs=[dict(cell=dict(x=0,y=0,w=800,h=h),facts=facts())
          for h in range(295,481,5)]
    results=plans(reqs)
    assert any(x and x["illustration"] for x in results)
    stripped=[x for x in results if x and x["illustration"] is None]
    assert stripped, "Optional art must not make an otherwise valid composition fail"
    for x in stripped:
        assert x["text"]["day"]=="21"
        assert x["calendar"]["features"]["showMonthTitle"]
        assert x["ornaments"]["botanical"] is None

def test_gregorian_calendar_rejects_impossible_dates_but_allows_leap_day():
    allcases=[
        facts(day=31,month="April",weekday="Thursday",year=2026,month0=3),
        facts(day=29,month="February",weekday="Friday",year=2025,month0=1),
        facts(day=30,month="February",weekday="Thursday",year=2024,month0=1),
        facts(day=29,month="February",weekday="Thursday",year=2024,month0=1),
        facts(day=28,month="February",weekday="Saturday",year=2025,month0=1),
        facts(day=31,month="December",weekday="Thursday",year=2026,month0=11)
    ]
    cases=[dict(cell=dict(x=0,y=0,w=800,h=480),facts=c) for c in allcases]
    outputs=plans(cases)
    assert outputs[0] is None and outputs[1] is None and outputs[2] is None
    assert outputs[3] is not None and outputs[4] is not None
    assert outputs[5] is not None and outputs[5]["calendar"]["month0"]==11

def test_all_100_legal_positions_preserve_facts_matte_and_contrast_independence():
    presets=[
        facts(),
        facts(day=31,month="December",weekday="Thursday",month0=11),
        facts(day=30,month="September",weekday="Wednesday",month0=8),
        facts(day=17,month="May",weekday="Sunday",month0=4,
              holidays=[dict(dateLabel="17.05",title="Constitution Day")]),
        facts(day=21,month="Oktober",weekday="Onsdag",month0=9),
        facts(day=28,month="February",weekday="Saturday",year=2025,month0=1),
        facts(day=21,month="☃",weekday="Wednesday",month0=9),
        facts(day=None,month=None,weekday=None)
    ]
    requests=[]
    for w,h in product(range(1,5),repeat=2):
        for col,row in product(range(5-w),range(5-h)):
            cell=dict(x=200*col,y=120*row,w=200*w,h=120*h)
            for preset in presets:
                for theme in ("light","dark"):
                    requests.append(dict(cell=cell,facts={**preset,"theme":theme}))
    assert len(requests)==1600
    outputs=plans(requests)
    accepted=0
    for i in range(0,len(requests),2):
        req=requests[i];a,b=outputs[i:i+2]
        # Theme must not change factual data disclosure/geometry; actual
        # grayscale contrast still requires a real pixel/physical check.
        assert a==b
        if a is None:continue
        accepted+=1
        fp=req["facts"]
        assert not fp["holidays"]
        assert a["text"]==dict(day=str(fp["day"]),month=fp["month"],
                               weekday=fp["weekday"],year=str(fp["year"]))
        assert a["calendar"]["year"]==fp["year"]
        assert a["calendar"]["month0"]==fp["month0"]
        matte=dict(x=58,y=39,w=680,h=436)
        assert rectangle_inside(a["visible"],matte)
        assert rectangle_inside(a["safe"],a["visible"])
        block=list(a["boxes"].values())+[a["calendar"]["rect"]]
        if a["ornaments"]["monthRule"]:block.append(a["ornaments"]["monthRule"])
        if a["illustration"]:block.append(a["illustration"]["rect"])
        assert all(rectangle_inside(r,a["safe"]) for r in block)
        assert all(not overlap(r,k) for j,r in enumerate(block)
                   for k in block[j+1:])
    assert accepted>0
    assert all(not outputs[i] for i in range(0,len(outputs),2)
               if requests[i]["facts"]["holidays"])

def test_design_contract_gates_and_frozen_surf_remain():
    source=(ROOT/"app/lib/dateEditorialComposition.mjs").read_text()
    assert "colSpan" not in source and "rowSpan" not in source
    assert "month0" in source and "Date.UTC(" in source
    assert "measureVariants" in source
    assert "art:false,rule:false" in source
    assert "Fraunces72" in source and "Fraunces48" in source
    assert "DM24" in source and "DM18" in source
    assert "calendar" in source
    assert "dateEditorialComposition" not in (
        ROOT/"frame/src/modules/ModuleDate.cpp").read_text()
    for path in ("frame/src/modules/ModuleSurf.cpp",
                 "frame/src/modules/ModuleSurf.h",
                 "frame/src/modules/SurfAdaptivePolicy.h",
                 "app/lib/surfResponsive.mjs"):
        assert (ROOT/path).is_file()
