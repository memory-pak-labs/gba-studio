#include "gbs/menu_presentation.hpp"
#include <cassert>
#include <cstring>

int main() {
    assert(gbs::menu_presentation_padding("OURO",8)==4);
    assert(gbs::menu_presentation_padding("AÇÃO",6)==2);
    gbs::EventState state {};
    std::strcpy(state.text_variables[4], "3/3");
    const gbs::MenuItemBindingData place {gbs::MenuItemBindingSource::Text,4,gbs::MenuItemBindingFormat::Number};
    assert(gbs::menu_presentation_value(state,place)==3);
    assert(gbs::menu_presentation_value(state,{gbs::MenuItemBindingSource::Text,7})==-1);
    state.equipped_items[0]=6;
    assert(gbs::menu_presentation_value(state,{gbs::MenuItemBindingSource::Equipped,0})==6);
    state.scene_stack_count=1;
    state.scene_stack[0].room=0;
    state.racing_result=1;
    state.variables[14]=0;
    const gbs::MenuVisibilityConditionData first_win[] {
        {{gbs::MenuItemBindingSource::Context,0},0,false},
        {{gbs::MenuItemBindingSource::Context,1},1,false},
        {{gbs::MenuItemBindingSource::Variable,14},0,false}
    };
    assert(gbs::menu_presentation_visible(state,first_win,3,false));
    state.variables[14]=1;
    assert(!gbs::menu_presentation_visible(state,first_win,3,false));
    const gbs::MenuVisibilityConditionData replay[] {
        {{gbs::MenuItemBindingSource::Context,0},0,true},
        {{gbs::MenuItemBindingSource::Context,1},1,true},
        {{gbs::MenuItemBindingSource::Variable,14},0,true}
    };
    assert(gbs::menu_presentation_visible(state,replay,3,true));
    state.variables[14]=0;state.racing_result=2;
    assert(gbs::menu_presentation_visible(state,replay,3,true));
    assert(!gbs::menu_presentation_visible(state,first_win,3,false));
    gbs::MenuScreenData screen {};
    screen.previous_page_screen_index=2;screen.next_page_screen_index=4;
    assert(gbs::menu_page_target(screen,gbs::ButtonL,6)==2);
    assert(gbs::menu_page_target(screen,gbs::ButtonR,6)==4);
    assert(gbs::menu_page_target(screen,gbs::ButtonA,6)==-1);
    assert(gbs::menu_page_target(screen,gbs::ButtonR,3)==-1);
    screen.previous_page_screen_index=-1;screen.next_page_screen_index=-1;
    assert(gbs::menu_page_target(screen,gbs::ButtonL|gbs::ButtonR,6)==-1);
}
