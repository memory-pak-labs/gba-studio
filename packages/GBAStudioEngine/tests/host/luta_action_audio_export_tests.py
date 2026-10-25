import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('luta_assetc', Path(__file__).resolve().parents[2] / 'tools/assetc/assetc.py')
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)

class LutaActionAudioExportTests(unittest.TestCase):
    def project(self):
        return {'assets': {'sfx_assets': ['hit', 'guard', 'special', 'miss']}, 'stages': [{
            'name': 'arena', 'player1': [{'name': 'p1'}], 'player2': [{'name': 'p2'}],
            'action_sounds': {'hit': 0, 'guard': 1, 'special': 2, 'miss': 3}}]}

    def test_binds_all_four_distinct_sfx(self):
        self.assertIn('gbs::LutaActionSounds { 0, 1, 2, 3 }', assetc.emit_luta_project_data_header(self.project()))

    def test_absent_sounds_are_silent(self):
        project = self.project()
        del project['stages'][0]['action_sounds']
        self.assertIn('gbs::LutaActionSounds { -1, -1, -1, -1 }', assetc.emit_luta_project_data_header(project))

    def test_keeps_authored_button_script_table_in_native_project(self):
        project = self.project()
        project['scripts'] = [{'name': 'leave_training', 'script': [
            {'op': 'set_variable', 'variable': 62, 'value': 0}]}]
        project['stages'][0]['on_enter'] = [
            {'op': 'attach_button_event', 'button': 'select', 'index': 0, 'override': True}]
        header = assetc.emit_luta_project_data_header(project)
        self.assertIn('constexpr gbs::EventScript luta_project_scripts[]', header)
        self.assertIn('gbs::EventOp::AttachButtonEvent', header)
        self.assertIn('gbs::EventOp::SetVariable', header)
        self.assertIn('    luta_project_scripts,\n    1\n};', header)
        project['scripts'] = 'invalid'
        with self.assertRaises(SystemExit): assetc.emit_luta_project_data_header(project)

    def test_rejects_missing_asset_unknown_cue_and_out_of_range(self):
        for sounds in [{'hit': -1}, {'hit': 4}, {'walking': 0}]:
            project = self.project()
            project['stages'][0]['action_sounds'] = sounds
            with self.assertRaises(SystemExit): assetc.emit_luta_project_data_header(project)

    def test_four_dynamic_bars_fit_the_runtime_contract(self):
        component = {'id':'gauge','kind':'bar','asset':'full','x':0,'y':0,'width':8,'height':8,
                     'z_index':0,'visible':True,'label':'','text':'','value_binding':'p1-super',
                     'gauge':{'empty_asset':'empty','x':0,'y':0,'width':8,'height':8}}
        components = [dict(component,id=str(n)) for n in range(4)]
        layouts = [{'id':'fight','mode':'advanced','components':components}]
        self.assertEqual(len(assetc.hud_layouts_from_json(layouts,'hud')[0]['components']),4)
        components.append(dict(component,id='fifth'))
        with self.assertRaises(SystemExit): assetc.hud_layouts_from_json(layouts,'hud')

if __name__ == '__main__': unittest.main()
