import type { ControlledEntityContract } from "../types.js";

export const worldMapControlledEntityContract: ControlledEntityContract = {
  sceneType: "worldMap",
  required: false,
  role: "marker",
  activation: "navigable",
  visualCanvas: { width: 16, height: 16 },
  vehicleVariant: { width: 32, height: 32 },
  collision: { width: 8, height: 8 },
  anchor: "center",
  directionModel: { mode: "none-or-cardinal-4" },
  animations: {
    idle: { technicalState: "idle", required: true, defaultFrames: 1, allowedFrames: [1, 2], fps: 4, loop: true },
    move: { technicalState: "walk", required: true, defaultFrames: 2, allowedFrames: [2, 4], fps: 8, loop: true }
  },
  gbaAssetPreset: "world-map-player"
};
