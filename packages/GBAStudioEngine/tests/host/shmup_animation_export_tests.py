import importlib.util
from pathlib import Path
import unittest
import tempfile
from PIL import Image

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

    def test_enemy_animation_preserves_streaming_and_authored_loop_mode(self):
        report = {'export_plan': {'headers': [{'id': 'drone', 'symbol': 'drone', 'kind': 'obj_sprite', 'assetc_args': ['--stream-frames']}]}}
        clip = {'asset': 'drone', 'frame_indices': [0, 1], 'durations': [6, 8], 'loops': True}
        output = []
        assetc.emit_shmup_enemies(output, {'enemies': [{'name': 'Drone', 'animation': clip}]}, 0, report)
        self.assertIn('&shmup_enemy_0_0_idle_animation', '\n'.join(output))
        self.assertIn('drone_frame_1_tile_asset', '\n'.join(output))
        clip['loops'] = False
        once = []
        assetc.emit_shmup_enemies(once, {'enemies': [{'animation': clip}]}, 0, report)
        self.assertIn('2, false', '\n'.join(once))
        with self.assertRaises(SystemExit):
            assetc.emit_shmup_enemies([], {'enemies': [{'animation': dict(clip, frame_indices=[])}]}, 0, report)

    def test_hud_font_preserves_foreground_shadow_and_alpha(self):
        with tempfile.TemporaryDirectory() as directory:
            image = Image.new('RGBA', (128, 112), (0, 0, 0, 0))
            image.putpixel((8, 16), (248, 240, 200, 255))
            image.putpixel((9, 17), (8, 24, 40, 255))
            image.save(Path(directory) / 'font.png')
            font = assetc.dialogue_font_from_json('font.png', Path(directory), 'hud.font', preserve_colors=True)
            self.assertEqual(font['foreground'], 26591)
            self.assertEqual(font['shadow'], 5217)
            self.assertEqual(font['tiles'][1][0] & 15, 4)
            self.assertEqual(font['tiles'][1][4] >> 4, 5)

    def test_empty_set_keeps_static_metasprite_supported(self):
        self.assertEqual(assetc.emit_shmup_player_animation_set([], {}, None), 'gbs::ShmupPlayerAnimationSet {}')

    def test_one_shots_cannot_loop_and_bad_state_is_rejected(self):
        for clips in ({'shoot': {'asset': 'ship', 'frame_indices': [0], 'loops': True}}, {'typo': {}}, []):
            with self.assertRaises(SystemExit):
                assetc.emit_shmup_player_animation_set([], {'animations': clips}, None)


if __name__ == '__main__':
    unittest.main()
