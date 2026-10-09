import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const canonicalProjectPath = resolve(
  repositoryRoot,
  "apps/desktop-electron",
  "default-assets/templates/exemplo-gba/exemplo-gba.gba-project"
);

const canonicalProject = JSON.parse(readFileSync(canonicalProjectPath, "utf8"));
const canonicalArenaBackground = canonicalProject.assets?.find(
  (asset) => asset?.name === "arena-gba.png"
);
const backgroundPlan = canonicalArenaBackground?.metadata?.backgroundPaletteReferencePlan;

if (!backgroundPlan || typeof backgroundPlan !== "object") {
  throw new Error(
    `Plano de paleta da Arena ausente no projeto P0 canônico: ${canonicalProjectPath}`
  );
}

export const VERTICE_LUTA_BACKGROUND_PALETTE_PLAN = Object.freeze(backgroundPlan);

export const VERTICE_LUTA_PLAYER_OBJECT_PALETTE = Object.freeze([
  0, 4160, 7362, 4230, 5353, 11558, 10876, 12615,
  5429, 4565, 9752, 6478, 14966, 19228, 14789, 14865
]);

export const VERTICE_LUTA_RIVAL_OBJECT_PALETTE = Object.freeze([
  0, 4160, 5353, 5250, 8387, 11558, 12615, 11933,
  4566, 4498, 9786, 6478, 13909, 21309, 18137, 24543
]);
