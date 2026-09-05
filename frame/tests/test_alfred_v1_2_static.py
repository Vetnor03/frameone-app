from pathlib import Path
import re

ROOT = Path(__file__).parents[1]

def text(path):
    return (ROOT / path).read_text()

def alfred_branch(source, start):
    region = source[source.index(start):]
    return region[:region.index("#else")]

def test_hardware_profile_exact_mapping_and_s3_autoselection():
    profile = text("src/device/HardwareProfile.h")
    assert "defined(FRAME_HW_ALFRED_V1_2) || defined(CONFIG_IDF_TARGET_ESP32S3)" in profile
    assert "#define FRAME_IS_ALFRED_V1_2 1" in profile
    for value in ["kEpdBusy = 4", "kEpdReset = 5", "kEpdDc = 6", "kEpdCs = 7",
                  "kI2cScl = 8", "kI2cSda = 9", "kEpdSck = 10", "kEpdMosi = 11",
                  "kEpdPower = 12", "kPgoodN = 17", "kChargeN = 18",
                  "kMax17048Address = 0x36", "kEpdSpiHz = 4000000UL"]:
        assert value in alfred_branch(profile, "#if defined(FRAME_IS_ALFRED_V1_2)")
    assert "19" not in profile and "20" not in profile

def test_gauge_is_transactional_retried_and_non_destructive():
    source = text("src/device/BatteryManager.cpp")
    assert "rawVCell * 78.125e-6f" in source
    assert "rawSoc / 256.0f" in source
    assert "kMax17048ReadAttempts = 3" in source
    assert "static bool readMax17048Register" in source
    assert "if (!readMax17048Sample(sample))" in source
    assert "retaining previous valid battery state" in source
    assert "retained.requiresRecharge = rtcStateValid()" in source
    assert "retained.percent = rtcStateValid() ? g_batteryRtc.displayedPercent : -1" in source
    assert "const int stablePercent = stabilizeAlfredSoc(g_max17048Soc)" in source
    assert "ALFRED_SOC_HYSTERESIS = 0.75f" in source
    assert "ALFRED_CORRECTION_SAMPLES = 3" in source
    assert "digitalRead(HardwareProfile::kChargeN) == LOW" in source
    assert "#if !defined(FRAME_IS_ALFRED_V1_2)\nstatic const int BATTERY_ADC_PIN = 35" in source
    display = text("src/display/DisplayCore.cpp")
    assert "g_batteryPercent = -1;" in display
    app = text("src/frame_v2.5.1.ino")
    assert "Device status skipped: no valid battery sample" in app
    assert "if (batt.percent >= 0) UpdateChecker::saveBatteryPercent" in app

def test_wake_polarity_and_complete_deep_sleep_hold():
    display = text("src/display/DisplayCore.cpp")
    app = text("src/frame_v2.5.1.ino")
    wake = alfred_branch(app, "#if defined(FRAME_IS_ALFRED_V1_2)\n  // GPIO17")
    assert "ESP_EXT1_WAKEUP_ANY_LOW" in wake
    assert "ESP_EXT1_WAKEUP_ANY_HIGH" in wake
    assert "ESP_EXT1_WAKEUP_ALL_LOW" not in wake
    assert "out.usbPresent = (highCount < 3)" in app
    assert "gpio_hold_en((gpio_num_t)HardwareProfile::kEpdPower)" in display
    assert "gpio_deep_sleep_hold_en()" in display
    assert "gpio_get_level((gpio_num_t)HardwareProfile::kEpdPower) == 0" in display
    wake_release = app[app.index("void setup()") : app.index("Serial.begin(115200)")]
    assert wake_release.index("pinMode(HardwareProfile::kEpdPower, OUTPUT)") < wake_release.index("gpio_deep_sleep_hold_dis()")
    assert wake_release.index("gpio_deep_sleep_hold_dis()") < wake_release.index("gpio_hold_dis")

def test_alfred_begin_does_not_physically_refresh_and_shutdown_is_audited():
    display = text("src/display/DisplayCore.cpp")
    begin = display[display.index("void begin()") : display.index("void end()")]
    alfred = begin[begin.index("#if defined(FRAME_IS_ALFRED_V1_2)") : begin.index("#endif")]
    assert "selectSPI(alfredEpdSpi" in alfred
    assert "firstPage()" not in alfred and "nextPage()" not in alfred
    app = text("src/frame_v2.5.1.ino")
    assert "Layout::drawWithContent(g_cfg.layout, g_cfg);\n  shutdownDisplay();" in app
    assert "ScreenPairing::showWifiConnected();\n    shutdownDisplay();" in app
    portal = text("src/device/ProvisioningPortal.cpp")
    assert re.search(r"showWifiSetup\([^;]+;\s*.*DisplayCore::end\(\);", portal, re.S)

def test_s3_build_profile_and_ota_partitions():
    ini = text("platformio.ini")
    for value in ["[env:alfred_v1_2]", "board = alfred_v1_2", "16MB", "qio_opi",
                  "240000000L"]:
        assert value in ini
    board = text("boards/alfred_v1_2.json")
    assert "ARDUINO_USB_CDC_ON_BOOT=1" in board and "ARDUINO_USB_MODE=1" in board
    partitions = text("partitions_alfred_16mb.csv")
    assert "ota_0" in partitions and "ota_1" in partitions

