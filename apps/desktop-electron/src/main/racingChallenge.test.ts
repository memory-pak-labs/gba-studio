import { readFileSync } from 'node:fs';
import { validateGBAProjectMigrationContract } from '../../../../packages/project-contract/src/index.js';
import { describe, expect, it } from 'vitest';
import { buildEngineExportProjectContract } from './exportEngineProject.js';
import { normalizeRacingSceneConfig, normalizeSceneRuntime } from '../shared/sceneTypeProfiles.js';
import { normalizeMenuSceneConfig } from '../shared/menuScene.js';
const challenge={boostVariableIndex:7,bestTimeTextIndex:1,resultTimeTextIndex:3,resultPositionTextIndex:4,resultRatingTextIndex:5,resultBestTextIndex:6,goldSeconds:80,silverSeconds:120};
describe('racing challenge authoring',()=>{
 it('preserves optional challenge fields through sparse scene normalization',()=>{
  expect(normalizeRacingSceneConfig({challenge}).challenge).toEqual(challenge);
  expect((normalizeSceneRuntime('racing',{type:'racing',config:{challenge}}) as any).config.challenge).toEqual(challenge);
 });
 it('bounds native slots and rejects colliding result and record slots',()=>{
  expect(()=>normalizeRacingSceneConfig({challenge:{...challenge,resultTimeTextIndex:1}})).toThrow(/texto|text/i);
  expect(()=>normalizeRacingSceneConfig({challenge:{...challenge,bestTimeTextIndex:8}})).toThrow(/texto|text/i);
 });
 it('exports challenge without shifting any campaign variables or name text slot',()=>{
  const p=JSON.parse(readFileSync('default-assets/templates/exemplo-gba/exemplo-gba.gba-project','utf8'));
  for(const key of ['rooms','scenas']) p[key].find((r:any)=>r.name==='circuito_final').runtime.config.challenge=challenge;
  const room=buildEngineExportProjectContract(p).racing_project!.rooms.find(r=>r.name==='circuito_final')!;
  expect(room.challenge).toEqual({boost_variable_index:7,best_time_text_index:1,result_time_text_index:3,result_position_text_index:4,result_rating_text_index:5,result_best_text_index:6,gold_seconds:80,silver_seconds:120});
 });
 it('preserves saved text bindings and runtime availability for pause actions',()=>{
  const c=normalizeMenuSceneConfig({items:[{id:'best',binding:{source:'text',index:6,format:'number'},availableRuntime:'racing'}]});
  expect(c.items[0].binding).toEqual({source:'text',index:6,format:'number'});
  expect(c.items[0].availableRuntime).toBe('racing');
 });
});

it('exports the complete authored integration with pause, result text and conditional restart', async()=>{
 const {extendRacingMenus}=await import('../../scripts/racing-menu-evolutions-project.mjs');
 const p=extendRacingMenus(JSON.parse(readFileSync('default-assets/templates/exemplo-gba/exemplo-gba.gba-project','utf8')));
 expect(validateGBAProjectMigrationContract(p)).toEqual([]);
 const c=buildEngineExportProjectContract(p);
 const preparationIndex=c.menu_project!.screens.findIndex(s=>s.name==='corrida_preparacao');
 const victory=c.luta_project!.scripts!.find(s=>s.name==='arena_vencer_rival')!.script;
 expect(victory).toContainEqual(expect.objectContaining({op:'set_variable',variable:7,value:1}));
 expect(victory).toContainEqual(expect.objectContaining({op:'warp_runtime',runtime:'menu',room:preparationIndex}));
 expect(c.racing_project!.scripts!.at(-1)?.name).toBe('__gbastudio_start_menu__');
 expect(c.menu_project!.screens.find(s=>s.name==='corrida_resultados')!.hud_bindings?.[0].binding?.source).toBe('text');
 expect(c.menu_project!.screens.find(s=>s.name==='menu_start')!.items.map(i=>i.label)).not.toContain('REINICIAR');
});
it('preserves a native text header over a reused book background',()=>{
 const hudHeader={x:5,y:2,width:9,backgroundColor:11520,textColor:24478};
 expect(normalizeMenuSceneConfig({hudHeader}).hudHeader).toEqual(hudHeader);
});
