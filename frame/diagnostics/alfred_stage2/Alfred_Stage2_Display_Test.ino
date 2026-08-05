#include <Arduino.h>
#include <SPI.h>
#include <GxEPD2_BW.h>
#include <Fonts/FreeMonoBold9pt7b.h>
#include <Fonts/FreeMonoBold12pt7b.h>
#include <Fonts/FreeMonoBold24pt7b.h>

#include "AlfredStage2Pins.h"

// SAFETY ARM: leave at 0 unless the panel is connected with all power removed,
// battery is disconnected, and the first run is USB-only.
#define ALFRED_STAGE2_PANEL_TEST_ARMED 0

using AlfredStage2Display = GxEPD2_BW<GxEPD2_750_T7, GxEPD2_750_T7::HEIGHT>;

static SPIClass alfredEpdSpi(FSPI);
static AlfredStage2Display display(
  GxEPD2_750_T7(PIN_EPD_CS, PIN_EPD_DC, PIN_EPD_RST, PIN_EPD_BUSY)
);

static bool g_refreshAttempted = false;
static bool g_stopped = false;
static const char* g_stopReason = "Safe idle";
static unsigned long g_busyWaitStartMs = 0;
static unsigned long g_lastBusyLogMs = 0;

static void setDisplayCommPinsInput()
{
  pinMode(PIN_EPD_BUSY, INPUT);
  pinMode(PIN_EPD_RST, INPUT);
  pinMode(PIN_EPD_DC, INPUT);
  pinMode(PIN_EPD_CS, INPUT);
  pinMode(PIN_EPD_SCK, INPUT);
  pinMode(PIN_EPD_MOSI, INPUT);
}

static void printHeader()
{
  Serial.println("================================");
  Serial.println("RE:MIND Alfred Stage 2");
  Serial.println("Controlled e-paper test");
  Serial.println("================================");
}

static void printStartupSummary()
{
  Serial.print("Test armed: ");
  Serial.println(ALFRED_STAGE2_PANEL_TEST_ARMED ? "YES" : "NO");
  Serial.print("EPD_PWR state: ");
  Serial.println(digitalRead(PIN_EPD_PWR) == HIGH ? "HIGH" : "LOW");
  Serial.println("Display driver/library selected: GxEPD2 1.6.4 via <GxEPD2_BW.h>");
  Serial.println("Exact panel class selected: GxEPD2_750_T7");
  Serial.println("Panel resolution: 800 x 480 monochrome");
  Serial.println("Confirmed pin mapping: BUSY=GPIO4 RST=GPIO5 DC=GPIO6 CS=GPIO7 SCK=GPIO10 MOSI=GPIO11 PWR=GPIO12");
  Serial.print("SPI frequency: ");
  Serial.print(ALFRED_STAGE2_SPI_HZ);
  Serial.println(" Hz");
  Serial.println("USB-only test: YES - battery must remain disconnected for first Stage 2 run");
  Serial.println("WARNING: exactly one full refresh will occur when armed; reset required to run again.");
  Serial.println("WARNING: connect or disconnect the panel only with USB and battery removed.");
}

