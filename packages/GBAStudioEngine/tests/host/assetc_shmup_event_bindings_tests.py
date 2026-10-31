#!/usr/bin/env python3
"""Authored SHMUP timer/button bindings retain their indexed callback scripts."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools' / 'assetc'))
import assetc


class ShmupEventBindingsTests(unittest.TestCase):
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
