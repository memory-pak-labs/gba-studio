import { describe, expect, it } from "vitest";

import { buildMgbaAvEvidence } from "./mgba-av-evidence.mjs";

describe("mGBA audiovisual evidence", () => {
  it("requires a non-silent audio stream and non-black visual frames", () => {
    const evidence = buildMgbaAvEvidence({
      durationSeconds: 12.5,
      audio: { channels: 2, codec: "aac", maxVolumeDb: -9.1, meanVolumeDb: -12, sampleRate: 88200 },
      video: { codec: "h264", height: 720, width: 1080 },
      visualFrames: [{ path: "start.png", percentBlack: 3 }, { path: "end.png", percentBlack: 4 }]
    });
    expect(evidence).toMatchObject({ ok: true, audible: true, visuallyMeaningful: true });
    expect(() => buildMgbaAvEvidence({
      durationSeconds: 12.5,
      audio: { channels: 2, codec: "aac", maxVolumeDb: -90, meanVolumeDb: -95, sampleRate: 88200 },
      video: { codec: "h264", height: 720, width: 1080 },
      visualFrames: [{ path: "black.png", percentBlack: 100 }]
    })).toThrow(/nao comprova/);
  });
});
