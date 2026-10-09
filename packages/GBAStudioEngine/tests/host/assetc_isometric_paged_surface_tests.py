"""Authored adventure BGs remain ROM sources; only the viewport is resident."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('assetc', Path(__file__).resolve().parents[2] / 'tools/assetc/assetc.py')
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)

class IsometricPagedSurfaceTests(unittest.TestCase):
    def test_palette_owner_invalidates_cached_resource_accounting(self):
        background = {'kind': 'paged_bg', 'png': 'surface.png'}
        foreground = dict(background, paged_palette_owner='market_surface')
        self.assertNotEqual(assetc.pack_asset_resource_config_fingerprint(background),
                            assetc.pack_asset_resource_config_fingerprint(foreground))

    def source(self, count, palette):
        return dict(width=64, height=43, palette=palette, tiles=[bytes([i % len(palette)] * 64) for i in range(count)], entries=[i % count for i in range(64*43)])

    def test_large_background_and_transparent_foreground_preserve_color_indices(self):
        back, front = self.source(1515, [0x1234, 0x5678]), self.source(66, [0, 0x4321, 0x7654])
        result = assetc.compose_isometric_paged_surface(back, front)
        self.assertEqual(result['palette'], [0, 0x1234, 0x5678, 0x4321, 0x7654])
        self.assertEqual(result['foreground_first_tile'], 1515)
        self.assertEqual(len(result['tiles']), 1581)
        self.assertEqual(result['background'], back['entries'])
        self.assertEqual(result['foreground'][1], 1516)
        self.assertEqual(result['tiles'][1515], bytes(64))
        self.assertEqual(result['tiles'][1516], bytes([3] * 64))
        for tile in range(1515):
            self.assertNotIn(0, result['tiles'][tile])
            self.assertEqual([result['palette'][p] for p in result['tiles'][tile]],
                             [back['palette'][p] for p in back['tiles'][tile]])

    def test_rejects_resident_foreground_overflow_and_palette_collision_with_ui(self):
        with self.assertRaisesRegex(SystemExit, 'foreground'):
            assetc.compose_isometric_paged_surface(self.source(1515,[0,1]),self.source(118,[0,2]))
        with self.assertRaisesRegex(SystemExit, 'palette'):
            assetc.compose_isometric_paged_surface(self.source(1515,list(range(224))),self.source(66,[0,300]))

    def test_rejects_mismatched_dimensions_and_invalid_rom_indices(self):
        back, front = self.source(1515,[0,1]),self.source(66,[0,2])
        front['width']=32
        with self.assertRaisesRegex(SystemExit, 'dimensions'):
            assetc.compose_isometric_paged_surface(back,front)
        front['width']=64;back['entries'][0]=65535
        with self.assertRaisesRegex(SystemExit, 'index'):
            assetc.compose_isometric_paged_surface(back,front)

if __name__ == '__main__': unittest.main()
