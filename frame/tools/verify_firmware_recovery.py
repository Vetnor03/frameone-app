#!/usr/bin/env python3
"""OFFLINE check of an existing known-good ESP32-S3 flash backup.

Never connects to a device, downloads a binary, or flashes anything.
A passing hash verifies local file integrity ONLY, not working firmware.
Manual boot + restore rehearsal evidence must still be confirmed by owner.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import sys

FLASH_SIZE = 16 * 1024 * 1024
ESP_IMAGE_MAGIC = 0xE9
PARTITION_MAGIC = b"\xaa\x50"
SHA256 = re.compile(r"^[a-fA-F0-9]{64}$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def check_manifest(manifest_path: Path) -> dict:
    errors = []
    info = {
        "metadata_only": True,
        "flashing_performed": False,
        "physical_restore_verified_by_tool": False,
        "binary_verified": False,
        "manual_evidence_complete": False,
        "checks": {},
    }

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        info["errors"] = [f"Cannot read manifest: {exc}"]
        return info
    if not isinstance(manifest, dict):
        info["errors"] = ["Manifest must be a JSON object"]
        return info

    hw = manifest.get("hardware") or {}
    image = manifest.get("image") or {}
    evidence = manifest.get("evidence") or {}
    if not all(isinstance(obj, dict) for obj in (hw, image, evidence)):
        info["errors"] = ["hardware, image and evidence must be JSON objects"]
        return info

    if hw.get("module") != "ESP32-S3-WROOM-1-N16R8":
        errors.append("Hardware module is not the documented N16R8 target")
    if hw.get("flash_size_bytes") != FLASH_SIZE:
        errors.append("Expected ESP32-S3 16 MiB flash")
    if image.get("kind") != "esp32s3-full-merged":
        errors.append("Recovery requires an ESP32-S3 merged flash image, not app-only BIN")
    if image.get("offset") != "0x0":
        errors.append("Full merged image must be backed up from flash offset 0x0")
    if image.get("length_bytes") != FLASH_SIZE:
        errors.append("Full merged backup must be exactly 16777216 bytes")
    expected = image.get("sha256")
    if not isinstance(expected, str) or not SHA256.fullmatch(expected):
        errors.append("Expected a complete recorded 64-character SHA256 digest")
        expected = None

    version = image.get("working_version")
    if not isinstance(version, str) or not version.strip() or version in ("unknown", "latest"):
        errors.append("Record an actual version read from a working device")
    path_value = image.get("local_path")
    if not isinstance(path_value, str) or not path_value.strip():
        errors.append("Specify a locally available merged BIN in image.local_path")
    else:
        path = Path(path_value).expanduser()
        if not path.is_absolute():
            path = manifest_path.parent / path
        try:
            size = path.stat().st_size
            info["checks"]["file_size_bytes"] = size
            if size != FLASH_SIZE:
                errors.append(f"Wrong file length: {size} bytes; expected {FLASH_SIZE}")
            else:
                digest = hashlib.sha256()
                with path.open("rb") as file:
                    head = file.read(1)
                    file.seek(0x8000)
                    partition = file.read(2)
                    file.seek(0x10000)
                    app_head = file.read(1)
                    file.seek(0)
                    for block in iter(lambda: file.read(1024 * 1024), b""):
                        digest.update(block)
                actual = digest.hexdigest()
                info["checks"].update({
                    "bootloader_image_magic": head == bytes([ESP_IMAGE_MAGIC]),
                    "partition_table_magic": partition == PARTITION_MAGIC,
                    "app_image_magic": app_head == bytes([ESP_IMAGE_MAGIC]),
                    "sha256_matches_manifest": bool(expected and
                                                     actual.lower() == expected.lower()),
                })
                if head != bytes([ESP_IMAGE_MAGIC]):
                    errors.append("No ESP32-S3 image header at bootloader offset 0x0")
                if partition != PARTITION_MAGIC:
                    errors.append("No ESP partition table signature at 0x8000")
                if app_head != bytes([ESP_IMAGE_MAGIC]):
                    errors.append("No application image header at 0x10000")
                if expected and actual.lower() != expected.lower():
                    errors.append("BIN SHA256 differs from manifest")
                info["binary_verified"] = bool(
                    expected and actual.lower() == expected.lower() and
                    head == bytes([ESP_IMAGE_MAGIC]) and
                    partition == PARTITION_MAGIC and
                    app_head == bytes([ESP_IMAGE_MAGIC]))
        except OSError as exc:
            errors.append(f"Cannot access local binary: {exc}")

    # These are deliberately evidence CLAIMS, never machine-proven flash tests.
    # A true value must come from genuine owner-provided records, not CI.
    for key in ("booted_on_matching_v4", "restore_rehearsed"):
        if evidence.get(key) is not True:
            errors.append(f"Missing manual confirmation: evidence.{key}")
    for key in ("working_boot_record", "restore_rehearsal_record"):
        if not isinstance(evidence.get(key), str) or not evidence[key].strip():
            errors.append(f"Missing real evidence reference: evidence.{key}")
    for key in ("working_boot_date", "restore_rehearsal_date"):
        raw = evidence.get(key)
        try:
            if not isinstance(raw, str) or not DATE.fullmatch(raw):
                raise ValueError("Bad date")
            date = dt.date.fromisoformat(raw)
            if date > dt.date.today():
                raise ValueError("Future date")
        except ValueError:
            errors.append(f"Invalid or unrecorded evidence date: evidence.{key}")

    info["manual_evidence_complete"] = not any(
        "evidence" in error or "manual confirmation" in error for error in errors)
    info["errors"] = errors
    info["metadata_passes"] = not errors
    return info


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--manifest",type=Path,required=True,
                   help="LOCAL user-authored evidence JSON. Never commit credentials or a full flash dump.")
    args = p.parse_args(argv)
    outcome = check_manifest(args.manifest.resolve())
    print(json.dumps(outcome,indent=2,sort_keys=True))
    if outcome["errors"]:
        print("BLOCKED: This is not a verified restoration baseline.",file=sys.stderr)
        return 2
    print("LOCAL METADATA CHECK PASSED; physical boot/restore evidence remains owner-attested.")
    print("THIS IS NOT FLASH AUTHORIZATION.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
