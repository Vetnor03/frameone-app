"""C++11 ↔ JS Date R4.7 compact micro/ribbon/stack geometry parity at every slot.

Original C++/JS plans derive all ink locations from measured role sizes.
Production stays OFF; rendered host pixels are checked by separate tests.
"""
from itertools import product
import json
from pathlib import Path
import shutil
import subprocess
import pytest

ROOT=Path(__file__).resolve().parents[2]
CPP=ROOT/"frame/tests/helpers/date_compact_native_cli.cpp"
JS=ROOT/"frame/tests/helpers/date_compact_js_cli.mjs"

@pytest.fixture(scope="module")
def native(tmp_path_factory):
    if not shutil.which("g++") or not shutil.which("node"):
        pytest.skip("Host compilers unavailable")
    binary=tmp_path_factory.mktemp("compact_parity")/"native"
    cmd=["g++","-std=c++11","-Wall","-Wextra","-Werror","-pedantic",
         "-I",str(ROOT/"frame/src/display"),str(CPP),"-o",str(binary)]
    run=subprocess.run(cmd,capture_output=True,text=True,timeout=35)
    assert run.returncode==0,run.stderr
    return binary

def cases():
    samples=[]
    # Every one of 100 legal placements, all 16 dimensions, plus varied
    # proportional F1 glyph size situations.
    for w,h in product(range(1,5),repeat=2):
        for col,row in product(range(5-w),range(5-h)):
            cell=dict(x=col*200,y=row*120,w=w*200,h=h*120)
            for day,month,weekday,year in [
              (dict(w=65,h=54),dict(w=95,h=19),
               dict(w=88,h=14),dict(w=41,h=14)),
              (dict(w=76,h=59),dict(w=125,h=22),
               dict(w=116,h=16),dict(w=44,h=16)),
              (dict(w=45,h=36),dict(w=145,h=22),
               dict(w=135,h=16),dict(w=42,h=15))
            ]:
                samples.append(dict(cell=cell,day=day,month=month,
                                    weekday=weekday,year=year))
    # Non-grid-specific edge conditions and incomplete/invalid glyph ink.
    for h in range(60,181,7):
        samples.append(dict(cell=dict(x=0,y=0,w=400,h=h),
          day=dict(w=80,h=55),month=dict(w=150,h=20),
          weekday=dict(w=110,h=16),year=dict(w=44,h=16)))
    for w in range(150,801,19):
        samples.append(dict(cell=dict(x=0,y=0,w=w,h=120),
          day=dict(w=78,h=56),month=dict(w=120,h=20),
          weekday=dict(w=105,h=15),year=dict(w=43,h=15)))
    samples.extend([
      dict(cell=dict(x=-5,y=0,w=200,h=120),day=dict(w=66,h=55),
           month=dict(w=50,h=20),weekday=dict(w=60,h=13),year=dict(w=40,h=15)),
      dict(cell=dict(x=0,y=0,w=200,h=120),day=dict(w=0,h=55),
           month=dict(w=50,h=20),weekday=dict(w=60,h=13),year=dict(w=40,h=15))
    ])
    return samples

def rect(record):
    return tuple(record[k] for k in ("x","y","w","h")) if record else (0,0,0,0)

def test_all_100_grid_positions_and_measured_ink_edge_parity(native):
    inputs=cases()
    args=[" ".join(map(str,[
      a["cell"]["x"],a["cell"]["y"],a["cell"]["w"],a["cell"]["h"],
      a["day"]["w"],a["day"]["h"],a["month"]["w"],a["month"]["h"],
      a["weekday"]["w"],a["weekday"]["h"],a["year"]["w"],a["year"]["h"]]))
      for a in inputs]
    raw=subprocess.run([str(native)],input="\n".join(args)+"\n",
      text=True,capture_output=True,timeout=30)
    assert raw.returncode==0,raw.stderr
    js=subprocess.run(["node",str(JS)],input="\n".join(json.dumps(a) for a in inputs)+"\n",
      text=True,capture_output=True,cwd=ROOT,timeout=30)
    assert js.returncode==0,js.stderr
    cpp=raw.stdout.splitlines()
    values=[json.loads(row) for row in js.stdout.splitlines()]
    assert len(cpp)==len(values)==len(inputs)
    seen=set()
    for source,candidate in zip(cpp,values):
        if candidate is None:
            assert source=="fallback",source
            continue
        mode={"micro":1,"ribbon":2,"stack":3}[candidate["mode"]]
        seen.add(candidate["mode"])
        parts=source.split("|")
        assert len(parts)==8,(source,candidate)
        assert int(parts[0])==mode
        assert tuple(map(int,parts[1].split(",")))==(
          int(candidate["showMonth"]),int(candidate["showYear"]))
        for key,rawrect in zip(("safe","group","day","month",
                                "weekday","year"),parts[2:]):
            actual=tuple(map(int,rawrect.split(",")))
            assert actual==rect(candidate[key]),(key,actual,candidate[key])
    assert seen=={"micro","ribbon","stack"}

def test_functional_disclosure_matches_legacy_micro_and_shallow(native):
    base=dict(day=dict(w=65,h=54),month=dict(w=96,h=18),
              weekday=dict(w=93,h=15),year=dict(w=39,h=15))
    for w,h,mode,year in [
      (200,120,"micro",False),
      (400,120,"ribbon",False),
      (600,120,"ribbon",True),
      (800,120,"ribbon",True),
      (200,240,"stack",True),(400,240,"stack",True),
      (200,360,"stack",True),(400,360,"stack",True),
      (200,480,"stack",True),
      (400,480,None,False), # legacy has calendar
      (600,240,None,False), # legacy has calendar
      (800,360,None,False)  # legacy has calendar
    ]:
        src={**base,"cell":dict(x=0,y=0,w=w,h=h)}
        q=subprocess.run(["node",str(JS)],input=json.dumps(src)+"\n",
          text=True,capture_output=True,cwd=ROOT,timeout=15)
        assert q.returncode==0,q.stderr
        obj=json.loads(q.stdout)
        assert (obj["mode"] if obj else None)==mode
        if obj:
            assert obj["showMonth"]==(mode in ("ribbon","stack"))
            assert obj["showYear"]==year
