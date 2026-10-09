import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {marketAdventureGeometry,MARKET_POINTS,promoteMarketAdventure} from './market-adventure-promotion.mjs';
describe('approved Mercado adventure',()=>{
 it('connects every objective through walking cells and climbable stairs',()=>{
  const g=marketAdventureGeometry(),id=([x,y])=>y*g.width+x;
  const q=[id(MARKET_POINTS.player)],seen=new Set(q);
  for(let i=0;i<q.length;i++)for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
   const n=q[i],x=n%g.width+dx,y=Math.floor(n/g.width)+dy,j=y*g.width+x;
   if(x>=0&&y>=0&&x<g.width&&y<g.height&&!g.collision[j]&&!seen.has(j)&&Math.abs(g.levels[n]-g.levels[j])<=1){seen.add(j);q.push(j);}
  }
  for(const [name,p]of Object.entries(MARKET_POINTS))expect(seen.has(id(p)),name).toBe(true);
  const inaccessible=[];
  for(let n=0;n<g.collision.length;n++)if(!g.collision[n]&&!seen.has(n))inaccessible.push([n%g.width,Math.floor(n/g.width)]);
  expect(inaccessible).toEqual([]);
 });
 it('preserves unrelated scenes and promotes idempotently without tactical mechanics',()=>{
  const p=JSON.parse(fs.readFileSync('default-assets/templates/exemplo-gba/exemplo-gba.gba-project'));
  const next=promoteMarketAdventure(p);
  expect(promoteMarketAdventure(next)).toEqual(next);
  expect(next.rooms.filter(r=>r.name!=='mercado_suspenso')).toEqual(p.rooms.filter(r=>r.name!=='mercado_suspenso'));
  const market=next.rooms.find(r=>r.name==='mercado_suspenso');
  expect(market.runtime.config).toMatchObject({gameplayMode:'adventure',movement:'free',worldMode:'scrollable_tiled_world'});
  expect(market.collisions).toBeUndefined();
  expect(next.editorState.scenaConnections.find(c=>c.eventName==='mercado_abrir_usina').exit).toEqual({x:27,y:12,width:1,height:1});
  expect(next.animationStates.find(s=>s.id==='market-adventure-player-state').animationIDs.every(id=>!/attack|hurt|defeat/.test(id))).toBe(true);
 });
});
