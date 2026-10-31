#include <cassert>
#include "gbs/platformer_motion_checkpoint.hpp"
int main() {
 const gbs::EventCommand move[]={{gbs::EventOp::MoveActorRelative,-1,32,0},{gbs::EventOp::SetVariable,0,73,0}};
 const gbs::EventCommand npc_move[]={{gbs::EventOp::MoveActorTo,0,80,40},{gbs::EventOp::SetVariable,1,74,0}};
 gbs::PlatformerNpcData actor_data{};actor_data.size_pixels={8,8};actor_data.on_start={npc_move,2};
 gbs::PlatformerRoomData scene{};scene.width_tiles=20;scene.height_tiles=20;scene.player_start={0,0,8,8};scene.on_enter={move,2};scene.npcs=&actor_data;scene.npc_count=1;
 gbs::PlatformerProjectData project{};project.rooms=&scene;project.room_count=1;
 gbs::EventState events{};gbs::init_event_state(events);events.supports_temporal_actor_motion=true;
 gbs::EventRunner main{};gbs::start_event_runner(main,scene.on_enter);assert(gbs::update_event_runner(main,events));
 gbs::EventRunner npcrunners[16]{};gbs::start_event_runner(npcrunners[0],actor_data.on_start);assert(gbs::update_event_runner(npcrunners[0],events));
 gbs::EventRunner interaction{};int wait=2,npcWait[16]{};bool startComplete[16]{};gbs::EventScriptQueue queue{};gbs::init_event_script_queue(queue);
 gbs::ScriptedMovementPool motions{};auto first=events.actor_commands[0];first.a=56;first.b=40;first.c=0;assert(gbs::start_scripted_movement(motions,first));auto second=events.actor_commands[1];assert(gbs::start_scripted_movement(motions,second));
 gbs::PlatformerActor player{};player.bounds_pixels={28,40,8,8};gbs::PlatformerNpcRuntime npcs[16]{};npcs[0].actor={{72,40},{8,8},0};npcs[0].visible=true;npcs[0].active=true;int playerSpeed=100,npcSpeed[16]{};npcSpeed[0]=125;
 gbs::PlatformerMotionView view{&project,0,&events,&main,&wait,&queue,npcrunners,npcWait,startComplete,&interaction,&motions,&player,npcs,1,&playerSpeed,npcSpeed};
 gbs::PlatformerMotionScratch scratch{};gbs::UniversalSaveData save{};gbs::CheckpointPayloadWriter writer(save);assert(gbs::write_platformer_motion_checkpoint(writer,view,scratch));
 gbs::stop_event_runner(main);gbs::stop_event_runner(npcrunners[0]);gbs::clear_scripted_movements(motions);player.bounds_pixels.x=10;npcs[0].actor.position_pixels.x=10;playerSpeed=0;npcSpeed[0]=0;
 gbs::CheckpointPayloadReader reader(save);assert(gbs::read_platformer_motion_checkpoint(reader,view,scratch));
 assert(player.bounds_pixels.x==28 && npcs[0].actor.position_pixels.x==72);assert(playerSpeed==100 && npcSpeed[0]==125);
 assert(main.actor_motion_pending && npcrunners[0].actor_motion_pending && motions.moves[0].target.x==56 && motions.moves[1].target.x==80);
 assert(motions.moves[0].owner==&main && motions.moves[1].owner==&npcrunners[0]);
 auto corrupt=save;corrupt.payload[0]=255;gbs::CheckpointPayloadReader bad(corrupt);player.bounds_pixels.x=33;
 assert(!gbs::read_platformer_motion_checkpoint(bad,view,scratch));assert(player.bounds_pixels.x==33 && main.active);
 startComplete[0]=true;gbs::CheckpointPayloadReader mismatched(save);
 assert(!gbs::read_platformer_motion_checkpoint(mismatched,view,scratch));assert(player.bounds_pixels.x==33 && main.active);startComplete[0]=false;
 gbs::UniversalSaveData limited{};gbs::CheckpointPayloadWriter bounded(limited);uint8_t prefix[550]{};assert(bounded.write_bytes(prefix,sizeof(prefix)));
 assert(!gbs::write_platformer_motion_checkpoint(bounded,view,scratch));assert(limited.payload_size>550);
}
