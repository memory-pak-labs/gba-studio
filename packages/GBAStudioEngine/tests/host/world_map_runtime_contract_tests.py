#!/usr/bin/env python3
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORLD_MAP_RUNTIME = ROOT / "templates" / "exported_world_map" / "main.cpp"


def function_body(source: str, name: str) -> str:
    start = source.index(f"{name}(")
    opening = source.index("{", start)
    depth = 0
    for index in range(opening, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[opening : index + 1]
    raise AssertionError(f"corpo incompleto para {name}")


class WorldMapRuntimeContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = WORLD_MAP_RUNTIME.read_text(encoding="utf-8")

    def test_world_map_enables_the_authored_background_layer_after_loading(self) -> None:
        body = function_body(self.source, "apply_background")

        tilemap_load = "gbs::load_tilemap(background->layer, background->tilemap);"
        layer_enable = "gbs::set_bg_enabled(background->layer, true);"

        self.assertIn(tilemap_load, body)
        self.assertIn(layer_enable, body)
        self.assertLess(body.index(tilemap_load), body.index(layer_enable))


if __name__ == "__main__":
    unittest.main()
