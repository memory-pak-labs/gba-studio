#!/usr/bin/env python3
"""Exercise the shipped Point and Click renderer with modal and idle UI states."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'templates/exported_point_click/main.cpp').read_text()
start = source.index('void render_point_click_runtime(')
end = source.index('{', start) + 1
depth = 1
while depth:
    depth += (source[end] == '{') - (source[end] == '}')
    end += 1

program = r'''
#include <cassert>
namespace gbs {
struct RuntimeFrameContext {};
enum class ProfilerSubsystem { Render };
struct SubsystemProfilerScope { SubsystemProfilerScope(ProfilerSubsystem) {} };
struct PointClickSceneData {};
struct DialogueState { bool visible; int frame_index; const char* speaker; };
struct HudState {};
struct DialogueBoxLayout { int x, y, w, h; };
struct DialogueUiConfig { bool name_label_above, show_character_name; };
int cursor_calls = 0, ordinary_hud = 0, excluded_hud = 0, exclusion_top = -1;
int order = 0, hud_order = 0, dialogue_order = 0, portrait_order = 0;
DialogueUiConfig config {true, true};
void hide_all_sprites() {}
const PointClickSceneData* point_click_scene_for(int, int) { static PointClickSceneData scene; return &scene; }
DialogueBoxLayout dialogue_box_layout_for_frame(int) { return {1, 12, 28, 6}; }
DialogueBoxLayout dialogue_name_label_layout_for_frame(int, int) { return {1, 9, 10, 3}; }
const DialogueUiConfig& active_dialogue_ui_config() { return config; }
void draw_hud(const HudState&) { ++ordinary_hud; hud_order = ++order; }
void draw_hud_excluding(const HudState&, int x, int y, int width, int height) {
    assert(x == 0 && width == 240 && height == 160 - y);
    ++excluded_hud; exclusion_top = y; hud_order = ++order;
}
void draw_dialogue(const DialogueState&) { dialogue_order = ++order; }
void draw_dialogue_portrait(const DialogueState& state) { assert(state.visible); portrait_order = ++order; }
void wait_vblank() {}
bool render_event_background_scale(int) { return false; }
}
int project = 0, current_scene_index = 0, event_state = 0;
gbs::DialogueState dialogue {};
gbs::HudState hud {};
void draw_point_click_props(const gbs::PointClickSceneData&) {}
void draw_cursor() { ++gbs::cursor_calls; }
void sync_runtime_telemetry() {}
''' + source[start:end] + r'''
int main() {
    gbs::RuntimeFrameContext frame;
    dialogue = {false, 0, "Narrador"};
    render_point_click_runtime(frame);
    assert(gbs::cursor_calls == 1 && gbs::ordinary_hud == 1);
    assert(gbs::dialogue_order < gbs::hud_order);
    gbs::order = gbs::hud_order = gbs::dialogue_order = 0;
    dialogue.visible = true;
    render_point_click_runtime(frame);
    assert(gbs::cursor_calls == 1 && gbs::excluded_hud == 1 && gbs::exclusion_top == 72);
    assert(gbs::hud_order < gbs::dialogue_order);
    assert(gbs::dialogue_order < gbs::portrait_order);
    gbs::config.show_character_name = false;
    render_point_click_runtime(frame);
    assert(gbs::excluded_hud == 2 && gbs::exclusion_top == 96);
    dialogue.visible = false;
    render_point_click_runtime(frame);
    assert(gbs::cursor_calls == 2 && gbs::ordinary_hud == 2);
}
'''
with tempfile.TemporaryDirectory(prefix='gba-point-click-dialogue-') as tmp:
    cpp = Path(tmp) / 'test.cpp'
    exe = Path(tmp) / 'test'
    cpp.write_text(program)
    subprocess.run(['c++', '-std=c++17', str(cpp), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('Point and Click dialogue rendering passed')
