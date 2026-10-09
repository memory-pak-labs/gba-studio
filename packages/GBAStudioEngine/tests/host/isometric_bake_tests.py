import importlib.util
from pathlib import Path
import unittest
import tempfile

spec = importlib.util.spec_from_file_location('assetc', Path(__file__).resolve().parents[2] / 'tools/assetc/assetc.py')
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)

class IsometricBakeTests(unittest.TestCase):
    def test_rejects_zoom_that_regular_backgrounds_cannot_render(self):
        room = {'width_tiles':1,'height_tiles':1,'visual_tiles':[1],
                'grid':{'tile_width_pixels':8,'tile_height_pixels':8},
                'camera':{'zoom_x256':512}}
        with self.assertRaisesRegex(SystemExit, 'zoom'):
            assetc.bake_indexed_isometric(room, bytes(32), [1], 1, 1)

    def test_native_emission_preserves_source_palette(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pixels = [(index * 8, 0, 0, 255) for index in range(32)] * 2
            assetc.write_rgba_png(root / 'source.png', 8, 8, pixels)
            (root / 'source.hpp').write_text('unused 4bpp source')
            output = []
            room = {'tileset': 'source', 'width_tiles': 1, 'height_tiles': 1,
                    'visual_tiles': [1], 'tileset_render_offset_y_pixels': -8,
                    'grid': {'tile_width_pixels': 8, 'tile_height_pixels': 8}}
            assetc.emit_baked_isometric_reference(output, 'room', room,
                {'asset_reports': {'source': {}}}, root,
                [{'name': 'source', 'png': 'source.png'}], root)
            self.assertIn('room_baked_palette_colors[] = {0,' + ','.join(map(str, range(32))) + '};', '\n'.join(output))
            self.assertIn('room_baked_palette_colors, 33, 0', '\n'.join(output))

    def test_indexed_source_keeps_more_than_fifteen_colors_in_one_tile(self):
        room = {'width_tiles': 1, 'height_tiles': 1, 'visual_tiles': [1],
                'grid': {'tile_width_pixels': 8, 'tile_height_pixels': 8, 'origin': {'x': 4, 'y': 0}}}
        source = bytes(range(64))
        baked = assetc.bake_indexed_isometric(room, source, [0], 1, 0, bits_per_pixel=8)
        self.assertEqual(baked['tiles'][1], source)

    def test_preserves_palette_bank_and_transparency(self):
        room = {'width_tiles': 1, 'height_tiles': 1, 'visual_tiles': [1],
                'grid': {'tile_width_pixels': 8, 'tile_height_pixels': 8, 'origin': {'x': 4, 'y': 0}},
                'tileset_render_width_pixels': 8, 'tileset_render_height_pixels': 8}
        baked = assetc.bake_indexed_isometric(room, bytes([0x21] * 32), [0x3001], 1, 1)
        self.assertEqual(baked['tiles'][1][:4], bytes([0x31, 0x32, 0x31, 0x32]))
        self.assertEqual(baked['background'][0], 1)
        self.assertEqual(baked['foreground'][0], 0)

    def test_deduplicates_both_layers_and_keeps_anchor(self):
        room = {'width_tiles': 1, 'height_tiles': 1, 'visual_tiles': [1],
                'background_layers': {'bg1': [1]},
                'grid': {'tile_width_pixels': 8, 'tile_height_pixels': 8, 'origin': {'x': 4, 'y': 8}},
                'tileset_render_width_pixels': 8, 'tileset_render_height_pixels': 8,
                'tileset_render_offset_y_pixels': -8}
        baked = assetc.bake_indexed_isometric(room, bytes([0x10] * 32), [0x0401], 1, 1)
        self.assertEqual(len(baked['tiles']), 2)
        self.assertEqual(baked['background'], baked['foreground'])
        self.assertEqual(baked['y'], 0)
        self.assertEqual(baked['tiles'][1][:4], bytes([1, 0, 1, 0]))

if __name__ == '__main__': unittest.main()
