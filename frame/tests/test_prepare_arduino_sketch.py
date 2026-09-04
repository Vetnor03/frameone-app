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
        path.name
        for path in SOURCE_ROOT.rglob("*")
        if path.is_file() and path.suffix in SOURCE_SUFFIXES
    )
    output_names = sorted(
        path.name
        for path in output.iterdir()
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
