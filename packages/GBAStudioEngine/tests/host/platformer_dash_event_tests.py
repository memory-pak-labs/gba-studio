"""The existing platformer-state event starts the same bounded dash as native input."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'examples/platformer_basic/src/main.cpp').read_text()
core = (root / 'engine/src/gbs_platformer.cpp').read_text()

def function(source, signature):
    start = source.index(signature)
    end, depth = source.index('{', start) + 1, 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]

program = '#include "gbs/platformer.hpp"\n#include <cassert>\n'
if 'bool start_platformer_dash(' in core:
    program += 'namespace gbs {\n' + function(core, 'bool start_platformer_dash(') + '\n}\n'
program += '''
bool player_hurt_presentation_requested = false;
void transition_platformer_callback_state(gbs::EventState&, int& active, int next) { active = next; }
''' + function(source, 'bool consume_platformer_state_request(') + '''
int main() {
    gbs::EventState event {};
    auto config = gbs::default_platformer_config();
    config.dash_enabled = true; config.dash_recharge_frames = 45;
    gbs::PlatformerActor player {}; player.on_ground = true; player.dash_available = true;
    bool active = true; int state = 1;
    event.platformer_state_changed = true; event.platformer_next_state = 3;
    assert(consume_platformer_state_request(event, player, config, active, state));
    assert(player.dash_timer == config.dash_frames);
    assert(!player.dash_available && player.dash_recharge_timer == 45 && state == 3);
    player.dash_timer = 2;
    event.platformer_state_changed = true;
    assert(!consume_platformer_state_request(event, player, config, active, state));
    assert(player.dash_timer == 2); // Repeated events cannot bypass recharge.
    config.dash_style = 0; player.on_ground = false; player.dash_available = true;
    event.platformer_state_changed = true;
    assert(!consume_platformer_state_request(event, player, config, active, state));
    config.dash_enabled = false; player.on_ground = true;
    event.platformer_state_changed = true;
    assert(!consume_platformer_state_request(event, player, config, active, state));
}
'''
with tempfile.TemporaryDirectory(prefix='gbs-dash-event-') as directory:
    cpp, exe = Path(directory) / 'test.cpp', Path(directory) / 'test'
    cpp.write_text(program)
    subprocess.run(['c++', '-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', str(root / 'engine/include'), str(cpp), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('Platformer dash event passed')