static void safeStop(const char* reason)
{
  g_stopReason = reason;
  g_stopped = true;
  display.end();
  setDisplayCommPinsInput();
  digitalWrite(PIN_EPD_PWR, LOW);
  Serial.println();
  Serial.println("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  Serial.print("STAGE 2 STOPPED: ");
  Serial.println(reason);
  Serial.print("EPD_PWR final state: ");
  Serial.println(digitalRead(PIN_EPD_PWR) == HIGH ? "HIGH" : "LOW");
  Serial.println("No retry will be attempted. Reset is required.");
  Serial.println("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
}

static bool verifyEpdPowerLow(const char* step)
{
  if (digitalRead(PIN_EPD_PWR) == LOW) return true;
  Serial.print("FAILED STEP: ");
  Serial.println(step);
  safeStop("EPD_PWR did not read LOW");
  return false;
}

static bool waitBusyInactive(const char* label, uint32_t timeoutMs)
{
  Serial.print("BUSY wait start: ");
  Serial.print(label);
  Serial.print(" raw=");
  Serial.println(digitalRead(PIN_EPD_BUSY));
  const unsigned long start = millis();
  unsigned long lastLog = start;
  while (digitalRead(PIN_EPD_BUSY) == LOW) {
    const unsigned long now = millis();
    const unsigned long elapsed = now - start;
    if (elapsed >= timeoutMs) {
      Serial.print("BUSY TIMEOUT at ");
      Serial.print(label);
      Serial.print(" elapsed_ms=");
      Serial.print(elapsed);
      Serial.print(" raw=");
      Serial.println(digitalRead(PIN_EPD_BUSY));
      safeStop("BUSY timeout");
      return false;
    }
    if (now - lastLog >= 1000UL) {
      lastLog = now;
      Serial.print("BUSY wait elapsed_ms=");
      Serial.print(elapsed);
      Serial.print(" raw=");
      Serial.println(digitalRead(PIN_EPD_BUSY));
    }
    delay(10);
  }
  Serial.print("BUSY wait done: ");
  Serial.print(label);
  Serial.print(" elapsed_ms=");
  Serial.print(millis() - start);
  Serial.print(" raw=");
  Serial.println(digitalRead(PIN_EPD_BUSY));
  return true;
}

static void gxBusyCallback(const void*)
{
  const unsigned long now = millis();
  if (g_busyWaitStartMs == 0) {
    g_busyWaitStartMs = now;
    g_lastBusyLogMs = 0;
    Serial.print("BUSY wait start: GxEPD2 internal raw=");
    Serial.println(digitalRead(PIN_EPD_BUSY));
  }
  if (g_lastBusyLogMs == 0 || now - g_lastBusyLogMs >= 1000UL) {
    g_lastBusyLogMs = now;
    Serial.print("BUSY wait elapsed_ms=");
    Serial.print(now - g_busyWaitStartMs);
    Serial.print(" raw=");
    Serial.println(digitalRead(PIN_EPD_BUSY));
  }
  delay(1);
}

static bool busyStillActiveAfterLibraryCall(const char* step)
{
  const int raw = digitalRead(PIN_EPD_BUSY);
  Serial.print("BUSY post-check after ");
  Serial.print(step);
  Serial.print(": raw=");
  Serial.println(raw);
  if (raw == LOW) {
    safeStop("GxEPD2 BUSY timeout or panel still busy after library call");
    return true;
  }
  return false;
}

static void drawCenteredText(const char* text, const GFXfont* font, int16_t y)
{
  int16_t x1 = 0;
  int16_t y1 = 0;
  uint16_t w = 0;
  uint16_t h = 0;
  display.setFont(font);
  display.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  display.setCursor((display.width() - w) / 2 - x1, y);
  display.print(text);
}

static void drawTestImage()
{
  display.fillScreen(GxEPD_WHITE);
  display.drawRect(0, 0, display.width(), display.height(), GxEPD_BLACK);
  display.fillRect(12, 12, 56, 12, GxEPD_BLACK);
  display.fillRect(12, 12, 12, 56, GxEPD_BLACK);
  display.fillRect(display.width() - 68, 12, 56, 12, GxEPD_BLACK);
  display.fillRect(display.width() - 24, 12, 12, 56, GxEPD_BLACK);
  display.fillRect(12, display.height() - 24, 56, 12, GxEPD_BLACK);
  display.fillRect(12, display.height() - 68, 12, 56, GxEPD_BLACK);
  display.fillRect(display.width() - 68, display.height() - 24, 56, 12, GxEPD_BLACK);
  display.fillRect(display.width() - 24, display.height() - 68, 12, 56, GxEPD_BLACK);
  display.setTextColor(GxEPD_BLACK);
  drawCenteredText("ALFRED", &FreeMonoBold24pt7b, 210);
  drawCenteredText("RE:MIND PCB V1.0", &FreeMonoBold12pt7b, 265);
  drawCenteredText("DISPLAY TEST PASSED", &FreeMonoBold12pt7b, 305);
  drawCenteredText("ONE FULL REFRESH ONLY", &FreeMonoBold9pt7b, 350);
}

static void runArmedDisplayTest()
{
  if (g_refreshAttempted) {
    safeStop("Refresh already attempted during this reset");
    return;
  }
  if (!verifyEpdPowerLow("pre-arm EPD_PWR validation")) return;

  Serial.println("Powering EPD_VCC: GPIO12 HIGH");
  digitalWrite(PIN_EPD_PWR, HIGH);
  delay(ALFRED_STAGE2_POWER_SETTLE_MS);
  Serial.print("EPD_PWR state after enable: ");
  Serial.println(digitalRead(PIN_EPD_PWR) == HIGH ? "HIGH" : "LOW");
  if (digitalRead(PIN_EPD_PWR) != HIGH) {
    safeStop("EPD_PWR did not read HIGH after enable");
    return;
  }

  pinMode(PIN_EPD_CS, OUTPUT);
  digitalWrite(PIN_EPD_CS, HIGH);
  pinMode(PIN_EPD_RST, OUTPUT);
  digitalWrite(PIN_EPD_RST, HIGH);
  pinMode(PIN_EPD_DC, OUTPUT);
  digitalWrite(PIN_EPD_DC, HIGH);
  pinMode(PIN_EPD_BUSY, INPUT);

  Serial.println("Initializing explicit Alfred SPI bus: SCK=GPIO10 MOSI=GPIO11 MISO=unused CS=GPIO7");
  alfredEpdSpi.begin(PIN_EPD_SCK, PIN_EPD_MISO_UNUSED, PIN_EPD_MOSI, PIN_EPD_CS);
  display.epd2.selectSPI(alfredEpdSpi, SPISettings(ALFRED_STAGE2_SPI_HZ, MSBFIRST, SPI_MODE0));
  display.epd2.setBusyCallback(gxBusyCallback, nullptr);

  if (!waitBusyInactive("before display.init", ALFRED_STAGE2_BUSY_TIMEOUT_MS)) return;
  Serial.println("Initializing GxEPD2_750_T7 with reset_duration=10ms, pulldown_rst_mode=false");
  g_busyWaitStartMs = 0;
  display.init(0, true, 10, false);
  if (busyStillActiveAfterLibraryCall("display.init")) return;
  display.setRotation(0);
  display.setFullWindow();

  Serial.println("Starting exactly one full black-and-white refresh.");
  g_refreshAttempted = true;
  display.firstPage();
  do {
    drawTestImage();
  } while (display.nextPage());
  if (busyStillActiveAfterLibraryCall("full refresh")) return;
  Serial.println("Refresh completed.");

  Serial.println("Putting panel into documented GxEPD2 hibernate state.");
  g_busyWaitStartMs = 0;
  display.hibernate();
  if (busyStillActiveAfterLibraryCall("hibernate")) return;
  Serial.print("Waiting documented panel shutdown interval: ");
  Serial.print(ALFRED_STAGE2_PANEL_SHUTDOWN_MS);
  Serial.println(" ms");
  delay(ALFRED_STAGE2_PANEL_SHUTDOWN_MS);
  display.end();
  setDisplayCommPinsInput();
  digitalWrite(PIN_EPD_PWR, LOW);
  if (!verifyEpdPowerLow("post-refresh shutdown")) return;

  Serial.println("FINAL PASS: Stage 2 display refresh completed once; EPD_PWR is LOW.");
  Serial.println("The retained e-paper image may remain visible after power is removed; this is expected.");
  g_stopReason = "PASS safe idle";
  g_stopped = true;
}

void setup()
{
  pinMode(PIN_EPD_PWR, OUTPUT);
  digitalWrite(PIN_EPD_PWR, LOW);

  setDisplayCommPinsInput();

  Serial.begin(ALFRED_STAGE2_SERIAL_BAUD);
  while (!Serial && millis() < 3000UL) { delay(10); }

  printHeader();
  printStartupSummary();

#if ALFRED_STAGE2_PANEL_TEST_ARMED
  runArmedDisplayTest();
#else
  Serial.println("Stage 2 is not armed. GPIO12 remains LOW. SPI/display communication is disabled.");
  verifyEpdPowerLow("unarmed safe idle");
  g_stopReason = "Unarmed safe idle";
  g_stopped = true;
#endif
}

void loop()
{
  static unsigned long lastPrintMs = 0;
  if (millis() - lastPrintMs >= 5000UL) {
    lastPrintMs = millis();
    digitalWrite(PIN_EPD_PWR, LOW);
    Serial.print("SAFE IDLE: ");
    Serial.print(g_stopReason);
    Serial.print("; EPD_PWR=");
    Serial.print(digitalRead(PIN_EPD_PWR) == HIGH ? "HIGH" : "LOW");
    Serial.print("; refresh_attempted=");
    Serial.println(g_refreshAttempted ? "YES" : "NO");
  }
  (void)g_stopped;
  delay(50);
}
