#include <cassert>
#include "gbs/iso_temporal_checkpoint.hpp"

int main() {
    const gbs::EventCommand script[]={{gbs::EventOp::MoveActorTo,0,1,0},{gbs::EventOp::SetVariable,0,73,0}};
    gbs::IsometricRoomData room{};room.on_enter={script,2};
    gbs::IsometricProjectData project{};project.rooms=&room;project.room_count=1;
    gbs::EventState state{};gbs::init_event_state(state);state.supports_temporal_actor_motion=true;
    gbs::IsoEventScheduler scheduler{};assert(gbs::run_iso_scheduled_script(scheduler,state,room.on_enter));
    gbs::IsoActor actors[2]{};actors[0].visible=true;actors[0].tile={0,0,0};
    actors[0].position_initialized=true;actors[0].position_x256=96;actors[0].position_y256=0;
    gbs::IsoTemporalMotionPool motions{};assert(gbs::begin_iso_temporal_motion(motions,state.actor_commands[0],2));
    motions.moves[0].remainder=42;
    int speeds[gbs::max_isometric_save_actors];for(auto& speed:speeds)speed=100;speeds[0]=125;
    gbs::IsoCheckpointExit exit{};
    gbs::UniversalSaveData data{};gbs::CheckpointPayloadWriter writer(data);
    assert(gbs::write_iso_temporal_extension(writer,project,0,state,scheduler,motions,actors,2,speeds,exit));
    gbs::clear_event_actor_commands(state);
    gbs::CheckpointPayloadReader reader(data);gbs::IsoEventScheduler restored{};gbs::IsoTemporalRestore restore{};
    assert(gbs::read_iso_temporal_extension(reader,project,0,state,2,restored,restore,actors));
    assert(reader.complete() && restore.motion_mask==1 && restore.x256[0]==96 && restore.remainder[0]==42 && restore.speeds[0]==125);
    gbs::tick_iso_event_scheduler(restored,state,false);
    assert(state.actor_command_count==1 && state.actor_commands[0].motion_owner==&restored.slots[0].runner);
    // Reject a malformed mask without replacing the live runner.
    auto broken=data;broken.payload[0]=0xff;broken.payload[1]=0xff;
    gbs::CheckpointPayloadReader bad(broken);gbs::IsoTemporalRestore ignored{};
    assert(!gbs::read_iso_temporal_extension(bad,project,0,state,2,restored,ignored));
    assert(restored.slots[0].runner.active);
    // A fractional position must belong to the actor's saved tile. A corrupt
    // position must not replace an already running scheduler.
    auto wrong_position=data;
    const int32_t wrong_x=512;
    gbs::checkpoint_copy_bytes(wrong_position.payload+8,&wrong_x,sizeof(wrong_x));
    gbs::CheckpointPayloadReader bad_position(wrong_position);
    assert(!gbs::read_iso_temporal_extension(bad_position,project,0,state,2,restored,ignored,actors));
    assert(restored.slots[0].runner.active);
    // A valid slot number is insufficient: its script must move this actor.
    const gbs::EventCommand other_script[]={{gbs::EventOp::MoveActorTo,1,1,0}};
    room.on_update={other_script,1};
    assert(gbs::run_iso_scheduled_script(scheduler,state,room.on_update));
    gbs::UniversalSaveData two_slots{};gbs::CheckpointPayloadWriter two_writer(two_slots);
    assert(gbs::write_iso_temporal_extension(two_writer,project,0,state,scheduler,motions,actors,2,speeds,exit));
    two_slots.payload[17]=1; // owner ordinal for actor 0, after its remainder
    gbs::CheckpointPayloadReader wrong_owner(two_slots);
    assert(!gbs::read_iso_temporal_extension(wrong_owner,project,0,state,2,restored,ignored,actors));
    assert(restored.slots[0].runner.active);
}