def test_fresh_checkout_include_paths_are_resolvable():
    source_root = ROOT / "src"
    pairing = text("src/display/ScreenPairing.cpp")
    assert '#include "assets/images/PairingQrBitmap.h"' in pairing
    assert (source_root / "assets/images/PairingQrBitmap.h").is_file()
    for source in source_root.rglob("*"):
        if source.suffix not in {".cpp", ".h", ".ino"}:
            continue
        contents = source.read_text()
        assert not re.search(r'#include [<"]Fonts/[^">]*NO\.h[">]', contents), source


def test_custom_board_unambiguously_describes_n16r8():
    import csv
    import json

    board = json.loads(text("boards/alfred_v1_2.json"))
    assert board["name"].endswith("ESP32-S3-WROOM-1-N16R8)")
    assert board["upload"]["flash_size"] == "16MB"
    assert board["upload"]["maximum_size"] == 16 * 1024 * 1024
    assert board["build"]["flash_mode"] == "qio"
    assert board["build"]["arduino"]["memory_type"] == "qio_opi"
    assert board["build"]["psram_type"] == "opi"
    assert board["build"]["psram_size"] == 8 * 1024 * 1024
    assert "-DBOARD_HAS_PSRAM" in board["build"]["extra_flags"]

    ini = text("platformio.ini")
    alfred = ini[ini.index("[env:alfred_v1_2]"):]
    assert "board = alfred_v1_2" in alfred
    assert "board_build.partitions = partitions_alfred_16mb.csv" in alfred

    rows = list(csv.reader(line for line in text("partitions_alfred_16mb.csv").splitlines()
                           if line and not line.startswith("#")))
    apps = {row[0].strip(): (int(row[3], 0), int(row[4], 0)) for row in rows
            if row[2].strip() in {"ota_0", "ota_1"}}
    assert apps == {"app0": (0x10000, 0x600000), "app1": (0x610000, 0x600000)}
    assert apps["app0"][0] + apps["app0"][1] == apps["app1"][0]
    assert max(offset + size for offset, size in apps.values()) <= 16 * 1024 * 1024


def test_power_sense_is_typed_not_a_preprocessor_macro():
    app = text("src/frame_v2.5.1.ino")
    assert "PWR_SENSE_DEBUG_PIN" not in app
    assert "#define POWER_SENSE_PIN" not in app
    assert "static constexpr int POWER_SENSE_PIN = HardwareProfile::kPgoodN" in app
    assert "static constexpr int POWER_SENSE_PIN = HardwareProfile::kPowerSense" in app

def test_alfred_calibration_and_low_voltage_logic_are_isolated():
    source = text("src/device/BatteryManager.cpp")
    assert "Learned calibration for classic ADC-based hardware" in source
    assert "#if !defined(FRAME_IS_ALFRED_V1_2)\n#include <Preferences.h>" in source
    for call in ["loadLearnedCalibration();", "handleUsbSessionLearning(usbPresent"]:
        call_at = source.index(call, source.index("void BatteryManager::begin()"))
        guard_at = source.rfind("#if !defined(FRAME_IS_ALFRED_V1_2)", 0, call_at)
        endif_at = source.find("#endif", call_at)
        assert guard_at < call_at < endif_at
    assert "smoothedVoltage <= RECHARGE_SHUTDOWN_V" in source
    assert "lowVoltageCount >= ALFRED_LOW_VOLTAGE_SAMPLES" in source
    assert "rawVoltage <= ALFRED_EMERGENCY_V" in source
    assert "smoothedVoltage >= RECHARGE_RECOVERY_V" in source


def test_alfred_diagnostics_include_gauge_power_and_stabilizer_state():
    source = text("src/device/BatteryManager.cpp")
    for value in ['"V gauge="', '"% display="', '"% usb="', '" charging="',
                  '" recharge="', '" candidate="']:
        assert value in source

def test_alfred_stabilizer_covers_directional_and_large_corrections():
    source = text("src/device/BatteryManager.cpp")
    stabilizer = source[source.index("static int stabilizeAlfredSoc"):
                        source.index("static void learnFullCandidate")]
    assert "fabsf(delta) >= ALFRED_SOC_HYSTERESIS" in stabilizer
    assert "g_batteryRtc.isCharging ? delta > 0.0f : delta < 0.0f" in stabilizer
    assert "largeCorrection" in stabilizer
    assert "socCandidatePercent != measured" in stabilizer
    assert "socCandidateCount >= ALFRED_CORRECTION_SAMPLES" in stabilizer
    assert "return measured" in stabilizer and "return shown" in stabilizer
    assert "RTC_DATA_ATTR static BatteryRtcState" in source


def test_alfred_power_changes_do_not_assign_synthetic_soc():
    source = text("src/device/BatteryManager.cpp")
    alfred_update = source[source.index("BatteryState BatteryManager::readAndUpdate"):]
    assert "stabilizeAlfredSoc(g_max17048Soc)" in alfred_update
    assert "retained.percent = rtcStateValid() ? g_batteryRtc.displayedPercent : -1" in alfred_update
    assert "stablePercent = usbPresent ? 100" not in alfred_update
    assert "stablePercent = usbPresent ? 0" not in alfred_update
    assert "displayedPercent = usbPresent" not in alfred_update
