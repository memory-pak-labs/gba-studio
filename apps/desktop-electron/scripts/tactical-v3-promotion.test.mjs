import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";
import { promoteExemploGBAVerticeCampaign } from "./vertice-showcase-project.mjs";

const projectURL = new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url);
const assetRootURL = new URL("../default-assets/templates/exemplo-gba/Assets/", import.meta.url);
const diamondRootURL = new URL("../../../tools/gba-sprite-prep/production/exemplo-gba-tactical-diamond-v1-candidate/prepared/", import.meta.url);
const project = JSON.parse(readFileSync(projectURL, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function expandedCollisions(room) {
  const value = room.collisionTypes;
  if (Array.isArray(value)) return value;
  return value.runs.flatMap(([type, count]) => Array(count).fill(type));
}

describe("tactical asset provenance and current V5 scene", () => {
  it("acompanha o catálogo atual e usa assets aprovados da Arena V5", () => {
    expect(project.rooms.length).toBeGreaterThan(0);
    expect(project.rooms.map((room) => room.name)).toEqual(project.scenas.map((room) => room.name));
    for (const name of ["tactical-v5-surface.png", "tactical-v5-hud.png", "tactical-nara-v5.png", "tactical-sentinel-v5.png"]) {
      expect(project.assets.find((asset) => asset.name === name)?.metadata).toMatchObject({
        reviewStatus: "approved",
        visualStatus: "approved",
        candidateStatus: "canonical-integrated"
      });
      expect(readFileSync(new URL(`../default-assets/templates/exemplo-gba/Assets/${name === "tactical-v5-hud.png" ? "ui" : name.includes("surface") ? "backgrounds" : "sprites"}/${name}`, import.meta.url)).length)
        .toBeGreaterThan(0);
    }
  });

  it("liga fundo, HUD, atores, marcador e rampa à mesma arena", () => {
    const room = project.rooms.find((item) => item.name === "arena_tatica");
    expect(project.scenas.find((item) => item.name === "arena_tatica")).toEqual(room);
    expect(room.backgroundAssetName).toBe("tactical-v5-surface.png");
    expect(room.cameraBounds).toEqual({ x: 0, y: 0, width: 240, height: 160 });
    expect(room.runtime.config.tacticalPresentation.surfacePages).toEqual([{
      id: "coastal-v5", asset: "tactical-v5-surface.png",
      bankGroup: "arena_tatica_coastal", world: { x: 0, y: 0, width: 240, height: 160 }
    }]);
    expect(room.runtime.config.tacticalPresentation.hudLayout).toBe("tactical-v5-hud.png");
    expect(room.runtime.config.tacticalPresentation.assets.filter((asset) => asset.consumer !== "audio"))
      .toHaveLength(7);
    expect(room.runtime.config.tacticalPresentation.assets.filter((asset) => asset.consumer !== "audio")
      .every((asset) => asset.status === "approved")).toBe(true);
    expect(expandedCollisions(room)[2 * 6 + 3]).toBe("slope_up_right");
    expect(room.heightLevels[2 * 6 + 3]).toBe(1);
    for (const [who, position] of [["nara", { x: 1, y: 4, z: 0 }], ["sentinel", { x: 4, y: 1, z: 1 }]]) {
      const actor = project.actors.find((item) => item.id === `tactical-${who}`);
      expect(actor).toMatchObject({ ...position, spriteSheet: `tactical-${who}-v5.png`,
        animationStateID: `tactical-${who}-v5-state` });
      expect(project.animations.filter((item) => item.spriteSheet === `tactical-${who}-v5.png`)).toHaveLength(20);
    }
  });

  it("promove os três losangos 32×16 aprovados com animação e vínculos próprios", () => {
    for (const state of ["cursor", "range", "target"]) {
      const name = `tactical-${state}-diamond-32x16-v1.png`;
      const source = readFileSync(new URL(`tactical-${state}-diamond-32x16-4bpp.png`, diamondRootURL));
      const canonical = readFileSync(new URL(`sprites/${name}`, assetRootURL));
      expect(sha256(canonical)).toBe(sha256(source));
      expect(project.assets.find((asset) => asset.name === name)?.metadata).toMatchObject({
        source: `Assets/sprites/${name}`,
        preparedSha256: sha256(source),
        reviewStatus: "approved",
        visualStatus: "approved",
        candidateStatus: "canonical-integrated",
        width: 32,
        height: 16,
        frameWidth: 32,
        frameHeight: 16,
        frameCount: 1,
        hardwareObjectsPerFrame: 1,
        tilesPerFrame: 8
      });
      const animation = project.animations.find((item) => item.spriteSheet === name);
      expect(animation).toMatchObject({ frameWidth: 32, frameHeight: 16, frameCount: 1 });
      expect(animation.frames[0].tiles[0]).toMatchObject({
        sourceSheet: name,
        tileWidth: 32,
        tileHeight: 16
      });
      for (const collection of [project.rooms, project.scenas]) {
        const scene = collection.find((item) => item.name === "arena_tatica");
        expect(scene.runtime.config.tacticalPresentation[`${state}Asset`]).toBe(name);
        expect(scene.runtime.config.tacticalPresentation.assets).toContainEqual({
          id: `tactical-${state}-diamond-v1`, path: name, consumer: "obj",
          required: true, status: "approved"
        });
      }
    }
  });

  it("preserva a arena aprovada ao reconstruir o showcase para exportação", () => {
    const rebuilt = promoteExemploGBAVerticeCampaign(project);
    const arena = rebuilt.scenas.find((scene) => scene.name === "arena_tatica");
    expect(arena.backgroundAssetName).toBe("tactical-v5-surface.png");
    expect(arena.runtime.config.tacticalPresentation.cursorAsset).toBe("tactical-cursor-diamond-32x16-v1.png");
    expect(rebuilt.assets.some((asset) => asset.name === "tactical-v5-surface.png")).toBe(true);
    expect(rebuilt.assets.some((asset) => asset.name === "tactical-v5-hud.png")).toBe(true);
    expect(rebuilt.assets.filter((asset) => asset.name?.includes("diamond-32x16-v1.png"))).toHaveLength(3);
    expect(rebuilt.animations.filter((animation) => animation.spriteSheet?.includes("diamond-32x16-v1.png"))).toHaveLength(3);
    expect(rebuilt.actors.filter((actor) => actor.roomName === "arena_tatica"))
      .toEqual(project.actors.filter((actor) => actor.roomName === "arena_tatica"));
    expect(rebuilt.animations.filter((animation) => animation.spriteSheet === "tactical-nara-v5.png"))
      .toHaveLength(20);
    expect(rebuilt.animationStates.some((state) => state.id === "tactical-sentinel-v5-state"))
      .toBe(true);
    expect(() => buildEngineExportProjectContract(rebuilt)).not.toThrow();
  });
});
