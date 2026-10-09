import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location("assetc", Path(__file__).resolve().parents[2] / "tools/assetc/assetc.py")
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)
class PagedBackgroundTests(unittest.TestCase):
    def test_paged_source_keeps_more_than_1024_tiles_in_rom(self):
        indices = [0] * (480 * 320)
        for tile in range(2400):
            x,y = (tile % 60)*8, (tile // 60)*8
            indices[y*480+x] = tile & 255
            indices[y*480+x+1] = tile >> 8
        with self.assertRaises(SystemExit):
            assetc.build_indexed_background_tiles(480,320,indices)
        tiles, entries, width, height = assetc.build_indexed_background_tiles(480,320,indices, max_source_tiles=65535)
        self.assertEqual((len(tiles),max(entries),width,height), (2400,2399,60,40))
    def test_paged_kind_is_explicit(self):
        self.assertEqual(assetc.pack_asset_kind({"kind":"paged_bg"}), "paged_bg")
if __name__ == "__main__": unittest.main()
