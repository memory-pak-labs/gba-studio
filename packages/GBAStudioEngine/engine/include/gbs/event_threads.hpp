#pragma once
#include "gbs/event.hpp"
namespace gbs {
struct EventThreadContext {
 EventRunner runner{};
 int wait_frames=0;
 uint32_t revision=0;
};
struct EventThreadPool { EventThreadContext threads[max_event_segments]{}; size_t cursor=0; };
inline void reset_event_threads(EventThreadPool& pool, EventState& state) {
 pool.cursor=0;
 for(size_t i=0;i<max_event_segments;++i) { pool.threads[i]=EventThreadContext{};state.segment_active[i]=false;state.segment_script[i]=-1; }
}
// One instruction per active thread per frame keeps loops bounded and fair.
inline void tick_event_threads(EventThreadPool& pool, EventState& state, const EventScript* scripts, size_t script_count) {
 const int main_wait=state.wait_frames, main_call=state.last_script;
 const auto* main_scripts=state.project_scripts;
 const size_t main_script_count=state.project_script_count;
 bind_event_scripts(state,scripts,script_count);
 for(size_t offset=0;offset<max_event_segments;++offset) {
  const size_t slot=(pool.cursor+offset)%max_event_segments;
  EventThreadContext& thread=pool.threads[slot];
  if(!state.segment_active[slot]) { thread=EventThreadContext{};continue; }
  if(thread.revision!=state.segment_revision[slot]) {
   thread=EventThreadContext{};thread.revision=state.segment_revision[slot];
   const int script=state.segment_script[slot];
   if(scripts==nullptr || script<0 || static_cast<size_t>(script)>=script_count) { state.segment_active[slot]=false;continue; }
   start_event_runner(thread.runner,scripts[script]);thread.runner.step_budget=1;
  }
  if(thread.wait_frames>0) { --thread.wait_frames;continue; }
  if(!thread.runner.active) { state.segment_active[slot]=false;continue; }
  state.wait_frames=0;state.last_script=-1;
  update_event_runner(thread.runner,state);thread.wait_frames=state.wait_frames;
  if(!thread.runner.active && thread.wait_frames==0) state.segment_active[slot]=false;
  if(state.last_dialogue>=0 || state.last_choice_group>=0 || state.last_code_lock_variable>=0 || state.equip_menu_requested || state.last_shop_actor>=-1 || state.actor_command_count>=max_event_actor_commands || state.projectile_launch_requested) { pool.cursor=(slot+1)%max_event_segments;break; }
 }
 state.wait_frames=main_wait;state.last_script=main_call;
 bind_event_scripts(state,main_scripts,main_script_count);
}
}
