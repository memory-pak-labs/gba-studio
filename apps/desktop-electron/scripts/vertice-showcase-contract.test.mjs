import { describe, expect, it } from "vitest";

import {
  VERTICE_CAMPAIGN_SCENES,
  VERTICE_ENTRY_SCENE,
  VERTICE_SCENE_PACKAGES,
  VERTICE_PROGRESS_KEYS,
  VERTICE_START_SCENE,
  VERTICE_SUPPORT_SCENES
} from "./vertice-showcase-contract.mjs";

describe("Vértice showcase campaign contract", () => {
  it("defines one cohesive route across the sixteen authored route scenes", () => {
    expect(VERTICE_CAMPAIGN_SCENES).toHaveLength(16);
    expect(VERTICE_CAMPAIGN_SCENES.map((scene) => scene.runtime)).toEqual([
      "menu",
      "cutscene",
      "topdown",
      "worldMap",
      "platformer",
      "pointAndClick",
      "pointAndClick",
      "isometric",
      "dungeonCrawler",
      "dungeonCrawler",
      "dungeonCrawler",
      "visualNovel",
      "shmup",
      "battleRpg",
      "luta",
      "racing"
    ]);
    expect(VERTICE_CAMPAIGN_SCENES.map((scene) => scene.name)).not.toContain("custom");
    expect(VERTICE_CAMPAIGN_SCENES.some((scene) => scene.runtime === "custom")).toBe(false);
  });

  it("starts at the title and ends only after the final circuit", () => {
    expect(VERTICE_START_SCENE).toBe("titulo");
    expect(VERTICE_ENTRY_SCENE).toBe("logo");
    expect(VERTICE_CAMPAIGN_SCENES[0]?.name).toBe(VERTICE_START_SCENE);
    expect(VERTICE_CAMPAIGN_SCENES.at(-1)).toMatchObject({
      name: "circuito_final",
      runtime: "racing",
      completionVariable: "campaignFinished"
    });
  });

  it("declares the reusable presentation and interface scenes", () => {
    expect(VERTICE_SUPPORT_SCENES.map((scene) => scene.name)).toEqual([
      "logo",
      "abertura",
      "menu_inicial",
      "escolha_genero",
      "nome_jogador",
      "carregar_jogo",
      "configuracoes",
      "creditos",
      "missoes",
      "inventario",
      "mapa_menu",
      "salvar",
      "menu_start",
      "arena_tatica",
      "farol_interior"
    ]);
    expect(VERTICE_SUPPORT_SCENES.map((scene) => scene.runtime)).toEqual([
      "cutscene", "cutscene", "menu", "menu", "menu", "menu", "menu", "menu", "menu", "menu", "menu", "menu", "menu", "isometric", "topdown"
    ]);
    expect(VERTICE_SUPPORT_SCENES.map((scene) => scene.role)).toEqual([
      "logo", "opening", "initial", "gender_select", "name_input", "load_game", "settings", "credits", "mission_board", "inventory", "map", "save", "start", "tactical", "topdown_interior"
    ]);
  });

  it("makes every gameplay reward part of one persisted progress model", () => {
    expect(VERTICE_PROGRESS_KEYS).toEqual([
      "chapter",
      "farolParts.frame",
      "farolParts.energyCell",
      "usina.combatCleared",
      "vehicleModules.grip",
      "vehicleModules.stabilizer",
      "vehicleModules.shield",
      "vehicleModules.boost",
      "bond.guardian",
      "routeFlags.activeRoute",
      "routeFlags.warehouseInspected",
      "routeFlags.observatoryRead",
      "routeFlags.marketShortcut",
      "routeFlags.relayCleared",
      "campaignFinished"
    ]);
    expect(VERTICE_CAMPAIGN_SCENES.filter((scene) => scene.completionVariable)).toHaveLength(13);
  });

  it("declares a complete authored content package for every scene", () => {
    expect(Object.keys(VERTICE_SCENE_PACKAGES)).toEqual(
      [...VERTICE_CAMPAIGN_SCENES.map((scene) => scene.name), "farol_interior"]
    );
    expect(VERTICE_SCENE_PACKAGES.tempestade).toMatchObject({
      assetRoles: expect.arrayContaining(["shmup-background-regular", "player-flight", "shmup-boss", "projectile"]),
      interactionRoles: expect.arrayContaining(["shield-feedback", "storm-audio"])
    });
    expect(VERTICE_SCENE_PACKAGES.usina_submersa).toMatchObject({
      assetRoles: expect.arrayContaining(["usina-dungeon-bg", "usina-machinery", "dungeon-depth-actor", "energy-cell"]),
      interactionRoles: expect.arrayContaining(["door-key", "energy-feedback", "plant-audio"])
    });
    expect(VERTICE_SCENE_PACKAGES.arena_arrancada).toMatchObject({
      assetRoles: expect.arrayContaining(["arena-bg", "fighter-player", "fighter-rival"]),
      interactionRoles: expect.arrayContaining(["round-feedback", "arena-audio"])
    });
    expect(VERTICE_SCENE_PACKAGES.circuito_final).toMatchObject({
      assetRoles: expect.arrayContaining(["racing-topdown-track", "racing-player", "racing-rival"]),
      interactionRoles: expect.arrayContaining(["technical-map", "racing-hud", "racing-audio"])
    });
    expect(VERTICE_SCENE_PACKAGES.mapa_rota).toMatchObject({
      assetRoles: expect.arrayContaining(["route-map", "route-airship"]),
      interactionRoles: expect.arrayContaining(["affine-transform", "affine-runtime"])
    });
  });
});
