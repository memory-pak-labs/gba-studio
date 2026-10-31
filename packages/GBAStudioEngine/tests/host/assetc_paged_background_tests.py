import importlib.util
from pathlib import Path
import unittest
import re
spec = importlib.util.spec_from_file_location("assetc", Path(__file__).resolve().parents[2] / "tools/assetc/assetc.py")
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)
class PagedBackgroundTests(unittest.TestCase):
    def topdown(self):
        width, height = 126, 86
        room = dict(name='harbor', width_tiles=width, height_tiles=height,
                    visual_tiles=[0]*(width*height), collision_flags=[0]*(width*height),
                    visual_tilemap='harbor', visual_tilemap_layout='source_asset',
                    background_bits_per_pixel=8, paged_source_tiles='harbor')
        report = {'export_plan': {'headers': [dict(id='harbor', symbol='harbor', header='harbor.hpp',
                  assetc_args=['--paged-tilemap', '--background-bpp', '8'],
                  resources=dict(tilemap_width=width, tilemap_height=height, rom_source_bytes=3000*64),
                  derived=dict(tilemap_values=[i % 3000 for i in range(width*height)]))]}}
        return dict(rooms=[room]), report

    def test_topdown_accepts_a_paged_atlas_with_indices_above_hardware_tile_limit(self):
        project, report = self.topdown()
        header = assetc.emit_topdown_project_data_header(project, report)
        self.assertIn('&harbor_tile_asset', header)
        values = re.search(r'harbor_visual_tiles\[\] = \{(.*?)\};', header, re.S).group(1)
        self.assertEqual(max(map(int, re.findall(r'\d+', values))), 2999)

    def test_topdown_rejects_implicit_8bpp_and_nonpaged_sources(self):
        project, report = self.topdown()
        del project['rooms'][0]['paged_source_tiles']
        with self.assertRaisesRegex(SystemExit, 'paged_source_tiles'):
            assetc.emit_topdown_project_data_header(project, report)
        project, report = self.topdown()
        report['export_plan']['headers'][0]['assetc_args'] = ['--indexed-tilemap']
        with self.assertRaisesRegex(SystemExit, 'paged'):
            assetc.emit_topdown_project_data_header(project, report)

    def test_topdown_rejects_mismatched_source_geometry_or_binding(self):
        project, report = self.topdown()
        report['export_plan']['headers'][0]['resources']['tilemap_width'] = 60
        with self.assertRaisesRegex(SystemExit, 'dimensions'):
            assetc.emit_topdown_project_data_header(project, report)
        project, report = self.topdown()
        project['rooms'][0]['paged_source_tiles'] = 'other'
        with self.assertRaisesRegex(SystemExit, 'visual_tilemap'):
            assetc.emit_topdown_project_data_header(project, report)

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
