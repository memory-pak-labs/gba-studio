"""Generated native hooks must survive assetc and compile against the public SDK."""
import importlib.util,sys,tempfile,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
tool=Path(sys.argv[1]) if len(sys.argv)>1 else root/'tools/assetc/assetc.py'
spec=importlib.util.spec_from_file_location('race_assetc',tool);module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
command=[{'op':'set_variable','variable':1,'value':7}]
project={'rooms':[{'name':'race','width_tiles':8,'height_tiles':8,'collision_flags':[0]*64,'player_start_pixels':{'x':8,'y':8},'on_lap_complete':command,'topdown_track':{'camera_dead_zone':{'x':0,'y':0},'checkpoints':[{'id':'gate','x':16,'y':16,'width':8,'height':8,'on_pass':command}]}}]}
header=module.emit_racing_project_data_header(project)
assert 'racing_room_0_checkpoint_0_on_pass' in header
assert 'racing_room_0_on_lap_complete' in header
with tempfile.TemporaryDirectory(prefix='gbs-race-hooks-') as tmp:
 p=Path(tmp);(p/'data.hpp').write_text(header)
 (p/'test.cpp').write_text('#include "data.hpp"\nint main(){const auto& r=gbastudio_racing_project::rooms[0];return r.on_lap_complete.command_count==2 && r.topdown_track->checkpoint_events[0].command_count==2 ? 0:1;}')
 subprocess.run(['c++','-std=c++17','-I'+str(root/'engine/include'),'-I'+str(p),str(p/'test.cpp'),'-o',str(p/'test')],check=True);subprocess.run([str(p/'test')],check=True)
print('PASS: checkpoint/lap scripts survive assetc and SDK compilation')
