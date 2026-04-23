// ProvisioningPortal.cpp
#include "ProvisioningPortal.h"
#include "WiFiManager.h"
#include "DisplayCore.h"
#include "Config.h"

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>

#include <Fonts/FreeMonoBold9pt7b.h>
#include <Fonts/FreeMonoBold12pt7b.h>
#include <Fonts/FreeMonoBold18pt7b.h>

static const byte DNS_PORT = 53;
static DNSServer dnsServer;
static WebServer server(80);

static String apSsid;

static String htmlPage(const String& msg) {
  String s;
  s += "<!doctype html><html><head>";
  s += "<meta name='viewport' content='width=device-width,initial-scale=1'/>";
  s += "<title>Connect your frame</title>";
  s += "</head><body style='font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; padding:20px; max-width:520px; margin:0 auto; color:#111;'>";
  s += "<h2 style='margin-bottom:8px;'>Connect your frame</h2>";
  s += "<p style='margin-top:0; opacity:.75;'>Choose the Wi-Fi network your frame should use.</p>";
  if (msg.length()) s += "<p style='color:#0a84ff; font-weight:600;'>" + msg + "</p>";
  s += "<form method='POST' action='/save'>";
  s += "<label style='display:block; margin:14px 0 6px;'>Wi-Fi name</label>";
  s += "<input name='ssid' style='width:100%; box-sizing:border-box; font-size:16px; padding:12px; margin:0 0 8px; border:1px solid #ccc; border-radius:12px;' placeholder='Your Wi-Fi name' required />";
  s += "<label style='display:block; margin:14px 0 6px;'>Password</label>";
  s += "<input name='pass' type='password' style='width:100%; box-sizing:border-box; font-size:16px; padding:12px; margin:0 0 14px; border:1px solid #ccc; border-radius:12px;' placeholder='Wi-Fi password' />";
  s += "<button style='width:100%; padding:14px; font-size:16px; font-weight:700; background:#111; color:white; border:none; border-radius:12px;'>Connect frame</button>";
  s += "</form>";
  s += "<p style='opacity:.65; margin-top:14px;'>After saving, the frame will restart and continue setup.</p>";
  s += "</body></html>";
  return s;
}

static void handleRoot() {
  server.send(200, "text/html", htmlPage(""));
}

static void handleSave() {
  String ssid = server.arg("ssid");
  String pass = server.arg("pass");

  ssid.trim();

  if (ssid.length() == 0) {
    server.send(400, "text/html", htmlPage("Wi-Fi name required."));
    return;
  }

  WiFiManagerV2::saveCreds(ssid, pass);
  server.send(200, "text/html", htmlPage("Saved. Reconnecting your frame..."));
  delay(900);
  ESP.restart();
}

static void handleNotFound() {
  server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString(), true);
  server.send(302, "text/plain", "");
}

static void drawCenteredLine(const char* text, int y, const GFXfont* font) {
  auto& d = DisplayCore::get();
  d.setFont(font);

  int16_t x1, y1;
  uint16_t w, h;
  d.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);

  int x = FRAME_X + (FRAME_W - (int)w) / 2;
  d.setCursor(x, y);
  d.print(text);
}

static void drawWrappedLine(const String& line, int x, int& y, int maxW, const GFXfont* font, int lineStep) {
  auto& d = DisplayCore::get();
  d.setFont(font);

  int16_t x1, y1;
  uint16_t w, h;
  d.getTextBounds(line.c_str(), 0, 0, &x1, &y1, &w, &h);

  if ((int)w <= maxW) {
    d.setCursor(FRAME_X + x, FRAME_Y + y);
    d.print(line.c_str());
    y += lineStep;
    return;
  }

  String remaining = line;
  remaining.trim();

  while (remaining.length() > 0) {
    int bestCut = -1;

    for (int i = 1; i <= remaining.length(); i++) {
      String part = remaining.substring(0, i);
      int spacePos = part.lastIndexOf(' ');
      if (spacePos > 0) part = remaining.substring(0, spacePos);

      part.trim();
      if (part.length() == 0) continue;

      d.getTextBounds(part.c_str(), 0, 0, &x1, &y1, &w, &h);
      if ((int)w <= maxW) bestCut = part.length();
      else break;
    }

    if (bestCut <= 0) bestCut = 1;

    String out = remaining.substring(0, bestCut);
    out.trim();

    d.setCursor(FRAME_X + x, FRAME_Y + y);
    d.print(out.c_str());
    y += lineStep;

    remaining = remaining.substring(bestCut);
    remaining.trim();
  }
}

namespace ProvisioningPortal {

void runBlocking() {
  // Create AP name Frame-Setup-XXXX using last 2 bytes of MAC
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char suffix[5];
  snprintf(suffix, sizeof(suffix), "%02X%02X", mac[4], mac[5]);
  apSsid = String("Frame-Setup-") + suffix;

  WiFi.mode(WIFI_AP);
  WiFi.softAP(apSsid.c_str());

  IPAddress apIP = WiFi.softAPIP();

  auto& display = DisplayCore::get();
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.setTextColor(GxEPD_BLACK);
    DisplayCore::drawFrameBorder();

    const int left = 28;
    const int maxW = FRAME_W - (left * 2);

    drawCenteredLine("CONNECT TO WIFI", FRAME_Y + 58, &FreeMonoBold18pt7b);
    drawCenteredLine("JOIN THIS NETWORK", FRAME_Y + 112, &FreeMonoBold12pt7b);

    display.setFont(&FreeMonoBold18pt7b);
    display.setCursor(FRAME_X + left, FRAME_Y + 160);
    display.print(apSsid.c_str());

    int y = 220;
    drawWrappedLine("1) Setup page should open", left, y, maxW, &FreeMonoBold12pt7b, 24);
    y += 8;
    drawWrappedLine("2) If not, open 192.168.4.1", left, y, maxW, &FreeMonoBold12pt7b, 24);
    y += 8;
    drawWrappedLine("3) Enter your home Wi-Fi", left, y, maxW, &FreeMonoBold12pt7b, 24);

    display.drawLine(FRAME_X + left, FRAME_Y + FRAME_H - 46, FRAME_X + FRAME_W - left, FRAME_Y + FRAME_H - 46, GxEPD_BLACK);

    display.setFont(&FreeMonoBold9pt7b);
    display.setCursor(FRAME_X + left, FRAME_Y + FRAME_H - 18);
    display.print("FRAME WILL CONTINUE SETUP AFTER SAVE");

  } while (display.nextPage());

  Serial.println("=== Provisioning Portal ===");
  Serial.print("AP SSID: ");
  Serial.println(apSsid);
  Serial.print("AP IP: ");
  Serial.println(apIP);

  dnsServer.start(DNS_PORT, "*", apIP);

  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.onNotFound(handleNotFound);
  server.begin();

  while (true) {
    dnsServer.processNextRequest();
    server.handleClient();
    delay(5);
  }
}

} // namespace ProvisioningPortal