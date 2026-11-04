import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {extendRacingMenus} from './racing-menu-evolutions-project.mjs';
const path='default-assets/templates/exemplo-gba/exemplo-gba.gba-project';
const source=()=>JSON.parse(readFileSync(path,'utf8'));
describe('racing and menu integration preservation',()=>{
 it('is additive and idempotent, preserving all approved artwork and prior card positions',()=>{
  const original=source(),saved=structuredClone(original),next=extendRacingMenus(original);
  expect(original).toEqual(saved);expect(extendRacingMenus(next)).toEqual(next);
  expect(next.assets).toEqual(original.assets);expect(next.animations).toEqual(original.animations);
  expect(next.variables).toEqual(original.variables);
  for(const [key,value]of Object.entries(original.editorState.sceneMapPositions))expect(next.editorState.sceneMapPositions[key]).toEqual(value);
  for(const name of ['porto_lumen','farol_interior','galeria_das_mares','sala_mare_vazante','penedos_vento','tempestade','guardiao_rele'])expect(next.rooms.find(r=>r.name===name)).toEqual(original.rooms.find(r=>r.name===name));
  for(const name of ['circuito_final','circuito_perspectiva']){
   const before=original.rooms.find(r=>r.name===name),after=next.rooms.find(r=>r.name===name);
   for(const field of ['tilemap','collisionTypes','backgroundAssetName','tileLayers'])expect(after[field]).toEqual(before[field]);
   expect(after.runtime.config.topdownTrack).toEqual(before.runtime.config.topdownTrack);
   expect(next.actors.filter(a=>a.roomName===name)).toEqual(original.actors.filter(a=>a.roomName===name));
  }
 });
 it('provides real quantities in one toolcase, reversible equipment and independent records',()=>{
  const p=extendRacingMenus(source()),room=n=>p.rooms.find(r=>r.name===n),event=n=>p.events.find(e=>e.name===n).steps.map(s=>s.command);
  expect(room('inventario_ferramentas').runtime.config.items.find(i=>i.id==='tool').binding).toMatchObject({source:'inventory',index:6,format:'number'});
  expect(event('race_tool_actions')).toContain('set_equipped_item 0 zzz_lumen_tool');
  expect(event('race_tool_actions')).toContain('set_equipped_item 0 none');
  expect(room('circuito_final').runtime.config.challenge.bestTimeTextIndex).toBe(1);
  expect(room('circuito_perspectiva').runtime.config.challenge.bestTimeTextIndex).toBe(2);
  expect(room('menu_start').runtime.config.items.map(i=>i.id)).toEqual(['missions','inventory','map','save','load','settings','back']);
  expect(room('corrida_confirmacao')).toBeUndefined();
  expect(room('arena_arrancada').campaign.nextScene).toBe('corrida_preparacao');
  const resultHud=p.settings.hudPresets.find(h=>h.id===room('corrida_resultados').hudPresetId);
  expect(room('corrida_resultados').runtime.config.items.map(i=>i.id)).toEqual(['retry','choose','continue']);
  for(const field of room('corrida_resultados').runtime.config.hudBindings)expect(field.columns*6).toBeLessThanOrEqual(resultHud.components[field.slot].width);
  expect(event('circuito_final_ao_entrar').some(c=>c.startsWith('attach_button R '))).toBe(false);
 });
});
it('retains the authored challenge, contextual menus, header and layout during full regeneration',async()=>{
 const {promoteExemploGBAVerticeCampaign}=await import('./vertice-showcase-project.mjs');
 const p=extendRacingMenus(source()),rebuilt=promoteExemploGBAVerticeCampaign(p);
 for(const name of ['circuito_final','circuito_perspectiva','corrida_preparacao','corrida_resultados','corrida_confirmacao','inventario_ferramentas','menu_start'])expect(rebuilt.rooms.find(r=>r.name===name)).toEqual(p.rooms.find(r=>r.name===name));
 expect(rebuilt.events.find(e=>e.name==='race_tool_actions')).toEqual(p.events.find(e=>e.name==='race_tool_actions'));
 expect(rebuilt.editorState.sceneMapPositions).toEqual(p.editorState.sceneMapPositions);
 expect(rebuilt.editorState.sceneExplorer).toEqual(p.editorState.sceneExplorer);
});

it('keeps the equipment condition aligned when another item changes native inventory indices',()=>{
 const original=source();original.events.push({name:'new_inventory_key',category:'Global',steps:[{command:'add_item a_new_tool 1',isEnabled:true}]});
 const p=extendRacingMenus(original),binding=p.rooms.find(r=>r.name==='inventario_ferramentas').runtime.config.items.find(i=>i.id==='tool').binding;
 expect(binding.index).toBe(7);
 expect(p.events.find(e=>e.name==='race_tool_actions').steps.map(s=>s.command)).toContain(`if_engine_field equipped_item_0 ${binding.index}`);
});
