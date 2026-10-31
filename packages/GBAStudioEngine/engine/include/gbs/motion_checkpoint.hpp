#pragma once
#include "gbs/event_threads.hpp"
#include "gbs/runtime_checkpoint.hpp"
#include "gbs/scripted_movement.hpp"
#include <limits.h>

namespace gbs {
// The caller maps scripts to stable IDs and validates actor coordinates. No
// pointer is written into the save. The reader validates before mutating state.
struct MotionCheckpointAccess {
    int32_t (*identify)(EventScript, void*);
    EventScript (*resolve)(int32_t, void*);
    bool (*capture_actor)(int, Vec2i&, int&, void*);
    bool (*validate_actor)(int, Vec2i, int, void*);
    void (*apply_actor)(int, Vec2i, int, void*);
    void* context;
    bool allow_external_threads = false;
};
inline const EventCommand* motion_checkpoint_command(const EventRunner& runner, const EventState& state) {
    EventScript script=runner.script; size_t index=runner.command_index;
    if (runner.call_depth) {
        const auto& call=runner.calls[runner.call_depth-1];
        if (!state.project_scripts || call.script_index>=state.project_script_count) return nullptr;
        script=state.project_scripts[call.script_index]; index=call.command_index;
    }
    return has_event_script(script) && index<script.command_count ? &script.commands[index] : nullptr;
}
inline int motion_checkpoint_owner(const EventRunner* runner, const EventRunner& main, const EventThreadPool& threads) {
    if (runner==&main) return 0;
    for(size_t i=0;i<max_event_segments;++i) if(runner==&threads.threads[i].runner) return static_cast<int>(i)+1;
    return -1;
}
inline bool write_motion_checkpoint(CheckpointPayloadWriter& out, const EventState& state, const EventRunner& main,
    int main_wait, bool main_flags, const EventThreadPool& threads, const EventScriptQueue& queue,
    const ScriptedMovementPool& motions, const MotionCheckpointAccess& access) {
    if (!access.identify || !access.resolve || !access.capture_actor || !access.validate_actor || !access.apply_actor ||
        main_wait<0 || queue.count>max_event_script_queue_entries) return false;
    const uint8_t main_active=main.active ? 1 : 0;
    if (!out.write(main_active) || !out.write(static_cast<uint32_t>(main_wait)) ||
        !out.write(static_cast<uint8_t>(main_flags))) return false;
    if(main_active) {
        int32_t id=access.identify(main.script,access.context); if(id<0 || !write_checkpoint_script(out,capture_checkpoint_script(main,id,state))) return false;
    }
    uint8_t thread_count=0;
    for(size_t i=0;i<max_event_segments;++i) if(state.segment_active[i]) {
        if(!threads.threads[i].runner.active || threads.threads[i].revision!=state.segment_revision[i] || threads.threads[i].wait_frames<0) return false;
        ++thread_count;
    }
    if(!out.write(thread_count)) return false;
    for(size_t i=0;i<max_event_segments;++i) if(state.segment_active[i]) {
        const auto& thread=threads.threads[i]; const int32_t id=access.identify(thread.runner.script,access.context);
        if(id<0 || (state.segment_script[i]<0 && !access.allow_external_threads) || !out.write(static_cast<uint8_t>(i)) || !out.write(state.segment_script[i]) ||
            !out.write(static_cast<uint32_t>(thread.wait_frames)) || !write_checkpoint_script(out,capture_checkpoint_script(thread.runner,id,state))) return false;
    }
    if(!out.write(static_cast<uint8_t>(queue.count))) return false;
    for(size_t i=0;i<queue.count;++i) {
        const auto& item=queue.entries[(queue.head+i)%max_event_script_queue_entries];int32_t id=access.identify(item.script,access.context);
        if(id<0 || !out.write(id) || !out.write(checkpoint_script_hash(item.script)) || !out.write(item.flags)) return false;
    }
    uint8_t count=0;for(const auto& move:motions.moves)if(scripted_movement_is_live(move))++count;
    if(!out.write(count))return false;
    for(const auto& move:motions.moves) if(scripted_movement_is_live(move)) {
        const int owner=motion_checkpoint_owner(move.owner,main,threads);Vec2i position{};int speed=0;
        const EventCommand* cmd=motion_checkpoint_command(*move.owner,state);
        if(owner<0 || !cmd || (cmd->op!=EventOp::MoveActorTo && cmd->op!=EventOp::MoveActorRelative) || cmd->a!=move.actor_index ||
            move.remainder<0 || move.remainder>=100 || !access.capture_actor(move.actor_index,position,speed,access.context) ||
            !access.validate_actor(move.actor_index,position,speed,access.context) ||
            !access.validate_actor(move.actor_index,move.target,speed,access.context)) return false;
        if(!out.write(static_cast<uint8_t>(owner)) || !out.write(static_cast<int32_t>(move.actor_index)) ||
            !out.write(position.x) || !out.write(position.y) || !out.write(move.target.x) || !out.write(move.target.y) ||
            !out.write(static_cast<int32_t>(speed)) || !out.write(static_cast<uint8_t>(move.remainder))) return false;
    }
    return true;
}
inline bool parse_motion_checkpoint(CheckpointPayloadReader& in, EventState& state, EventRunner& main,
    int& main_wait, bool& main_flags, EventThreadPool& threads, EventScriptQueue& queue,
    ScriptedMovementPool& motions, const MotionCheckpointAccess& access, bool apply) {
    if(!access.identify || !access.resolve || !access.capture_actor || !access.validate_actor || !access.apply_actor) return false;
    int expected_actor[max_event_segments+1];for(auto& value:expected_actor)value=INT_MIN;
    bool owner_seen[max_event_segments+1]{};uint8_t main_active=0,flags=0;uint32_t wait=0;
    if(!in.read(main_active) || main_active>1 || !in.read(wait) || wait>INT_MAX || !in.read(flags) || flags>1) return false;
    if(apply) {stop_event_runner(main);reset_event_threads(threads,state);clear_event_script_queue(queue);clear_scripted_movements(motions);main_wait=static_cast<int>(wait);main_flags=flags!=0;}
    auto read_runner=[&](EventRunner& destination, size_t owner)->bool {
        CheckpointScript saved{};EventRunner candidate{};
        if(!read_checkpoint_script(in,saved) || !saved.active || !restore_checkpoint_script(saved,access.resolve(saved.script_index,access.context),candidate,&state)) return false;
        const auto* command=motion_checkpoint_command(candidate,state);
        if(command && (command->op==EventOp::MoveActorTo || command->op==EventOp::MoveActorRelative)) expected_actor[owner]=command->a;
        destination=candidate;
        return true;
    };
    EventRunner dummy{};
    if(main_active && !read_runner(apply ? main : dummy,0)) return false;
    uint8_t thread_count=0;if(!in.read(thread_count) || thread_count>max_event_segments) return false;
    bool slots[max_event_segments]{};
    for(size_t i=0;i<thread_count;++i) {
        uint8_t slot=0;int32_t script_index=-1;uint32_t thread_wait=0;
        if(!in.read(slot) || slot>=max_event_segments || slots[slot] || !in.read(script_index) ||
           (script_index<0 && (!access.allow_external_threads || script_index!=-1)) ||
           (script_index>=0 && (!state.project_scripts || static_cast<size_t>(script_index)>=state.project_script_count)) ||
           !in.read(thread_wait) || thread_wait>INT_MAX) return false;
        slots[slot]=true;
        EventRunner& target_runner=apply ? threads.threads[slot].runner : dummy;
        if(!read_runner(target_runner,slot+1))return false;
        if(script_index>=0) {
            const auto project_script=state.project_scripts[script_index];
            if(target_runner.script.commands!=project_script.commands || target_runner.script.command_count!=project_script.command_count) return false;
        }
        if(apply) {
            auto& t=threads.threads[slot];t.wait_frames=static_cast<int>(thread_wait);t.runner.step_budget=1;
            state.segment_active[slot]=true;state.segment_script[slot]=script_index;++state.segment_revision[slot];t.revision=state.segment_revision[slot];
        }
    }
    uint8_t queue_count=0;if(!in.read(queue_count) || queue_count>max_event_script_queue_entries)return false;
    for(size_t i=0;i<queue_count;++i) {int32_t id=-1;uint32_t hash=0;uint8_t qflags=0;
        if(!in.read(id)||!in.read(hash)||!in.read(qflags))return false;const auto script=access.resolve(id,access.context);
        if(!has_event_script(script)||checkpoint_script_hash(script)!=hash)return false;
        if(apply && !enqueue_event_script(queue,script,qflags))return false;
    }
    uint8_t count=0;if(!in.read(count)||count>max_scripted_movements)return false;
    int used_actors[max_scripted_movements]{};
    for(size_t i=0;i<count;++i) {
        uint8_t owner=0,remainder=0;int32_t actor=0,speed=0;Vec2i position{},target{};
        if(!in.read(owner)||owner>max_event_segments||owner_seen[owner]||!in.read(actor)||expected_actor[owner]!=actor ||
           !in.read(position.x)||!in.read(position.y)||!in.read(target.x)||!in.read(target.y)||!in.read(speed)||
           !in.read(remainder)||remainder>=100 || !access.validate_actor(actor,position,speed,access.context) ||
           !access.validate_actor(actor,target,speed,access.context))return false;
        for(size_t j=0;j<i;++j) if(used_actors[j]==actor)return false;
        used_actors[i]=actor;owner_seen[owner]=true;
        if(apply) {
            EventRunner& runner=owner==0 ? main : threads.threads[owner-1].runner;
            if(++state.actor_motion_serial==0)++state.actor_motion_serial;
            runner.actor_motion_token=state.actor_motion_serial;runner.actor_motion_pending=true;
            motions.moves[i]={&runner,runner.actor_motion_token,actor,target,remainder};
            access.apply_actor(actor,position,speed,access.context);
        }
    }
    return in.complete();
}
inline bool read_motion_checkpoint(CheckpointPayloadReader& in, EventState& state, EventRunner& main,
    int& main_wait, bool& main_flags, EventThreadPool& threads, EventScriptQueue& queue,
    ScriptedMovementPool& motions, const MotionCheckpointAccess& access, bool validate_only=false) {
    auto probe=in;
    if(!parse_motion_checkpoint(probe,state,main,main_wait,main_flags,threads,queue,motions,access,false))return false;
    if(validate_only) return in.commit(probe);
    return parse_motion_checkpoint(in,state,main,main_wait,main_flags,threads,queue,motions,access,true);
}
}
