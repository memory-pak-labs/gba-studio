/** @vitest-environment happy-dom */
import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,describe,it,expect} from "vitest";
import {RuntimeFrameBudgetPanel} from "./RuntimeFrameBudgetPanel";
afterEach(cleanup);
describe("native frame budget panel",()=>{
 it("keeps missing engine measurements pending",()=>{render(<RuntimeFrameBudgetPanel/>);expect(screen.getByText("Execute uma ROM com a medição por frame habilitada.")).toBeInTheDocument();});
 it("shows copied DMA bytes separately from queued bytes and native peaks",()=>{
  render(<RuntimeFrameBudgetPanel sample={{frame:30,runtimeKind:0,room:1,ticksPerSecond:262144,dmaBytes:512,dmaTransfers:2,dmaQueuedBytes:4096,dmaDroppedTotal:0,vblankWorkTicks:30,oamEnabled:12,sceneFrameCount:30,sceneDmaBytes:9900,peaks:{dma:{value:8192,frame:4},vblank:{value:120,frame:3},oam:{value:20,frame:5}}}}/>);
  expect(screen.getByText("512 B")).toBeInTheDocument();expect(screen.getByText("4.096 B")).toBeInTheDocument();expect(screen.getByText(/8.192 B.*4/)).toBeInTheDocument();
  expect(screen.getByText("OAM habilitados")).toBeInTheDocument();expect(screen.getByText(/Espera por VBlank/)).toBeInTheDocument();
 });
});
