"""Native F1/F2 actual-font C++ ↔ JS date geometry parity.

Compiles the ORIGINAL screen-6 GFX font sources and F2 measurement engine
with Arduino/Adafruit GFX host stubs. This is source-level QA only; it does
not render a bitmap or constitute a physical frame visual acceptance.
"""
import json
import shutil
import subprocess
from itertools import product
from pathlib import Path

import pytest

ROOT=Path(__file__).resolve().parents[2]
FRAME=ROOT/"frame"
ADAPTER=FRAME/"src/display/DateF2InkAdapter.cpp"
SRC_FONT=FRAME/"src/assets/fonts/RemindEditorialFonts.cpp"
F2=FRAME/"src/display/EditorialText.cpp"
NORMALIZER=FRAME/"src/display/FrameText.cpp"
CLI=FRAME/"tests/helpers/date_f2_native_cli.cpp"
JS=FRAME/"tests/helpers/date_gfx_ink_cli.mjs"

# 100 legal 4x4 grid geometry/position cases × eight sets of actual glyph data.
FACTS=[
  (1,"May","Sunday"),
  (31,"September","Wednesday"),
  (30,"December","Thursday"),
  (8,"July","Monday"),
  (2,"February","Saturday"),
  (17,"January","Wednesday"),
  (27,"October","Tuesday"),
  (29,"August","Friday"),
]


@pytest.fixture(scope="module")
def native(tmp_path_factory):
    compiler=shutil.which("g++")
    node=shutil.which("node")
    if not compiler or not node:
        pytest.skip("Requires g++ and Node; available in CI Linux runner")
    temp=tmp_path_factory.mktemp("original_gfx")
    (temp/"Adafruit_GFX.h").write_text(
        "#pragma once\n#include <stdint.h>\n"
        "struct GFXglyph {uint16_t bitmapOffset; uint8_t width,height,xAdvance;"
        "int8_t xOffset,yOffset;};\n"
        "struct GFXfont {uint8_t* bitmap;GFXglyph* glyph;"
        "uint16_t first,last;uint8_t yAdvance;};\n",
        encoding="utf-8")
    (temp/"Arduino.h").write_text(
        '#pragma once\n#include <stdint.h>\n'
        '#define PROGMEM\n'
        '#define pgm_read_byte(addr) (*reinterpret_cast<const uint8_t*>(addr))\n'
        '#define pgm_read_word(addr) (*reinterpret_cast<const uint16_t*>(addr))\n'
        '#define pgm_read_ptr(addr) (*(addr))\n',
        encoding="utf-8")
    target=temp/"date_f2_real_native"
    cmd=[compiler,"-std=c++11","-O1","-Wall","-Wextra","-Werror",
         "-I",str(temp),"-I",str(FRAME/"src/display"),
         "-I",str(FRAME/"src/assets/fonts"),
         str(CLI),str(ADAPTER),str(SRC_FONT),str(F2),str(NORMALIZER),
         "-o",str(target)]
    p=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=90)
    assert p.returncode==0,p.stderr
    return target


def cases():
    rows=[]
    for cols,rspan in product(range(1,5),repeat=2):
        for col,row in product(range(5-cols),range(5-rspan)):
            for day,month,weekday in FACTS:
                rows.append((col*200,row*120,cols*200,rspan*120,
                             day,month,weekday))
    assert len(rows)==800
    rows += [
        (0,0,200,240,1,"Måned","Lørdag"),
        (200,120,400,240,31,"Måned","Lørdag"),
        (0,0,200,120,27,"October","☃"),
        (0,0,200,120,0,"May","Friday"),
        (0,0,200,120,32,"May","Friday"),
        (1000,1000,200,240,10,"May","Monday"),
        (0,0,200,240,10,"May","🙂"),
    ]
    return rows


def test_complete_real_original_f1_f2_gfx_date_geometry_matches_js(native):
    examples=cases()
    cpptext="".join(" ".join(map(str,x))+"\n" for x in examples)
    cpp=subprocess.run([str(native)],input=cpptext,capture_output=True,
                       text=True,cwd=ROOT,timeout=40,check=True)
    cppvalues=cpp.stdout.splitlines()
    jsinput="".join(json.dumps({
        "cell":{"x":x,"y":y,"w":w,"h":h},
        "facts":{"day":day,"month":month,"weekday":weekday}},
        ensure_ascii=False)+"\n"
        for x,y,w,h,day,month,weekday in examples)
    jsproc=subprocess.run(["node",str(JS)],input=jsinput,text=True,
                          capture_output=True,cwd=ROOT,timeout=40,check=True)
    jsvalues=[json.loads(x) for x in jsproc.stdout.splitlines()]
    assert len(jsvalues)==len(cppvalues)==len(examples)
    successes=0
    fonts=("Fraunces72","Fraunces48")
    context=("DM24","DM18")
    for facts,raw,js in zip(examples,cppvalues,jsvalues):
        if raw=="fallback":
            assert not js["valid"],facts
            continue
        assert js["valid"],facts
        parts=raw.split("|")
        assert len(parts)==10,(facts,raw)
        assert parts[0]==js["mode"],facts
        variants=list(map(int,parts[1].split(",")))
        assert js["fonts"]=={"day":fonts[variants[0]],
                             "month":context[variants[1]],
                             "weekday":context[variants[2]]}
        for name,text in zip(("visible","group","month","day","weekday"),
                             parts[2:7]):
            actual=tuple(map(int,text.split(",")))
            expected=tuple(js["boxes"][name][k] for k in ("x","y","w","h"))
            assert actual==expected,(facts,name,actual,expected)
        for name,text in zip(("day","month","weekday"),parts[7:10]):
            actual=tuple(map(int,text.split(",")))
            b=js["boxes"][name]
            metric=js["ink"][name]
            assert actual==(b["x"]-metric["minX"],
                            b["y"]-metric["minY"]),(facts,name)
        successes+=1
    assert successes>0
    assert successes<len(examples)


def test_f2_bridge_is_opt_in_and_not_grid_hardcoded():
    c=ADAPTER.read_text(encoding="utf-8")
    h=(FRAME/"src/display/DateF2InkAdapter.h").read_text(encoding="utf-8")
    assert "RemindEditorialFonts::fraunces72()" in c
    assert "RemindEditorialFonts::fraunces48()" in c
    assert "EditorialText::measureLine(" in c
    assert "EditorialText::planLine(" in c
    assert "DateRolePlanner::plan(input)" in c
    # Ignore comments: a warning saying "no colSpan/rowSpan" is not a
    # renderer switch. Inspect executable source instead of prose.
    import re
    code=re.sub(r"//[^\n]*|/\*[\s\S]*?\*/", "", c+"\n"+h)
    assert all(token not in code for token in
               ("colSpan","rowSpan","drawDate", "ModuleSurf",
                "DisplayCore::", "setCursor(", "fillRect(", "drawPixel("))
    assert "output = {};" in c
    assert "candidate.valid=true;" in c
    mod=(FRAME/"src/modules/ModuleDate.cpp").read_text(encoding="utf-8")
    assert "DateF2InkAdapter" not in mod
    # Unknown printable symbols are rejected rather than silently removed
    # by the existing UTF-8 display normalizer.
    assert "(*p >= 'A' && *p <= 'Z')" in c
    assert "*p == 0x27" in c

