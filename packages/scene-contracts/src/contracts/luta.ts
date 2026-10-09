import type { ControlledEntityContract } from "../types.js";

export const lutaControlledEntityContract: ControlledEntityContract = {
  sceneType: "luta",
  required: true,
  role: "fighter",
  visualCanvas: { width: 32, height: 64 },
  collision: { width: 24, height: 48 },
  anchor: "bottom-center",
  directionModel: {
    mode: "horizontal-facing",
    generated: ["right"],
    mirrored: { left: "right" }
  },
  animations: {
    idle: { technicalState: "idle", required: true, defaultFrames: 3, allowedFrames: [2, 6], fps: 8, loop: true },
    walk: { technicalState: "walk", required: true, defaultFrames: 4, allowedFrames: [2, 8], fps: 12, loop: true },
    jump: { technicalState: "jump", required: true, defaultFrames: 3, allowedFrames: [2, 6], fps: 10, loop: false },
    fall: { technicalState: "fall", required: true, defaultFrames: 2, allowedFrames: [1, 4], fps: 10, loop: true },
    attack: { technicalState: "attack", required: true, defaultFrames: 4, allowedFrames: [3, 8], fps: 12, loop: false },
    hurt: { technicalState: "hurt", required: true, defaultFrames: 2, allowedFrames: [1, 4], fps: 10, loop: false }
  },
  gbaAssetPreset: "luta-fighter"
};
