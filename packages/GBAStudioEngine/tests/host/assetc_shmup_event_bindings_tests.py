#!/usr/bin/env python3
"""Authored SHMUP timer/button bindings retain their indexed callback scripts."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools' / 'assetc'))
import assetc


class ShmupEventBindingsTests(unittest.TestCase):
    def test_room_damage_hook_chains_after_contact_and_projectile_hooks(self):
        header = assetc.emit_shmup_project_data_header({
            'enemy_projectile': {'on_hit_player': [{'op': 'wait', 'frames': 2}]},
            'waves': [{'name': 'wind', 'on_hit_player': [{'op': 'rumble_on_for', 'frames': 12}],
                       'enemies': [{'on_hit_player': [{'op': 'end'}, {'op': 'set_variable', 'variable': 0, 'value': 99}]}]},
                      {'name': 'quiet', 'enemies': []}]
        })
        self.assertIn('shmup_wave_0_projectile_on_hit_player_commands', header)
        contact = header.split('shmup_wave_0_enemy_0_on_hit_player_commands[] = {')[1].split('};')[0]
        self.assertIn('EventOp::Jump, 2, 0, 0', contact)
        self.assertIn('EventOp::RumbleOnFor, 12, 0, 0', contact)
        projectile = header.split('shmup_wave_0_projectile_on_hit_player_commands[] = {')[1].split('};')[0]
        self.assertLess(projectile.index('EventOp::Wait'), projectile.index('EventOp::RumbleOnFor'))
        self.assertNotIn('shmup_wave_1_projectile_on_hit_player_commands', header)

    def test_indexed_timer_callback_is_exported_including_empty_slots(self):
        header = assetc.emit_shmup_project_data_header({
            'waves': [{'name': 'wind', 'enemies': [], 'on_start': [
                {'op': 'attach_timer_event', 'frames': 6, 'index': 1}]}],
            'scripts': [{'name': 'other_scene', 'script': []},
                        {'name': 'wind_tick', 'script': [
                            {'op': 'move_actor', 'actor': -1, 'x': 0, 'y': 1}]}]
        })
        self.assertIn('gbs::EventOp::MoveActor, -1, 0, 1', header)
        self.assertIn('constexpr gbs::EventScript shmup_project_scripts[]', header)
        self.assertIn('gbs::empty_event_script(),', header)
        self.assertIn('    shmup_project_scripts,\n    2,', header)

    def test_projects_without_callbacks_keep_a_null_script_table(self):
        header = assetc.emit_shmup_project_data_header({'waves': [{'enemies': []}]})
        self.assertNotIn('constexpr gbs::EventScript shmup_project_scripts[]', header)
        self.assertIn('    nullptr,\n    0,', header)


if __name__ == '__main__':
    unittest.main()
