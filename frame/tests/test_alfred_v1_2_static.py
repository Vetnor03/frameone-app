from pathlib import Path

ROOT = Path(__file__).parents[1]

def text(path):
    return (ROOT / path).read_text()

def test_hardware_profile_exact_mapping_and_polarity():
    profile = text("src/device/HardwareProfile.h")
    for value in [
        "kEpdBusy = 4", "kEpdReset = 5", "kEpdDc = 6", "kEpdCs = 7",
        "kI2cScl = 8", "kI2cSda = 9", "kEpdSck = 10", "kEpdMosi = 11",
        "kEpdPower = 12", "kPgoodN = 17", "kChargeN = 18",
        "kMax17048Address = 0x36", "kEpdSpiHz = 4000000UL",
    ]:
        assert value in profile
    assert "19" not in profile and "20" not in profile

def test_alfred_battery_path_uses_gauge_and_active_low_charger():
    source = text("src/device/BatteryManager.cpp")
    assert "rawVCell * 78.125e-6f" in source
    assert "readMax17048Register(0x04) / 256.0f" in source
    assert "digitalRead(HardwareProfile::kChargeN) == LOW" in source
    legacy_start = source.index("#if !defined(FRAME_HW_ALFRED_V1_2)\nstatic const int BATTERY_ADC_PIN = 35")
    assert legacy_start >= 0
    assert "readMax17048Voltage()" in source
    assert "const int stablePercent = mappedPercent" in source

def test_power_and_sleep_safety():
    display = text("src/display/DisplayCore.cpp")
    app = text("src/frame_v2.5.1.ino")
    assert "selectSPI(alfredEpdSpi" in display
    assert "digitalWrite(HardwareProfile::kEpdPower, LOW)" in display
    assert "gpio_hold_en((gpio_num_t)HardwareProfile::kEpdPower)" in display
    assert "display.hibernate()" in display
    assert "out.usbPresent = (highCount < 3)" in app
    assert "ESP_EXT1_WAKEUP_ANY_HIGH" in app and "ESP_EXT1_WAKEUP_ALL_LOW" in app

def test_s3_build_profile_and_ota_partitions():
    ini = text("platformio.ini")
    for value in ["[env:alfred_v1_2]", "esp32-s3-devkitc-1", "16MB", "qio_opi",
                  "240000000L", "ARDUINO_USB_CDC_ON_BOOT=1", "ARDUINO_USB_MODE=1"]:
        assert value in ini
    partitions = text("partitions_alfred_16mb.csv")
    assert "ota_0" in partitions and "ota_1" in partitions
