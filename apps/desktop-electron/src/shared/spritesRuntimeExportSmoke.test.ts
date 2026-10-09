import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";

import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildFunctionalP0Project } from "./functionalP0Project.js";
import { createPreviewRuntime } from "./previewRuntime.js";
import { deriveRoomsWorkspacePresentation } from "./roomsWorkspace.js";
import {
  addSpriteMetaspriteTileInProject,
  createSpriteAnimationInProject,
  deriveSpritesWorkspacePresentation,
  generateSpriteFromReferenceInProject,
  updateSpriteAnimationFieldsInProject,
  updateSpriteMetaspriteFrameInProject
} from "./spritesWorkspace.js";
import { generateEngineProjectExport } from "./engineProjectExport.js";

function writeEvidenceIfRequested(evidence: Record<string, unknown>): void {
  const outputPath = process.env.GBA_STUDIO_SPRITES_RUNTIME_EXPORT_EVIDENCE;
  if (!outputPath) return;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

function setActorSprite(project: Record<string, unknown>) {
  const actors = Array.isArray(project.actors) ? project.actors.filter((actor): actor is Record<string, unknown> => (
    Boolean(actor) && typeof actor === "object" && !Array.isArray(actor)
  )) : [];
  return {
    ...project,
    actors: actors.map((actor) => actor.id === "actor-player"
      ? {
          ...actor,
          spriteSheet: "hero_real.png",
          animationName: "walk_down",
          animationFrameIndex: 0,
          direction: "down"
        }
      : actor)
  };
}

function buildSpritesRuntimeExportProject() {
  let project = buildFunctionalP0Project();
  project = {
    ...project,
    spriteReferenceImages: [
      ...(Array.isArray(project.spriteReferenceImages) ? project.spriteReferenceImages : []),
      {
        id: "ref-hero-real",
        assetName: "hero_reference.png",
        title: "Hero real turnaround",
        frameWidth: 16,
        frameHeight: 32,
        imageWidth: 64,
        imageHeight: 32,
        fps: 10,
        state: "walk",
        direction: "down"
      }
    ]
  };
  project = generateSpriteFromReferenceInProject(project, {
    animationID: "anim-hero-walk-down",
    assetSourceRelativePath: "Assets/sprites/hero_real.png",
    referenceID: "ref-hero-real",
    spriteAssetID: "asset-hero-real",
    spriteSheetName: "hero_real.png"
  });
  project = createSpriteAnimationInProject(project, {
    id: "anim-hero-walk-right",
    name: "walk_right",
    spriteSheet: "hero_real.png"
  });
  project = updateSpriteAnimationFieldsInProject(project, "anim-hero-walk-right", {
    direction: "right",
    frameCount: 1,
    frameHeight: 32,
    frameWidth: 16,
    fps: 10,
    state: "walk"
  });
  project = updateSpriteMetaspriteFrameInProject(project, "anim-hero-walk-right", {
    frameIndex: 0,
    originX: 8,
    originY: 24
  });
  project = addSpriteMetaspriteTileInProject(project, "anim-hero-walk-right", {
    frameIndex: 0,
    sourceSheet: "hero_real.png",
    sliceX: 16,
    sliceY: 0,
    tileHeight: 8,
    tileWidth: 8,
    x: -8,
    y: 0
  });
  return setActorSprite(project);
}

describe("Sprites runtime/export smoke", () => {
  it("proves imported sprite frames, states, directions and room actor usage across preview and export", () => {
    const project = buildSpritesRuntimeExportProject();
    const sprites = deriveSpritesWorkspacePresentation(project);
    const rooms = deriveRoomsWorkspacePresentation(project);
    const preview = createPreviewRuntime(project);
    const contract = buildEngineExportProjectContract(project);
    const exported = generateEngineProjectExport(project);
    const header = exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";
    const main = exported.files.find((file) => file.path === "main.cpp")?.contents ?? "";
    const heroAnimations = sprites.animationsBySheet["hero_real.png"] ?? [];
    const playerEntity = rooms.entities.find((entity) => entity.kind === "actor" && entity.name === "Player");

    expect(sprites.spriteSheets.find((sheet) => sheet.name === "hero_real.png")).toMatchObject({
      hasAsset: true,
      source: "Assets/sprites/hero_real.png"
    });
    expect(heroAnimations.map((animation) => `${animation.state}:${animation.direction}`).sort()).toEqual([
      "walk:down",
      "walk:right"
    ]);
    expect(heroAnimations.find((animation) => animation.id === "anim-hero-walk-down")).toMatchObject({
      frameCount: 4,
      frameSize: "16 x 32",
      fps: 10
    });
    expect(heroAnimations.find((animation) => animation.id === "anim-hero-walk-down")?.metaspriteFrames[0].tiles.length).toBeGreaterThan(0);
    expect(heroAnimations.find((animation) => animation.id === "anim-hero-walk-right")?.metaspriteFrames[0].tiles).toHaveLength(1);

    expect(playerEntity).toMatchObject({
      spriteSheet: "hero_real.png",
      animationName: "walk_down",
      spriteSource: "Assets/sprites/hero_real.png"
    });
    expect(preview.player).toMatchObject({
      spriteSheet: "hero_real.png",
      animationName: "walk_down"
    });
    expect(preview.player?.animationFrame).toMatchObject({
      animationID: "anim-hero-walk-down",
      frameWidth: 16,
      frameHeight: 32,
      sourceSheets: ["hero_real.png"]
    });

    expect(contract.copied_assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "Sprite",
        name: "hero_real.png",
        output: "assets/sprite/hero_real.png",
        source: "Assets/sprites/hero_real.png"
      })
    ]));
    expect(contract.topdown_project?.player).toMatchObject({
      metasprite: { asset: "hero_real", index: expect.any(Number) },
      animation: "walk_down",
      emit_animation_fallback: false
    });
    expect(contract.topdown_project?.player?.animations?.[0]).toMatchObject({
      durations: expect.arrayContaining([expect.any(Number)])
    });
    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "obj",
        name: "hero_real",
        sprite_width: 16,
        sprite_height: 32
      })
    ]));

    expect(header).toContain("struct ActorData");
    expect(header).toContain("\"hero_real.png\"");
    expect(header).toContain("\"walk_down\"");
    expect(main).toContain("actor.sprite_sheet");
    expect(main).toContain("actor.animation_name");

    writeEvidenceIfRequested({
      ok: true,
      generatedAt: new Date().toISOString(),
      workspaceVerified: true,
      previewRuntimeVerified: true,
      engineContractVerified: true,
      engineHeaderVerified: true,
      generatedRuntimeVerified: true,
      coveredFlow: [
        "reference-import",
        "sprite-asset",
        "metasprite-frame",
        "state-direction",
        "room-actor",
        "preview-player",
        "engine-contract",
        "engine-header",
        "generated-runtime"
      ],
      sprite: {
        sheet: "hero_real.png",
        states: heroAnimations.map((animation) => animation.state),
        directions: heroAnimations.map((animation) => animation.direction),
        frameCount: heroAnimations.find((animation) => animation.id === "anim-hero-walk-down")?.frameCount ?? 0,
        actor: preview.player?.name,
        animation: preview.player?.animationName
      }
    });
  });
});
