import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";
import { deriveProjectHealthReport } from "../src/shared/projectHealth.js";
import {
  promoteApprovedUsinaV3,
  syncApprovedUsinaV3Assets,
  USINA_V3_RUNTIME_ASSETS
} from "./usina-v3-promotion.mjs";

const templateURL = new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url);

describe("promoção aprovada da Usina v3", () => {
  it("preserva as cenas e seus gatilhos enquanto troca BG, HUD e atores", () => {
    const before = JSON.parse(readFileSync(templateURL, "utf8"));
    const after = promoteApprovedUsinaV3(before);
    const phases = [
      ["usina_submersa", "exploration"],
      ["usina_combate", "combat"],
      ["usina_saida", "exit"]
    ];

    expect(after.scenas).toHaveLength(before.scenas.length);
    expect(after.events.filter((event) => event.name !== "usina_coletar_celula"))
      .toEqual(before.events.filter((event) => event.name !== "usina_coletar_celula"));
    expect(after.triggers).toEqual(before.triggers);
    const rewardSteps = after.events.find((event) => event.name === "usina_coletar_celula").steps;
    expect(rewardSteps.filter((step) => step.command === "add_item usina_cell 1")).toHaveLength(1);
    expect(rewardSteps.findIndex((step) => step.command === "add_item usina_cell 1"))
      .toBe(rewardSteps.findIndex((step) => step.command === "set_variable var_energy_cell 1") + 1);
    for (const [name, phase] of phases) {
      const scene = after.scenas.find((item) => item.name === name);
      expect(scene).toMatchObject({
        backgroundAssetName: `usina-${phase}-background-v3-4bpp.png`,
        hudPresetId: `hud-usina-${phase}-v3`,
        runtime: { config: { profile: `usina-submersa-${phase}-v3` } }
      });
      const hud = after.settings.hudPresets.find((item) => item.id === scene.hudPresetId);
      expect(hud.components).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "frame", asset: `hud-usina-${phase}-v3-4bpp.png`,
          x: 176, y: 0, width: 64, height: 112
        })
      ]));
    }
    expect(after.actors.some((actor) => actor.id === "usina-combat-gate")).toBe(false);
    expect(after.actors.find((actor) => actor.id === "usina-sentinel-v2")).toMatchObject({
      spriteSheet: "sentinel-depth-far-mid-near-192x64-v3-4bpp.png",
      animationStateID: "usina-sentinel-v3-state"
    });
    expect(after.actors.find((actor) => actor.id === "usina-energy-cell-v2")).toMatchObject({
      spriteSheet: "usina-energy-cell-v3-4bpp.png",
      animationStateID: "usina-energy-cell-v3-state"
    });
    expect(promoteApprovedUsinaV3(after)).toEqual(after);
  });

  it("copia somente os oito PNGs preparados e confere seus hashes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "usina-v3-promotion-"));
    const projectPath = path.join(root, "exemplo.gba-project");
    await writeFile(projectPath, "{}\n");
    const report = await syncApprovedUsinaV3Assets(projectPath);
    expect(USINA_V3_RUNTIME_ASSETS).toHaveLength(8);
    for (const asset of USINA_V3_RUNTIME_ASSETS) {
      const copied = await readFile(path.join(root, "Assets", asset.folder, asset.name));
      const prepared = report.assets.find((record) => path.basename(record.prepared) === asset.name);
      expect(createHash("sha256").update(copied).digest("hex")).toBe(prepared.sha256);
    }
  });

  it("exporta a moldura da HUD como OBJ e mantém as três associações de cena", () => {
    const project = promoteApprovedUsinaV3(JSON.parse(readFileSync(templateURL, "utf8")));
    expect(deriveProjectHealthReport(project).exportReady).toBe(true);
    const contract = buildEngineExportProjectContract(project);
    const ui = contract.dungeon_crawler_project.dialogue_ui;
    expect(contract.dungeon_crawler_project.scripts.find((script) => script.name === "usina_coletar_celula")?.script)
      .toEqual(expect.arrayContaining([{ op: "add_inventory_item", item: 2, quantity: 1 }]));
    for (const [name, phase] of [
      ["usina_submersa", "exploration"],
      ["usina_combate", "combat"],
      ["usina_saida", "exit"]
    ]) {
      expect(ui.hud_scene_bindings).toContainEqual({
        scene_name: name, preset_id: `hud-usina-${phase}-v3`
      });
      const layout = ui.hud_layouts.find((item) => item.id === `hud-usina-${phase}-v3`);
      expect(layout.components[0]).toMatchObject({
        kind: "frame", asset: `hud_usina_${phase}_v3_4bpp`,
        x: 176, y: 0, width: 64, height: 112
      });
      expect(contract.asset_pack.assets).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: `hud_usina_${phase}_v3_4bpp`, kind: "obj",
          sprite_width: 64, sprite_height: 112,
          bank_groups: [`scene_${name}`]
        })
      ]));
    }
  });
});
