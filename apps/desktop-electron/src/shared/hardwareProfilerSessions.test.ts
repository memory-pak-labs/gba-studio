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
