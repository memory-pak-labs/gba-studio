import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {resolveGbaActorSprite} from '../src/shared/gbaRendering.ts';
import {promoteMarketAdventure,marketAdventureGeometry,projectMarketCell,MARKET_POINTS} from './market-adventure-promotion.mjs';
const canonical=()=>JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url)));
describe('Mercado Suspenso aprovado em 20 de outubro',()=>{
 it('preserva o BG aprovado e liga os três atores à paleta compartilhada e à HUD de entrega',()=>{
  const p=promoteMarketAdventure(canonical()),r=p.rooms.find(r=>r.name==='mercado_suspenso');
  expect(r.runtime.config.pagedSurface).toMatchObject({width:768,height:512});
  expect(r.cameraZones).toEqual([expect.objectContaining({area:{x:0,y:0,width:52,height:52},bounds:{x:0,y:0,width:768,height:512}})]);
  expect(p.actors.filter(a=>a.roomName===r.name).map(a=>a.spriteSheet)).toEqual(Array(3).fill('market-approved-actors-64x64.png'));
  expect(p.animations.filter(a=>a.spriteSheet==='market-approved-actors-64x64.png').flatMap(a=>a.frames.map(f=>f.sourceFrameIndex))).toEqual(expect.arrayContaining(Array.from({length:28},(_,i)=>i)));
  const hud=p.settings.hudPresets.find(h=>h.id===r.hudPresetId);
  expect(hud.components.find(c=>c.id==='delivery-count')).toMatchObject({valueVariable:'var_market_shortcut',x:205,y:9,width:6,textAdvance:6});
  expect(hud.components.find(c=>c.id==='hearts').valueVariable).toBe('porto_player_health');
  const hash=createHash('sha256').update(readFileSync(new URL('../default-assets/templates/exemplo-gba/Assets/backgrounds/'+r.backgroundAssetName,import.meta.url))).digest('hex');
  expect(hash).toBe('339bbea84785992feb68b0102dac46e88d3621c5893b129f0eefebab1b6b676b');
 });
 it('apoia os pés na praça e no terraço e conecta entrega, escada e saída sem cruzar água',()=>{
  const g=marketAdventureGeometry(),cell=([x,y])=>y*g.width+x;
  expect(projectMarketCell(...MARKET_POINTS.player)).toEqual([360,248]);
  expect(projectMarketCell(...MARKET_POINTS.guard,3)).toEqual([636,122]);
  const seen=new Set([cell(MARKET_POINTS.player)]),q=[...seen];
  for(let n=0;n<q.length;n++)for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
   const i=q[n],x=i%g.width+dx,y=Math.floor(i/g.width)+dy,j=y*g.width+x;
   if(x<0||y<0||x>=g.width||y>=g.height||g.collision[j]||seen.has(j))continue;
   const dz=Math.abs(g.levels[i]-g.levels[j]);
   if(dz>1||dz&&!(g.ramps[i]||g.ramps[j]))continue;
   seen.add(j);q.push(j);
  }
  for(const[name,point]of Object.entries(MARKET_POINTS))expect(seen.has(cell(point)),name).toBe(true);
  expect(g.collision.filter((v,i)=>!v&&!seen.has(i))).toHaveLength(0);
  expect(g.collision[cell([0,0])]).toBe(1);
 });
 it('distingue os frames dos NPCs que compartilham a sheet no Editor',()=>{
  const p=promoteMarketAdventure(canonical());
  const frame=id=>resolveGbaActorSprite(p,p.actors.find(a=>a.id===id)).frame;
  expect(frame('market-trader-v2').sourceX).toBe(20*64);
  expect(frame('market-guard-v1').sourceX).toBe(24*64);
  expect(frame('market-nara').sourceX).toBe(10*64);
 });
 it('é idempotente e preserva cenas, atores, HUDs e eventos alheios ao Mercado',()=>{
  const p=canonical(),next=promoteMarketAdventure(p);
  expect(promoteMarketAdventure(next)).toEqual(next);
  for(const k of ['rooms','scenas','actors','triggers'])expect(next[k].filter(r=>(r.roomName??r.name)!=='mercado_suspenso')).toEqual(p[k].filter(r=>(r.roomName??r.name)!=='mercado_suspenso'));
  expect(next.settings.hudPresets.filter(h=>h.id!=='hud-mercado-avancada')).toEqual(p.settings.hudPresets.filter(h=>h.id!=='hud-mercado-avancada'));
 });
});
