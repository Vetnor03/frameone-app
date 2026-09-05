#include "BatteryManager.h"
#include "Config.h"

#include <Arduino.h>
#include "HardwareProfile.h"
#if !defined(FRAME_IS_ALFRED_V1_2)
#include <Preferences.h>
#endif
#include <math.h>
#if defined(FRAME_IS_ALFRED_V1_2)
#include <Wire.h>
#endif

// ------------------------------
// Hardware config
// ------------------------------
#if !defined(FRAME_IS_ALFRED_V1_2)
static const int BATTERY_ADC_PIN = 35;
#endif
#if defined(FRAME_IS_ALFRED_V1_2)
struct Max17048Sample {
  float voltage;
  float soc;
};
static float g_max17048Soc = 0.0f;

static const float ALFRED_SOC_HYSTERESIS = 0.75f;
static const int ALFRED_CORRECTION_SAMPLES = 3;
static const int ALFRED_LARGE_CORRECTION_PERCENT = 8;
static const int ALFRED_LOW_VOLTAGE_SAMPLES = 3;
static const float ALFRED_EMERGENCY_V = 3.10f;

static bool readMax17048Register(uint8_t reg, uint16_t& value) {
  constexpr int kMax17048ReadAttempts = 3;
  for (int attempt = 0; attempt < kMax17048ReadAttempts; ++attempt) {
    Wire.beginTransmission(HardwareProfile::kMax17048Address);
    Wire.write(reg);
    if (Wire.endTransmission(false) == 0 &&
        Wire.requestFrom(HardwareProfile::kMax17048Address, (uint8_t)2) == 2) {
      value = (uint16_t(Wire.read()) << 8) | uint16_t(Wire.read());
      return true;
    }
    delay(5);
  }
  return false;
}

static bool readMax17048Sample(Max17048Sample& sample) {
  uint16_t rawVCell = 0;
  uint16_t rawSoc = 0;
  if (!readMax17048Register(0x02, rawVCell) ||
      !readMax17048Register(0x04, rawSoc)) {
    Serial.println("MAX17048 sample failed; retaining previous valid battery state");
    return false;
  }
  sample.voltage = rawVCell * 78.125e-6f;
  sample.soc = rawSoc / 256.0f;
  return true;
}
#endif

// ADC -> battery voltage
#if !defined(FRAME_IS_ALFRED_V1_2)
static const float BATTERY_DIVIDER_RATIO = 2.0f;
static const float BATTERY_ADC_REF = 3.3f;
static const float BATTERY_CAL_FACTOR = 1.0f;

// Sampling
static const int BATTERY_SAMPLE_COUNT = 7;
static const int BATTERY_SAMPLE_DELAY_MS = 10;
#endif

// Smoothing
static const float EMA_ALPHA_DISCHARGING = 0.15f;
static const float EMA_ALPHA_CHARGING = 0.30f;

// Charging detection
static const float CHARGE_RISE_THRESHOLD_V = 0.018f;
static const float CHARGE_FALL_THRESHOLD_V = -0.012f;
static const int8_t CHARGE_SCORE_MIN = -3;
static const int8_t CHARGE_SCORE_MAX = 3;
static const int8_t CHARGE_ON_SCORE = 2;
static const int8_t CHARGE_OFF_SCORE = -2;

// UI stabilization for the classic ADC-based battery model.
#if !defined(FRAME_IS_ALFRED_V1_2)
static const int PERCENT_DEADBAND = 1;
static const int MAX_DROP_PER_WAKE = 2;
static const int MAX_RISE_PER_WAKE = 3;
static const int FULL_DISPLAY_SNAP_PERCENT = 95;
static const float FULL_DISPLAY_SNAP_MARGIN_V = 0.03f;
#endif

// Learned calibration for classic ADC-based hardware.
#if !defined(FRAME_IS_ALFRED_V1_2)
static const float DEFAULT_LEARNED_FULL_V = 3.90f;
static const float MIN_LEARNABLE_FULL_V = 3.88f;
static const float MAX_LEARNABLE_FULL_V = 4.22f;
static const int MAX_FULL_SAMPLES_FOR_WEIGHTING = 12;

