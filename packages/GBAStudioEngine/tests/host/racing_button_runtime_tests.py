"""Execute the real racing event dispatch with button/runner seams."""
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[2]
s=(root/'templates/exported_racing/main.cpp').read_text();a=s.index('bool update_runtime_event_script(');b=s.rfind('\n',a,s.index('void draw_pseudo3d_hud',a))
code='''#include <cassert>
#include <cstddef>
namespace gbs {struct InputState{};struct Script{};using EventScript=Script;struct EventState{int last_script=-1;};struct Runner{bool active=false;};
bool pressed=true,progress_pending=false;int binding_calls=0,updates=0;
bool next_racing_progress_event(int&,int,EventScript&){if(!progress_pending)return false;progress_pending=false;return true;}
bool update_button_event_bindings(EventState& s){++binding_calls;if(!pressed)return false;pressed=false;s.last_script=0;return true;}
bool event_runner_is_active(Runner& r){return r.active;}
void update_event_runner(Runner&,EventState&){++updates;}
struct Dialogue{bool visible=false;};void advance_dialogue(Dialogue&,const InputState&){}
}
bool runtime_script_controls_dialogue=false;gbs::Dialogue dialogue;int runtime_event_wait_frames=0;gbs::Runner runtime_event_runner;gbs::EventState event_state;
int progress_events=0,current_room_index=0,result_calls=0;
struct{gbs::Script scripts[1];size_t script_count=1;int rooms[1]{};}project;
void dispatch_race_result(){++result_calls;}
bool start_runtime_event_script(gbs::Script){runtime_event_runner.active=true;return true;}void consume_event_state(){}
'''+s[a:b]+'''
int main(){assert(update_runtime_event_script({}));assert(gbs::binding_calls==1);assert(gbs::updates==1);assert(event_state.last_script==-1);
assert(update_runtime_event_script({}));assert(gbs::binding_calls==1);
runtime_event_runner.active=false;runtime_event_wait_frames=2;assert(update_runtime_event_script({}));assert(gbs::binding_calls==1);
runtime_event_wait_frames=0;assert(!update_runtime_event_script({}));assert(gbs::binding_calls==2);
const int results_before=result_calls;
gbs::pressed=true;gbs::progress_pending=true;
assert(update_runtime_event_script({}));assert(gbs::pressed);assert(gbs::binding_calls==2);assert(result_calls==results_before);
runtime_event_runner.active=false;
assert(update_runtime_event_script({}));assert(!gbs::pressed);assert(gbs::binding_calls==3);assert(result_calls==results_before+1);}

'''
with tempfile.TemporaryDirectory() as d:
 p=Path(d);(p/'test.cpp').write_text(code);subprocess.run(['c++','-std=c++17',str(p/'test.cpp'),'-o',str(p/'test')],check=True);subprocess.run([str(p/'test')],check=True)
print('Racing bound buttons dispatch only while idle: PASS')
