import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { promoteExemploGBAVerticeCampaign } from "./vertice-showcase-project.mjs";

const templateURL = new URL(
  "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
  import.meta.url
);
const projectRoot = path.resolve(import.meta.dirname, "../default-assets/templates/exemplo-gba");

describe("promoção dos atores da Tempestade", () => {
  it("preserva as referências da Tempestade atual ao reconstruir o Exemplo", () => {
    const project = JSON.parse(readFileSync(templateURL, "utf8"));
    const regenerated = promoteExemploGBAVerticeCampaign(project);
    const stormRoom = project.scenas.find((scene) => scene.name === "tempestade");
    const stormActors = project.actors.filter((actor) => actor.roomName === "tempestade");
    const regeneratedActors = regenerated.actors.filter((actor) => actor.roomName === "tempestade");
    const expectedSheets = new Set([
      ...stormActors.map((actor) => actor.spriteSheet),
      project.settings.shmup.playerSprite,
      project.settings.shmup.enemySprite,
      project.settings.shmup.projectileSprite,
      project.settings.shmup.enemyProjectileSprite
    ].filter((name) => typeof name === "string" && name.length > 0));

    expect(regenerated.scenas.find((scene) => scene.name === "tempestade")).toMatchObject({
      sceneType: stormRoom.sceneType,
      backgroundAssetName: stormRoom.backgroundAssetName,
      playerActorName: stormRoom.playerActorName,
      runtime: stormRoom.runtime
    });
    expect(regeneratedActors.map(({ id, spriteSheet }) => [id, spriteSheet]).sort())
      .toEqual(stormActors.map(({ id, spriteSheet }) => [id, spriteSheet]).sort());
    expect(regenerated.settings.shmup).toMatchObject(project.settings.shmup);
    expect(regenerated.settings.shmup.playerSprite).toBe(project.settings.shmup.playerSprite);
    for (const spriteSheet of expectedSheets) {
      const asset = project.assets.find((candidate) => candidate.name === spriteSheet);
      expect(asset?.metadata?.source).toBe(`Assets/sprites/${spriteSheet}`);
      expect(existsSync(path.join(projectRoot, "Assets", "sprites", spriteSheet))).toBe(true);
      expect(regenerated.assets.some((candidate) => candidate.name === spriteSheet)).toBe(true);
    }
  });
});
