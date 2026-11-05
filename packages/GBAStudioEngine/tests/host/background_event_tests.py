import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("assetc_background_test", Path(__file__).resolve().parents[2] / "tools/assetc/assetc.py")
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)

class BackgroundEventTests(unittest.TestCase):
    def test_command_generates_native_opcode(self):
        self.assertEqual(assetc.event_command_from_json({"op": "set_background", "index": 2}, "test"), ("SetBackground", 2, 0, 0))

    def test_scale_preserves_target_axes_and_duration(self):
        self.assertEqual(assetc.event_command_from_json({"op":"set_actor_scale","actor":-1,"x":384,"y":192,"frames":12},"scale"), ("SetActorScale",-1,384,192,12))
        self.assertEqual(assetc.event_command_from_json({"op":"set_background_scale","actor":3,"x":512,"y":128,"frames":0},"scale"), ("SetBackgroundScale",3,512,128,0))
        for command in [{"op":"set_actor_scale","x":0}, {"op":"set_actor_scale","actor":96}, {"op":"set_background_scale","actor":0}, {"op":"set_background_scale","actor":2,"frames":32768}]:
            with self.assertRaises(ValueError): assetc.event_command_from_json(command,"scale")

    def test_missing_and_invalid_index_are_rejected(self):
        for index in [-1, 32768]:
            with self.assertRaises(SystemExit):
                assetc.event_command_from_json({"op": "set_background", "index": index}, "test")

if __name__ == "__main__":
    unittest.main()
