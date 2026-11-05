import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {parseGBAProjectFile} from '../shared/projectFile.js';
import {buildEngineExportProjectContract} from './exportEngineProject.js';

it('exports the authored held button and four run clips after the unchanged walking set',()=>{
 const project=parseGBAProjectFile(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8')).data;
 const rows=(key:string)=>project[key] as Record<string,unknown>[];
 const actor=rows('actors').find(a=>a.id==='port-nara')!;
 const sheet=actor.spriteSheet;
 const state=rows('animationStates').find(s=>s.id===actor.animationStateID)!;
 const existingRuns=new Set(rows('animations').filter(a=>a.spriteSheet===sheet&&String(a.name).startsWith('run_')).map(a=>a.id));
 project.animations=rows('animations').filter(a=>!existingRuns.has(a.id));
 state.animationIDs=(state.animationIDs as string[]).filter(id=>!existingRuns.has(id));
 for(const direction of ['left','up','down','right']) {
  const original=rows('animations').find(a=>a.spriteSheet===sheet&&a.name==='walk_'+direction)!;
  const run={...structuredClone(original),id:'test-run-'+direction,name:'run_'+direction,state:'run',fps:10};
  rows('animations').push(run);(state.animationIDs as string[]).push(run.id);
 }
 rows('events').push({id:'test-run-profile',name:'test_run_profile',roomName:'porto_lumen',category:'Ator',detail:'Corrida por evento',command:'set_player_speed_profile 100 170 r 0',steps:[{id:'test-run-profile-step',command:'set_player_speed_profile 100 170 r 0',isEnabled:true}]});
 const contract=buildEngineExportProjectContract(project);
 expect(contract.topdown_project!.scripts!.find(s=>s.name==='test_run_profile')!.script).toContainEqual({op:'set_player_speed_profile',walk_speed:100,run_speed:170,button:'r',stamina_cost:0});
 const player=contract.topdown_project!.actor_sprites!.find(s=>s.name===sheet)!;
 expect(player.animations!.map(a=>typeof a==='string'?a:a.name)).toEqual(['idle_down','idle_right','idle_up','idle_left','walk_down','walk_right','walk_up','walk_left','run_down','run_right','run_up','run_left']);
});

it('rejects an incomplete directional running set instead of silently substituting a walking pose',()=>{
 const project=parseGBAProjectFile(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8')).data;
 const rows=(key:string)=>project[key] as Record<string,unknown>[];
 const actor=rows('actors').find(a=>a.id==='port-nara')!;
 const missing=rows('animations').find(a=>a.spriteSheet===actor.spriteSheet&&a.name==='run_left')!;
 project.animations=rows('animations').filter(a=>a!==missing);
 for(const state of rows('animationStates'))state.animationIDs=(state.animationIDs as string[]).filter(id=>id!==missing.id);
 expect(()=>buildEngineExportProjectContract(project)).toThrow(/quatro direcoes de corrida/);
});
