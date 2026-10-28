#pragma once
// Minimal test-only Adafruit_GFX API needed for the ORIGINAL GxEPD2_BW header.
// Pixel rasterization is deliberately provided by prior ModuleDate host capture;
// this shim only supplies panel dimensions and rotation for GxEPD2_BW.
#include <stdint.h>
class SPIClass {};
class SPISettings {};
class Adafruit_GFX {
public:
  const int16_t WIDTH,HEIGHT;
  Adafruit_GFX(int16_t w,int16_t h)
      :WIDTH(w),HEIGHT(h),_width(w),_height(h),rotation(0){}
  virtual ~Adafruit_GFX(){}
  virtual void drawPixel(int16_t x,int16_t y,uint16_t color)=0;
  int16_t width() const{return _width;}
  int16_t height() const{return _height;}
  uint8_t getRotation() const{return rotation;}
  void setRotation(uint8_t r){
    rotation=r&3;
    if(rotation&1){_width=HEIGHT;_height=WIDTH;}
    else{_width=WIDTH;_height=HEIGHT;}
  }
private:
  int16_t _width,_height;
  uint8_t rotation;
};
