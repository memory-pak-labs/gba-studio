#include <cassert>
#include <cstring>
#include "gbs/racing_challenge.hpp"
#include "gbs/menu.hpp"

int main() {
    constexpr uint8_t flags[64*64] {};
    gbs::RacingRoomData room {"race", flags,64,64,{1024,2048,3072,512},{240,80}};
    room.actor_count=2;
    room.challenge={7,1,3,4,5,6,80,120};
    gbs::EventState events {};
    events.scene_stack_count=1;
    events.scene_stack[0]={gbs::RuntimeKind::Racing,1,0,0,0};
    const gbs::EventCommand context[]={{gbs::EventOp::StoreEngineField,15,60,0},{gbs::EventOp::StoreEngineField,16,61,0}};
    gbs::run_event_script(events,context,2);
    assert(events.variables[60]==7 && events.variables[61]==1);
    gbs::MenuItemData restart {"restart",-1,gbs::empty_event_script(),-1,true};
    restart.condition={-1,0,false,7};
    assert(gbs::menu_item_is_available(events,restart));
    events.scene_stack[0].runtime=gbs::RuntimeKind::TopDown;
    assert(!gbs::menu_item_is_available(events,restart));
    const gbs::MenuItemBindingData binding{gbs::MenuItemBindingSource::Text,6,gbs::MenuItemBindingFormat::Number};
    assert(gbs::is_valid_menu_item_binding(binding));

    auto state=gbs::make_racing_runtime_state(room);
    gbs::initialize_racing_challenge(state,room,events);
    assert(state.boost_charges==0); // Locked module never grants charges.
    gbs::racing_write_text(events,0,"Nara");
    events.variables[7]=1;
    gbs::initialize_racing_challenge(state,room,events);
    assert(state.boost_charges==1);
    auto before=state;state.checkpoint_count=1;
    gbs::update_racing_challenge(before,state,room,events);
    assert(state.boost_charges==2);
    before=state;
    gbs::update_racing_challenge(before,state,room,events);
    assert(state.boost_charges==2); // Standing in a gate cannot refill repeatedly.
    state.checkpoint_count=5;
    gbs::update_racing_challenge(before,state,room,events);
    assert(state.boost_charges==3); // Swept gates cap the reserve.
    auto boosted=gbs::make_racing_runtime_state(room);boosted.boost_charges=1;boosted.speed_x256=room.config.max_speed_x256;
    gbs::tick_racing_vehicle(boosted,room,{true,false,0,true});
    assert(boosted.speed_x256>room.config.max_speed_x256);
    char boost_text[9] {};
    gbs::racing_boost_hud_text(boosted,true,boost_text);
    assert(std::strcmp(boost_text,"L ATIVO")==0);
    for(const char* p=boost_text;*p;++p){bool known=false;for(auto codepoint:gbs_font_codepoints)known|=codepoint==static_cast<unsigned char>(*p);assert(known);}
    state.race_result=static_cast<uint8_t>(gbs::RacingRaceResult::Victory);
    state.elapsed_frames=4501;state.distance_x256=999999;
    assert(gbs::record_racing_challenge(state,room,events,0));
    assert(std::strcmp(events.text_variables[1],"01:15.01")==0);
    assert(std::strcmp(events.text_variables[3],"01:15.01")==0);
    assert(std::strcmp(events.text_variables[4],"1/3")==0);
    assert(std::strcmp(events.text_variables[5],"OURO")==0);
    state.elapsed_frames=5000;
    assert(!gbs::record_racing_challenge(state,room,events,1));
    assert(std::strcmp(events.text_variables[1],"01:15.01")==0);
    assert(std::strcmp(events.text_variables[6],"01:15.01")==0);
    room.challenge.best_time_text_index=2;state.elapsed_frames=4000;
    assert(gbs::record_racing_challenge(state,room,events,2));
    assert(std::strcmp(events.text_variables[1],"01:15.01")==0);
    assert(std::strcmp(events.text_variables[2],"01:06.66")==0);
    state.race_result=static_cast<uint8_t>(gbs::RacingRaceResult::Defeat);
    state.elapsed_frames=1;
    assert(!gbs::record_racing_challenge(state,room,events,0));
    assert(std::strcmp(events.text_variables[2],"01:06.66")==0);
    assert(std::strcmp(events.text_variables[5],"TREINO")==0);
    assert(gbs::racing_time_centiseconds("01:15.01")==7501);
    assert(gbs::racing_time_centiseconds("")==0);
    assert(gbs::racing_time_centiseconds("99:99.99")==0);
    // Existing universal saves carry the record strings with campaign state.
    gbs::UniversalSaveData saved {};
    assert(gbs::capture_racing_save_data(saved,0,state,events));
    gbs::EventState loaded {};
    assert(gbs::read_universal_save_common_state(saved,loaded.variables,64,loaded.inventory,16,loaded.equipped_items,8,loaded.text_variables,8));
    assert(std::strcmp(loaded.text_variables[1],"01:15.01")==0);
    assert(std::strcmp(loaded.text_variables[2],"01:06.66")==0);
    assert(loaded.variables[7]==1);
    assert(std::strcmp(loaded.text_variables[0],"Nara")==0);
}
