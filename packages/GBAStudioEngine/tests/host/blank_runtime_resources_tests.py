import importlib.util
from pathlib import Path
import tempfile
import unittest
from PIL import Image

spec = importlib.util.spec_from_file_location("assetc", Path(__file__).resolve().parents[2] / "tools/assetc/assetc.py")
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)


class BlankRuntimeResourcesTests(unittest.TestCase):
    def test_optional_first_person_player_uses_screen_coordinates(self):
        recipe = self.recipe()
        room = dict(name="Hands", width_tiles=3, height_tiles=3,
                    collision_flags=[int(v) for v in recipe["cells"]], player_start=dict(x=1,y=1),
                    presentation=dict(view_recipe=recipe),
                    player_view=dict(metasprite="hand_sprite", position_pixels=dict(x=200,y=120)))
        header = assetc.emit_dungeon_crawler_project_data_header(dict(rooms=[room]))
        self.assertIn("gbs::DungeonCrawlerPlayerView", header)
        self.assertIn("&hand_sprite", header)
        self.assertIn("gbs::Vec2i { 200, 120 }", header)
        room.pop("player_view")
        self.assertNotIn("gbs::DungeonCrawlerPlayerView", assetc.emit_dungeon_crawler_project_data_header(dict(rooms=[room])))

    def recipe(self):
        return dict(width=3, height=3, cells=[True, True, True, True, False, True, True, True, True], door=dict(x=-1, y=-1))

    def test_generated_dungeon_needs_no_example_cache_or_hud(self):
        recipe = self.recipe()
        room = dict(name="New maze", width_tiles=3, height_tiles=3,
                    collision_flags=[int(v) for v in recipe["cells"]], player_start=dict(x=1, y=1),
                    presentation=dict(view_recipe=recipe, player_label="My hero"))
        header = assetc.emit_dungeon_crawler_project_data_header(dict(rooms=[room]))
        self.assertIn('"My hero"', header)
        self.assertIn("dungeon_generated_0_view_cache", header)
        self.assertNotIn("&None", header)

    def test_procedural_materials_match_the_editor_fallback(self):
        materials = assetc.dungeon_recipe_materials(self.recipe())
        self.assertEqual(materials[0][1 * 64 + 1], (112, 144, 128))
        self.assertEqual(materials[4][1 * 64 + 1], (48, 88, 96))
        self.assertEqual(materials[0][0], (32, 64, 72))

    def test_material_assets_preserve_pixels_and_reject_wrong_dimensions(self):
        with tempfile.TemporaryDirectory() as folder:
            image = Path(folder) / "material.png"
            Image.new("RGB", (64,64), (248,80,40)).save(image)
            recipe = dict(self.recipe(), material_assets=["material.png"] * 8)
            self.assertEqual(assetc.dungeon_recipe_materials(recipe, Path(folder))[0][0], (248,80,40))
            Image.new("RGB", (32,64)).save(image)
            with self.assertRaises(SystemExit): assetc.dungeon_recipe_materials(recipe, Path(folder))
            recipe["material_assets"] = ["../outside.png"] * 8
            with self.assertRaises(SystemExit): assetc.dungeon_recipe_materials(recipe, Path(folder))

    def test_rpg_presentation_resources_are_independent(self):
        out = []
        pointer = assetc.emit_battle_rpg_presentation(out, "blank", dict(victory_label="WIN", hud_background=-1), {}, None, None)
        self.assertEqual(pointer, "&blank_presentation")
        self.assertIn('"WIN"', "\n".join(out))
        self.assertNotIn("&None", "\n".join(out))

    def test_static_enemy_idle_keeps_its_non_looping_clip(self):
        report = {'export_plan': {'headers': [{'id':'ship','symbol':'ship','kind':'obj_sprite','assetc_args':['--stream-frames']}]}}
        clip = dict(asset='ship',frame_indices=[0],durations=[60],loops=False)
        output=[]
        assetc.emit_shmup_enemies(output,dict(enemies=[dict(name='Enemy',animation=clip)]),0,report)
        self.assertIn('1, false', '\n'.join(output))

    def test_paged_isometric_background_does_not_require_foreground_art(self):
        with tempfile.TemporaryDirectory() as folder:
            source = 'constexpr uint8_t backdrop_tiles[] = {' + ','.join(['0x00']*64) + '};\n'
            source += 'constexpr uint16_t backdrop_palette[] = {0x1234};\n'
            source += 'constexpr uint16_t backdrop_tilemap_entries[] = {' + ','.join(['0x0000']*600) + '};\n'
            source += 'constexpr int backdrop_tilemap_width = 30;\nconstexpr int backdrop_tilemap_height = 20;\n'
            (Path(folder)/'backdrop.hpp').write_text(source)
            room=dict(world_mode='scrollable_tiled_world',grid=dict(gameplay_mode='adventure',movement_model='free'),
                      paged_surface=dict(background='backdrop',width=240,height=160))
            output=[]
            pointer=assetc.emit_paged_isometric_reference(output,'blank',room,Path(folder),[dict(name='backdrop',kind='paged_bg')])
            self.assertEqual(pointer,'&blank_paged')
            self.assertIn('blank_paged_tiles, 2,', '\n'.join(output))


if __name__ == "__main__": unittest.main()
