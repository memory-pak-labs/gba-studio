import type { ControlledEntityContract } from "../types.js";

export const topdownControlledEntityContract: ControlledEntityContract = {
  sceneType: "topdown",
  required: true,
  role: "character",
  visualCanvas: { width: 16, height: 32 },
  compactVariant: { width: 16, height: 16 },
  collision: { width: 16, height: 16 },
  anchor: "bottom-center",
  directionModel: {
    mode: "cardinal-4",
    generated: ["down", "right", "up"],
    mirrored: { left: "right" }
  },
  animations: {
    idle: { technicalState: "idle", required: true, defaultFrames: 2, allowedFrames: [1, 4], fps: 6, loop: true },
    walk: { technicalState: "walk", required: true, defaultFrames: 4, allowedFrames: [2, 8], fps: 10, loop: true },
    attack: { technicalState: "attack", required: false, defaultFrames: 4, allowedFrames: [2, 6], fps: 10, loop: false },
    hurt: { technicalState: "hurt", required: false, defaultFrames: 1, allowedFrames: [1, 3], fps: 8, loop: false }
  },
  gbaAssetPreset: "player-topdown"
};
