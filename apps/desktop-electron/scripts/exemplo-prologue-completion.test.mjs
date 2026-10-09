import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";
import { promoteExemploGBAVerticeCampaign } from "./vertice-showcase-project.mjs";

const source = JSON.parse(readFileSync(new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8"));
describe("natural prologue completion", () => {
  for (const [label, project] of [["canonical", source], ["regenerated campaign", promoteExemploGBAVerticeCampaign(source)]]) {
    it(`${label}: reads all three frames before departing through A`, () => {
      const contract = buildEngineExportProjectContract(project);
      const scene = contract.cutscene_project.scenes.find(scene => scene.name === "prologo");
      expect(scene.on_enter).toEqual(expect.arrayContaining([
        expect.objectContaining({ op: "save_game", slot: 0 })
      ]));
      expect(scene.steps.filter(step => step.line >= 0)).toHaveLength(3);
      expect(scene.steps.slice(0, 3).every(step => !step.script?.some(command => command.op === "warp_runtime"))).toBe(true);
      expect(scene.steps.at(-1)).toMatchObject({
        line: -1,
        script: expect.arrayContaining([
          expect.objectContaining({ op: "set_variable", variable: 0, value: 2 }),
          expect.objectContaining({ op: "warp_runtime", runtime: "topdown", room: 0 })
        ])
      });
    });
  }
});
