import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('assetc_actor_condition_test', Path(__file__).resolve().parents[2] / 'tools/assetc/assetc.py')
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)

class ActorLocationTests(unittest.TestCase):
    def test_large_scene_coordinates_and_legacy_low_bits(self):
        for x, y in [(4, 3), (101, 9), (160, 15), (255, 255)]:
            packed = assetc.event_actor_tile_location({'x': x, 'y': y}) & 0xffff
            self.assertEqual((packed & 63) | ((packed >> 6) & 192), x)
            self.assertEqual(((packed >> 6) & 63) | ((packed >> 8) & 192), y)
        self.assertEqual(assetc.event_actor_tile_location({'x': 4, 'y': 3}), 196)

if __name__ == '__main__':
    unittest.main()
