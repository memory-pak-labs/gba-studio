from pathlib import Path
import os,re,subprocess,tempfile,sys
r=Path(__file__).resolve().parents[2];s=(r/'templates/exported_cutscene/main.cpp').read_text()
def function(sig,source=None):
 source = s if source is None else source
 m=re.search(re.escape(sig)+r'[^;{]*\{',source)
 if not m:return None
 end=source.index('{',m.start())+1;depth=1
 while depth:
  depth+=(source[end]=='{')-(source[end]=='}');end+=1
 return source[m.start():end]
show=function('void show_current_step(bool reset_counter, bool run_script, bool prepare_visual)');assert show
code=r'''
#include <cassert>
#include <cstring>
#include "gbs/cutscene.hpp"
#include "gbs/cutscene_script_runner.hpp"
#include "gbs/dialogue.hpp"
gbs::EventState event_state {};
gbs::CutsceneRuntimeState cutscene_state {};
gbs::CutsceneStepData step {};
gbs::CutsceneSceneData scene {};
gbs::CutsceneProjectData project {};
gbs::DialogueState dialogue {};
int applied_background=-1;
int applied_background_index=-1;
bool checkpoint_restored=false;
int restored_background=-1;
gbs::CheckpointDialogue restored_dialogue {};
gbs::CutsceneScriptRunner cutscene_scripts {};
int pending_step_line=-1;
bool entry_frame_pending=false;
int deferred_scene=-1; int deferred_step=-1; bool deferred_skip=false;
namespace gbastudio_dialogue_ui { void configure_for_scene(const char*) {} }
namespace gbs { bool show_dialogue(DialogueState&,const DialogueLine*,size_t,int){return true;} }
namespace gbs { void hide_dialogue(DialogueState& state){state.visible=false;} }
void show_current_step(bool=true, bool=true, bool=true);
void process_cutscene_deferred();
void stream_current_step_resource_group() {}
void apply_current_step_background() {}
void refresh_hud() {}
void persist_cutscene_runtime_state() {}
void consume_event_state() { if(event_state.background_request_index>=0){applied_background=event_state.background_request_index;event_state.background_request_index=-1;} }
'''+function('struct CutsceneRuntimeCheckpoint')+';'+function('bool capture_cutscene_checkpoint(')+function('bool restore_cutscene_checkpoint(')+function('void consume_cutscene_script_state(')+function('void tick_cutscene_scripts(')+function('void show_pending_step_line(')+show+function('void start_step(')+function('void run_scene_exit(')+function('void start_scene(')+(function('void request_cutscene_transition(') or '')+function('bool advance_branch_if_needed(')+function('void advance_step(')+(function('void process_cutscene_deferred(') or 'void process_cutscene_deferred() {}')+function('void skip_step(',Path(os.environ['GBS_CUTSCENE_ORIGINAL_SOURCE']).read_text() if os.environ.get('GBS_CUTSCENE_ORIGINAL_SOURCE') else None)+r'''
int main(){
 gbs::init_event_state(event_state); gbs::init_cutscene_script_runner(cutscene_scripts);
 const gbs::EventCommand commands[]={{gbs::EventOp::Wait,2,0,0},{gbs::EventOp::SetBackground,1,0,0},{gbs::EventOp::SetVariable,0,1,0},{gbs::EventOp::Wait,2,0,0},{gbs::EventOp::SetBackground,2,0,0},{gbs::EventOp::SetVariable,0,2,0},{gbs::EventOp::End,0,0,0}};
 step.line_index=-1; step.script={commands,7};scene.steps=&step;scene.step_count=1;scene.name="test";project.scenes=&scene;project.scene_count=1;
 show_current_step(true,true,false);
 assert(event_state.variables[0]==0 && applied_background==-1 && "Wait must suspend the Cutscene before the first background");
 tick_cutscene_scripts(); assert(event_state.variables[0]==0 && applied_background==-1);
 tick_cutscene_scripts(); assert(event_state.variables[0]==1 && applied_background==1);
 tick_cutscene_scripts(); assert(event_state.variables[0]==1 && applied_background==1);
 tick_cutscene_scripts(); assert(event_state.variables[0]==2 && applied_background==2);
 // Scene entry must finish its wait before the first step begins.
 gbs::init_event_state(event_state); gbs::init_cutscene_script_runner(cutscene_scripts);
 const gbs::EventCommand enter[]={{gbs::EventOp::Wait,2,0,0},{gbs::EventOp::SetVariable,0,7,0},{gbs::EventOp::End,0,0,0}};
 const gbs::EventCommand first[]={{gbs::EventOp::SetVariable,1,9,0},{gbs::EventOp::End,0,0,0}};
 scene.on_enter={enter,3}; step.script={first,2}; start_scene(0);
 assert(event_state.variables[0]==0 && event_state.variables[1]==0);
 tick_cutscene_scripts(); assert(event_state.variables[0]==0);
 tick_cutscene_scripts(); assert(event_state.variables[0]==7 && event_state.variables[1]==0);
 tick_cutscene_scripts(); assert(event_state.variables[1]==9);
 // A scene transition waits for its exit script before loading the next scene.
 gbs::init_event_state(event_state); gbs::init_cutscene_script_runner(cutscene_scripts);
 const gbs::EventCommand exit_script[]={{gbs::EventOp::Wait,2,0,0},{gbs::EventOp::SetVariable,2,7,0},{gbs::EventOp::End,0,0,0}};
 gbs::CutsceneStepData next_step {}; next_step.line_index=-1;
 step.target_scene_index=1; step.script=gbs::empty_event_script();
 gbs::CutsceneSceneData scenes[2] {}; scenes[0]=scene; scenes[0].on_exit={exit_script,3};
 scenes[1].name="next"; scenes[1].steps=&next_step; scenes[1].step_count=1;
 project.scenes=scenes; project.scene_count=2; cutscene_state.scene_index=0; cutscene_state.step_index=0;
 advance_step(); assert(cutscene_state.scene_index==0 && event_state.variables[2]==0);
 tick_cutscene_scripts(); process_cutscene_deferred(); assert(cutscene_state.scene_index==0 && event_state.variables[2]==0);
 tick_cutscene_scripts(); process_cutscene_deferred(); assert(cutscene_state.scene_index==1 && event_state.variables[2]==7);
 // Skipping waits for the on-skip script before advancing.
 gbs::init_event_state(event_state); gbs::init_cutscene_script_runner(cutscene_scripts);
 cutscene_state.scene_index=0; cutscene_state.step_index=0; deferred_scene=-1; deferred_step=-1; deferred_skip=false;
 const gbs::EventCommand on_skip[]={{gbs::EventOp::Wait,2,0,0},{gbs::EventOp::SetVariable,3,17,0},{gbs::EventOp::End,0,0,0}};
 step.skippable=true; step.on_skip={on_skip,3}; scenes[0].on_exit=gbs::empty_event_script();
 skip_step(); assert(cutscene_state.scene_index==0 && event_state.variables[3]==0);
 tick_cutscene_scripts(); process_cutscene_deferred(); assert(cutscene_state.scene_index==0 && event_state.variables[3]==0);
 tick_cutscene_scripts(); process_cutscene_deferred(); assert(cutscene_state.scene_index==1 && event_state.variables[3]==17);
 // A skip must dismiss the previous step's dialogue before the on-skip wait.
 gbs::init_event_state(event_state); gbs::init_cutscene_script_runner(cutscene_scripts);
 cutscene_state.scene_index=0; cutscene_state.step_index=0; deferred_scene=-1; deferred_step=-1; deferred_skip=false;
 dialogue.visible=true; skip_step(); assert(!dialogue.visible && cutscene_state.scene_index==0);
 tick_cutscene_scripts(); process_cutscene_deferred(); assert(cutscene_state.scene_index==0);
 tick_cutscene_scripts(); process_cutscene_deferred(); assert(cutscene_state.scene_index==1 && event_state.variables[3]==17);
 // A checkpoint taken in an entry wait restores the runner and queued step.
 gbs::init_event_state(event_state); gbs::init_cutscene_script_runner(cutscene_scripts);
 deferred_scene=-1; deferred_step=-1; deferred_skip=false; pending_step_line=-1;
 scene.on_enter={enter,3}; step.script={first,2}; step.target_scene_index=-1; step.on_skip=gbs::empty_event_script();
 project.scenes=&scene; project.scene_count=1; cutscene_state.scene_index=0; cutscene_state.step_index=0;
 gbs::enqueue_cutscene_script(cutscene_scripts,scene.on_enter); gbs::enqueue_cutscene_script(cutscene_scripts,step.script);
 tick_cutscene_scripts(); tick_cutscene_scripts();
 CutsceneRuntimeCheckpoint checkpoint {}; assert(capture_cutscene_checkpoint(checkpoint));
 unsigned char bytes[sizeof(checkpoint)]; std::memcpy(bytes,&checkpoint,sizeof(checkpoint));
 gbs::init_cutscene_script_runner(cutscene_scripts); checkpoint = {}; std::memcpy(&checkpoint,bytes,sizeof(checkpoint));
 assert(restore_cutscene_checkpoint(checkpoint) && checkpoint_restored && cutscene_scripts.wait_frames==1);
 tick_cutscene_scripts(); assert(event_state.variables[0]==7 && event_state.variables[1]==0);
 tick_cutscene_scripts(); assert(event_state.variables[1]==9);
 checkpoint.scripts.queued[0].hash ^= 1; assert(!restore_cutscene_checkpoint(checkpoint));
}
'''
sources=['gbs_event.cpp','gbs_dialogue_locale.cpp','gbs_runtime.cpp','gbs_rtc.cpp','gbs_link.cpp','rumble.cpp','deferred_work.cpp','gbs_engine_global.cpp','gbs_animation.cpp']
with tempfile.TemporaryDirectory(prefix='cutscene-timing-') as tmp:
 p=Path(tmp);(p/'test.cpp').write_text(code)
 cmd=['c++','-std=c++17','-ffunction-sections','-fdata-sections','-I'+str(r/'engine/include'),str(p/'test.cpp')]+[str(r/'engine/src'/x) for x in sources]+[str(r/'tests/host/hw_stubs.cpp')]+['-Wl,-dead_strip' if sys.platform=='darwin' else '-Wl,--gc-sections','-o',str(p/'test')]
 subprocess.run(cmd,check=True);subprocess.run([str(p/'test')],check=True)
