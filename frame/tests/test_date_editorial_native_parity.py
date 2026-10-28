"""Date editorial composition: exact C++11 ↔ JS original-GFX measured parity.

Sources: Layout Lab 4x4 seed 347015390 and full 100-cell physical matte grid.
No e-paper graphics output, Surf, active Date or network touched.
"""
import json
import shutil
import subprocess
from itertools import product
from pathlib import Path
import pytest

ROOT=Path(__file__).resolve().parents[2]
CPP=ROOT/"frame/tests/helpers/date_editorial_native_cli.cpp"
JS=ROOT/"frame/tests/helpers/date_editorial_js_cli.mjs"
HEADER=ROOT/"frame/src/display/DateEditorialPlan.h"

def cases():
    fixtures=[
      dict(year=2026,month0=9,day=21,month="October",weekday="Wednesday",holidays=[]),
      dict(year=2026,month0=11,day=31,month="December",weekday="Thursday",holidays=[]),
      dict(year=2026,month0=8,day=30,month="September",weekday="Wednesday",holidays=[]),
      dict(year=2026,month0=9,day=21,month="Oktober",weekday="Onsdag",holidays=[]),
      dict(year=2024,month0=1,day=29,month="Februar",weekday="Torsdag",holidays=[]),
      dict(year=2025,month0=1,day=29,month="February",weekday="Saturday",holidays=[]),
      dict(year=2026,month0=3,day=31,month="April",weekday="Friday",holidays=[]),
      dict(year=2026,month0=9,day=21,month="October",weekday="Wednesday",
           holidays=[{"dateLabel":"31.10","title":"Halloween"}]),
      dict(year=2026,month0=9,day=21,month="☃",weekday="Wednesday",holidays=[]),
      dict(year=9999,month0=11,day=31,month="December",weekday="Friday",holidays=[]),
    ]
    requests=[]
    for w,h in product(range(1,5),repeat=2):
        for x,y in product(range(5-w),range(5-h)):
            cell=dict(x=x*200,y=y*120,w=w*200,h=h*120)
            for facts,theme in product(fixtures,("light","dark")):
                requests.append(dict(cell=cell,facts={**facts,"theme":theme}))
    assert len(requests)==2000
    for height in range(250,481,7):
        for theme in ("light","dark"):
            requests.append(dict(cell=dict(x=0,y=0,w=800,h=height),
                                 facts={**fixtures[0],"theme":theme}))
    requests += [
      dict(cell=dict(x=0,y=0,w=800,h=480),facts=dict(
          year=2026,month0=9,day=21,month="October",weekday="Wednesday")),
      dict(cell=dict(x=0,y=0,w=800,h=480),facts=dict(
          year=2026,month0=9,day=0,month="October",weekday="Wednesday")),
      dict(cell=dict(x=0,y=0,w=0,h=480),facts=fixtures[0]),
    ]
    return requests

@pytest.fixture(scope="module")
def executable(tmp_path_factory):
    compiler=shutil.which("g++")
    if not compiler or not shutil.which("node"):
        pytest.skip("Linux CI g++ and node required")
    out=tmp_path_factory.mktemp("editorial")/"editorial"
    command=[compiler,"-std=c++11","-Wall","-Wextra","-Werror","-pedantic",
       "-I",str(ROOT/"frame/src/display"),str(CPP),"-o",str(out)]
    p=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,timeout=35)
    assert p.returncode==0,p.stderr
    return out

def read_rect(raw):
    vals=list(map(int,raw.split(",")))
    assert len(vals)==4
    return tuple(vals)

def test_full_original_f1_gfx_cpp_js_editorial_geometry_parity(executable):
    inputs=cases()
    proc=subprocess.run(["node",str(JS)],cwd=ROOT,
        input="".join(json.dumps(r,ensure_ascii=False)+"\n" for r in inputs),
        capture_output=True,text=True,timeout=75)
    assert proc.returncode==0,proc.stderr
    records=[json.loads(row) for row in proc.stdout.splitlines()]
    assert len(records)==len(inputs)
    assert all(len(r["args"])==20 for r in records)
    native=subprocess.run([str(executable)],cwd=ROOT,
        input="".join(" ".join(map(str,r["args"]))+"\n" for r in records),
        capture_output=True,text=True,timeout=40)
    assert native.returncode==0,native.stderr
    lines=native.stdout.splitlines()
    assert len(lines)==len(records)
    admitted=noneWithArt=hasArt=0
    for source,row in zip(records,lines):
        js=source["editorial"]
        if js is None:
            assert row=="fallback",(source["args"],row)
            continue
        admitted+=1
        assert row!="fallback",source["args"]
        parts=row.split("|")
        assert len(parts)==13,(source["args"],row)
        score=int(parts[0])
        dayFont,monthFont=map(int,parts[1].split(","))
        flags=tuple(map(int,parts[2].split(",")))
        assert score==js["score"],(source["args"],score,js["score"])
        assert dayFont==(0 if js["fonts"]["day"]=="Fraunces72" else 1)
        assert monthFont==(0 if js["fonts"]["month"]=="DM24" else 1)
        expectedFlags=(int(js["illustration"] is not None),
                       int(js["ornaments"]["monthRule"] is not None),
                       int(js["calendar"]["features"]["showMonthTitle"]),
                       int(js["calendar"]["features"]["showDowHeader"]),
                       int(js["calendar"]["features"]["showWeekNums"]))
        assert flags==expectedFlags
        hasArt+=flags[0]
        noneWithArt+=1-flags[0]
        mapping={
          "visible":js["visible"],"safe":js["safe"],
          "hero":js["regions"]["hero"],"calendar":js["calendar"]["rect"],
          "year":js["boxes"]["year"],"month":js["boxes"]["month"],
          "day":js["boxes"]["day"],"weekday":js["boxes"]["weekday"],
          "monthRule":js["ornaments"]["monthRule"],
          "botanical":js["ornaments"]["botanical"]
        }
        for name,raw in zip(mapping,parts[3:]):
            jsbox=mapping[name]
            rect=read_rect(raw)
            expected=tuple(jsbox[k] for k in ("x","y","w","h")) if jsbox else (0,0,0,0)
            assert rect==expected,(name,source["args"],rect,expected)
    assert admitted>0
    assert hasArt>0
    assert noneWithArt>0

def test_unchanged_active_renderer_frozen_surf_and_no_named_shape_visuals():
    source=HEADER.read_text()
    assert "colSpan" not in source and "rowSpan" not in source
    assert "ModuleSurf" not in source
    for term in ("DisplayCore", "setCursor(", "fillRect(", "drawPixel(", "print("):
        assert term not in source
    assert "DateRolePolicy::MATTE_X" in source
    assert "DateMonthGridPlan::days" in source
    assert "return result;" in source
    mod=(ROOT/"frame/src/modules/ModuleDate.cpp").read_text()
    assert "DateEditorialPlan.h" not in mod
