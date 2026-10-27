"""Scene frame contracts: parse real skins, compile generated C++, restore defaults."""
import importlib.util
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
REPO = ROOT.parents[1]
spec = importlib.util.spec_from_file_location('assetc_theme_test', ROOT / 'tools/assetc/assetc.py')
assetc = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = assetc
spec.loader.exec_module(assetc)
SKINS = REPO / 'apps/desktop-electron/default-assets/templates/exemplo-gba/Assets/ui'

def config():
    return {'box_skin': str(SKINS / 'frame-lumen-v2.png'), 'scene_skins': [
        {'scene_name': 'story', 'presentation': 'portrait_tab', 'box_skin': str(SKINS / 'frame-narrativa-v2.png'), 'hud_skin': str(SKINS / 'frame-menus-v2.png')},
        {'scene_name': 'port', 'full_width_bottom': True, 'box_skin': str(SKINS / 'frame-lumen-v2.png')}]}

class InterfaceThemes(unittest.TestCase):
    def test_opted_in_bottom_edge_closes_without_changing_the_source_or_other_skins(self):
        original = (SKINS / 'frame-usina-v2.png').read_bytes()
        ui = {'scene_skins': [
            {'scene_name': 'usina', 'box_skin': str(SKINS / 'frame-usina-v2.png'), 'close_bottom_edge': True},
            {'scene_name': 'other', 'box_skin': str(SKINS / 'frame-usina-v2.png')},
        ]}
        skins = assetc.scene_interface_skins_from_json(ui['scene_skins'], REPO, 'test')
        closed = skins[0]['box_skin']['tiles']
        unchanged = skins[1]['box_skin']['tiles']
        self.assertEqual(unchanged[7], unchanged[4])
        self.assertNotEqual(unchanged[1], unchanged[4])
        self.assertEqual(closed[7], sum((closed[1][row * 4:row * 4 + 4] for row in range(7, -1, -1)), []))
        self.assertEqual(closed[:7] + closed[8:], unchanged[:7] + unchanged[8:])
        self.assertEqual((SKINS / 'frame-usina-v2.png').read_bytes(), original)

    def test_parses_skins_and_rejects_duplicate_scene(self):
        parsed = assetc.shared_dialogue_ui_assets_from_project({'topdown_project': {'dialogue_ui': config()}}, REPO)
        self.assertEqual(len(parsed[-1]), 2)
        bad = config()
        bad['scene_skins'].append(bad['scene_skins'][0])
        with self.assertRaisesRegex(SystemExit, 'duplicad'):
            assetc.shared_dialogue_ui_assets_from_project({'topdown_project': {'dialogue_ui': bad}}, REPO)

    def test_compiled_header_switches_and_restores_both_skins(self):
        ui = config()
        ui['hud_presets'] = [{'id': 'layout', 'hud_skin': ui['box_skin']}]
        ui['hud_scene_bindings'] = [{'scene_name': 'story', 'preset_id': 'layout'}]
        parsed = assetc.shared_dialogue_ui_assets_from_project({'topdown_project': {'dialogue_ui': ui}}, REPO)
        header = assetc.emit_shared_dialogue_ui_assets_header(*parsed[:10], scene_skins=parsed[10])
        with tempfile.TemporaryDirectory() as directory:
            temp = pathlib.Path(directory)
            (temp / 'generated.hpp').write_text(header)
            (temp / 'check.cpp').write_text(r'''#include "generated.hpp"
#include <cassert>
extern "C" void gbs_portrait_tab_set_workspace(void*, size_t) {}
const gbs::DialogueBoxSkin *box = nullptr, *hud = nullptr;
namespace gbs {
bool compact = false, wide = false;
void configure_dialogue_ui(const DialogueUiConfig& config) { compact = config.portrait_tab; wide = config.full_width_bottom; }
void configure_dialogue_box_skin(const DialogueBoxSkin* value) { box = value; }
void configure_hud_box_skin(const DialogueBoxSkin* value) { hud = value; }
void configure_hud_box(const HudBoxConfig&) {}
void configure_hud_layouts(const HudLayout*, size_t) {}
bool configure_hud_layout(const char*) { return true; }
void configure_dialogue_font(const DialogueFont*) {}
void configure_dialogue_choice_selector(const DialogueChoiceSelector*) {}
}
int main() {
  using namespace gbastudio_dialogue_ui;
  configure_for_scene("story");
  assert(box == scene_skins[0].box && hud == scene_skins[0].hud);
  assert(gbs::compact && !gbs::wide);
  configure_for_scene("port");
  assert(box == scene_skins[1].box && hud == hud_box_skin);
  assert(!gbs::compact && gbs::wide);
  configure_for_scene("unthemed");
  assert(box == dialogue_box_skin && hud == hud_box_skin && !gbs::wide);
  configure_for_scene("story");
  assert(box == scene_skins[0].box && hud == scene_skins[0].hud);
  assert(gbs::compact);
  assert(!has_hud_scene_binding("port"));
  assert(has_hud_scene_binding("story"));
  configure_for_scene(nullptr);
  assert(box == dialogue_box_skin && hud == hud_box_skin);
}
''')
            subprocess.run(['c++', '-std=c++17', '-I', str(ROOT / 'engine/include'), str(temp / 'check.cpp'), '-o', str(temp / 'check')], check=True, capture_output=True)
            subprocess.run([str(temp / 'check')], check=True)

    def test_reserved_obj_tiles_are_checked_only_in_opted_scene_and_globals(self):
        entries = [{'scene_name':'story', 'portrait_tab':True}]
        asset = {'id':'crowd','bank_groups':['scene_port'],'allocations':{'obj_tiles':{'start':500,'count':40}}}
        assetc.validate_portrait_tab_resources(entries, {'allocations':[asset]})
        asset['bank_groups'] = ['scene_story']
        with self.assertRaisesRegex(SystemExit, '512..895'):
            assetc.validate_portrait_tab_resources(entries, {'allocations':[asset]})
        asset['bank_groups'] = ['global']
        with self.assertRaisesRegex(SystemExit, '512..895'):
            assetc.validate_portrait_tab_resources(entries, {'allocations':[asset]})
        asset['allocations']['obj_tiles']['count'] = 12
        assetc.validate_portrait_tab_resources(entries, {'allocations':[asset]})

    def test_rejects_unknown_dialogue_presentation(self):
        ui = config()
        ui['scene_skins'][0]['presentation'] = 'unknown'
        with self.assertRaisesRegex(SystemExit, 'presentation'):
            assetc.shared_dialogue_ui_assets_from_project({'topdown_project': {'dialogue_ui': ui}}, REPO)

    def test_rejects_mixed_runtime_with_different_scene_skins(self):
        other = config()
        other['scene_skins'] = []
        with self.assertRaisesRegex(SystemExit, 'mesma UI'):
            assetc.shared_dialogue_ui_assets_from_project({'topdown_project': {'dialogue_ui': config()}, 'menu_project': {'dialogue_ui': other}}, REPO)

if __name__ == '__main__':
    unittest.main()
