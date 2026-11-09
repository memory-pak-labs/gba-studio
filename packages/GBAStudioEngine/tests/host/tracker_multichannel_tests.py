#!/usr/bin/env python3
"""Author-generated tracker fixtures; no third-party music or assets."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

from tracker_multichannel_fixtures import write_mod, write_s3m

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("assetc", ROOT / "tools/assetc/assetc.py")
ASSETC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ASSETC)




class TrackerMultichannelTests(unittest.TestCase):
    def test_mod_preserves_8_and_16_independent_sample_channels(self):
        with tempfile.TemporaryDirectory() as directory:
            for channels in (8, 16):
                with self.subTest(channels=channels):
                    path = Path(directory) / "channels.mod"
                    write_mod(path, channels)
                    song = ASSETC.parse_mod_tracker(path)
                    steps = song["patterns"][0]["steps"]
                    self.assertEqual([step["channel"] for step in steps[:channels]], list(range(1, channels + 1)))
                    header = ASSETC.emit_audio_header("channels", {"tracker": [{"name": "song", "mod": path.name}]}, path.parent)
                    self.assertIn(f"{{ {channels},", header)
                    self.assertIn("_sample_assets, 16, true };" if channels == 16 else "_sample_assets, 8, true };", header)
                    self.assertTrue(all(step.get("sample_only") for step in steps[:channels]), "imported samples must not be doubled by PSG voices")

    def test_sparse_s3m_channels_do_not_collide_or_enable_disabled_tracks(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "channels.s3m"
            write_s3m(path, (0, 4, 8, 12, 16, 20, 24, 31), disabled=(7,))
            song = ASSETC.parse_s3m_tracker(path)
            steps = song["patterns"][0]["steps"]
            self.assertEqual([step["channel"] for step in steps[:8]], list(range(1, 9)))
            self.assertEqual(len(steps), 8)
            self.assertTrue(all(step.get("sample_only") for step in steps))
            ASSETC.emit_audio_header("channels", {"tracker": [{"name": "song", "s3m": path.name}]}, path.parent)

    def test_s3m_16_tracks_reach_generated_header(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "channels.s3m"
            write_s3m(path)
            song = ASSETC.parse_s3m_tracker(path)
            self.assertEqual([step["channel"] for step in song["patterns"][0]["steps"]], list(range(1, 17)))
            ASSETC.emit_audio_header("channels", {"tracker": [{"name": "song", "s3m": path.name}]}, path.parent)

    def test_notes_reuse_their_channel_instrument_above_four(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            mod = root / "memory.mod"
            write_mod(mod)
            data = bytearray(mod.read_bytes())
            offset = 1084 + (4 * 16 + 15) * 4
            data[offset:offset + 4] = bytes([1, 172, 0, 0])
            mod.write_bytes(data)
            song = ASSETC.parse_mod_tracker(mod)
            self.assertEqual(song["patterns"][0]["steps"][-1]["sample_index"], 0)
            self.assertTrue(song["patterns"][0]["steps"][-1]["sample_only"])
            s3m = root / "memory.s3m"
            write_s3m(s3m)
            data = bytearray(s3m.read_bytes())
            packed = data[0x102:0x142] + bytes(4) + bytes([0x6f, 0x46, 0, 32]) + bytes(60)
            import struct
            struct.pack_into("<H", data, 0x100, len(packed))
            data[0x102:0x102 + len(packed)] = packed
            s3m.write_bytes(data)
            song = ASSETC.parse_s3m_tracker(s3m)
            self.assertEqual(song["patterns"][0]["steps"][-1]["sample_index"], 0)
            self.assertTrue(song["patterns"][0]["steps"][-1]["sample_only"])

    def test_export_prepares_native_rate_samples_without_changing_pitch(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "channels.mod"
            write_mod(path)
            song = ASSETC.parse_mod_tracker(path)
            patterns, samples = ASSETC.prepare_multichannel_tracker_samples(song["patterns"], song["samples"])
            for original, prepared in zip(song["patterns"][0]["steps"], patterns[0]["steps"]):
                self.assertEqual(prepared["channel"], original["channel"])
                self.assertEqual(prepared["sample_rate_hz"], 31536)
                self.assertEqual(prepared["volume"], 15)
                sample = samples[prepared["sample_index"]]
                self.assertLessEqual(len(sample["samples"]), 65535)
                loop_size = sample["loop_end_sample"] - sample["loop_start_sample"]
                source = song["samples"][original["sample_index"]]
                source_size = source["loop_end_sample"] - source["loop_start_sample"]
                source_rate = original["sample_rate_hz"]
                cycles = round(loop_size * source_rate / (31536 * source_size))
                self.assertGreaterEqual(cycles, 1)
                self.assertAlmostEqual((31536 * cycles / loop_size) / (source_rate / source_size), 1, delta=0.0001)

    def test_prepared_gain_variant_is_exact_and_in_the_exported_descriptor(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "channels.mod"
            write_mod(path)
            song = ASSETC.parse_mod_tracker(path)
            patterns, samples = ASSETC.prepare_multichannel_tracker_samples(song["patterns"], song["samples"], 12)
            for sample in samples:
                self.assertEqual(sample["native_gain_primary_volume"], 12)
                self.assertEqual(sample["native_gain_samples"], [int(value * 12 / 15) for value in sample["samples"]])
            header = ASSETC.emit_audio_header("channels", {"tracker": [{"name": "song", "mod": path.name,
                "native_primary_volume": 12}]}, path.parent)
            self.assertIn("_native_gain", header)
            self.assertIn(", 12 }", header)
            with self.assertRaisesRegex(SystemExit, "native_primary_volume"):
                ASSETC.emit_audio_header("channels", {"tracker": [{"name": "song", "mod": path.name,
                    "native_primary_volume": 16}]}, path.parent)

    def test_over_budget_import_fails_instead_of_folding_channels(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_mod(root / "too_many.mod", 32)
            with self.assertRaisesRegex(SystemExit, "16 canais"):
                ASSETC.parse_mod_tracker(root / "too_many.mod")
            write_s3m(root / "too_many.s3m", tuple(range(17)))
            with self.assertRaisesRegex(SystemExit, "16 canais"):
                ASSETC.parse_s3m_tracker(root / "too_many.s3m")


if __name__ == "__main__":
    unittest.main()
