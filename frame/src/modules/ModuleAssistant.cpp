#include "ModuleAssistant.h"
#include "AiFollowAdaptivePolicy.h"
#include "DisplayCore.h"
#include "Theme.h"
#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"
#include "FrameText.h"
#include "Fonts/FreeSans9ptNO.h"
#include "Fonts/FreeSansBold12ptNO.h"
#include <ArduinoJson.h>
#include <string.h>
#include <stdio.h>
#include <new>

namespace ModuleAssistant {
static const uint8_t MAX_UPDATES = 6;
static const size_t MAX_RESPONSE_BYTES = 6144;
struct Update { char topic[64]; char summary[192]; };
struct AssistantCache { bool loaded; bool ok; bool languageNo; uint8_t followingCount; uint8_t count; uint8_t totalCount; Update updates[MAX_UPDATES]; };
static_assert(sizeof(AssistantCache) == 1542, "Assistant cache DRAM budget changed");
static AssistantCache* g_cache = nullptr;
static bool g_cacheAllocationAttempted = false;

static bool ensureCache() {
  if (g_cache) return true;
  if (g_cacheAllocationAttempted) return false;
  g_cacheAllocationAttempted = true;
  g_cache = new (std::nothrow) AssistantCache{};
  return g_cache != nullptr;
}

static void copyDisplay(char* out, size_t size, const char* value) { FrameText::normalizeUtf8ForDisplay(out, size, value ? value : ""); }
struct Rect { int x; int y; int w; int h; };
enum TextAlign { ALIGN_LEFT, ALIGN_CENTER, ALIGN_RIGHT };
static int widthOf(const char* value, const GFXfont* font) { int16_t x,y; uint16_t w,h; auto& d=DisplayCore::get(); d.setFont(font); d.getTextBounds(value,0,0,&x,&y,&w,&h); return w; }
static void drawInRect(const Rect& r,const char* value,const GFXfont* font,int fontSize,TextAlign align) {
  auto& d=DisplayCore::get(); int16_t x1,y1;uint16_t tw,th;d.setFont(font);d.getTextBounds(value,0,0,&x1,&y1,&tw,&th);
  int x=r.x-x1;if(align==ALIGN_CENTER)x=r.x+(r.w-static_cast<int>(tw))/2-x1;else if(align==ALIGN_RIGHT)x=r.x+r.w-static_cast<int>(tw)-x1;
  const int offset=min(r.h-2,fontSize*9/10);d.setTextColor(Theme::ink());d.setCursor(x,r.y+max(1,offset));d.print(value);d.setFont(nullptr);
}
static void fit(const char* value,char* out,size_t size,int maxWidth,const GFXfont* font) {
  strlcpy(out,value ? value : "",size); if(widthOf(out,font)<=maxWidth)return;
  const size_t suffix=3; size_t n=strlen(out); while(n>0){out[--n]='\0'; if(n+suffix+1<size){strlcat(out,"...",size);if(widthOf(out,font)<=maxWidth)return;out[n]='\0';}}
  strlcpy(out,"...",size);
}
static bool fetch() {
  if (!ensureCache()) return false;
  AssistantCache fresh={}; fresh.loaded=true;
  String url=String(BASE_URL)+"/api/device/assistant?device_id="+DeviceIdentity::getDeviceId(); int code=0; String body;
  if(!NetClient::httpGetAuth(url,DeviceIdentity::getToken(),code,body)||code!=200||body.length()>MAX_RESPONSE_BYTES){*g_cache=fresh;return false;}
  StaticJsonDocument<256> filter; filter["ok"]=true; filter["language"]=true; filter["active_watch_count"]=true; filter["update_count"]=true; filter["updates"][0]["topic"]=true; filter["updates"][0]["summary"]=true;
  DynamicJsonDocument doc(4096); const size_t responseBytes=body.length();
  DeserializationError error=deserializeJson(doc,body,DeserializationOption::Filter(filter)); body=String();
  if(error){Serial.print("Assistant JSON parse failed, bytes=");Serial.println(responseBytes);*g_cache=fresh;return false;}
  fresh.ok=doc["ok"]|false; fresh.languageNo=strcmp(doc["language"]|"en","no")==0;
  fresh.followingCount=static_cast<uint8_t>(min(255,static_cast<int>(doc["active_watch_count"]|0)));
  fresh.totalCount=static_cast<uint8_t>(min(255,static_cast<int>(doc["update_count"]|0)));
  for(JsonObject item:doc["updates"].as<JsonArray>()){if(fresh.count>=MAX_UPDATES)break;copyDisplay(fresh.updates[fresh.count].topic,sizeof(fresh.updates[0].topic),item["topic"]|"");copyDisplay(fresh.updates[fresh.count].summary,sizeof(fresh.updates[0].summary),item["summary"]|"");if(fresh.updates[fresh.count].topic[0]&&fresh.updates[fresh.count].summary[0])fresh.count++;}
  if(fresh.totalCount<fresh.count)fresh.totalCount=fresh.count; *g_cache=fresh; return fresh.ok;
}
static void wrapSummary(const char* text,const Rect& summaryRect,int lines) {
  const int maxWidth=summaryRect.w;
  char remaining[192];strlcpy(remaining,text,sizeof(remaining));char* cursor=remaining;
  for(int line=0;line<lines&&*cursor;line++){while(*cursor==' ')cursor++;char output[192]={0};char* end=cursor;
    while(*end){char* next=strchr(end,' ');if(!next)next=end+strlen(end);char saved=*next;*next='\0';if(widthOf(cursor,&FreeSans9pt8b)>maxWidth){*next=saved;break;}strlcpy(output,cursor,sizeof(output));*next=saved;if(!saved){end=next;break;}end=next+1;}
    if(!output[0]){fit(cursor,output,sizeof(output),maxWidth,&FreeSans9pt8b);cursor+=strlen(cursor);}else cursor=end;
    if(line==lines-1&&*cursor){char fitted[192];strlcat(output,"...",sizeof(output));fit(output,fitted,sizeof(fitted),maxWidth,&FreeSans9pt8b);strlcpy(output,fitted,sizeof(output));}
    drawInRect({summaryRect.x,summaryRect.y+line*16,summaryRect.w,16},output,&FreeSans9pt8b,13,ALIGN_LEFT);
  }
}
void reset(){if(g_cache)*g_cache=AssistantCache{};}
void render(const Cell& c) {
  const bool cacheAvailable=ensureCache();
  if(cacheAvailable&&!g_cache->loaded)fetch();
  const int pad=c.w*35/1000<8?8:(c.w*35/1000>14?14:c.w*35/1000);const Rect header={c.x+pad,c.y+pad,c.w-pad*2,30};char fitted[80];
  fit("AI FOLLOW",fitted,sizeof(fitted),header.w,&FreeSansBold12pt8b);drawInRect(header,fitted,&FreeSansBold12pt8b,15,ALIGN_CENTER);
  if(c.h>=135){const int headingWidth=min(header.w,widthOf(fitted,&FreeSansBold12pt8b));DisplayCore::get().fillRect(header.x+(header.w-headingWidth)/2,header.y+21,headingWidth,2,Theme::ink());}
  if(!cacheAvailable||!g_cache->ok){drawInRect({c.x+pad,c.y+c.h/2-12,c.w-pad*2,24},"Updates unavailable",&FreeSans9pt8b,13,ALIGN_CENTER);return;}
  const AiFollowAdaptivePolicy::Output policy=AiFollowAdaptivePolicy::compose({c.w,c.h,g_cache->followingCount,g_cache->totalCount});
  if(policy.mode!=AiFollowAdaptivePolicy::UPDATES){
    const bool secondary=policy.showQuietSecondary;const bool horizontal=secondary&&c.h<155;const int blockH=24+(secondary&&!horizontal?32:0);const int start=horizontal?header.y+header.h+12:max(header.y+header.h+6,c.y+(c.h-blockH)/2);
    const char* primary=policy.mode==AiFollowAdaptivePolicy::ZERO_FOLLOW?(g_cache->languageNo?"Ingenting folges enna":"Nothing followed yet"):(g_cache->languageNo?"Ingen nye oppdateringer":"No new updates");
    const int gap=14,columnW=(c.w-pad*2-gap)/2;const Rect primaryRect=horizontal?Rect{c.x+pad,start,columnW,24}:Rect{c.x+pad,start,c.w-pad*2,24};
    fit(primary,fitted,sizeof(fitted),primaryRect.w,&FreeSansBold12pt8b);drawInRect(primaryRect,fitted,&FreeSansBold12pt8b,14,ALIGN_CENTER);
    if(secondary){char text[64];if(policy.mode==AiFollowAdaptivePolicy::ZERO_FOLLOW)strlcpy(text,g_cache->languageNo?"Følg temaer i appen":"Follow topics in the app",sizeof(text));else if(g_cache->languageNo)snprintf(text,sizeof(text),g_cache->followingCount==1?"Følger 1 tema":"Følger %u temaer",g_cache->followingCount);else snprintf(text,sizeof(text),"Following %u topic%s",g_cache->followingCount,g_cache->followingCount==1?"":"s");char displayText[64];copyDisplay(displayText,sizeof(displayText),text);const Rect secondaryRect=horizontal?Rect{primaryRect.x+columnW+gap,start,columnW,20}:Rect{c.x+pad,start+36,c.w-pad*2,20};fit(displayText,fitted,sizeof(fitted),secondaryRect.w,&FreeSans9pt8b);drawInRect(secondaryRect,fitted,&FreeSans9pt8b,12,ALIGN_CENTER);}return;
  }
  const int top=header.y+header.h+8,rowH=18+policy.summaryLines*16+3,gap=8;
  for(uint8_t i=0;i<policy.visibleCapacity&&i<g_cache->count;i++){const int y=top+i*(rowH+gap);const Rect topic={c.x+pad,y,c.w-pad*2,18};fit(g_cache->updates[i].topic,fitted,sizeof(fitted),topic.w,&FreeSansBold12pt8b);drawInRect(topic,fitted,&FreeSansBold12pt8b,14,ALIGN_LEFT);wrapSummary(g_cache->updates[i].summary,{c.x+pad,y+21,c.w-pad*2,rowH-21},policy.summaryLines);}
  if(policy.overflowCount){const int rowsHeight=policy.visibleCapacity*rowH+(policy.visibleCapacity-1)*gap;const Rect overflow={c.x+pad,top+rowsHeight+5,c.w-pad*2,18};char more[24];snprintf(more,sizeof(more),overflow.w<75?"+%u":"+%u more",policy.overflowCount);drawInRect(overflow,more,&FreeSans9pt8b,12,ALIGN_RIGHT);}
}
} // namespace ModuleAssistant
