import { describe, expect, it } from "vitest";
import { analyzeSpriteVram } from "./spriteVramAnalysis.js";
import type { SpritesWorkspaceAnimation } from "./spritesWorkspace/core.js";
import {
  createSpriteAnimationInProject,
  adjustMetaspriteTileSize,
  bindSpriteFrameEventInProject,
  canvasPointToMetaspriteTilePosition,
  canvasPointToSpriteSheetTileSlice,
  copySpriteAnimationGeometryToSheetSiblingsInProject,
  deriveSpriteAnimationLibraryGroups,
  deriveSpriteFrameEventBinding,
  deriveSpriteFramePreviewRegions,
  deriveSpriteAnimatedPreviewFrameIndex,
  deriveDefaultMetaspriteTilePosition,
  deriveSpriteCanvasGeometry,
  deriveSpriteHitboxBounds,
  deriveSpriteOriginMarkerPosition,
  SPRITE_ORIGIN_MAX,
  SPRITE_ORIGIN_MIN,
  deriveSpriteMetaspriteCanvasAction,
  deriveSpriteMetaspriteTileKeyboardAction,
  deriveSpriteMetaspriteTileResizeAction,
  deriveSpritePaintBrush,
  deriveMetaspriteCanvasSize,
  deriveSpriteCanvasFitScale,
  deriveSpritePaintTilePanelMetrics,
  deriveSpriteStateDirectionOptions,
  deriveSpriteStateDirectionPreviewRegion,
  deriveSpriteStateDirectionPreviewRegions,
  deriveSpriteSheetFrameGridRegions,
  deriveSpritesWorkspacePresentation,
  deriveSpritesWorkspaceFilterChips,
  deriveSpritesWorkspaceSummaryCards,
  deriveSpritesWorkspaceValidationIssues,
  duplicateSpriteAnimationInProject,
  findMetaspriteTileAtCanvasPoint,
  filterSpritesWorkspaceSheets,
  listSpritePaletteReferencesForSheet,
  resolveSpritePaletteSource,
  spriteSheetMatchesRailQuery,
  stepSpritePlaybackFrameIndex,
  generateSpriteFromReferenceInProject,
  removeSpriteAnimationFromProject,
  resolveActiveSpriteAnimation,
  resolveSpriteWorkspaceCanvasFrame,
  fitSpriteAnimationHitboxToVisibleTilesInProject,
  moveSpriteMetaspriteTilesInProject,
  reorderSpriteMetaspriteTilesInProject,
  prepareSpritePaintTileFromPointer,
  renameSpriteAnimationInProject,
  removeSpriteMetaspriteTileInProject,
  addSpriteMetaspriteTileInProject,
  removeSpriteMetaspriteTilesInProject,
  toggleSpriteMetaspriteTilesFlipInProject,
  updateSpriteMetaspriteTileInProject,
  updateSpriteMetaspriteFrameInProject,
  updateSpriteAnimationFieldsInProject,
  updateSpriteAnimationStateInProject
} from "./spritesWorkspace.js";

function testAnimation(partial: Omit<SpritesWorkspaceAnimation, "vramAnalysis">): SpritesWorkspaceAnimation {
  return {
    ...partial,
    vramAnalysis: analyzeSpriteVram({
      name: partial.name,
      spriteSheet: partial.spriteSheet,
      frameWidth: partial.frameWidth,
      frameHeight: partial.frameHeight,
      frameCount: partial.frameCount,
      colorMode: partial.colorMode
    })
  };
}

