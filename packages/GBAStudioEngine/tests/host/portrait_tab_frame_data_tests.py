import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("portrait_tab_frames", ROOT / "tools/generate_portrait_tab_frames.py")
frames = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frames)


class PortraitTabFrameData(unittest.TestCase):
    def test_shipped_interface_tiles_are_reproducible_without_portraits_or_text(self):
        self.assertEqual(frames.generate(), (ROOT / "engine/include/gbs/portrait_tab_frame_data.h").read_text())
        for mode in range(3):
            for letters in range(20):
                tiles = frames.frame(mode, letters)
                self.assertEqual(len(tiles), 384 * 32)
                self.assertTrue(all((byte & 15) <= 5 and (byte >> 4) <= 5 for byte in tiles))


if __name__ == "__main__":
    unittest.main()
