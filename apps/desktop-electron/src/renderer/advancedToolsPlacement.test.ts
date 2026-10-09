import { describe, expect, it } from "vitest";

import {
  advancedToolsForSurface,
  type AdvancedToolsSurface
} from "./advancedToolsPlacement.js";

describe("advanced tools placement", () => {
  const expected: Record<AdvancedToolsSurface, string[]> = {
    Editor: ["autotile", "particles", "cinematicTimeline", "effectsSequencer"],
    Eventos: ["stateMachines", "gameplayComponents"],
    Dialogos: ["fontEditor", "localization"],
    Arquivos: ["asepriteTsx"],
    Ajustes: ["pluginDev"],
    Diagnosticos: ["inputReplay", "saveLab", "linkCable"]
  };

  it.each(Object.entries(expected) as Array<[AdvancedToolsSurface, string[]]>)(
    "mantem somente as ferramentas contextuais de %s",
    (surface, toolIDs) => {
      expect(advancedToolsForSurface(surface)).toEqual(toolIDs);
    }
  );

  it("nao cria uma superficie generica Ferramentas", () => {
    expect(Object.keys(expected)).not.toContain("Ferramentas");
  });

  it("filtra ferramentas visuais pela capacidade do runtime ativo", () => {
    expect(advancedToolsForSurface("Editor", "platformer")).toEqual([
      "autotile", "particles", "effectsSequencer"
    ]);
    expect(advancedToolsForSurface("Editor", "cutscene")).toEqual([
      "cinematicTimeline", "effectsSequencer"
    ]);
    expect(advancedToolsForSurface("Editor", "worldMap")).toEqual([
      "autotile", "effectsSequencer"
    ]);
    expect(advancedToolsForSurface("Editor", "battleRpg")).toEqual([
      "particles", "effectsSequencer"
    ]);
  });

  it("filtra automações que não são compiladas pelo runtime ativo", () => {
    expect(advancedToolsForSurface("Eventos", "menu")).toEqual([]);
    expect(advancedToolsForSurface("Eventos", "battleRpg")).toEqual(["stateMachines"]);
    expect(advancedToolsForSurface("Eventos", "topdown")).toEqual([
      "stateMachines", "gameplayComponents"
    ]);
  });
});
