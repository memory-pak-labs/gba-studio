import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";
import { promoteExemploGBAVerticeCampaign } from "./vertice-showcase-project.mjs";
const source = JSON.parse(readFileSync(new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8"));
describe("point-click campaign checkpoints", () => {
  for (const [label, data] of [["canonical", source], ["regenerated", promoteExemploGBAVerticeCampaign(source)]]) {
    it(`${label}: saves each point-click chapter after entering its actual scene`, () => {
      const contract = buildEngineExportProjectContract(data);
      for (const name of ["armazem_das_mares", "observatorio_do_farol"]) {
        const scene = contract.point_click_project.scenes.find(scene => scene.name === name);
        expect(scene.on_enter).toEqual(expect.arrayContaining([expect.objectContaining({op:"save_game", slot:0})]));
      }
    });
  }
});
