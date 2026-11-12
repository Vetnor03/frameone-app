// RE:MIND Alfred V4 — manual standalone TRUE FOUR-GREY firmware QA.
//
// IMPORTANT: This is NOT production firmware. Only the original,
 // unmodified RemindersEditorialPreview.h + approved bitmap fonts are used
// for actual content. Fixtures are local; no backend, WiFi, Skip or NVS writes.
// This sketch powers the EPD only when USB is present, uses only full-screen
// GxEPD2_4G waveform updates and restores the hardware power-off sequence.
//
// UART: 115200, newline. Commands: help, levels, bg 0..3, next, prev,
// size 1x1..4x4, scene few|normal|many|long|tomorrow|empty|norwegian,
// render, status. A background edit automatically changes ink contrast.

#include <Arduino.h>
#include <SPI.h>
#include <GxEPD2_4G_4G.h>
#include <Fonts/FreeSans9pt7b.h>
#include <driver/gpio.h>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include "../../../src/device/HardwareProfile.h"
#include "../../../src/assets/fonts/RemindEditorialFonts.h"
#include "../../../src/assets/fonts/FreeSans9ptNO.h"

#if !defined(FRAME_IS_ALFRED_V1_2)
#error "This experimental build is only for the Alfred V4 ESP32-S3 board"
#endif

// 800 x 480 physical, real GD7965 controller four-grey waveform.
// 120 rows * 800 pixels * 2 bits = 24000 byte draw buffer.
static GxEPD2_4G_4G<GxEPD2_750_T7, 120> display(
  GxEPD2_750_T7(HardwareProfile::kEpdCs, HardwareProfile::kEpdDc,
                HardwareProfile::kEpdReset, HardwareProfile::kEpdBusy));
static SPIClass epdSPI(FSPI);
static constexpr uint16_t kBG[4] = {
  GxEPD_WHITE, GxEPD_LIGHTGREY, GxEPD_DARKGREY, GxEPD_BLACK
};
static uint8_t gBG=0;
static uint8_t gCols=4, gRows=4;
static bool gShowLevels=true;
static const char* gScenario="normal";
static uint16_t gInk=GxEPD_BLACK;
static bool gBusy=false;
static constexpr int kW=800,kH=480;

namespace Theme {
static uint16_t ink(){return gInk;}
}
struct Cell {int x,y,w,h;};

