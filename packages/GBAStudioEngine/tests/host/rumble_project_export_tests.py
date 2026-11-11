import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/assetc"))
import assetc
from export_runtime_profile_tests import topdown_like_project

class RumbleProjectExportTests(unittest.TestCase):
    def project(self, profile):
        return {"kind": "topdown", "rumble_cartridge": profile,
                "template_dir": str(ROOT / "examples/topdown_basic/src"),
                "topdown_project": topdown_like_project("rumble")}

    def test_unknown_profiles_fail_before_writing(self):
        with tempfile.TemporaryDirectory(prefix="gba-rumble-export-") as temp:
            root = Path(temp)
            for profile in (True, 1, None, "unknown"):
                with self.subTest(profile=profile), self.assertRaises(SystemExit):
                    assetc.emit_export_project(self.project(profile), root, root / "export")
                self.assertFalse((root / "export").exists())

    def test_disabling_overwrites_the_previously_generated_driver_hook(self):
        with tempfile.TemporaryDirectory(prefix="gba-rumble-export-") as temp:
            root = Path(temp); output = root / "export"
            for profile in ("chisflash_v1_2", "none"):
                assetc.emit_export_project(self.project(profile), root, output)
                manifest = json.loads((output / "gbastudio_project.json").read_text())
                self.assertIn("rumble_config.cpp", manifest["build"]["sources"])
                config = (output / "rumble_config.cpp").read_text()
                self.assertIn("gbs_project_configure_rumble", config)
                self.assertEqual("ChisFlashV12" in config, profile == "chisflash_v1_2")

if __name__ == "__main__":
    unittest.main()
