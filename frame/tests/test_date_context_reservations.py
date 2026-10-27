"""Date context reservation parity: native C++11 vs original F1 ink JS.

The C++ code does not draw calendar cells. These are geometry-only checks
over matte-clipped dates of every size/position, not physical e-paper QA.
"""
import json
import subprocess
from itertools import product
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
CPP=ROOT/"frame/tests/helpers/date_context_cpp_cli.cpp"
JS=ROOT/"frame/tests/helpers/date_context_js_cli.mjs"
POLICY=json.loads((ROOT/"shared/date-element-policy.json").read_text(encoding="utf-8"))

PRESETS=[
    dict(day=27,weekday="Tuesday",month="October",month0=9,year=2026,
         nextMonth0=10,nextMonthYear=2026,
         holidays=[dict(dateLabel="31.10",title="Halloween")]),
    dict(day=31,weekday="Wednesday",month="December",month0=11,year=2026,
         nextMonth0=0,nextMonthYear=2027,
         holidays=[dict(dateLabel="31.12",title="New Year")]),
    dict(day=1,weekday="Sunday",month="May",month0=4,year=2026,
         holidays=[dict(dateLabel="17.05",title="Norway")]),
    dict(day=29,weekday="Friday",month="August",month0=7,year=2026,
         holidays=[dict(dateLabel="29.08",title="First event"),
                   dict(dateLabel="30.08",title="Second event")]),
    dict(day=15,weekday="Wednesday",month="September",month0=None,
         year=2026,nextMonth0=0,nextMonthYear=2027,holidays=[]),
    dict(day=16,weekday="Thursday",month="May",month0=4,year=None,
         holidays=[]),
    dict(day=27,weekday="Tuesday",month="October",month0=9,year=2026,
         holidays=[dict(dateLabel="31.10",title="Symbols ☃")]),
    dict(day=None,weekday=None,month=None,month0=None,year=None,holidays=[]),
]


def rect(raw):
    if raw == "-":
        return None
    return tuple(map(int,raw.split(",")))


def parse(line):
    values=line.split("|")
    assert len(values)==6,line
    def cal(v):
        data=rect(v)
        return None if data is None else (data[:4],data[4:])
    return dict(calendar=cal(values[0]),year=rect(values[1]),
                nextCalendar=cal(values[2]),count=int(values[3]),
                holidays=[rect(x) for x in values[4:]])


def r4(b):
    return tuple(b[k] for k in ("x","y","w","h"))


def inside(a,b):
    return b[0]<=a[0] and b[1]<=a[1] and a[2]>0 and a[3]>0 and (
        a[0]+a[2]<=b[0]+b[2] and a[1]+a[3]<=b[1]+b[3])


def overlaps(a,b):
    return (min(a[0]+a[2],b[0]+b[2])>max(a[0],b[0]) and
            min(a[1]+a[3],b[1]+b[3])>max(a[1],b[1]))


def test_token_generator_matches_all_shared_calendar_minima():
    c=POLICY["candidateGeometry"]["currentCalendar"]
    assert (c["minUsefulWidth"],c["minUsefulHeight"])==(154,92)
    assert (c["dowWidth"],c["dowHeight"],c["weekWidth"],
            c["weekHeight"],c["titleHeight"])==(168,112,190,126,146)
    assert POLICY["contextReservation"]["maxHolidayRows"]==2
    subprocess.run(["python3","shared/generate_date_role_bindings.py","--check"],
                   cwd=ROOT,check=True,capture_output=True,text=True,timeout=10)
    js=(ROOT/"app/lib/dateContentPlanner.mjs").read_text()
    assert "item.dateLabel+' - '+item.title" in js
    assert "item.dateLabel+' · '+item.title" not in js


