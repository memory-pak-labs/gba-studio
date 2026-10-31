#include <cassert>
#include "gbs/iso_event_scheduler.hpp"

int main() {
    gbs::EventState state{};gbs::init_event_state(state); state.supports_temporal_actor_motion = true;
    gbs::IsoEventScheduler scheduler{};
    const gbs::EventCommand child[]={{gbs::EventOp::MoveActorTo,0,1,0},{gbs::EventOp::SetVariable,0,10,0}};
    const gbs::EventScript scripts[]={{child,2}};
    gbs::bind_event_scripts(state,scripts,1);
    const gbs::EventCommand parent[]={{gbs::EventOp::CallScript,0,0,0},{gbs::EventOp::AddVariable,0,3,0}};
    const gbs::EventScript root{parent,2};
    assert(gbs::run_iso_scheduled_script(scheduler,state,root));
    assert(state.actor_command_count==1 && state.variables[0]==0);
    const auto request=state.actor_commands[0];
    assert(request.motion_owner && request.motion_owner->actor_motion_pending);
    gbs::clear_event_actor_commands(state);
    // Recurrent scripts cannot restart or enqueue themselves while suspended.
    assert(gbs::run_iso_scheduled_script(scheduler,state,root));
    assert(state.actor_command_count==0);
    gbs::tick_iso_event_scheduler(scheduler,state,false);
    assert(state.variables[0]==0);
    gbs::complete_event_actor_movement(*request.motion_owner,request.motion_token);
    gbs::tick_iso_event_scheduler(scheduler,state,false);
    assert(state.variables[0]==13);
    const gbs::EventCommand quick[]={{gbs::EventOp::SetVariable,1,9,0}};
    assert(gbs::run_iso_scheduled_script(scheduler,state,{quick,1}));
    assert(state.variables[1]==9);

    const gbs::EventCommand delayed[]={{gbs::EventOp::Wait,2,0,0},
        {gbs::EventOp::MoveActorTo,0,1,0},{gbs::EventOp::SetVariable,2,8,0}};
    gbs::clear_event_actor_commands(state);
    assert(gbs::run_iso_scheduled_script(scheduler,state,{delayed,3}));
    gbs::tick_iso_event_scheduler(scheduler,state,true);
    assert(state.actor_command_count==0);
    gbs::tick_iso_event_scheduler(scheduler,state,false);
    gbs::tick_iso_event_scheduler(scheduler,state,false);
    assert(state.actor_command_count==0);
    gbs::tick_iso_event_scheduler(scheduler,state,false);
    assert(state.actor_command_count==1 && state.variables[2]==0);
    auto pending=state.actor_commands[0];gbs::clear_event_actor_commands(state);
    gbs::complete_event_actor_movement(*pending.motion_owner,pending.motion_token);
    gbs::tick_iso_event_scheduler(scheduler,state,false);
    assert(state.variables[2]==8);

    gbs::clear_iso_event_scheduler(scheduler);
    gbs::EventCommand distinct[gbs::max_iso_scheduled_scripts+1][2]{};
    for(size_t i=0;i<gbs::max_iso_scheduled_scripts+1;++i) {
        distinct[i][0]={gbs::EventOp::MoveActorTo,0,1,0};
        distinct[i][1]={gbs::EventOp::End,0,0,0};
        const bool accepted=gbs::run_iso_scheduled_script(scheduler,state,{distinct[i],2});
        assert(accepted==(i<gbs::max_iso_scheduled_scripts));
    }
}
