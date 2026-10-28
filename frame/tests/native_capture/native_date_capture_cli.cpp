// R4 native C++ Date painter, test-only host capture of firmware draw calls.
// This includes the REAL ModuleDate.cpp below; it NEVER runs on the ESP32.
// DisplayCore/Theme/Arduino headers are host shims; their 1-bit rasterization
// is NOT the GxEPD2 controller's actual paged framebuffer or waveform.
#include "CaptureFrameDisplay.h"
#include "DisplayCore.h"
#include "Theme.h"
#include <fstream>
#include <iostream>
#include <string>
#include <time.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdio.h>

namespace NativeCapture {
  bool dark=false;
  int year=2026, month0=9, day=21;
}
static CaptureFrameDisplay g_captureDisplay;

namespace DisplayCore {
  FrameDisplay& get(){return g_captureDisplay;}
}
bool getLocalTime(struct tm* target, unsigned long /*timeout*/) {
  if(!target)return false;
  struct tm value={};
  value.tm_year=NativeCapture::year-1900;
  value.tm_mon=NativeCapture::month0;
  value.tm_mday=NativeCapture::day;
  value.tm_hour=12;
  if(mktime(&value)==static_cast<time_t>(-1))return false;
  *target=value;
  return true;
}

// Include the real, completely UNEDITED firmware Date painter at C++ level.
// This lets the test call the static editorial preflight to distinguish
// captured experimental drawings from a truthful legacy fallback.
#include "../../src/modules/ModuleDate.cpp"

