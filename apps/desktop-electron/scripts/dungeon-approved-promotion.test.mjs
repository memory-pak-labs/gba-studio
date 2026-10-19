import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {promoteApprovedDungeon} from './dungeon-approved-promotion.mjs';
import {buildEngineExportProjectContract} from '../src/main/exportEngineProject.js';
import {roomConnectionArrival} from '../src/shared/roomsWorkspace.js';
const source=()=>JSON.parse(readFileSync('default-assets/templates/exemplo-gba/exemplo-gba.gba-project'));
describe('approved dungeon',()=>{
 it('rebuilds views after opening or closing a cell, keeping original binaries intact',()=>{
  const p=promoteApprovedDungeon(source());for(const rooms of [p.rooms,p.scenas]){const r=rooms.find(r=>r.name==='usina_submersa');r.collisionTypes[0]='free';r.collisions[0]='free';}
  const changed=buildEngineExportProjectContract(p).dungeon_crawler_project;
  expect(changed.rooms[0].presentation.view_recipe).toBeDefined();
  expect(changed.rooms[1].presentation.view_recipe).toBeUndefined();
  const q=promoteApprovedDungeon(source());for(const rooms of [q.rooms,q.scenas]){const r=rooms.find(r=>r.name==='usina_submersa');r.collisionTypes[36]='solid';r.collisions[36]='solid';}
  expect(buildEngineExportProjectContract(q).dungeon_crawler_project.rooms[0].presentation.view_recipe).toBeDefined();
 });
 it('exports shared views, distance frames and live HUD, preserving other scenes',()=>{
  const before=source(),p=promoteApprovedDungeon(before);expect(promoteApprovedDungeon(p)).toEqual(p);
  expect(p.rooms.filter(r=>!r.name.startsWith('usina_'))).toEqual(before.rooms.filter(r=>!r.name.startsWith('usina_')));
  const contract=buildEngineExportProjectContract(p),c=contract.dungeon_crawler_project;
  for(const link of p.editorState.scenaConnections.filter(l=>l.to.startsWith('usina_'))){const r=p.rooms.find(r=>r.name===link.to);expect(roomConnectionArrival(link.entry,r.width,r.height,r.collisionTypes)).toMatchObject({x:r.runtime.config.playerStart.x,y:r.runtime.config.playerStart.y});}
  expect(contract.isometric_project.scripts.find(s=>s.name==='mercado_abrir_usina').script).toContainEqual({op:'warp_runtime',runtime:'dungeon_crawler',room:0,x:1,y:9});
  expect(c.view_cache.index).toHaveLength(204);expect(c.rooms.every(r=>r.presentation)).toBe(true);
  expect(c.rooms[1].actors[0].depth_frames.near.frame_indices).toHaveLength(8);
  expect(c.rooms[2].actors[0].depth_frames.mid.frame_indices).toHaveLength(4);
  expect(c.rooms[1].player_start).toEqual({x:9,y:3,direction:'north'});
  expect(c.backgrounds[c.rooms[1].presentation.hud_background].layer).toBe('bg1');
 });
});
