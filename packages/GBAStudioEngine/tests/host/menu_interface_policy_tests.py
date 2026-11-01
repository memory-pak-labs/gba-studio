#!/usr/bin/env python3
"""Execute the exported menu's UI policy for title/logo and normal screens."""
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[2]
s=(root/'templates/exported_menu/main.cpp').read_text()
def function(signature):
 start=s.index(signature+' {');end=s.index('{',start)+1;depth=1
 while depth:depth+=(s[end]=='{')-(s[end]=='}');end+=1
 return s[start:end]
program=r'''
#include "gbs/menu.hpp"
#include <cassert>
bool menu_scene_has_hud_binding=false;
'''+function('bool menu_screen_uses_ui(const gbs::MenuScreenData* screen)')+function('bool menu_screen_uses_hud_layout(const gbs::MenuScreenData* screen)')+r'''
int main(){
 for(auto kind:{gbs::MenuScreenType::Logo,gbs::MenuScreenType::Title,gbs::MenuScreenType::Menu}){
  gbs::MenuScreenData screen{};screen.screen_type=kind;
  menu_scene_has_hud_binding=true;
  assert(menu_screen_uses_ui(&screen));assert(menu_screen_uses_hud_layout(&screen));
  menu_scene_has_hud_binding=false;assert(!menu_screen_uses_hud_layout(&screen));
  if(kind!=gbs::MenuScreenType::Menu)assert(!menu_screen_uses_ui(&screen));
 }
}
'''
program=program.replace('#include <cassert>','#include <cassert>\n#include <initializer_list>')
with tempfile.TemporaryDirectory(prefix='gba-menu-interface-') as tmp:
 cpp=Path(tmp)/'test.cpp';exe=Path(tmp)/'test';cpp.write_text(program)
 subprocess.run(['c++','-std=c++17','-I',str(root/'engine/include'),str(cpp),'-o',str(exe)],check=True)
 subprocess.run([str(exe)],check=True)
print('PASS: authored interfaces on logo/title/menu and unchanged actor-only screens')