static uint64_t fnv1a(const std::vector<uint8_t>& buffer){
  uint64_t hash=14695981039346656037ULL;
  for(uint8_t p:buffer){hash^=p;hash*=1099511628211ULL;}
  return hash;
}
static int changed(const std::vector<uint8_t>& pixels,uint8_t bg,
                   int x,int y,int w,int h,bool inside){
  int result=0;
  for(int yy=0;yy<CaptureFrameDisplay::HEIGHT;++yy)
    for(int xx=0;xx<CaptureFrameDisplay::WIDTH;++xx){
      const bool in=xx>=x&&yy>=y&&xx<x+w&&yy<y+h;
      if((inside?in:!in)&&pixels[yy*CaptureFrameDisplay::WIDTH+xx]!=bg)
        ++result;
    }
  return result;
}
int main(int argc,char** argv){
  if(argc!=11){
    std::cerr<<"usage: capture outfile.pgm year month0 day x y w h dark holiday\n";
    return 2;
  }
  const std::string path=argv[1];
  NativeCapture::year=atoi(argv[2]);
  NativeCapture::month0=atoi(argv[3]);
  NativeCapture::day=atoi(argv[4]);
  const int x=atoi(argv[5]),y=atoi(argv[6]),w=atoi(argv[7]),h=atoi(argv[8]);
  const bool dark=atoi(argv[9])!=0,holiday=atoi(argv[10])!=0;
  if(NativeCapture::year<1900||NativeCapture::year>2099||
     NativeCapture::month0<0||NativeCapture::month0>11||
     NativeCapture::day<1||NativeCapture::day>31||
     x<0||y<0||w<1||h<1||x+w>800||y+h>480)return 3;
  Theme::set(dark?THEME_DARK:THEME_LIGHT);
  FrameConfig config={};
  config.date.holidayCount=holiday?1:0;
  if(holiday){
    HolidayItem& item=config.date.holidays[0];
    item.year=NativeCapture::year;
    item.month=NativeCapture::month0+1;
    item.day=31;
    snprintf(item.name,sizeof item.name,"%s","Halloween");
  }
  ModuleDate::setConfig(&config);
  Cell cell={x,y,w,h,0,0,0,4,4,CELL_ADAPTIVE};
  g_captureDisplay.clear(Theme::paper());
  // Actual production entrypoint. No mocked data/placement beyond fixture.
  ModuleDate::render(cell);
  const auto frame=g_captureDisplay.pixels;
  const auto packed=g_captureDisplay.packed;
  const int packedPixelMismatches=g_captureDisplay.packedPixelMismatches();
  const int firstOob=g_captureDisplay.outOfBounds;
  // Native editorial admission is assessed through the SAME function after
  // reset; fallback render paint is NOT misrepresented as Date editorial.
  g_captureDisplay.clear(Theme::paper());
  struct tm local={};
  if(!getLocalTime(&local,10))return 4;
  const bool admitted=tryDrawEditorialDatePreview(
      cell,safeWday(local.tm_wday),safeMonth(local.tm_mon),
      NativeCapture::year,NativeCapture::month0,NativeCapture::day);
  const auto editorial=g_captureDisplay.pixels;
  // DEBUG/QA ONLY: replay the real native preflight stages with their actual
  // functions, without altering a single byte of ModuleDate.cpp.
  DateEditorialF2::Result candidate={};
  const DateRolePlanner::Rect bounds={x,y,w,h};
  const bool f2=DateEditorialF2::plan(bounds,NativeCapture::year,
     NativeCapture::month0,NativeCapture::day,safeMonth(local.tm_mon),
     safeWday(local.tm_wday),0,candidate);
  const bool wantsDual=(w>=700&&h>=330)||(w>=520&&h>=400);
  bool dualValid=false,gridValid=false,fontValid=false,
       nextGridValid=false,nextFontValid=false,radiusValid=false,
       holidayValid=false;
  int gridCellW=0,gridCellH=0;
  if(f2){
    const auto& p=candidate.geometry;
    const auto dual=DateEditorialDual::plan(p,NativeCapture::year,
                                            NativeCapture::month0);
    dualValid=dual.valid;
    const DateRolePlanner::Rect calendarArea=
       wantsDual?dual.current:p.calendar;
    const auto grid=DateMonthGridPlan::plan(calendarArea,
       NativeCapture::year,NativeCapture::month0,
       p.showTitle,p.showWeeks,p.showDow,true);
    gridValid=grid.valid;
    if(gridValid){
      fontValid=gridFontFits(grid,false,RemindEditorialFonts::dm18());
      gridCellW=grid.cellW;gridCellH=grid.cellH;
      radiusValid=min(16,min(grid.cellW,grid.cellH)/2-2)>=11;
    }
    if(wantsDual&&dual.valid){
      const auto next=DateMonthGridPlan::plan(
         dual.next,dual.nextYear,dual.nextMonth0,true,p.showWeeks,true,true);
      nextGridValid=next.valid;
      nextFontValid=next.valid&&
        gridFontFits(next,dual.showNextYear,RemindEditorialFonts::dm18());
    }else if(!wantsDual){nextGridValid=true;nextFontValid=true;}
    EditorialHolidayDraw hdraw={};
    holidayValid=preflightEditorialHolidays(
       p,NativeCapture::year,NativeCapture::month0,
       NativeCapture::day,hdraw);
  }
  if(admitted&&g_captureDisplay.packed!=packed){
    std::cerr<<"Packed byte capture differs from replay of native editorial painter";
    return 9;
  }
  if(packed.size()!=800*480/8||packedPixelMismatches){
    std::cerr<<"Host one-byte pixels and 48k GxEPD2-style packed bits disagree";
    return 10;
  }
  if(admitted&&editorial!=frame){
    std::cerr<<"Actual ModuleDate::render differs from same native editorial painter";
    return 5;
  }
  const uint8_t background=dark?1:0;
  const int inkInside=changed(frame,background,x,y,w,h,true);
  const int inkOutside=changed(frame,background,x,y,w,h,false);
  const int inkOutsideMatte=changed(
    frame,background,58,39,680,436,false);
  if(admitted&&(inkInside<300||inkOutside!=0||inkOutsideMatte!=0||firstOob)){
    std::cerr<<"Native Date ink exceeded own cell/matte or missing, "
             <<inkInside<<","<<inkOutside<<","<<inkOutsideMatte<<","<<firstOob;
    return 6;
  }
  std::ofstream pgm(path.c_str(),std::ios::binary);
  if(!pgm){std::cerr<<"Unable to write PGM";return 7;}
  pgm<<"P5\n800 480\n255\n";
  for(uint8_t pixel:frame){
    const unsigned char gray=pixel?0:255;
    pgm.write(reinterpret_cast<const char*>(&gray),1);
  }
  if(!pgm.good()){std::cerr<<"PGM write failed";return 8;}
  // Test-only evidence: data bytes match the pinned GxEPD2_BW packing
  // convention, NOT a GxEPD2 object's actual framebuffer or SPI capture.
  std::ofstream bitstream((path+".packed.bin").c_str(),std::ios::binary);
  if(!bitstream){std::cerr<<"Unable to write packed host buffer";return 11;}
  bitstream.write(reinterpret_cast<const char*>(packed.data()),packed.size());
  if(!bitstream.good()){std::cerr<<"Packed host write failed";return 12;}
  std::cout<<"{\"admitted\":"<<(admitted?"true":"false")
           <<",\"inkInside\":"<<inkInside
           <<",\"inkOutside\":"<<inkOutside
           <<",\"inkOutsideMatte\":"<<inkOutsideMatte
           <<",\"outOfBounds\":"<<firstOob
           <<",\"dark\":"<<(dark?"true":"false")
           <<",\"holiday\":"<<(holiday?"true":"false")
           <<",\"preflight\":{\"f2\":"<<(f2?"true":"false")
           <<",\"needsDual\":"<<(wantsDual?"true":"false")
           <<",\"dual\":"<<(dualValid?"true":"false")
           <<",\"grid\":"<<(gridValid?"true":"false")
           <<",\"gridFont\":"<<(fontValid?"true":"false")
           <<",\"nextGrid\":"<<(nextGridValid?"true":"false")
           <<",\"nextFont\":"<<(nextFontValid?"true":"false")
           <<",\"ring\":"<<(radiusValid?"true":"false")
           <<",\"holiday\":"<<(holidayValid?"true":"false")
           <<",\"cellW\":"<<gridCellW<<",\"cellH\":"<<gridCellH<<"}"
           <<",\"hash\":\""<<std::hex<<fnv1a(frame)<<std::dec<<"\""
           <<",\"packedHash\":\""<<std::hex<<fnv1a(packed)<<std::dec<<"\""
           <<",\"packedBytes\":"<<packed.size()
           <<",\"packedPixelMismatches\":"<<packedPixelMismatches
           <<"}\n";
  return 0;
}
