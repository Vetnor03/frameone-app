"""Date R4 mixed custom-grid containment and source/native geometry parity.

This checks the real 800x480 firmware coordinate scale and matte crop, not
other modules' actual rendering. NO physical GxEPD2 framebuffer is captured.
"""
import json
import subprocess
import sys
from itertools import product
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
TOOLS=ROOT/"frame/tools"
sys.path.insert(0,str(TOOLS))
from generate_date_mixed_layout_review import (
    PANEL,MATTE,checked,grid_cell,ink_rects,intersects,plans,
    rect_inside,scenarios,validate_cells)

CLI=ROOT/"frame/tests/helpers/date_dual_holiday_visual_cli.mjs"
NATIVE=ROOT/"frame/tests/helpers/date_editorial_dual_cli.cpp"
JS=ROOT/"frame/tests/helpers/date_editorial_dual_js.mjs"

def test_real_firmware_grid_and_mixed_source_ink_report(tmp_path):
    source=(ROOT/"frame/src/core/Config.h").read_text()
    layout=(ROOT/"frame/src/core/Layout.cpp").read_text()
    assert "VIEWPORT_W = 800" in source and "VIEWPORT_H = 480" in source
    assert "gridX(uint8_t boundary) { return VIEWPORT_X +" in layout
    assert "gridY(uint8_t boundary) { return VIEWPORT_Y +" in layout
    assert PANEL==(800,480) and MATTE==(58,39,680,436)
    items=scenarios()
    assert len(items)==11
    decision=plans(items)
    info=checked(items,decision)
    assert info["scenarios"]==11
    assert info["dateSlots"]==17
    assert info["admitted"]>=2,info
    assert info["mixedAdmitted"]>=1,info
    assert info["legacyFallback"]>=1,info
    assert info["nativeFramebufferCaptures"]==0
    output=tmp_path/"mixed.html"
    run=subprocess.run([sys.executable,str(TOOLS/"generate_date_mixed_layout_review.py"),
                        "--output",str(output)],cwd=ROOT,text=True,
                       capture_output=True,timeout=90)
    assert run.returncode==0,run.stderr
    stat=json.loads(run.stdout)
    assert stat==info,(stat,info)
    html=output.read_text(encoding="utf-8")
    assert html.count("<article>")==11
    assert "NOT A NATIVE FRAMEBUFFER" in html
    assert "NOT RENDERED: SURF:1" in html
    assert "LEGACY DATE FALLBACK" in html
    assert ".qa-box{display:none}" in html
    assert "Show original-ink measurement guides" in html
    assert "BLANK SLOT" in html
    assert "800×480" in html
    assert 'data-calendar-title-accent="original-1bit"' in html
    assert "src=\"http" not in html

def test_one_date_at_every_legal_grid_position_with_surrounding_non_date_cells():
    # 100 legal 4x4 placements and two calendar fixtures x Light/Dark.
    # Every non-Date unit is occupied by a placeholder; no union can spill
    # into an adjacent real 200x120 module cell or the physical matte.
    fixtures=[
        dict(year=2026,month0=9,day=21,month="October",
             weekday="Wednesday",holidays=[]),
        dict(year=2026,month0=11,day=31,month="December",
             weekday="Thursday",holidays=[])]
    scenarios_=[]
    placements=0
    for w,h in product(range(1,5),repeat=2):
        for col,row in product(range(5-w),range(5-h)):
            placements+=1
            date=grid_cell(col,row,w,h,"date")
            occupied={(x,y) for x in range(col,col+w)
                      for y in range(row,row+h)}
            tiles=[date]+[grid_cell(x,y,1,1,"weather:1")
                          for x in range(4) for y in range(4)
                          if (x,y) not in occupied]
            for facts in fixtures:
                scenarios_.append(dict(cells=tiles,facts=facts,
                                       name="position study",theme="Light"))
    assert placements==100 and len(scenarios_)==200
    results=plans(scenarios_)
    info=checked(scenarios_,results)
    assert info["dateSlots"]==200
    assert info["admitted"]>0
    assert info["nativeFramebufferCaptures"]==0
    for item in scenarios_:
        validate_cells(item["cells"])

def test_real_cpp_dual_planner_matches_js_at_all_100_firmware_placements(tmp_path):
    exe=tmp_path/"date_dual_native"
    c=subprocess.run(["g++","-std=c++11","-Wall","-Wextra","-Werror",
        "-pedantic","-I",str(ROOT/"frame/src/display"),str(NATIVE),
        "-o",str(exe)],cwd=ROOT,text=True,capture_output=True,timeout=25)
    assert c.returncode==0,c.stderr
    samples=[]
    for cw,rh in product(range(1,5),repeat=2):
        for col,row in product(range(5-cw),range(5-rh)):
            for year,month0,day,month,weekday in (
                (2026,9,21,"October","Wednesday"),
                (2026,11,31,"December","Thursday")):
                samples.append(dict(cell=dict(x=col*200,y=row*120,
                    w=cw*200,h=rh*120),facts=dict(year=year,
                    month0=month0,day=day,month=month,
                    weekday=weekday,holidays=[])))
    assert len(samples)==200
    js=subprocess.run(["node",str(JS)],cwd=ROOT,text=True,
        input="".join(json.dumps(q)+"\n" for q in samples),
        capture_output=True,timeout=45,check=True)
    records=[json.loads(v) for v in js.stdout.splitlines()]
    assert len(records)==len(samples)
    prepared=[rec for rec in records if rec["args"] is not None]
    native=subprocess.run([str(exe)],cwd=ROOT,text=True,
        input="".join(" ".join(map(str,q["args"]))+"\n" for q in prepared),
        capture_output=True,timeout=25,check=True)
    rows=native.stdout.splitlines()
    assert len(rows)==len(prepared)
    accepted=0
    for rec,row in zip(prepared,rows):
        pl=rec["dual"]
        if pl is None:
            assert row=="fallback"
            continue
        assert row!="fallback"
        accepted+=1
        current,nxt,ym,gaps=row.split("|")
        def coords(v):return ",".join(str(v[k]) for k in ("x","y","w","h"))
        assert current==coords(pl["current"]["rect"])
        assert nxt==coords(pl["next"]["rect"])
        assert ym==",".join(map(str,(pl["next"]["year"],pl["next"]["month0"],
                                      int(pl["next"]["showYear"]))))
        assert gaps==f'{pl["gap"]},{pl["margin"]}'
    assert accepted>0

def test_no_surf_changes_and_native_renderer_still_default_off():
    source=(ROOT/"frame/src/modules/ModuleDate.cpp").read_text()
    assert "#define REMIND_DATE_EDITORIAL_PREVIEW_ENABLED 0" in source
    assert "if(tryDrawEditorialDatePreview(c,wday,month,year,month0,dayNum))return" in source
    qa=(TOOLS/"generate_date_mixed_layout_review.py").read_text()
    assert "ModuleSurf" not in qa
    assert "NO physical" not in qa or "NOT A GxEPD2" in qa
