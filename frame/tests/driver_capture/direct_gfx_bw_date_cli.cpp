// Actual upstream Adafruit_GFX 1.12.6 -> actual GxEPD2_BW 1.6.4
// executing original firmware ModuleDate.cpp, test-only mock 750_T7.
// No bitmap replay into GxEPD2, no patched renderer/driver source,
// no SPI, controller hardware, refresh waveform or physical frame.
#define REMIND_DRIVER_REUSE_MOCK_ONLY
#include "real_gxepd2_bw_transfer_cli.cpp"
#include "DisplayCore.h"
#include "Theme.h"
#include <time.h>
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <iostream>
#include <string>
#include <vector>
#include <algorithm>
#include <stdexcept>

namespace NativeCapture {
  bool dark=false;
  int year=2026,month0=9,day=21;
}
static HostDriver g_display(Mock750T7{});
namespace DisplayCore {
  FrameDisplay& get() {return g_display;}
}
bool getLocalTime(struct tm* out, unsigned long) {
  if(!out)return false;
  struct tm t={};
  t.tm_year=NativeCapture::year-1900;
  t.tm_mon=NativeCapture::month0;
  t.tm_mday=NativeCapture::day;
  t.tm_hour=12;
  if(mktime(&t)==static_cast<time_t>(-1))return false;
  *out=t;return true;
}
// The unmodified firmware source is included so its static editorial gate
// can be independently tested before calling ModuleDate::render.
#include "../../src/modules/ModuleDate.cpp"

static int blackBit(const std::vector<uint8_t>& bytes,int x,int y) {
  return !(bytes[static_cast<size_t>(y)*100+x/8]&(0x80u>>(x&7)));
}

#ifndef REMIND_MIXED_DIRECT_GFX_AUDIT
int main(int argc,char**argv) {
  if(argc!=12) {
    std::cerr<<"usage: direct-gfx outfile.bin expected.bin year month0 day x y w h dark holiday\n";
    return 2;
  }
  try {
    const std::string output=argv[1],expectedPath=argv[2];
    const std::vector<uint8_t> expected=readAll(expectedPath);
    if(expected.size()!=48000)throw std::runtime_error("expected binary size != 48000");
    NativeCapture::year=atoi(argv[3]);NativeCapture::month0=atoi(argv[4]);
    NativeCapture::day=atoi(argv[5]);
    const int x=atoi(argv[6]),y=atoi(argv[7]),w=atoi(argv[8]),h=atoi(argv[9]);
    const bool dark=atoi(argv[10])!=0,holiday=atoi(argv[11])!=0;
    if(NativeCapture::year<1900||NativeCapture::year>2099||
       NativeCapture::month0<0||NativeCapture::month0>11||
       NativeCapture::day<1||NativeCapture::day>31||
       x<0||y<0||w<=0||h<=0||x+w>800||y+h>480)
      throw std::runtime_error("invalid fixture");
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
    struct tm local={};
    if(!getLocalTime(&local,10))throw std::runtime_error("local date invalid");
    if(g_display.pages()!=1||g_display.pageHeight()!=480)
      throw std::runtime_error("unexpected actual driver page count");
    g_display.setRotation(0);
    g_display.setFullWindow();
    g_display.firstPage();
    g_display.fillScreen(Theme::paper());
    const bool editorial=tryDrawEditorialDatePreview(
         cell,safeWday(local.tm_wday),safeMonth(local.tm_mon),
         NativeCapture::year,NativeCapture::month0,NativeCapture::day);
    // Reset GxEPD2's *actual* internal page and render from production entry.
    g_display.firstPage();
    g_display.fillScreen(Theme::paper());
    ModuleDate::render(cell);
    if(g_display.nextPage())throw std::runtime_error("unexpected second page");
    const Mock750T7& t=g_display.epd2;
    if(t.fullWrites!=1||t.fullRefreshes!=1||t.againWrites!=1||
       t.powerOffs!=1||t.bytes.size()!=48000)
      throw std::runtime_error("invalid actual GxEPD2 transfer sequence");
    int mismatchBits=0,inkInside=0,inkOutside=0,outsideMatte=0;
    int minMismatchX=800,minMismatchY=480,maxMismatchX=-1,maxMismatchY=-1;
    for(int py=0;py<480;++py)for(int px=0;px<800;++px) {
      const bool black=blackBit(t.bytes,px,py)!=0;
      const bool referenceBlack=blackBit(expected,px,py)!=0;
      if(black!=referenceBlack) {
        ++mismatchBits;
        minMismatchX=std::min(minMismatchX,px);minMismatchY=std::min(minMismatchY,py);
        maxMismatchX=std::max(maxMismatchX,px);maxMismatchY=std::max(maxMismatchY,py);
      }
      if(black==dark)continue;
      const bool inCell=px>=x&&py>=y&&px<x+w&&py<y+h;
      // Historical JSON key outsideMatte remains for existing consumers,
      // but the acceptance boundary is the current full 800x480 panel.
      const bool inPanel=px>=0&&py>=0&&px<800&&py<480;
      if(inCell)++inkInside;else ++inkOutside;
      if(!inPanel)++outsideMatte;
    }
    if(!editorial||inkInside<300||inkOutside||outsideMatte)
      throw std::runtime_error("Date editorial admission/bounds regression");
    writeAll(output,t.bytes);
    std::cout<<"{\"realModuleDate\":true,\"realAdafruitGFX\":true,"
       <<"\"realGxEPD2BW\":true,\"mockT7\":true,\"realSPI\":false,"
       <<"\"realPanel\":false,\"editorialAdmitted\":true,"
       <<"\"inkInside\":"<<inkInside
       <<",\"inkOutside\":"<<inkOutside
       <<",\"outsideMatte\":"<<outsideMatte
       <<",\"transferBytes\":"<<t.bytes.size()
       <<",\"mismatchBits\":"<<mismatchBits
       <<",\"mismatchBounds\":["
       <<(mismatchBits?minMismatchX:-1)<<","
       <<(mismatchBits?minMismatchY:-1)<<","
       <<maxMismatchX<<","<<maxMismatchY<<"]"
       <<",\"fullWrites\":"<<t.fullWrites
       <<",\"refreshes\":"<<t.fullRefreshes
       <<",\"repeatWrites\":"<<t.againWrites
       <<",\"powerOffs\":"<<t.powerOffs<<"}\n";
    return 0; // Pixel differences are a *finding*, not concealed or ignored.
  }catch(const std::exception& e) {
    std::cerr<<"Direct GFX/driver capture failed: "<<e.what()<<"\n";
    return 3;
  }
}

#endif // REMIND_MIXED_DIRECT_GFX_AUDIT
