import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {parseGBAProjectFile} from '../shared/projectFile.js';
import {buildEngineExportProjectContract} from './exportEngineProject.js';
import {extendExampleEncore} from '../../scripts/encore-project.mjs';

it('exports executable training bindings, native PCM and the exact separate radio anchor',()=>{
  const source=JSON.parse(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8'));
  const assets=[{id:'encore-radio',name:'recovered-radio.png',kind:'Sprite',metadata:{source:'Assets/sprites/recovered-radio.png',frameWidth:32,frameHeight:32,frameCount:1,colorMode:'4bpp'}},{id:'encore-radio-pcm',name:'radio-lume-pcm.wav',kind:'SFX',metadata:{source:'Assets/audio/radio-lume-pcm.wav'}}];
  const p=parseGBAProjectFile(JSON.stringify(extendExampleEncore(source,{assets}))).data;
  const c=buildEngineExportProjectContract(p),fight=c.luta_project!,warehouse=c.point_click_project!.scenes.find(s=>s.name==='armazem_das_mares')!;
  const binding=fight.stages[0].on_enter!.find(s=>s.op==='attach_button_event'&&s.button==='select')!;
  expect(fight.scripts![binding.index!].name).toBe('encore_arena_leave_button');
  expect(fight.scripts![binding.index!].script).toEqual(expect.arrayContaining([{op:'remove_button_event',button:'select'},expect.objectContaining({op:'warp_runtime',runtime:'topdown'})]));
  const radio=warehouse.props!.find(a=>a.name==='Rádio de Lúmen')!;
  expect(radio.position).toEqual({x:192,y:80});
  expect(radio.animations![0].frame_metasprites![0].parts[0]).toEqual(expect.objectContaining({x:-16,y:-32,width:32,height:32}));
  expect(warehouse.hotspots!.find(h=>h.name==='Rádio de Lúmen')!.on_click).toContainEqual({op:'play_pcm_sfx',index:0,volume:12,priority:12});
  const tour=c.topdown_project!.scripts.find(s=>s.name==='encore_epilogue_1_tick')!.script;
  expect(tour).toContainEqual(expect.objectContaining({op:'move_camera',x:1,y:0}));
  const menu=c.topdown_project!.dialogue_lines!.findIndex(d=>d.key==='encore_epilogue_menu');
  expect(c.topdown_project!.choice_groups!.find(g=>g.line===menu)!.choices[1].script?.length).toBeGreaterThan(0);
});
