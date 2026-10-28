"""Original-F1 measured upcoming holiday label parity with native C++.

This tests all 100 legal grid positions, no-overlap and complete text. It
does NOT claim to render a physical e-paper frame or preserve source sorting
(the native ModuleDate selects actual holidayYMD chronology separately).
"""
import json
import subprocess
from pathlib import Path
from itertools import product
ROOT=Path(__file__).resolve().parents[2]
JS=ROOT/"frame/tests/helpers/date_editorial_holidays_js.mjs"
CPP=ROOT/"frame/tests/helpers/date_editorial_holidays_cli.cpp"

def rect(d):
    return tuple(d[k] for k in ("x","y","w","h"))

def inside(a,b):
    return a[2]>0 and a[3]>0 and a[0]>=b[0] and a[1]>=b[1] and (
        a[0]+a[2]<=b[0]+b[2] and a[1]+a[3]<=b[1]+b[3])

def overlap(a,b):
    return min(a[0]+a[2],b[0]+b[2])>max(a[0],b[0]) and (
        min(a[1]+a[3],b[1]+b[3])>max(a[1],b[1]))

def cases():
    presets=[
      [],
      [dict(dateLabel="31.10",title="Halloween")],
      [dict(dateLabel="31.10",title="Halloween"),
       dict(dateLabel="01.11",title="Family day")],
      [dict(dateLabel="17.05",title="Grunnlovsdagen")],
      [dict(dateLabel="31.10",title="Very long name that will never fit into this space at full font size")],
      [dict(dateLabel="31.10",title="Snowman ☃")],
    ]
    output=[]
    for w,h in product(range(1,5),repeat=2):
        for x,y in product(range(5-w),range(5-h)):
            for holidays,theme in product(presets,("light","dark")):
                output.append(dict(cell=dict(x=x*200,y=y*120,w=w*200,h=h*120),
                    facts=dict(year=2026,month0=9,day=21,month="October",
                        weekday="Wednesday",theme=theme,holidays=holidays)))
    assert len(output)==1200
    return output

def test_original_f1_holiday_ink_native_js_parity(tmp_path):
    exe=tmp_path/"holiday"
    p=subprocess.run(["g++","-std=c++11","-pedantic","-Werror",
        "-Wall","-Wextra","-I",str(ROOT/"frame/src/display"),
        str(CPP),"-o",str(exe)],cwd=ROOT,capture_output=True,text=True,
        timeout=30)
    assert p.returncode==0,p.stderr
    requests=cases()
    js=subprocess.run(["node",str(JS)],cwd=ROOT,capture_output=True,
        text=True,input="".join(json.dumps(x,ensure_ascii=False)+"\n"
                          for x in requests),timeout=60)
    assert js.returncode==0,js.stderr
    records=[json.loads(line) for line in js.stdout.splitlines()]
    assert len(records)==len(requests)
    assert all(len(x["args"])==21 for x in records)
    native=subprocess.run([str(exe)],cwd=ROOT,capture_output=True,text=True,
        input="".join(" ".join(map(str,x["args"]))+"\n" for x in records),
        timeout=35)
    assert native.returncode==0,native.stderr
    results=native.stdout.splitlines()
    assert len(results)==len(requests)
    validOne=validTwo=0
    for req,record,line in zip(requests,records,results):
        jsplan=record["result"]
        if jsplan is None:
            assert line=="fallback",(req,line)
            continue
        assert line!="fallback",(req,line)
        segments=line.split("|")
        assert len(segments)==4,line
        assert int(segments[0])==jsplan["count"]
        heading=tuple(map(int,segments[1].split(",")))
        rows=[tuple(map(int,x.split(","))) for x in segments[2:]]
        if not jsplan["count"]:
            assert heading==(0,0,0,0)
            assert rows==[(0,0,0,0)]*2
            continue
        validOne+=int(jsplan["count"]==1)
        validTwo+=int(jsplan["count"]==2)
        assert heading==rect(jsplan["heading"])
        assert rows[:jsplan["count"]]==[rect(x) for x in jsplan["rows"]]
        assert rows[jsplan["count"]:]==[(0,0,0,0)]*(2-jsplan["count"])
        matte=(58,39,680,436)
        assert inside(heading,matte)
        for i,box in enumerate(rows[:jsplan["count"]]):
            assert inside(box,matte)
            assert not overlap(box,heading)
            assert all(not overlap(box,other) for other in rows[:i])
    assert validOne>0
    assert validTwo>0

def test_native_holidays_do_not_steal_facts_or_change_surf():
    source=(ROOT/"frame/src/display/DateEditorialHolidays.h").read_text()
    assert "colSpan" not in source and "rowSpan" not in source
    assert "DisplayCore::" not in source and "ModuleSurf" not in source
    mod=(ROOT/"frame/src/modules/ModuleDate.cpp").read_text()
    section=mod[mod.index("static bool tryDrawEditorialDatePreview("):
                mod.index("#endif // REMIND_DATE_EDITORIAL_PREVIEW_ENABLED")]
    assert "preflightEditorialHolidays(" in section
    assert section.index("preflightEditorialHolidays(")<section.index(
        "auto& d=DisplayCore::get()")
    assert "if(holidays.count)" in section
    assert "else if(p.art)paintEditorialSprig" in section
    assert "drawMonthCalendar(" in section
    assert "holidayYMD(item)" in mod
    assert "candidate==keys[0]||candidate==keys[1]" in mod
    assert "measureF2DateLabel(lines[i],font,input.rows[i])" in mod
    assert "roleLine(lines[i],font,slots.rows[i],prepared.rows[i])" in mod
    assert "if(!slots.valid||slots.count!=count)return false" in mod
