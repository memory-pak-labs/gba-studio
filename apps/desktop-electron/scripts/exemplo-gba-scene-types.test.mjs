import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";
import { EXEMPLO_GB_STUDIO_SCENE_TYPES, promoteExemploGBStudioSceneTypes } from "./exemplo-gba-scene-types.mjs";

const templateURL = new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url);

function project() {
  return promoteExemploGBStudioSceneTypes(JSON.parse(readFileSync(templateURL, "utf8")));
}

describe("tipos de cena do projeto canônico", () => {
  it("mantém os runtimes da campanha e as telas de interface de suporte", () => {
    const current = project();

    expect(current.scenas).toHaveLength(Object.keys(EXEMPLO_GB_STUDIO_SCENE_TYPES).length);
    expect(Object.fromEntries(current.scenas.map((scene) => [scene.name, scene.sceneType])))
      .toEqual(EXEMPLO_GB_STUDIO_SCENE_TYPES);
    expect(new Set(current.scenas.map((scene) => scene.sceneType))).toEqual(new Set([
      "menu", "cutscene", "topdown", "worldMap", "platformer", "pointAndClick", "isometric",
      "dungeonCrawler", "visualNovel", "shmup", "battleRpg", "luta", "racing"
    ]));
    expect(current.settings.general).toMatchObject({ startScene: "logo", startSceneType: "cutscene" });
  });

  it("exporta a arena e o circuito na mesma ROM mista", () => {
    const exported = buildEngineExportProjectContract(project());

    expect(exported.kind).toBe("mixed");
    expect(exported.runtime_dispatch).toMatchObject({ initial_runtime: "cutscene" });
    expect(exported.runtime_dispatch.runtimes).toEqual(expect.arrayContaining(["luta", "racing"]));
    expect(exported.luta_project?.stages).toHaveLength(1);
  });

  it("corrige um tipo alterado sem introduzir cenas antigas", () => {
    const current = JSON.parse(readFileSync(templateURL, "utf8"));
    const topdown = current.scenas.find((scene) => scene.name === "porto_lumen");
    topdown.sceneType = "platformer";

    const promoted = promoteExemploGBStudioSceneTypes(current);
    expect(promoted.scenas.find((scene) => scene.name === "porto_lumen")).toMatchObject({ sceneType: "topdown" });
    expect(promoted.scenas).toHaveLength(Object.keys(EXEMPLO_GB_STUDIO_SCENE_TYPES).length);
    expect(promoted.rooms).toEqual(promoted.scenas);
    expect(promoted.rooms).not.toBe(promoted.scenas);
  });

  it("mantém a saída da usina separada do ator da célula de energia", () => {
    const current = project();
    const energyCell = current.actors.find((actor) => actor.id === "usina-energy-cell-v2");
    const guardianExit = current.triggers.find((trigger) => trigger.id === "trigger-usina-exit");

    expect(energyCell).toBeDefined();
    expect(guardianExit).toBeDefined();
    const overlaps = energyCell.x < guardianExit.x + guardianExit.width
      && energyCell.x + 1 > guardianExit.x
      && energyCell.y < guardianExit.y + guardianExit.height
      && energyCell.y + 1 > guardianExit.y;
    expect(overlaps).toBe(false);
  });
});
