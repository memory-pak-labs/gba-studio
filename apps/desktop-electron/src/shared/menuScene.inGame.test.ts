import { expect, it } from "vitest";
import { normalizeMenuSceneConfig } from "./menuScene.js";

it("keeps authored HUD rows, player name and per-slot save status", () => {
  const config = normalizeMenuSceneConfig({ screenType: "menu", role: "start", hudListRows: 6,
    titleTextVariableName: "var_character_name", items: [
      { id: "slot", saveSlot: 2, requiresSave: true },
      { id: "language", action: "adjust_variable", valueLabels: ["PT", "EN", "ES"] }
    ] });
  expect(config).toMatchObject({ hudListRows: 6, titleTextVariableName: "var_character_name" });
  expect(config.items[0]).toMatchObject({ saveSlot: 2, requiresSave: true });
  expect(config.items[1]).toMatchObject({ valueLabels: ["PT", "EN", "ES"] });
});
