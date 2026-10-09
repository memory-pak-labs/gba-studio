import type { ControlledEntityContract } from "../types.js";

export const shmupControlledEntityContract: ControlledEntityContract = {
  sceneType: "shmup",
  required: true,
  role: "ship",
  visualCanvas: { width: 32, height: 32 },
  collision: { width: 16, height: 16 },
  anchor: "center",
  directionModel: { mode: "scene-dependent" },
  animations: {
    fly: { technicalState: "walk", required: true, direction: "none", defaultFrames: 2, allowedFrames: [2, 4], fps: 10, loop: true },
    "bank-right": { technicalState: "walk", required: false, direction: "right", defaultFrames: 1, allowedFrames: [1, 2], fps: 10, loop: true },
    "bank-left": { technicalState: "walk", required: false, direction: "left", defaultFrames: 1, allowedFrames: [1, 2], fps: 10, loop: true },
    hurt: { technicalState: "hurt", required: false, direction: "none", defaultFrames: 1, allowedFrames: [1, 2], fps: 10, loop: false }
  },
  gbaAssetPreset: "shmup-player"
};
