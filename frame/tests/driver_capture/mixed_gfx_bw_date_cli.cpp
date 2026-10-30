// Test-only mixed Date scene using ORIGINAL pinned upstream GFX+GxEPD2_BW.
// Only admitted editorial Date cells are painted; legacy Date and all other
// module cells remain deliberately blank, NEVER represented as full compositing.
// No production firmware/source modifications. Mock T7; no SPI or panel.
#define REMIND_MIXED_DIRECT_GFX_AUDIT
#include "direct_gfx_bw_date_cli.cpp"
#include <sstream>

struct DateSlot { Cell cell; bool admitted; };

int main(int argc, char** argv) {
  try {
    if(argc<8)throw std::runtime_error("mixed usage: out.bin year month0 day dark holiday n [x y w h]*n");
    const std::string output=argv[1];
    NativeCapture::year=atoi(argv[2]);NativeCapture::month0=atoi(argv[3]);
    NativeCapture::day=atoi(argv[4]);
    const bool dark=atoi(argv[5])!=0;
    const bool holiday=atoi(argv[6])!=0;
    const int n=atoi(argv[7]);
    if(n<1||n>16||argc!=8+4*n)throw std::runtime_error("invalid slot argument count");
    if(NativeCapture::year<1900||NativeCapture::year>2099||
       NativeCapture::month0<0||NativeCapture::month0>11||
       NativeCapture::day<1||NativeCapture::day>31)
      throw std::runtime_error("invalid date");

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
    struct tm local={};
    if(!getLocalTime(&local,10))throw std::runtime_error("invalid date fixture");
    g_display.setRotation(0);
    g_display.setFullWindow();
    if(g_display.pages()!=1||g_display.pageHeight()!=480)
      throw std::runtime_error("driver isn't single 800x480 page");

    std::vector<DateSlot> slots;
    for(int i=0;i<n;++i){
      const int p=8+4*i;
      const int x=atoi(argv[p]),y=atoi(argv[p+1]),
                w=atoi(argv[p+2]),h=atoi(argv[p+3]);
      if(x<0||y<0||w<1||h<1||x+w>800||y+h>480)
        throw std::runtime_error("invalid Date slot");
      // The exact same production Date editorial preflight both admits and
      // paints. Reset between probes to prevent temporary raster pollution.
      Cell c={x,y,w,h,0,0,0,4,4,CELL_ADAPTIVE};
      g_display.firstPage();
      g_display.fillScreen(Theme::paper());
      const bool admitted=tryDrawEditorialDatePreview(
          c,safeWday(local.tm_wday),safeMonth(local.tm_mon),
          NativeCapture::year,NativeCapture::month0,NativeCapture::day);
      slots.push_back({c,admitted});
    }

    g_display.firstPage();
    g_display.fillScreen(Theme::paper());
    int admittedCount=0;
    for(const auto& slot:slots){
      if(!slot.admitted)continue;
      // Only admitted Date cells call the ORIGINAL production entry point.
      // A legacy fallback in the remaining cells is NOT captured.
      ModuleDate::render(slot.cell);
      ++admittedCount;
    }
    if(g_display.nextPage())
      throw std::runtime_error("unexpected second GxEPD2 page");
    const Mock750T7& sink=g_display.epd2;
    if(sink.bytes.size()!=48000||sink.fullWrites!=1||
       sink.fullRefreshes!=1||sink.againWrites!=1||sink.powerOffs!=1)
      throw std::runtime_error("upstream GxEPD2 transfer sequence mismatch");
    int pixelsOutsideAdmittedSlots=0, pixelsOutsideMatte=0, ink=0;
    for(int y=0;y<480;++y)for(int x=0;x<800;++x){
      const bool black=blackBit(sink.bytes,x,y)!=0;
      if(black==dark)continue;
      ++ink;
      bool inAdmitted=false;
      for(const auto& slot:slots)if(slot.admitted &&
          x>=slot.cell.x && y>=slot.cell.y &&
          x<slot.cell.x+slot.cell.w && y<slot.cell.y+slot.cell.h){
        inAdmitted=true;break;
      }
      if(!inAdmitted)++pixelsOutsideAdmittedSlots;
      // JSON compatibility retains old metric name; assert full-panel bounds.
      if(x<0||x>=800||y<0||y>=480)++pixelsOutsideMatte;
    }
    if(pixelsOutsideAdmittedSlots||pixelsOutsideMatte)
      throw std::runtime_error("original Date GFX ink escaped owned cells/panel");
    writeAll(output,sink.bytes);
    std::cout<<"{\"realModuleDateCpp\":true,\"realAdafruitGFXCpp\":true,"
      <<"\"realGxEPD2BW\":true,\"realOtherModules\":false,"
      <<"\"legacyFallbackPainted\":false,\"realT7\":false,"
      <<"\"realSPI\":false,\"realPanel\":false,\"dateSlots\":"<<n
      <<",\"admitted\":"<<admittedCount
      <<",\"fallback\":"<<n-admittedCount
      <<",\"paintedInk\":"<<ink
      <<",\"inkOutsideAdmittedCells\":"<<pixelsOutsideAdmittedSlots
      <<",\"inkOutsideMatte\":"<<pixelsOutsideMatte
      <<",\"transferBytes\":"<<sink.bytes.size()
      <<",\"slotAdmissions\":[";
    for(int i=0;i<n;++i){
      if(i)std::cout<<",";
      std::cout<<(slots[i].admitted?"true":"false");
    }
    std::cout<<"]}\n";
    return 0;
  }catch(const std::exception& e){
    std::cerr<<"mixed original GFX/BW QA error: "<<e.what()<<"\n";
    return 3;
  }
}
