"""Read Cutscene saves written by the previous runtime's actual save routines."""
from pathlib import Path
import re
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
old_path = root / 'tests/fixtures/cutscene_legacy_writer.cpp'
old = old_path.read_text()
new = (root / 'templates/exported_cutscene/main.cpp').read_text()
def function(src, name):
    match = re.search(re.escape(name) + r'[^;{]*\{', src)
    assert match, name
    end = src.index('{',match.start()) + 1
    depth = 1
    while depth:
        depth += (src[end] == '{') - (src[end] == '}')
        end += 1
    return src[match.start():end]
code = r'''
#include <cassert>
#include <cstdlib>
#include <cstring>
#include "gbs/engine.hpp"
#include "gbs/cutscene.hpp"
#include "gbs/cutscene_script_runner.hpp"
#include "gbs/runtime_save_restore.hpp"
constexpr gbs::SaveBank bank {0,2048,2,gbs::make_save_signature('T','E','S','T'),1};
constexpr gbs::RuntimeCapabilityDescriptor cap[] = {{gbs::RuntimeCapabilityID::Save,true,true}};
constexpr gbs::RuntimeCapabilityManifest caps {1,cap,1};
namespace gbastudio_cutscene_project { constexpr bool save_enabled=true; constexpr gbs::SaveBank save_bank=bank; }
gbs::EventState event_state {};
gbs::CutsceneRuntimeState cutscene_state {};
gbs::CutsceneProjectData project {};
gbs::RuntimeSaveService service {bank,nullptr,&caps,1};
gbs::UniversalSaveData universal {};
unsigned char wire[2048] {}; size_t wire_size=0; unsigned cutscene_save_sequence=0;
namespace gbs {
// Fail if unrelated hardware operations are invoked by the save regression.
// PE/COFF linkers can retain these event handlers even when ELF/Mach-O discard them.
bool runtime_read_rtc_datetime(RtcDateTime&) { std::abort(); }
void rumble_on() { std::abort(); }
void rumble_on_for(uint16_t) { std::abort(); }
void rumble_off() { std::abort(); }
void multiplayer_open(MultiplayerSession&, uint8_t) { std::abort(); }
void multiplayer_close(MultiplayerSession&) { std::abort(); }
void multiplayer_set_data(MultiplayerSession&, uint16_t) { std::abort(); }
bool multiplayer_transfer(MultiplayerSession&) { std::abort(); }
uint8_t multiplayer_connected_count(const MultiplayerSession&) { std::abort(); }
uint16_t multiplayer_get_data(const MultiplayerSession&, uint8_t) { std::abort(); }
RuntimeSaveService* active_runtime_save_service(){return &service;}
uint32_t frame_count(){return 123;}
SaveStatus write_runtime_save(RuntimeSaveService& svc,int slot,const UniversalSaveData& data,const SaveMetadata& metadata) {universal=data;return write_save_slot_record(svc.bank,static_cast<size_t>(slot),&data,sizeof(data),metadata,1);}
SaveStatus read_runtime_save(const RuntimeSaveService& svc,int slot,UniversalSaveData& data,SaveMetadata* metadata) {size_t count=0; auto result=read_save_slot_record(svc.bank,static_cast<size_t>(slot),&data,sizeof(data),metadata,&count);return result==SaveStatus::Ok && count==sizeof(data) ? SaveStatus::Ok : SaveStatus::InvalidData;}
SaveStatus clear_runtime_save(RuntimeSaveService&,int){return SaveStatus::Ok;}
bool request_universal_save_restore(SaveBank,int,RuntimeAvailabilityMask){return false;}
bool restore_suspended_common_state(const UniversalSaveData& d,EventState& e){return read_universal_save_common_state(d,e.variables,event_variable_count,e.inventory,max_event_inventory_items,e.equipped_items,max_event_equipment_slots,e.text_variables,text_variable_count);}
}
''' + function(new,'struct CutsceneRuntimeCheckpoint') + ';\n' + function(new,'struct CutsceneStandaloneCheckpoint') + r''';
bool restore_cutscene_checkpoint(const CutsceneRuntimeCheckpoint&){return false;}
''' + function(old,'void consume_cutscene_save_request(').replace('void consume_cutscene_save_request(', 'void legacy_write_universal(') + '\n' + function(old,'void persist_cutscene_runtime_state(').replace('void persist_cutscene_runtime_state(', 'void legacy_write_standalone(') + '\n' + function(new,'bool restore_universal_cutscene_runtime_state(') + '\n' + function(new,'bool restore_cutscene_runtime_state(') + r'''
int main(){
 gbs::CutsceneStepData steps[2] {}; gbs::CutsceneSceneData scene {};scene.steps=steps;scene.step_count=2;
 project.scenes=&scene;project.scene_count=1;
 gbs::format_save_memory(); gbs::init_event_state(event_state); cutscene_state={0,1,37}; event_state.variables[0]=431;
 event_state.text_variables[0][0]='A'; event_state.text_variables[0][1]='\0';
#if GBS_MULTI_RUNTIME
 event_state.save_request=1;event_state.save_request_slot=0;legacy_write_universal();
 assert(universal.payload_size==sizeof(gbs::CutsceneRuntimeState));
 cutscene_state={};gbs::init_event_state(event_state);
 assert(restore_universal_cutscene_runtime_state(0));
 assert(cutscene_state.step_index==1 && cutscene_state.frame_counter==37 && event_state.variables[0]==431 && event_state.text_variables[0][0]=='A');
 universal.payload_size--; assert(gbs::write_save_slot_record(bank,0,&universal,sizeof(universal),gbs::make_save_metadata("OLD"),2)==gbs::SaveStatus::Ok); assert(!restore_universal_cutscene_runtime_state(0));
#else
 legacy_write_standalone(); assert(gbs::read_save_slot_record(bank,0,wire,sizeof(wire),nullptr,&wire_size)==gbs::SaveStatus::Ok); assert(wire_size==sizeof(gbs::CutsceneSaveData));
 cutscene_state={};gbs::init_event_state(event_state);
 assert(restore_cutscene_runtime_state());
 assert(cutscene_state.step_index==1 && cutscene_state.frame_counter==37 && event_state.variables[0]==431 && event_state.text_variables[0][0]=='A');
 wire_size=gbs::legacy_cutscene_save_size; assert(gbs::write_save_slot_record(bank,0,wire,wire_size,gbs::make_save_metadata("OLD"),2)==gbs::SaveStatus::Ok); cutscene_state={};gbs::init_event_state(event_state);
 assert(restore_cutscene_runtime_state());
 assert(cutscene_state.step_index==1 && event_state.variables[0]==431 && event_state.text_variables[0][0]=='\0');
 --wire_size; assert(gbs::write_save_slot_record(bank,0,wire,wire_size,gbs::make_save_metadata("OLD"),3)==gbs::SaveStatus::Ok); assert(!restore_cutscene_runtime_state());
#endif
}
'''
with tempfile.TemporaryDirectory(prefix='gba-cutscene-legacy-') as d:
    cpp=Path(d)/'test.cpp';cpp.write_text(code)
    for mode in (0,1):
        exe=Path(d)/str(mode)
        cmd=['c++','-std=c++17','-ffunction-sections','-fdata-sections',f'-DGBS_MULTI_RUNTIME={mode}', '-I'+str(root/'engine/include'),str(cpp),str(root/'engine/src/gbs_save.cpp'),str(root/'engine/src/gbs_info.cpp'),str(root/'engine/src/gbs_event.cpp'),str(root/'engine/src/gbs_dialogue_locale.cpp'),'-Wl,-dead_strip' if sys.platform=='darwin' else '-Wl,--gc-sections','-o',str(exe)]
        subprocess.run(cmd,check=True);subprocess.run([str(exe)],check=True)
print('Cutscene previous writer / current reader: mixed and standalone PASS')
