from pathlib import Path
import copy, importlib.util, tempfile, subprocess
root=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('assetc',root/'tools/assetc/assetc.py');assetc=importlib.util.module_from_spec(spec);spec.loader.exec_module(assetc)
geometry={'columns':6,'rows':5,'columnGap':1,'rowGap':0}
project={'screens':[{'name':'name','items':[{'label':'Name','action':'select'}],'text_input':{'variable_index':0,'max_length':8,'x':1,'y':1,'width':8,'keyboard_layout':'grid','keyboard_x':1,'keyboard_y':1,'keyboard_width':16,'keyboard_height':10,'keyboard_control_layout':'bottom_grid','keyboard_surface':'background','keyboard_geometry':geometry}}]}
header=assetc.emit_menu_project_data_header(project)
assert 'MenuTextInputKeyboardGeometry' in header
assert '6, 5, 1, 0' in header
with tempfile.TemporaryDirectory(prefix='gba-name-geometry-') as directory:
    path=Path(directory)/'generated.cpp'
    path.write_text(header+'\nint main() {}\n')
    subprocess.run(['clang++','-std=c++17','-fsyntax-only','-I'+str(root/'engine/include'),str(path)],check=True)
for invalid in [{'columns':3,'rows':5,'columnGap':0,'rowGap':0},{'columns':8,'rows':3,'columnGap':0,'rowGap':0},{'columns':8,'rows':4,'columnGap':0,'rowGap':0,'keys':[{'x':0,'y':0}]}]:
 bad=copy.deepcopy(project);bad['screens'][0]['text_input']['keyboard_geometry']=invalid
 try:assetc.emit_menu_project_data_header(bad)
 except SystemExit:pass
 else:raise AssertionError('invalid geometry accepted')
print('PASS: authored grid export and invalid geometry rejection')
