"""Candidate Date fact priority and calendar/holiday space reservation tests.

No drawing, firmware OTA, or source-array mutations. Node tests actual F1
glyph metrics on all legal grid positions, both themes and supplied scenarios.
"""
import json
from itertools import product
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]
CLI=ROOT/"frame/tests/helpers/date_disclosure_cli.mjs"
PRESETS=[
    dict(day=27,weekday="Tuesday",month="October",year=2026,month0=9,
         nextMonth0=10,nextMonthYear=2026,
         holidays=[dict(dateLabel="31.10",title="Halloween")]),
    dict(day=31,weekday="Wednesday",month="December",year=2026,month0=11,
         nextMonth0=0,nextMonthYear=2027,
         holidays=[dict(dateLabel="31.12",title="New Year")]),
    dict(day=1,weekday="Sunday",month="May",year=2026,month0=4,
         holidays=[]),
    dict(day=None,weekday=None,month=None,year=None,month0=None,
         holidays=[]),
]


def run(requests):
    p=subprocess.run(["node",str(CLI)],input="".join(
        json.dumps(v)+"\n" for v in requests),
        capture_output=True,text=True,check=True,cwd=ROOT,timeout=50)
    results=[json.loads(v) for v in p.stdout.splitlines()]
    assert len(results)==len(requests),p.stderr
    return results


def within(a,b):
    return a["w"]>0 and a["h"]>0 and (
        b["x"]<=a["x"]<a["x"]+a["w"]<=b["x"]+b["w"]
        and b["y"]<=a["y"]<a["y"]+a["h"]<=b["y"]+b["h"])


def overlaps(a,b):
    return min(a["x"]+a["w"],b["x"]+b["w"])>max(a["x"],b["x"]) and (
        min(a["y"]+a["h"],b["y"]+b["h"])>max(a["y"],b["y"]))


def rectangles(plan):
    output=list(plan["boxes"].values())
    for k in ("calendar","nextCalendar","year"):
        if plan[k] is not None:
            output.append(plan[k]["rect"])
    output.extend(r["rect"] for r in plan["holidays"])
    return output


def test_role_first_disclosure_all_shapes_positions_and_cases():
    requests=[]
    for cols,rows in product(range(1,5),repeat=2):
        for col,row in product(range(5-cols),range(5-rows)):
            cell=dict(x=col*200,y=row*120,w=cols*200,h=rows*120)
            for facts,theme in product(PRESETS,("dark","light")):
                # Theme and grid ID must never silently change date facts.
                requests.append(dict(cell=cell,facts={**facts,theme=theme}))
    assert len(requests)==800
    plans=run(requests)
    valid=calendars=0
    modes=set()
    for request,p in zip(requests,plans):
        if request["facts"]["day"] is None:
            assert p is None
            continue
        if p is None:
            continue
        valid+=1
        modes.add(p["mode"])
        assert within(p["group"],p["visible"])
        assert within(p["visible"],dict(x=58,y=39,w=680,h=436))
        assert "day" in p["boxes"]
        assert "day" in p["fonts"]
        assert p["illustration"] is None
        for r in rectangles(p):
            assert within(r,p["visible"]),(request,p)
        blocks=rectangles(p)
        for i,a in enumerate(blocks):
            for b in blocks[i+1:]:
                assert not overlaps(a,b),(request,p)
        if p["calendar"]:
            calendars+=1
            assert p["calendar"]["year"]==request["facts"]["year"]
            assert p["calendar"]["month0"]==request["facts"]["month0"]
            assert p["calendar"]["features"] is not None
        if p["nextCalendar"]:
            assert p["calendar"]
            assert "nextMonth0" in request["facts"]
        if p["holidays"]:
            original=request["facts"]["holidays"]
            assert all(row["text"] in
                       [v["dateLabel"]+" · "+v["title"] for v in original]
                       for row in p["holidays"])
        assert all(p["boxes"][key] is not None for key in
                   ("day",))
    assert valid>0 and calendars>0
    assert "hero-only" in modes
    assert "stack" in modes or "card" in modes or "ribbon" in modes


def test_empty_or_missing_metadata_never_invents_calendar_or_holidays():
    cell=dict(x=0,y=0,w=800,h=480)
    facts=dict(day=27,month="October",weekday="Tuesday")
    result=run([dict(cell=cell,facts=facts)])[0]
    assert result is not None
    assert result["calendar"] is None
    assert result["nextCalendar"] is None
    assert result["year"] is None
    assert result["holidays"]==[]
    assert result["illustration"] is None


def test_year_and_next_calendar_require_prior_current_calendar_and_real_data():
    cell=dict(x=0,y=0,w=800,h=480)
    good={**PRESETS[0]}
    missing=dict(good,nextMonthYear=None,nextMonth0=None)
    invalid=dict(good,month0=None)
    result,no_next,no_current=run([
        dict(cell=cell,facts=good),dict(cell=cell,facts=missing),
        dict(cell=cell,facts=invalid)
    ])
    assert result["calendar"] is not None
    assert no_next["nextCalendar"] is None
    assert no_current["calendar"] is None
    assert no_current["nextCalendar"] is None


def test_no_grid_size_hardcoding_or_live_renderer_mutations():
    src=(ROOT/"app/lib/dateContentPlanner.mjs").read_text()
    assert "colSpan" not in src and "rowSpan" not in src
    assert "ModuleSurf" not in src
    assert "drawMonthCalendar" not in src
    assert "planDateWithRealGfx" in src
    assert "dateCalendarFeatures" in src
    assert "illustration:null" in src
