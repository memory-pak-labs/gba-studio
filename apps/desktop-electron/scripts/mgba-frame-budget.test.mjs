import { describe, expect, it } from "vitest";
import { decodeFrameBudgetTelemetry } from "../static/WebPlayer/player/mgba-direct-player.mjs";
const runtime = {schema:4, frame:30, runtimeKind:2, currentRoom:1};
const sample = () => Uint32Array.from([0x47534642,1,24,30,2,1,262144,7,512,2,4096,0,30,12,8192,4,120,3,20,5,30,9900,0,0]);
describe("native frame budget telemetry",()=>{
 it("keeps completed DMA distinct from pending bytes and native per-scene peaks",()=>{
  expect(decodeFrameBudgetTelemetry(sample(),runtime)).toMatchObject({frame:30,dmaBytes:512,dmaQueuedBytes:4096,vblankWorkTicks:30,oamEnabled:12,sceneFrameCount:30,peaks:{dma:{value:8192,frame:4},vblank:{value:120,frame:3},oam:{value:20,frame:5}}});
 });
 it("rejects stale frames, foreign scenes and incompatible headers",()=>{
  for (const [i,v] of [[0,0],[1,99],[2,16],[3,29],[4,3],[5,2],[6,0],[7,8],[13,129],[15,31]]) {const w=sample();w[i]=v;expect(decodeFrameBudgetTelemetry(w,runtime)).toBeNull();}
 });
 it("keeps unavailable native measurements pending",()=>{
  const w=sample();w[7]=0;
  expect(decodeFrameBudgetTelemetry(w,runtime)).toMatchObject({dmaBytes:null,vblankWorkTicks:null,oamEnabled:null,peaks:{dma:null,vblank:null,oam:null}});
 });
});
