import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('cursor_assetc', Path(__file__).resolve().parents[2] / 'tools/assetc/assetc.py')
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)


class PointClickAnimationExportTests(unittest.TestCase):
    def project(self, loops=False):
        return {'scenes': [{'name': 'blank'}], 'cursor': {
            'metasprite': {'asset': 'hand', 'index': 0},
            'animations': [
                {'name': 'idle', 'asset': 'hand', 'frame_indices': [0], 'durations': [60], 'loops': False},
                {'name': 'click', 'asset': 'hand', 'frame_indices': [1, 2, 3, 4], 'durations': [5, 5, 5, 5], 'loops': loops}
            ]
        }}

    def report(self):
        return {'export_plan': {'headers': [{'id': 'hand', 'symbol': 'hand', 'kind': 'obj_sprite', 'assetc_args': ['--stream-frames']}]}}

    def test_emits_click_pointer_and_streamed_frames_with_authored_timing(self):
        header = assetc.emit_point_click_project_data_header(self.project(), self.report())
        self.assertIn('&point_click_cursor_click_animation,', header)
        for index in range(1, 5):
            self.assertIn(f'hand_metasprites[{index}], 5, &hand_frame_{index}_tile_asset', header)

    def test_rejects_looping_click(self):
        with self.assertRaises(SystemExit):
            assetc.emit_point_click_project_data_header(self.project(True), self.report())


if __name__ == '__main__':
    unittest.main()