namespace ModuleReminders {
static const GFXfont* FONT_B9=&FreeSans9pt8b;
struct ReminderItem {
  bool used=false;
  char title[96]={0};
  char time[12]={0};
  char occurrenceDate[16]={0};
  char displayDate[24]={0};
  int daysUntil=0;
  bool isOverdue=false;
};
struct ReminderBucket {
  bool used=false;
  int daysUntil=0;
  bool isOverdue=false;
  int count=0;
  int itemIdx[10]={0};
};
struct ReminderCache {
  bool loaded=false;
  bool ok=false;
  int count=0;
  ReminderItem items[10];
};
static ReminderCache g_storage;
static ReminderCache* g_cache=&g_storage;
static ReminderBucket g_buckets[3];

static void safeCopy(char* dest,size_t cap,const char* from) {
  if(!cap)return;
  snprintf(dest,cap,"%s",from?from:"");
}
static void measureText(const char* str,const GFXfont* font,
                        int16_t& x1,int16_t& y1,uint16_t& w,uint16_t& h) {
  display.setFont(font);
  display.setTextSize(1);
  display.getTextBounds(str,0,0,&x1,&y1,&w,&h);
}
static int textWidth(const char* txt,const GFXfont* font) {
  int16_t x=0,y=0;uint16_t w=0,h=0;
  measureText(txt,font,x,y,w,h);
  return (int)w;
}
static void drawLeft(int x,int baseline,const char* txt,const GFXfont* font,
                     uint16_t color) {
  display.setTextColor(color);
  display.setFont(font);
  display.setTextSize(1);
  display.setCursor(x,baseline);
  display.print(txt);
}
static int wrapTextToLines(const char* src,char lines[][128],int maxLines,
                           int maxWidth,const GFXfont* font,bool& complete) {
  // The exact production Reminders C++ algorithm; never ellipsis a word.
  complete=false;
  if(!lines||maxLines<=0||maxWidth<=0)return 0;
  for(int i=0;i<maxLines;++i)lines[i][0]='\0';
  if(!src||!src[0])return 0;
  char work[240];safeCopy(work,sizeof(work),src);
  int lineCount=0;char current[128]={0};char* save=nullptr;
  char* word=strtok_r(work," ",&save);
  while(word) {
    char candidate[128];
    const int written=current[0]?
      snprintf(candidate,sizeof(candidate),"%s %s",current,word):
      snprintf(candidate,sizeof(candidate),"%s",word);
    if(written>=0 && written<(int)sizeof(candidate) &&
       textWidth(candidate,font)<=maxWidth) {
      safeCopy(current,sizeof(current),candidate);
    } else {
      if(current[0]) {
        if(lineCount>=maxLines)return lineCount;
        safeCopy(lines[lineCount++],128,current);
        current[0]='\0';
      }
      if(textWidth(word,font)<=maxWidth)
        safeCopy(current,sizeof(current),word);
      else return 0;
    }
    word=strtok_r(nullptr," ",&save);
  }
  if(current[0]) {
    if(lineCount>=maxLines)return lineCount;
    safeCopy(lines[lineCount++],128,current);
  }
  complete=true;
  return lineCount;
}
static int findBucketByDaysUntil(const ReminderBucket* buckets,int count,int days) {
  for(int i=0;i<count;++i)
    if(buckets[i].used && buckets[i].daysUntil==days)return i;
  return -1;
}
static int findPrimaryBucketIndex(const ReminderBucket* buckets,int count) {
  const int today=findBucketByDaysUntil(buckets,count,0);
  if(today>=0)return today;
  const int tomorrow=findBucketByDaysUntil(buckets,count,1);
  if(tomorrow>=0)return tomorrow;
  for(int i=0;i<count;++i)if(buckets[i].used)return i;
  return -1;
}
static void buildAdaptiveFallbackHeading(const ReminderBucket& b,
                                         char* out,size_t size) {
  // Native fixture dates intentionally avoid fake dynamic wall-clock semantics.
  if(b.isOverdue || b.daysUntil<0) {
    snprintf(out,size,"%d days late",abs(b.daysUntil));
  } else if(b.daysUntil==0) safeCopy(out,size,"Today");
  else if(b.daysUntil==1) safeCopy(out,size,"Tomorrow");
  else snprintf(out,size,"In %d days",b.daysUntil);
}

// Included EXACTLY from the branch production renderer. Its geometry, real
// bitmap text preflight, group composition and overflow are unchanged.
#include "../../../src/modules/RemindersEditorialPreview.h"

static void append(ReminderBucket& b,const char* title,const char* time="") {
  if(g_cache->count>=10 || b.count>=10)return;
  const int n=g_cache->count++;
  ReminderItem& item=g_cache->items[n];
  item.used=true;item.daysUntil=b.daysUntil;item.isOverdue=b.isOverdue;
  safeCopy(item.title,sizeof(item.title),title);
  safeCopy(item.time,sizeof(item.time),time);
  b.itemIdx[b.count++]=n;
}
static void fixtures(const char* name) {
  g_storage=ReminderCache{};
  g_storage.loaded=true;g_storage.ok=true;
  for(auto& b:g_buckets)b=ReminderBucket{};
  g_buckets[0].used=g_buckets[1].used=true;
  g_buckets[0].daysUntil=0;g_buckets[1].daysUntil=1;
  if(strcmp(name,"few")==0) {
    append(g_buckets[0],"Handle melk og kaffe","09:00");
    append(g_buckets[0],"Vanne plantene","");
  } else if(strcmp(name,"many")==0) {
    for(int i=0;i<5;++i){
      char s[80];snprintf(s,sizeof(s),"Dagens p\xE5" "minnelse %d med avtale",i+1);
      append(g_buckets[0],s,i%2?"":"10:30");
    }
    for(int i=0;i<5;++i){
      char s[80];snprintf(s,sizeof(s),"Morgendagens gj\xF8" "rem\xE5l %d",i+1);
      append(g_buckets[1],s,i%2?"":"18:00");
    }
  } else if(strcmp(name,"long")==0) {
    append(g_buckets[0],"Ring r\xF8" "rleggeren om arbeidet i kjelleren","08:30");
    append(g_buckets[0],"Planlegge bursdagsmiddag for \xC5" "se og \xD8" "yvind");
    append(g_buckets[1],"Husk \xE5 hente varer p\xE5 postkontoret","17:15");
  } else if(strcmp(name,"tomorrow")==0) {
    g_buckets[0].used=false;
    append(g_buckets[1],"Lever \xE5" "rsrapport for prosjektet","08:15");
    append(g_buckets[1],"Bes\xF8" "ke foreldrene");
    append(g_buckets[1],"Handle frukt","18:00");
  } else if(strcmp(name,"norwegian")==0) {
    append(g_buckets[0],"\xC5" "se og \xD8" "yvind: \xE6" "rlig innsats","07:45");
    append(g_buckets[0],"P\xE5" "minnelse om m\xF8te p\xE5 J\xE6" "ren");
    append(g_buckets[1],"\xC6\xD8\xC5 \xE6\xF8\xE5");
  } else if(strcmp(name,"empty")==0) {
    g_buckets[0].used=g_buckets[1].used=false;
  } else { // normal
    append(g_buckets[0],"Handle melk og kaffe","09:00");
    append(g_buckets[0],"M\xF8te med banken","12:30");
    append(g_buckets[0],"Hente pakke","16:00");
    append(g_buckets[1],"Vanne plantene");
    append(g_buckets[1],"Sykkelservice","14:00");
  }
}
} // ModuleReminders

