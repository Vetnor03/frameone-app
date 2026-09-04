#!/usr/bin/env python3
"""Create the flat Arduino sketch used to build the Alfred V1.2 firmware.

The repository keeps the canonical firmware split into subdirectories for
maintainability. Arduino sketches are easiest to edit as one folder, so this
tool copies every source/header into a folder whose name matches the .ino,
flattens only repository-local quoted include paths, and installs the checked-in
Alfred 16 MB partition table as the sketch's partitions.csv.
"""

from __future__ import annotations

import argparse
import posixpath
import re
import shutil
from pathlib import Path


SKETCH_NAME = "frame_v2.5.1"
SOURCE_SUFFIXES = {".c", ".cpp", ".h", ".hpp", ".ino", ".S"}
FRAME_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = FRAME_ROOT / "src"
PARTITIONS_SOURCE = FRAME_ROOT / "partitions_alfred_16mb.csv"
INCLUDE_PATTERN = re.compile(r'(?m)^(\s*#\s*include\s*")([^"]+)(")')


def firmware_sources() -> list[Path]:
    files = sorted(
        path for path in SOURCE_ROOT.rglob("*")
        if path.is_file() and path.suffix in SOURCE_SUFFIXES
    )

    sketches = [path for path in files if path.suffix == ".ino"]
    expected_sketch = SOURCE_ROOT / f"{SKETCH_NAME}.ino"
    if sketches != [expected_sketch]:
        names = ", ".join(str(path.relative_to(SOURCE_ROOT)) for path in sketches)
        raise RuntimeError(
            f"Expected only {expected_sketch.name} under {SOURCE_ROOT}; found: {names or 'none'}"
        )

    destinations: dict[str, Path] = {}
    for path in files:
        previous = destinations.get(path.name)
        if previous is not None:
            raise RuntimeError(
                "Cannot create an unambiguous flat Arduino sketch: "
                f"{previous.relative_to(SOURCE_ROOT)} and "
                f"{path.relative_to(SOURCE_ROOT)} both become {path.name}"
            )
        destinations[path.name] = path

    return files


def rewrite_local_includes(source: Path, contents: str, known_paths: set[str]) -> str:
    source_parent = source.relative_to(SOURCE_ROOT).parent.as_posix()

    def replace(match: re.Match[str]) -> str:
        include = match.group(2).replace("\\", "/")
        if "/" not in include:
            return match.group(0)

        from_source_root = posixpath.normpath(include)
        from_source_file = posixpath.normpath(posixpath.join(source_parent, include))
        if from_source_root not in known_paths and from_source_file not in known_paths:
            return match.group(0)

        return f"{match.group(1)}{posixpath.basename(include)}{match.group(3)}"

    return INCLUDE_PATTERN.sub(replace, contents)


def prepare(output: Path) -> int:
    output = output.expanduser().resolve()
    source_root = SOURCE_ROOT.resolve()

    if output.name != SKETCH_NAME:
        raise RuntimeError(
            f"Arduino requires the folder and main sketch to match; "
            f"the output folder must be named {SKETCH_NAME}"
        )
    if output == source_root or source_root in output.parents:
        raise RuntimeError("The generated sketch must be outside frame/src")
    if output.exists() and not output.is_dir():
        raise RuntimeError(f"Output exists and is not a directory: {output}")
    if output.exists() and any(output.iterdir()):
        raise RuntimeError(
            f"Output folder is not empty: {output}. Use a new empty folder so stale files cannot be compiled."
        )
    if not PARTITIONS_SOURCE.is_file():
        raise RuntimeError(f"Missing Alfred partition table: {PARTITIONS_SOURCE}")

    sources = firmware_sources()
    known_paths = {path.relative_to(SOURCE_ROOT).as_posix() for path in sources}

    prepared: list[tuple[str, str]] = []
    for source in sources:
        contents = source.read_text(encoding="utf-8")
        prepared.append(
            (source.name, rewrite_local_includes(source, contents, known_paths))
        )

    output.mkdir(parents=True, exist_ok=True)
    for filename, contents in prepared:
        (output / filename).write_text(contents, encoding="utf-8")
    shutil.copyfile(PARTITIONS_SOURCE, output / "partitions.csv")

    print(f"Prepared {len(prepared)} firmware files in {output}")
    print(f"Installed {PARTITIONS_SOURCE.name} as partitions.csv")
    return len(prepared)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        required=True,
        type=Path,
        help=f"new or empty destination folder named {SKETCH_NAME}",
    )
    args = parser.parse_args()

    try:
        prepare(args.output)
    except RuntimeError as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
