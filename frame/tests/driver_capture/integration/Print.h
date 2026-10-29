#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string>
#include <cstdio>
// Test-only Print surface. Actual Adafruit_GFX::write and GFX glyph drawing
// execute from the exact pinned upstream source.
class Print {
 public:
  virtual ~Print() {}
  virtual size_t write(uint8_t)=0;
  size_t write(const uint8_t* bytes,size_t len) {
    size_t n=0;for(size_t i=0;i<len;i++)n+=write(bytes[i]);return n;
  }
  size_t write(const char* s) {size_t n=0;while(s&&*s)n+=write(uint8_t(*s++));return n;}
  size_t print(const char* s){return write(s);}
  size_t print(const std::string& s){return write(s.c_str());}
  size_t print(char c){return write(uint8_t(c));}
  size_t print(int n){char b[32];std::snprintf(b,sizeof(b),"%d",n);return write(b);}
  size_t print(unsigned int n){char b[32];std::snprintf(b,sizeof(b),"%u",n);return write(b);}
  size_t println(const char* s){return print(s)+write(uint8_t('\n'));}
};
