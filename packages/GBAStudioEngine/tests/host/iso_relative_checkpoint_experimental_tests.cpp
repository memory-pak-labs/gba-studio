#include <cassert>
#include "gbs/iso_temporal_checkpoint.hpp"
int main() {
    const gbs::EventCommand script[]={{gbs::EventOp::MoveActorRelative,0,1,0},{gbs::EventOp::SetVariable,0,73,0}};
    gbs::IsometricRoomData room{}; room.width_tiles=8; room.height_tiles=8; room.on_enter={script,2};
    gbs::IsometricProjectData project{}; project.rooms=&room; project.room_count=1;
    gbs::EventState state{}; gbs::init_event_state(state); state.supports_temporal_actor_motion=true;
    gbs::IsoEventScheduler scheduler{}; assert(gbs::run_iso_scheduled_script(scheduler,state,room.on_enter));
    gbs::IsoActor actors[1]{};actors[0].visible=true;actors[0].tile={0,0,0};
    actors[0].position_initialized=true;actors[0].position_x256=96; actors[0].position_y256=0;
    auto request=state.actor_commands[0];request.a=1;request.b=0;request.c=0;
    gbs::IsoTemporalMotionPool motions{};assert(gbs::begin_iso_temporal_motion(motions,request,1));
    motions.moves[0].remainder=42;
    int speeds[gbs::max_isometric_save_actors];for(auto &speed:speeds)speed=100;
    gbs::UniversalSaveData data{};gbs::CheckpointPayloadWriter writer(data);gbs::IsoCheckpointExit exit{};
    assert(gbs::write_iso_temporal_extension(writer,project,0,state,scheduler,motions,actors,1,speeds,exit,true));
    gbs::CheckpointPayloadReader reader(data);gbs::IsoEventScheduler restored{};gbs::IsoTemporalRestore saved{};
    assert(gbs::read_iso_temporal_extension(reader,project,0,state,1,restored,saved,actors,false,true));
    assert(saved.motion_mask==1 && saved.relative_mask==1 && saved.target_x[0]==1 && saved.target_y[0]==0);
    assert(saved.x256[0]==96 && saved.remainder[0]==42);
    auto corrupt=data; const int32_t bad_target=-1;
    gbs::checkpoint_copy_bytes(corrupt.payload+16, &bad_target, sizeof(bad_target));
    gbs::CheckpointPayloadReader bad(corrupt); gbs::IsoTemporalRestore ignored{};
    assert(!gbs::read_iso_temporal_extension(bad,project,0,state,1,restored,ignored,actors,false,true));
    assert(restored.slots[0].runner.active);
    gbs::UniversalSaveData legacy{}; gbs::CheckpointPayloadWriter legacy_writer(legacy);
    assert(!gbs::write_iso_temporal_extension(legacy_writer,project,0,state,scheduler,motions,actors,1,speeds,exit));
}