// Full-charge session learning gates
static const int MIN_USB_WAKES_FOR_FULL_LEARN = 6;
static const float MIN_FULL_LEARN_CANDIDATE_V = 3.90f;
static const float MIN_FULL_LEARN_ACCEPTABLE_DROP_FROM_PEAK_V = 0.12f;
#endif

// Display model
static const float DISPLAY_EMPTY_V = 3.35f;

// Low-battery protection model
// DISPLAY_EMPTY_V is the user-facing empty point. Once the frame reaches it on
// battery power, latch into a recharge-required state and stop normal work until
// USB is present. RECOVERY_V adds hysteresis so a briefly revived cell does not
// bounce back into normal operation immediately after unplugging.
static const float RECHARGE_SHUTDOWN_V = DISPLAY_EMPTY_V;
static const float RECHARGE_RECOVERY_V = 3.55f;

// RTC validation
#if defined(FRAME_IS_ALFRED_V1_2)
static const uint32_t BATTERY_RTC_MAGIC = 0xBA77239C;
#else
static const uint32_t BATTERY_RTC_MAGIC = 0xBA77239B;
#endif

struct BatteryRtcState {
  uint32_t magic;
  bool initialized;
  bool isCharging;
  int8_t chargeScore;
  int displayedPercent;
  float lastSmoothedVoltage;
  float smoothedVoltage;

  // USB session tracking
  bool lastUsbPresent;
  int usbWakeCount;
  float usbSessionPeakVoltage;
  bool rechargeRequired;
#if defined(FRAME_IS_ALFRED_V1_2)
  float lastGaugeSoc;
  int socCandidatePercent;
  uint8_t socCandidateCount;
  uint8_t lowVoltageCount;
#endif
};

RTC_DATA_ATTR static BatteryRtcState g_batteryRtc = {
  0,
  false,
  false,
  0,
  -1,
  0.0f,
  0.0f,
  false,
  0,
  0.0f,
  false
#if defined(FRAME_IS_ALFRED_V1_2)
  , 0.0f, -1, 0, 0
#endif
};

static bool g_started = false;
#if !defined(FRAME_IS_ALFRED_V1_2)
static Preferences g_prefs;
static bool g_prefsOpened = false;

static float g_learnedFullVoltage = DEFAULT_LEARNED_FULL_V;
static int g_learnedFullSampleCount = 0;

// ------------------------------
// Preferences keys
// ------------------------------
static const char* PREF_NS = "battery";
static const char* PREF_KEY_FULL_V = "full_v";
static const char* PREF_KEY_FULL_N = "full_n";
#endif

