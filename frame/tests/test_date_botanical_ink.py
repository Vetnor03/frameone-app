"""One-bit botanical native source, matte containment and raster study QA.

The renderer draws original line pixels from the same source tested here.
Compilation and SVG study are NOT GxEPD2 framebuffer/physical evidence.
"""
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"frame/tools"))
from date_botanical_1bit import native_strokes,motif_pixels,render_ink_botanical

ART=ROOT/"frame/src/display/DateEditorialBotanical.h"
DATE=ROOT/"frame/src/modules/ModuleDate.cpp"
SVG=ROOT/"frame/tools/date_editorial_svg.py"
GALLERY=ROOT/"frame/tools/generate_date_dual_holiday_gallery.py"

def test_original_native_stroke_containment_and_monochrome_density():
    width,height,segments=native_strokes()
    assert (width,height)==(84,88)
    assert len(segments)==71
    assert all(3<=a<width and 3<=b<height and
               3<=c<width and 3<=d<height
               for a,b,c,d in segments)
    for box in (
        dict(x=166,y=350,w=82,h=84),
        dict(x=630,y=390,w=32,h=40),
        dict(x=60,y=40,w=82,h=60),
        dict(x=250,y=260,w=82,h=84),
    ):
        pts=motif_pixels(box)
        assert pts and len(pts)>30
        assert max(x for x,_ in pts)<box["x"]+box["w"]
        assert max(y for _,y in pts)<box["y"]+box["h"]
        assert min(x for x,_ in pts)>=box["x"]
        assert min(y for _,y in pts)>=box["y"]
        assert render_ink_botanical(box).count('data-botanical=')==1
    assert 'fill="#191919"' in render_ink_botanical(
        dict(x=200,y=220,w=82,h=84))

def test_integer_scaled_endpoints_match_the_real_native_cpp_header(tmp_path):
    cpp=tmp_path/"botanical.cpp"
    exe=tmp_path/"botanical"
    cpp.write_text(r"""
#include <iostream>
#include "DateEditorialBotanical.h"
int main(){
  using namespace DateEditorialBotanical;
  const Rect regions[]={{165,350,82,84},{630,390,32,40},
                        {60,40,82,60},{250,260,82,84}};
  for(const auto& r:regions)
    for(int i=0;i<strokeCount;++i){
      auto t=strokes[i];
      std::cout<<scaledX(r,t.x0)<<","<<scaledY(r,t.y0)<<","
               <<scaledX(r,t.x1)<<","<<scaledY(r,t.y1)<<"\n";
    }
}
""")
    compile_=subprocess.run(["g++","-std=c++11","-Wall","-Wextra",
        "-Werror","-pedantic","-I",str(ROOT/"frame/src/display"),
        str(cpp),"-o",str(exe)],capture_output=True,text=True,timeout=25)
    assert compile_.returncode==0,compile_.stderr
    output=subprocess.run([str(exe)],capture_output=True,text=True,
                          timeout=10,check=True).stdout.splitlines()
    width,height,segments=native_strokes()
    boxes=[(165,350,82,84),(630,390,32,40),(60,40,82,60),
           (250,260,82,84)]
    expected=[]
    for x,y,w,h in boxes:
        expected.extend(f"{x+a*w//width},{y+b*h//height},"
                        f"{x+c*w//width},{y+d*h//height}"
                        for a,b,c,d in segments)
    assert output==expected

def test_art_remains_optional_and_qa_renders_native_ink_only():
    native=DATE.read_text()
    visual=SVG.read_text()
    gallery=GALLERY.read_text()
    assert '#include "DateEditorialBotanical.h"' in native
    assert "DateEditorialBotanical::strokes[i]" in native
    assert "DateEditorialBotanical::scaledX(box,line.x0)" in native
    assert "DateEditorialBotanical::scaledY(box,line.y0)" in native
    assert "if(holidays.count)" in native
    assert "else if(p.art)paintEditorialSprig(p.botanical)" in native
    assert "render_ink_botanical(a)" in visual
    assert "C39 71" not in visual
    assert '<body class="hide">' in gallery
    assert 'Show measurement guides' in gallery
    assert "ModuleSurf" not in ART.read_text()
