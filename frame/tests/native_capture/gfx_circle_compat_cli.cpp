// Host-only GFX raster probe; independent of firmware and flash.
#include "CaptureFrameDisplay.h"
#include <iostream>

int main(){
  const int radii[]={0,1,2,3,7,11,16,30};
  CaptureFrameDisplay display;
  for(const int r:radii){
    display.clear(GxEPD_WHITE);
    display.fillCircle(400,240,r,GxEPD_BLACK);
    std::cout<<"radius="<<r<<"\n";
    for(int y=240-r;y<=240+r;++y){
      for(int x=400-r;x<=400+r;++x)
        std::cout<<(display.pixels[y*800+x]?'1':'0');
      std::cout<<"\n";
    }
  }
}
