from pathlib import Path
import subprocess
import sys


FRAME_ROOT = Path(__file__).parents[1]
SOURCE_ROOT = FRAME_ROOT / "src"
SCRIPT = FRAME_ROOT / "tools" / "prepare_arduino_sketch.py"
SOURCE_SUFFIXES = {".c", ".cpp", ".h", ".hpp", ".ino", ".S"}


def test_prepares_complete_flat_arduino_sketch(tmp_path):
    output = tmp_path / "frame_v2.5.1"
    subprocess.run(
        [sys.executable, str(SCRIPT), "--output", str(output)],
        check=True,
        capture_output=True,
        text=True,
    )

    source_names = sorted(
        path.name for path in SOURCE_ROOT.rglob("*")
        if path.is_file() and path.suffix in SOURCE_SUFFIXES
    )
    output_names = sorted(
        path.name for path in output.iterdir()
        if path.suffix in SOURCE_SUFFIXES
    )
    assert output_names == source_names
    assert (output / "frame_v2.5.1.ino").is_file()
    assert (output / "partitions.csv").read_bytes() == (
        FRAME_ROOT / "partitions_alfred_16mb.csv"
    ).read_bytes()

    pairing = (output / "ScreenPairing.cpp").read_text(encoding="utf-8")
    assert '#include "PairingQrBitmap.h"' in pairing
    assert '#include "assets/images/PairingQrBitmap.h"' not in pairing


def test_refuses_wrong_or_nonempty_sketch_folder(tmp_path):
    wrong_name = subprocess.run(
        [sys.executable, str(SCRIPT), "--output", str(tmp_path / "wrong-name")],
        capture_output=True,
        text=True,
    )
    assert wrong_name.returncode != 0
    assert "must be named frame_v2.5.1" in wrong_name.stderr

    output = tmp_path / "frame_v2.5.1"
    output.mkdir()
    (output / "old.cpp").write_text("stale", encoding="utf-8")
    nonempty = subprocess.run(
        [sys.executable, str(SCRIPT), "--output", str(output)],
        capture_output=True,
        text=True,
    )
    assert nonempty.returncode != 0
    assert "not empty" in nonempty.stderr


def test_ci_compiles_the_generated_sketch_with_exact_alfred_options():
    workflow = (FRAME_ROOT.parent / ".github" / "workflows" / "frame-firmware-build.yml").read_text(
        encoding="utf-8"
    )
    assert 'version: "1.5.1"' in workflow
    assert "esp32:esp32@2.0.14" in workflow
    assert 'arduino-cli lib install "ArduinoJson@6.21.5"' in workflow
    assert 'arduino-cli lib install "Adafruit BusIO@1.17.4"' in workflow
    assert 'arduino-cli lib install "Adafruit GFX Library@1.12.6"' in workflow
    assert 'arduino-cli lib install "GxEPD2@1.6.4"' in workflow
    assert "python frame/tools/prepare_arduino_sketch.py" in workflow
    assert (
        "esp32:esp32:esp32s3:CPUFreq=240,FlashMode=qio,FlashSize=16M,"
        "PartitionScheme=min_spiffs,PSRAM=opi,USBMode=hwcdc,CDCOnBoot=cdc"
    ) in workflow



def test_standard_arduino_export_includes_mqtt_automatically(tmp_path):
    output = tmp_path / "frame_v2.5.1"
    subprocess.run(
        [sys.executable, str(SCRIPT), "--output", str(output)],
        check=True, capture_output=True, text=True,
    )
    assert '#include "HardwareProfile.h"' in (output / "MqttPushPilot.h").read_text()
    assert "#define FRAME_MQTT_PILOT_ENABLED 1" in (output / "MqttPushPilot.h").read_text()
    assert (output / "MqttPushPilot.h").read_bytes() == (SOURCE_ROOT / "network" / "MqttPushPilot.h").read_bytes()


def test_ci_compiles_only_normal_arduino_sketch_with_mqtt():
    workflow = (FRAME_ROOT.parent / ".github" / "workflows" / "frame-firmware-build.yml").read_text()
    assert 'arduino-cli lib install "PubSubClient@2.8"' in workflow
    assert 'Compile Alfred with Arduino CLI' in workflow
    assert 'Compile MQTT-enabled Alfred with Arduino CLI' not in workflow
    assert '--enable-mqtt' not in workflow
    assert "alfred-v1_2-standard-arduino-sketch-unflashed" in workflow


def test_countdown_preview_export_isolated_and_opens_in_arduino(tmp_path):
    standard = tmp_path / "standard" / "frame_v2.5.1"
    special = tmp_path / "special" / "frame_v2.5.1"
    for folder, extra in [(standard, []), (special, ["--countdown-preview"])]:
        subprocess.run(
            [sys.executable, str(SCRIPT), "--output", str(folder), *extra],
            check=True, capture_output=True, text=True,
        )
    assert (standard / "frame_v2.5.1.ino").is_file()
    assert (special / "frame_v2.5.1.ino").is_file()
    original = (SOURCE_ROOT / "modules" / "ModuleCountdown.cpp").read_text()
    normal = (standard / "ModuleCountdown.cpp").read_text()
    preview = (special / "ModuleCountdown.cpp").read_text()
    assert normal == original
    assert preview.splitlines()[0] == "#define REMIND_COUNTDOWN_EDITORIAL_PREVIEW_ENABLED 1"
    assert preview.endswith(original)
    assert (special / "CountdownEditorialPreview.h").is_file()
    assert (special / "partitions.csv").is_file()
    assert (special / "COUNTDOWN_USB_TEST_README.txt").is_file()
    assert not (standard / "COUNTDOWN_USB_TEST_README.txt").exists()
    for name in ("ModuleDate.cpp", "ModuleWeather.cpp", "ModuleSurf.cpp",
                 "ModuleReminders.cpp", "ModuleNews.cpp"):
        assert (special / name).read_bytes() == (standard / name).read_bytes()
