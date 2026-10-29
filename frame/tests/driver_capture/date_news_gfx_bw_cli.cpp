// Date + genuine ModuleNews.cpp draw through original Adafruit_GFX v1.12.6
// and original GxEPD2_BW v1.6.4 (mock T7 sink).
// News cache is SEEDED in test only: no live API, no fake News renderer,
// no change to modules, Surf or production firmware.
#define REMIND_MIXED_DIRECT_GFX_AUDIT
#include "direct_gfx_bw_date_cli.cpp"
#include <stdarg.h>
#include "../../src/modules/ModuleNews.h"
// ModuleNews.cpp is a SEPARATE translation unit as in real firmware. The only
// test-only extension is seeded cache data; module implementation is unpatched.
void seedRealNewsHeadlines();

static std::vector<uint8_t> paint(int mode,const Cell& date,const Cell& news){
  g_display.setRotation(0);
  g_display.setFullWindow();
  if(g_display.pages()!=1||g_display.pageHeight()!=480)
    throw std::runtime_error("Unexpected e-paper page config");
  const int writtenBefore=g_display.epd2.fullWrites;
  const int refreshBefore=g_display.epd2.fullRefreshes;
  const int againBefore=g_display.epd2.againWrites;
  const int offBefore=g_display.epd2.powerOffs;
  g_display.firstPage();
  g_display.fillScreen(Theme::paper());
  if(mode==0||mode==2)ModuleDate::render(date);
  if(mode==1||mode==2||mode==3)ModuleNews::render(news,String("news"));
  if(mode==3)ModuleDate::render(date);
  if(g_display.nextPage())throw std::runtime_error("unexpected more than one page");
  const auto& sink=g_display.epd2;
  if(sink.fullWrites!=writtenBefore+1||
     sink.fullRefreshes!=refreshBefore+1||
     sink.againWrites!=againBefore+1||
     sink.powerOffs!=offBefore+1||
     sink.bytes.size()!=48000)
    throw std::runtime_error("Full transfer sequence invalid");
  return sink.bytes;
}

