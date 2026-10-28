#!/usr/bin/env python3
"""Audit every Date slot from the mixed-grid gallery against *actual* C++.

The JS/SVG planner is merely a design prediction. Compare its acceptance
decision to the true ModuleDate::render + compiled editorial gate. Never
mistake a fallback for an editorial drawing or an empty neighbor for a
captured other module. This host buffer is NOT GxEPD2 or a panel photo.
"""
from __future__ import annotations
import argparse
import json
import tempfile
from pathlib import Path

from generate_date_native_painter_capture import compile_native, capture
from generate_date_mixed_layout_review import scenarios, validate_cells, plans


def generate(output:Path):
    scenes=scenarios()
    for scene in scenes:
        validate_cells(scene["cells"])
    projected=plans(scenes)
    records=[]
    with tempfile.TemporaryDirectory(prefix="date_mixed_native_") as folder:
        folder=Path(folder)
        executable=compile_native(folder/"date_native")
        for si,scene in enumerate(scenes):
            for ci,cell in enumerate(scene["cells"]):
                if cell["module"]!="date":
                    continue
                facts=scene["facts"]
                item=dict(
                    name=scene["name"],year=facts["year"],
                    month0=facts["month0"],day=facts["day"],
                    x=cell["x"],y=cell["y"],w=cell["w"],h=cell["h"],
                    dark=int(scene["theme"].lower()=="dark"),
                    holiday=int(bool(facts.get("holidays"))))
                native=capture(executable,item,folder/f"{si}_{ci}.pgm")
                predicted=bool(projected[si,ci]["accepted"])
                admitted=bool(native["admitted"])
                assert not admitted or (
                    native["inkInside"]>=300 and native["inkOutside"]==0
                    and native["inkOutsideMatte"]==0 and native["outOfBounds"]==0
                ),(scene["name"],cell,native)
                records.append(dict(
                    scenario=scene["name"],slot=ci,
                    cell={k:cell[k] for k in ("x","y","w","h")},
                    theme=scene["theme"],
                    sourceSvgPlanAccepted=predicted,
                    nativeCppEditorialAdmitted=admitted,
                    acceptanceDiffers=predicted!=admitted,
                    nativePixelHash=native["hash"],
                    nativeInk=native["inkInside"],
                    nativeOutOfCell=native["inkOutside"],
                    nativeOutOfMatte=native["inkOutsideMatte"],
                    nativeOutOfPanelAttempts=native["outOfBounds"],
                    nativePreflight=native["preflight"]))
    discrepancies=[dict(scenario=r["scenario"],slot=r["slot"],
                        sourceSvgPlanAccepted=r["sourceSvgPlanAccepted"],
                        nativeCppEditorialAdmitted=r["nativeCppEditorialAdmitted"],
                        nativePreflight=r["nativePreflight"])
                   for r in records if r["acceptanceDiffers"]]
    summary=dict(
        proof="host-1bit-unflashed",nativeSource="frame/src/modules/ModuleDate.cpp",
        actualGxEPD2Buffer=False,otherModuleRenderersCaptured=False,
        simulatorIsPixelOracle=False,flashed=False,
        sceneCount=len(scenes),dateSlotCount=len(records),
        nativeEditorialAdmissions=sum(r["nativeCppEditorialAdmitted"] for r in records),
        admissionDifferences=discrepancies,
        cases=records)
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(summary,indent=2,ensure_ascii=False)+"\n",
                      encoding="utf-8")
    return summary


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    report=generate(args.output)
    print(json.dumps({k:report[k] for k in (
        "sceneCount","dateSlotCount","nativeEditorialAdmissions",
        "admissionDifferences")},ensure_ascii=False))
