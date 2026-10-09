import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {promotePlatformerV7} from './promote-platformer-v7.mjs';
import {buildEngineExportProjectContract} from '../src/main/exportEngineProject.js';
const source=()=>JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8'));
describe('plataforma aprovada v7',()=>{
 it('preserva outras cenas e eventos, expande geometria e mantém promoção idempotente',()=>{
  const p=source(), next=promotePlatformerV7(p);
  expect(next.scenas.filter(s=>s.name!=='penedos_vento')).toEqual(p.scenas.filter(s=>s.name!=='penedos_vento'));
  expect(next.events).toEqual(p.events);
  const s=next.scenas.find(s=>s.name==='penedos_vento');
  expect(s.width).toBe(161);expect(s.height).toBe(20);
  expect(s.collisionTypes).toHaveLength(3220);
  expect(s.collisionTypes[16*161+14]).toBe('solid');
  expect(s.collisionTypes[16*161+56]).toBe('free');
  expect(s.collisionTypes[19*161+56]).toBe('damage');
  expect(s.collisionTypes[10*161+137]).toBe('ladder');
  expect(next.actors.filter(a=>a.roomName==='penedos_vento')).toHaveLength(8);
  expect(promotePlatformerV7(next)).toEqual(next);
 });
 it('exporta o mapa largo, jogador 32x32 e animações sem referências ausentes',()=>{
  const p=promotePlatformerV7(source());
  // Exercise this scene's exporter without unrelated actors from other runtimes.
  p.scenas=p.scenas.filter(s=>s.name==='penedos_vento');
  p.rooms=p.rooms.filter(s=>s.name==='penedos_vento');
  p.actors=p.actors.filter(a=>a.roomName==='penedos_vento');
  p.events=[];p.triggers=[];p.dialogues=[];p.sceneRouteTables=[];
  p.editorState={};p.advancedTools={};
  for(const s of [...p.scenas,...p.rooms])s.eventBindings={};
  for(const a of p.actors)a.eventBindings={};
  p.settings.general.startScene='penedos_vento';
  p.settings.general.startSceneType='platformer';
  const ex=buildEngineExportProjectContract(p);
  const room=ex.platformer_project.rooms.find(r=>r.name==='penedos_vento');
  expect(room.width_tiles).toBe(161);expect(room.height_tiles).toBe(20);
  expect(room.collision_flags).toHaveLength(3220);
  expect(room.player_start.x).toBe(112);
  expect(room.player_start.y).toBe(112);
  // Exported 32px parts end at anchor + 8; collision must share that base.
  expect(room.player_collision_offset.y + room.player_start.height).toBe(8);
  expect(p.animations.filter(a=>a.spriteSheet==='penedos-v7-player.png').map(a=>a.state)).toEqual(expect.arrayContaining(['idle','walk','jump','fall']));
  for(const a of p.actors.filter(a=>a.roomName==='penedos_vento')){
   expect(p.assets.some(s=>s.name===a.spriteSheet)).toBe(true);
   expect(p.animationStates.some(s=>s.id===a.animationStateID)).toBe(true);
  }
 });
});
