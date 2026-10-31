#include <cassert>
#include "gbs/motion_checkpoint.hpp"

namespace {
const gbs::EventCommand move_script[] = {{gbs::EventOp::MoveActorRelative,-1,32,0}, {gbs::EventOp::SetVariable,0,73,0}};
const gbs::EventCommand main_script[] = {{gbs::EventOp::SaveGame,0,0,0}, {gbs::EventOp::End,0,0,0}};
const gbs::EventScript scripts[] = {{move_script,2},{main_script,2}};
int32_t identify(gbs::EventScript script, void*) { for(int i=0;i<2;++i) if(script.commands==scripts[i].commands && script.command_count==scripts[i].command_count) return i; return -1; }
gbs::EventScript resolve(int32_t id, void*) {return id>=0 && id<2 ? scripts[id] : gbs::empty_event_script();}
struct ActorState {gbs::Vec2i position; int speed;};
bool capture(int index, gbs::Vec2i& position, int& speed, void* context) {if(index!=-1)return false;auto& a=*static_cast<ActorState*>(context);position=a.position;speed=a.speed;return true;}
bool validate(int index, gbs::Vec2i position, int speed, void*) {return index==-1 && position.x>=0 && position.x<128 && speed>=0;}
void apply(int, gbs::Vec2i position, int speed, void* context) {auto& a=*static_cast<ActorState*>(context);a.position=position;a.speed=speed;}
}
int main() {
 gbs::EventState state{};gbs::init_event_state(state);state.supports_temporal_actor_motion=true;gbs::bind_event_scripts(state,scripts,2);
 gbs::EventRunner main{};gbs::start_event_runner(main,scripts[1]);main.command_index=1;
 gbs::EventThreadPool threads{};state.segment_active[0]=true;state.segment_script[0]=0;state.segment_revision[0]=1;threads.threads[0].revision=1;gbs::start_event_runner(threads.threads[0].runner,scripts[0]);
 assert(gbs::update_event_runner(threads.threads[0].runner,state));
 gbs::ScriptedMovementPool motions{};auto request=state.actor_commands[0];request.a=96;request.b=0;request.c=0;assert(gbs::start_scripted_movement(motions,request));motions.moves[0].remainder=42;
 gbs::EventScriptQueue queue{};gbs::init_event_script_queue(queue);assert(gbs::enqueue_event_script(queue,scripts[1],7));
 ActorState actor{{60,0},125};gbs::MotionCheckpointAccess access{identify,resolve,capture,validate,apply,&actor};
 gbs::UniversalSaveData saved{};gbs::CheckpointPayloadWriter writer(saved);
 assert(gbs::write_motion_checkpoint(writer,state,main,3,true,threads,queue,motions,access));
 gbs::EventState next{};gbs::init_event_state(next);next.supports_temporal_actor_motion=true;gbs::bind_event_scripts(next,scripts,2);
 gbs::EventRunner resumed{};gbs::EventThreadPool new_threads{};gbs::EventScriptQueue new_queue{};gbs::ScriptedMovementPool new_motions{};int wait=0;bool on_entry=false;actor.position={1,0};actor.speed=0;
 gbs::CheckpointPayloadReader reader(saved);assert(gbs::read_motion_checkpoint(reader,next,resumed,wait,on_entry,new_threads,new_queue,new_motions,access));
 assert(actor.position.x==60 && actor.speed==125 && wait==3 && on_entry && new_queue.count==1);
 assert(new_threads.threads[0].runner.actor_motion_pending && new_motions.moves[0].target.x==96 && new_motions.moves[0].remainder==42);
 assert(new_motions.moves[0].owner==&new_threads.threads[0].runner && next.segment_active[0]);
 auto mismatch=saved;const int32_t wrong_script=1;gbs::checkpoint_copy_bytes(mismatch.payload+22,&wrong_script,sizeof(wrong_script));
 gbs::CheckpointPayloadReader mismatch_reader(mismatch);actor.position={77,0};
 assert(!gbs::read_motion_checkpoint(mismatch_reader,next,resumed,wait,on_entry,new_threads,new_queue,new_motions,access));assert(actor.position.x==77);
 auto corrupt=saved;corrupt.payload[0]=255;gbs::CheckpointPayloadReader bad(corrupt);actor.position={77,0};
 assert(!gbs::read_motion_checkpoint(bad,next,resumed,wait,on_entry,new_threads,new_queue,new_motions,access));assert(actor.position.x==77 && new_threads.threads[0].runner.active);
 // Platformer NPC runners may refer to scene-owned scripts instead of project segments.
 auto external=state;external.segment_script[0]=-1;gbs::MotionCheckpointAccess external_access=access;external_access.allow_external_threads=true;
 gbs::UniversalSaveData external_save{};gbs::CheckpointPayloadWriter external_writer(external_save);
 assert(gbs::write_motion_checkpoint(external_writer,external,main,3,true,threads,queue,motions,external_access));
 gbs::EventState external_next{};gbs::init_event_state(external_next);gbs::bind_event_scripts(external_next,scripts,2);
 gbs::EventRunner external_main{};gbs::EventThreadPool external_threads{};gbs::EventScriptQueue external_queue{};gbs::ScriptedMovementPool external_motions{};
 int external_wait=0;bool external_flags=false;gbs::CheckpointPayloadReader external_reader(external_save);
 assert(gbs::read_motion_checkpoint(external_reader,external_next,external_main,external_wait,external_flags,external_threads,external_queue,external_motions,external_access));
 assert(external_threads.threads[0].runner.actor_motion_pending && external_motions.moves[0].target.x==96);
 // A bounded save must fail explicitly instead of silently omitting active scripts.
 gbs::EventState crowded{};gbs::init_event_state(crowded);gbs::bind_event_scripts(crowded,scripts,2);gbs::EventThreadPool many{};
 for(size_t i=0;i<gbs::max_event_segments;++i){crowded.segment_active[i]=true;crowded.segment_script[i]=0;crowded.segment_revision[i]=1;many.threads[i].revision=1;gbs::start_event_runner(many.threads[i].runner,scripts[0]);}
 gbs::UniversalSaveData too_large{};gbs::CheckpointPayloadWriter full_writer(too_large);
 assert(!gbs::write_motion_checkpoint(full_writer,crowded,main,0,false,many,queue,motions,access));
 assert(too_large.payload_size>550);
}
