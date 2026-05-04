#include "ModuleGroceries.h"
#include "DisplayCore.h"
#include "Theme.h"
#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"
#include "Fonts/FreeSans9ptNO.h"
#include "Fonts/FreeSansBold12ptNO.h"

#include <ArduinoJson.h>
#include <time.h>

#define FONT_B9  (&FreeSans9pt8b)
#define FONT_B12 (&FreeSansBold12pt8b)

namespace ModuleGroceries {
static const FrameConfig* g_cfg = nullptr;
static const int MAX_ITEMS = 40;
struct GroceryItem { bool used=false; char name[80]={0}; int qty=1; };
struct Cache { bool loaded=false; bool ok=false; int count=0; GroceryItem items[MAX_ITEMS]; char header[96]={0}; };
static Cache g;

static void safeCopy(char* d, size_t n, const char* s){ if(!d||!n) return; if(!s){d[0]=0; return;} strlcpy(d,s,n);} 
static void measureText(const char* text, const GFXfont* font,int16_t& x1,int16_t& y1,uint16_t& tw,uint16_t& th){auto& d=DisplayCore::get(); d.setFont(font); d.getTextBounds(text,0,0,&x1,&y1,&tw,&th);} 
static int textWidth(const char* text, const GFXfont* font){int16_t x1,y1;uint16_t tw,th;measureText(text,font,x1,y1,tw,th);return (int)tw;}
static void drawLeft(int x,int y,const char* t,const GFXfont* f){auto& d=DisplayCore::get(); d.setFont(f); d.setTextColor(Theme::ink()); d.setCursor(x,y); d.print(t); d.setFont(nullptr);} 
static void fitText(const char* src, char* dst, size_t n, int maxW, const GFXfont* f){ if(!dst||!n) return; dst[0]=0; if(!src||!src[0]) return; if(textWidth(src,f)<=maxW){safeCopy(dst,n,src); return;} for(int i=(int)strlen(src); i>1; --i){ char b[100]={0}; memcpy(b,src,i>94?94:i); strcat(b,"..."); if(textWidth(b,f)<=maxW){safeCopy(dst,n,b); return;}} safeCopy(dst,n,"...");}
static int rotationStep(){ time_t now=time(nullptr); return now>0 ? (int)(now/(3*3600)) : 0; }

static bool fetch(){ g = Cache{}; String url = String(BASE_URL)+"/api/device/frame-config?device_id="+DeviceIdentity::getDeviceId(); int code=0; String body; if(!NetClient::httpGetAuth(url, DeviceIdentity::getToken(), code, body) || code!=200){ g.loaded=true; return false; }
  StaticJsonDocument<16384> doc; if(deserializeJson(doc, body)){ g.loaded=true; return false; }
  JsonArray arr = doc["settings_json"]["modules"]["groceries"].as<JsonArray>();
  int idx=0; if(!arr.isNull()){ for(JsonObject it: arr){ if(idx>=MAX_ITEMS) break; const char* nm=it["name"]|""; if(!nm||!nm[0]) continue; g.items[idx].used=true; safeCopy(g.items[idx].name,sizeof(g.items[idx].name),nm); g.items[idx].qty=max(1,(int)(it["quantity"]|1)); idx++; }}
  g.count=idx; if(g.count>0){ char trimmed[80]={0}; fitText(g.items[0].name, trimmed, sizeof(trimmed), 200, FONT_B12); snprintf(g.header,sizeof(g.header),"Today: %s", trimmed);} else safeCopy(g.header,sizeof(g.header),"Grocery List");
  g.ok=true; g.loaded=true; return true; }
static void ensure(){ if(!g.loaded) fetch(); }

static const char* emptyPhrase(){ static const char* p[] = {"Fridge is stacked","Kitchen is covered","Nothing to buy","All set for dinner"}; int r=rotationStep(); return p[r%4]; }
static void drawBodyList(const Cell& c, int startY, int lines){
  int cnt = g.count; if(cnt<=0){ drawLeft(c.x+12,startY+16,emptyPhrase(),FONT_B9); return; }
  int r=rotationStep(); int show=min(lines,cnt); for(int i=0;i<show;i++){ int idx=(r+i)%cnt; char line[120]={0}; if(g.items[idx].qty>1) snprintf(line,sizeof(line),"%s x%d",g.items[idx].name,g.items[idx].qty); else safeCopy(line,sizeof(line),g.items[idx].name); char fit[120]={0}; fitText(line,fit,sizeof(fit),c.w-24,FONT_B9); drawLeft(c.x+12,startY+(i+1)*16,fit,FONT_B9);} if(cnt>show){ char more[32]; snprintf(more,sizeof(more),"+%d items",cnt-show); drawLeft(c.x+c.w-90,startY+(show+1)*16,more,FONT_B9);} }
static void renderSmall(const Cell& c){ char h[90]={0}; fitText(g.header,h,sizeof(h),c.w-24,FONT_B12); drawLeft(c.x+12,c.y+24,h,FONT_B12); drawBodyList(c,c.y+28,2);} 
static void renderMedium(const Cell& c){ char h[90]={0}; fitText(g.header,h,sizeof(h),c.w-24,FONT_B12); drawLeft(c.x+12,c.y+24,h,FONT_B12); drawBodyList(c,c.y+30,5);} 
static void renderLarge(const Cell& c){ int w=(c.w-8)/2; Cell l{c.x,c.y,w,c.h,c.slot,c.size}; Cell r{c.x+w+8,c.y,c.w-w-8,c.h,c.slot,c.size}; renderMedium(l); drawBodyList(r,r.y+12,8);} 
static void renderXL(const Cell& c){ int h=(c.h-8)/2; Cell t{c.x,c.y,c.w,h,c.slot,c.size}; Cell b{c.x,c.y+h+8,c.w,c.h-h-8,c.slot,c.size}; renderMedium(t); drawBodyList(b,b.y+8,8);} 

void begin(const FrameConfig* cfg){ g_cfg=cfg; (void)g_cfg; g.loaded=false; }
void render(const Cell& c, const String& moduleName){ (void)moduleName; ensure(); if(!g.ok){ drawLeft(c.x+12,c.y+24,"Groceries unavailable",FONT_B9); return; } switch(c.size){case CELL_SMALL: renderSmall(c); break; case CELL_MEDIUM: renderMedium(c); break; case CELL_LARGE: renderLarge(c); break; case CELL_XL: renderXL(c); break; default: renderMedium(c);} }
}
