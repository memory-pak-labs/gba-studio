import type { ControlledEntityContract } from "../types.js";

export const platformerControlledEntityContract: ControlledEntityContract = {
  sceneType: "platformer",
  required: true,
  role: "character",
  visualCanvas: { width: 32, height: 32 },
  collision: { width: 16, height: 16 },
  anchor: "bottom-center",
  directionModel: {
    mode: "horizontal",
    generated: ["right"],
    mirrored: { left: "right" }
  },
  animations: {
    idle: { technicalState: "idle", required: true, defaultFrames: 2, allowedFrames: [1, 4], fps: 6, loop: true },
    walk: { technicalState: "walk", required: true, defaultFrames: 4, allowedFrames: [2, 8], fps: 12, loop: true },
    jump: { technicalState: "jump", required: true, defaultFrames: 2, allowedFrames: [1, 4], fps: 10, loop: false },
    fall: { technicalState: "fall", required: true, defaultFrames: 1, allowedFrames: [1, 3], fps: 8, loop: true },
    attack: { technicalState: "attack", required: false, defaultFrames: 4, allowedFrames: [2, 6], fps: 12, loop: false },
    hurt: { technicalState: "hurt", required: false, defaultFrames: 1, allowedFrames: [1, 3], fps: 8, loop: false }
  },
  gbaAssetPreset: "player-platformer"
};
