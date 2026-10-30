"""Offline only: physical aperture reference and recovery-file provenance QA.

Tests use fabricated local fixtures, NOT a previously booted/working backup.
NEVER treat a successful unit test as physical rollback verification.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
RECOVERY=ROOT/"frame/tools/verify_firmware_recovery.py"
OVERLAY=ROOT/"frame/tools/generate_date_aperture_reference.py"


def imported(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    obj=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj


def example_manifest(backup,digest):
    return {
      "hardware":{"module":"ESP32-S3-WROOM-1-N16R8",
                  "flash_size_bytes":16777216},
      "image":{"kind":"esp32s3-full-merged",
               "local_path":str(backup),
               "offset":"0x0",
               "length_bytes":16777216,
               "working_version":"TEST-FIXTURE-NOT-REAL",
               "sha256":digest},
      "evidence":{"booted_on_matching_v4":False,
                  "working_boot_date":"2026-10-29",
                  "working_boot_record":"TEST FAKE BOOT RECORD",
                  "restore_rehearsed":False,
                  "restore_rehearsal_date":"2026-10-29",
                  "restore_rehearsal_record":"TEST FAKE REHEARSAL"}
    }


def fake_image(boot=False):
    """Syntactically valid tiny ESP32-S3 image, NOT executable firmware."""
    import struct
    header=bytearray(24)
    header[0]=0xE9
    header[1]=1 # one segment
    header[2]=0 # QIO
    header[3]=0x40 # ESP32-S3 16 MiB SPI flash
    struct.pack_into("<H",header,12,9) # ESP32-S3 ID
    header[23]=1 # appended SHA256
    payload=bytes(range(1,17))
    segment=struct.pack("<II",0x3FC80000,len(payload))+payload
    source=bytes(header)+segment
    pad=(15-len(source)%16)%16
    checksum=0xef
    for byte in payload:checksum^=byte
    image=source+b"\\x00"*pad+bytes([checksum])
    assert len(image)%16==0
    return image+hashlib.sha256(image).digest()


def fake_partition_table(app_index=0):
    """Only a structural fixture, not a firmware partition bundle."""
    import struct
    entries=[]
    for name,typ,sub,off,size in [
      ("nvs",1,2,0x9000,0x5000),
      ("otadata",1,0,0xe000,0x2000),
      ("app0",0,0x10,0x10000,0x600000),
      ("app1",0,0x11,0x610000,0x600000),
      ("spiffs",1,0x82,0xc10000,0x3e0000),
      ("coredump",1,3,0xff0000,0x10000),
    ]:
        label=name.encode("ascii").ljust(16,b"\\x00")
        entries.append(struct.pack("<HBBII16sI",0x50aa,typ,sub,off,size,label,0))
    full=b"".join(entries)
    md5=b"\\xeb\\xeb"+b"\\xff"*14+hashlib.md5(full).digest()
    assert len(md5)==32
    return (full+md5).ljust(4096,b"\\xff")


def make_magic_only_bin(tmp_path):
    image=tmp_path/"FAKE-MAGIC-ONLY-NEVER-FLASH.bin"
    with image.open("wb") as out:
        out.seek(16777216-1)
        out.write(b"\\0")
        out.seek(0)
        out.write(b"\\xe9")
        out.seek(0x8000)
        out.write(b"\\xaa\\x50")
        out.seek(0x10000)
        out.write(b"\\xe9")
    return image,hashlib.sha256(image.read_bytes()).hexdigest()


def make_structural_fixture(tmp_path,app_index=0):
    """Valid headers/table/checksums, FAKE segments that cannot boot."""
    image=tmp_path/f"FAKE-ESP32-S3-{app_index}-NEVER-FLASH.bin"
    with image.open("wb") as out:
        # Erased (0xFF) flash is more realistic than an all-zero sparse file.
        out.write(b"\\xff"*(16*1024*1024))
        out.seek(0)
        out.write(fake_image(boot=True))
        out.seek(0x8000)
        out.write(fake_partition_table())
        out.seek(0x10000 if app_index==0 else 0x610000)
        out.write(fake_image())
    return image,hashlib.sha256(image.read_bytes()).hexdigest()


def test_rollback_missing_file_refuses_to_approve(tmp_path):
    checker=imported(RECOVERY,"recovery_missing")
    manifest=example_manifest(tmp_path/"no-such-file.bin","a"*64)
    p=tmp_path/"manifest.json"
    p.write_text(json.dumps(manifest))
    outcome=checker.check_manifest(p)
    assert outcome["errors"] and not outcome["metadata_passes"]
    assert not outcome["physical_restore_verified_by_tool"]
    assert not outcome["flashing_performed"]


def test_magic_only_file_no_longer_passes_with_valid_sha256(tmp_path):
    checker=imported(RECOVERY,"recovery_magic_only")
    backup,digest=make_magic_only_bin(tmp_path)
    record=example_manifest(backup,digest)
    record["evidence"]["booted_on_matching_v4"]=True
    record["evidence"]["restore_rehearsed"]=True
    manifest=tmp_path/"manifest.json"
    manifest.write_text(json.dumps(record))
    state=checker.check_manifest(manifest)
    assert state["checks"]["sha256_matches_manifest"]
    assert not state["checks"]["esp32s3_structural_pass"]
    assert not state["binary_verified"]
    assert not state["metadata_passes"]
    assert state["errors"]


def test_structurally_valid_synthetic_file_only_checks_metadata(tmp_path):
    checker=imported(RECOVERY,"recovery_synthetic")
    backup,digest=make_structural_fixture(tmp_path)
    p=tmp_path/"manifest.json"
    record=example_manifest(backup,digest)
    p.write_text(json.dumps(record))
    outcome=checker.check_manifest(p)
    assert outcome["binary_verified"],outcome["errors"]
    assert outcome["checks"]["esp32s3_structural_pass"]
    assert outcome["checks"]["valid_app_partitions"]==["app0"]
    assert outcome["checks"]["erased_app_partitions"]==["app1"]
    assert not outcome["metadata_passes"]
    assert not outcome["manual_evidence_complete"]
    # Positive return means only externally self-attested METADATA, never
    # working flash, authentic signature, or actual physical recovery.
    record["evidence"]["booted_on_matching_v4"]=True
    record["evidence"]["restore_rehearsed"]=True
    p.write_text(json.dumps(record))
    confirmed=checker.check_manifest(p)
    assert confirmed["metadata_passes"] and confirmed["metadata_only"]
    assert not confirmed["physical_restore_verified_by_tool"]
    assert not confirmed["flashing_performed"]
    cli=subprocess.run([sys.executable,str(RECOVERY),"--manifest",str(p)],
        text=True,capture_output=True,timeout=20)
    assert cli.returncode==0,cli.stderr
    assert "NOT FLASH AUTHORIZATION" in cli.stdout


def test_backup_valid_app1_does_not_require_app0(tmp_path):
    checker=imported(RECOVERY,"recovery_ota")
    backup,digest=make_structural_fixture(tmp_path,app_index=1)
    p=tmp_path/"manifest.json"
    p.write_text(json.dumps(example_manifest(backup,digest)))
    record=checker.check_manifest(p)
    assert record["binary_verified"],record["errors"]
    assert record["checks"]["valid_app_partitions"]==["app1"]


def test_partition_md5_corruption_and_wrong_firmware_chip_are_rejected(tmp_path):
    checker=imported(RECOVERY,"recovery_corrupt")
    backup,digest=make_structural_fixture(tmp_path)
    with backup.open("r+b") as out:
        out.seek(0x9000-32) # last partition entry, before MD5 footer
        out.write(b"BAD BAD BAD BAD BAD BAD BAD BAD ")
    p=tmp_path/"manifest.json"
    p.write_text(json.dumps(example_manifest(
        backup,hashlib.sha256(backup.read_bytes()).hexdigest())))
    state=checker.check_manifest(p)
    assert not state["binary_verified"]
    assert any("MD5" in err or "entry magic" in err for err in state["errors"])
    # Restore table, then change only app's ESP32-S3 chip ID (header+12).
    with backup.open("r+b") as out:
        out.seek(0x8000)
        out.write(fake_partition_table())
        out.seek(0x10000+12)
        out.write(b"\\x00\\x00")
    p.write_text(json.dumps(example_manifest(
        backup,hashlib.sha256(backup.read_bytes()).hexdigest())))
    state=checker.check_manifest(p)
    assert not state["binary_verified"]
    assert any("chip ID" in err for err in state["errors"])


def test_image_segment_checksum_failure_rejected(tmp_path):
    checker=imported(RECOVERY,"recovery_segment")
    backup,digest=make_structural_fixture(tmp_path)
    with backup.open("r+b") as out:
        out.seek(0x10000+24+8)
        out.write(b"\\xAA") # modified payload, checksums now wrong
    p=tmp_path/"manifest.json"
    p.write_text(json.dumps(example_manifest(
        backup,hashlib.sha256(backup.read_bytes()).hexdigest())))
    outcome=checker.check_manifest(p)
    assert not outcome["binary_verified"]
    assert any("checksum" in err or "SHA256" in err for err in outcome["errors"])


def test_recovery_rejects_app_only_or_impossible_device(tmp_path):
    checker=imported(RECOVERY,"recovery_wrong")
    backup,digest=make_structural_fixture(tmp_path)
    bad=example_manifest(backup,digest)
    bad["image"]["kind"]="app-only"
    bad["hardware"]["flash_size_bytes"]=4*1024*1024
    manifest=tmp_path/"manifest.json"
    manifest.write_text(json.dumps(bad))
    errors=checker.check_manifest(manifest)["errors"]
    assert any("merged" in error for error in errors)
    assert any("16 MiB" in error for error in errors)


def test_aperture_reference_reads_generated_device_policy(tmp_path):
    overlay=imported(OVERLAY,"date_overlay")
    dims=overlay.policy_dimensions(
        (ROOT/"frame/src/display/DateRolePolicy.generated.h").read_text())
    assert tuple(dims[k] for k in
      ("PANEL_WIDTH","PANEL_HEIGHT","MATTE_X","MATTE_Y",
       "MATTE_WIDTH","MATTE_HEIGHT"))==(800,480,58,39,680,436)
    svg=tmp_path/"date-aperture.svg"
    report=overlay.generate(svg)
    assert not report["hardware_verified"]
    assert not report["flashing_performed"]
    source=svg.read_text()
    assert 'viewBox="0 0 800 480"' in source
    assert 'x="58" y="39" width="680" height="436"' in source
    assert source.count('stroke-dasharray="5,4"')==6
    assert "NOT A FLASH IMAGE" in source
    assert "NOT physically verified" in source
    assert len(re.findall(r'<path d="M ',source))==4
    # A policy edit MUST alter the reference instead of silently assuming
    # the old 680x436 aperture in an independent calibration utility.
    new_policy=(ROOT/"frame/src/display/DateRolePolicy.generated.h").read_text()
    changed=new_policy.replace("MATTE_X = 58;","MATTE_X = 48;")
    assert overlay.policy_dimensions(changed)["MATTE_X"]==48
