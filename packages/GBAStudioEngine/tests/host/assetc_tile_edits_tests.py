import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("assetc", Path(__file__).resolve().parents[2] / "tools/assetc/assetc.py")
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)


class TileEditsExportTests(unittest.TestCase):
    def test_public_pack_contract_declares_visibility_and_saved_map_restore(self):
        root = Path(__file__).resolve().parents[2]
        schema = json.loads((root / "schemas/export_project.schema.json").read_text())
        commands = schema["properties"]["topdown_project"]["properties"]["event_command"]
        self.assertIn("visibility", commands["properties"]["op"]["enum"])
        for runtime in ("topdown", "platformer"):
            room = schema["properties"][runtime + "_project"]["properties"]["rooms"]["items"]
            self.assertEqual(room["properties"]["on_restore"], room["properties"]["on_enter"])
        pack = json.loads((root / "enginepack.json").read_text())
        self.assertIn("visibility", pack["capabilities"]["events"])

    def test_large_room_coordinates_and_explicit_free_collision_round_trip(self):
        op, location, tile, count, options = assetc.event_command_from_json(
            {"op": "replace_tile", "x": 125, "y": 85, "tile": 6000, "layer": "bg2", "collision_flags": 0}, "edit")
        self.assertEqual((op, tile, count), ("ReplaceTile", 6000, 1))
        self.assertEqual((location & 63) | (((options >> 9) & 7) << 6), 125)
        self.assertEqual(((location >> 6) & 63) | (((options >> 12) & 7) << 6), 85)
        self.assertEqual((options & 511) - 1, 0)

    def test_omission_preserves_collision_and_animation_carries_options(self):
        plain = assetc.event_command_from_json({"op": "replace_tile", "x": 4, "y": 6}, "edit")
        self.assertEqual(plain, ("ReplaceTile", (6 << 6) | 4, 0, 1))
        animated = assetc.event_command_from_json({"op": "replace_tile_sequence", "x": 125, "y": 85,
            "frames": 3, "variable": 2, "collision_flags": 32}, "animation")
        self.assertEqual(animated[3], (3 << 8) | 2)
        self.assertEqual((animated[4] & 511) - 1, 32)

    def test_map_state_restore_script_is_retained_in_both_room_contracts(self):
        for runtime in ("topdown", "platformer"):
            with self.subTest(runtime=runtime):
                room = {"name": "door", "width_tiles": 30, "height_tiles": 20,
                    "visual_tiles": [1] * 600, "collision_flags": [0] * 600,
                    "on_restore": [{"op": "replace_tile", "x": 4, "y": 6, "tile": 17,
                                    "collision_flags": 0, "layer": "bg2"}]}
                emit = getattr(assetc, "emit_" + runtime + "_project_data_header")
                header = emit({"rooms": [room]})
                self.assertIn("door_on_restore_commands", header)
                self.assertIn("EventOp::ReplaceTile", header)

    def test_visibility_encodes_actor_area_intensity_and_duration(self):
        command = {"op": "visibility", "effect": "lantern", "actor": -1,
                   "width": 80, "height": 64, "intensity": 75, "frames": 180}
        self.assertEqual(assetc.event_command_from_json(command, "lantern"), ("Visibility", -1, (80 << 8) | 64, 180, 75))
        self.assertEqual(assetc.event_command_from_json({**command, "effect": "reveal"}, "reveal")[-1], 128 | 75)
        for invalid in ({"width": 241}, {"height": 0}, {"intensity": 101}, {"frames": -1}, {"actor": 96}):
            with self.subTest(invalid=invalid), self.assertRaises(SystemExit):
                assetc.event_command_from_json({**command, **invalid}, "lantern")

    def test_invalid_coordinates_and_collision_are_rejected(self):
        for bad in ({"x": -1}, {"x": 512}, {"y": -1}, {"y": 512},
                    {"collision_flags": 256}, {"layer": "bg1", "collision_flags": 0}):
            with self.subTest(bad=bad), self.assertRaises(SystemExit):
                assetc.event_command_from_json({"op": "replace_tile", **bad}, "edit")


if __name__ == "__main__":
    unittest.main()
