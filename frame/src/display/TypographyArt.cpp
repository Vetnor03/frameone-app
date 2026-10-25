#include "Config.h"
#if TYPOGRAPHY_AUDIT_ENABLED && TYPOGRAPHY_CANDIDATE_FONTS_ENABLED
#include "TypographyArt.h"
#include "DisplayCore.h"
#include "FrameText.h"
#include "EditorialCandidates.h"
#include "FreeSans9ptNO.h"
#include "FreeSansBold12ptNO.h"
#include <Arduino.h>
#include <math.h>

namespace {
struct Rect {int x,y,w,h;};
struct Style {
  uint8_t stroke;       // Main contour weight in physical pixels
  uint8_t hatch;        // Distance between etched strokes (physical pixels)
  uint8_t dotPercent;   // Local ink coverage of rock textures
  uint8_t branchDetail; // Number of secondary engraved branches / cloud lines
};
constexpr Style kFine={1,3,30,6};
constexpr Style kBalanced={2,6,17,4};
constexpr Style kBold={3,10,8,2};
constexpr uint16_t ink=GxEPD_BLACK;
struct Pt {int16_t x,y;}; // 0..1000 local engraving coordinate system

int X(Rect b,int p){return b.x+(int32_t)b.w*p/1000;}
int Y(Rect b,int p){return b.y+(int32_t)b.h*p/1000;}

void stroke(int x0,int y0,int x1,int y1,uint8_t t=1){
  auto& d=DisplayCore::get();
  if(t<=1){d.drawLine(x0,y0,x1,y1,ink);return;}
  const int side=t/2;
  for(int k=-side;k<=side;k++) {
    if(abs(x1-x0)>abs(y1-y0))d.drawLine(x0,y0+k,x1,y1+k,ink);
    else d.drawLine(x0+k,y0,x1+k,y1,ink);
  }
}
void line(Rect b,int x0,int y0,int x1,int y1,uint8_t t=1){
  stroke(X(b,x0),Y(b,y0),X(b,x1),Y(b,y1),t);
}
void path(Rect b,const Pt* points,size_t count,uint8_t t=1){
  for(size_t i=1;i<count;i++)
    line(b,points[i-1].x,points[i-1].y,points[i].x,points[i].y,t);
}
uint32_t hash(int x,int y,int salt){
  uint32_t z=(uint32_t)x*0x9e3779b1U+(uint32_t)y*0x85ebca77U+
    (uint32_t)salt*0xc2b2ae3dU;
  z^=z>>16;z*=0x7feb352dU;z^=z>>15;
  return z;
}
void text(int x,int y,int w,int h,const char* words,
  const GFXfont* face,bool center=true){
  auto& d=DisplayCore::get();
  char bytes[192]={};
  FrameText::normalizeUtf8ForDisplay(bytes,sizeof(bytes),words);
  d.setFont(face);
  d.setTextColor(ink);
  d.setTextSize(1);
  int16_t bx=0,by=0; uint16_t tw=0,th=0;
  d.getTextBounds(bytes,0,0,&bx,&by,&tw,&th);
  d.setCursor(x+(center?(w-(int)tw)/2:0)-bx,
    y+(h-(int)th)/2-by);
  d.print(bytes);
  d.setFont(nullptr);
}
void title(const char* name,const char* detail){
  text(22,8,756,28,name,&FreeSansBold12pt8b);
  text(20,38,760,24,detail,&FreeSans9pt8b);
  stroke(18,69,782,69);
}
void sky(Rect b,const Style& s){
  // Several cloud envelopes traced as distinct 1-bit contours. Not fake
  // grayscale; optical softness comes from silhouette + line spacing.
  for(int j=0;j<s.branchDetail;j++){
    const int cloudX=145+j*13;
    const int cloudY=310+j*20;
    const Pt cloud[]={{(int16_t)cloudX,(int16_t)cloudY},
      {(int16_t)(cloudX+60),(int16_t)(cloudY-65)},
      {(int16_t)(cloudX+115),(int16_t)(cloudY-91)},
      {(int16_t)(cloudX+180),(int16_t)(cloudY-67)},
      {(int16_t)(cloudX+220),(int16_t)(cloudY-13)},
      {(int16_t)(cloudX+255),(int16_t)(cloudY+5)}};
    path(b,cloud,6,1);
  }
  // Fine sun halo as spaced near-circles; lower modes omit extra rings.
  auto& d=DisplayCore::get();
  for(int k=0;k<(s.branchDetail>3?3:1);k++){
    const int cx=X(b,665),cy=Y(b,260);
    int rr=(b.w*(63+k*17))/1000;
    if(rr>1)d.drawCircle(cx,cy,rr,ink);
  }
  // Birds are expressive minimal silhouette, kept visible at miniature size.
  for(int bird=0;bird<3;bird++){
    const int px=315+bird*63,py=260-(bird%2)*25;
    line(b,px-17,py+7,px,py-4);
    line(b,px,py-4,px+16,py+6);
  }
}
int cliffTop(int nx){
  // Low rock shelf at 580, steep headland to upper-right.
  const int v=nx<500?800:
    nx<670?785-(nx-500)/5:
    nx<840?741-(nx-670)*9/10:588-(nx-840)/6;
  return v + (int)(13.0*sin(nx*0.066));
}
void coastalTerrain(Rect b,const Style& s){
  auto& d=DisplayCore::get();
  // Distance ranges: foreground sea, far shore, nearer ragged cliff.
  const Pt distant[]={{0,735},{90,720},{160,721},{250,697},
    {325,691},{400,666},{480,669},{550,647},{660,638}};
  path(b,distant,9,1);
  const Pt shore[]={{0,823},{92,822},{170,814},{255,805},
    {330,807},{420,795},{510,788},{590,775},{680,749},
    {760,708},{850,677},{1000,678}};
  path(b,shore,12,s.stroke);
  const Pt ledge[]={{485,820},{540,801},{597,789},{670,760},
    {725,717},{765,667},{810,625},{860,590},{900,594},{945,561},{1000,558}};
  path(b,ledge,11,s.stroke);
  // The upper cliff is organic and fully outlined rather than a dark fill.
  for(int xx=520;xx<1000;xx+=s.hatch){
    const int top=cliffTop(xx);
    if(top>975)continue;
    const int x=X(b,xx);
    const int y0=Y(b,top),y1=Y(b,991);
    const int length=y1-y0;
    // Spatially patterned *selective* engraving, not continuous black.
    const int idx=xx/s.hatch;
    if(idx%2==0){
      for(int segment=0;segment<4;segment++){
        const int q=15+segment*19;
        const int ya=y0+length*q/100;
        const int bend=(segment%2?9:-5);
        stroke(x,ya,x+bend,ya+length/8,1);
      }
    }
    // Independent salt prevents mechanical crosshatch regularity.
    if(s.dotPercent>0){
      for(int yy=top+12;yy<940;yy+=s.stroke==1?4:5){
        if((int)(hash(xx,yy,7)%100)<s.dotPercent){
          const int px=X(b,xx),py=Y(b,yy);
          if(px>=b.x&&px<b.x+b.w&&py>=b.y&&py<b.y+b.h)
            d.fillRect(px,py,s.stroke==3?2:1,1,ink);
        }
      }
    }
  }
  // Two coast ridges on top of the shading; visually sharp at all scales.
  for(int offset=0;offset<=2;offset++){
    if(offset&&s.branchDetail<4)break;
    int lastX=520,lastY=cliffTop(520)+offset*19;
    for(int xx=530;xx<=990;xx+=10){
      const int yy=cliffTop(xx)+offset*19;
      line(b,lastX,lastY,xx,yy,offset==0?s.stroke:1);
      lastX=xx;lastY=yy;
    }
  }
  // Horizontal etched sea: near the headland and in the lower foreground.
  for(int i=0;i<11;i++){
    if(s.branchDetail<=2&&i%2)continue;
    const int py=820+i*14;
    const int left=38+(int)(hash(i,30,6)%160);
    const int right=left+140+(int)(hash(i,32,8)%260);
    line(b,left,py,right<955?right:955,py+(i%3)-1,1);
  }
  // Individual breakers at the waterline, not a solid black region.
  for(int j=0;j<9;j++){
    int x0=530+j*43,y0=772-(j*13)%95;
    line(b,x0,y0,x0+21,y0-4,s.stroke>2?2:1);
    line(b,x0+21,y0-4,x0+31,y0+1,1);
  }
}
void engraving(Rect b,const Style& s){
  sky(b,s);
  coastalTerrain(b,s);
}
void botanic(Rect b,const Style& s){
  // Actual two-stroke 1-bit branch and carved leaves with central veins.
  line(b,120,950,455,90,s.stroke);
  const int count=s.branchDetail+3;
  for(int i=0;i<count;i++){
    int level=230+i*85;
    if(level>900)break;
    const int mainX=390-(level-150)*27/100;
    const int yy=level;
    const bool right=(i%2)==0;
    const int dx=right?240:-190;
    line(b,mainX,yy,mainX+dx,yy-95,s.stroke>1?2:1);
    const Pt leaf[]={{(int16_t)(mainX+dx),(int16_t)(yy-95)},
      {(int16_t)(mainX+dx+(right?80:-80)),(int16_t)(yy-230)},
      {(int16_t)(mainX+dx+(right?140:-140)),(int16_t)(yy-156)},
      {(int16_t)(mainX+dx),(int16_t)(yy-95)}};
    path(b,leaf,4,1);
    line(b,mainX+dx,yy-95,
      mainX+dx+(right?101:-101),yy-177,1);
  }
}
void lineAtlas(Rect b){
  auto& d=DisplayCore::get();
  const int cols=4,step=b.w/cols;
  const Style styles[]={kFine,kBalanced,kBold,{3,14,5,1}};
  const char* captions[]={"ULTRA FINE","BALANCED","BOLD","MINIMAL"};
  for(int i=0;i<cols;i++){
    const int x=b.x+i*step;
    const Style& st=styles[i];
    if(i)d.drawLine(x,b.y,x,b.y+b.h,ink);
    text(x+2,b.y+1,step-5,33,captions[i],&FreeSansBold12pt8b);
    for(int t=1;t<=3;t++){
      const int yy=b.y+46+t*24;
      stroke(x+17,yy,x+step-22,yy,t);
    }
    text(x+6,b.y+158,step-12,23,"HATCH", &FreeSans9pt8b);
    for(int q=0;q<90;q+=st.hatch){
      stroke(x+30+q,b.y+195,x+55+q,b.y+273,st.stroke>2?2:1);
    }
    text(x+6,b.y+288,step-12,23,"STIPPLE",&FreeSans9pt8b);
    for(int xx=x+17;xx<x+step-18;xx+=3)
      for(int yy=b.y+315;yy<b.y+354;yy+=3)
        if((int)(hash(xx,yy,3)%100)<st.dotPercent)
          d.drawPixel(xx,yy,ink);
  }
}
void headerFooter(const char* header,const char* detail){
  auto& d=DisplayCore::get();
  d.fillScreen(GxEPD_WHITE);
  title(header,detail);
}
} // namespace

