import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("assetc", Path(__file__).resolve().parents[2] / "tools/assetc/assetc.py")
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)


class EditorTilemapTests(unittest.TestCase):
    def remap(self, kind, tiles, layout="editor_tiles"):
        room = {"visual_tilemap": "floor", "visual_tilemap_layout": layout}
        with patch.object(assetc, "tilemap_values_from_asset_pack_entry", return_value=[0x1001, 0x2402, 0x3803]):
            if kind == "topdown":
                return assetc.remap_topdown_visual_tiles_from_asset(room, tiles, 0, {}, None)
            if kind == "foreground":
                return assetc.remap_topdown_foreground_tiles_from_asset(room, tiles, 0, {}, None)
            if kind == "platformer":
                return assetc.remap_platformer_visual_tiles_from_asset(room, tiles, 0, {}, None)
            return assetc.remap_platformer_layer_tiles_from_asset(
                {"tilemap": "floor", "tilemap_layout": layout}, tiles, 3, 1, 0, 0, {}, None)

    def test_editor_indices_preserve_empty_first_last_flip_and_palette_bits(self):
        for kind in ["topdown", "platformer", "layer", "foreground"]:
            with self.subTest(kind=kind):
                self.assertEqual(self.remap(kind, [0, 1, 2, 3]), [0, 0x1001, 0x2402, 0x3803])

    def test_existing_zero_based_contract_remains_unchanged(self):
        for kind in ["topdown", "platformer", "layer", "foreground"]:
            with self.subTest(kind=kind):
                self.assertEqual(self.remap(kind, [0, 1, 2], None), [0x1001, 0x2402, 0x3803])

    def test_editor_indices_reject_a_tile_outside_the_source(self):
        for kind in ["topdown", "platformer", "layer", "foreground"]:
            with self.subTest(kind=kind), self.assertRaises(SystemExit):
                self.remap(kind, [4])

    def test_empty_foreground_cells_do_not_reference_the_first_source_tile(self):
        self.assertEqual(self.remap("foreground", [-1, 0, 1]), [0, 0, 0x1001])

    def test_editor_room_uses_its_authored_tiles_instead_of_loading_the_source_map(self):
        room = {"name": "editable", "width_tiles": 30, "height_tiles": 20,
                "visual_tiles": [1] * 600, "collision_flags": [0] * 600,
                "visual_tilemap": "floor", "visual_tilemap_layout": "editor_tiles"}
        report = {"export_plan": {"headers": [{"id": "floor", "symbol": "floor", "header": "floor.hpp",
                  "derived": {"tilemap_values": [0x1001, 0x2402, 0x3803]}}]}}
        header = assetc.emit_topdown_project_data_header({"rooms": [room]}, report)
        self.assertIn("false,\n        &floor_tilemap_asset,", header)


if __name__ == "__main__":
    unittest.main()
