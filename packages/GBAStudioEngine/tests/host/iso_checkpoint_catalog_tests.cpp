#include <cassert>
#include <initializer_list>
#include "gbs/iso_checkpoint_catalog.hpp"

int main() {
    const gbs::EventCommand enter[]={{gbs::EventOp::MoveActorTo,0,1,2},{gbs::EventOp::End,0,0,0}};
    const gbs::EventCommand actor[]={{gbs::EventOp::SetVariable,0,3,0}};
    const gbs::EventCommand trigger[]={{gbs::EventOp::SetVariable,0,4,0}};
    const gbs::EventCommand shared[]={{gbs::EventOp::SetVariable,0,5,0}};
    const gbs::IsoActorEventData actor_events[]={{1,{actor,1}}};
    const gbs::RuntimeTriggerData triggers[]={{{0,0,1,1},{trigger,1},gbs::empty_event_script(),false,0}};
    gbs::IsometricRoomData room{};
    room.on_enter={enter,2};room.actor_interact_events=actor_events;room.actor_interact_event_count=1;
    room.triggers=triggers;room.trigger_count=1;
    const gbs::EventScript scripts[]={{shared,1}};
    gbs::IsometricProjectData project{};project.rooms=&room;project.room_count=1;project.scripts=scripts;project.script_count=1;
    for(auto script : {room.on_enter, actor_events[0].script, triggers[0].on_enter, scripts[0]}) {
        int32_t id=-1;assert(gbs::iso_checkpoint_find_script(project,0,script,id));
        const auto restored=gbs::iso_checkpoint_script_at(project,0,id);
        assert(restored.commands==script.commands && restored.command_count==script.command_count);
    }
    assert(!gbs::has_event_script(gbs::iso_checkpoint_script_at(project,0,-1)));
    assert(!gbs::has_event_script(gbs::iso_checkpoint_script_at(project,1,0)));
    const gbs::EventCommand unknown[]={{gbs::EventOp::End,0,0,0}};
    int32_t id=-1;assert(!gbs::iso_checkpoint_find_script(project,0,{unknown,1},id));
}
