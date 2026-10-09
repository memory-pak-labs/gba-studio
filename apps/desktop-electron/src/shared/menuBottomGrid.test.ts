import { expect, it } from 'vitest';
import { deriveMenuSceneEditorPreview, normalizeMenuSceneConfig } from './menuScene.js';
const input = {role:'name_input',textInput:{variableName:'var_character_name',maxLength:8,x:13,y:6,width:8,keyboard:{layout:'grid',controlLayout:'bottom_grid',surface:'background',x:7,y:8,width:16,height:10}}};
it('preserves the approved four-row eight-column keyboard with controls below',()=>{
  const config=normalizeMenuSceneConfig(input);
  expect(config.textInput?.keyboard).toMatchObject({controlLayout:'bottom_grid',x:7,y:8,width:16,height:10});
  const preview=deriveMenuSceneEditorPreview(input);
  expect(preview.textInput?.keyboard?.controls.map(control=>control.label)).toEqual(['DEL','Aa','OK']);
  expect(preview.textInput?.keyboard?.letterRows).toEqual(['ABCDEFGH','IJKLMNOP','QRSTUVWX','YZ'].map(row=>Array.from({length:8},(_,index)=>row[index]??'')));
});
