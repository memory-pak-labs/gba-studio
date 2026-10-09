import {test} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {refineRouteMap,ROUTE_DESTINATIONS} from './route-map-project.mjs';
const source=JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url)));
test('the route map keeps campaign gates and does not rewrite unrelated scenes',()=>{
 const result=refineRouteMap(source);
 assert.equal(result.rooms.length,source.rooms.length);
 const map=result.rooms.find(r=>r.name==='mapa_rota');
 assert.equal(map.runtime.config.nodes.length,8);
 assert.equal(map.width*8,480);assert.equal(map.height*8,320);
 for(const scene of source.rooms.filter(r=>r.name!=='mapa_rota'))assert.deepEqual(result.rooms.find(r=>r.name===scene.name),scene);
 for(const [id,,,,destination,gate] of ROUTE_DESTINATIONS){
  assert.ok(result.rooms.some(r=>r.name===destination));
  const node=map.runtime.config.nodes.find(n=>n.id===id);
  assert.equal(node.requiredVariable,gate);
  const event=result.events.find(e=>e.name===node.eventName);
  assert.ok(event.steps.some(s=>s.command.startsWith(`change_scene ${destination} `)));
 }
 assert.deepEqual(refineRouteMap(result),result,'repeat application is stable');
});
test('lab retirement removes references only when requested',()=>{
 const result=refineRouteMap(source,{removeLab:true});
 assert.equal(result.rooms.some(r=>r.name==='affine_lab'),false);
 assert.equal(result.scenas.some(r=>r.name==='affine_lab'),false);
 assert.equal(result.editorState.scenaConnections.some(c=>c.from==='affine_lab'||c.to==='affine_lab'),false);
});
