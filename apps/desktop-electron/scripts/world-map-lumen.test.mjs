import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {buildEngineExportProjectContract} from '../src/main/exportEngineProject.js';
import {normalizeWorldMapSceneConfig,normalizeSceneRuntime} from '../src/shared/sceneTypeProfiles.js';
import {promoteApprovedWorldMapLumen,LUMEN_ROUTE_POSITIONS} from './world-map-lumen-promotion.mjs';
import {auditProjectSpriteFrames} from './lib/sprite-canvas-audit.mjs';

const source=()=>JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url)));
const labels={available:'! Viajar    / Porto',journey:'Travessia',locked:'Rota bloqueada'};
describe('mapa Lumen: HUD autorada e cursor affine',()=>{
 it('promove somente a cena do mapa e conserva as travas e destinos da campanha',()=>{
  const p=source(),r=promoteApprovedWorldMapLumen(p),map=r.rooms.find(x=>x.name==='mapa_rota'),before=p.rooms.find(x=>x.name==='mapa_rota');
  expect(map.backgroundAssetName).toBe('route-lumen-paged.png');
  expect(auditProjectSpriteFrames(r).find(x=>x.sheet==='route-dirigible-lumen-64.png')?.clippedFrames).toBe(0);
  expect(map.runtime.config.nodes.map(n=>[n.x,n.y])).toEqual(LUMEN_ROUTE_POSITIONS);
  expect(map.runtime.config.nodes.map(n=>[n.requiredVariable,n.requiredValue,n.eventName,n.connections])).toEqual(before.runtime.config.nodes.map(n=>[n.requiredVariable,n.requiredValue,n.eventName,n.connections]));
  expect(r.events.filter(e=>e.name!=='mapa_ao_entrar')).toEqual(p.events.filter(e=>e.name!=='mapa_ao_entrar'));
  expect(r.actors.filter(a=>a.roomName!=='mapa_rota')).toEqual(p.actors.filter(a=>a.roomName!=='mapa_rota'));
  expect(r.rooms.filter(x=>x.name!=='mapa_rota')).toEqual(p.rooms.filter(x=>x.name!=='mapa_rota'));
  expect(promoteApprovedWorldMapLumen(r)).toEqual(r);
 });
 it('preserva os textos da HUD ao normalizar, salvar e exportar o world map',()=>{
  const p=source();
  for(const list of [p.rooms,p.scenas])for(const r of list)if(r.name==='mapa_rota')r.runtime.config.hudLabels=labels;
  const config=normalizeWorldMapSceneConfig({hudLabels:labels});
  expect(config.hudLabels).toEqual(labels);
  expect(normalizeSceneRuntime('worldMap',{type:'worldMap',config:{hudLabels:labels}}).config.hudLabels).toEqual(labels);
  const map=buildEngineExportProjectContract(p).world_map_project;
  expect(map.hud_labels).toEqual(labels);
  expect(map.cursor_affine).toBe(true);
 });
 it('usa os defaults do runtime em mapas sem rótulos personalizados',()=>{
  expect(normalizeWorldMapSceneConfig({}).hudLabels).toBeUndefined();
 });
});
