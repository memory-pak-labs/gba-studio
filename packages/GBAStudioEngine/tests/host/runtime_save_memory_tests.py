"""Check the actual ARM object layout of persistent runtime save buffers."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class RuntimeSaveMemoryTest(unittest.TestCase):
    def test_save_resume_buffers_leave_fast_ram_without_changing_capacity(self):
        arm = Path(os.environ.get("DEVKITARM", "/opt/devkitpro/devkitARM")) / "bin"
        with tempfile.TemporaryDirectory(prefix="gbs-save-memory-") as directory:
            obj = Path(directory) / "save.o"
            subprocess.run([str(arm / "arm-none-eabi-g++"), "-mthumb", "-mcpu=arm7tdmi",
                            "-Os", "-std=c++17", "-fno-exceptions", "-fno-rtti", "-ffreestanding",
                            "-I" + str(ROOT / "engine/include"), "-c",
                            str(ROOT / "engine/src/gbs_runtime_save_restore.cpp"), "-o", str(obj)], check=True)
            symbols = subprocess.check_output([str(arm / "arm-none-eabi-objdump"), "-t", "-C", str(obj)], text=True)
            for name, size in [("suspended_save", 1112), ("suspended_transient", 1024)]:
                line = next(line for line in symbols.splitlines() if line.endswith("::" + name))
                self.assertIn(".ewram_bss", line)
                self.assertEqual(int(line.split()[4], 16), size)


if __name__ == "__main__":
    unittest.main()
