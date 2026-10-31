#!/usr/bin/env python3
"""Exercise the shipped cutscene control flow with the real dialogue paginator."""
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'templates/exported_cutscene/main.cpp').read_text()


def function(marker):
    start = source.index(marker)
    end = source.index('{', start) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end] + '\n'


code = r'''
#include <cassert>
#include <cstring>
#include <cstdio>
#include <initializer_list>
#include "gbs/cutscene.hpp"
#include "gbs/dialogue.hpp"
// Keep the full translation unit linkable on hosts whose linker retains drawing code.
extern "C" {
void gbs_hw_configure_dialogue_box_skin(const uint8_t*, const uint16_t*) {}
void gbs_hw_configure_hud_box_skin(const uint8_t*, const uint16_t*) {}
void gbs_hw_configure_hud_box(int, int, int, int) {}
void gbs_hw_configure_dialogue_font(const uint8_t*) {}
void gbs_hw_configure_dialogue_choice_selector(const uint8_t*) {}
void gbs_hw_draw_text_box(int, int, int, int, const char*, int) {}
void gbs_hw_draw_portrait_tab(const char*,const char*,int,int,int) {}
}
gbs::DialogueState dialogue {};
gbs::EventState event_state {};
gbs::CutsceneRuntimeState cutscene_state {};
gbs::CutsceneStepData steps[2] {};
gbs::CutsceneSceneData scene {};
gbs::CutsceneProjectData project {};
const gbs::DialogueLine lines[] = {{"Primeira\nSegunda\nTerceira\nQuarta"}};
bool entry_frame_pending = false;
int advances = 0, skips = 0;
namespace gbs { struct CutsceneScriptRunner {}; bool enqueue_cutscene_script(CutsceneScriptRunner&, EventScript) { return true; } }
gbs::CutsceneScriptRunner cutscene_scripts {};
int pending_step_line = -1;
void tick_cutscene_scripts() {}
void show_pending_step_line() {}
namespace gbastudio_dialogue_ui {
void configure_for_scene(const char*, bool = false) {
    gbs::DialogueUiConfig config {};
    config.wrap_columns = 10;
    config.wrap_lines = 2;
    config.show_character_name = false;
    config.box_width_tiles = 12;
    config.box_height_tiles = 4;
    gbs::configure_dialogue_ui(config);
}
}
void stream_current_step_resource_group() {}
void apply_current_step_background() {}
void refresh_hud() {}
void persist_cutscene_runtime_state() {}
void consume_event_state() {}
void advance_step() { ++advances; ++cutscene_state.step_index; gbs::hide_dialogue(dialogue); }
void skip_step() { ++skips; }
'''
code += function('void show_current_step(bool reset_counter, bool run_script, bool prepare_visual)')
code += function('void update_cutscene(gbs::InputState input)')
code += r'''
void boot(bool wait = false, bool automatic = false) {
    gbs::configure_dialogue_ui(gbs::DialogueUiConfig {});
    gbs::init_dialogue(dialogue);
    cutscene_state = {};
    advances = skips = 0;
    entry_frame_pending = false;
    steps[0] = {};
    steps[0].line_index = 0;
    steps[0].wait_for_dialogue = wait;
    steps[0].auto_advance = automatic;
    steps[0].duration_frames = 10;
    scene.name = "intro";
    scene.steps = steps;
    scene.step_count = 2;
    project.scenes = &scene;
    project.scene_count = 1;
    project.dialogue_lines = lines;
    project.dialogue_line_count = 1;
    show_current_step(true, false, false);
}
void press(uint16_t button) { update_cutscene({button, button, 0}); }
void page_is(const char* expected) {
    char text[1024] {};
    gbs::format_dialogue_display_text(dialogue, text, sizeof(text));
    if (std::strcmp(text, expected) != 0) std::fprintf(stderr, "Expected <%s>, got <%s>\n", expected, text);
    assert(std::strcmp(text, expected) == 0);
}
int main() {
    boot();
    // The target scene's layout must be active before the first page is built.
    assert(dialogue.page_char_count == 17);
    assert(dialogue.has_next_page);
    page_is("Primeira\nSegunda");
    press(gbs::ButtonA);
    assert(advances == 0 && cutscene_state.step_index == 0);
    assert(dialogue.visible && dialogue.page_index == 1);
    page_is("Terceira\nQuarta");
    press(gbs::ButtonA);
    assert(advances == 1 && !dialogue.visible);

    // An authored wait closes the final page before accepting a separate step advance.
    boot(true);
    press(gbs::ButtonA);
    assert(dialogue.visible && dialogue.page_index == 1 && advances == 0);
    press(gbs::ButtonA);
    assert(!dialogue.visible && advances == 0);
    press(gbs::ButtonA);
    assert(advances == 1);

    // A typewriter confirm reveals only the current page, without losing subsequent text.
    boot();
    gbs::set_dialogue_text_speed(dialogue, 2);
    show_current_step(true, false, false);
    update_cutscene({});
    update_cutscene({});
    assert(dialogue.visible_char_count == 1 && advances == 0);
    press(gbs::ButtonA);
    assert(dialogue.page_complete && dialogue.page_index == 0 && advances == 0);
    press(gbs::ButtonA);
    assert(dialogue.page_index == 1 && !dialogue.page_complete && advances == 0);
    press(gbs::ButtonA);
    assert(dialogue.page_complete && advances == 0);
    press(gbs::ButtonA);
    assert(advances == 1);

    // Existing explicit skip and auto-advance behavior stays independent of A pagination.
    for (uint16_t button : {uint16_t(gbs::ButtonB), uint16_t(gbs::ButtonStart)}) {
        boot(); press(button); assert(skips == 1 && advances == 0);
        boot(true); press(button); assert(skips == 1 && advances == 0);
    }
    boot(false, true);
    for (int i = 0; i < 10; ++i) update_cutscene({});
    assert(advances == 1);
    boot(true, true);
    for (int i = 0; i < 20; ++i) update_cutscene({});
    assert(advances == 0 && cutscene_state.frame_counter == 0);
}
'''
with tempfile.TemporaryDirectory(prefix='gba-cutscene-dialogue-') as directory:
    temp = Path(directory)
    cpp, exe = temp / 'check.cpp', temp / 'check'
    cpp.write_text(code)
    subprocess.run(['c++', '-std=c++17', '-O2', '-ffunction-sections', '-fdata-sections',
                    '-I' + str(ROOT / 'engine/include'), str(cpp),
                    str(ROOT / 'engine/src/gbs_dialogue.cpp'),
                    str(ROOT / 'engine/src/gbs_dialogue_locale.cpp'),
                    str(ROOT / 'engine/src/gbs_text.c'),
                    '-Wl,-dead_strip' if sys.platform == 'darwin' else '-Wl,--gc-sections',
                    '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('cutscene dialogue layout, pagination, typewriter and step controls: PASS')
