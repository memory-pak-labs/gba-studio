import type { ControlledEntityContract } from "../types.js";

export const isometricControlledEntityContract: ControlledEntityContract = {
  sceneType: "isometric",
  required: true,
  role: "character",
  visualCanvas: { width: 32, height: 32 },
  collision: { width: 16, height: 16 },
  anchor: "bottom-center",
  directionModel: {
    mode: "diagonal-4",
    generated: ["down-left", "down-right", "up-left", "up-right"],
    mirrored: {}
  },
  animations: {
    idle: { technicalState: "idle", required: true, defaultFrames: 1, allowedFrames: [1, 3], fps: 4, loop: true },
    walk: { technicalState: "walk", required: true, defaultFrames: 3, allowedFrames: [2, 6], fps: 8, loop: true },
    attack: { technicalState: "attack", required: false, defaultFrames: 4, allowedFrames: [2, 6], fps: 10, loop: false },
    hurt: { technicalState: "hurt", required: false, defaultFrames: 1, allowedFrames: [1, 3], fps: 8, loop: false }
  },
  gbaAssetPreset: "isometric-player"
};
