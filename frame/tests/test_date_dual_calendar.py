"""C++/JS dual-month editorial reservation parity and safety gates.

Real 680x436 matte, all 100 legal placements, December rollover, complete
title flags. Does NOT assert actual e-paper pixels or 1-2m readability.
"""
import json
import subprocess
from pathlib import Path
from itertools import product
from calendar import monthrange
from datetime import date

ROOT=Path(__file__).resolve().parents[2]
JS=ROOT/"frame/tests/helpers/date_editorial_dual_js.mjs"
CPP=ROOT/"frame/tests/helpers/date_editorial_dual_cli.cpp"

def rect(t):
    return tuple(t[k] for k in ("x","y","w","h"))

def inside(a,b):
    return a[0]>=b[0] and a[1]>=b[1] and a[2]>0 and a[3]>0 and (
        a[0]+a[2]<=b[0]+b[2] and a[1]+a[3]<=b[1]+b[3])

def overlap(a,b):
    return min(a[0]+a[2],b[0]+b[2])>max(a[0],b[0]) and (
        min(a[1]+a[3],b[1]+b[3])>max(a[1],b[1]))

def all_cases():
    fixtures=[
        dict(year=2026,month0=9,day=21,month="October",weekday="Wednesday",holidays=[]),
        dict(year=2026,month0=11,day=31,month="December",weekday="Thursday",holidays=[]),
        dict(year=2024,month0=1,day=29,month="February",weekday="Thursday",holidays=[]),
        dict(year=9999,month0=11,day=31,month="December",weekday="Friday",holidays=[]),
        dict(year=2026,month0=9,day=21,month="October",weekday="Wednesday",
             holidays=[dict(dateLabel="31.10",title="Halloween")]),
    ]
    requests=[]
    for w,h in product(range(1,5),repeat=2):
        for x,y in product(range(5-w),range(5-h)):
            cell=dict(x=x*200,y=y*120,w=w*200,h=h*120)
            for fixture,theme in product(fixtures,("light","dark")):
                requests.append(dict(cell=cell,facts={**fixture,"theme":theme}))
    assert len(requests)==1000
    return requests

def test_full_two_calendar_native_js_parity(tmp_path):
    exe=tmp_path/"dual"
    comp=subprocess.run(["g++","-std=c++11","-Werror","-Wall","-Wextra",
        "-pedantic","-I",str(ROOT/"frame/src/display"),str(CPP),"-o",str(exe)],
        cwd=ROOT,text=True,capture_output=True,timeout=25)
    assert comp.returncode==0,comp.stderr
    requests=all_cases()
    js=subprocess.run(["node",str(JS)],cwd=ROOT,text=True,capture_output=True,
        input="".join(json.dumps(req,ensure_ascii=False)+"\n" for req in requests),
        timeout=50)
    assert js.returncode==0,js.stderr
    records=[json.loads(x) for x in js.stdout.splitlines()]
    assert len(records)==len(requests)
    natives=[rec for rec in records if rec["args"] is not None]
    assert natives
    for n in natives:
        assert len(n["args"])==19
    native=subprocess.run([str(exe)],cwd=ROOT,text=True,capture_output=True,
        input="".join(" ".join(map(str,n["args"]))+"\n" for n in natives),
        timeout=20)
    assert native.returncode==0,native.stderr
    lines=native.stdout.splitlines()
    assert len(lines)==len(natives)
    accepted=withRollover=0
    for rec,line in zip(natives,lines):
        jsplan=rec["dual"]
        if jsplan is None:
            assert line=="fallback",(rec,line)
            continue
        assert line!="fallback",(rec,line)
        accepted+=1
        chunks=line.split("|")
        assert len(chunks)==4
        current=tuple(map(int,chunks[0].split(",")))
        nxt=tuple(map(int,chunks[1].split(",")))
        y,m,showYear=tuple(map(int,chunks[2].split(",")))
        gap,margin=tuple(map(int,chunks[3].split(",")))
        assert current==rect(jsplan["current"]["rect"])
        assert nxt==rect(jsplan["next"]["rect"])
        assert (y,m,showYear)==(jsplan["next"]["year"],
            jsplan["next"]["month0"],int(jsplan["next"]["showYear"]))
        assert (gap,margin)==(jsplan["gap"],jsplan["margin"])
        assert inside(current,rect(jsplan["safe"]))
        assert inside(nxt,rect(jsplan["safe"]))
        assert inside(current,(58,39,680,436))
        assert inside(nxt,(58,39,680,436))
        assert not overlap(current,nxt)
        assert jsplan["next"]["features"]["showMonthTitle"]
        assert jsplan["next"]["features"]["showDowHeader"]
        # The visual gallery previously passed while 6-week rows collided.
        # Check actual Gregorian week count and visible row pitch, not only
        # outer rectangle containment. 26px protects today's >=11px ring.
        for month,minimum in ((jsplan["current"],26),(jsplan["next"],21)):
            yy,mm=month["year"],month["month0"]+1
            weeks=max(4,min(6,(date(yy,mm,1).weekday()+
                               monthrange(yy,mm)[1]+6)//7))
            assert (month["rect"]["h"]-66)//weeks>=minimum,(month,weeks)
        withRollover+=showYear
    assert accepted>0
    assert withRollover>0

def test_4x4_october_requires_both_months_without_template_ids():
    req=dict(cell=dict(x=0,y=0,w=800,h=480),
        facts=dict(year=2026,month0=9,day=21,
                   month="October",weekday="Wednesday",holidays=[]))
    p=subprocess.run(["node",str(JS)],input=json.dumps(req)+"\n",
                     cwd=ROOT,capture_output=True,text=True,check=True)
    item=json.loads(p.stdout)
    assert item["dual"] is not None
    assert item["dual"]["current"]["month0"]==9
    assert item["dual"]["next"]["month0"]==10
    assert not item["dual"]["next"]["showYear"]
    # October's outlined today ring requires 26px per row; November's
    # six complete weeks require >=21px. Compare factual row pitch rather
    # than incorrectly demanding that the whole second box be taller.
    current=item["dual"]["current"]["rect"]["h"]
    next_=item["dual"]["next"]["rect"]["h"]
    assert (current-66)//5>=26
    assert (next_-66)//6>=21
    assert not item["dual"]["current"]["rect"]==item["dual"]["next"]["rect"]
    source=(ROOT/"frame/src/display/DateEditorialDualCalendar.h").read_text()
    assert "colSpan" not in source and "rowSpan" not in source
    assert "ModuleSurf" not in source and "DisplayCore::" not in source
