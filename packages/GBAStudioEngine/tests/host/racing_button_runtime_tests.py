"""Execute the real racing event dispatch with button/runner seams."""
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[2]
s=(root/'templates/exported_racing/main.cpp').read_text();a=s.index('bool update_runtime_event_script(');b=s.rfind('\n',a,s.index('void draw_pseudo3d_hud',a))
code='''#include <cassert>
#include <cstddef>
namespace gbs {struct InputState{};struct Script{};struct EventState{int last_script=-1;};struct Runner{bool active=false;};
bool pressed=true;int binding_calls=0,updates=0;
bool update_button_event_bindings(EventState& s){++binding_calls;if(!pressed)return false;pressed=false;s.last_script=0;return true;}
bool event_runner_is_active(Runner& r){return r.active;}
void update_event_runner(Runner&,EventState&){++updates;}
struct Dialogue{bool visible=false;};void advance_dialogue(Dialogue&,const InputState&){}
}
bool runtime_script_controls_dialogue=false;gbs::Dialogue dialogue;int runtime_event_wait_frames=0;gbs::Runner runtime_event_runner;gbs::EventState event_state;
struct{gbs::Script scripts[1];size_t script_count=1;}project;
bool start_runtime_event_script(gbs::Script){runtime_event_runner.active=true;return true;}void consume_event_state(){}
'''+s[a:b]+'''
int main(){assert(update_runtime_event_script({}));assert(gbs::binding_calls==1);assert(gbs::updates==1);assert(event_state.last_script==-1);
assert(update_runtime_event_script({}));assert(gbs::binding_calls==1);
runtime_event_runner.active=false;runtime_event_wait_frames=2;assert(update_runtime_event_script({}));assert(gbs::binding_calls==1);
runtime_event_wait_frames=0;assert(!update_runtime_event_script({}));assert(gbs::binding_calls==2);}
'''
with tempfile.TemporaryDirectory() as d:
 p=Path(d);(p/'test.cpp').write_text(code);subprocess.run(['c++','-std=c++17',str(p/'test.cpp'),'-o',str(p/'test')],check=True);subprocess.run([str(p/'test')],check=True)
print('Racing bound buttons dispatch only while idle: PASS')
