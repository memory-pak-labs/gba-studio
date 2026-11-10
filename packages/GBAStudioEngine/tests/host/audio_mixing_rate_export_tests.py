#!/usr/bin/env python3
"""Project output rate and dynamic requests remain separate from WAV conversion."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, os.environ.get("GBS_ASSETC_TEST_MODULE", str(ROOT / "tools" / "assetc")))
import assetc
from export_runtime_profile_tests import topdown_like_project


class MixingRateExportTests(unittest.TestCase):
    def test_invalid_initial_rate_does_not_modify_the_export_directory(self):
        with tempfile.TemporaryDirectory(prefix="gbs-invalid-mixing-") as temporary:
            base = Path(temporary)
            for rate in (16000, "21024", True, None, 0, -1):
                output = base / str(rate)
                project = {"kind": "topdown", "audio_mixing_rate": rate,
                           "template_dir": str(ROOT / "examples" / "topdown_basic" / "src"),
                           "topdown_project": topdown_like_project("mix")}
                with self.subTest(rate=rate):
                    with self.assertRaises(SystemExit):
                        assetc.emit_export_project(project, base, output)
                    self.assertFalse(output.exists())

    def test_event_rates_and_invalid_values(self):
        for rate in (10512, 21024, 31536):
            self.assertEqual(assetc.event_command_from_json({"op": "set_audio_mixing_rate", "rate": rate}, "test"),
                             ("SetAudioMixingRate", rate, 0, 0))
        for rate in (16000, "21024", True, None, 0, -1):
            with self.subTest(rate=rate), self.assertRaises(SystemExit):
                assetc.event_command_from_json({"op": "set_audio_mixing_rate", "rate": rate}, "test")

    def test_initial_rate_generates_linked_configuration_for_single_and_mixed_sources(self):
        with tempfile.TemporaryDirectory(prefix="gbs-mixing-export-") as temporary:
            base = Path(temporary)
            for rate in (10512, 21024, 31536):
                for sources in ([], ["main.cpp", "topdown_runtime.cpp", "menu_runtime.cpp"]):
                    with self.subTest(rate=rate, sources=sources):
                        output = base / f"{rate}-{len(sources)}"
                        project = {"schema": 1, "kind": "topdown", "backend": "gbastudio_engine",
                                   "template_dir": str(ROOT / "examples" / "topdown_basic" / "src"),
                                   "audio_mixing_rate": rate, "topdown_project": topdown_like_project("mix"),
                                   "build": {"sources": sources}}
                        assetc.emit_export_project(project, base, output)
                        build = json.loads((output / "gbastudio_project.json").read_text())["build"]
                        if rate == 31536:
                            self.assertNotIn("audio_config.cpp", build["sources"])
                        else:
                            self.assertEqual(build["sources"], (sources or ["main.cpp"]) + ["rumble_config.cpp", "audio_config.cpp"])
                            self.assertIn(f"return {rate};", (output / "audio_config.cpp").read_text())

    def test_every_native_adapter_consumes_the_request_once(self):
        files = list((ROOT / "templates").glob("*/main.cpp")) + list((ROOT / "examples").glob("*/src/main.cpp"))
        consumers = [p for p in files if "event_state.audio_volume_changed" in p.read_text()]
        self.assertEqual(len(consumers), 13)
        for path in consumers:
            with self.subTest(path=path):
                source = path.read_text()
                self.assertIn("gbs::set_audio_mixing_rate(static_cast<uint32_t>(event_state.audio_mixing_rate_hz))", source)
                self.assertIn("event_state.audio_mixing_rate_changed = false;", source)


if __name__ == "__main__":
    unittest.main()
