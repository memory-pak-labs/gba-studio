import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('assetc', Path(__file__).resolve().parents[2] / 'tools/assetc/assetc.py')
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)

class WorldMapHudExportTests(unittest.TestCase):
    def test_single_ink_hud_font_keeps_its_tiles_and_color(self):
        font = dict(tiles=[[0]*32 for _ in range(128)], foreground=9478)
        preset = dict(id='route', skin=None, font=font, config=assetc.hud_box_config_from_json({}))
        header = assetc.emit_shared_dialogue_ui_assets_header(None, None, None, None, assetc.dialogue_ui_from_json({}, 'ui'), assetc.hud_box_config_from_json({}), [preset], [], [dict(id='route', mode='advanced', components=[])])
        self.assertIn('0, &hud_preset_route_font_tiles[0][0], 9478, -1', header)

    def test_authored_labels_reach_the_native_project(self):
        project = dict(nodes=[dict(name='porto', x=79, y=224, connections=[])], hud_labels=dict(available='< Viajar    > Porto', journey='Travessia', locked='Rota bloqueada'))
        header = assetc.emit_world_map_project_data_header(project)
        self.assertIn('gbs::WorldMapHudLabels { "< Viajar    > Porto", "Travessia", "Rota bloqueada" }', header)

    def test_unconfigured_labels_use_the_existing_native_defaults(self):
        header = assetc.emit_world_map_project_data_header(dict(nodes=[dict(name='porto', connections=[])]))
        self.assertIn('gbs::WorldMapHudLabels { "A VIAJAR", "EM VOO", "BLOQUEADO" }', header)

if __name__ == '__main__': unittest.main()
