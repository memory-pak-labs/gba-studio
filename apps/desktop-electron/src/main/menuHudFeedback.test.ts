import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { normalizeMenuSceneConfig } from "../shared/menuScene.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

it("preserves the opt-in detail feedback across normalization and the real project export", () => {
  expect(normalizeMenuSceneConfig({ role: "save", hudFeedbackInDetails: true }))
    .toMatchObject({ hudFeedbackInDetails: true });
  expect(normalizeMenuSceneConfig({ role: "save" })).not.toHaveProperty("hudFeedbackInDetails");
  const project = JSON.parse(readFileSync(new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8"));
  for (const key of ["rooms", "scenas"]) {
    project[key].find((room: {name: string}) => room.name === "salvar").runtime.config.hudFeedbackInDetails = true;
  }
  const screen = buildEngineExportProjectContract(project).menu_project!.screens.find(screen => screen.name === "salvar");
  expect(screen).toHaveProperty("hud_feedback_in_details", true);
});

it.each(["menu_start", "missoes", "inventario", "mapa_menu", "salvar", "configuracoes"])(
  "reports the expanded native screen index when Play starts at %s", name => {
    const project = JSON.parse(readFileSync(new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8"));
    const contract = buildEngineExportProjectContract(project, { developmentStartScene: { name } });
    const initial = contract.menu_project!.initial_screen;
    expect(contract.menu_project!.screens[initial]!.name).toBe(name);
    expect(contract.runtime_dispatch).toMatchObject({initial_runtime: "menu", initial_scene: name, initial_room: initial});
  }
);
