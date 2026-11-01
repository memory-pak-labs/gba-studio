#!/usr/bin/env python3
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[2]
s=(root/'examples/isometric_basic/src/main.cpp').read_text()
signature='bool iso_scene_uses_native_tactical_hud()'
start=s.index(signature+' {');end=s.index('{',start)+1;depth=1
while depth:depth+=(s[end]=='{')-(s[end]=='}');end+=1
body=s[start:end]
program='''#include <cassert>
struct Room{const char* name;};
Room rooms[]={{"arena"}};struct{Room* rooms;}project{rooms};int current_room=0;
namespace gbastudio_dialogue_ui{bool bound=false;bool has_hud_scene_binding(const char*){return bound;}}
'''+body+'''
int main(){assert(iso_scene_uses_native_tactical_hud());gbastudio_dialogue_ui::bound=true;assert(!iso_scene_uses_native_tactical_hud());gbastudio_dialogue_ui::bound=false;assert(iso_scene_uses_native_tactical_hud());}
'''
with tempfile.TemporaryDirectory(prefix='gba-native-hud-')as tmp:
 cpp=Path(tmp)/'test.cpp';exe=Path(tmp)/'test';cpp.write_text(program)
 subprocess.run(['c++','-std=c++17',str(cpp),'-o',str(exe)],check=True);subprocess.run([str(exe)],check=True)
assert s.count('iso_scene_uses_native_tactical_hud() &&')>=3
luta=(root/'templates/exported_luta/main.cpp').read_text()
assert 'project.hud != nullptr && !gbastudio_dialogue_ui::has_hud_scene_binding' in luta
print('PASS: explicit compositions replace native tactical/fighting image HUDs')
