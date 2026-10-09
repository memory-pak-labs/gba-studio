import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('shmup_animation_assetc', Path(__file__).resolve().parents[2] / 'tools/assetc/assetc.py')
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)


class ShmupAnimationExportTests(unittest.TestCase):
    def test_exports_every_action_with_timing_and_streamed_frames(self):
        report = {'export_plan': {'headers': [{'id': 'ship', 'symbol': 'ship', 'kind': 'obj_sprite', 'assetc_args': ['--stream-frames']}]}}
        output = []
        actions = ('idle', 'fly', 'bank_up', 'bank_down', 'shoot', 'hurt', 'explosion')
        clips = {action: {'asset': 'ship', 'frame_indices': [index], 'durations': [index + 2], 'loops': action in ('fly', 'bank_up', 'bank_down')}
                 for index, action in enumerate(actions)}
        expression = assetc.emit_shmup_player_animation_set(output, {'animations': clips}, report)
        self.assertIn('gbs::ShmupPlayerAnimationSet', expression)
        for index, action in enumerate(actions):
            self.assertIn('&shmup_player_' + action + '_animation', expression)
            self.assertIn(f'ship_metasprites[{index}], {index + 2}, &ship_frame_{index}_tile_asset', '\n'.join(output))

    def test_empty_set_keeps_static_metasprite_supported(self):
        self.assertEqual(assetc.emit_shmup_player_animation_set([], {}, None), 'gbs::ShmupPlayerAnimationSet {}')

    def test_one_shots_cannot_loop_and_bad_state_is_rejected(self):
        for clips in ({'shoot': {'asset': 'ship', 'frame_indices': [0], 'loops': True}}, {'typo': {}}, []):
            with self.assertRaises(SystemExit):
                assetc.emit_shmup_player_animation_set([], {'animations': clips}, None)


if __name__ == '__main__':
    unittest.main()
