import { describe, expect, it } from "vitest";

import {
  activeGbaBackgroundLayers,
  gbaActorSpriteRoomPlacement,
  gbaActorSpriteRoomPlacementFromFrame,
  gbaActorSpriteRoomPlacementPercent,
  gbaSpriteOamEntriesForPixels,
  gbaRenderLayers,
  gbaTileSizePx,
  gbaTopdownAreaToPixels,
  gbaTopdownTilePointToPixels,
  gbaTopdownTileToPixels,
  resolveGbaActorSprite,
  resolveGbaActorSpriteFrame,
  resolveGbaRoomBackgroundLayers,
  resolveGbaRoomRenderLayers,
  resolveGbaRoomTileset
} from "./gbaRendering.js";

describe("GBA rendering helpers", () => {
  it.each([32, 48, 64])("keeps scene placement when a complete %ipx frame is fitted in the animator", (width) => {
    const shiftedX = -(width / 2 - 8);
    const project = (fitted: boolean, generatedOrigin: boolean) => ({
      scenas: [{ name: "campo", sceneType: "platformer" }],
      assets: [{ name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } }],
      animations: [{ id: "idle", name: "idle", spriteSheet: "hero.png",
        frameWidth: width, frameHeight: width, originX: generatedOrigin ? 0 : width / 2,
        originY: generatedOrigin ? 0 : width, frames: [{ width, height: width,
          originX: (generatedOrigin ? 0 : width / 2) + (fitted ? shiftedX : 0),
          originY: generatedOrigin ? 0 : width, tiles: [{ x: fitted ? shiftedX : 0, y: 0,
            sliceX: 0, sliceY: 0, tileWidth: width, tileHeight: width, sourceSheet: "hero.png" }] }]
      }]
    });
    const actor = { name: "Hero", roomName: "campo", spriteSheet: "hero.png", animationName: "idle" };
    for (const generatedOrigin of [false, true]) {
      const before = resolveGbaActorSprite(project(false, generatedOrigin), actor)!.frame!;
      const after = resolveGbaActorSprite(project(true, generatedOrigin), actor)!.frame!;
      expect(gbaActorSpriteRoomPlacementFromFrame(20, 18, after))
        .toEqual(gbaActorSpriteRoomPlacementFromFrame(20, 18, before));
    }
  });

  it("calcula entradas OAM pela decomposição nativa de dimensões do GBA", () => {
    expect(gbaSpriteOamEntriesForPixels(64, 64)).toBe(1);
    expect(gbaSpriteOamEntriesForPixels(128, 16)).toBe(4);
  });

  it("resolves actor sprite size in real GBA 8x8 tiles", () => {
    const baseProject = {
      assets: [{ id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } }]
    };

    expect(gbaTileSizePx).toBe(8);
    expect(resolveGbaActorSprite({
      ...baseProject,
      animations: [{ id: "anim-idle", name: "idle", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16 }]
    }, { spriteSheet: "hero.png", animationName: "idle" })?.frame).toMatchObject({
      frameWidth: 16,
      frameHeight: 16,
      widthTiles: 2,
      heightTiles: 2
    });
    expect(resolveGbaActorSprite({
      ...baseProject,
      animations: [{ id: "anim-idle", name: "idle", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32 }]
    }, { spriteSheet: "hero.png", animationName: "idle" })?.frame).toMatchObject({
      frameWidth: 16,
      frameHeight: 32,
      widthTiles: 2,
      heightTiles: 4
    });
    expect(resolveGbaActorSprite({
      ...baseProject,
      animations: [{ id: "anim-idle", name: "idle", spriteSheet: "hero.png", frameWidth: 24, frameHeight: 24 }]
    }, { spriteSheet: "hero.png", animationName: "idle" })?.frame).toMatchObject({
      frameWidth: 24,
      frameHeight: 24,
      widthTiles: 3,
      heightTiles: 3
    });
  });

  it("usa âncora pé-centro para atores de gameplay com origem gerada zerada", () => {
    const project = {
      scenas: [{ name: "campo", sceneType: "topdown" }],
      assets: [{ name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } }],
      animations: [{
        id: "hero-idle",
        name: "idle",
        spriteSheet: "hero.png",
        frameWidth: 16,
        frameHeight: 32,
        originX: 0,
        originY: 0,
        frames: [{ width: 16, height: 32, originX: 0, originY: 0, tiles: [] }]
      }]
    };

    expect(resolveGbaActorSprite(project, {
      name: "Hero",
      roomName: "campo",
      spriteSheet: "hero.png",
      animationName: "idle"
    })?.frame).toMatchObject({ originX: 8, originY: 24 });
    expect(resolveGbaActorSprite(project, {
      name: "Menu image",
      roomName: "menu",
      spriteSheet: "hero.png",
      animationName: "idle"
    })?.frame).toMatchObject({ originX: 0, originY: 0 });
  });

  it("retains the generated foot pivot of an already fitted complete source image", () => {
    const frame = resolveGbaActorSprite({
      scenas: [{ name: "campo", sceneType: "pointAndClick" }],
      animations: [{ id: "idle", name: "idle", spriteSheet: "hero.png", frameWidth: 32, frameHeight: 48,
        originX: 0, originY: 0, frames: [{ width: 32, height: 48, originX: 0, originY: 0,
          tiles: [{ x: -8, y: 16, sliceX: 0, sliceY: 0, tileWidth: 32, tileHeight: 32 },
            { x: -8, y: 0, sliceX: 0, sliceY: 32, tileWidth: 32, tileHeight: 16 }] }] }]
    }, { roomName: "campo", spriteSheet: "hero.png", animationName: "idle" })?.frame;
    expect(frame).toMatchObject({ originX: 16, originY: 40 });
  });

  it("resolves BG2 room tileset with normalized tilemap and source asset", () => {
    const tileset = resolveGbaRoomTileset({
      assets: [{ id: "asset-bg", name: "overworld.png", kind: "Tileset", metadata: { source: "Assets/tiles/overworld.png", tileWidth: 16, tileHeight: 16 } }]
    }, {
      id: "room-1",
      name: "room_1",
      width: 3,
      height: 2,
      backgroundAssetName: "overworld.png",
      tilemap: [1, 2, "bad", 4]
    });

    expect(tileset).toMatchObject({
      layer: gbaRenderLayers.bg2,
      assetName: "overworld.png",
      source: "Assets/tiles/overworld.png",
      tileWidth: 16,
      tileHeight: 16,
      tileCells: [1, 2, 0, 4, 0, 0]
    });
  });

  it("keeps unresolved sprite references visible as diagnostics", () => {
    const sprite = resolveGbaActorSprite({
      assets: [],
      animations: []
    }, { name: "Player", spriteSheet: "missing.png", animationName: "idle" });

    expect(sprite).toMatchObject({
      layer: gbaRenderLayers.obj,
      spriteSheet: "missing.png",
      source: null,
      frame: null
    });
    expect(sprite?.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "Sprite asset nao encontrado: missing.png.",
      "Animacao nao encontrada para Player: idle."
    ]);
  });

  it("propagates metasprite origin into actor sprite frames", () => {
    const frame = resolveGbaActorSprite({
      assets: [{ id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } }],
      animations: [{
        id: "anim-idle",
        name: "idle",
        spriteSheet: "hero.png",
        frameWidth: 16,
        frameHeight: 32,
        originX: 8,
        originY: 24,
        frames: [{
          frameIndex: 0,
          width: 16,
          height: 32,
          originX: 8,
          originY: 28,
          tiles: [{ sourceSheet: "hero.png", sliceX: 0, sliceY: 0, tileWidth: 16, tileHeight: 32 }]
        }]
      }]
    }, { spriteSheet: "hero.png", animationName: "idle" })?.frame;

    expect(frame).toMatchObject({
      frameWidth: 16,
      frameHeight: 32,
      originX: 8,
      originY: 28
    });
  });

  it("preserva a origem assinada do canvas na âncora da cena", () => {
    const project = {
      assets: [{ id: "asset-farm", name: "farm.png", kind: "Sprite", metadata: { source: "Assets/farm.png" } }],
      animations: [{
        id: "farm-idle",
        name: "idle_down",
        spriteSheet: "farm.png",
        frameWidth: 48,
        frameHeight: 48,
        originX: -16,
        originY: 0,
        frames: [{
          width: 48,
          height: 48,
          originX: -16,
          originY: 0,
          tiles: []
        }]
      }]
    };

    const frame = resolveGbaActorSprite(project, { spriteSheet: "farm.png", animationName: "idle_down" })?.frame;
    expect(frame).toMatchObject({
      frameWidth: 48,
      frameHeight: 48,
      originX: -16,
      originY: 0
    });
    expect(gbaActorSpriteRoomPlacementFromFrame(5, 5, frame!)).toEqual({
      leftTiles: 7,
      topTiles: 5,
      widthTiles: 6,
      heightTiles: 6
    });
  });

  it("anchors actor sprites at the GB Studio 8px tile origin", () => {
    const placement = gbaActorSpriteRoomPlacement(10, 5, 16, 16, 8, 8);

    expect(placement).toEqual({
      leftTiles: 9,
      topTiles: 4,
      widthTiles: 2,
      heightTiles: 2
    });

    expect(gbaActorSpriteRoomPlacementPercent(30, 20, placement)).toEqual({
      left: `${(9 / 30) * 100}%`,
      top: `${(4 / 20) * 100}%`,
      width: `${(2 / 30) * 100}%`,
      height: `${(2 / 20) * 100}%`
    });
  });

  it("preserva âncoras efetivas negativas quando o frame ultrapassa o canvas", () => {
    expect(gbaActorSpriteRoomPlacement(10, 5, 16, 16, -8, -8)).toEqual({
      leftTiles: 11,
      topTiles: 6,
      widthTiles: 2,
      heightTiles: 2
    });
  });

  it("shifts tall sprites upward so origin stays on the tile feet", () => {
    expect(gbaActorSpriteRoomPlacement(4, 6, 16, 32, 8, 24)).toEqual({
      leftTiles: 3,
      topTiles: 3,
      widthTiles: 2,
      heightTiles: 4
    });
  });

  it("mantem a caixa de colisao nos pes para origens inferiores de sprites 16x16 e 16x32", () => {
    expect(gbaActorSpriteRoomPlacement(14, 4, 16, 16, 8, 16)).toEqual({
      leftTiles: 13,
      topTiles: 2,
      widthTiles: 2,
      heightTiles: 2
    });
    expect(gbaActorSpriteRoomPlacement(9, 7, 16, 32, 8, 32)).toEqual({
      leftTiles: 8,
      topTiles: 3,
      widthTiles: 2,
      heightTiles: 4
    });
  });

  it("converts topdown tile coordinates to engine pixels", () => {
    expect(gbaTopdownTileToPixels(15)).toBe(120);
    expect(gbaTopdownTilePointToPixels({ x: 5, y: 7 })).toEqual({ x: 40, y: 56 });
    expect(gbaTopdownAreaToPixels({ x: 10, y: 6, width: 2, height: 2 })).toEqual({
      x: 80,
      y: 48,
      width: 16,
      height: 16
    });
  });

  it("selects animation frames by runtime index", () => {
    const project = {
      assets: [{ id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } }],
      animations: [{
        id: "anim-walk",
        name: "walk",
        spriteSheet: "hero.png",
        frameWidth: 16,
        frameHeight: 16,
        fps: 8,
        frames: [
          {
            frameIndex: 0,
            width: 16,
            height: 16,
            tiles: [{ sourceSheet: "hero.png", sliceX: 0, sliceY: 0, tileWidth: 16, tileHeight: 16 }]
          },
          {
            frameIndex: 1,
            width: 16,
            height: 16,
            tiles: [{ sourceSheet: "hero.png", sliceX: 32, sliceY: 0, tileWidth: 16, tileHeight: 16 }]
          }
        ]
      }]
    };

    expect(resolveGbaActorSpriteFrame(project, { spriteSheet: "hero.png", animationName: "walk" }, 0)?.frame?.sourceX).toBe(0);
    expect(resolveGbaActorSpriteFrame(project, { spriteSheet: "hero.png", animationName: "walk" }, 1)?.frame?.sourceX).toBe(32);
    expect(resolveGbaActorSprite(project, { spriteSheet: "hero.png", animationName: "walk" })?.frame?.sourceX).toBe(0);
  });

  it("resolves all GBA background layers from room tileLayers", () => {
    const project = {
      assets: [{ id: "asset-bg", name: "tiles.png", kind: "Tileset", metadata: { source: "Assets/tiles.png", tileWidth: 16, tileHeight: 16 } }],
      settings: { backgrounds: { graphicsMode: "Mode 0 - Tilemaps" } }
    };
    const room = {
      width: 2,
      height: 2,
      backgroundAssetName: "tiles.png",
      tileLayers: [
        { mapping: "BG3", tilemap: [3, -1, -1, -1], tileSourceAssetNames: ["tiles.png", "", "", ""] },
        { mapping: "BG2", tilemap: [1, 2, -1, -1], tileSourceAssetNames: ["tiles.png", "tiles.png", "", ""] },
        { mapping: "BG1", tilemap: [-1, -1, -1, -1], tileSourceAssetNames: ["", "", "", ""] },
        { mapping: "BG0", tilemap: [-1, -1, 4, -1], tileSourceAssetNames: ["", "", "tiles.png", ""] }
      ]
    };

    const layers = resolveGbaRoomBackgroundLayers(project, room, 0);
    expect(layers.BG3.tileCells).toEqual([3, 0, 0, 0]);
    expect(layers.BG2.tileCells).toEqual([1, 2, 0, 0]);
    expect(layers.BG0.tileCells).toEqual([0, 0, 4, 0]);

    const renderLayers = resolveGbaRoomRenderLayers(project, room, 2);
    expect(renderLayers.videoMode).toBe(0);
    expect(renderLayers.obj.activeSpriteCount).toBe(2);
    expect(renderLayers.obj.maxSprites).toBe(128);
  });

  it("keeps tile zero as authored content instead of hiding the editor layer", () => {
    const project = {
      assets: [
        { id: "sky", name: "sky.png", kind: "Background", metadata: { source: "Assets/sky.png" } },
        { id: "terrain", name: "terrain.png", kind: "Background", metadata: { source: "Assets/terrain.png" } }
      ],
      settings: { backgrounds: { graphicsMode: "Mode 0 - Tilemaps" } }
    };
    const room = {
      width: 2,
      height: 2,
      backgroundAssetName: "terrain.png",
      tileLayers: [
        { mapping: "BG3", tilemap: [0, 0, 0, 0], tileSourceAssetNames: ["sky.png", "sky.png", "sky.png", "sky.png"] },
        { mapping: "BG2", tilemap: [0, 0, 0, 0], tileSourceAssetNames: ["terrain.png", "terrain.png", "terrain.png", "terrain.png"] },
        { mapping: "BG1", tilemap: [-1, -1, -1, -1], tileSourceAssetNames: [] },
        { mapping: "BG0", tilemap: [-1, -1, -1, -1], tileSourceAssetNames: [] }
      ]
    };

    const layers = resolveGbaRoomBackgroundLayers(project, room, 0);
    expect(layers.BG3).toMatchObject({
      assetName: "sky.png",
      paintedTileCount: 4,
      source: "Assets/sky.png"
    });
    expect(layers.BG2).toMatchObject({
      assetName: "terrain.png",
      paintedTileCount: 4,
      source: "Assets/terrain.png"
    });
    expect(layers.BG1.paintedTileCount).toBe(0);
    expect(activeGbaBackgroundLayers(resolveGbaRoomRenderLayers(project, room))).toEqual([
      expect.objectContaining({ layer: "BG3", assetName: "sky.png" }),
      expect.objectContaining({ layer: "BG2", assetName: "terrain.png" })
    ]);
  });
});
