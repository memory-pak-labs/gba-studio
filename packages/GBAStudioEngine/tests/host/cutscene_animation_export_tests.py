import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('cutscene_assetc', Path(__file__).resolve().parents[2] / 'tools/assetc/assetc.py')
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)


class CutsceneAnimationExportTests(unittest.TestCase):
    def project(self, frame_index=7, actor_index=0):
        return {'scenes': [{'name': 'intro', 'actors': [{
            'name': 'cast', 'metasprite': {'asset': 'faces', 'index': 0},
            'animation': {'asset': 'faces'}, 'position': {'x': 64, 'y': 56}
        }], 'steps': [{'duration_frames': 6, 'actor_frames': [{
            'actor_index': actor_index, 'frame_index': frame_index
        }]}]}]}

    def report(self):
        return {'asset_reports': {'faces': {'resources': {'sprite_frames': 10}}},
                'export_plan': {'headers': [{'id': 'faces', 'symbol': 'faces', 'kind': 'obj_sprite', 'assetc_args': ['--stream-frames']}]}}

    def test_emits_timed_pose_and_full_streamed_sheet_reference(self):
        header = assetc.emit_cutscene_project_data_header(self.project(), self.report())
        self.assertIn('&faces_animation', header)
        self.assertIn('gbs::CutsceneActorFrameData { 0, 7 }', header)
        self.assertIn('cutscene_scene_0_step_0_actor_frames, 1', header)

    def test_rejects_missing_actor_or_negative_frame(self):
        for frame, actor in [(-1, 0), (0, 1), (256, 0)]:
            with self.subTest(frame=frame, actor=actor), self.assertRaises(SystemExit):
                assetc.emit_cutscene_project_data_header(self.project(frame, actor), self.report())

    def test_rejects_pose_past_exported_sheet(self):
        with self.assertRaises(SystemExit):
            assetc.emit_cutscene_project_data_header(self.project(10), self.report())


if __name__ == '__main__':
    unittest.main()
