import importlib.util
from pathlib import Path
import unittest
import shutil
import subprocess
import tempfile
root=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('hud_assetc',root/'tools/assetc/assetc.py')
assetc=importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)
class HudBehaviorExport(unittest.TestCase):
 def test_image_layout_loads_its_tiles_and_palette_without_an_actor_reference(self):
  component=self.component();component.update(kind='frame',asset='panel')
  layout=assetc.hud_layouts_from_json([dict(id='hud',mode='advanced',components=[component])],'hud')[0]
  report={'export_plan':{'headers':[{'id':'panel','header':'panel.hpp','symbol':'panel'}]}}
  header=assetc.emit_shared_dialogue_ui_assets_header(None,None,None,None,assetc.dialogue_ui_from_json({},'ui'),assetc.hud_box_config_from_json({}),hud_layouts=[layout],asset_report=report)
  self.assertIn('gbs::load_tiles(panel_tile_asset)',header)
  self.assertIn('gbs::load_palette(panel_palette_asset, true)',header)
  self.assertIn('load_hud_layout_images(preset->id)',header)
  with tempfile.TemporaryDirectory() as directory:
   directory=Path(directory)
   (directory/'hud.hpp').write_text(header)
   (directory/'panel.hpp').write_text('#pragma once\n#include "gbs/assets.hpp"\nconstexpr uint8_t pixels[32]={};\nconstexpr uint16_t colors[16]={};\nconstexpr gbs::TileAsset panel_tile_asset{pixels,1,0,true};\nconstexpr gbs::PaletteAsset panel_palette_asset{colors,16,0};\nconstexpr gbs::MetaSprite panel_metasprites[]={{nullptr,0}};\n')
   (directory/'test.cpp').write_text('#include "hud.hpp"\n#include <cassert>\nint tiles=0,palettes=0;\nnamespace gbs { bool load_tiles(const TileAsset& value){assert(value.object_tiles);++tiles;return true;} bool load_palette(const PaletteAsset&,bool object){assert(object);++palettes;return true;} }\nint main(){gbastudio_dialogue_ui::load_hud_layout_images(nullptr);gbastudio_dialogue_ui::load_hud_layout_images("other");assert(tiles==0 && palettes==0);gbastudio_dialogue_ui::load_hud_layout_images("hud");assert(tiles==1 && palettes==1);}\n')
   subprocess.run(['c++','-std=c++17','-Wall','-Wextra','-Werror','-I'+str(root/'engine/include'),str(directory/'test.cpp'),'-o',str(directory/'test')],check=True)
   subprocess.run([str(directory/'test')],check=True)
 def component(self):
  return dict(id='button',kind='text',label='Button',text='PORTO',asset='',x=8,y=8,width=64,height=8,z_index=0,visible=True,behavior=dict(states=dict(selected=dict(variable=0,value=1,text='FOCO')),events=[dict(trigger='confirm',actions=[dict(op='set_variable',variable=1,value=7)])]))
 def test_behavior_survives_native_export(self):
  layout=assetc.hud_layouts_from_json([dict(id='hud',mode='advanced',components=[self.component()])],'hud')[0]
  self.assertEqual(layout['components'][0]['behavior']['states']['selected']['text'],'FOCO')
  self.assertEqual(layout['components'][0]['behavior']['events'][0]['actions'][0]['value'],7)
 def test_generated_behavior_header_compiles(self):
  layout=assetc.hud_layouts_from_json([dict(id='hud',mode='advanced',components=[self.component()])],'hud')[0]
  header=assetc.emit_shared_dialogue_ui_assets_header(None,None,None,None,assetc.dialogue_ui_from_json({},'ui'),assetc.hud_box_config_from_json({}),hud_layouts=[layout])
  compiler=shutil.which('c++')
  self.assertIsNotNone(compiler,'native host compiler is required')
  with tempfile.TemporaryDirectory() as directory:
   directory=Path(directory)
   (directory/'hud.hpp').write_text(header)
   (directory/'test.cpp').write_text('#include "hud.hpp"\nint main(){return gbastudio_dialogue_ui::hud_layouts[0].components[0].behavior.event_count == 1 ? 0 : 1;}\n')
   subprocess.run([compiler,'-std=c++17','-Wall','-Wextra','-Werror','-I'+str(root/'engine/include'),str(directory/'test.cpp'),'-o',str(directory/'test')],check=True)
   subprocess.run([str(directory/'test')],check=True)
 def test_invalid_variable_is_rejected(self):
  component=self.component();component['behavior']['states']['selected']['variable']=64
  with self.assertRaises(SystemExit): assetc.hud_layouts_from_json([dict(id='hud',mode='advanced',components=[component])],'hud')
 def test_more_than_two_dynamic_gauges_are_rejected(self):
  components=[]
  for index in range(3):
   component=self.component();component.update(id='bar'+str(index),kind='bar',asset='full',value_binding='lives',gauge=dict(empty_asset='empty',x=0,y=0,width=64,height=8))
   components.append(component)
  with self.assertRaises(SystemExit): assetc.hud_layouts_from_json([dict(id='hud',mode='advanced',components=components)],'hud')
if __name__=='__main__':unittest.main()
