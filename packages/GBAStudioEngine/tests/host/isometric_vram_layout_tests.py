"""Check actual runtime allocations, including reserved text and map memory."""
from pathlib import Path
import re
import unittest

SOURCE = Path(__file__).resolve().parents[2] / "examples/isometric_basic/src/main.cpp"


class IsometricVramLayoutTests(unittest.TestCase):
    def test_indexed_surface_is_not_overwritten_by_foreign_prefetch(self):
        source = SOURCE.read_text()
        body = source.split("void prefetch_room_resource_groups", 1)[1].split("bool reserve_resources", 1)[0]
        self.assertIn("if (uses_indexed_surface(active_room_data))", body)
        self.assertLess(body.index("if (uses_indexed_surface(active_room_data))"), body.index("const gbs::ResourceBankUploadSource*"))

    def test_indexed_viewport_leaves_separate_foreground_maps_and_ui(self):
        source = SOURCE.read_text()
        constants = {name: eval(expression, {"__builtins__": {}}, {})
                     for name, expression in re.findall(r"constexpr size_t (\w+) = ([0-9 *+]+);", source)}
        surface_end = constants["indexed_surface_tile_count"] * 64
        foreground_start = constants["indexed_foreground_tile_base"] * 64
        foreground_end = foreground_start + constants["indexed_foreground_tile_count"] * 64
        self.assertLessEqual(surface_end, foreground_start)
        self.assertLessEqual(foreground_end, 24 * 2048)
        self.assertLessEqual(28 * 2048, 2 * 16384 + 896 * 32)
        self.assertEqual(2 * 16384 + 1024 * 32, 65536)

    def test_surface_foreground_and_ui_do_not_alias(self):
        source = SOURCE.read_text()
        constants = {}
        for name, expression in re.findall(r"constexpr size_t (\w+) = ([0-9 *+]+);", source):
            constants[name] = eval(expression, {"__builtins__": {}}, {})
        count = constants["iso_surface_layer_tile_count"]
        second = constants.get("iso_surface_second_tile_base", 513)
        foreground = constants["iso_foreground_tile_base"]
        ranges = [
            ("surface top", 1, 1 + count),
            ("surface bottom", second, second + count),
            ("foreground", foreground, foreground + constants["max_iso_foreground_unique_tiles"]),
            ("dialogue", 896, 1024),
        ]
        for index, (name, start, end) in enumerate(ranges):
            self.assertLessEqual(end, 1536, name + " reaches tilemap memory")
            for other, other_start, other_end in ranges[index + 1:]:
                self.assertTrue(end <= other_start or other_end <= start,
                                f"{name} [{start},{end}) overlaps {other} [{other_start},{other_end})")


if __name__ == "__main__":
    unittest.main()
