#pragma once
#include <Arduino.h>

class NetClient {
public:
  static bool httpGet(const String& url, int& httpCodeOut, String& bodyOut);
  static bool httpGetAuth(const String& url, const String& bearerToken, int& httpCodeOut, String& bodyOut);
  static bool httpPostAuth(const String& url, const String& bearerToken, int& httpCodeOut, String& bodyOut);
  static bool httpPostAuthJson(const String& url, const String& bearerToken, const String& jsonBody, int& httpCodeOut, String& bodyOut);
};