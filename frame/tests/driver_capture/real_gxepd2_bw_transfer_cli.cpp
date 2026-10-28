// Execute byte-for-byte UNMODIFIED upstream GxEPD2_BW v1.6.4 template.
// The actual Adafruit GFX renderer and T7 SPI/controller are NOT instantiated:
// tests feed pre-captured actual ModuleDate C++ host pixels into the REAL
// GxEPD2_BW::drawPixel, firstPage and nextPage transfer path.
#include "GxEPD2_BW.h"
#include <algorithm>
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <vector>
#include <cstdint>

struct Mock750T7 {
  static const uint16_t WIDTH=800,WIDTH_VISIBLE=800,HEIGHT=480;
  static const GxEPD2::Panel panel=GxEPD2::GDEW075T7;
  static const bool hasFastPartialUpdate=true;
  int fullWrites=0,partialWrites=0,againWrites=0,fullRefreshes=0;
  int partialRefreshes=0,powerOffs=0;
  int lastX=-1,lastY=-1,lastW=-1,lastH=-1;
  std::vector<uint8_t> bytes;
  void writeImageForFullRefresh(const uint8_t* buf,int16_t x,int16_t y,
                                int16_t w,int16_t h) {
    if(x!=0||y!=0||w!=800||h!=480)throw std::runtime_error("full rect mismatch");
    bytes.assign(buf,buf+static_cast<size_t>(w)*h/8);
    ++fullWrites;lastX=x;lastY=y;lastW=w;lastH=h;
  }
  void writeImage(const uint8_t* buf,int16_t x,int16_t y,
                  int16_t w,int16_t h) {
    if(w%8||w<=0||h<=0)throw std::runtime_error("partial byte alignment");
    bytes.assign(buf,buf+static_cast<size_t>(w)*h/8);
    ++partialWrites;lastX=x;lastY=y;lastW=w;lastH=h;
  }
  void writeImageAgain(const uint8_t*,int16_t,int16_t,int16_t,int16_t) {
    ++againWrites;
  }
  void refresh(bool partial) {
    if(partial)throw std::runtime_error("unexpected full refresh type");
    ++fullRefreshes;
  }
  void refresh(int16_t,int16_t,int16_t,int16_t) {++partialRefreshes;}
  void powerOff() {++powerOffs;}
};

using HostDriver=GxEPD2_BW<Mock750T7,Mock750T7::HEIGHT>;

std::vector<uint8_t> readAll(const std::string& path) {
  std::ifstream file(path.c_str(),std::ios::binary);
  if(!file)throw std::runtime_error("unable to open "+path);
  return std::vector<uint8_t>(std::istreambuf_iterator<char>(file),
                              std::istreambuf_iterator<char>());
}
void writeAll(const std::string& path,const std::vector<uint8_t>& data) {
  std::ofstream file(path.c_str(),std::ios::binary);
  if(!file)throw std::runtime_error("unable to write "+path);
  file.write(reinterpret_cast<const char*>(data.data()),data.size());
  if(!file.good())throw std::runtime_error("unable to finish "+path);
}
int main(int argc,char**argv) {
  if(argc!=4)return 2;
  try {
    const auto pgm=readAll(argv[1]);
    const std::string header="P5\n800 480\n255\n";
    if(pgm.size()!=header.size()+800u*480u ||
       !std::equal(header.begin(),header.end(),pgm.begin()))
      throw std::runtime_error("invalid PGM payload");
    const auto expected=readAll(argv[2]);
    if(expected.size()!=48000)throw std::runtime_error("expected bytes != 48000");
    HostDriver driver(Mock750T7{});
    driver.setRotation(0);
    if(driver.width()!=800||driver.height()!=480||
       driver.pages()!=1||driver.pageHeight()!=480)
      throw std::runtime_error("driver panel dimensions/pages differ");
    driver.setFullWindow();
    driver.firstPage();
    for(int y=0;y<480;++y)for(int x=0;x<800;++x) {
      const uint8_t v=pgm[header.size()+static_cast<size_t>(y)*800+x];
      if(v!=0&&v!=255)throw std::runtime_error("non-monochrome pixel");
      driver.drawPixel(x,y,v==0?GxEPD_BLACK:GxEPD_WHITE);
    }
    if(driver.nextPage())throw std::runtime_error("unexpected multiple pages");
    if(driver.epd2.fullWrites!=1||driver.epd2.fullRefreshes!=1||
       driver.epd2.againWrites!=1||driver.epd2.powerOffs!=1)
      throw std::runtime_error("full-window nextPage transfer sequence mismatch");
    if(driver.epd2.bytes.size()!=48000)
      throw std::runtime_error("actual GxEPD2_BW transferred byte count");
    int differing=0;
    for(size_t i=0;i<expected.size();++i)
      if(expected[i]!=driver.epd2.bytes[i])++differing;
    writeAll(argv[3],driver.epd2.bytes);
    std::cout<<"{\"realGxEPD2BWClassExecuted\":true,"
             <<"\"mockUnderlying750T7\":true,"
             <<"\"realAdafruitGFXRendered\":false,"
             <<"\"realControllerOrPanel\":false,"
             <<"\"pageCount\":"<<driver.pages()
             <<",\"transferBytes\":"<<driver.epd2.bytes.size()
             <<",\"differingBytes\":"<<differing
             <<",\"fullWrites\":"<<driver.epd2.fullWrites
             <<",\"refreshes\":"<<driver.epd2.fullRefreshes
             <<",\"repeatWrites\":"<<driver.epd2.againWrites
             <<",\"powerOffs\":"<<driver.epd2.powerOffs<<"}\n";
    return differing?1:0;
  }catch(const std::exception&e){std::cerr<<e.what()<<"\n";return 3;}
}
