"""Exercise the actual Top-down event save branch in mixed and standalone builds."""
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'examples/topdown_basic/src/main.cpp').read_text()
start = source.index('    if (event_state.save_request != 0) {')
pos = source.index('{', start) + 1
depth = 1
while depth:
    depth += (source[pos] == '{') - (source[pos] == '}')
    pos += 1
branch = source[start:pos]
start = source.index('else if (selected_value >= pause_menu_load_base')
pos = source.index('{', start) + 1
depth = 1
while depth:
    depth += (source[pos] == '{') - (source[pos] == '}')
    pos += 1
pause_branch = 'if' + source[start + len('else if'):pos]
code = r'''
#include <cassert>
#include "gbs/engine.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/runtime_save_restore.hpp"
int direct_loads=0, universal_loads=0, resets=0, motion_restores=0, restore_failures=0;
gbs::RuntimeAvailabilityMask observed_mask=0;
gbs::EventState event_state {};
gbs::DialogueState dialogue {};
constexpr size_t active_save_slot_count=3;
constexpr int pause_menu_load_base=100;
enum class PauseMenuPage { System };
void show_pause_menu_page(PauseMenuPage) {}
namespace gbastudio_project { gbs::SaveBank save_bank {}; }
void persist_runtime_state(int) {}
bool restore_runtime_state(int) { ++direct_loads; return true; }
bool apply_pending_topdown_motion_checkpoint() { ++motion_restores; return true; }
void apply_room_metadata(bool) { ++resets; }
void init_npc_runtime() {}
void init_trigger_states() {}
void reset_npc_player_hit_state() {}
void refresh_pause_menu_items() {}
void refresh_hud() {}
void refresh_event_save_slot_statuses() {}
namespace gbs {
void show_checkpoint_restore_failure(DialogueState&) { ++restore_failures; }
SaveStatus clear_save_slot(SaveBank, size_t) { return SaveStatus::Ok; }
RuntimeAvailabilityMask active_runtime_availability() { return runtime_availability(RuntimeKind::TopDown) | runtime_availability(RuntimeKind::Cutscene); }
bool request_universal_save_restore(SaveBank, int slot, RuntimeAvailabilityMask mask) { assert(slot==0); ++universal_loads; observed_mask=mask; return true; }
}
void consume() { bool room_changed=false;
''' + branch + r'''
(void)room_changed;
}
void consume_pause_load(int selected_value) {
''' + pause_branch + r'''
}
int main() {
 event_state.save_request=2; event_state.save_request_slot=0; consume();
 assert(event_state.save_request==0 && event_state.save_request_slot==-1);
#if GBS_MULTI_RUNTIME
 assert(universal_loads==1 && direct_loads==0 && resets==0 && motion_restores==0);
 assert(observed_mask & gbs::runtime_availability(gbs::RuntimeKind::Cutscene));
 universal_loads=direct_loads=resets=0;
 consume_pause_load(pause_menu_load_base);
 assert(universal_loads==1 && direct_loads==0 && resets==0);
#else
 assert(universal_loads==0 && direct_loads==1 && resets==1 && motion_restores==1 && restore_failures==0);
 universal_loads=direct_loads=resets=0;
 motion_restores=0;
 consume_pause_load(pause_menu_load_base);
 assert(universal_loads==0 && direct_loads==1 && resets==1 && motion_restores==1 && restore_failures==0);
#endif
}
'''
with tempfile.TemporaryDirectory(prefix='gba-topdown-save-') as directory:
    cpp=Path(directory)/'test.cpp'; cpp.write_text(code)
    for mode in (0,1):
        exe=Path(directory)/f'test-{mode}'
        subprocess.run(['c++','-std=c++17','-Wall','-Wextra','-Werror',f'-DGBS_MULTI_RUNTIME={mode}',
                        '-I'+str(root/'engine/include'),str(cpp),'-o',str(exe)],check=True)
        subprocess.run([str(exe)],check=True)
print('Top-down save events dispatch to the correct runtime: PASS')
