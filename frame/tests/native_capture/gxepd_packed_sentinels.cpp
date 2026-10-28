// Test-only byte/bit sentinels from GxEPD2_BW 1.6.4, 750_T7, rotation=0.
// No ESP32, GxEPD2 SPI, controller buffer or production firmware is executed.
#include "CaptureFrameDisplay.h"
#include <cassert>
#include <iostream>

int main(){
  CaptureFrameDisplay d;
  assert(d.packed.size()==48000);
  for(uint8_t b:d.packed)assert(b==0xFF);
  d.clear(GxEPD_WHITE);
  d.drawPixel(0,0,GxEPD_BLACK);
  d.drawPixel(7,0,GxEPD_BLACK);
  d.drawPixel(8,0,GxEPD_BLACK);
  d.drawPixel(799,0,GxEPD_BLACK);
  d.drawPixel(0,1,GxEPD_BLACK);
  assert(d.packed[0]==0x7E);   // MSB/LSB within first byte.
  assert(d.packed[1]==0x7F);   // No cross-byte reversal.
  assert(d.packed[99]==0xFE);  // Last pixel at end of first row.
  assert(d.packed[100]==0x7F);// Next row starts after 100 bytes.
  assert(d.packed[101]==0xFF);
  assert(d.packedPixelMismatches()==0);
  d.drawPixel(7,0,GxEPD_WHITE);
  assert(d.packed[0]==0x7F);
  d.clear(GxEPD_BLACK);
  for(uint8_t b:d.packed)assert(b==0x00);
  d.drawPixel(0,0,GxEPD_WHITE);
  d.drawPixel(7,0,GxEPD_WHITE);
  d.drawPixel(8,0,GxEPD_WHITE);
  assert(d.packed[0]==0x81 && d.packed[1]==0x80);
  assert(d.packedPixelMismatches()==0);
  std::cout<<"48000 bytes, polarity, row stride, byte ordering: PASS\n";
}
