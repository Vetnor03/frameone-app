#!/usr/bin/env python3
"""Original firmware Date + original News paint via pinned Adafruit_GFX/GxEPD2.

ModuleNews.cpp is compiled completely unchanged. The test seeds its actual
NewsCache (three synthetic headlines) and uses an aborting network stub.
This proves render composition, NOT a real News backend request or a panel.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile
from urllib.request import urlopen

from generate_date_direct_gfx_bw_capture import compile_original_chain
from generate_date_native_painter_capture import pgm_to_png

ROOT=Path(__file__).resolve().parents[2]
CLI=ROOT/"frame/tests/driver_capture/date_news_gfx_bw_cli.cpp"
WIDTH,HEIGHT=800,480
BYTES=WIDTH*HEIGHT//8
ARDUINO_JSON_URL="https://codeload.github.com/bblanchon/ArduinoJson/zip/refs/tags/v6.21.5"


def fetch_arduinojson_header_tree(folder:Path)->dict:
    # Real ArduinoJson 6.21.5 headers; fake network API is linked separately
    # and is never invoked. No test-only ArduinoJson substitute.
    with urlopen(ARDUINO_JSON_URL,timeout=40) as response:
        content=response.read()
    metadata=dict(archiveUrl=ARDUINO_JSON_URL,
                  archiveSha256=hashlib.sha256(content).hexdigest(),
                  headerVersion="6.21.5")
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        files=[file for file in archive.infolist()
               if not file.is_dir() and "/src/" in file.filename]
        assert files
        count=0
        for file in files:
            filename=file.filename.split("/src/",1)[1]
            target=folder/filename
            # Restricted to source header tree (no archive path traversal).
            if not filename or ".." in Path(filename).parts:
                raise RuntimeError("unsafe ArduinoJson archive path")
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(archive.read(file))
            count+=1
    assert (folder/"ArduinoJson.h").is_file()
    metadata["extractedSourceFiles"]=count
    return metadata


def png_from_bits(bits:bytes)->bytes:
    assert len(bits)==BYTES
    pgm=bytearray(b"P5\n800 480\n255\n")
    for b in bits:
        pgm.extend((255 if b&(0x80>>i) else 0) for i in range(8))
    return pgm_to_png(bytes(pgm))


def count_different(a:bytes,b:bytes)->int:
    assert len(a)==len(b)==BYTES
    return sum((x^y).bit_count() for x,y in zip(a,b))


def generate(out:Path)->dict:
    out.mkdir(parents=True,exist_ok=True)
    records=[]
    with tempfile.TemporaryDirectory(prefix="real_date_news_gfx_") as tmpdir:
        tmp=Path(tmpdir)
        arduinojson=fetch_arduinojson_header_tree(tmp/"arduinojson")
        binary=compile_original_chain(
            tmp/"date-news-driver",tmp/"upstream",CLI,
            extra_includes=(tmp/"arduinojson",))
        for dark in (0,1):
            prefix=out/("news-date-"+("dark" if dark else "light"))
            run=subprocess.run(
                [str(binary),str(prefix),"2026","9","21",str(dark)],
                cwd=ROOT,text=True,capture_output=True,timeout=45)
            if run.returncode:
                raise RuntimeError("Actual News+Date draw failed:\n"+
                                   run.stdout[-3000:]+"\n"+run.stderr[-8000:])
            status=json.loads(run.stdout)
            assert status["realModuleDateCpp"]
            assert status["realModuleNewsCpp"]
            assert status["realAdafruitGfxCpp"]
            assert status["realGxEPD2BW"]
            assert status["syntheticNewsFixture"]
            assert status["networkAttempted"] is False
            assert status["dateEditorialAdmitted"]
            assert status["frameBytes"]==BYTES
            assert status["dateInk"]>=300 and status["newsInk"]>=30
            assert status["dateInkInsideNews"]==0
            assert status["newsInkInsideDate"]==0
            pages={
                key:(out/(prefix.name+"-"+key+".bin")).read_bytes()
                for key in (
                  "date-only","news-only","date-then-news","news-then-date")
            }
            assert all(len(page)==BYTES for page in pages.values())
            independent=bytes((a|b) if dark else (a&b)
                for a,b in zip(pages["date-only"],pages["news-only"]))
            direct=pages["date-then-news"]
            reverse=pages["news-then-date"]
            assert status["dateThenNewsVsIndependentBits"]==count_different(
                direct,independent)
            assert status["newsThenDateVsIndependentBits"]==count_different(
                reverse,independent)
            assert direct==independent==reverse, "real module paint collided"
            png=out/(prefix.name+".png")
            png.write_bytes(png_from_bits(direct))
            records.append(dict(theme="dark" if dark else "light",
                originalProductionModules=["ModuleDate.cpp","ModuleNews.cpp"],
                realModuleRenderers=2,syntheticNewsHeadlines=3,
                realBackendRequested=False,frameInkBytes=BYTES,
                outputPng=png.name,
                outputBin=prefix.name+"-date-then-news.bin",
                sha256=hashlib.sha256(direct).hexdigest(),**status))
    report=dict(dateProductionCpp=True,newsProductionCpp=True,
        originalAdafruitGFX=True,originalGxEPD2BW=True,
        ArduinoJson=arduinojson,
        syntheticOfflineHeadlines=True,
        realBackend=False,otherModules=("Date","News"),
        realT7Transport=False,realSPI=False,physicalPanel=False,
        deployed=False,flashed=False,physicalReadabilityApproved=False,
        cases=records)
    (out/"manifest.json").write_text(
        json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps({"cases":len(records),"genuineOtherModule":"News",
        "zeroBitDifferences":all(x["dateThenNewsVsIndependentBits"]==0 and
                                 x["newsThenDateVsIndependentBits"]==0
                                 for x in records),
        "syntheticNewsFixture":True,"physicalPanel":False}))
    return report


if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--output",type=Path,required=True)
    generate(p.parse_args().output)
