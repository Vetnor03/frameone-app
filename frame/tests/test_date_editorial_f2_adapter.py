"""Native exact F1+F2 original-font editorial Date preflight.

Compiles *unaltered* Fraunces/DM Sans bitmap sources, the real
EditorialText::measureLine/planLine, and date adapter. No e-paper paint.
"""
import json
import shutil
import subprocess
from itertools import product
from pathlib import Path
import pytest

ROOT=Path(__file__).resolve().parents[2]
FRAME=ROOT/"frame"
CLI=FRAME/"tests/helpers/date_editorial_f2_native_cli.cpp"
JS=FRAME/"tests/helpers/date_editorial_f2_js_cli.mjs"

@pytest.fixture(scope="module")
def native(tmp_path_factory):
    compiler=shutil.which("g++")
    if not compiler or not shutil.which("node"):
        pytest.skip("Requires host GNU++11 and Node")
    d=tmp_path_factory.mktemp("editorial_f2")
    (d/"Adafruit_GFX.h").write_text(
        "#pragma once\n#include <stdint.h>\n"
        "struct GFXglyph {uint16_t bitmapOffset;uint8_t width,height,xAdvance;"
        "int8_t xOffset,yOffset;};\n"
        "struct GFXfont {uint8_t* bitmap;GFXglyph* glyph;"
        "uint16_t first,last;uint8_t yAdvance;};\n",
        encoding="utf-8")
    (d/"Arduino.h").write_text(
        "#pragma once\n#include <stdint.h>\n"
        "#define PROGMEM\n"
        "#define pgm_read_byte(addr) (*reinterpret_cast<const uint8_t*>(addr))\n"
        "#define pgm_read_word(addr) (*reinterpret_cast<const uint16_t*>(addr))\n"
        "#define pgm_read_ptr(addr) (*(addr))\n",
        encoding="utf-8")
    out=d/"editorial_f2"
    cmd=[compiler,"-std=c++11","-O1","-Wall","-Wextra","-Werror",
         "-I",str(d),"-I",str(FRAME/"src/display"),
         "-I",str(FRAME/"src/assets/fonts"),
         str(CLI),str(FRAME/"src/display/DateEditorialF2Adapter.cpp"),
         str(FRAME/"src/display/EditorialText.cpp"),
         str(FRAME/"src/display/FrameText.cpp"),
         str(FRAME/"src/assets/fonts/RemindEditorialFonts.cpp"),
         "-o",str(out)]
    p=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=85)
    assert p.returncode==0,p.stderr
    return out

def requests():
    scenarios=[
        (2026,9,21,"October","Wednesday",0),
        (2026,11,31,"December","Thursday",0),
        (2024,1,29,"Februar","Torsdag",0),
        (2026,9,21,"Oktober","Onsdag",0),
        (2026,9,21,"Måned","Lørdag",0),
        (2026,9,21,"October","Wednesday",1),
        (2026,3,31,"April","Friday",0),
        (2026,9,21,"☃","Wednesday",0),
    ]
    output=[]
    for w,h in product(range(1,5),repeat=2):
        for x,y in product(range(5-w),range(5-h)):
            for year,month0,day,month,weekday,holidays in scenarios:
                output.append(dict(cell=dict(x=x*200,y=y*120,w=w*200,h=h*120),
                    facts=dict(year=year,month0=month0,day=day,month=month,
                               weekday=weekday,holidays=[
                                   dict(dateLabel="31.10",title="Halloween")
                               ] if holidays else [])))
    assert len(output)==800
    for height in range(245,481,5):
        output.append(dict(cell=dict(x=0,y=0,w=800,h=height),
            facts=dict(year=2026,month0=9,day=21,month="October",
                weekday="Wednesday",holidays=[])))
    return output

def tup4(o):
    return tuple(o[k] for k in ("x","y","w","h"))

def test_original_gfx_f2_native_four_text_baselines_match_js(native):
    req=requests()
    i="".join(json.dumps(row,ensure_ascii=False)+"\n" for row in req)
    js=subprocess.run(["node",str(JS)],input=i,text=True,
                      cwd=ROOT,capture_output=True,timeout=55,check=True)
    expected=[json.loads(line) for line in js.stdout.splitlines()]
    assert len(expected)==len(req)
    nativeInput="".join(
        f'{c["x"]} {c["y"]} {c["w"]} {c["h"]} {f["year"]} {f["month0"]} '
        f'{f["day"]} {len(f["holidays"])} {f["month"]} {f["weekday"]}\n'
        for c,f in ((q["cell"],q["facts"]) for q in req))
    actual=subprocess.run([str(native)],input=nativeInput,text=True,
        cwd=ROOT,capture_output=True,timeout=30,check=True).stdout.splitlines()
    assert len(actual)==len(req)
    has_art=no_art=valid=0
    for rq,js,raw in zip(req,expected,actual):
        result=js["editorial"]
        # The strict adapter is intentionally narrower than full Latin1 JS;
        # all cases here are English/Norwegian or unsupported Unicode.
        if result is None:
            assert raw=="fallback",(rq,raw)
            continue
        assert raw!="fallback",rq
        parts=raw.split("|")
        assert len(parts)==11,raw
        score=int(parts[0]);variants=tuple(map(int,parts[1].split(",")))
        art,rule=map(int,parts[2].split(","))
        assert score==result["score"]
        assert variants==(
            int(result["fonts"]["day"]=="Fraunces48"),
            int(result["fonts"]["month"]=="DM18"))
        assert art==int(result["illustration"] is not None)
        assert rule==int(result["ornaments"]["monthRule"] is not None)
        for name,s in zip(("year","month","day","weekday"),parts[3:7]):
            assert tuple(map(int,s.split(",")))==tup4(result["boxes"][name])
        for name,s in zip(("year","month","day","weekday"),parts[7:11]):
            assert tuple(map(int,s.split(",")))==tuple(js["cursors"][name])
        valid+=1;has_art+=art;no_art+=1-art
    assert valid>0 and has_art>0 and no_art>0

def test_f2_editorial_is_only_a_measurement_adapter_without_unsafe_paint():
    src=(FRAME/"src/display/DateEditorialF2Adapter.cpp").read_text()
    h=(FRAME/"src/display/DateEditorialF2Adapter.h").read_text()
    assert "EditorialText::measureLine(" in src
    assert "EditorialText::planLine(" in src
    assert "DateEditorialPlan::plan(input)" in src
    assert "RemindEditorialFonts::fraunces72()" in src
    assert "RemindEditorialFonts::fraunces48()" in src
    assert "RemindEditorialFonts::dm24()" in src
    assert "RemindEditorialFonts::dm18()" in src
    assert "next.valid=true;" in src
    assert "output=next;" in src
    for banned in ("DisplayCore::","setCursor(", "drawPixel(",
                   "ModuleSurf", "colSpan", "rowSpan"):
        assert banned not in src+h
    mod=(FRAME/"src/modules/ModuleDate.cpp").read_text()
    # Native adapter is now used only in explicitly enabled experimental
    # firmware; standard Alfred still compiles out the entire painter.
    assert "#define REMIND_DATE_EDITORIAL_PREVIEW_ENABLED 0" in mod
    assert '#if REMIND_DATE_EDITORIAL_PREVIEW_ENABLED\n#include "DateEditorialF2Adapter.h"\n#endif' in mod
    assert "tryDrawEditorialDatePreview(" in mod
