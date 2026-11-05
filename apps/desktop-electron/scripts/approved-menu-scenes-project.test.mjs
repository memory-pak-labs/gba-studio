import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {applyApprovedMenuScenes} from './approved-menu-scenes-project.mjs';

const source=()=>JSON.parse(readFileSync('default-assets/templates/exemplo-gba/exemplo-gba.gba-project','utf8'));
describe('approved pause, toolcase and race arrival',()=>{
 it('integrates only the approved menus and keeps other scenes and card positions intact',()=>{
  const before=source(),p=applyApprovedMenuScenes(before,true);
  expect(applyApprovedMenuScenes(p)).toEqual(p);
  expect(p.variables).toEqual(before.variables);
  expect(p.editorState.sceneMapPositions).toEqual(before.editorState.sceneMapPositions);
  for(const room of before.rooms)if(!['menu_start','inventario','inventario_ferramentas','corrida_resultados'].includes(room.name))expect(p.rooms.find(r=>r.name===room.name)).toEqual(room);
  expect(p.rooms.find(r=>r.name==='menu_start').runtime.config.items.map(i=>i.id)).toEqual(['missions','inventory','map','save','load','settings','back']);
  const results=p.rooms.find(r=>r.name==='corrida_resultados');
  expect(results.runtime.config.items.map(i=>i.id)).toEqual(['retry','choose','continue']);
  expect(results.backgroundAssetName).toBe('arrival-v21-background.png');
  expect(results.runtime.config.hudBindings.map(b=>b.binding.index)).toEqual([4,3,6,5]);
 });
 it('keeps three pages of one toolcase and actual inventory indices without introducing progress variables',()=>{
  const p=applyApprovedMenuScenes(source(),true),inventory=p.rooms.find(r=>r.name==='inventario').runtime.config;
  expect(inventory.screens.map(s=>s.id)).toEqual(['inventario','inventario_modulos_2']);
  expect(inventory.screens[0].items.map(i=>i.id)).toEqual(['frame','grip','cell','shield','boost']);
  expect(inventory.screens[1].items.map(i=>i.id)).toEqual(['stabilizer']);
  const tools=p.rooms.find(r=>r.name==='inventario_ferramentas');
  expect(tools.backgroundAssetName).toBe('toolcase-toolcase-bg-240x160.png');
  expect(tools.runtime.config.items.map(i=>i.id)).toEqual(['tool','compass','chart','relay']);
  expect(tools.runtime.config.pageNavigation).toEqual({previousScreenID:'inventario_modulos_2',nextScreenID:'inventario'});
  expect(tools.runtime.config.items[0].binding).toEqual({source:'inventory',index:6,format:'number'});
  expect(p.variables).toHaveLength(64);
 });
 it('returns repeated attempts to the map and leaves choosing a race as a distinct action',()=>{
  const p=applyApprovedMenuScenes(source(),true),commands=n=>p.events.find(e=>e.name===n).steps.map(s=>s.command);
  expect(commands('race_results_choose')).toContain('change_scene corrida_preparacao');
  expect(commands('race_results_continue')).toContain('call_procedure circuito_concluir');
  expect(commands('race_results_continue').filter(c=>c==='call_procedure race_return_map')).toHaveLength(3);
  expect(p.events.find(e=>e.name==='race_return_map').eventKind).toBe('procedure');
  expect(p.actors.filter(a=>a.roomName==='corrida_resultados'&&a.spriteSheet==='arrival-v21-nara.png')).toHaveLength(3);
 });
});
