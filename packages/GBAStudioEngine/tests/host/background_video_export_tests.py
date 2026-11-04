"""Scene-owned video must survive assetc, including its scoped asset include."""
import importlib.util
import json
from pathlib import Path
import unittest

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('assetc_background_video', root/'tools/assetc/assetc.py')
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)
profiles = [('menu','screens'), ('cutscene','scenes'), ('visual_novel','scenes'),
            ('point_click','scenes'), ('world_map',None), ('battle_rpg','encounters'), ('luta','stages')]
video = {'display_mode':1, 'affine':{'layer':'bg2','asset':'qa_affine', 'pa':384, 'pd':512}}

class BackgroundVideoExportTests(unittest.TestCase):
    def test_every_generator_retains_the_scene_video(self):
        for kind, rows in profiles:
            with self.subTest(kind=kind):
                if kind == 'battle_rpg':
                    project = json.loads((root/'tests/fixtures/export_battle_rpg_project.json').read_text())['battle_rpg_project']
                elif rows:
                    project = {rows:[{'name':'scene', 'steps':[{'frames':1}], 'screen_type':'logo', 'player1':[{}], 'player2':[{}], 'characters':[{}]}]}
                else:
                    project = {'nodes':[{'name':'start','position':{'x':0,'y':0}}]}
                if rows:
                    for scene in project[rows]: scene['video'] = video
                else: project['video'] = video
                header = getattr(assetc, 'emit_'+kind+'_project_data_header')(project)
                self.assertIn('gbs::VideoComposition { static_cast<gbs::DisplayMode>(1), true', header)
                self.assertIn('gbs::AffineBgTransform { 384, 0, 0, 512, 0, 0 }', header)

    def test_scoped_headers_include_prepared_scene_planes(self):
        report = {'export_plan':{'headers':[{'id':'qa_affine', 'header':'qa_affine.hpp', 'symbol':'qa_affine'}]}}
        for _, rows in profiles:
            with self.subTest(rows=rows):
                project = {rows:[{'video':video}]} if rows else {'video':video}
                self.assertIn('qa_affine.hpp',assetc.project_auto_includes(project,report))

    def test_fixed_ui_layout_rejects_oversized_maps_and_palette_overlap(self):
        report = {'export_plan':{'headers':[{'id':'qa_affine','symbol':'qa_affine','kind':'affine_bg','header':'qa.hpp',
            'resources':{'tilemap_width':64,'tilemap_height':64},
            'allocations':{'bg_palette_colors':{'start':0,'count':224}}}]}}
        scene = {'video':video}
        assetc.room_video_composition_literal(scene,'menu_project.screens[0]',report)
        entry = report['export_plan']['headers'][0]
        entry['resources']['tilemap_width'] = 128
        with self.assertRaises(SystemExit): assetc.room_video_composition_literal(scene,'menu_project.screens[0]',report)
        entry['resources']['tilemap_width'] = 64
        entry['allocations']['bg_palette_colors']['count'] = 225
        with self.assertRaises(SystemExit): assetc.room_video_composition_literal(scene,'menu_project.screens[0]',report)

    def test_new_profiles_reject_bg3_and_bitmap_ownership(self):
        for invalid in ({'display_mode':2,'affine':dict(video['affine'],layer='BG3')},
                        {'display_mode':4,'bitmap':{'asset':'image'}}):
            with self.subTest(video=invalid), self.assertRaises(SystemExit):
                assetc.room_video_composition_literal({'video':invalid},'visual_novel_project.scenes[0]')

    def test_flat_isometric_view_does_not_require_an_unused_regular_image(self):
        project=json.loads((root/'tests/fixtures/export_isometric_project_multiroom.json').read_text())['isometric_project']
        room=project['rooms'][0];room['world_mode']='static_composition';room.pop('authored_background',None)
        with self.assertRaises(SystemExit): assetc.emit_isometric_project_data_header(project)
        room['video']={'display_mode':0,'affine':None,'bitmap':None}
        with self.assertRaises(SystemExit): assetc.emit_isometric_project_data_header(project)
        room['video']=video
        header=assetc.emit_isometric_project_data_header(project)
        self.assertIn('gbs::VideoComposition { static_cast<gbs::DisplayMode>(1), true',header)

    def test_affine_menu_header_reservation_is_scoped_to_the_screen(self):
        report = {'allocations':[{'id':'image','bank_groups':['scene_a'],'allocations':{'bg_tiles':{'start':860,'count':8}}}]}
        scene = {'video':video,'hud_header':{'width':20},'resource_bank_group':'scene_b'}
        assetc.room_video_composition_literal(scene,'menu_project.screens[0]',report)
        scene['resource_bank_group'] = 'scene_a'
        with self.assertRaises(SystemExit): assetc.room_video_composition_literal(scene,'menu_project.screens[0]',report)

if __name__ == '__main__': unittest.main()
