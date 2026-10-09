import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildActorEngineSpriteExport,
  buildAssetcSpritePackGeneration
} from "../src/shared/engineProjectExport.ts";
import {
  POINT_CLICK_SCENE_NAMES,
  promotePointClickSceneCandidates
} from "./point-click-scenes.mjs";

function emptyProject() {
  return {
    scenas: [],
    rooms: [],
    assets: [],
    animations: [],
    animationStates: [],
    actors: [],
    triggers: [],
    events: [],
    dialogues: []
  };
}

describe("point-and-click scene promotion", () => {
  it("materializes both rooms with cursors, NPCs and BG-object hotspots", () => {
    const project = promotePointClickSceneCandidates(emptyProject());

    expect(project.scenas.map((scene) => scene.name)).toEqual(POINT_CLICK_SCENE_NAMES);
    expect(project.rooms.map((room) => room.name)).toEqual(POINT_CLICK_SCENE_NAMES);

    for (const sceneName of POINT_CLICK_SCENE_NAMES) {
      const scene = project.scenas.find((candidate) => candidate.name === sceneName);
      const actors = project.actors.filter((actor) => actor.roomName === sceneName);
      const triggers = project.triggers.filter((trigger) => trigger.roomName === sceneName);

      expect(scene.sceneType).toBe("pointAndClick");
      expect(scene.backgroundRenderMode).toBe("tilemap");
      expect(scene.runtime.type).toBe("pointAndClick");
      expect(actors).toHaveLength(4);
      expect(actors.filter((actor) => actor.name === scene.playerActorName)).toHaveLength(1);
      expect(triggers).toHaveLength(3);
      expect(actors.every((actor) => actor.name.startsWith("Cursor") || ["Lia do Pergaminho", "Mecânico do Cais", "Guardião da Lanterna"].includes(actor.name))).toBe(true);

      expect(project.events.find((event) => event.name === `${sceneName}_saida`)).toMatchObject({
        steps: [expect.objectContaining({ command: "advance_campaign" })]
      });
    }

    expect(project.assets.filter((asset) => asset.metadata?.reviewStatus === "approved")).toHaveLength(11);
    expect(project.assets.filter((asset) => asset.metadata?.role === "point-click-background").map((asset) => asset.metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ assetcStatus: "attention", assetcReviewed: true }),
        expect.objectContaining({ assetcStatus: "attention", assetcReviewed: true })
      ])
    );
    expect(project.assets.filter((asset) => asset.metadata?.role !== "point-click-background" && asset.metadata?.role?.startsWith("point-click-")).every((asset) => (
      asset.metadata?.assetcStatus === "safe" && asset.metadata?.assetcReviewed === true
    ))).toBe(true);
    expect(project.scenas.every((scene) => scene.showcase?.lane === "campaign")).toBe(true);
    expect(project.animations.filter((animation) => animation.spriteSheet === "point-click-cursor.png")).toHaveLength(4);
  });

  it("is idempotent when the generated project is promoted again", () => {
    const once = promotePointClickSceneCandidates(emptyProject());
    const twice = promotePointClickSceneCandidates(once);

    expect(twice).toEqual(once);
  });

  it("retains object hotspots while dropping duplicate BG prop actors from existing scenes", () => {
    const legacy = promotePointClickSceneCandidates(emptyProject());
    for (const sceneName of POINT_CLICK_SCENE_NAMES) {
      const id = `${sceneName}-chart`;
      legacy.actors.push({ id, name: "Carta duplicada", roomName: sceneName, spriteSheet: "point-click-chart-compass.png" });
      legacy.animationStates.push({ id: `${id}-state`, animationIDs: [`${id}-idle`] });
      legacy.animations.push({ id: `${id}-idle`, spriteSheet: "point-click-chart-compass.png" });
    }
    const promoted = promotePointClickSceneCandidates(legacy);
    expect(promoted.actors.filter((actor) => POINT_CLICK_SCENE_NAMES.includes(actor.roomName))).toHaveLength(8);
    expect(promoted.actors.some((actor) => actor.id.endsWith("-chart"))).toBe(false);
    expect(promoted.animationStates.some((state) => state.id.endsWith("-chart-state"))).toBe(false);
    expect(promoted.animations.some((animation) => animation.id.endsWith("-chart-idle"))).toBe(false);
    expect(promoted.triggers.filter((trigger) => POINT_CLICK_SCENE_NAMES.includes(trigger.roomName))).toHaveLength(6);
  });

  it("keeps the canonical rooms free of duplicate background prop actors", () => {
    const templateUrl = new URL("../default-assets/templates/exemplo-gba/", import.meta.url);
    const canonical = JSON.parse(readFileSync(new URL("exemplo-gba.gba-project", templateUrl), "utf8"));
    for (const sceneName of POINT_CLICK_SCENE_NAMES) {
      const actors = canonical.actors.filter((actor) => actor.roomName === sceneName);
      const triggers = canonical.triggers.filter((trigger) => trigger.roomName === sceneName);
      expect(actors).toHaveLength(4);
      expect(triggers).toHaveLength(3);
      expect(actors.every((actor) => actor.name.startsWith("Cursor") || ["Lia do Pergaminho", "Mecânico do Cais", "Guardião da Lanterna"].includes(actor.name))).toBe(true);
    }
  });

  it("keeps the approved 32x48 NPC artwork linked in both canonical scenes", () => {
    const templateUrl = new URL("../default-assets/templates/exemplo-gba/", import.meta.url);
    const repositoryUrl = new URL("../../../", import.meta.url);
    const canonical = JSON.parse(readFileSync(new URL("exemplo-gba.gba-project", templateUrl), "utf8"));
    const generated = promotePointClickSceneCandidates(emptyProject());
    const approvedSprites = [
      ["point-click-dock-mechanic.png", "92affc7975e87a8392a85e50349eb4676bb84a92e4441ccc92775c88936df5f9"],
      ["point-click-lia-scroll.png", "5fd4d8fea4d5ecb1553502165f50a22b1207843bcbcb8c6f29483a3d59be2ee0"],
      ["point-click-keeper-lantern.png", "1f329d1a7e6ac111a171e186ebf813105eac8100bc062e370729bde93a357232"]
    ];

    for (const [spriteName, expectedHash] of approvedSprites) {
      const png = readFileSync(new URL(`Assets/sprites/${spriteName}`, templateUrl));
      expect(createHash("sha256").update(png).digest("hex")).toBe(expectedHash);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([32, 48]);

      for (const project of [generated, canonical]) {
        const asset = project.assets.find((item) => item.name === spriteName);
        expect(asset?.metadata).toMatchObject({
          frameWidth: 32,
          frameHeight: 48,
          visibleColors: 15,
          preparedSha256: expectedHash,
          reviewStatus: "approved",
          visualStatus: "approved"
        });
        const candidate = readFileSync(new URL(asset.metadata.sourceCandidate, repositoryUrl));
        expect(createHash("sha256").update(candidate).digest("hex")).toBe(expectedHash);
        for (const sceneName of POINT_CLICK_SCENE_NAMES) {
          const actor = project.actors.find((item) => item.roomName === sceneName && item.spriteSheet === spriteName);
          expect(actor).toBeDefined();
          const animationState = project.animationStates.find((item) => item.id === actor.animationStateID);
          const animation = project.animations.find((item) => item.id === animationState?.animationIDs?.[0]);
          expect(animation).toMatchObject({
            spriteSheet: spriteName,
            frameWidth: 32,
            frameHeight: 48,
            frames: [expect.objectContaining({
              width: 32,
              height: 48,
              tiles: [
                expect.objectContaining({ x: -8, y: 16, sliceX: 0, sliceY: 0, tileWidth: 32, tileHeight: 32 }),
                expect.objectContaining({ x: -8, y: 0, sliceX: 0, sliceY: 32, tileWidth: 32, tileHeight: 16 })
              ]
            })]
          });
        }
      }
    }
  });

  it("exports each approved NPC frame as two native OAM blocks", () => {
    const templateUrl = new URL("../default-assets/templates/exemplo-gba/", import.meta.url);
    const canonical = JSON.parse(readFileSync(new URL("exemplo-gba.gba-project", templateUrl), "utf8"));
    for (const project of [promotePointClickSceneCandidates(emptyProject()), canonical]) {
      const spritePack = buildAssetcSpritePackGeneration(project);
      for (const actor of project.actors.filter((item) => [
        "point-click-dock-mechanic.png",
        "point-click-lia-scroll.png",
        "point-click-keeper-lantern.png"
      ].includes(item.spriteSheet))) {
        const exported = buildActorEngineSpriteExport(project, actor, spritePack);
        expect(exported?.animations?.length).toBeGreaterThan(0);
        for (const animation of exported.animations) {
          for (const frame of animation.frame_metasprites ?? []) {
            expect(frame.parts.map(({ width, height, slice_x, slice_y }) => ({ width, height, slice_x, slice_y }))).toEqual([
              { width: 32, height: 32, slice_x: 0, slice_y: 0 },
              { width: 32, height: 16, slice_x: 0, slice_y: 32 }
            ]);
          }
        }
      }
    }
  });
});