describe("Sprites workspace presentation", () => {
  it("defines the shared signed range used by the sprite origin controls", () => {
    expect(SPRITE_ORIGIN_MIN).toBe(-96);
    expect(SPRITE_ORIGIN_MAX).toBe(96);
  });

  it("positions the stored origin offset from the GB Studio canvas base", () => {
    expect(deriveSpriteOriginMarkerPosition({
      frameHeight: 32,
      frameWidth: 32,
      originX: 0,
      originY: 0
    })).toEqual({ left: "25%", top: "75%" });

    expect(deriveSpriteOriginMarkerPosition({
      frameHeight: 16,
      frameWidth: 16,
      originX: 0,
      originY: 0
    })).toEqual({ left: "0%", top: "50%" });

    expect(deriveSpriteOriginMarkerPosition({
      frameHeight: 16,
      frameWidth: 16,
      originX: 8,
      originY: -8
    })).toEqual({ left: "50%", top: "0%" });
  });

  it("positions collision bounds with the same GB Studio canvas origin as the sprite", () => {
    expect(deriveSpriteHitboxBounds({
      frameHeight: 16,
      frameWidth: 16,
      hitboxHeight: 16,
      hitboxWidth: 16,
      hitboxX: 0,
      hitboxY: -8,
      originX: 0,
      originY: 0
    })).toEqual({ height: 16, left: 0, top: 0, width: 16 });

    expect(deriveSpriteHitboxBounds({
      frameHeight: 32,
      frameWidth: 32,
      hitboxHeight: 24,
      hitboxWidth: 16,
      hitboxX: 0,
      hitboxY: -16,
      originX: 0,
      originY: 0
    })).toEqual({ height: 24, left: 8, top: 8, width: 16 });
  });

  it("derives explicit sprite frame preview regions from image and animation dimensions", () => {
    expect(deriveSpriteFramePreviewRegions({
      frameCount: 5,
      frameHeight: 16,
      frameWidth: 16,
      imageHeight: 32,
      imageWidth: 48
    })).toEqual([
      { frameIndex: 0, x: 0, y: 0, width: 16, height: 16 },
      { frameIndex: 1, x: 16, y: 0, width: 16, height: 16 },
      { frameIndex: 2, x: 32, y: 0, width: 16, height: 16 },
      { frameIndex: 3, x: 0, y: 16, width: 16, height: 16 },
      { frameIndex: 4, x: 16, y: 16, width: 16, height: 16 }
    ]);

    expect(deriveSpriteFramePreviewRegions({
      frameCount: 10,
      frameHeight: 16,
      frameWidth: 16,
      imageHeight: 32,
      imageWidth: 48,
      maxPreviewFrames: 4
    })).toHaveLength(4);
  });

  it("derives the full clickable sprite sheet frame grid from image and frame dimensions", () => {
    expect(deriveSpriteSheetFrameGridRegions({
      frameHeight: 16,
      frameWidth: 16,
      imageHeight: 32,
      imageWidth: 48
    })).toEqual([
      { frameIndex: 0, x: 0, y: 0, width: 16, height: 16 },
      { frameIndex: 1, x: 16, y: 0, width: 16, height: 16 },
      { frameIndex: 2, x: 32, y: 0, width: 16, height: 16 },
      { frameIndex: 3, x: 0, y: 16, width: 16, height: 16 },
      { frameIndex: 4, x: 16, y: 16, width: 16, height: 16 },
      { frameIndex: 5, x: 32, y: 16, width: 16, height: 16 }
    ]);

    expect(deriveSpriteSheetFrameGridRegions({
      frameHeight: 16,
      frameWidth: 16,
      imageHeight: 32,
      imageWidth: 48,
      maxPreviewFrames: 4
    })).toHaveLength(4);
  });

  it("derives paint tile panel metrics from image dimensions and active brush", () => {
    expect(deriveSpritePaintTilePanelMetrics({
      imageHeight: 256,
      imageWidth: 384,
      sliceX: 8,
      sliceY: 8,
      tileHeight: 16,
      tileWidth: 16
    })).toEqual({
      brushColumns: 2,
      brushLabel: "Brush 2x2 - 8,8 - 4 tile(s)",
      brushRows: 2,
      brushTileCount: 4,
      sliceLabel: "8,8",
      tileColumns: 48,
      tileCount: 1536,
      tileRows: 32
    });

    expect(deriveSpritePaintTilePanelMetrics({
      imageHeight: 16,
      imageWidth: 16,
      tileHeight: 8,
      tileWidth: 8
    }).brushLabel).toBe("Brush 1x1 - 0,0 - 1 tile(s)");
  });

  it("derives the first visual frame region for state and direction previews", () => {
    const preview = {
      animationID: "anim-idle",
      animationName: "idle_down",
      direction: "down",
      fps: 8,
      frameCount: 3,
      frameHeight: 32,
      frameSize: "16 x 32",
      frameWidth: 16,
      loops: true,
      pingPong: false,
      state: "idle"
    };

    expect(deriveSpriteStateDirectionPreviewRegion({
      imageHeight: 64,
      imageWidth: 48,
      preview
    })).toEqual({ frameIndex: 0, x: 0, y: 0, width: 16, height: 32 });

    expect(deriveSpriteStateDirectionPreviewRegion({
      imageHeight: 8,
      imageWidth: 8,
      preview
    })).toBeNull();
  });

  it("derives a bounded visual frame strip for state and direction previews", () => {
    const preview = {
      animationID: "anim-walk",
      animationName: "walk_down",
      direction: "down",
      fps: 10,
      frameCount: 5,
      frameHeight: 16,
      frameSize: "16 x 16",
      frameWidth: 16,
      loops: true,
      pingPong: false,
      state: "walk"
    };

    expect(deriveSpriteStateDirectionPreviewRegions({
      imageHeight: 32,
      imageWidth: 48,
      maxPreviewFrames: 4,
      preview
    })).toEqual([
      { frameIndex: 0, x: 0, y: 0, width: 16, height: 16 },
      { frameIndex: 1, x: 16, y: 0, width: 16, height: 16 },
      { frameIndex: 2, x: 32, y: 0, width: 16, height: 16 },
      { frameIndex: 3, x: 0, y: 16, width: 16, height: 16 }
    ]);
  });

  it("derives animated preview frame indexes from fps and ping-pong settings", () => {
    const preview = {
      animationID: "anim-walk",
      animationName: "walk_down",
      direction: "down",
      fps: 10,
      frameCount: 4,
      frameHeight: 16,
      frameSize: "16 x 16",
      frameWidth: 16,
      loops: true,
      pingPong: false,
      state: "walk"
    };

    expect(deriveSpriteAnimatedPreviewFrameIndex({ elapsedMs: 0, preview })).toBe(0);
    expect(deriveSpriteAnimatedPreviewFrameIndex({ elapsedMs: 250, preview })).toBe(2);
    expect(deriveSpriteAnimatedPreviewFrameIndex({ elapsedMs: 450, preview })).toBe(0);
    expect(deriveSpriteAnimatedPreviewFrameIndex({
      elapsedMs: 250,
      preview: { ...preview, pingPong: true }
    })).toBe(2);
    expect(deriveSpriteAnimatedPreviewFrameIndex({
      elapsedMs: 450,
      preview: { ...preview, pingPong: true }
    })).toBe(2);
    expect(deriveSpriteAnimatedPreviewFrameIndex({
      elapsedMs: 9999,
      preview: { ...preview, fps: 0, frameCount: 0 }
    })).toBe(0);
  });

  it("steps sprite playback frame index with loop and ping-pong", () => {
    expect(stepSpritePlaybackFrameIndex({
      currentIndex: 0,
      direction: 1,
      frameCount: 4,
      loops: true,
      pingPong: false
    })).toEqual({ direction: 1, frameIndex: 1, shouldStop: false });

    expect(stepSpritePlaybackFrameIndex({
      currentIndex: 3,
      direction: 1,
      frameCount: 4,
      loops: false,
      pingPong: false
    })).toEqual({ direction: 1, frameIndex: 3, shouldStop: true });

    expect(stepSpritePlaybackFrameIndex({
      currentIndex: 3,
      direction: 1,
      frameCount: 4,
      loops: true,
      pingPong: true
    })).toEqual({ direction: -1, frameIndex: 2, shouldStop: false });

    expect(stepSpritePlaybackFrameIndex({
      currentIndex: 0,
      direction: -1,
      frameCount: 4,
      loops: true,
      pingPong: true
    })).toEqual({ direction: 1, frameIndex: 1, shouldStop: false });
  });

  it("resolves sprite palette sources for sheet and reference images", () => {
    const presentation = deriveSpritesWorkspacePresentation({
      assets: [
        { id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } }
      ],
      animations: [
        { id: "anim-hero-idle", name: "hero_idle_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16 }
      ],
      spriteReferenceImages: [
        {
          id: "ref-hero",
          title: "Hero turnaround",
          assetName: "hero_reference.png",
          generatedSpriteAssetName: "hero.png"
        }
      ]
    });
    const sheet = presentation.spriteSheets[0];

    expect(listSpritePaletteReferencesForSheet(presentation, "hero.png")).toHaveLength(1);
    expect(resolveSpritePaletteSource({ kind: "sheet", presentation, sheet })).toMatchObject({
      kind: "sheet",
      label: "hero.png",
      source: "Assets/sprites/hero.png",
      available: true
    });
    expect(resolveSpritePaletteSource({ kind: "reference", presentation, sheet })).toMatchObject({
      kind: "reference",
      label: "Hero turnaround",
      source: "References/hero_reference.png",
      referenceId: "ref-hero",
      available: true
    });
  });

  it("matches rail search only by sprite sheet name and source", () => {
    const sheet = {
      animationCount: 1,
      bundledDefaultAsset: null,
      colorModes: ["4bpp"],
      hasAsset: true,
      id: "sheet-hero",
      maxFrameSize: "16 x 16",
      name: "hero.png",
      referenceImageCount: 0,
      source: "Assets/sprites/hero.png",
      stateCount: 1,
      systemImage: "person.crop.square",
      totalFrames: 1
    };

    expect(spriteSheetMatchesRailQuery(sheet, "hero.png")).toBe(true);
    expect(spriteSheetMatchesRailQuery(sheet, "Assets/sprites")).toBe(true);
    expect(spriteSheetMatchesRailQuery(sheet, "turnaround")).toBe(false);
  });

  it("prefers -16 without placing new tiles outside their canvas", () => {
    const frame = {
      frameIndex: 0,
      height: 16,
      lastTile: null,
      originX: 0,
      originY: 0,
      tileCount: 0,
      tiles: [],
      width: 16
    };

    expect(deriveDefaultMetaspriteTilePosition(frame, 8, 8)).toEqual({ x: 0, y: 4 });
    expect(deriveDefaultMetaspriteTilePosition(frame, 16, 16)).toEqual({ x: 0, y: 0 });
    expect(deriveDefaultMetaspriteTilePosition({ ...frame, originX: -8, originY: -8 }, 8, 8)).toEqual({ x: 0, y: 4 });
    expect(deriveDefaultMetaspriteTilePosition({ ...frame, width: 64, height: 64 }, 64, 64)).toEqual({ x: -24, y: 0 });
    expect(deriveDefaultMetaspriteTilePosition({ ...frame, width: 64, height: 64 }, 32, 32)).toEqual({ x: -16, y: 16 });
  });

  it("prefers explicit brush state when painting without inheriting selected tile slice", () => {
    const animation = {
      colorMode: "4bpp",
      direction: "down",
      frameCount: 1,
      frameHeight: 16,
      frameSize: "16 x 16",
      frameWidth: 16,
      fps: 8,
      id: "anim-hero",
      loopMode: "repeat",
      loops: true,
      metaspriteFrames: [],
      name: "hero_idle",
      pingPong: false,
      spriteSheet: "hero.png",
      state: "idle",
      vramAnalysis: analyzeSpriteVram({
        colorMode: "4bpp",
        frameCount: 1,
        frameHeight: 16,
        frameWidth: 16,
        name: "hero_idle",
        spriteSheet: "hero.png"
      })
    } as unknown as SpritesWorkspaceAnimation;
    const frame = animation.metaspriteFrames[0] ?? {
      frameIndex: 0,
      height: 16,
      originX: 8,
      originY: 8,
      tileCount: 1,
      tiles: [{
        flipX: false,
        flipY: false,
        objPalette: "OBP0",
        paletteIndex: 0,
        priority: false,
        sliceX: 32,
        sliceY: 16,
        sourceSheet: "hero.png",
        tileHeight: 16,
        tileIndex: 0,
        tileWidth: 16,
        x: 0,
        y: 0
      }],
      width: 16
    };

    const brush = deriveSpritePaintBrush({
      animation,
      brushState: { sliceX: 8, sliceY: 8, tileHeight: 16, tileWidth: 16 },
      frame,
      preferBrushState: true,
      selectedTile: frame.tiles[0]
    });

    expect(brush.sliceX).toBe(8);
    expect(brush.sliceY).toBe(8);
    expect(brush.tileIndex).toBe(-1);
  });

  it("derives sprite canvas fit scale from container bounds", () => {
    expect(deriveSpriteCanvasFitScale({
      containerHeight: 220,
      containerWidth: 320,
      frameHeight: 16,
      frameWidth: 16
    })).toBe(12);

    expect(deriveSpriteCanvasFitScale({
      containerHeight: 120,
      containerWidth: 160,
      frameHeight: 32,
      frameWidth: 32
    })).toBe(3);

    expect(deriveSpriteCanvasFitScale({
      containerHeight: 80,
      containerWidth: 80,
      frameHeight: 64,
      frameWidth: 64,
      minScale: 2
    })).toBe(2);

    expect(deriveSpriteCanvasFitScale({
      containerHeight: 140,
      containerWidth: 180,
      frameHeight: 16,
      frameWidth: 16
    })).toBe(7);
  });

  it("caps metasprite canvas rendering to the available container", () => {
    expect(deriveMetaspriteCanvasSize({
      frameHeight: 16,
      frameWidth: 16,
      maxHeight: 120,
      maxWidth: 120,
      preferredScale: 8
    })).toEqual({
      height: 112,
      scale: 7,
      width: 112
    });
  });

  it("derives bounded metasprite canvas sizes for compact paint layouts", () => {
    expect(deriveMetaspriteCanvasSize({
      frameHeight: 32,
      frameWidth: 16
    })).toEqual({
      height: 320,
      scale: 10,
      width: 160
    });

    expect(deriveMetaspriteCanvasSize({
      frameHeight: 32,
      frameWidth: 32
    })).toEqual({
      height: 256,
      scale: 8,
      width: 256
    });

    expect(deriveMetaspriteCanvasSize({
      frameHeight: 160,
      frameWidth: 240
    })).toEqual({
      height: 160,
      scale: 1,
      width: 240
    });
  });

  it("derives the active-sheet animation library used by the sprites rail", () => {
    const groups = deriveSpriteAnimationLibraryGroups([
      testAnimation({
        colorMode: "4bpp",
        direction: "down",
        fps: 6,
        frameCount: 1,
        frameHeight: 16,
        frameSize: "16 x 16",
        frameWidth: 16,
        frameEvents: [[]],
        geometry: { frameWidth: 16, frameHeight: 16, originX: 8, originY: 8, hitboxX: 0, hitboxY: 0, hitboxWidth: 16, hitboxHeight: 16 },
        id: "idle-down",
        loopMode: "Loop",
        loops: true,
        metaspriteFrames: [],
        name: "Inativo Baixo",
        pingPong: false,
        spriteSheet: "slime.png",
        state: "idle"
      }),
      testAnimation({
        colorMode: "4bpp",
        direction: "right",
        fps: 6,
        frameCount: 2,
        frameHeight: 16,
        frameSize: "16 x 16",
        frameWidth: 16,
        frameEvents: [[], []],
        geometry: { frameWidth: 16, frameHeight: 16, originX: 8, originY: 8, hitboxX: 0, hitboxY: 0, hitboxWidth: 16, hitboxHeight: 16 },
        id: "walk-right",
        loopMode: "Loop",
        loops: true,
        metaspriteFrames: [],
        name: "Movendo Direita",
        pingPong: false,
        spriteSheet: "slime.png",
        state: "walk"
      })
    ], "walk-right");

    expect(groups).toEqual([{
      count: 2,
      id: "default",
      label: "Padrao",
      rows: [
        {
          direction: "down",
          fps: 6,
          frameCount: 1,
          frameSize: "16 x 16",
          id: "idle-down",
          isActive: false,
          loopMode: "Loop",
          name: "Inativo Baixo",
          state: "idle"
        },
        {
          direction: "right",
          fps: 6,
          frameCount: 2,
          frameSize: "16 x 16",
          id: "walk-right",
          isActive: true,
          loopMode: "Loop",
          name: "Movendo Direita",
          state: "walk"
        }
      ]
    }]);
  });

  it("converts canvas clicks using the GB Studio base origin and vertical inversion", () => {
    expect(canvasPointToMetaspriteTilePosition({
      canvasHeight: 160,
      canvasWidth: 160,
      frameHeight: 32,
      frameWidth: 32,
      originX: 0,
      originY: 0,
      pointX: 40,
      pointY: 0,
      tileHeight: 8,
      tileWidth: 8
    })).toEqual({ x: 0, y: 24 });

    expect(canvasPointToMetaspriteTilePosition({
      canvasHeight: 160,
      canvasWidth: 160,
      frameHeight: 32,
      frameWidth: 32,
      originX: -8,
      originY: -8,
      pointX: 40,
      pointY: 0,
      tileHeight: 8,
      tileWidth: 8
    })).toEqual({ x: 0, y: 24 });

    expect(canvasPointToMetaspriteTilePosition({
      canvasHeight: 160,
      canvasWidth: 160,
      frameHeight: 32,
      frameWidth: 32,
      originX: 0,
      originY: 0,
      pointX: 500,
      pointY: -20,
      tileHeight: 8,
      tileWidth: 8
    })).toEqual({ x: 16, y: 24 });
  });

  it("converts sprite sheet clicks into aligned tile slices with image bounds", () => {
    expect(canvasPointToSpriteSheetTileSlice({
      canvasHeight: 320,
      canvasWidth: 480,
      imageHeight: 32,
      imageWidth: 48,
      pointX: 170,
      pointY: 95,
      tileHeight: 8,
      tileWidth: 8
    })).toEqual({ sliceX: 16, sliceY: 8 });

    expect(canvasPointToSpriteSheetTileSlice({
      canvasHeight: 320,
      canvasWidth: 480,
      imageHeight: 32,
      imageWidth: 48,
      pointX: 999,
      pointY: 999,
      tileHeight: 8,
      tileWidth: 8
    })).toEqual({ sliceX: 40, sliceY: 24 });
  });

  it("adjusts visual metasprite tile size in 8px steps within the frame", () => {
    expect(adjustMetaspriteTileSize({
      deltaHeight: 8,
      deltaWidth: 8,
      frameHeight: 24,
      frameWidth: 16,
      tileHeight: 8,
      tileWidth: 8
    })).toEqual({ tileHeight: 16, tileWidth: 16 });

    expect(adjustMetaspriteTileSize({
      deltaHeight: -8,
      deltaWidth: 8,
      frameHeight: 16,
      frameWidth: 16,
      tileHeight: 8,
      tileWidth: 16
    })).toEqual({ tileHeight: 8, tileWidth: 16 });
  });

  it("prepares paint-mode tile insertion from a metasprite canvas click and active brush", () => {
    expect(prepareSpritePaintTileFromPointer({
      canvasHeight: 160,
      canvasWidth: 160,
      frameHeight: 32,
      frameIndex: 1,
      frameWidth: 32,
      originX: 0,
      originY: 0,
      pointX: 120,
      pointY: 40,
      sliceX: 24,
      sliceY: 8,
      sourceSheet: "slime.png",
      tileHeight: 16,
      tileWidth: 16
    })).toEqual({
      frameIndex: 1,
      sourceSheet: "slime.png",
      sliceX: 24,
      sliceY: 8,
      tileHeight: 16,
      tileWidth: 16,
      x: 8,
      y: 8
    });
  });

  it("derives a paint brush for empty metasprite frames before the first tile exists", () => {
    const animation = testAnimation({
      colorMode: "4bpp",
      direction: "down",
      fps: 6,
      frameCount: 1,
      frameHeight: 16,
      frameSize: "16 x 16",
      frameWidth: 16,
      frameEvents: [[]],
      geometry: { frameWidth: 16, frameHeight: 16, originX: 8, originY: 8, hitboxX: 0, hitboxY: 0, hitboxWidth: 16, hitboxHeight: 16 },
      id: "idle-down",
      loopMode: "Loop",
      loops: true,
      metaspriteFrames: [],
      name: "Inativo Baixo",
      pingPong: false,
      spriteSheet: "slime.png",
      state: "idle"
    });
    const frame = {
      frameIndex: 0,
      height: 16,
      lastTile: null,
      originX: 8,
      originY: 8,
      tileCount: 0,
      tiles: [],
      width: 16
    };

    expect(deriveSpritePaintBrush({
      animation,
      brushState: { sliceX: 32, sliceY: 16 },
      frame,
      selectedTile: null
    })).toEqual({
      flipX: false,
      flipY: false,
      objPalette: "OBP0",
      paletteIndex: 0,
      priority: false,
      sliceX: 32,
      sliceY: 16,
      sourceSheet: "slime.png",
      tileHeight: 16,
      tileIndex: -1,
      tileWidth: 16,
      x: 0,
      y: 0
    });
  });

  it("finds the topmost metasprite tile under a canvas point for erase mode", () => {
    const tiles = [
      { tileIndex: 0, x: -8, y: 16, sliceX: 0, sliceY: 0, sourceSheet: "hero.png", tileWidth: 16, tileHeight: 16, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false },
      { tileIndex: 1, x: 0, y: 0, sliceX: 16, sliceY: 0, sourceSheet: "hero.png", tileWidth: 16, tileHeight: 16, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false }
    ];

    expect(findMetaspriteTileAtCanvasPoint({
      canvasHeight: 160,
      canvasWidth: 160,
      frameHeight: 32,
      frameWidth: 32,
      originX: 0,
      originY: 0,
      pointX: 82,
      pointY: 120,
      tiles
    })).toBe(1);
    expect(findMetaspriteTileAtCanvasPoint({
      canvasHeight: 160,
      canvasWidth: 160,
      frameHeight: 32,
      frameWidth: 32,
      originX: -8,
      originY: -8,
      pointX: 82,
      pointY: 120,
      tiles
    })).toBe(1);
    expect(findMetaspriteTileAtCanvasPoint({
      canvasHeight: 160,
      canvasWidth: 160,
      frameHeight: 32,
      frameWidth: 32,
      originX: 0,
      originY: 0,
      pointX: 158,
      pointY: 4,
      tiles
    })).toBeNull();
  });

  it("derives mini editor metasprite canvas actions for paint, erase, move and resize", () => {
    const frame = {
      frameIndex: 1,
      height: 32,
      lastTile: null,
      originX: 0,
      originY: 0,
      tileCount: 2,
      tiles: [
        { tileIndex: 0, x: -8, y: 16, sliceX: 0, sliceY: 0, sourceSheet: "hero.png", tileWidth: 16, tileHeight: 16, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false },
        { tileIndex: 1, x: 0, y: 0, sliceX: 16, sliceY: 0, sourceSheet: "hero.png", tileWidth: 16, tileHeight: 16, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false }
      ],
      width: 32
    };
    const selectedTile = frame.tiles[1];

    expect(deriveSpriteMetaspriteCanvasAction({
      animationID: "anim-idle",
      canvasHeight: 160,
      canvasWidth: 160,
      frame,
      frameIndex: 1,
      mode: "paint",
      pointX: 120,
      pointY: 40,
      selectedTile
    })).toEqual({
      animationID: "anim-idle",
      options: {
        frameIndex: 1,
        sourceSheet: "hero.png",
        sliceX: 16,
        sliceY: 0,
        tileHeight: 16,
        tileWidth: 16,
        x: 8,
        y: 8
      },
      type: "add_tile"
    });

    expect(deriveSpriteMetaspriteCanvasAction({
      animationID: "anim-idle",
      canvasHeight: 160,
      canvasWidth: 160,
      frame,
      frameIndex: 1,
      mode: "erase",
      pointX: 82,
      pointY: 120,
      selectedTile
    })).toEqual({
      animationID: "anim-idle",
      options: {
        frameIndex: 1,
        tileIndex: 1
      },
      type: "remove_tile"
    });

    expect(deriveSpriteMetaspriteCanvasAction({
      animationID: "anim-idle",
      canvasHeight: 160,
      canvasWidth: 160,
      frame,
      frameIndex: 1,
      mode: "select",
      pointX: 80,
      pointY: 0,
      selectedTile
    })).toEqual({
      animationID: "anim-idle",
      options: {
        fields: { x: 8, y: 16 },
        frameIndex: 1,
        tileIndex: 1
      },
      type: "update_tile"
    });

    expect(deriveSpriteMetaspriteTileResizeAction({
      animationID: "anim-idle",
      deltaHeight: 8,
      deltaWidth: -8,
      frame,
      frameIndex: 1,
      selectedTile
    })).toEqual({
      animationID: "anim-idle",
      options: {
        fields: { tileHeight: 24, tileWidth: 8 },
        frameIndex: 1,
        tileIndex: 1
      },
      type: "update_tile"
    });

    expect(deriveSpriteMetaspriteCanvasAction({
      animationID: "anim-idle",
      canvasHeight: 160,
      canvasWidth: 160,
      frame,
      frameIndex: 1,
      mode: "erase",
      pointX: 158,
      pointY: 4,
      selectedTile
    })).toBeNull();

    expect(deriveSpriteMetaspriteCanvasAction({
      animationID: "anim-idle",
      canvasHeight: 160,
      canvasWidth: 160,
      frame,
      frameIndex: 1,
      mode: "events",
      pointX: 80,
      pointY: 0,
      selectedTile
    })).toBeNull();
  });

  it("derives mini editor metasprite keyboard actions for nudge and flip", () => {
    const selectedTile = {
      tileIndex: 1,
      x: 4,
      y: 6,
      sliceX: 16,
      sliceY: 0,
      sourceSheet: "hero.png",
      tileWidth: 8,
      tileHeight: 16,
      flipX: false,
      flipY: true,
      objPalette: "OBP0",
      paletteIndex: 0,
      priority: false
    };

    expect(deriveSpriteMetaspriteTileKeyboardAction({
      animationID: "anim-idle",
      frameIndex: 0,
      key: "ArrowUp",
      selectedTile
    })).toEqual({
      animationID: "anim-idle",
      options: {
        fields: { y: 7 },
        frameIndex: 0,
        tileIndex: 1
      },
      type: "update_tile"
    });

    expect(deriveSpriteMetaspriteTileKeyboardAction({
      animationID: "anim-idle",
      frameIndex: 0,
      key: "ArrowLeft",
      selectedTile,
      shiftKey: true
    })).toEqual({
      animationID: "anim-idle",
      options: {
        fields: { x: -4 },
        frameIndex: 0,
        tileIndex: 1
      },
      type: "update_tile"
    });

    expect(deriveSpriteMetaspriteTileKeyboardAction({
      animationID: "anim-idle",
      frameIndex: 0,
      key: "x",
      selectedTile
    })).toEqual({
      animationID: "anim-idle",
      options: {
        fields: { flipX: true },
        frameIndex: 0,
        tileIndex: 1
      },
      type: "update_tile"
    });

    expect(deriveSpriteMetaspriteTileKeyboardAction({
      animationID: "anim-idle",
      frameIndex: 0,
      key: "z",
      selectedTile
    })).toEqual({
      animationID: "anim-idle",
      options: {
        fields: { flipY: false },
        frameIndex: 0,
        tileIndex: 1
      },
      type: "update_tile"
    });

    expect(deriveSpriteMetaspriteTileKeyboardAction({
      animationID: "anim-idle",
      frameIndex: 0,
      key: "Escape",
      selectedTile
    })).toBeNull();
  });

  it("derives visual state and direction options from animations, references and fallbacks", () => {
    const options = deriveSpriteStateDirectionOptions({
      spriteSheet: "hero.png",
      animations: [
        { spriteSheet: "hero.png", state: "idle", direction: "down" },
        { spriteSheet: "hero.png", state: "walk", direction: "right" },
        { spriteSheet: "npc.png", state: "idle", direction: "left" },
        { spriteSheet: "hero.png", state: "idle", direction: "down" }
      ],
      references: [
        { generatedSpriteAssetName: "hero.png", state: "attack", direction: "up" },
        { generatedSpriteAssetName: "npc.png", state: "talk", direction: "down" }
      ]
    });

    expect(options).toEqual({
      states: ["attack", "idle", "walk"],
      directions: ["down", "right", "up"]
    });
    expect(deriveSpriteStateDirectionOptions({ spriteSheet: "empty.png", animations: [], references: [] })).toEqual({
      states: ["idle", "walk"],
      directions: ["down", "left", "right", "up"]
    });
  });

  it("does not infer preview frames when declared dimensions do not fit the image", () => {
    expect(deriveSpriteFramePreviewRegions({
      frameCount: 4,
      frameHeight: 32,
      frameWidth: 32,
      imageHeight: 16,
      imageWidth: 16
    })).toEqual([]);
  });

  it("derives sprite sheets, animations, states and reference image summaries", () => {
    const presentation = deriveSpritesWorkspacePresentation({
      assets: [
        {
          id: "sprite-hero",
          name: "hero.png",
          kind: "Sprite",
          systemImage: "person.crop.square",
          metadata: { source: "Assets/hero.png" }
        },
        { id: "tiles", name: "tiles.png", kind: "Tileset", systemImage: "square.grid.3x3" }
      ],
      animations: [
        {
          id: "anim-idle",
          name: "idle_down",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 32,
          fps: 8,
          loops: true,
          frameCount: 2,
          state: "idle",
          direction: "down",
          colorMode: "4bpp"
        },
        {
          id: "anim-walk",
          name: "walk_down",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 32,
          fps: 10,
          loops: true,
          frameCount: 4,
          state: "walk",
          direction: "down",
          colorMode: "4bpp",
          pingPong: true
        }
      ],
      animationStates: [
        {
          id: "state-idle",
          spriteSheet: "hero.png",
          name: "idle",
          animationType: "four_direction",
          mirrorLeftFromRight: true,
          animationIDs: ["anim-idle"]
        }
      ],
      spriteReferenceImages: [
        {
          id: "ref-hero",
          assetName: "hero_reference.png",
          title: "Hero reference",
          isVisible: true,
          opacity: 0.75,
          order: 1,
          generatedSpriteAssetName: "hero.png",
          frameWidth: 16,
          frameHeight: 32,
          fps: 8,
          state: "idle",
          direction: "down"
        }
      ],
      activeSpriteReferenceImageID: "ref-hero"
    });

    expect(presentation.summary).toEqual({
      spriteSheetCount: 1,
      animationCount: 2,
      animationStateCount: 1,
      referenceImageCount: 1,
      missingSpriteSheetCount: 0,
      totalFrames: 6
    });
    expect(presentation.animationStatesBySheet["hero.png"]).toEqual([
      {
        id: "state-idle",
        name: "idle",
        spriteSheet: "hero.png",
        animationType: "four_direction",
        mirrorLeftFromRight: true,
        animationIDs: ["anim-idle"]
      }
    ]);
    expect(presentation.spriteSheets).toEqual([
      {
        id: "sprite-hero",
        name: "hero.png",
        source: "Assets/hero.png",
        bundledDefaultAsset: null,
        systemImage: "person.crop.square",
        hasAsset: true,
        animationCount: 2,
        stateCount: 1,
        referenceImageCount: 1,
        totalFrames: 6,
        maxFrameSize: "16 x 32",
        colorModes: ["4bpp"]
      }
    ]);
    expect(presentation.animationsBySheet["hero.png"][1]).toMatchObject({
      id: "anim-walk",
      name: "walk_down",
      frameSize: "16 x 32",
      fps: 10,
      frameCount: 4,
      loopMode: "Ping-pong",
      state: "walk",
      direction: "down",
      colorMode: "4bpp"
    });
    expect(presentation.animationsBySheet["hero.png"][1]?.vramAnalysis).toMatchObject({
      animationName: "walk_down",
      spriteSheet: "hero.png",
      tilesWide: 2,
      tilesHigh: 4,
      tilesPerFrame: 8,
      bytesPerTile: 32,
      frameCount: 4,
      uniqueFrameCount: 4,
      totalTileBytes: 1024
    });
    expect(presentation.stateDirectionPreviewsBySheet["hero.png"]).toEqual([
      {
        animationID: "anim-idle",
        animationName: "idle_down",
        direction: "down",
        fps: 8,
        frameCount: 2,
        frameHeight: 32,
        frameSize: "16 x 32",
        frameWidth: 16,
        loops: true,
        pingPong: false,
        state: "idle"
      },
      {
        animationID: "anim-walk",
        animationName: "walk_down",
        direction: "down",
        fps: 10,
        frameCount: 4,
        frameHeight: 32,
        frameSize: "16 x 32",
        frameWidth: 16,
        loops: true,
        pingPong: true,
        state: "walk"
      }
    ]);
    expect(presentation.references[0]).toMatchObject({
      id: "ref-hero",
      title: "Hero reference",
      assetName: "hero_reference.png",
      generatedSpriteAssetName: "hero.png",
      frameSize: "16 x 32",
      fps: 8,
      isVisible: true,
      isActive: true
    });
  });

  it("updates the animation type and left mirroring on a SpriteState contract", () => {
    const project = {
      animationStates: [{
        id: "state-default",
        name: "default",
        spriteSheet: "hero.png",
        animationType: "four_direction",
        mirrorLeftFromRight: false,
        animationIDs: ["idle-down", "idle-right", "idle-up", "idle-left"]
      }]
    };

    const next = updateSpriteAnimationStateInProject(project, "state-default", {
      animationType: "four_direction_movement",
      mirrorLeftFromRight: true
    });

    expect(next.animationStates).toEqual([{
      id: "state-default",
      name: "default",
      spriteSheet: "hero.png",
      animationType: "four_direction_movement",
      mirrorLeftFromRight: true,
      animationIDs: ["idle-down", "idle-right", "idle-up", "idle-left"]
    }]);
    expect(project.animationStates[0].animationType).toBe("four_direction");
  });

  it("exposes bundled default sprite asset keys for unsaved project previews", () => {
    const presentation = deriveSpritesWorkspacePresentation({
      assets: [
        {
          id: "asset-default-player",
          name: "player_topdown_4dir.png",
          kind: "Sprite",
          metadata: {
            source: "Assets/sprites/player_topdown_4dir.png",
            bundledDefaultAsset: "topdown-player-4dir"
          }
        }
      ],
      animations: [
        {
          id: "animation-player-idle-down",
          name: "idle_down",
          spriteSheet: "player_topdown_4dir.png",
          frameWidth: 16,
          frameHeight: 16,
          frameCount: 1
        }
      ]
    });

    expect(presentation.spriteSheets[0]).toMatchObject({
      name: "player_topdown_4dir.png",
      source: "Assets/sprites/player_topdown_4dir.png",
      bundledDefaultAsset: "topdown-player-4dir",
      hasAsset: true
    });
  });

  it("resolves the selected sprite animation with a stable fallback", () => {
    const presentation = deriveSpritesWorkspacePresentation({
      assets: [
        { id: "sprite-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } },
        { id: "sprite-npc", name: "npc.png", kind: "Sprite", metadata: { source: "Assets/npc.png" } }
      ],
      animations: [
        { id: "anim-idle", name: "idle_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32 },
        { id: "anim-walk", name: "walk_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32 },
        { id: "anim-npc", name: "npc_idle", spriteSheet: "npc.png", frameWidth: 16, frameHeight: 16 }
      ]
    });

    expect(resolveActiveSpriteAnimation(presentation, "anim-walk")).toMatchObject({
      sheet: { name: "hero.png" },
      animation: { id: "anim-walk", name: "walk_down" }
    });
    expect(resolveActiveSpriteAnimation(presentation, "missing")).toMatchObject({
      sheet: { name: "hero.png" },
      animation: { id: "anim-idle", name: "idle_down" }
    });
    expect(resolveActiveSpriteAnimation(presentation, null)).toMatchObject({
      sheet: { name: "hero.png" },
      animation: { id: "anim-idle", name: "idle_down" }
    });
    expect(resolveActiveSpriteAnimation(deriveSpritesWorkspacePresentation({ assets: [] }), null)).toBeNull();
  });

  it("keeps the fallback animation paintable before any metasprite tile exists", () => {
    const presentation = deriveSpritesWorkspacePresentation({
      assets: [{ id: "sprite-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } }],
      animations: [
        { id: "anim-idle", name: "idle_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32, frameCount: 1 }
      ]
    });
    const selection = resolveActiveSpriteAnimation(presentation, null);
    const animation = selection?.animation ?? null;
    const frame = resolveSpriteWorkspaceCanvasFrame(animation, 0);

    expect(animation).toMatchObject({ id: "anim-idle" });
    expect(frame).toMatchObject({ frameIndex: 0, tileCount: 0, width: 16, height: 32 });
    expect(frame?.tiles).toEqual([]);

    const brush = animation && frame
      ? deriveSpritePaintBrush({ animation, brushState: null, frame, selectedTile: null })
      : null;
    expect(brush).toMatchObject({
      sourceSheet: "hero.png",
      tileHeight: 16,
      tileWidth: 16,
      tileIndex: -1
    });

    expect(animation && frame && brush ? deriveSpriteMetaspriteCanvasAction({
      animationID: animation.id,
      canvasHeight: 320,
      canvasWidth: 160,
      frame,
      frameIndex: frame.frameIndex,
      mode: "paint",
      pointX: 80,
      pointY: 160,
      selectedTile: brush
    }) : null).toMatchObject({
      animationID: "anim-idle",
      options: {
        frameIndex: 0,
        sourceSheet: "hero.png",
        tileHeight: 16,
        tileWidth: 16
      },
      type: "add_tile"
    });
  });

  it("keeps animation-only sprite sheets visible as missing assets", () => {
    const presentation = deriveSpritesWorkspacePresentation({
      assets: [],
      animations: [
        {
          name: "ghost_idle",
          spriteSheet: "ghost.png",
          frameWidth: 16,
          frameHeight: 16,
          fps: 6,
          loops: false,
          frameCount: 1
        }
      ]
    });

    expect(presentation.summary.missingSpriteSheetCount).toBe(1);
    expect(presentation.spriteSheets).toEqual([
      {
        id: "missing-ghost.png",
        name: "ghost.png",
        source: null,
        bundledDefaultAsset: null,
        systemImage: "photo",
        hasAsset: false,
        animationCount: 1,
        stateCount: 0,
        referenceImageCount: 0,
        totalFrames: 1,
        maxFrameSize: "16 x 16",
        colorModes: ["4bpp"]
      }
    ]);
  });

  it("keeps presentation resilient for partial sprite data", () => {
    const presentation = deriveSpritesWorkspacePresentation({
      assets: [{ name: "", kind: "Sprite" }],
      animations: [{ name: "", spriteSheet: "", frameWidth: 0, frameHeight: -2, fps: 0, frameCount: 0 }],
      spriteReferenceImages: [{ assetName: "", title: "", opacity: 2 }]
    });

    expect(presentation.summary).toEqual({
      spriteSheetCount: 1,
      animationCount: 1,
      animationStateCount: 0,
      referenceImageCount: 1,
      missingSpriteSheetCount: 0,
      totalFrames: 1
    });
    expect(presentation.spriteSheets[0]).toMatchObject({
      name: "Sprite sem nome",
      animationCount: 1,
      totalFrames: 1,
      maxFrameSize: "1 x 1"
    });
    expect(presentation.references[0]).toMatchObject({
      title: "Referencia sem titulo",
      assetName: null,
      opacity: 1,
      frameSize: "16 x 32"
    });
  });

  it("filters sprite sheets by query and status without mutating the presentation", () => {
    const presentation = deriveSpritesWorkspacePresentation({
      assets: [
        { id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } },
        { id: "asset-enemy", name: "enemy.png", kind: "Sprite", metadata: { source: "Assets/sprites/enemy.png" } }
      ],
      animations: [
        { id: "anim-hero-idle", name: "hero_idle_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32, state: "idle", direction: "down" },
        { id: "anim-enemy-fly", name: "enemy_fly_right", spriteSheet: "enemy.png", frameWidth: 16, frameHeight: 16, state: "fly", direction: "right" },
        { id: "anim-ghost", name: "ghost_attack", spriteSheet: "ghost.png", frameWidth: 16, frameHeight: 16, state: "attack", direction: "left" }
      ],
      spriteReferenceImages: [
        { id: "ref-hero", title: "Hero turnaround", assetName: "hero_ref.png", generatedSpriteAssetName: "hero.png", state: "walk", direction: "down" }
      ]
    });

    expect(filterSpritesWorkspaceSheets(presentation, { query: "turnaround" }).map((sheet) => sheet.name)).toEqual(["hero.png"]);
    expect(filterSpritesWorkspaceSheets(presentation, { query: "fly" }).map((sheet) => sheet.name)).toEqual(["enemy.png"]);
    expect(filterSpritesWorkspaceSheets(presentation, { query: "turnaround", searchScope: "rail" }).map((sheet) => sheet.name)).toEqual([]);
    expect(filterSpritesWorkspaceSheets(presentation, { query: "hero.png", searchScope: "rail" }).map((sheet) => sheet.name)).toEqual(["hero.png"]);
    expect(filterSpritesWorkspaceSheets(presentation, { status: "missing" }).map((sheet) => sheet.name)).toEqual(["ghost.png"]);
    expect(filterSpritesWorkspaceSheets(presentation, { query: "hero", status: "referenced" }).map((sheet) => sheet.name)).toEqual(["hero.png"]);
    expect(deriveSpritesWorkspaceFilterChips(presentation, "referenced")).toEqual([
      { id: "sprite-status-all", label: "Todos", value: "", count: 3, isActive: false },
      { id: "sprite-status-referenced", label: "Referencias", value: "referenced", count: 1, isActive: true },
      { id: "sprite-status-missing", label: "Ausentes", value: "missing", count: 1, isActive: false }
    ]);
    expect(presentation.spriteSheets).toHaveLength(3);
  });

  it("generates a minimal editable sprite asset and animation from a reference image", () => {
    const project = {
      assets: [],
      animations: [],
      spriteReferenceImages: [
        {
          id: "ref-hero",
          assetName: "hero_reference.png",
          title: "Hero reference",
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

    const next = generateSpriteFromReferenceInProject(project, {
      animationID: "anim-generated-hero",
      assetSourceRelativePath: "Assets/hero 2.png",
      referenceID: "ref-hero",
      spriteAssetID: "asset-generated-hero",
      spriteSheetName: "hero 2.png"
    });

    expect(next.assets).toEqual([
      {
        id: "asset-generated-hero",
        kind: "Sprite",
        name: "hero 2.png",
        systemImage: "person.crop.square",
        metadata: { source: "Assets/hero 2.png", generatedFromReference: "ref-hero" }
      }
    ]);
    expect(next.animations).toEqual([
      {
        id: "anim-generated-hero",
        name: "walk_down",
        spriteSheet: "hero 2.png",
        frameWidth: 16,
        frameHeight: 32,
        fps: 10,
        frameCount: 4,
        loops: true,
        state: "walk",
        direction: "down",
        colorMode: "4bpp",
        frames: [
          {
            width: 16,
            height: 32,
            originX: 8,
            originY: 24,
            tiles: [
              { x: -8, y: 0, sliceX: 0, sliceY: 0, sourceSheet: "hero 2.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false },
              { x: 0, y: 0, sliceX: 8, sliceY: 0, sourceSheet: "hero 2.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false },
              { x: -8, y: -8, sliceX: 0, sliceY: 8, sourceSheet: "hero 2.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false },
              { x: 0, y: -8, sliceX: 8, sliceY: 8, sourceSheet: "hero 2.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false },
              { x: -8, y: -16, sliceX: 0, sliceY: 16, sourceSheet: "hero 2.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false },
              { x: 0, y: -16, sliceX: 8, sliceY: 16, sourceSheet: "hero 2.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false },
              { x: -8, y: -24, sliceX: 0, sliceY: 24, sourceSheet: "hero 2.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false },
              { x: 0, y: -24, sliceX: 8, sliceY: 24, sourceSheet: "hero 2.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false }
            ]
          }
        ]
      }
    ]);
    expect(next.spriteReferenceImages).toEqual([
      {
        id: "ref-hero",
        assetName: "hero_reference.png",
        title: "Hero reference",
        frameWidth: 16,
        frameHeight: 32,
        imageWidth: 64,
        imageHeight: 32,
        fps: 10,
        state: "walk",
        direction: "down",
        generatedSpriteAssetName: "hero 2.png"
      }
    ]);
    expect(project.assets).toEqual([]);
  });

  it("derives every metasprite tile for visual editing while keeping the last tile shortcut", () => {
    const presentation = deriveSpritesWorkspacePresentation({
      animations: [
        {
          id: "anim-idle",
          name: "idle_down",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 16,
          frameCount: 1,
          frames: [
            {
              width: 16,
              height: 16,
              originX: 8,
              originY: 8,
              tiles: [
                { x: -8, y: 0, sliceX: 0, sliceY: 0, sourceSheet: "hero.png", tileWidth: 8, tileHeight: 8 },
                { x: 0, y: 0, sliceX: 8, sliceY: 0, sourceSheet: "hero.png", tileWidth: 8, tileHeight: 8, flipX: true }
              ]
            }
          ]
        }
      ]
    });

    const frame = presentation.animationsBySheet["hero.png"][0].metaspriteFrames[0];

    expect(frame.tileCount).toBe(2);
    expect(frame.tiles).toEqual([
      {
        flipX: false,
        flipY: false,
        objPalette: "OBP0",
        paletteIndex: 0,
        priority: false,
        sliceX: 0,
        sliceY: 0,
        sourceSheet: "hero.png",
        tileHeight: 8,
        tileIndex: 0,
        tileWidth: 8,
        x: -8,
        y: 0
      },
      {
        flipX: true,
        flipY: false,
        objPalette: "OBP0",
        paletteIndex: 0,
        priority: false,
        sliceX: 8,
        sliceY: 0,
        sourceSheet: "hero.png",
        tileHeight: 8,
        tileIndex: 1,
        tileWidth: 8,
        x: 0,
        y: 0
      }
    ]);
    expect(frame.lastTile).toEqual(frame.tiles[1]);
  });

  it("creates a sprite animation with safe defaults without discarding unrelated fields", () => {
    const project = {
      animations: [{ id: "anim-idle", name: "idle_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32 }],
      editorState: { selectedWorkspace: "sprites" }
    };

    const next = createSpriteAnimationInProject(project, {
      id: "anim-walk",
      name: "walk_down",
      spriteSheet: "hero.png"
    });

    expect(next.animations).toEqual([
      { id: "anim-idle", name: "idle_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32 },
      {
        id: "anim-walk",
        name: "walk_down",
        spriteSheet: "hero.png",
        frameWidth: 16,
        frameHeight: 32,
        fps: 8,
        loops: true,
        frameCount: 1,
        state: "idle",
        direction: "down",
        colorMode: "4bpp"
      }
    ]);
    expect(next.editorState).toEqual({ selectedWorkspace: "sprites" });
    expect(project.animations).toHaveLength(1);
  });

  it("renames a sprite animation without changing its id or state bindings", () => {
    const project = {
      animations: [{ id: "anim-idle", name: "idle_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32 }],
      animationStates: [{ id: "state-idle", name: "idle", animationIDs: ["anim-idle"] }]
    };

    const next = renameSpriteAnimationInProject(project, "anim-idle", "idle_front");

    expect(next.animations).toEqual([{ id: "anim-idle", name: "idle_front", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32 }]);
    expect(next.animationStates).toEqual([{ id: "state-idle", name: "idle", animationIDs: ["anim-idle"] }]);
  });

  it("duplicates a sprite animation and joins the same animation states", () => {
    const project = {
      animations: [
        {
          id: "anim-idle",
          name: "idle_down",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 32,
          fps: 8,
          frameCount: 2,
          metadata: { source: "manual" }
        }
      ],
      animationStates: [{ id: "state-idle", name: "idle", animationIDs: ["anim-idle"] }]
    };

    const next = duplicateSpriteAnimationInProject(project, {
      sourceAnimationID: "anim-idle",
      newAnimationID: "anim-idle-copy",
      newName: "idle_down_copy"
    });

    expect(next.animations).toEqual([
      {
        id: "anim-idle",
        name: "idle_down",
        spriteSheet: "hero.png",
        frameWidth: 16,
        frameHeight: 32,
        fps: 8,
        frameCount: 2,
        metadata: { source: "manual" }
      },
      {
        id: "anim-idle-copy",
        name: "idle_down_copy",
        spriteSheet: "hero.png",
        frameWidth: 16,
        frameHeight: 32,
        fps: 8,
        frameCount: 2,
        metadata: { source: "manual" }
      }
    ]);
    expect(next.animationStates).toEqual([{ id: "state-idle", name: "idle", animationIDs: ["anim-idle", "anim-idle-copy"] }]);
    expect(project.animations).toHaveLength(1);
  });

  it("removes a sprite animation and prunes animation state bindings", () => {
    const project = {
      animations: [
        { id: "anim-idle", name: "idle_down", spriteSheet: "hero.png" },
        { id: "anim-walk", name: "walk_down", spriteSheet: "hero.png" }
      ],
      animationStates: [
        { id: "state-idle", name: "idle", animationIDs: ["anim-idle", "anim-walk"] },
        { id: "state-empty", name: "empty", animationIDs: ["anim-idle"] }
      ]
    };

    const next = removeSpriteAnimationFromProject(project, "anim-idle");

    expect(next.animations).toEqual([{ id: "anim-walk", name: "walk_down", spriteSheet: "hero.png" }]);
    expect(next.animationStates).toEqual([
      { id: "state-idle", name: "idle", animationIDs: ["anim-walk"] },
      { id: "state-empty", name: "empty", animationIDs: [] }
    ]);
  });

  it("updates editable animation fields without dropping animation metadata", () => {
    const project = {
      animations: [
        {
          id: "anim-idle",
          name: "idle_down",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 32,
          fps: 8,
          loops: true,
          frameCount: 2,
          state: "idle",
          direction: "down",
          colorMode: "4bpp",
          metadata: { source: "manual" }
        }
      ],
      animationStates: [
        { id: "state-idle", name: "idle", animationIDs: ["anim-idle"] },
        { id: "state-walk", name: "walk", animationIDs: [] }
      ]
    };

    const next = updateSpriteAnimationFieldsInProject(project, "anim-idle", {
      spriteSheet: "hero_alt.png",
      frameWidth: 24,
      frameHeight: 24,
      fps: 12,
      frameCount: 4,
      originY: -8,
      loops: false,
      pingPong: true,
      state: "walk",
      direction: "right",
      colorMode: "4bpp"
    });

    expect(next.animations).toEqual([
      {
        id: "anim-idle",
        name: "idle_down",
        spriteSheet: "hero_alt.png",
        frameWidth: 24,
        frameHeight: 24,
        fps: 12,
        hitboxHeight: 24,
        hitboxWidth: 24,
        hitboxX: 0,
        hitboxY: 0,
        originY: -8,
        originX: 12,
        loops: false,
        frameCount: 4,
        state: "walk",
        direction: "right",
        colorMode: "4bpp",
        metadata: { source: "manual" },
        pingPong: true
      }
    ]);
    expect(next.animationStates).toEqual([
      { id: "state-idle", name: "idle", animationIDs: [] },
      { id: "state-walk", name: "walk", animationIDs: ["anim-idle"] }
    ]);
    expect(project.animations[0].spriteSheet).toBe("hero.png");
  });

  it("keeps negative origins in the persisted animation and metasprite frame", () => {
    const presentation = deriveSpritesWorkspacePresentation({
      assets: [{ id: "sprite-hero", name: "hero.png", kind: "Sprite" }],
      animations: [{
        id: "anim-idle",
        name: "idle_down",
        spriteSheet: "hero.png",
        frameWidth: 16,
        frameHeight: 16,
        frameCount: 1,
        originY: -8,
        frames: [{ width: 16, height: 16, originX: 8, originY: -8, tiles: [] }]
      }]
    });

    const animation = presentation.animationsBySheet["hero.png"]?.[0];
    expect(animation?.geometry.originY).toBe(-8);
    expect(animation?.metaspriteFrames[0]?.originY).toBe(-8);
  });

  it("updates the animation and its metasprite frame together when the origin changes", () => {
    const project = {
      animations: [{
        id: "anim-idle",
        name: "idle_down",
        spriteSheet: "hero.png",
        frameWidth: 16,
        frameHeight: 16,
        frameCount: 1,
        frames: [{ width: 16, height: 16, originX: 8, originY: 8, tiles: [] }]
      }]
    };

    const next = updateSpriteMetaspriteFrameInProject(project, "anim-idle", {
      frameIndex: 0,
      originX: 8,
      originY: -8
    });
    const animation = (next.animations as Record<string, unknown>[])[0];
    const frame = (animation.frames as Record<string, unknown>[])[0];

    expect(animation.originY).toBe(-8);
    expect(frame.originY).toBe(-8);
  });

  it("creates and updates metasprite frames while preserving existing tile composition", () => {
    const project = {
      animations: [
        {
          id: "anim-idle",
          name: "idle_down",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 32,
          frameCount: 2,
          frames: [
            {
              width: 16,
              height: 32,
              originX: 8,
              originY: 24,
              tiles: [{ x: 0, y: 0, sliceX: 0, sliceY: 0, tileWidth: 8, tileHeight: 8 }]
            }
          ]
        }
      ]
    };

    const updatedExisting = updateSpriteMetaspriteFrameInProject(project, "anim-idle", {
      frameIndex: 0,
      originX: 6,
      originY: 20
    });
    const createdSecond = updateSpriteMetaspriteFrameInProject(updatedExisting, "anim-idle", {
      frameIndex: 1,
      originX: 10,
      originY: 28
    });

    expect(createdSecond.animations).toEqual([
      {
        id: "anim-idle",
        name: "idle_down",
        spriteSheet: "hero.png",
        frameWidth: 16,
        frameHeight: 32,
        frameCount: 2,
        hitboxHeight: 32,
        hitboxWidth: 16,
        hitboxX: 0,
        hitboxY: 0,
        originX: 10,
        originY: 28,
        frames: [
          {
            width: 16,
            height: 32,
            originX: 6,
            originY: 20,
            tiles: [{ x: 0, y: 0, sliceX: 0, sliceY: 0, tileWidth: 8, tileHeight: 8 }]
          },
          {
            width: 16,
            height: 32,
            originX: 10,
            originY: 28,
            tiles: []
          }
        ]
      }
    ]);
    expect(project.animations[0].frames[0].originX).toBe(8);
  });

  it("rejects metasprite frame edits for unknown animations, invalid values or frames outside frameCount", () => {
    const project = {
      animations: [{ id: "anim-idle", name: "idle_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32, frameCount: 1 }]
    };

    expect(updateSpriteMetaspriteFrameInProject(project, "missing", { frameIndex: 0, originX: 8, originY: 24 })).toBe(project);
    expect(updateSpriteMetaspriteFrameInProject(project, "anim-idle", { frameIndex: 1, originX: 8, originY: 24 })).toBe(project);
    expect(updateSpriteMetaspriteFrameInProject(project, "anim-idle", { frameIndex: 0, originX: Number.NaN, originY: 24 })).toBe(project);
  });

  it("adds and removes metasprite tiles in a selected animation frame", () => {
    const project = {
      animations: [
        {
          id: "anim-idle",
          name: "idle_down",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 16,
          frameCount: 1
        }
      ]
    };

    const withTile = addSpriteMetaspriteTileInProject(project, "anim-idle", {
      frameIndex: 0,
      sourceSheet: "hero.png",
      sliceX: 8,
      sliceY: 0,
      tileHeight: 8,
      tileWidth: 8,
      x: 4,
      y: 2
    });
    const withoutTile = removeSpriteMetaspriteTileInProject(withTile, "anim-idle", {
      frameIndex: 0,
      tileIndex: 0
    });

    expect(withTile.animations).toEqual([
      {
        id: "anim-idle",
        name: "idle_down",
        spriteSheet: "hero.png",
        frameWidth: 16,
        frameHeight: 16,
        frameCount: 1,
        frames: [
          {
            width: 16,
            height: 16,
            originX: 8,
            originY: 8,
            tiles: [
              {
                x: 4,
                y: 2,
                sliceX: 8,
                sliceY: 0,
                sourceSheet: "hero.png",
                tileWidth: 8,
                tileHeight: 8,
                flipX: false,
                flipY: false,
                objPalette: "OBP0",
                paletteIndex: 0,
                priority: false
              }
            ]
          }
        ]
      }
    ]);
    expect(((withoutTile.animations as Record<string, unknown>[])[0].frames as Record<string, unknown>[])[0].tiles).toEqual([]);
    expect((project.animations[0] as Record<string, unknown>).frames).toBeUndefined();
  });

  it("keeps drag painting idempotent for the same metasprite tile stamp", () => {
    const project = {
      animations: [
        {
          id: "anim-idle",
          name: "idle_down",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 16,
          frameCount: 1
        }
      ]
    };

    const withTile = addSpriteMetaspriteTileInProject(project, "anim-idle", {
      frameIndex: 0,
      sourceSheet: "hero.png",
      sliceX: 8,
      sliceY: 0,
      tileHeight: 8,
      tileWidth: 8,
      x: 4,
      y: 2
    });
    const withRepeatedTile = addSpriteMetaspriteTileInProject(withTile, "anim-idle", {
      frameIndex: 0,
      sourceSheet: "hero.png",
      sliceX: 8,
      sliceY: 0,
      tileHeight: 8,
      tileWidth: 8,
      x: 4,
      y: 2
    });

    expect(((withRepeatedTile.animations as Record<string, unknown>[])[0].frames as Record<string, unknown>[])[0].tiles).toHaveLength(1);
    expect(((withTile.animations as Record<string, unknown>[])[0].frames as Record<string, unknown>[])[0].tiles).toHaveLength(1);
  });

  it("updates metasprite tile placement, source slice and flags without dropping unrelated tiles", () => {
    const project = {
      animations: [
        {
          id: "anim-idle",
          name: "idle_down",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 16,
          frameCount: 1,
          frames: [
            {
              width: 16,
              height: 16,
              originX: 8,
              originY: 8,
              tiles: [
                { x: 0, y: 0, sliceX: 0, sliceY: 0, sourceSheet: "hero.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false },
                { x: 8, y: 0, sliceX: 8, sliceY: 0, sourceSheet: "hero.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false }
              ]
            }
          ]
        }
      ]
    };

    const next = updateSpriteMetaspriteTileInProject(project, "anim-idle", {
      frameIndex: 0,
      tileIndex: 0,
      fields: {
        flipX: true,
        objPalette: "OBP1",
        paletteIndex: 3,
        priority: true,
        sliceX: 16,
        sliceY: 8,
        tileHeight: 16,
        tileWidth: 16,
        x: -4,
        y: 6
      }
    });

    expect(((next.animations as Record<string, unknown>[])[0].frames as Record<string, unknown>[])[0].tiles).toEqual([
      { x: -4, y: 6, sliceX: 16, sliceY: 8, sourceSheet: "hero.png", tileWidth: 16, tileHeight: 16, flipX: true, flipY: false, objPalette: "OBP1", paletteIndex: 3, priority: true },
      { x: 8, y: 0, sliceX: 8, sliceY: 0, sourceSheet: "hero.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false }
    ]);
    expect(project.animations[0].frames[0].tiles[0].x).toBe(0);
  });

  it("rejects metasprite tile edits for invalid frame or tile indexes", () => {
    const project = {
      animations: [
        {
          id: "anim-idle",
          name: "idle_down",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 16,
          frameCount: 1,
          frames: [{ width: 16, height: 16, originX: 8, originY: 8, tiles: [] }]
        }
      ]
    };

    expect(addSpriteMetaspriteTileInProject(project, "missing", { frameIndex: 0, x: 0, y: 0, sliceX: 0, sliceY: 0 })).toBe(project);
    expect(addSpriteMetaspriteTileInProject(project, "anim-idle", { frameIndex: 1, x: 0, y: 0, sliceX: 0, sliceY: 0 })).toBe(project);
    expect(removeSpriteMetaspriteTileInProject(project, "anim-idle", { frameIndex: 0, tileIndex: 0 })).toBe(project);
    expect(updateSpriteMetaspriteTileInProject(project, "anim-idle", { frameIndex: 0, tileIndex: 0, fields: { x: 1 } })).toBe(project);
  });

  it("derives and persists clamped Swift-style geometry and hitbox fields", () => {
    const project = {
      animations: [
        {
          id: "anim-idle",
          name: "idle_down",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 32,
          frameCount: 1,
          frames: [
            {
              width: 16,
              height: 32,
              originX: 8,
              originY: 24,
              tiles: [
                { x: -4, y: 0, sliceX: 0, sliceY: 0, sourceSheet: "hero.png", tileWidth: 8, tileHeight: 8 },
                { x: 4, y: 8, sliceX: 8, sliceY: 0, sourceSheet: "hero.png", tileWidth: 8, tileHeight: 16 }
              ]
            }
          ]
        },
        {
          id: "anim-walk",
          name: "walk_down",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 32,
          frameCount: 1,
          state: "idle"
        }
      ]
    };

    expect(deriveSpriteCanvasGeometry({
      frameWidth: 16,
      frameHeight: 32,
      originX: 999,
      originY: -10,
      hitboxX: -999,
      hitboxY: 999,
      hitboxWidth: 400,
      hitboxHeight: 0
    })).toEqual({
      frameWidth: 16,
      frameHeight: 32,
      originX: 96,
      originY: -10,
      hitboxX: -96,
      hitboxY: 96,
      hitboxWidth: 128,
      hitboxHeight: 1
    });

    const fitted = fitSpriteAnimationHitboxToVisibleTilesInProject(project, "anim-idle", 0);
    expect((fitted.animations as Record<string, unknown>[])[0]).toMatchObject({
      hitboxX: -8,
      hitboxY: -24,
      hitboxWidth: 12,
      hitboxHeight: 8
    });

    const copied = copySpriteAnimationGeometryToSheetSiblingsInProject(fitted, "anim-idle");
    expect((copied.animations as Record<string, unknown>[])[1]).toMatchObject({
      frameWidth: 16,
      frameHeight: 32,
      originX: 8,
      originY: 24,
      hitboxX: -8,
      hitboxY: -24,
      hitboxWidth: 12,
      hitboxHeight: 8
    });
    expect(project.animations[1].frameWidth).toBe(16);
  });

  it("edits multiple selected metasprite tiles by moving, flipping, reordering and deleting", () => {
    const project = {
      animations: [
        {
          id: "anim-idle",
          name: "idle_down",
          spriteSheet: "hero.png",
          frameWidth: 24,
          frameHeight: 24,
          frameCount: 1,
          frames: [
            {
              width: 24,
              height: 24,
              originX: 12,
              originY: 16,
              tiles: [
                { x: 0, y: 0, sliceX: 0, sliceY: 0, sourceSheet: "hero.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false },
                { x: 8, y: 0, sliceX: 8, sliceY: 0, sourceSheet: "hero.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false },
                { x: 16, y: 0, sliceX: 16, sliceY: 0, sourceSheet: "hero.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false }
              ]
            }
          ]
        }
      ]
    };

    const moved = moveSpriteMetaspriteTilesInProject(project, "anim-idle", {
      deltaX: -4,
      deltaY: 6,
      frameIndex: 0,
      tileIndexes: [0, 2]
    });
    expect(((moved.animations as Record<string, unknown>[])[0].frames as Record<string, unknown>[])[0].tiles).toMatchObject([
      { x: -4, y: 6 },
      { x: 8, y: 0 },
      { x: 12, y: 6 }
    ]);

    const flipped = toggleSpriteMetaspriteTilesFlipInProject(moved, "anim-idle", {
      frameIndex: 0,
      horizontal: true,
      tileIndexes: [0, 2]
    });
    expect(((flipped.animations as Record<string, unknown>[])[0].frames as Record<string, unknown>[])[0].tiles).toMatchObject([
      { flipX: true },
      { flipX: false },
      { flipX: true }
    ]);

    const sentBack = reorderSpriteMetaspriteTilesInProject(flipped, "anim-idle", {
      frameIndex: 0,
      tileIndexes: [2],
      placement: "back"
    });
    expect(((sentBack.animations as Record<string, unknown>[])[0].frames as Record<string, unknown>[])[0].tiles).toMatchObject([
      { sliceX: 16 },
      { sliceX: 0 },
      { sliceX: 8 }
    ]);

    const removed = removeSpriteMetaspriteTilesInProject(sentBack, "anim-idle", {
      frameIndex: 0,
      tileIndexes: [0, 2]
    });
    expect(((removed.animations as Record<string, unknown>[])[0].frames as Record<string, unknown>[])[0].tiles).toMatchObject([
      { sliceX: 0 }
    ]);
    expect(project.animations[0].frames[0].tiles).toHaveLength(3);
  });

  it("normalizes and binds sprite frame events using the Swift event naming pattern", () => {
    const project = {
      animations: [
        {
          id: "anim-idle",
          name: "hero idle!",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 32,
          frameCount: 3,
          frameEvents: [[{ type: "event", value: "existing_event" }]]
        }
      ],
      events: [{ id: "event-existing", name: "existing_event", category: "Sprite" }]
    };

    const existingBinding = deriveSpriteFrameEventBinding(project, "anim-idle", 0);
    expect(existingBinding).toEqual({
      animationID: "anim-idle",
      animationName: "hero idle!",
      category: "Sprite",
      currentEventName: "existing_event",
      eventExists: true,
      frameIndex: 0,
      suggestedEventName: "existing_event"
    });

    const emptyBinding = deriveSpriteFrameEventBinding(project, "anim-idle", 2);
    expect(emptyBinding).toMatchObject({
      currentEventName: "",
      eventExists: false,
      suggestedEventName: "hero_idle_frame_3"
    });

    const next = bindSpriteFrameEventInProject(project, "anim-idle", {
      eventName: "hero_idle_frame_3",
      frameIndex: 2
    });
    expect((next.animations as Record<string, unknown>[])[0].frameEvents).toEqual([
      [{ type: "event", value: "existing_event" }],
      [],
      [{ type: "event", value: "hero_idle_frame_3" }]
    ]);
    expect(project.animations[0].frameEvents).toHaveLength(1);
  });

  it("derives sprites validation issues and summary cards", () => {
    const presentation = deriveSpritesWorkspacePresentation({
      assets: [
        { name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } }
      ],
      animations: [
        {
          id: "anim-hero-idle",
          name: "idle",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 16,
          frameCount: 0,
          frames: []
        },
        {
          id: "anim-missing",
          name: "ghost",
          spriteSheet: "missing.png",
          frameWidth: 16,
          frameHeight: 16,
          frames: [{ width: 16, height: 16, tiles: [] }]
        }
      ]
    });

    const issues = deriveSpritesWorkspaceValidationIssues(presentation);
    expect(issues.some((issue) => issue.spriteSheet === "missing.png" && issue.severity === "error")).toBe(true);
    expect(issues.some((issue) => issue.id === "no-animations-hero.png")).toBe(false);

    const cards = deriveSpritesWorkspaceSummaryCards(presentation);
    expect(cards.map((card) => card.id)).toEqual(["sheets", "animations", "frames", "missing", "references"]);
    expect(cards.find((card) => card.id === "missing")?.tone).toBe("warning");
  });

  it("classifica frames largos suportados pelo exportador como informação", () => {
    const presentation = deriveSpritesWorkspacePresentation({
      assets: [
        { name: "wide.png", kind: "Sprite", metadata: { source: "Assets/wide.png" } }
      ],
      animations: [{
        id: "anim-wide",
        name: "wide",
        spriteSheet: "wide.png",
        frameWidth: 128,
        frameHeight: 16,
        frameCount: 1,
        frames: [{ width: 128, height: 16, tiles: [] }]
      }]
    });

    expect(deriveSpritesWorkspaceValidationIssues(presentation)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.stringContaining("vram-anim-wide"), severity: "info" })
    ]));
  });

  it.each([[16, 16, 40], [48, 48, 4], [24, 40, 4]])("counts native OBJ parts per frame for %s x %s with %s frames", (width, height, count) => {
    const presentation = deriveSpritesWorkspacePresentation({
      assets: [{ name: "own.png", kind: "Sprite", metadata: { source: "Assets/own.png", frameWidth: width, frameHeight: height } }],
      animations: [{ id: "own", name: "own", spriteSheet: "own.png", frameWidth: width, frameHeight: height, frameCount: count,
        frames: Array.from({ length: count }, (_, index) => ({ frameIndex: index, width, height, tiles: [{
          tileWidth: width, tileHeight: height, sliceX: index * width, sliceY: 0
        }] }))
      }]
    });
    expect(deriveSpritesWorkspaceValidationIssues(presentation).filter(issue => issue.id.startsWith("metasprite-part-limit"))).toEqual([]);
  });

  it("continues rejecting a single frame above the native OBJ part budget", () => {
    const presentation = deriveSpritesWorkspacePresentation({
      assets: [{ name: "own.png", kind: "Sprite", metadata: { source: "Assets/own.png" } }],
      animations: [{ id: "own", name: "own", spriteSheet: "own.png", frameWidth: 128, frameHeight: 128, frameCount: 1,
        frames: [{ tiles: Array.from({ length: 33 }, (_, index) => ({tileWidth: 8, tileHeight: 8, sliceX: 0, sliceY: 0, x: index * 8, y: 0})) }]
      }]
    });
    expect(deriveSpritesWorkspaceValidationIssues(presentation)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "metasprite-part-limit-own", severity: "error" })
    ]));
  });

  it("mostra o fatiamento de peças grandes e bloqueia peças desalinhadas", () => {
    const presentation = deriveSpritesWorkspacePresentation({
      assets: [
        { name: "boss.png", kind: "Sprite", metadata: { source: "Assets/boss.png" } }
      ],
      animations: [{
        id: "anim-boss",
        name: "boss",
        spriteSheet: "boss.png",
        frameWidth: 96,
        frameHeight: 64,
        frameCount: 1,
        frames: [{
          width: 96,
          height: 64,
          tiles: [
            { tileWidth: 24, tileHeight: 24, sliceX: 0, sliceY: 0 },
            { tileWidth: 10, tileHeight: 8, sliceX: 24, sliceY: 0 }
          ]
        }]
      }]
    });

    expect(deriveSpritesWorkspaceValidationIssues(presentation)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "metasprite-part-decomposition-anim-boss", severity: "info" }),
      expect.objectContaining({ id: expect.stringContaining("metasprite-part-alignment-anim-boss"), severity: "error" })
    ]));
  });
});
