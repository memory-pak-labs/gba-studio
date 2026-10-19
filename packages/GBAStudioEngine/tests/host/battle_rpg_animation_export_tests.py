import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('battle_assetc',Path(__file__).resolve().parents[2]/'tools/assetc/assetc.py')
assetc=importlib.util.module_from_spec(spec);spec.loader.exec_module(assetc)

class BattleAnimationExportTests(unittest.TestCase):
    def test_streamed_action_frames_and_optional_static_fallback(self):
        report={'export_plan':{'headers':[{'id':'hero','symbol':'hero','kind':'obj_sprite','assetc_args':['--stream-frames']}]}}
        self.assertEqual(assetc.emit_battle_rpg_animation_set([], 'p', {},report), 'nullptr')
        output=[]
        clips={s:{'asset':'hero','frame_indices':[i], 'durations':[6], 'loops':s in ('idle','defend','victory')} for i,s in enumerate(assetc.BATTLE_RPG_ANIMATION_STATES)}
        result=assetc.emit_battle_rpg_animation_set(output,'p',{'animation_set':clips},report)
        self.assertEqual(result,'&p_animation_set')
        for i,s in enumerate(clips):
            self.assertIn('&p_'+s+'_animation','\n'.join(output))
            self.assertIn('hero_frame_'+str(i)+'_tile_asset','\n'.join(output))

    def test_rejects_unknown_actions_and_looping_one_shots(self):
        for clips in ({'typo':{}},{'attack':{'asset':'hero','frame_indices':[0],'loops':True}}):
            with self.assertRaises(SystemExit):assetc.emit_battle_rpg_animation_set([],'p',{'animation_set':clips},None)

    def test_opaque_hud_font_requires_explicit_preservation(self):
        from PIL import Image
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            im=Image.new('RGBA',(128,112),(16,28,48,255));im.putpixel((8,0),(244,234,190,255));im.save(Path(d)/'font.png')
            legacy=assetc.dialogue_font_from_json('font.png',Path(d),'font',preserve_colors=True)
            self.assertNotIn('shadow',legacy)
            exact=assetc.dialogue_font_from_json('font.png',Path(d),'font',preserve_colors=True,preserve_opaque_colors=True)
            self.assertEqual(exact['tiles'][0][0],0x55)
            self.assertEqual(exact['foreground'],assetc.rgb15((244,234,190)))

if __name__=='__main__':unittest.main()
