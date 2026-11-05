import { describe, expect, it } from "vitest";
import {
  appendHardwareProfilerFrame,
  compareHardwareProfilerSessions,
  createHardwareProfilerSession
} from "./hardwareProfilerSessions.js";

describe("hardware profiler sessions", () => {
  it("records peaks and compares two measured sessions", () => {
    let baseline = createHardwareProfilerSession("baseline");
    baseline = appendHardwareProfilerFrame(baseline, {
      frame: 1, roomIndex: 0, sceneName: "enseada", runtime: "topdown",
      cpu: 42, dma: 18, vram: 40_000, oam: 60, scanline: 22
    });
    baseline = appendHardwareProfilerFrame(baseline, {
      frame: 2, roomIndex: 1, sceneName: "falésias", runtime: "platformer",
      cpu: 70, dma: 25, vram: 44_000, oam: 80, scanline: 30
    });
    let candidate = createHardwareProfilerSession("candidate");
    candidate = appendHardwareProfilerFrame(candidate, {
      frame: 1, roomIndex: 1, sceneName: "falésias", runtime: "platformer",
      cpu: 76, dma: 31, vram: 45_000, oam: 84, scanline: 34
    });

    expect(baseline.peaks.cpu).toEqual({
      frame: 2,
      roomIndex: 1,
      runtime: "platformer",
      sceneName: "falésias",
      value: 70
    });
    expect(baseline.scenePeaks).toEqual([
      expect.objectContaining({
        roomIndex: 0,
        runtime: "topdown",
        sceneName: "enseada",
        frameCount: 1,
        peaks: expect.objectContaining({ cpu: { frame: 1, value: 42 } })
      }),
      expect.objectContaining({
        roomIndex: 1,
        runtime: "platformer",
        sceneName: "falésias",
        frameCount: 1,
        peaks: expect.objectContaining({ vram: { frame: 2, value: 44_000 } })
      })
    ]);
    expect(compareHardwareProfilerSessions(baseline, candidate).deltas).toMatchObject({
      cpu: 6,
      dma: 6,
      vram: 1_000,
      oam: 4,
      scanline: 4
    });
  });
});


it("keeps native subsystem peaks per scene with the measured frame", () => {
  let session = createHardwareProfilerSession("subsystems");
  const frame = { frame: 5, roomIndex: 0, sceneName: "Door", runtime: "topdown", cpu: 2, dma: 0, vram: 0, oam: 1, scanline: 0 };
  session = appendHardwareProfilerFrame(session, { ...frame, subsystems: { scripts: 20, render: 50 } });
  session = appendHardwareProfilerFrame(session, { ...frame, frame: 6, roomIndex: 1, subsystems: { scripts: 3, render: 7 } });
  session = appendHardwareProfilerFrame(session, { ...frame, frame: 7, subsystems: { scripts: 10, render: 55 } });
  expect(session.scenePeaks[0].subsystems).toEqual({ scripts: { frame: 5, value: 20 }, render: { frame: 7, value: 55 } });
  expect(session.scenePeaks[1].subsystems?.scripts).toEqual({ frame: 6, value: 3 });
});

it("keeps absent measurements pending and preserves native peaks between polls", () => {
 let s=createHardwareProfilerSession("native");
 s=appendHardwareProfilerFrame(s,{frame:30,roomIndex:1,sceneName:"one",runtime:"topdown",cpu:1,dma:null,vram:null,oam:null,scanline:0});
 expect(s.peaks.dma.value).toBeNull();
 expect(compareHardwareProfilerSessions(s,createHardwareProfilerSession("missing")).deltas.dma).toBeNull();
 const nativeVideo={frame:40,room:1,sceneFrameCount:40,peaks:{dma:{value:8192,frame:4},oam:{value:28,frame:6},vblank:{value:100,frame:7}}};
 s=appendHardwareProfilerFrame(s,{frame:40,roomIndex:1,sceneName:"one",runtime:"topdown",cpu:1,dma:512,vram:null,oam:2,scanline:0,nativeVideo});
 expect(s.peaks.dma).toMatchObject({value:8192,frame:4});
 expect(s.scenePeaks[0].peaks.oam).toEqual({value:28,frame:6});
 expect(s.scenePeaks[0].nativeFrameCount).toBe(40);
});