static int nonBackground(const std::vector<uint8_t>& page,
                         bool dark,int x0,int y0,int w,int h){
  int out=0;
  for(int y=y0;y<y0+h;++y)for(int x=x0;x<x0+w;++x){
    const bool black=blackBit(page,x,y)!=0;
    if(black!=dark)++out;
  }
  return out;
}
static int bitDifferences(const std::vector<uint8_t>& a,
                          const std::vector<uint8_t>& b){
  if(a.size()!=b.size())throw std::runtime_error("length mismatch");
  int n=0;
  for(size_t i=0;i<a.size();++i){
    uint8_t v=a[i]^b[i];
    for(int bit=0;bit<8;++bit){n+=v&1;v>>=1;}
  }
  return n;
}
int main(int argc,char**argv){
  if(argc!=7){std::cerr<<"usage: news-composite out-prefix year month0 day dark newsSide\n";return 2;}
  try{
    const std::string prefix=argv[1];
    NativeCapture::year=atoi(argv[2]);NativeCapture::month0=atoi(argv[3]);
    NativeCapture::day=atoi(argv[4]);const bool dark=atoi(argv[5])!=0;
    const std::string newsSide=argv[6];
    if(newsSide!="left"&&newsSide!="right")
      throw std::runtime_error("newsSide must be left/right");
    const bool newsOnLeft=(newsSide=="left");
    if(NativeCapture::year<1900||NativeCapture::year>2099||
       NativeCapture::month0<0||NativeCapture::month0>11||
       NativeCapture::day<1||NativeCapture::day>31)throw std::runtime_error("bad date");
    Theme::set(dark?THEME_DARK:THEME_LIGHT);
    FrameConfig config={};
    snprintf(config.language,sizeof(config.language),"en");
    ModuleDate::setConfig(&config);
    ModuleNews::setConfig(&config);
    seedRealNewsHeadlines(); // test-only cache setup in separate News TU

    // Same full-panel 4x4 layout, two mirror placements. Production renderers
    // retain their actual cell geometry; tests do not change module source.
    const int dateX=newsOnLeft?200:0;
    const int newsX=newsOnLeft?0:600;
    const Cell date={dateX,0,600,480,0,newsOnLeft?1:0,0,3,4,CELL_ADAPTIVE};
    const Cell news={newsX,0,200,480,1,newsOnLeft?0:3,0,1,4,CELL_ADAPTIVE};
    struct tm local={};
    if(!getLocalTime(&local,10))throw std::runtime_error("bad local time");
    // Prove Date is actually admitted in this width, not a legacy fallback.
    g_display.firstPage();
    g_display.fillScreen(Theme::paper());
    if(!tryDrawEditorialDatePreview(date,safeWday(local.tm_wday),
       safeMonth(local.tm_mon),NativeCapture::year,
       NativeCapture::month0,NativeCapture::day))
      throw std::runtime_error("Date 3x4 editorial not admitted");
    const auto onlyDate=paint(0,date,news);
    const auto onlyNews=paint(1,date,news);
    const auto dateThenNews=paint(2,date,news);
    const auto newsThenDate=paint(3,date,news);
    std::vector<uint8_t> independent(48000);
    for(size_t i=0;i<independent.size();++i)
      independent[i]=dark?uint8_t(onlyDate[i]|onlyNews[i])
                         :uint8_t(onlyDate[i]&onlyNews[i]);

    // Full 800x480 is the current logical viewport, NOT a 680x436 matte.
    // Both original renderers must paint within their own nominal cells.
    const int dateInk=nonBackground(onlyDate,dark,dateX,0,600,480);
    const int newsInk=nonBackground(onlyNews,dark,newsX,0,200,480);
    const int dateLeak=nonBackground(onlyDate,dark,newsX,0,200,480);
    const int newsLeak=nonBackground(onlyNews,dark,dateX,0,600,480);
    const int dateVsComposite=bitDifferences(dateThenNews,independent);
    const int reverseVsComposite=bitDifferences(newsThenDate,independent);
    if(dateInk<300||newsInk<30||dateLeak||newsLeak||dateVsComposite||
       reverseVsComposite)
      throw std::runtime_error("Real Date/News cell or independent composition failed: "+
         std::to_string(dateInk)+"/"+std::to_string(newsInk)+
         "/"+std::to_string(dateLeak)+"/"+std::to_string(newsLeak)+
         "/"+std::to_string(dateVsComposite)+"/"+std::to_string(reverseVsComposite));

    writeAll(prefix+"-date-only.bin",onlyDate);
    writeAll(prefix+"-news-only.bin",onlyNews);
    writeAll(prefix+"-date-then-news.bin",dateThenNews);
    writeAll(prefix+"-news-then-date.bin",newsThenDate);
    std::cout<<"{\"realModuleDateCpp\":true,\"realModuleNewsCpp\":true,"
        <<"\"realAdafruitGfxCpp\":true,\"realGxEPD2BW\":true,"
        <<"\"syntheticNewsFixture\":true,\"networkAttempted\":false,"
        <<"\"realT7Transport\":false,\"realSPI\":false,\"realPanel\":false,"
        <<"\"dateEditorialAdmitted\":true,\"newsSide\":\""<<newsSide<<"\""
        <<",\"dateCellX\":"<<dateX<<",\"newsCellX\":"<<newsX
        <<",\"dateInk\":"<<dateInk
        <<",\"newsInk\":"<<newsInk
        <<",\"newsInkInsideDate\":"<<newsLeak
        <<",\"dateInkInsideNews\":"<<dateLeak
        <<",\"dateThenNewsVsIndependentBits\":"<<dateVsComposite
        <<",\"newsThenDateVsIndependentBits\":"<<reverseVsComposite
        <<",\"frameBytes\":48000}\n";
    return 0;
  }catch(const std::exception& e){
    std::cerr<<"Real Date+News host composite failed: "<<e.what()<<"\n";
    return 3;
  }
}
