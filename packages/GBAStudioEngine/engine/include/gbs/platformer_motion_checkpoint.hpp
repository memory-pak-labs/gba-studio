#pragma once
#include "gbs/motion_checkpoint.hpp"
#include "gbs/platformer_motion_catalog.hpp"
namespace gbs {
constexpr size_t platformer_motion_max_npcs=16;
constexpr size_t platformer_motion_interaction_slot=platformer_motion_max_npcs;
struct PlatformerMotionView {
    const PlatformerProjectData* project;int room;EventState* events;EventRunner* main;int* wait;EventScriptQueue* queue;
    EventRunner* npc_runners;int* npc_wait;bool* npc_started;EventRunner* interaction;ScriptedMovementPool* motions;
    PlatformerActor* player;PlatformerNpcRuntime* npcs;size_t npc_count;int* player_speed;int* npc_speeds;
};
struct PlatformerMotionScratch {
    PlatformerMotionCatalog catalog{};EventState state{};EventRunner main{};int wait=0;bool flags=false;
    EventThreadPool threads{};EventScriptQueue queue{};ScriptedMovementPool motions{};
    Vec2i positions[platformer_motion_max_npcs+1]{};int speeds[platformer_motion_max_npcs+1]{};
    uint32_t changed=0;
};
inline int32_t platformer_checkpoint_identify(EventScript s,void* p){return platformer_motion_identify(s,&static_cast<PlatformerMotionScratch*>(p)->catalog);}
inline EventScript platformer_checkpoint_resolve(int32_t id,void* p){return platformer_motion_resolve(id,&static_cast<PlatformerMotionScratch*>(p)->catalog);}
inline bool platformer_checkpoint_actor_valid(int index,Vec2i position,int speed,void* opaque){
    auto& c=static_cast<PlatformerMotionScratch*>(opaque)->catalog;
    if(!c.project || !is_valid_platformer_room_index(*c.project,c.room) || speed<0 || speed>100000)return false;
    const auto& room=c.project->rooms[c.room];Vec2i size{};
    if(index==event_player_actor_index)size={room.player_start.width,room.player_start.height};
    else if(index>=0 && room.npcs && static_cast<size_t>(index)<room.npc_count)size=room.npcs[index].size_pixels;
    else return false;
    return position.x>=0 && position.y>=0 && static_cast<int64_t>(position.x)+size.x<=room.width_tiles*8 &&
        static_cast<int64_t>(position.y)+size.y<=room.height_tiles*8;
}
inline size_t platformer_checkpoint_actor_slot(int index){return index==event_player_actor_index ? 0 : static_cast<size_t>(index)+1;}
inline bool platformer_checkpoint_capture_actor(int index,Vec2i& position,int& speed,void* opaque){
    if(index < event_player_actor_index || index>=static_cast<int>(platformer_motion_max_npcs))return false;
    auto& scratch=*static_cast<PlatformerMotionScratch*>(opaque);const size_t slot=platformer_checkpoint_actor_slot(index);
    position=scratch.positions[slot];speed=scratch.speeds[slot];return true;
}
inline void platformer_checkpoint_apply_actor(int index,Vec2i position,int speed,void* opaque){
    auto& scratch=*static_cast<PlatformerMotionScratch*>(opaque);const size_t slot=platformer_checkpoint_actor_slot(index);
    scratch.positions[slot]=position;scratch.speeds[slot]=speed;scratch.changed |= 1u<<slot;
}
inline MotionCheckpointAccess platformer_checkpoint_access(PlatformerMotionScratch& scratch){
    return {platformer_checkpoint_identify,platformer_checkpoint_resolve,platformer_checkpoint_capture_actor,
        platformer_checkpoint_actor_valid,platformer_checkpoint_apply_actor,&scratch,true};
}
inline bool valid_platformer_motion_view(const PlatformerMotionView& v){
 return v.project && is_valid_platformer_room_index(*v.project,v.room) && v.events && v.main && v.wait && v.queue &&
    v.npc_runners && v.npc_wait && v.npc_started && v.interaction && v.motions && v.player && v.npcs &&
    v.npc_count<=platformer_motion_max_npcs && v.player_speed && v.npc_speeds;
}
inline void initialize_platformer_motion_scratch(const PlatformerMotionView& v,PlatformerMotionScratch& scratch){
    scratch.catalog={v.project,v.room};scratch.state=*v.events;scratch.main=*v.main;scratch.wait=*v.wait;scratch.flags=false;
    scratch.threads=EventThreadPool{};scratch.queue=*v.queue;scratch.motions=ScriptedMovementPool{};scratch.changed=0;
    for(size_t i=0;i<max_event_segments;++i){scratch.state.segment_active[i]=false;scratch.state.segment_script[i]=-1;}
    scratch.positions[0]=platformer_actor_anchor_position(*v.player);scratch.speeds[0]=*v.player_speed;
    for(size_t i=0;i<v.npc_count;++i){scratch.positions[i+1]=v.npcs[i].actor.position_pixels;scratch.speeds[i+1]=v.npc_speeds[i];}
}
inline EventRunner* platformer_shadow_owner(const PlatformerMotionView& v,PlatformerMotionScratch& s,const EventRunner* owner){
    if(owner==v.main)return &s.main;if(owner==v.interaction)return &s.threads.threads[platformer_motion_interaction_slot].runner;
    for(size_t i=0;i<v.npc_count;++i)if(owner==&v.npc_runners[i])return &s.threads.threads[i].runner;return nullptr;
}
inline bool write_platformer_motion_checkpoint(CheckpointPayloadWriter& writer,const PlatformerMotionView& v,PlatformerMotionScratch& scratch){
    if(!valid_platformer_motion_view(v))return false;initialize_platformer_motion_scratch(v,scratch);
    for(size_t i=0;i<=platformer_motion_interaction_slot;++i){
        const EventRunner& source=i==platformer_motion_interaction_slot ? *v.interaction : v.npc_runners[i];
        if(i>=v.npc_count && i!=platformer_motion_interaction_slot)continue;
        if(!source.active)continue;auto& thread=scratch.threads.threads[i];thread.runner=source;
        thread.wait_frames=i==platformer_motion_interaction_slot ? 0 : v.npc_wait[i];thread.revision=1;
        scratch.state.segment_active[i]=true;scratch.state.segment_script[i]=-1;scratch.state.segment_revision[i]=1;
    }
    for(size_t i=0;i<max_scripted_movements;++i){
        const auto& motion=v.motions->moves[i];if(!scripted_movement_is_live(motion))continue;
        auto* owner=platformer_shadow_owner(v,scratch,motion.owner);if(!owner)return false;
        scratch.motions.moves[i]=motion;scratch.motions.moves[i].owner=owner;
    }
    return write_motion_checkpoint(writer,scratch.state,scratch.main,scratch.wait,false,scratch.threads,scratch.queue,scratch.motions,platformer_checkpoint_access(scratch));
}
inline bool same_platformer_checkpoint_script(EventScript left,EventScript right){return left.commands==right.commands&&left.command_count==right.command_count;}
inline bool read_platformer_motion_checkpoint(CheckpointPayloadReader& reader,const PlatformerMotionView& v,PlatformerMotionScratch& scratch,bool validate_only=false){
    if(!valid_platformer_motion_view(v))return false;initialize_platformer_motion_scratch(v,scratch);auto cursor=reader;
    if(!read_motion_checkpoint(cursor,scratch.state,scratch.main,scratch.wait,scratch.flags,scratch.threads,scratch.queue,scratch.motions,platformer_checkpoint_access(scratch)))return false;
    const auto& room=v.project->rooms[v.room];
    for(size_t i=0;i<max_event_segments;++i)if(scratch.state.segment_active[i]){
        const auto script=scratch.threads.threads[i].runner.script;bool valid=false;
        if(i<v.npc_count)valid=same_platformer_checkpoint_script(script,v.npc_started[i] ? room.npcs[i].on_update : room.npcs[i].on_start);
        else if(i==platformer_motion_interaction_slot)for(size_t j=0;j<v.npc_count;++j)valid=valid||same_platformer_checkpoint_script(script,room.npcs[j].on_interact);
        if(!valid)return false;
    }
    if(validate_only)return reader.commit(cursor);
    *v.main=scratch.main;*v.wait=scratch.wait;*v.queue=scratch.queue;
    for(size_t i=0;i<v.npc_count;++i){v.npc_runners[i]=scratch.threads.threads[i].runner;v.npc_wait[i]=scratch.threads.threads[i].wait_frames;}
    *v.interaction=scratch.threads.threads[platformer_motion_interaction_slot].runner;
    *v.motions=ScriptedMovementPool{};
    for(size_t i=0;i<max_scripted_movements;++i){auto motion=scratch.motions.moves[i];if(!motion.owner)continue;
        if(motion.owner==&scratch.main)motion.owner=v.main;
        else if(motion.owner==&scratch.threads.threads[platformer_motion_interaction_slot].runner)motion.owner=v.interaction;
        else {bool found=false;for(size_t j=0;j<v.npc_count;++j)if(motion.owner==&scratch.threads.threads[j].runner){motion.owner=&v.npc_runners[j];found=true;break;}if(!found)return false;}
        v.motions->moves[i]=motion;
    }
    v.events->actor_motion_serial=scratch.state.actor_motion_serial;
    if(scratch.changed&1u){set_platformer_actor_anchor_position(*v.player,scratch.positions[0]);*v.player_speed=scratch.speeds[0];}
    for(size_t i=0;i<v.npc_count;++i)if(scratch.changed&(1u<<(i+1))){v.npcs[i].actor.position_pixels=scratch.positions[i+1];v.npc_speeds[i]=scratch.speeds[i+1];}
    return reader.commit(cursor);
}
}
