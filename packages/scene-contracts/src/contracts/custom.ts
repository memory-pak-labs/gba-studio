import type { ControlledEntityContract } from "../types.js";

export const customControlledEntityContract: ControlledEntityContract = {
  sceneType: "custom",
  required: false,
  role: "none",
  activation: "explicit-override"
};