def test_native_calendar_year_and_holiday_reservations_match_js(tmp_path):
    exe=tmp_path/"context_plan"
    p=subprocess.run(["g++","-std=c++11","-Wall","-Wextra","-pedantic","-Werror",
        "-I",str(ROOT/"frame/src/display"),str(CPP),"-o",str(exe)],
        cwd=ROOT,capture_output=True,text=True,timeout=35)
    assert p.returncode==0,p.stderr

    requests=[]
    for cw,rh in product(range(1,5),repeat=2):
        for x,y in product(range(5-cw),range(5-rh)):
            cell=dict(x=x*200,y=y*120,w=cw*200,h=rh*120)
            for preset,theme in product(PRESETS,("light","dark")):
                requests.append(dict(cell=cell,facts={**preset,"theme":theme}))
    assert len(requests)==1600
    jsproc=subprocess.run(["node",str(JS)],
         input="".join(json.dumps(req,ensure_ascii=False)+"\n" for req in requests),
         cwd=ROOT,capture_output=True,text=True,timeout=55)
    assert jsproc.returncode==0,jsproc.stderr
    outputs=[json.loads(line) for line in jsproc.stdout.splitlines()]
    assert len(outputs)==len(requests)
    included=[out for out in outputs if out["plan"] is not None]
    assert included
    numbers="".join(" ".join(map(str,out["args"]))+"\n" for out in included)
    cpp=subprocess.run([str(exe)],input=numbers,text=True,
          cwd=ROOT,capture_output=True,timeout=35)
    assert cpp.returncode==0,cpp.stderr
    native=[parse(line) for line in cpp.stdout.splitlines()]
    assert len(native)==len(included)
    calendars=years=holidays=0
    for out,actual in zip(included,native):
        plan=out["plan"]
        assert len(out["args"])==17
        expected=plan["calendar"]
        assert (actual["calendar"] is not None)==(expected is not None)
        if expected:
            calendars+=1
            assert actual["calendar"]==(r4(expected["rect"]),(
                int(expected["features"]["showDowHeader"]),
                int(expected["features"]["showWeekNums"]),
                int(expected["features"]["showMonthTitle"])))
        assert actual["year"]==(r4(plan["year"]["rect"]) if plan["year"] else None)
        years+=int(actual["year"] is not None)
        expected=plan["nextCalendar"]
        assert (actual["nextCalendar"] is not None)==(expected is not None)
        if expected:
            assert actual["nextCalendar"]==(r4(expected["rect"]),(
                int(expected["features"]["showDowHeader"]),
                int(expected["features"]["showWeekNums"]),
                int(expected["features"]["showMonthTitle"])))
        assert actual["count"]==len(plan["holidays"])
        holidays+=actual["count"]
        assert actual["holidays"]==[r4(r["rect"]) for r in plan["holidays"]]+[
            None]*(2-len(plan["holidays"]))
        rectangles=[r4(v) for v in plan["boxes"].values()]
        rectangles.extend([actual["calendar"][0]] if actual["calendar"] else [])
        rectangles.extend([actual["nextCalendar"][0]] if actual["nextCalendar"] else [])
        rectangles.extend([actual["year"]] if actual["year"] else [])
        rectangles.extend(v for v in actual["holidays"] if v)
        matte=(58,39,680,436)
        for k,v in enumerate(rectangles):
            assert inside(v,matte)
            for w in rectangles[k+1:]:
                assert not overlaps(v,w),(plan,actual)
        assert plan["illustration"] is None
    assert calendars>0 and years>0
    # Holiday rows can be legitimately omitted when complete text does not fit;
    # this counter is informative but at least one chronological line should fit.
    assert holidays>0
    # Completely missing Date facts cannot produce a context-only phantom plan.
    assert all(out["plan"] is None for out,req in zip(outputs,requests)
               if req["facts"]["day"] is None)


def test_cpp_context_has_no_grid_shape_or_display_calls():
    source=(ROOT/"frame/src/display/DateContextReservations.h").read_text()
    assert "colSpan" not in source and "rowSpan" not in source
    assert "ModuleSurf" not in source
    for call in ("DisplayCore::","setCursor(","drawMonthCalendar(","fillRect("):
        assert call not in source
    assert "DateRolePolicy::CONTEXT_CALENDAR_MAX_WIDTH" in source
    assert "DateRolePolicy::CONTEXT_HOLIDAY_ROW_GAP" in source
    assert "out.current" in source and "out.next" in source
