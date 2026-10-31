"""Compile the actual Shoot 'em Up runtime in standalone and mixed modes."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
devkitarm = os.environ.get("DEVKITARM")
compiler = Path(devkitarm) / "bin" / ("arm-none-eabi-g++.exe" if os.name == "nt" else "arm-none-eabi-g++") if devkitarm else shutil.which("arm-none-eabi-g++")
if not compiler or not Path(compiler).is_file():
    raise SystemExit("arm-none-eabi-g++ is required for the Shoot 'em Up compile regression")

with tempfile.TemporaryDirectory(prefix="gbs-shmup-compile-") as temporary:
    tmp = Path(temporary)
    (tmp / "mixed_project_data.hpp").write_text("#pragma once\n")
    common = [str(compiler), "-mthumb", "-mthumb-interwork", "-mcpu=arm7tdmi", "-mtune=arm7tdmi",
              "-Os", "-ffreestanding", "-fdata-sections", "-ffunction-sections", "-std=c++17",
              "-fno-exceptions", "-fno-rtti", "-fno-threadsafe-statics", f"-I{tmp}",
              "-Iengine/include", "-Iengine/src"]
    for mode in ("standalone", "mixed"):
        flags = ["-DGBS_MULTI_RUNTIME=1"] if mode == "mixed" else []
        subprocess.run(common + flags + ["-c", "templates/exported_shmup/main.cpp", "-o", str(tmp / f"{mode}.o")],
                       cwd=root, check=True)
        print(f"Shoot 'em Up {mode}: ARM compilation PASS")
