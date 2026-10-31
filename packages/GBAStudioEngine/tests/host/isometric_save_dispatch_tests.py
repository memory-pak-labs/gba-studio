"""Exercise Isometric event save dispatch in standalone and mixed builds."""
from pathlib import Path
import os
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source_path = Path(os.environ.get('GBS_ISOMETRIC_MAIN', root / 'examples/isometric_basic/src/main.cpp'))
source = source_path.read_text()
start = source.index('        if (event_state.save_request != 0) {')
pos = source.index('{', start) + 1
depth = 1
while depth:
    depth += (source[pos] == '{') - (source[pos] == '}')
    pos += 1
branch = source[start:pos]
start = source.index('        if ((room_changed || input.was_pressed(gbs::ButtonA))')
pos = source.index('{', start) + 1
depth = 1
while depth:
    depth += (source[pos] == '{') - (source[pos] == '}')
    pos += 1
auto_save = source[start:pos]
code = r'''
#include <cassert>
#include "gbs/engine.hpp"
#include "gbs/isometric.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/runtime_save_restore.hpp"
int saved=-1, removed=-1, direct=-1, universal=-1, restored_events=0;
bool exists[2]{}; gbs::RuntimeAvailabilityMask mask_seen=0;
namespace gbastudio_isometric_project { constexpr bool save_enabled=true; gbs::SaveBank save_bank{0,4096,2,0,1}; }
constexpr size_t max_actor_count=gbs::max_isometric_save_actors;
gbs::IsoActor actors[max_actor_count]{}; size_t actor_count=1;
gbs::IsoCamera camera{};gbs::IsoCursorState cursor{}; gbs::EventState event_state{};
gbs::IsometricRoomData room{};const gbs::IsometricRoomData* room_data=&room;int current_room=0;
gbs::RuntimeTriggerState trigger_states[2]{};int scripted_actor_moves[2]{};gbs::DialogueState dialogue{};
bool room_changed=false;
struct Input { bool pressed=false; bool was_pressed(gbs::Button) const { return pressed; } } input;
struct Tactical { bool enabled=false; } tactical_state;
int restored_tactical_save=0;bool has_restored_tactical_save=false;
void persist_isometric_runtime_state(int,const gbs::IsoActor*,size_t,const gbs::IsoCamera&,const gbs::EventState&,const gbs::IsoCursorState&,int slot=0) { saved=slot; exists[slot]=true; }
bool restore_isometric_runtime_state(int&,const gbs::IsometricRoomData*&,gbs::IsoActor*,size_t,size_t&,gbs::IsoCamera&,gbs::EventState&,gbs::IsoCursorState&,int slot) { direct=slot;return exists[slot]; }
void init_iso_tactical_state(Tactical&,const gbs::IsometricRoomData&,size_t) {}
void apply_tactical_save(int,gbs::IsoActor*,size_t) {}
namespace gbs {
SaveInfo inspect_save_slot(SaveBank,size_t slot) { SaveInfo result{};result.status=exists[slot]?SaveStatus::Ok:SaveStatus::InvalidData;return result; }
SaveStatus clear_save_slot(SaveBank,size_t slot) {removed=static_cast<int>(slot);exists[slot]=false;return SaveStatus::Ok;}
RuntimeAvailabilityMask active_runtime_availability() {return runtime_availability(RuntimeKind::Isometric)|runtime_availability(RuntimeKind::Cutscene);}
bool request_universal_save_restore(SaveBank,int slot,RuntimeAvailabilityMask mask) {universal=slot;mask_seen=mask;return true;}
void hide_dialogue(DialogueState&) {}
void run_event_script(EventState&,EventScript) {++restored_events;}
}
void run_iso_event_script(gbs::EventState& state, gbs::EventScript script) { gbs::run_event_script(state, script); }
void consume() {
''' + auto_save + branch + r'''
}
int main() {
 event_state.save_request=1;event_state.save_request_slot=1;consume();
 assert(saved==1&&exists[1]&&event_state.save_slot_exists[1]);
 assert(event_state.save_request==0&&event_state.save_request_slot==-1);
 saved=-1; input.pressed=true;
 event_state.save_request=2;event_state.save_request_slot=1;consume();
 assert(saved==-1); // A load action must not overwrite the automatic save first.
 input.pressed=false;
#if GBS_MULTI_RUNTIME
 assert(universal==1&&direct==-1&&(mask_seen&gbs::runtime_availability(gbs::RuntimeKind::Cutscene)));
#else
 assert(direct==1&&universal==-1&&restored_events==1);
#endif
 event_state.save_request=3;event_state.save_request_slot=1;consume();
 assert(removed==1&&!exists[1]&&!event_state.save_slot_exists[1]);
 event_state.save_request=1;event_state.save_request_slot=5;consume();assert(saved==-1&&event_state.save_request==0);
 input.pressed=true;event_state.save_request=0;consume();assert(saved==0&&exists[0]);
}
'''
with tempfile.TemporaryDirectory(prefix='gba-isometric-save-dispatch-') as directory:
    cpp=Path(directory)/'test.cpp';cpp.write_text(code)
    for mode in (0,1):
        exe=Path(directory)/f'test-{mode}'
        subprocess.run(['c++','-std=c++17','-Wall','-Wextra','-Werror',f'-DGBS_MULTI_RUNTIME={mode}',
                        '-I'+str(root/'engine/include'),str(cpp),'-o',str(exe)],check=True)
        subprocess.run([str(exe)],check=True)
print('Isometric save events dispatch to the correct runtime and slot: PASS')
