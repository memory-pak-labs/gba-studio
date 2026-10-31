from pathlib import Path
import importlib.util
import tempfile
import unittest
from PIL import Image

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('assetc', root / 'tools/assetc/assetc.py')
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)

class DungeonExportTests(unittest.TestCase):
    def test_cache_source_bounds_and_complete_view(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)
            (p/'tiles').write_bytes(bytes(32))
            (p/'maps').write_bytes(bytes(2400))
            (p/'palettes').write_bytes(bytes(32))
            source = dict(tiles='tiles', maps='maps', palettes='palettes', index=[dict(view='1-2-0', mapOffset=0, paletteOffset=0, paletteColors=16)])
            out=[]
            self.assertEqual(assetc.emit_dungeon_view_cache(out, dict(source), p), '&dungeon_view_cache')
            self.assertIn('{1,2,0,0,0,16},', out)
            with self.assertRaises(SystemExit):
                assetc.emit_dungeon_view_cache([], dict(source, tiles='../outside'), p)
            with self.assertRaises(SystemExit):
                assetc.emit_dungeon_view_cache([], dict(source, index=[dict(view='1-2-0', mapOffset=4, paletteOffset=0, paletteColors=16)]), p)
    def test_transparent_hud_font_keeps_ink_and_zero_background(self):
        with tempfile.TemporaryDirectory() as folder:
            image=Image.new('RGBA',(128,112)); image.putpixel((1,1),(240,232,184,255))
            image.save(Path(folder)/'font.png')
            font=assetc.dialogue_font_from_json('font.png',Path(folder),'font',preserve_colors=True)
            self.assertEqual(font['foreground'], assetc.rgb15((240,232,184)))
            self.assertTrue(any(any(t) for t in font['tiles']))
            self.assertTrue(any(not any(t) for t in font['tiles']))

class DungeonRecipeTests(unittest.TestCase):
    def recipe(self):
        import base64, struct
        materials = [base64.b64encode(struct.pack('<4096H', *([color] * 4096))).decode() for color in (1234, 2222, 3333, 4444, 5555, 6666, 7777, 8888)]
        return dict(width=3, height=3, cells=[True,True,True,True,False,True,True,True,True], materials=materials, door=dict(x=2,y=0))
    def test_rebuild_covers_every_free_cell_and_four_directions(self):
        recipe = self.recipe()
        buffers, views = assetc.build_dungeon_recipe_cache(recipe)
        self.assertEqual([v['view'] for v in views], ['1-1-0','1-1-1','1-1-2','1-1-3'])
        out=[]
        self.assertEqual(assetc.emit_dungeon_cache_buffers(out,buffers,views,'edited'), '&edited_view_cache')
        self.assertIn('constexpr gbs::DungeonViewEntry edited_views[] = {',out)
        recipe['cells'][1]=False
        next_buffers, next_views = assetc.build_dungeon_recipe_cache(recipe)
        self.assertEqual(len(next_views),8)
        self.assertNotEqual(next_buffers['maps'],buffers['maps'])
        textures=assetc.dungeon_recipe_materials(recipe)
        opened=assetc.render_dungeon_recipe(recipe,1,1,0,textures)
        recipe['cells'][1]=True
        self.assertNotEqual(opened,assetc.render_dungeon_recipe(recipe,1,1,0,textures))
    def test_invalid_recipe_is_rejected_before_render(self):
        for mutation in (dict(width=65),dict(cells=[]),dict(materials=['x']*8),dict(door={}),dict(cells=[False]*9)):
            recipe=self.recipe(); recipe.update(mutation)
            if mutation==dict(cells=[False]*9): recipe['width']=64;recipe['height']=64;recipe['cells']=[False]*4096
            with self.assertRaises(SystemExit): assetc.build_dungeon_recipe_cache(recipe)

if __name__ == '__main__': unittest.main()
