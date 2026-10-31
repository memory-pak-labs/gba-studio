#include <cassert>
#include "gbs/iso_checkpoint_scheduler.hpp"

int main() {
    const gbs::EventCommand child[]={{gbs::EventOp::MoveActorTo,0,1,0},{gbs::EventOp::SetVariable,0,10,0}};
    const gbs::EventScript scripts[]={{child,2}};
    const gbs::EventCommand root[]={{gbs::EventOp::CallScript,0,0,0},{gbs::EventOp::AddVariable,0,3,0}};
    gbs::IsometricRoomData room{};room.on_enter={root,2};
    gbs::IsometricProjectData project{};project.rooms=&room;project.room_count=1;project.scripts=scripts;project.script_count=1;
    gbs::EventState state{};gbs::init_event_state(state);state.supports_temporal_actor_motion=true;gbs::bind_event_scripts(state,scripts,1);
    gbs::IsoEventScheduler scheduler{};assert(gbs::run_iso_scheduled_script(scheduler,state,room.on_enter));
    assert(state.actor_command_count==1 && scheduler.slots[0].runner.call_depth==1);
    gbs::UniversalSaveData data{};gbs::CheckpointPayloadWriter writer(data);
    assert(gbs::write_iso_event_scheduler(writer,project,0,state,scheduler));
    gbs::clear_event_actor_commands(state);
    gbs::IsoEventScheduler restored{};gbs::CheckpointPayloadReader reader(data);
    assert(gbs::read_iso_event_scheduler(reader,project,0,state,restored) && reader.complete());
    assert(restored.slots[0].runner.active && restored.slots[0].runner.call_depth==1);
    gbs::tick_iso_event_scheduler(restored,state,false);
    assert(state.actor_command_count==1 && state.variables[0]==0);
    auto command=state.actor_commands[0];gbs::clear_event_actor_commands(state);
    assert(command.motion_owner==&restored.slots[0].runner);
    gbs::complete_event_actor_movement(*command.motion_owner,command.motion_token);
    gbs::tick_iso_event_scheduler(restored,state,false);
    assert(state.variables[0]==13);
    // Hash mismatch must reject the save without mutating the current scheduler.
    auto corrupt=data;corrupt.payload[9]^=0x40;
    gbs::CheckpointPayloadReader bad(corrupt);
    gbs::IsoEventScheduler intact{};gbs::start_event_runner(intact.slots[0].runner,{root,2});
    assert(!gbs::read_iso_event_scheduler(bad,project,0,state,intact));
    assert(intact.slots[0].runner.active && intact.slots[0].runner.script.commands==root);
    // A checkpoint exceeding the actual save envelope must fail explicitly.
    gbs::IsoEventScheduler many{};
    for(auto& slot:many.slots) gbs::start_event_runner(slot.runner,{root,2});
    gbs::UniversalSaveData limited{};gbs::CheckpointPayloadWriter limited_writer(limited);
    uint8_t room_payload[336]{};assert(limited_writer.write_bytes(room_payload,sizeof(room_payload)));
    assert(!gbs::write_iso_event_scheduler(limited_writer,project,0,state,many));
    // An unregistered script cannot be restored safely and is rejected on capture.
    const gbs::EventCommand unknown[]={{gbs::EventOp::MoveActorTo,0,1,1}};
    gbs::IsoEventScheduler orphan{};gbs::start_event_runner(orphan.slots[0].runner,{unknown,1});
    gbs::UniversalSaveData unregistered{};gbs::CheckpointPayloadWriter unknown_writer(unregistered);
    assert(!gbs::write_iso_event_scheduler(unknown_writer,project,0,state,orphan));
}
