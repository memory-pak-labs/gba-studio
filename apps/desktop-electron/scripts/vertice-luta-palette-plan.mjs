import { readFileSync } from "node:fs";
// Historical authoring contract for the base campaign builder. It must not
// require a retired image to remain in the live example library.
const backgroundPlan = JSON.parse(readFileSync(
  new URL("../fixtures/asset-provenance/arena-original-palette-plan.json", import.meta.url), "utf8"
));

export const VERTICE_LUTA_BACKGROUND_PALETTE_PLAN = Object.freeze(backgroundPlan);

export const VERTICE_LUTA_PLAYER_OBJECT_PALETTE = Object.freeze([
  0, 4160, 7362, 4230, 5353, 11558, 10876, 12615,
  5429, 4565, 9752, 6478, 14966, 19228, 14789, 14865
]);

export const VERTICE_LUTA_RIVAL_OBJECT_PALETTE = Object.freeze([
  0, 4160, 5353, 5250, 8387, 11558, 12615, 11933,
  4566, 4498, 9786, 6478, 13909, 21309, 18137, 24543
]);
