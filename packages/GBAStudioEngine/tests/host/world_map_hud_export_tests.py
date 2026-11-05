import importlib.util
from pathlib import Path
import unittest
import subprocess
import tempfile

spec = importlib.util.spec_from_file_location('assetc', Path(__file__).resolve().parents[2] / 'tools/assetc/assetc.py')
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)

class WorldMapHudExportTests(unittest.TestCase):
    def test_scene_hud_font_does_not_replace_dialogue_glyphs(self):
        dialogue_font = dict(tiles=[[0x44] * 32 for _ in range(128)])
        hud_font = dict(tiles=[[0] * 32 for _ in range(128)], foreground=9478)
        preset = dict(id='route', skin=None, font=hud_font, config=assetc.hud_box_config_from_json({}))
        header = assetc.emit_shared_dialogue_ui_assets_header(
            None, None, None, dialogue_font,
            assetc.dialogue_ui_from_json({}, 'ui'), assetc.hud_box_config_from_json({}),
            [preset], [dict(scene_name='storm', preset_id='route')],
            [dict(id='route', mode='advanced', components=[])])
        source = r'''
#include <cassert>
#include <cstring>
#include "generated.hpp"
const gbs::DialogueFont* dialogue_font_seen;
const gbs::HudLayout* hud_layouts_seen;
const gbs::HudLayout* selected_hud;
size_t hud_count;
extern "C" void gbs_portrait_tab_set_workspace(void*, size_t) {}
namespace gbs {
void configure_dialogue_ui(const DialogueUiConfig&) {}
void configure_dialogue_box_skin(const DialogueBoxSkin*) {}
void configure_hud_box_skin(const DialogueBoxSkin*) {}
void configure_hud_box(const HudBoxConfig&) {}
void configure_hud_layouts(const HudLayout* layouts, size_t count) { hud_layouts_seen=layouts; hud_count=count; }
bool configure_hud_layout(const char* id) {
    for (size_t i=0; id && i<hud_count; ++i)
        if (!std::strcmp(hud_layouts_seen[i].id,id)) { selected_hud=&hud_layouts_seen[i]; return true; }
    return false;
}
void configure_dialogue_font(const DialogueFont* font) { dialogue_font_seen=font; }
void configure_dialogue_choice_selector(const DialogueChoiceSelector*) {}
}
int main() {
    gbastudio_dialogue_ui::configure_for_scene("storm");
    assert(dialogue_font_seen==gbastudio_dialogue_ui::dialogue_font);
    assert(selected_hud && selected_hud->font_tiles);
    assert(selected_hud->font_tiles!=dialogue_font_seen->tiles);
    assert(dialogue_font_seen->tiles[0]==0x44);
    assert(selected_hud->font_tiles[0]==0);
}
'''
        with tempfile.TemporaryDirectory(prefix='gba-hud-dialogue-font-') as directory:
            target = Path(directory)
            (target / 'generated.hpp').write_text(header)
            (target / 'test.cpp').write_text(source)
            root = Path(__file__).resolve().parents[2]
            subprocess.run(['c++', '-std=c++17', '-I', str(root / 'engine/include'),
                            str(target / 'test.cpp'), '-o', str(target / 'test')], check=True)
            subprocess.run([str(target / 'test')], check=True)

    def test_single_ink_hud_font_keeps_its_tiles_and_color(self):
        font = dict(tiles=[[0]*32 for _ in range(128)], foreground=9478)
        preset = dict(id='route', skin=None, font=font, config=assetc.hud_box_config_from_json({}))
        header = assetc.emit_shared_dialogue_ui_assets_header(None, None, None, None, assetc.dialogue_ui_from_json({}, 'ui'), assetc.hud_box_config_from_json({}), [preset], [], [dict(id='route', mode='advanced', components=[])])
        self.assertIn('0, &hud_preset_route_font_tiles[0][0], 9478, -1', header)

    def test_authored_labels_reach_the_native_project(self):
        project = dict(nodes=[dict(name='porto', x=79, y=224, connections=[])], hud_labels=dict(available='< Viajar    > Porto', journey='Travessia', locked='Rota bloqueada'))
        header = assetc.emit_world_map_project_data_header(project)
        self.assertIn('gbs::WorldMapHudLabels { "< Viajar    > Porto", "Travessia", "Rota bloqueada" }', header)

    def test_unconfigured_labels_use_the_existing_native_defaults(self):
        header = assetc.emit_world_map_project_data_header(dict(nodes=[dict(name='porto', connections=[])]))
        self.assertIn('gbs::WorldMapHudLabels { "A VIAJAR", "EM VOO", "BLOQUEADO" }', header)

if __name__ == '__main__': unittest.main()
