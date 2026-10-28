#!/usr/bin/env python3
"""Host Date draw calls captured as GxEPD2_BW-style 48,000-byte pages.

The exact packing used by GxEPD2_BW<750_T7,480> (v1.6.4) is mirrored
in a host shim. Independently reconstruct expected bytes from the original
1-byte-per-pixel PGM and compare every bit; do not claim real driver RAM.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path
from generate_date_native_painter_capture import compile_native, capture, cases

WIDTH, HEIGHT=800,480
HEADER=b"P5\n800 480\n255\n"


def pack_independent_from_pgm(raw:bytes)->bytes:
    assert raw.startswith(HEADER)
    pixels=raw[len(HEADER):]
    assert len(pixels)==WIDTH*HEIGHT
    assert set(pixels).issubset({0,255})
    # Deliberately independent Python oracle, not the host's packed[] path.
    # 1 represents WHITE in the actual GxEPD2_BW buffer.
    return bytes(sum((1<<(7-bit)) for bit,v in enumerate(pixels[i:i+8])
                     if v==255)
                 for i in range(0,len(pixels),8))


def generate(output:Path):
    output.mkdir(parents=True,exist_ok=True)
    records=[]
    with tempfile.TemporaryDirectory(prefix="date_gxepd_pack_") as td:
        td=Path(td)
        binary=compile_native(td/"date_capture")
        for index,item in enumerate(cases()):
            pgm=td/(str(index)+".pgm")
            native=capture(binary,item,pgm)
            raw=(Path(str(pgm)+".packed.bin")).read_bytes()
            independent=pack_independent_from_pgm(pgm.read_bytes())
            assert len(raw)==48000
            assert native["packedBytes"]==48000
            assert native["packedPixelMismatches"]==0
            assert raw==independent,(item["name"],"independent packed-byte mismatch")
            # Saving exact host bytes is meaningful evidence for future diffs;
            # they are NOT bytes sniffed from a panel or driver object.
            name="date-case-"+str(index)+"-gxepd-compatible-host.bin"
            shutil.copyfile(Path(str(pgm)+".packed.bin"),output/name)
            records.append(dict(
                name=item["name"],admitted=native["admitted"],
                dark=bool(item["dark"]),frameCell={k:item[k] for k in ("x","y","w","h")},
                rawFile=name,bytes=len(raw),
                sha256=hashlib.sha256(raw).hexdigest(),
                hostPackedFNV=native["packedHash"],
                nativePixelHash=native["hash"],
                independentlyCheckedBits=WIDTH*HEIGHT,
                mismatches=native["packedPixelMismatches"],
                outOfCell=native["inkOutside"] if native["admitted"] else None,
                outOfMatte=native["inkOutsideMatte"] if native["admitted"] else None))
    manifest=dict(
        actualGxEPD2Buffer=False,
        realGxEPD2ClassExecuted=False,
        spiCaptured=False,flashed=False,
        board="GxEPD2_750_T7",driver="GxEPD2_BW 1.6.4",
        rotation=0,pageHeight=480,pageCount=1,
        byteOrder="MSB first / 8 adjacent horizontal pixels",
        polarity="0=black 1=white",byteCount=48000,
        scope="original ModuleDate.cpp draws through host-only packed mirror",
        cases=records)
    (output/"manifest.json").write_text(
        json.dumps(manifest,indent=2,ensure_ascii=False)+"\n",
        encoding="utf-8")
    return manifest


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    result=generate(args.output)
    print(json.dumps({"caseCount":len(result["cases"]),
                      "packedBytes":result["byteCount"],
                      "bitMismatches":sum(c["mismatches"] for c in result["cases"]),
                      "actualGxEPD2Buffer":result["actualGxEPD2Buffer"]}))
