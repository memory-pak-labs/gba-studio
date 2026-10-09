import type { ControlledEntityContract } from "../types.js";

export const pointAndClickControlledEntityContract: ControlledEntityContract = {
  sceneType: "pointAndClick",
  required: true,
  role: "cursor",
  visualCanvas: { width: 32, height: 32 },
  collision: "none",
  anchor: "hotspot",
  directionModel: { mode: "pointer" },
  animations: {
    pointer: { technicalState: "idle", required: true, defaultFrames: 1, allowedFrames: [1, 2], fps: 1, loop: true },
    hover: { technicalState: "walk", required: false, defaultFrames: 2, allowedFrames: [1, 3], fps: 8, loop: true },
    click: { technicalState: "attack", required: false, defaultFrames: 4, allowedFrames: [1, 4], fps: 12, loop: false }
  },
  gbaAssetPreset: "ui"
};
