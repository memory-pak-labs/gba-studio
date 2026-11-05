#include "gbs/menu.hpp"
#include <cassert>
int main(){
  const gbs::MenuTextInputKeyboardGeometry grid {6,5,1,0,nullptr,0};
  gbs::MenuTextInputKeyboardData keyboard {gbs::MenuTextInputKeyboardLayout::Grid,1,1,16,10,true,
    gbs::MenuTextInputKeyboardControlLayout::BottomGrid,0,0,0,0,gbs::MenuTextInputKeyboardSurface::Background,&grid};
  assert(gbs::is_valid_menu_text_input_keyboard(keyboard));
  assert(gbs_name_key_rect(&grid,1).x==3);
  assert(gbs_name_key_rect(&grid,6).y==2);
  assert(gbs_name_key_rect(&grid,26).y==10);
  gbs::MenuTextInputKeyPosition positions[29] {};
  for(int i=0;i<29;++i){auto r=gbs_name_key_rect(nullptr,i);positions[i]={r.x,r.y};}
  positions[0].x=2;positions[1].x=0;
  gbs::MenuTextInputKeyboardGeometry custom {8,4,0,0,positions,29};keyboard.geometry=&custom;
  assert(gbs::is_valid_menu_text_input_keyboard(keyboard));
  assert(gbs::menu_keyboard_next(keyboard,1,1,0)==0);
  assert(gbs::menu_keyboard_next(keyboard,0,-1,0)==1);
  assert(gbs::menu_keyboard_next(keyboard,1,0,1)==8);
  bool reachable[29] {};
  int row=0;
  for(int r=0;r<5;++r){int key=row;for(int c=0;c<30;++c){reachable[key]=true;key=gbs::menu_keyboard_next(keyboard,key,1,0);}row=gbs::menu_keyboard_next(keyboard,row,0,1);}
  for(bool visited:reachable)assert(visited);
  custom.key_count=28;assert(!gbs::is_valid_menu_text_input_keyboard(keyboard));
  custom.key_count=29;positions[0].x=30;assert(!gbs::is_valid_menu_text_input_keyboard(keyboard));
}
