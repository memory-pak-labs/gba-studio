import type { ControlledEntityContract } from "../types.js";

export const racingControlledEntityContract: ControlledEntityContract = {
  sceneType: "racing",
  required: true,
  role: "vehicle",
  visualCanvas: { width: 32, height: 32 },
  compactVariant: { width: 16, height: 32 },
  collision: { width: 16, height: 24 },
  anchor: "center",
  directionModel: {
    mode: "heading-4",
    generated: ["up", "right", "down"],
    mirrored: { left: "right" }
  },
  animations: {
    idle: { technicalState: "idle", required: true, defaultFrames: 1, allowedFrames: [1, 2], fps: 1, loop: true },
    drive: { technicalState: "walk", required: true, defaultFrames: 2, allowedFrames: [2, 4], fps: 10, loop: true },
    hurt: { technicalState: "hurt", required: false, defaultFrames: 1, allowedFrames: [1, 2], fps: 8, loop: false }
  },
  gbaAssetPreset: "racing-player"
};