// ------------------------------
// Helpers
// ------------------------------
static float clampf(float x, float lo, float hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

#if !defined(FRAME_IS_ALFRED_V1_2)
static void sortFloatArray(float* arr, int n) {
  for (int i = 0; i < n - 1; i++) {
    for (int j = i + 1; j < n; j++) {
      if (arr[j] < arr[i]) {
        float tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
    }
  }
}

static float rawToVoltage(int raw) {
  float v = ((float)raw / 4095.0f) * BATTERY_ADC_REF * BATTERY_DIVIDER_RATIO;
  v *= BATTERY_CAL_FACTOR;
  return v;
}

static float readRawVoltageTrimmedMean() {
  float samples[BATTERY_SAMPLE_COUNT];

  analogRead(BATTERY_ADC_PIN);
  delay(2);

  for (int i = 0; i < BATTERY_SAMPLE_COUNT; i++) {
    int raw = analogRead(BATTERY_ADC_PIN);
    samples[i] = rawToVoltage(raw);
    delay(BATTERY_SAMPLE_DELAY_MS);
  }

  sortFloatArray(samples, BATTERY_SAMPLE_COUNT);

  float sum = 0.0f;
  for (int i = 2; i <= 4; i++) {
    sum += samples[i];
  }
  return sum / 3.0f;
}

#endif

#if !defined(FRAME_IS_ALFRED_V1_2)
static void openPrefsIfNeeded() {
  if (!g_prefsOpened) {
    g_prefsOpened = g_prefs.begin(PREF_NS, false);
  }
}

static void loadLearnedCalibration() {
  openPrefsIfNeeded();
  if (!g_prefsOpened) return;

  const float storedFull = g_prefs.getFloat(PREF_KEY_FULL_V, DEFAULT_LEARNED_FULL_V);
  const int storedCount = g_prefs.getInt(PREF_KEY_FULL_N, 0);

  g_learnedFullVoltage = clampf(storedFull, MIN_LEARNABLE_FULL_V, MAX_LEARNABLE_FULL_V);
  g_learnedFullSampleCount = storedCount < 0 ? 0 : storedCount;
}

static void saveLearnedCalibration() {
  openPrefsIfNeeded();
  if (!g_prefsOpened) return;

  g_prefs.putFloat(PREF_KEY_FULL_V, g_learnedFullVoltage);
  g_prefs.putInt(PREF_KEY_FULL_N, g_learnedFullSampleCount);
}

static int batteryPercentFromVoltage(float v) {
  const float fullV = clampf(g_learnedFullVoltage, MIN_LEARNABLE_FULL_V, MAX_LEARNABLE_FULL_V);
  const float emptyV = DISPLAY_EMPTY_V;

  if (v <= emptyV) return 0;
  if (v >= fullV) return 100;

  float normalized = (v - emptyV) / (fullV - emptyV);
  normalized = clampf(normalized, 0.0f, 1.0f);

  // Mild curve:
  // - top end feels calmer
  // - bottom end feels more honest
  float curved = normalized;
  if (normalized > 0.85f) {
    curved = 0.85f + (normalized - 0.85f) * 0.60f;
  } else if (normalized < 0.20f) {
    curved = normalized * 0.80f;
  }

  int pct = (int)lroundf(curved * 100.0f);
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}
#endif

static void resetRtcState(float initialVoltage
#if defined(FRAME_IS_ALFRED_V1_2)
                          , int initialPercent
#endif
                          ) {
  g_batteryRtc.magic = BATTERY_RTC_MAGIC;
  g_batteryRtc.initialized = true;
  g_batteryRtc.isCharging = false;
  g_batteryRtc.chargeScore = 0;
  g_batteryRtc.smoothedVoltage = initialVoltage;
  g_batteryRtc.lastSmoothedVoltage = initialVoltage;
#if defined(FRAME_IS_ALFRED_V1_2)
  g_batteryRtc.displayedPercent = initialPercent;
  g_batteryRtc.lastGaugeSoc = g_max17048Soc;
  g_batteryRtc.socCandidatePercent = -1;
  g_batteryRtc.socCandidateCount = 0;
  g_batteryRtc.lowVoltageCount = 0;
#else
  g_batteryRtc.displayedPercent = batteryPercentFromVoltage(initialVoltage);
#endif
  g_batteryRtc.lastUsbPresent = false;
  g_batteryRtc.usbWakeCount = 0;
  g_batteryRtc.usbSessionPeakVoltage = initialVoltage;
#if defined(FRAME_IS_ALFRED_V1_2)
  g_batteryRtc.rechargeRequired = false;
#else
  g_batteryRtc.rechargeRequired = initialVoltage <= RECHARGE_SHUTDOWN_V;
#endif
}

static bool rtcStateValid() {
  return g_batteryRtc.magic == BATTERY_RTC_MAGIC && g_batteryRtc.initialized;
}

static float applySmoothing(float rawVoltage) {
  const float prev = g_batteryRtc.smoothedVoltage;
  const float alpha = g_batteryRtc.isCharging ? EMA_ALPHA_CHARGING : EMA_ALPHA_DISCHARGING;
  return prev * (1.0f - alpha) + rawVoltage * alpha;
}

static void updateChargingState(float newSmoothedVoltage, bool usbPresent) {
#if defined(FRAME_IS_ALFRED_V1_2)
  g_batteryRtc.isCharging = usbPresent && digitalRead(HardwareProfile::kChargeN) == LOW;
  g_batteryRtc.chargeScore = g_batteryRtc.isCharging ? CHARGE_SCORE_MAX : CHARGE_SCORE_MIN;
  return;
#else
  const float delta = newSmoothedVoltage - g_batteryRtc.lastSmoothedVoltage;

  if (delta > CHARGE_RISE_THRESHOLD_V) {
    if (g_batteryRtc.chargeScore < CHARGE_SCORE_MAX) g_batteryRtc.chargeScore++;
  } else if (delta < CHARGE_FALL_THRESHOLD_V) {
    if (g_batteryRtc.chargeScore > CHARGE_SCORE_MIN) g_batteryRtc.chargeScore--;
  } else {
    if (g_batteryRtc.chargeScore > 0) g_batteryRtc.chargeScore--;
    else if (g_batteryRtc.chargeScore < 0) g_batteryRtc.chargeScore++;
  }

  if (g_batteryRtc.chargeScore >= CHARGE_ON_SCORE && newSmoothedVoltage > 3.75f) {
    g_batteryRtc.isCharging = true;
  } else if (g_batteryRtc.chargeScore <= CHARGE_OFF_SCORE) {
    g_batteryRtc.isCharging = false;
  }
#endif
}

#if !defined(FRAME_IS_ALFRED_V1_2)
static bool shouldSnapToFullWhilePlugged(bool usbPresent, float smoothedVoltage, int mappedPercent) {
  if (!usbPresent) return false;
  if (mappedPercent >= FULL_DISPLAY_SNAP_PERCENT) return true;

  const float fullV = clampf(g_learnedFullVoltage, MIN_LEARNABLE_FULL_V, MAX_LEARNABLE_FULL_V);
  return smoothedVoltage >= (fullV - FULL_DISPLAY_SNAP_MARGIN_V);
}

static int stabilizePercent(int mappedPercent, bool isCharging) {
  int shown = g_batteryRtc.displayedPercent;
  if (shown < 0) return mappedPercent;

  if (abs(mappedPercent - shown) <= PERCENT_DEADBAND) {
    return shown;
  }

  int out = mappedPercent;

  if (!isCharging) {
    if (out < shown - MAX_DROP_PER_WAKE) out = shown - MAX_DROP_PER_WAKE;
    if (out > shown + 1) out = shown + 1;
  } else {
    if (out > shown + MAX_RISE_PER_WAKE) out = shown + MAX_RISE_PER_WAKE;
    if (out < shown - 1) out = shown - 1;
  }

  if (out < 0) out = 0;
  if (out > 100) out = 100;
  return out;
}
#endif

#if defined(FRAME_IS_ALFRED_V1_2)
static int stabilizeAlfredSoc(float gaugeSoc) {
  const int measured = (int)lroundf(clampf(gaugeSoc, 0.0f, 100.0f));
  const int shown = g_batteryRtc.displayedPercent;
  if (shown < 0) return measured;

  const float delta = gaugeSoc - (float)shown;
  const bool normalDirection = g_batteryRtc.isCharging ? delta > 0.0f : delta < 0.0f;
  const bool outsideHysteresis = fabsf(delta) >= ALFRED_SOC_HYSTERESIS;
  const bool largeCorrection = abs(measured - shown) >= ALFRED_LARGE_CORRECTION_PERCENT;

  if (normalDirection && outsideHysteresis && !largeCorrection) {
    g_batteryRtc.socCandidatePercent = -1;
    g_batteryRtc.socCandidateCount = 0;
    return measured;
  }
  if (!outsideHysteresis) {
    g_batteryRtc.socCandidatePercent = -1;
    g_batteryRtc.socCandidateCount = 0;
    return shown;
  }

  if (g_batteryRtc.socCandidatePercent != measured) {
    g_batteryRtc.socCandidatePercent = measured;
    g_batteryRtc.socCandidateCount = 1;
  } else if (g_batteryRtc.socCandidateCount < ALFRED_CORRECTION_SAMPLES) {
    g_batteryRtc.socCandidateCount++;
  }
  if (g_batteryRtc.socCandidateCount >= ALFRED_CORRECTION_SAMPLES) {
    g_batteryRtc.socCandidatePercent = -1;
    g_batteryRtc.socCandidateCount = 0;
    return measured;
  }
  return shown;
}
#endif

#if !defined(FRAME_IS_ALFRED_V1_2)
static void learnFullCandidate(float candidateV) {
  candidateV = clampf(candidateV, MIN_LEARNABLE_FULL_V, MAX_LEARNABLE_FULL_V);

  const int weightCount =
    (g_learnedFullSampleCount <= 0) ? 0 :
    min(g_learnedFullSampleCount, MAX_FULL_SAMPLES_FOR_WEIGHTING);

  float newLearned = candidateV;
  if (weightCount > 0) {
    newLearned =
      ((g_learnedFullVoltage * (float)weightCount) + candidateV) /
      ((float)weightCount + 1.0f);
  }

  g_learnedFullVoltage = clampf(newLearned, MIN_LEARNABLE_FULL_V, MAX_LEARNABLE_FULL_V);
  g_learnedFullSampleCount++;
  saveLearnedCalibration();

  Serial.print("🔋 Learned full candidate: ");
  Serial.print(candidateV, 3);
  Serial.print("V -> learnedFull=");
  Serial.print(g_learnedFullVoltage, 3);
  Serial.print("V (samples=");
  Serial.print(g_learnedFullSampleCount);
  Serial.println(")");
}

#endif

static void updateRechargeRequired(bool usbPresent, float rawVoltage, float smoothedVoltage) {
#if defined(FRAME_IS_ALFRED_V1_2)
  if (!usbPresent) {
    if (rawVoltage <= ALFRED_EMERGENCY_V) {
      g_batteryRtc.rechargeRequired = true;
      g_batteryRtc.lowVoltageCount = ALFRED_LOW_VOLTAGE_SAMPLES;
      return;
    }
    if (smoothedVoltage <= RECHARGE_SHUTDOWN_V) {
      if (g_batteryRtc.lowVoltageCount < ALFRED_LOW_VOLTAGE_SAMPLES) {
        g_batteryRtc.lowVoltageCount++;
      }
      if (g_batteryRtc.lowVoltageCount >= ALFRED_LOW_VOLTAGE_SAMPLES) {
        g_batteryRtc.rechargeRequired = true;
      }
    } else {
      g_batteryRtc.lowVoltageCount = 0;
    }
    return;
  }
  g_batteryRtc.lowVoltageCount = 0;
  if (smoothedVoltage >= RECHARGE_RECOVERY_V) {
    g_batteryRtc.rechargeRequired = false;
  }
#else
  const float effectiveVoltage = min(rawVoltage, smoothedVoltage);
  if (!usbPresent && effectiveVoltage <= RECHARGE_SHUTDOWN_V) {
    g_batteryRtc.rechargeRequired = true;
    return;
  }
  if (usbPresent && smoothedVoltage >= RECHARGE_RECOVERY_V) {
    g_batteryRtc.rechargeRequired = false;
  }
#endif
}

#if !defined(FRAME_IS_ALFRED_V1_2)
static void handleUsbSessionLearning(bool usbPresent, float rawVoltage, float smoothedVoltage) {
  // Start / continue plugged session
  if (usbPresent) {
    if (!g_batteryRtc.lastUsbPresent) {
      g_batteryRtc.usbWakeCount = 0;
      g_batteryRtc.usbSessionPeakVoltage = smoothedVoltage;
    }

    g_batteryRtc.usbWakeCount++;

    if (rawVoltage > g_batteryRtc.usbSessionPeakVoltage) {
      g_batteryRtc.usbSessionPeakVoltage = rawVoltage;
    }
    if (smoothedVoltage > g_batteryRtc.usbSessionPeakVoltage) {
      g_batteryRtc.usbSessionPeakVoltage = smoothedVoltage;
    }

    g_batteryRtc.lastUsbPresent = true;
    return;
  }

  // Transition: USB was present before, now removed.
  if (g_batteryRtc.lastUsbPresent) {
    const float candidate = g_batteryRtc.usbSessionPeakVoltage;
    const bool enoughUsbWakes = g_batteryRtc.usbWakeCount >= MIN_USB_WAKES_FOR_FULL_LEARN;
    const bool plausibleVoltage = candidate >= MIN_FULL_LEARN_CANDIDATE_V;
    const bool notWayAboveNow = candidate <= (smoothedVoltage + MIN_FULL_LEARN_ACCEPTABLE_DROP_FROM_PEAK_V);

    if (enoughUsbWakes && plausibleVoltage && notWayAboveNow) {
      learnFullCandidate(candidate);
    } else {
      Serial.print("🔋 Skipped full learn: usbWakes=");
      Serial.print(g_batteryRtc.usbWakeCount);
      Serial.print(" candidate=");
      Serial.print(candidate, 3);
      Serial.print("V now=");
      Serial.print(smoothedVoltage, 3);
      Serial.println("V");
    }
  }

  g_batteryRtc.lastUsbPresent = false;
  g_batteryRtc.usbWakeCount = 0;
  g_batteryRtc.usbSessionPeakVoltage = smoothedVoltage;
}

#endif

// ------------------------------
// Public API
// ------------------------------
void BatteryManager::begin() {
  if (g_started) return;

#if defined(FRAME_IS_ALFRED_V1_2)
  Wire.begin(HardwareProfile::kI2cSda, HardwareProfile::kI2cScl);
  pinMode(HardwareProfile::kChargeN, INPUT_PULLUP);
#else
  analogReadResolution(12);
  pinMode(BATTERY_ADC_PIN, INPUT);
#endif

#if !defined(FRAME_IS_ALFRED_V1_2)
  loadLearnedCalibration();
#endif

#if defined(FRAME_IS_ALFRED_V1_2)
  if (rtcStateValid()) g_max17048Soc = g_batteryRtc.lastGaugeSoc;
#endif

  if (!rtcStateValid()) {
#if defined(FRAME_IS_ALFRED_V1_2)
    Max17048Sample firstSample{};
    if (readMax17048Sample(firstSample)) {
      g_max17048Soc = firstSample.soc;
      resetRtcState(firstSample.voltage,
                    (int)lroundf(clampf(firstSample.soc, 0.0f, 100.0f)));
    }
#else
    resetRtcState(readRawVoltageTrimmedMean());
#endif
  }

  g_started = true;
}

BatteryState BatteryManager::readAndUpdate(bool usbPresent) {
  if (!g_started) {
    BatteryManager::begin();
  }

#if defined(FRAME_IS_ALFRED_V1_2)
  Max17048Sample sample{};
  if (!readMax17048Sample(sample)) {
    BatteryState retained{};
    retained.rawVoltage = rtcStateValid() ? g_batteryRtc.smoothedVoltage : NAN;
    retained.smoothedVoltage = retained.rawVoltage;
    retained.percent = rtcStateValid() ? g_batteryRtc.displayedPercent : -1;
    retained.usbPresent = usbPresent;
    retained.isCharging = usbPresent && digitalRead(HardwareProfile::kChargeN) == LOW;
    retained.requiresRecharge = rtcStateValid() && !usbPresent && g_batteryRtc.rechargeRequired;
    return retained;
  }
  const float rawVoltage = sample.voltage;
  g_max17048Soc = sample.soc;
#else
  const float rawVoltage = readRawVoltageTrimmedMean();
#endif

  if (!rtcStateValid()) {
#if defined(FRAME_IS_ALFRED_V1_2)
    resetRtcState(rawVoltage, (int)lroundf(clampf(g_max17048Soc, 0.0f, 100.0f)));
#else
    resetRtcState(rawVoltage);
#endif
  }

#if defined(FRAME_IS_ALFRED_V1_2)
  g_batteryRtc.lastGaugeSoc = g_max17048Soc;
#endif
  const float prevSmoothed = g_batteryRtc.smoothedVoltage;
  const float newSmoothed = applySmoothing(rawVoltage);

  g_batteryRtc.lastSmoothedVoltage = prevSmoothed;
  updateChargingState(newSmoothed, usbPresent);
  g_batteryRtc.smoothedVoltage = newSmoothed;

#if !defined(FRAME_IS_ALFRED_V1_2)
  handleUsbSessionLearning(usbPresent, rawVoltage, newSmoothed);
#endif
  updateRechargeRequired(usbPresent, rawVoltage, newSmoothed);

#if defined(FRAME_IS_ALFRED_V1_2)
  const int stablePercent = stabilizeAlfredSoc(g_max17048Soc);
#else
  const int mappedPercent = batteryPercentFromVoltage(newSmoothed);
  int stablePercent = stabilizePercent(mappedPercent, g_batteryRtc.isCharging);
  if (shouldSnapToFullWhilePlugged(usbPresent, newSmoothed, mappedPercent)) {
    stablePercent = 100;
  }
#endif

  g_batteryRtc.displayedPercent = stablePercent;
  g_batteryRtc.magic = BATTERY_RTC_MAGIC;
  g_batteryRtc.initialized = true;

  BatteryState out;
  out.rawVoltage = rawVoltage;
  out.smoothedVoltage = newSmoothed;
  out.percent = stablePercent;
  out.usbPresent = usbPresent;
  out.isCharging = g_batteryRtc.isCharging;
  out.requiresRecharge = (!usbPresent && g_batteryRtc.rechargeRequired);
  return out;
}

void BatteryManager::logState(const char* label, const BatteryState& state) {
#if defined(FRAME_IS_ALFRED_V1_2)
  Serial.print("Battery [");
  Serial.print(label ? label : "");
  Serial.print("] V=");
  Serial.print(state.rawVoltage, 3);
  Serial.print("V gauge=");
  Serial.print(g_max17048Soc, 1);
  Serial.print("% display=");
  Serial.print(state.percent);
  Serial.print("% usb=");
  Serial.print(state.usbPresent ? 1 : 0);
  Serial.print(" charging=");
  Serial.print(state.isCharging ? 1 : 0);
  Serial.print(" recharge=");
  Serial.print(state.requiresRecharge ? 1 : 0);
  if (g_batteryRtc.socCandidateCount > 0) {
    Serial.print(" candidate=");
    Serial.print(g_batteryRtc.socCandidatePercent);
    Serial.print("(");
    Serial.print(g_batteryRtc.socCandidateCount);
    Serial.print("/");
    Serial.print(ALFRED_CORRECTION_SAMPLES);
    Serial.print(")");
  }
  Serial.println();
#else
  Serial.print("🔋 Battery [");
  Serial.print(label ? label : "");
  Serial.print("] raw=");
  Serial.print(state.rawVoltage, 3);
  Serial.print("V smooth=");
  Serial.print(state.smoothedVoltage, 3);
  Serial.print("V percent=");
  Serial.print(state.percent);
  Serial.print("% charging=");
  Serial.print(state.isCharging ? "true" : "false");
  Serial.print(" rechargeRequired=");
  Serial.print(state.requiresRecharge ? "true" : "false");
  Serial.print(" learnedFull=");
  Serial.print(g_learnedFullVoltage, 3);
  Serial.print("V fullSamples=");
  Serial.print(g_learnedFullSampleCount);
  Serial.print(" usbWakes=");
  Serial.println(g_batteryRtc.usbWakeCount);
#endif
}

float BatteryManager::getLearnedFullVoltage() {
#if defined(FRAME_IS_ALFRED_V1_2)
  return NAN;
#else
  return g_learnedFullVoltage;
#endif
}

int BatteryManager::getLearnedFullSampleCount() {
#if defined(FRAME_IS_ALFRED_V1_2)
  return 0;
#else
  return g_learnedFullSampleCount;
#endif
}
