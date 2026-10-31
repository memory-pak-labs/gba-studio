#include <cassert>
#include "gbs/cutscene_script_runner.hpp"

struct Output { int background = -1; int count = 0; };
void consume(gbs::EventState& state, void* context) {
    auto& output = *static_cast<Output*>(context);
    if (state.background_request_index >= 0) {
        output.background = state.background_request_index;
        ++output.count;
        state.background_request_index = -1;
    }
}
int main() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    gbs::CutsceneScriptRunner runtime {};
    gbs::init_cutscene_script_runner(runtime);
    const gbs::EventCommand commands[] = {
        {gbs::EventOp::Wait,2,0,0}, {gbs::EventOp::SetBackground,1,0,0},
        {gbs::EventOp::SetVariable,0,1,0}, {gbs::EventOp::Wait,2,0,0},
        {gbs::EventOp::SetBackground,2,0,0}, {gbs::EventOp::SetVariable,0,2,0},
        {gbs::EventOp::End,0,0,0}
    };
    const gbs::EventCommand later[] = {{gbs::EventOp::SetVariable,1,9,0}, {gbs::EventOp::End,0,0,0}};
    assert(gbs::enqueue_cutscene_script(runtime, {commands,7}));
    assert(gbs::enqueue_cutscene_script(runtime, {later,2}));
    Output output;
    gbs::tick_cutscene_script_runner(runtime,state,false,consume,&output);
    assert(state.variables[0]==0 && output.count==0);
    gbs::tick_cutscene_script_runner(runtime,state,false,consume,&output);
    assert(state.variables[0]==0 && output.count==0);
    gbs::tick_cutscene_script_runner(runtime,state,false,consume,&output);
    assert(state.variables[0]==1 && output.background==1 && output.count==1 && state.variables[1]==0);
    gbs::tick_cutscene_script_runner(runtime,state,true,consume,&output);
    assert(state.variables[0]==1 && runtime.wait_frames==2);
    gbs::tick_cutscene_script_runner(runtime,state,false,consume,&output);
    assert(state.variables[0]==1);
    gbs::tick_cutscene_script_runner(runtime,state,false,consume,&output);
    assert(state.variables[0]==2 && output.background==2 && output.count==2);
    gbs::tick_cutscene_script_runner(runtime,state,false,consume,&output);
    assert(state.variables[1]==9);
    assert(!gbs::cutscene_script_runner_active(runtime));

    // Saving mid-wait must resume both the current script and the queued step.
    gbs::CutsceneStepData scene_step {};
    scene_step.script = {later,2};
    gbs::CutsceneSceneData scene {};
    scene.on_enter = {commands,7}; scene.steps = &scene_step; scene.step_count = 1;
    gbs::CutsceneProjectData project {}; project.scenes = &scene; project.scene_count = 1;
    gbs::init_event_state(state); gbs::init_cutscene_script_runner(runtime); output = {};
    assert(gbs::enqueue_cutscene_script(runtime,scene.on_enter));
    assert(gbs::enqueue_cutscene_script(runtime,scene_step.script));
    gbs::tick_cutscene_script_runner(runtime,state,false,consume,&output);
    gbs::tick_cutscene_script_runner(runtime,state,false,consume,&output);
    gbs::CutsceneScriptCheckpoint saved {};
    assert(gbs::capture_cutscene_script_checkpoint(project,runtime,state,saved));
    gbs::CutsceneScriptRunner restored {};
    assert(gbs::restore_cutscene_script_checkpoint(project,saved,state,restored));
    assert(restored.wait_frames==1);
    gbs::tick_cutscene_script_runner(restored,state,false,consume,&output);
    assert(state.variables[0]==1 && output.background==1 && state.variables[1]==0);
    gbs::tick_cutscene_script_runner(restored,state,false,consume,&output);
    gbs::tick_cutscene_script_runner(restored,state,false,consume,&output);
    assert(state.variables[0]==2 && output.background==2 && state.variables[1]==0);
    gbs::tick_cutscene_script_runner(restored,state,false,consume,&output);
    assert(state.variables[1]==9);
    saved.active.script_hash ^= 1;
    gbs::CutsceneScriptRunner invalid {};
    invalid.wait_frames = 77;
    assert(!gbs::restore_cutscene_script_checkpoint(project,saved,state,invalid));
    assert(invalid.wait_frames == 77);
    saved.active.script_hash ^= 1;
    saved.queued[0].hash ^= 1;
    assert(!gbs::restore_cutscene_script_checkpoint(project,saved,state,invalid));
    assert(invalid.wait_frames == 77);

    // Resume inside a shared script before returning to its caller.
    const gbs::EventCommand child[] = {
        {gbs::EventOp::Wait,2,0,0}, {gbs::EventOp::SetVariable,2,42,0},
        {gbs::EventOp::End,0,0,0}
    };
    const gbs::EventCommand parent[] = {
        {gbs::EventOp::CallScript,0,0,0}, {gbs::EventOp::SetVariable,3,99,0},
        {gbs::EventOp::End,0,0,0}
    };
    const gbs::EventScript shared[] = {{child,3}};
    scene.on_enter = {parent,3};
    gbs::init_event_state(state);
    gbs::bind_event_scripts(state,shared,1);
    gbs::init_cutscene_script_runner(runtime);
    assert(gbs::enqueue_cutscene_script(runtime,scene.on_enter));
    gbs::tick_cutscene_script_runner(runtime,state,false,consume,&output);
    assert(state.variables[2]==0 && state.variables[3]==0);
    assert(gbs::capture_cutscene_script_checkpoint(project,runtime,state,saved));
    assert(gbs::restore_cutscene_script_checkpoint(project,saved,state,restored));
    gbs::tick_cutscene_script_runner(restored,state,false,consume,&output);
    assert(state.variables[2]==0 && state.variables[3]==0);
    gbs::tick_cutscene_script_runner(restored,state,false,consume,&output);
    assert(state.variables[2]==42 && state.variables[3]==99);
}
