import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {extendExampleEncore} from './encore-project.mjs';
import {generateRadioPCM} from './generate-radio-pcm.mjs';
import {preserveExampleEncore} from './encore-project.mjs';
import {bootPreviewRuntimeAtRoom,runPreviewRuntimeEvent} from '../src/shared/previewRuntime.js';
const source=()=>JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url)));
const manifest={assets:[{id:'encore-radio',name:'recovered-radio.png',kind:'Sprite',metadata:{source:'Assets/sprites/recovered-radio.png',frameWidth:32,frameHeight:32,frameCount:1}},{id:'encore-radio-pcm',name:'radio-lume-pcm.wav',kind:'SFX',metadata:{source:'Assets/audio/radio-lume-pcm.wav'}}]};
const commands=(p,name)=>p.events.find(e=>e.name===name)?.steps.map(s=>s.command);
it.each([['porto_lumen','encore_epilogue_1_tick'],['farol_interior','encore_epilogue_2_tick']])('ignores a queued tour tick after skipping in %s',(room,event)=>{
  const state=bootPreviewRuntimeAtRoom(source(),room,{skipBootEvents:true});
  state.variables.var_epilogue_phase=3;state.variables.var_epilogue_tick=10;
  const after=runPreviewRuntimeEvent(state,event);
  expect(after.variables.var_epilogue_tick).toBe(10);
  expect(after.variables.var_epilogue_phase).toBe(3);
});
it('adds the radio, optional training and skippable ending without repainting scenes or moving saved slots',()=>{
  const before=source(),copy=structuredClone(before),after=extendExampleEncore(before,manifest);
  expect(before).toEqual(copy);
  expect(after.variables.slice(0,before.variables.length)).toEqual(before.variables);
  expect(after.variables.map(v=>v.name)).toContain('var_arena_lesson');expect(after.variables.length).toBeLessThanOrEqual(64);
  expect(after.actors.filter(a=>!a.id.startsWith('encore-'))).toEqual(before.actors.filter(a=>!a.id.startsWith('encore-')));
  for(const r of before.rooms){const a=after.rooms.find(a=>a.name===r.name);expect({...a,eventBindings:r.eventBindings}).toEqual(r);}
  expect(after.assets.filter(a=>!a.id.startsWith('encore-'))).toEqual(before.assets.filter(a=>!a.id.startsWith('encore-')));
  expect(commands(after,'encore_radio_play')).toContain('play_sfx radio-lume-pcm.wav 80 12');
  expect(commands(after,'circuito_concluir')).toContain('call_procedure encore_epilogue_begin');
  expect(commands(after,'encore_epilogue_skip')).toContain('call_procedure encore_epilogue_finish');
  expect(commands(after,'encore_arena_lesson')).toContain('luta_set_super_gauge nara-fighter 100');
  expect(commands(after,'arena_vencer_rival')).toContain('call_procedure encore_base_arena_vencer_rival');
  expect(extendExampleEncore(after,manifest)).toEqual(after);
});
it('requires explicit asset approval when preserving the extension through campaign regeneration',()=>{
  const p=extendExampleEncore(source(),manifest);
  expect(()=>preserveExampleEncore(p,source())).toThrow(/approval/);
  for(const a of p.assets.filter(a=>a.id.startsWith('encore-')))a.metadata.approved=true;
  const regenerated=preserveExampleEncore(p,source());
  expect(commands(regenerated,'encore_radio_play')).toEqual(commands(p,'encore_radio_play'));
  expect(commands(regenerated,'arena_vencer_rival')).toEqual(commands(p,'arena_vencer_rival'));
});
it('synthesizes a bounded, reproducible 16-bit mono PCM transmission with separated pulses',()=>{
  const wav=generateRadioPCM();expect(wav.equals(generateRadioPCM())).toBe(true);
  expect(wav.toString('ascii',0,4)).toBe('RIFF');expect(wav.readUInt32LE(24)).toBe(15768);expect(wav.readUInt16LE(22)).toBe(1);
  let peak=0,sum=0;for(let i=44;i<wav.length;i+=2){const n=wav.readInt16LE(i);peak=Math.max(peak,Math.abs(n));sum+=n*n;}
  expect(peak).toBeLessThan(32000);expect(Math.sqrt(sum/((wav.length-44)/2))).toBeGreaterThan(4000);
  expect((wav.length-44)/2/15768).toBe(4);expect((wav.length-44)/2).toBeLessThanOrEqual(65535);
});
