#!/usr/bin/env python3
"""Run actual template HUD policies with/without an authored scene binding."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]

def function(source, signature):
    start = source.index(signature + ' {')
    end = source.index('{', start) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]

for runtime in ['visual_novel', 'cutscene']:
    source = (root / f'templates/exported_{runtime}/main.cpp').read_text()
    body = function(source, 'void refresh_hud()')
    program = r'''
#include <cassert>
#include <cstdint>
#include <cstdio>
struct {} project;
struct { int scene_index = 0, step_index = 0; } cutscene_state;
struct { int count = 0; } history;
int current_scene_index = 0;
char hud_left_buffer[64] {}, hud_right_buffer[64] {};
namespace gbs {
struct HudState { bool visible = false; };
const char* visual_novel_scene_name(const decltype(project)&, int) { return "scene"; }
int visual_novel_scene_number(const decltype(project)&, int) { return 1; }
const char* cutscene_scene_name(const decltype(project)&, int) { return "scene"; }
void hide_hud(HudState& hud) { hud.visible = false; }
void set_hud_text(HudState& hud, const char*, const char*) { hud.visible = true; }
}
gbs::HudState hud;
namespace gbastudio_dialogue_ui {
bool bound = false;
bool has_hud_scene_binding(const char* name) { return bound && name != nullptr; }
}
void append_char(char*& dst, const char* end, char c) { if (dst < end) {*dst++=c;*dst=0;} }
void append_text(char*& dst, const char* end, const char* s) {while (*s) append_char(dst,end,*s++);}
void append_uint(char*& dst, const char* end, uint16_t v) {char b[8];snprintf(b,8,"%u",v);append_text(dst,end,b);}
''' + body + r'''
int main() {
  gbastudio_dialogue_ui::bound = false; refresh_hud(); assert(!hud.visible);
  gbastudio_dialogue_ui::bound = true; refresh_hud(); assert(hud.visible);
  gbastudio_dialogue_ui::bound = false; refresh_hud(); assert(!hud.visible);
}
'''
    with tempfile.TemporaryDirectory(prefix='gba-authored-hud-') as tmp:
        cpp, exe = Path(tmp)/'test.cpp', Path(tmp)/'test'
        cpp.write_text(program)
        subprocess.run(['c++','-std=c++17',str(cpp),'-o',str(exe)],check=True)
        subprocess.run([str(exe)],check=True)
    render = function(source, f'void render_{runtime}_runtime(const gbs::RuntimeFrameContext& context)')
    assert 'gbs::hide_hud(hud)' not in render, f'{runtime} hides an authored HUD after refresh'
    if runtime == 'visual_novel':
        portrait = function(source, 'void draw_dialogue_portrait()')
        assert 'gbs::hide_all_sprites()' not in portrait, 'portrait erases authored HUD sprites'
        assert render.index('gbs::hide_all_sprites()') < render.index('gbs::draw_hud(hud)')
print('PASS: authored Cutscene/Visual Novel HUDs, no-binding preservation and scene handoff')