namespace TypographyArt {
void drawAtlas(){
  headerFooter("RE:MIND / ART CALIBRATION 7/10",
    "True 1-bit line weights, hatch density and stipple. Stand 0.5, 1 and 2 m away.");
  lineAtlas({20,80,760,373});
}
void drawComparison(){
  headerFooter("RE:MIND / ART CALIBRATION 8/10",
    "Three engravings at an ACTUAL module-sized footprint. Which stays beautiful?");
  constexpr Style styles[]={kFine,kBalanced,kBold};
  const char* captions[]={"ULTRA FINE","BALANCED","BOLD"};
  for(int i=0;i<3;i++){
    const Rect part={17+i*260,89,246,294};
    DisplayCore::get().drawRect(part.x,part.y,part.w,part.h,ink);
    text(part.x,part.y+8,part.w,32,captions[i],&FreeSansBold12pt8b);
    const Rect art={part.x+9,part.y+46,part.w-18,part.h-65};
    engraving(art,styles[i]);
    stroke(art.x,art.y+art.h,art.x+art.w,art.y+art.h);
  }
  text(18,402,765,44,"Fine details only matter if the landscape reads from across the room.",
    &RemindDM18);
}
void drawLarge(){
  headerFooter("RE:MIND / ART CALIBRATION 9/10",
    "Engraved coast at generous size. Test the finest attractive texture, not just max ink.");
  engraving({23,81,754,354},kFine);
  text(30,439,740,24,"Fine lines + intentional open paper + optical halftone dots",
    &FreeSans9pt8b);
}
void drawLayout(){
  auto& d=DisplayCore::get();
  d.fillScreen(GxEPD_WHITE);
  // Editorial reference study at true 800x480 size. This is NOT a traced
  // copy of the user's mood image: coastal textures are generated anew.
  text(23,10,170,28,"TIRSDAG",&RemindDM18,false);
  text(20,43,325,62,"14. oktober",&RemindFraunces48,false);
  stroke(355,18,355,139);
  text(379,28,300,29,"14:00   Dagligbank",&RemindDM18,false);
  text(379,70,300,29,"18:00   Besøk",&RemindDM18,false);
  text(379,111,300,29,"19:00   Middag",&RemindDM18,false);
  botanic({690,10,95,133},kBalanced);
  stroke(20,156,780,156);
  text(21,167,300,44,"Siste nytt",&RemindInstrument48,false);
  text(22,228,375,36,"Store nyheter på Jæren",&RemindDM24,false);
  stroke(20,281,780,281);
  text(23,296,240,36,"Bølger",&RemindDM24,false);
  text(24,351,230,36,"1,6 - 2,0 m",&RemindDM24,false);
  stroke(276,296,276,456);
  text(296,296,220,36,"Vind",&RemindDM24,false);
  text(298,351,220,36,"8 m/s",&RemindDM24,false);
  stroke(532,296,532,455);
  engraving({539,293,237,164},kBalanced);
  text(20,459,755,17,"ARTWORK STUDY / Detail must survive at normal panel size.",
    &FreeSans9pt8b);
}
}
#endif
