from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
HEADER = ROOT / "src" / "display" / "EditorialFigures.h"

def test_coastal_weather_vignette_stays_one_bit_and_inside_reserved_box():
    compiler = shutil.which("g++") or shutil.which("clang++")
    assert compiler and HEADER.exists()
    source = r"""
#include "EditorialFigures.h"
#include <cassert>
#include <initializer_list>
struct Canvas {
  int left=0, top=0, right=0, bottom=0, calls=0;
  bool outside=false;
  void point(int x,int y) {
    if(x<left||x>right||y<top||y>bottom) outside=true;
  }
  void drawLine(int x1,int y1,int x2,int y2,unsigned short ink) {
    assert(ink==1);point(x1,y1);point(x2,y2);++calls;
  }
};
int main(){
  using namespace EditorialFigures;
  assert(coastalSkyFor(2,2)==COAST_FAIR);
  assert(coastalSkyFor(3,2)==COAST_OVERCAST);
  assert(coastalSkyFor(2,9)==COAST_WIND);
  assert(coastalSkyFor(63,9)==COAST_RAIN); // rain outranks wind
  assert(coastalSkyFor(73,9)==COAST_SNOW); // snow outranks wind
  assert(coastalSkyFor(85,2)==COAST_SNOW);
  const int wmos[]={0,2,3,45,61,73,85,95};
  for(int wmo:wmos) for(int w=110;w<=210;w+=20)
    for(int h=70;h<=140;h+=14){
      Canvas c;c.left=7;c.top=11;c.right=c.left+w-1;c.bottom=c.top+h-1;
      weatherCoastalVignette(c,c.left,c.top,w,h,wmo,8.5f,1);
      assert(c.calls>=18&&!c.outside);
    }
  Canvas small;
  weatherCoastalVignette(small,0,0,80,50,3,2,1);
  assert(small.calls==0);
}
"""
    with tempfile.TemporaryDirectory() as temp:
        src=Path(temp)/"vignette.cpp"; exe=Path(temp)/"vignette"
        src.write_text(source,encoding="utf-8")
        subprocess.run([compiler,"-std=c++11","-Wall","-Wextra","-Werror",
                        "-I",str(HEADER.parent),str(src),"-o",str(exe)],
                       check=True,capture_output=True,text=True)
        subprocess.run([str(exe)],check=True,capture_output=True,text=True)

def test_botanical_sprig_stays_inside_reserved_date_region():
    compiler = shutil.which("g++") or shutil.which("clang++")
    assert compiler and HEADER.exists()
    source = r"""
#include "EditorialFigures.h"
#include <cassert>
struct Canvas {
  int left=0, top=0, right=0, bottom=0, calls=0;
  bool out=false;
  void point(int x,int y) { if(x<left || x>right || y<top || y>bottom) out=true; }
  void drawLine(int x1,int y1,int x2,int y2,unsigned short ink) {
    assert(ink==1);point(x1,y1);point(x2,y2);++calls;
  }
};
int main(){
  for(int w=72;w<=180;w+=27) for(int h=60;h<=120;h+=15) {
    Canvas c; c.left=4;c.top=9;c.right=c.left+w-1;c.bottom=c.top+h-1;
    EditorialFigures::botanicalSprig(c,c.left,c.top,w,h,1);
    assert(c.calls>=10 && !c.out);
  }
  Canvas tiny; EditorialFigures::botanicalSprig(tiny,0,0,50,30,1);
  assert(tiny.calls==0);
  return 0;
}
"""
    with tempfile.TemporaryDirectory() as temp:
        src=Path(temp)/"botanical.cpp"; exe=Path(temp)/"botanical"
        src.write_text(source,encoding="utf-8")
        subprocess.run([compiler,"-std=c++11","-Wall","-Wextra","-Werror",
                        "-I",str(HEADER.parent),str(src),"-o",str(exe)],
                       check=True,capture_output=True,text=True)
        subprocess.run([str(exe)],check=True,capture_output=True,text=True)