static void stopEPD() {
  display.epd2.hibernate();
  display.end();
  epdSPI.end();
  // Identical electrical ordering to V4 DisplayCore:
  // disable translator before switching off the panel supply.
  digitalWrite(HardwareProfile::kEpdOutputEnable,LOW);
  delay(20);
  digitalWrite(HardwareProfile::kEpdPower,LOW);
  pinMode(HardwareProfile::kEpdBusy,INPUT);
  pinMode(HardwareProfile::kEpdReset,INPUT);
  pinMode(HardwareProfile::kEpdDc,INPUT);
  pinMode(HardwareProfile::kEpdCs,INPUT);
  pinMode(HardwareProfile::kEpdSck,INPUT);
  pinMode(HardwareProfile::kEpdMosi,INPUT);
}
static bool startEPD() {
  if(digitalRead(HardwareProfile::kPgoodN)!=LOW) {
    Serial.println("ERROR: V4 greyscale QA is USB ONLY. Plug USB in and retry render.");
    return false;
  }
  digitalWrite(HardwareProfile::kEpdOutputEnable,LOW);
  digitalWrite(HardwareProfile::kEpdPower,LOW);
  delay(20);
  digitalWrite(HardwareProfile::kEpdPower,HIGH);
  delay(500);
  digitalWrite(HardwareProfile::kEpdOutputEnable,HIGH);
  delay(100);
  epdSPI.begin(HardwareProfile::kEpdSck,-1,HardwareProfile::kEpdMosi,
               HardwareProfile::kEpdCs);
  display.epd2.selectSPI(epdSPI,
    SPISettings(HardwareProfile::kEpdSpiHz,MSBFIRST,SPI_MODE0));
  display.init(115200,true,2,false);
  display.setRotation(0);
  display.setFullWindow();
  return true;
}
static void drawLabel(const char* text,const GFXfont* font,
                      int x,int top,uint16_t ink) {
  int16_t ox=0,oy=0;uint16_t w=0,h=0;
  display.setFont(font);
  display.setTextSize(1);
  display.getTextBounds(text,0,0,&ox,&oy,&w,&h);
  display.setTextColor(ink);
  display.setCursor(x-ox,top-oy);
  display.print(text);
}
static void drawLevels() {
  const char* levels[4]={"0 / WHITE","1 / LIGHT GREY",
                         "2 / DARK GREY","3 / BLACK"};
  const GFXfont* font=RemindEditorialFonts::dm24();
  for(int i=0;i<4;++i) {
    const int x=i*200;
    display.fillRect(x,0,200,480,kBG[i]);
    const uint16_t ink=i<=1?GxEPD_BLACK:GxEPD_WHITE;
    drawLabel(levels[i],font,x+14,150,ink);
    drawLabel("RE:MIND",RemindEditorialFonts::fraunces48(),x+14,210,ink);
  }
}
static void drawContent() {
  const uint16_t background=kBG[gBG];
  gInk=(gBG<=1)?GxEPD_BLACK:GxEPD_WHITE;
  display.fillScreen(background);
  const Cell c={(kW-int(gCols)*200)/2,(kH-int(gRows)*120)/2,
                int(gCols)*200,int(gRows)*120};
  if(!ModuleReminders::renderEditorialRemindersPreview(
      c,ModuleReminders::g_buckets,3)) {
    drawLabel("PREVIEW FALLBACK",RemindEditorialFonts::dm24(),16,32,gInk);
    drawLabel("The original legacy renderer is NOT bundled in QA sketch.",
              RemindEditorialFonts::dm18(),16,68,gInk);
  }
}
static void printStatus() {
  Serial.printf("V4 true grey: bg=%u (%s), ink=%s; size=%ux%u, scene=%s, mode=%s\n",
    (unsigned)gBG, gBG==0?"white":gBG==1?"light-grey":gBG==2?"dark-grey":"black",
    gBG<=1?"BLACK":"WHITE",(unsigned)gCols,(unsigned)gRows,
    gScenario,gShowLevels?"four greyscale swatches":"Reminders");
}
static void printHelp() {
  Serial.println("\nRE:MIND V4 real four-grey QA. SERIAL: 115200, newline.");
  Serial.println("  levels              show all four TRUE panel grey levels");
  Serial.println("  bg 0|1|2|3          white / light-grey / dark-grey / black");
  Serial.println("  size 1x1 .. 4x4     change geometry, full 800x480 panel");
  Serial.println("  next | prev         cycle all 16 cell geometries");
  Serial.println("  scene normal|few|many|long|tomorrow|norwegian|empty");
  Serial.println("  render              refresh current scene");
  Serial.println("  status | help");
  Serial.println("Background contrast switches automatically to BLACK on bg 0/1");
  Serial.println("and WHITE on bg 2/3. These are actual 2-bit grey waveform states.");
  Serial.println("USB ONLY. No WiFi, pairing, NVS, API, Skip, OTA or battery writes.");
}
static void renderNow() {
  if(gBusy)return;
  gBusy=true;
  if(!startEPD()){gBusy=false;return;}
  ModuleReminders::fixtures(gScenario);
  const uint32_t start=millis();
  display.firstPage();
  do {
    if(gShowLevels) drawLevels();
    else drawContent();
  } while(display.nextPage());
  stopEPD();
  Serial.printf("Four-grey full refresh complete, elapsed=%lu ms\n",
                (unsigned long)(millis()-start));
  printStatus();
  gBusy=false;
}
static void process(const String& input) {
  String cmd=input;
  cmd.trim();cmd.toLowerCase();
  if(!cmd.length())return;
  if(cmd=="help"||cmd=="?"){printHelp();return;}
  if(cmd=="status"){printStatus();return;}
  if(cmd=="levels"){gShowLevels=true;renderNow();return;}
  if(cmd=="render"){renderNow();return;}
  if(cmd.startsWith("bg ")) {
    const int n=cmd.substring(3).toInt();
    if(n<0||n>3||cmd.length()!=4||cmd[3]<'0'||cmd[3]>'3') {
      Serial.println("Use bg 0, bg 1, bg 2, or bg 3.");return;
    }
    gBG=(uint8_t)n;gShowLevels=false;renderNow();return;
  }
  if(cmd.startsWith("scene ")) {
    String name=cmd.substring(6);name.trim();
    const char* valid[]={"normal","few","many","long","tomorrow","norwegian","empty"};
    for(const char* v:valid)if(name==v) {
      gScenario=v;gShowLevels=false;renderNow();return;
    }
    Serial.println("Unknown scene. Use help.");return;
  }
  if(cmd=="next"||cmd=="prev") {
    int n=(int(gRows)-1)*4+(int(gCols)-1);
    n=(n+(cmd=="next"?1:15))%16;
    gCols=(uint8_t)(n%4+1);gRows=(uint8_t)(n/4+1);
    gShowLevels=false;renderNow();return;
  }
  if(cmd.startsWith("size ")) {
    int cols=0,rows=0;
    if(sscanf(cmd.c_str()+5,"%dx%d",&cols,&rows)==2 &&
       cols>=1&&cols<=4&&rows>=1&&rows<=4) {
      gCols=(uint8_t)cols;gRows=(uint8_t)rows;
      gShowLevels=false;renderNow();return;
    }
    Serial.println("Use size 1x1 through size 4x4.");return;
  }
  Serial.println("Unknown command. Type help.");
}
void setup() {
  // Exactly the normal V4 power-up hold: neither VCC nor OE energised.
  digitalWrite(HardwareProfile::kEpdOutputEnable,LOW);
  pinMode(HardwareProfile::kEpdOutputEnable,OUTPUT);
  digitalWrite(HardwareProfile::kEpdOutputEnable,LOW);
  digitalWrite(HardwareProfile::kEpdPower,LOW);
  pinMode(HardwareProfile::kEpdPower,OUTPUT);
  digitalWrite(HardwareProfile::kEpdPower,LOW);
  gpio_deep_sleep_hold_dis();
  gpio_hold_dis((gpio_num_t)HardwareProfile::kEpdOutputEnable);
  gpio_hold_dis((gpio_num_t)HardwareProfile::kEpdPower);
  pinMode(HardwareProfile::kPgoodN,INPUT);
  Serial.begin(115200);
  Serial.setTimeout(80);
  delay(300);
  Serial.println("\nRE:MIND isolated V4 TRUE FOUR-GREY preview firmware");
  Serial.printf("PSRAM detected: %u bytes\n",(unsigned)ESP.getPsramSize());
  printHelp();
  renderNow(); // physical four-level swatch validates panel's actual grey LUT
}
void loop() {
  if(Serial.available()>0)process(Serial.readStringUntil('\n'));
  delay(10);
}
