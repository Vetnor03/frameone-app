from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROFILE = (ROOT / "src/device/HardwareProfile.h").read_text()
DISPLAY = (ROOT / "src/display/DisplayCore.cpp").read_text()
APP = (ROOT / "src/frame_v2.5.1.ino").read_text()


def section(start, end):
    return DISPLAY[DISPLAY.index(start):DISPLAY.index(end, DISPLAY.index(start))]


def test_v4_tx_b0108_oe_is_gpio14_and_not_a_second_hardware_variant():
    assert "kEpdOutputEnable = 14" in PROFILE
    assert "kEpdPower = 12" in PROFILE


def test_v4_power_comes_up_before_translator_enable_and_spi():
    begin = section("void begin()", "void end()")
    assert begin.index("forceOutputEnableLow();") < begin.index("digitalWrite(HardwareProfile::kEpdPower, HIGH);")
    assert begin.index("digitalWrite(HardwareProfile::kEpdPower, HIGH);") < begin.index("delay(500);")
    assert begin.index("delay(500);") < begin.index("digitalWrite(HardwareProfile::kEpdOutputEnable, HIGH);")
    assert begin.index("digitalWrite(HardwareProfile::kEpdOutputEnable, HIGH);") < begin.index("alfredEpdSpi.begin")
    assert "display.init(115200, true, 2, false);" in begin


def test_v4_translator_is_disabled_before_panel_power_off():
    end = section("void end()", "bool prepareForDeepSleep()")
    assert end.index("display.hibernate();") < end.index("forceOutputEnableLow();", end.index("display.hibernate();"))
    assert end.index("forceOutputEnableLow();", end.index("display.hibernate();")) < end.index("digitalWrite(HardwareProfile::kEpdPower, LOW);")
    assert "gpio_hold_en((gpio_num_t)HardwareProfile::kEpdOutputEnable)" in end


def test_v4_boot_and_deep_sleep_keep_translator_disabled():
    startup = APP[APP.index("void setup()"):APP.index("Serial.begin(115200)", APP.index("void setup()"))]
    assert startup.index("pinMode(HardwareProfile::kEpdOutputEnable, OUTPUT);") < startup.index("gpio_deep_sleep_hold_dis();")
    assert startup.index("gpio_hold_dis((gpio_num_t)HardwareProfile::kEpdOutputEnable)") > startup.index("gpio_deep_sleep_hold_dis();")
    sleep = section("bool prepareForDeepSleep()", "void setBatteryStatus")
    assert "gpio_hold_en((gpio_num_t)HardwareProfile::kEpdOutputEnable)" in sleep
    assert "gpio_get_level((gpio_num_t)HardwareProfile::kEpdOutputEnable) == 0" in sleep
    assert "powerHold == ESP_OK && oeHold == ESP_OK && powerLow && oeLow" in sleep
