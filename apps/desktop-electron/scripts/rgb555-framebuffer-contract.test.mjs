import { describe, expect, it } from "vitest";

import {
  auditAlphaBlendedRgbaAgainstFramebuffer,
  auditRgbaAgainstFramebufferWithMasks,
  auditOpaqueRgbaAgainstFramebufferRegion,
  auditRgbaAgainstExportedSpriteFrame,
  auditRgbaAgainstExportedTilemap,
  auditRgb555FramebufferColor,
  auditRgb555FramebufferColors,
  auditRgb555FramebufferEncoding,
  auditRgb555FramebufferPalette,
  compositeRgbaLayers,
  decodeExportedSpriteSheetRgba,
  decodeExportedTileDataRgba,
  decodeExportedTilemapRgba,
  decodeRgb555,
  dominantExportedTilemapRgb555,
  exportedTilemapRgb555Coverage,
  findBestOpaqueRgbaFramebufferFrame,
  parseExportedRgb555Palette,
  parseNativeRgb15Palette,
  remapRgbaToPaletteReference,
  parseExportedRgb555Palettes,
  renderIsometricRoomRgba,
  resolveIsometricActorFramebufferMasks,
  resolveIsometricAuthoredBackgroundScroll,
  resolveIsometricCameraPosition,
  resolvePointClickPropFramebufferMasks,
  resolveWorldMapFramebufferViewport,
  usedExportedTilemapRgb555
} from "./rgb555-framebuffer-contract.mjs";
import { findBestRgbaFramebufferCropWithMasks } from "./rgb555-framebuffer-contract.mjs";

describe("RGB555 framebuffer contract", () => {
  it("exclui somente as partes do metasprite Point & Click na posição exportada", () => {
    const scene = { props: [{
      position: { x: 40, y: 88 }, animation: "idle_down",
      animations: [{ name: "idle_down", frame_metasprites: [
        { parts: [
          { x: -8, y: -40, width: 32, height: 32 },
          { x: -8, y: -8, width: 32, height: 16 }
        ] },
        { parts: [{ x: -8, y: -40, width: 32, height: 32 }] }
      ] }]
    }] };
    expect(resolvePointClickPropFramebufferMasks(scene)).toEqual([
      { x: 32, y: 48, width: 32, height: 32 },
      { x: 32, y: 80, width: 32, height: 16 }
    ]);
    const pixels = new Uint8Array(240 * 160 * 4);
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    const framebuffer = pixels.slice();
    framebuffer[(51 * 240 + 33) * 4] = 255;
    const options = { sourcePixels: pixels, framebuffer, width: 240, height: 160,
      framebufferWidth: 240, framebufferHeight: 160, compareWidth: 240, compareHeight: 160,
      masks: resolvePointClickPropFramebufferMasks(scene) };
    expect(auditRgbaAgainstFramebufferWithMasks(options).ok).toBe(true);
    framebuffer[(51 * 240 + 31) * 4] = 255;
    expect(auditRgbaAgainstFramebufferWithMasks(options)).toMatchObject({ ok: false, mismatchCount: 1 });
    expect(resolvePointClickPropFramebufferMasks({ props: [{ position: {}, animations: [] }] })).toEqual([]);
  });

  it("audita a composicao alpha nativa de dois BGs RGB555 e identifica o coeficiente ativo", () => {
    const backgroundPixels = Uint8Array.from([
      255, 0, 0, 255,
      0, 255, 0, 255
    ]);
    const overlayPixels = Uint8Array.from([
      0, 0, 255, 255,
      0, 0, 0, 0
    ]);
    const framebuffer = Uint8Array.from([
      191, 0, 63, 255,
      0, 255, 0, 255
    ]);

    expect(auditAlphaBlendedRgbaAgainstFramebuffer({
      allowedAlpha: [3, 4, 5],
      backgroundPixels,
      framebuffer,
      framebufferHeight: 1,
      framebufferWidth: 2,
      height: 1,
      overlayPixels,
      width: 2
    })).toMatchObject({
      alpha: 4,
      audited: true,
      mismatchCount: 0,
      ok: true,
      opaqueOverlayPixelCount: 1
    });

    framebuffer[0] = 190;
    expect(auditAlphaBlendedRgbaAgainstFramebuffer({
      allowedAlpha: [4],
      backgroundPixels,
      framebuffer,
      framebufferHeight: 1,
      framebufferWidth: 2,
      height: 1,
      overlayPixels,
      width: 2
    })).toMatchObject({ audited: true, ok: false, mismatchCount: 1 });

    framebuffer.set([191, 0, 63, 255, 7, 7, 7, 255]);
    expect(auditAlphaBlendedRgbaAgainstFramebuffer({
      allowedAlpha: [4],
      backgroundPixels,
      framebuffer,
      framebufferHeight: 1,
      framebufferWidth: 2,
      height: 1,
      masks: [{ x: 1, y: 0, width: 1, height: 1 }],
      overlayPixels,
      width: 2
    })).toMatchObject({ audited: true, maskedPixelCount: 1, mismatchCount: 0, ok: true });
  });

  it("accepts only colors representable by the GBA RGB555 framebuffer", () => {
    expect(auditRgb555FramebufferEncoding([
      { count: 10, rgb: [0, 8, 255] },
      { count: 5, rgb: [198, 181, 33] }
    ])).toMatchObject({ audited: true, colorCount: 2, ok: true });
    expect(auditRgb555FramebufferEncoding([
      { count: 1, rgb: [7, 8, 255] }
    ])).toMatchObject({ audited: true, ok: false, invalidColors: [[7, 8, 255]] });
  });

  it("collects every embedded project-data palette used by custom dialogue assets", () => {
    expect(parseExportedRgb555Palettes(`
      constexpr uint16_t dialogue_box_skin_palette[16] = { 13349, 31089, 0 };
      constexpr uint16_t dialogue_font_palette[4] = {
        0x0000, 0x7fff, 0x1234, 0
      };
    `)).toEqual([13349, 31089, 0, 0, 32767, 4660, 0]);
  });

  it("reads the native world-map marker colors from its C++ palette", () => {
    expect(parseNativeRgb15Palette(`
      constexpr uint16_t marker_palette_colors[] = {
        gbs::rgb15(0, 0, 0),
        gbs::rgb15(24, 22, 4),
        gbs::rgb15(31, 31, 31),
      };
    `, "marker_palette_colors")).toEqual([0, 0x12d8, 0x7fff]);
  });

  it('collects native composition palette arrays with inferred length', () => {
    expect(parseExportedRgb555Palettes('constexpr uint16_t market_baked_palette_colors[] = {0,31,992};')).toEqual([0,31,992]);
  });

  it("decodes the compiled deduplicated tile atlas with RGB555 colors and transparent palette zero", () => {
    const tileWithTransparentAndRedPixels = Array.from({ length: 32 }, () => "0x10").join(", ");
    const blueTile = Array.from({ length: 32 }, () => "0x22").join(", ");
    const decoded = decodeExportedTileDataRgba({
      headerSource: `
        constexpr int compiled_tileset_tile_count = 2;
        constexpr uint16_t compiled_tileset_palette[16] = {
          0x0000, 0x001f, 0x7c00, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0
        };
        constexpr uint8_t compiled_tileset_tiles[2][32] = {
          { ${tileWithTransparentAndRedPixels} },
          { ${blueTile} }
        };
        const gbs::TileAsset compiled_tileset_tile_asset = {
          reinterpret_cast<const uint8_t*>(compiled_tileset_tiles),
          compiled_tileset_tile_count,
          3,
          false,
          4
        };
      `,
      symbol: "compiled_tileset",
      tilesPerRow: 2
    });

    expect(decoded).toMatchObject({
      bitsPerPixel: 4,
      destinationTile: 3,
      height: 8,
      tileCount: 2,
      width: 16
    });
    expect(Array.from(decoded.pixels.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(decoded.pixels.slice(4, 8))).toEqual([255, 0, 0, 255]);
    expect(Array.from(decoded.pixels.slice(8 * 4, 8 * 4 + 4))).toEqual([0, 0, 255, 255]);
  });

  it("rebuilds and composites compiled BG tilemaps in hardware draw order", () => {
    const baseTile = Array.from({ length: 32 }, () => "0x11").join(", ");
    const overlayTile = Array.from({ length: 32 }, () => "0x02").join(", ");
    const header = (symbol, tile) => `
      constexpr int ${symbol}_tile_count = 1;
      constexpr uint16_t ${symbol}_palette[16] = {
        0x0000, 0x001f, 0x7c00, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0
      };
      constexpr uint8_t ${symbol}_tiles[1][32] = { { ${tile} } };
      constexpr uint16_t ${symbol}_tilemap_entries[1] = { 3 };
      const gbs::TileAsset ${symbol}_tile_asset = {
        reinterpret_cast<const uint8_t*>(${symbol}_tiles), ${symbol}_tile_count, 3, false, 4
      };
    `;
    const base = decodeExportedTilemapRgba({
      headerSource: header("base", baseTile),
      height: 8,
      symbol: "base",
      transparentPaletteZero: false,
      width: 8
    });
    const overlay = decodeExportedTilemapRgba({
      headerSource: header("overlay", overlayTile),
      height: 8,
      symbol: "overlay",
      transparentPaletteZero: true,
      width: 8
    });
    const composited = compositeRgbaLayers([base, overlay]);

    expect(composited).toMatchObject({ width: 8, height: 8 });
    expect(Array.from(composited.pixels.slice(0, 8))).toEqual([
      0, 0, 255, 255,
      255, 0, 0, 255
    ]);
  });

  it("resolve o banco global quando o tilemap 4bpp usa um índice local", () => {
    const green = decodeRgb555(0x03e0);
    const tile = Array.from({ length: 32 }, () => "0x11").join(", ");
    const palette = Array.from({ length: 256 }, (_, index) => index === 241 ? "0x03e0" : "0x0000").join(", ");
    const header = `
      constexpr int banked_background_tile_count = 1;
      constexpr uint16_t banked_background_palette[256] = { ${palette} };
      constexpr uint8_t banked_background_tiles[1][32] = { { ${tile} } };
      constexpr uint16_t banked_background_tilemap_entries[1] = { 0xf001 };
      constexpr gbs::PaletteAsset banked_background_palette_asset = {
        banked_background_palette, 256, 16
      };
      const gbs::TileAsset banked_background_tile_asset = {
        reinterpret_cast<const uint8_t*>(banked_background_tiles), banked_background_tile_count, 1, false, 4
      };
    `;
    const decoded = decodeExportedTilemapRgba({
      headerSource: header,
      height: 8,
      symbol: "banked_background",
      transparentPaletteZero: false,
      width: 8
    });
    const source = Uint8Array.from({ length: 8 * 8 * 4 }, (_, index) => {
      const channel = index % 4;
      return channel === 0 ? green[0] : channel === 1 ? green[1] : channel === 2 ? green[2] : 255;
    });

    expect(Array.from(decoded.pixels.slice(0, 4))).toEqual([...green, 255]);
    expect(auditRgbaAgainstExportedTilemap({
      headerSource: header,
      height: 8,
      pixels: source,
      symbol: "banked_background",
      width: 8
    })).toMatchObject({ mismatchCount: 0, ok: true });
  });

  it("resolve paleta compacta a partir do start_index global do PaletteAsset", () => {
    const green = decodeRgb555(0x03e0);
    const tile = Array.from({ length: 32 }, () => "0x11").join(", ");
    const palette = Array.from({ length: 16 }, (_, index) => index === 1 ? "0x03e0" : "0x0000").join(", ");
    const header = `
      constexpr int compact_background_tile_count = 1;
      constexpr uint16_t compact_background_palette[16] = { ${palette} };
      constexpr uint8_t compact_background_tiles[1][32] = { { ${tile} } };
      constexpr uint16_t compact_background_tilemap_entries[1] = { 0x1000 };
      constexpr gbs::PaletteAsset compact_background_palette_asset = {
        compact_background_palette, 16, 16
      };
      const gbs::TileAsset compact_background_tile_asset = {
        reinterpret_cast<const uint8_t*>(compact_background_tiles), compact_background_tile_count, 0, false
      };
    `;
    const decoded = decodeExportedTilemapRgba({
      headerSource: header,
      height: 8,
      symbol: "compact_background",
      transparentPaletteZero: false,
      width: 8
    });

    expect(Array.from(decoded.pixels.slice(0, 4))).toEqual([...green, 255]);
  });

  it("preserva indices acima de 1023 no atlas 8bpp paginado", () => {
    const emptyTile = Array.from({ length: 64 }, () => "0x00").join(", ");
    const greenTile = Array.from({ length: 64 }, () => "0x01").join(", ");
    const tiles = Array.from({ length: 1024 }, () => `{ ${emptyTile} }`);
    tiles.push(`{ ${greenTile} }`);
    const header = `
      constexpr int paged_map_tile_count = 1025;
      constexpr uint16_t paged_map_palette[2] = { 0x0000, 0x03e0 };
      constexpr uint8_t paged_map_tiles[1025][64] = { ${tiles.join(", ")} };
      constexpr uint16_t paged_map_tilemap_entries[1] = { 0x0400 };
      const gbs::TileAsset paged_map_tile_asset = {
        reinterpret_cast<const uint8_t*>(paged_map_tiles), paged_map_tile_count, 0, false, gbs::ColorDepth::Bpp8
      };
    `;
    const green = [...decodeRgb555(0x03e0), 255];
    const decoded = decodeExportedTilemapRgba({
      headerSource: header,
      height: 8,
      symbol: "paged_map",
      transparentPaletteZero: false,
      width: 8
    });
    const source = Uint8Array.from(Array.from({ length: 64 }, () => green).flat());

    expect(Array.from(decoded.pixels.slice(0, 4))).toEqual(green);
    expect(dominantExportedTilemapRgb555(header, "paged_map")).toMatchObject({
      dominantPixelCount: 64,
      expectedRgb555: 0x03e0,
      paletteIndex: 1
    });
    expect(auditRgbaAgainstExportedTilemap({
      headerSource: header,
      height: 8,
      pixels: source,
      symbol: "paged_map",
      width: 8
    })).toMatchObject({ mismatchCount: 0, ok: true });
  });

  it("advances the isometric camera with the same unscaled dead-zone delta used by the engine", () => {
    const camera = resolveIsometricCameraPosition({
      camera: {
        bounds: { x: -200, y: 24, width: 800, height: 416 },
        dead_zone: { x: 96, y: 64, width: 48, height: 32 },
        follow_enabled: true,
        position: { x: 80, y: 152 },
        smoothing_x256: 64,
        target_zoom_x256: 282,
        zoom_x256: 282
      },
      grid: {
        origin: { x: 120, y: 24 },
        tile_height_pixels: 16,
        tile_width_pixels: 32
      },
      tileset: "compiled_isometric_tileset"
    }, {
      frame: 11,
      player: { x: 12, y: 10 }
    });

    expect(camera).toMatchObject({
      position: { x: 55, y: 135 },
      zoomX256: 282
    });
  });

  it("clamps the authored isometric BG2 scroll to the compiled background bounds", () => {
    expect(resolveIsometricAuthoredBackgroundScroll(
      { position: { x: 40, y: 232 } },
      { height: 240, width: 320 }
    )).toEqual({ x: 40, y: 80 });

    expect(resolveIsometricAuthoredBackgroundScroll(
      { position: { x: -90, y: 12 } },
      { height: 120, width: 200 }
    )).toEqual({ x: 0, y: 0 });
  });

  it("derives the world-map framebuffer viewport from the initial authored node", () => {
    expect(resolveWorldMapFramebufferViewport({
      initial_node: 0,
      nodes: [{ position: { x: 160, y: 159 } }]
    }, {
      height: 240,
      width: 320
    })).toEqual({ x: 40, y: 79 });

    expect(resolveWorldMapFramebufferViewport({
      initial_node: 1,
      nodes: [
        { position: { x: 160, y: 159 } },
        { position: { x: 12, y: 20 } }
      ]
    }, {
      height: 240,
      width: 320
    })).toEqual({ x: 0, y: 0 });
  });

  it("projects isometric OBJ masks through the same camera transform used by the runtime", () => {
    const heightLevels = Array.from({ length: 1200 }, () => 0);
    heightLevels[(18 * 40) + 19] = 2;
    expect(resolveIsometricActorFramebufferMasks({
      actors: [{
        screen_offset: { x: -16, y: -24 },
        size: { x: 32, y: 32 },
        tile: { x: 19, y: 18 }
      }],
      camera: {
        bounds: { x: -360, y: 24, width: 1120, height: 576 },
        dead_zone: { x: 96, y: 64, width: 48, height: 32 },
        follow_enabled: true,
        position: { x: 80, y: 232 }
      },
      grid: {
        height_step_pixels: 8,
        origin: { x: 120, y: 24 },
        tile_height_pixels: 16,
        tile_width_pixels: 32
      },
      height_levels: heightLevels,
      tileset: "compiled_isometric_background",
      width_tiles: 40
    }, {
      frame: 10,
      player: { x: 19, y: 18 }
    })).toEqual([{ height: 32, width: 32, x: 80, y: 48 }]);
  });

  it("rebuilds a horizontal sprite sheet from frame-major compiled OBJ tiles", () => {
    const redTile = Array.from({ length: 32 }, () => "0x11").join(", ");
    const blueTile = Array.from({ length: 32 }, () => "0x22").join(", ");
    const decoded = decodeExportedSpriteSheetRgba({
      frameCount: 2,
      frameHeight: 8,
      frameWidth: 16,
      headerSource: `
        constexpr int actor_tile_count = 4;
        constexpr uint16_t actor_palette[16] = {
          0, 0x001f, 0x7c00, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0
        };
        constexpr uint8_t actor_tiles[4][32] = {
          { ${redTile} }, { ${redTile} },
          { ${blueTile} }, { ${blueTile} }
        };
        const gbs::TileAsset actor_tile_asset = {
          reinterpret_cast<const uint8_t*>(actor_tiles), actor_tile_count, 512, true
        };
      `,
      symbol: "actor"
    });

    expect(decoded).toMatchObject({ height: 8, width: 32 });
    expect(Array.from(decoded.pixels.slice(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(decoded.pixels.slice(16 * 4, 16 * 4 + 4))).toEqual([0, 0, 255, 255]);
  });

  it("rebuilds deduplicated sprite frames through their metasprite tile origins", () => {
    const redTile = Array.from({ length: 32 }, () => "0x11").join(", ");
    const decoded = decodeExportedSpriteSheetRgba({
      frameCount: 2,
      frameHeight: 8,
      frameWidth: 8,
      headerSource: `
        constexpr int actor_tile_count = 1;
        constexpr uint16_t actor_palette[16] = {
          0, 0x001f, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0
        };
        constexpr uint8_t actor_tiles[1][32] = {
          { ${redTile} }
        };
        const gbs::TileAsset actor_tile_asset = {
          reinterpret_cast<const uint8_t*>(actor_tiles), actor_tile_count, 0, true
        };
        constexpr gbs::MetaSpritePart actor_frame_0_parts[1] = {
          { 0, 0, 0, 0, false, false, 8, 8 }
        };
        constexpr gbs::MetaSpritePart actor_frame_1_parts[1] = {
          { 0, 0, 0, 0, false, false, 8, 8 }
        };
      `,
      symbol: "actor"
    });

    expect(decoded).toMatchObject({ height: 8, tileCount: 1, width: 16 });
    expect(Array.from(decoded.pixels.slice(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(decoded.pixels.slice(8 * 4, 8 * 4 + 4))).toEqual([255, 0, 0, 255]);
  });

  it("decodes each streamed OBJ frame from its own upload instead of repeating the resident frame", () => {
    const decoded = decodeExportedSpriteSheetRgba({frameCount:2,frameHeight:8,frameWidth:8,symbol:'actor',headerSource:`
      constexpr int actor_tile_count = 1;
      constexpr uint16_t actor_palette[16] = {0,31,31744,0,0,0,0,0,0,0,0,0,0,0,0,0};
      constexpr uint8_t actor_tiles[1][32] = {${Array(32).fill(17)}};
      constexpr uint8_t actor_frame_0_tiles[1][32] = {${Array(32).fill(17)}};
      constexpr uint8_t actor_frame_1_tiles[1][32] = {${Array(32).fill(34)}};
      const gbs::TileAsset actor_tile_asset = {reinterpret_cast<const uint8_t*>(actor_tiles),actor_tile_count,0,true};
      constexpr gbs::MetaSpritePart actor_frame_0_parts[1] = {{0,0,0,0,false,false,8,8}};
      constexpr gbs::MetaSpritePart actor_frame_1_parts[1] = {{0,0,0,0,false,false,8,8}};
    `});
    expect(Array.from(decoded.pixels.slice(0,4))).toEqual([255,0,0,255]);
    expect(Array.from(decoded.pixels.slice(8*4,8*4+4))).toEqual([0,0,255,255]);
  });

  it.each([1, 2])("rebuilds composite sprite parts with their local stride for %i frames", (frameCount) => {
    const palette = [
      0x0000, 0x001f, 0x03e0, 0x7c00, 0x03ff, 0x7c1f, 0x7fe0, 0x4210,
      0x5294, 0x6318, 0x739c, 0x021f, 0x421f, 0x03ef, 0x7c0f, 0x7fff
    ];
    const tileRows = Array.from({ length: 36 }, (_, tileIndex) => {
      const paletteIndex = (tileIndex % 15) + 1;
      const packedPixel = (paletteIndex << 4) | paletteIndex;
      return `{ ${Array.from({ length: 32 }, () => `0x${packedPixel.toString(16)}`).join(", ")} }`;
    }).join(",\n");
    const parts = `
      constexpr gbs::MetaSpritePart actor_frame_0_parts[4] = {
        { 0, 0, 0, 0, false, false, 32, 32 },
        { 0, 32, 16, 0, false, false, 32, 16 },
        { 32, 0, 24, 0, false, false, 16, 32 },
        { 32, 32, 32, 0, false, false, 16, 16 },
      };
      constexpr gbs::MetaSpritePart actor_frame_1_parts[4] = {
        { 0, 0, 0, 0, false, false, 32, 32 },
        { 0, 32, 16, 0, false, false, 32, 16 },
        { 32, 0, 24, 0, false, false, 16, 32 },
        { 32, 32, 32, 0, false, false, 16, 16 },
      };
    `;
    const decoded = decodeExportedSpriteSheetRgba({
      frameCount,
      frameHeight: 48,
      frameWidth: 48,
      headerSource: `
        constexpr int actor_tile_count = 36;
        constexpr uint16_t actor_palette[16] = { ${palette.map((value) => `0x${value.toString(16)}`).join(", ")} };
        constexpr uint8_t actor_tiles[36][32] = { ${tileRows} };
        const gbs::TileAsset actor_tile_asset = {
          reinterpret_cast<const uint8_t*>(actor_tiles), actor_tile_count, 0, true
        };
        ${parts}
      `,
      symbol: "actor"
    });
    const pixelAt = (x, y, frame = 0) => {
      const offset = ((y * decoded.width) + (frame * 48) + x) * 4;
      return Array.from(decoded.pixels.slice(offset, offset + 4));
    };
    const colorForTile = (tileIndex) => Array.from(decodeRgb555(palette[(tileIndex % 15) + 1])).concat(255);

    expect(decoded).toMatchObject({ height: 48, tileCount: 36, width: frameCount * 48 });
    expect(pixelAt(0, 0)).toEqual(colorForTile(0));
    expect(pixelAt(8, 8)).toEqual(colorForTile(5));
    expect(pixelAt(0, 32)).toEqual(colorForTile(16));
    expect(pixelAt(32, 8)).toEqual(colorForTile(26));
    expect(pixelAt(32, 32)).toEqual(colorForTile(32));
    if (frameCount > 1) expect(pixelAt(8, 8, 1)).toEqual(colorForTile(5));
  });

  it("renders exact 32x16 isometric geometry and rejects the former striped corruption", () => {
    const sourcePixels = new Uint8Array(32 * 16 * 4);
    for (let y = 0; y < 16; y += 1) {
      const halfSpan = y < 8 ? y * 2 + 1 : (15 - y) * 2 + 1;
      for (let x = 16 - halfSpan; x < 16 + halfSpan; x += 1) {
        sourcePixels.set([145, 219, 105, 255], ((y * 32) + x) * 4);
      }
    }
    const rendered = renderIsometricRoomRgba({
      bounds: { x: 0, y: 0, width: 32, height: 16 },
      grid: { heightStep: 8, originX: 16, originY: 0 },
      heightLevels: [0], roomHeight: 1, roomWidth: 1,
      sourceHeight: 16, sourcePixels, sourceWidth: 32,
      tileHeight: 16, tileWidth: 32, visualTiles: [1]
    });
    const audit = (framebuffer) => auditRgbaAgainstFramebufferWithMasks({
      compareHeight: 16, compareWidth: 32, framebuffer,
      framebufferHeight: 16, framebufferWidth: 32,
      height: 16, sourcePixels: rendered.pixels, width: 32
    });
    expect(audit(rendered.pixels)).toMatchObject({ mismatchCount: 0, ok: true });

    const striped = Uint8Array.from(rendered.pixels);
    for (let y = 0; y < 16; y += 1) {
      striped.fill(0, (y * 32 + 8) * 4, (y * 32 + 12) * 4);
    }
    expect(audit(striped)).toMatchObject({ ok: false });
  });
  it("applies source tilemap hflip and vflip bits while rendering isometric tiles", () => {
    const red = [255, 0, 0, 255];
    const blue = [0, 0, 255, 255];
    const sourcePixels = new Uint8Array(8 * 8 * 4);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const color = x < 4 ? red : blue;
        const offset = (y * 8 + x) * 4;
        sourcePixels.set(color, offset);
      }
    }
    const plain = renderIsometricRoomRgba({
      bounds: { x: 0, y: 0, width: 8, height: 8 },
      grid: { heightStep: 8, originX: 4, originY: 0 },
      heightLevels: [0], roomHeight: 1, roomWidth: 1,
      sourceHeight: 8, sourcePixels, sourceWidth: 8,
      sourceTilemapEntries: [1],
      sourceTileDestination: 1,
      sourceTilemapWidth: 1,
      tileHeight: 8, tileWidth: 8, visualTiles: [1]
    });
    const hFlipped = renderIsometricRoomRgba({
      bounds: { x: 0, y: 0, width: 8, height: 8 },
      grid: { heightStep: 8, originX: 4, originY: 0 },
      heightLevels: [0], roomHeight: 1, roomWidth: 1,
      sourceHeight: 8, sourcePixels, sourceWidth: 8,
      sourceTilemapEntries: [0x0400 | 1],
      sourceTileDestination: 1,
      sourceTilemapWidth: 1,
      tileHeight: 8, tileWidth: 8, visualTiles: [1]
    });
    const sourceYOffset = (0 * 8 + 0) * 4;
    const plainTopLeft = Array.from(plain.pixels.slice(sourceYOffset, sourceYOffset + 3));
    const plainTopRight = Array.from(plain.pixels.slice((0 * 8 + 7) * 4, (0 * 8 + 7) * 4 + 3));
    const flippedTopLeft = Array.from(hFlipped.pixels.slice(sourceYOffset, sourceYOffset + 3));
    const flippedTopRight = Array.from(hFlipped.pixels.slice((0 * 8 + 7) * 4, (0 * 8 + 7) * 4 + 3));
    expect(plainTopLeft).toEqual(red.slice(0, 3));
    expect(plainTopRight).toEqual(blue.slice(0, 3));
    expect(flippedTopLeft).toEqual(blue.slice(0, 3));
    expect(flippedTopRight).toEqual(red.slice(0, 3));
  });
  it("desvincula a subtile do grid de tilemap e respeita o índice do entry isométrico", () => {
    const red = [255, 0, 0, 255];
    const blue = [0, 0, 255, 255];
    const sourcePixels = Uint8Array.from(Array.from({ length: 24 * 8 * 4 }, (_, index) => {
      const byteOffset = index % 4;
      const x = Math.floor(index / 4) % 24;
      return (byteOffset === 3 ? 255 : x < 8 ? red[byteOffset] : x < 16 ? blue[byteOffset] : red[byteOffset]);
    }));
    const rendered = renderIsometricRoomRgba({
      bounds: { x: 0, y: 0, width: 24, height: 8 },
      grid: { heightStep: 8, originX: 8, originY: 0 },
      heightLevels: [0], roomHeight: 1, roomWidth: 1,
      sourceHeight: 8, sourcePixels, sourceWidth: 24,
      sourceTileDestination: 1,
      sourceTilemapEntries: [0x0002, 0x0002],
      sourceTilemapWidth: 3,
      tileHeight: 8, tileWidth: 16, visualTiles: [1]
    });
    const topLeft = Array.from(rendered.pixels.slice(0, 3));
    const topRight = Array.from(rendered.pixels.slice((0 * 16 + 15) * 4, (0 * 16 + 15) * 4 + 3));
    expect(topLeft).toEqual(blue.slice(0, 3));
    expect(topRight).toEqual(blue.slice(0, 3));
  });
  it("applies the authored vertical module anchor", () => {
    const rendered = renderIsometricRoomRgba({
      bounds: { x: 0, y: 0, width: 8, height: 16 },
      grid: { heightStep: 8, originX: 4, originY: 8 },
      heightLevels: [0], roomHeight: 1, roomWidth: 1,
      sourceHeight: 8, sourceWidth: 8,
      sourcePixels: Uint8Array.from(Array.from({ length: 256 }, (_, i) => i % 4 === 0 || i % 4 === 3 ? 255 : 0)),
      tileHeight: 8, tileWidth: 8, visualTiles: [1], renderOffsetY: -8
    });
    expect(Array.from(rendered.pixels.slice(0, 4))).toEqual([255, 0, 0, 255]);
    expect(rendered.pixels[8 * 8 * 4 + 3]).toBe(0);
  });
  it("decodes exported GBA colors with the same 5-bit expansion used by the framebuffer", () => {
    expect(decodeRgb555(0x63BF)).toEqual([255, 239, 198]);
    expect(decodeRgb555(0x1441)).toEqual([8, 16, 41]);
  });

  it("parses the exact RGB555 palette emitted by assetc", () => {
    expect(parseExportedRgb555Palette(`
      constexpr uint16_t quest_list_page1_gba_palette[16] = {
        0x63bf, 0x4f58, 0x1441, 0x2d05, 0x0
      };
    `, "quest_list_page1_gba")).toEqual([0x63BF, 0x4F58, 0x1441, 0x2D05, 0]);
  });

  it("derives the dominant RGB555 color from exported tiles and tilemap instead of palette order", () => {
    const zeroTile = Array.from({ length: 32 }, () => "0x00").join(", ");
    const oneTile = Array.from({ length: 32 }, () => "0x11").join(", ");
    expect(dominantExportedTilemapRgb555(`
      constexpr uint16_t room_palette[16] = { 0x1042, 0x2a7a, 0x0 };
      constexpr int room_tile_count = 2;
      constexpr uint8_t room_tiles[2][32] = {
        { ${zeroTile} },
        { ${oneTile} }
      };
      constexpr uint16_t room_tilemap_entries[3] = { 0x1, 0x2, 0x2 };
      const gbs::TileAsset room_tile_asset = {
        reinterpret_cast<const uint8_t*>(room_tiles), room_tile_count, 1, false
      };
    `, "room")).toMatchObject({
      destinationTile: 1,
      expectedRgb555: 0x2A7A,
      paletteIndex: 1,
      pixelCount: 192,
      dominantPixelCount: 128
    });
  });

  it("aggregates the smallest dominant exported color set that covers a rich tilemap threshold", () => {
    const tile = (index) => Array.from({ length: 32 }, () => `0x${index}${index}`).join(", ");
    const header = `
      constexpr uint16_t rich_palette[16] = { 0x1042, 0x2a7a, 0x21d5, 0x1ca6 };
      constexpr int rich_tile_count = 4;
      constexpr uint8_t rich_tiles[4][32] = {
        { ${tile(0)} }, { ${tile(1)} }, { ${tile(2)} }, { ${tile(3)} }
      };
      constexpr uint16_t rich_tilemap_entries[4] = { 0x0, 0x1, 0x2, 0x3 };
      const gbs::TileAsset rich_tile_asset = {
        reinterpret_cast<const uint8_t*>(rich_tiles), rich_tile_count, 0, false
      };
    `;
    const coverage = exportedTilemapRgb555Coverage(header, "rich", 0.4);
    expect(coverage).toMatchObject({
      exportedPixelCount: 128,
      exportedPixelRatio: 0.5,
      minimumPixelRatio: 0.4,
      paletteIndices: [0, 1]
    });
    expect(coverage.expectedRgb555).toEqual([0x1042, 0x2A7A]);
    expect(auditRgb555FramebufferColors({
      colorHistogram: [
        { count: 80, rgb: decodeRgb555(0x1042) },
        { count: 48, rgb: decodeRgb555(0x2A7A) },
        { count: 128, rgb: decodeRgb555(0x21D5) }
      ],
      expectedRgb555: coverage.expectedRgb555,
      framebufferPixelCount: 256,
      minimumPixelRatio: 0.4
    })).toMatchObject({ ok: true, actualCount: 128, actualRatio: 0.5 });
  });

  it("can exclude transparent palette colors when auditing a layered background", () => {
    const tile = (index) => Array.from({ length: 32 }, () => `0x${index}${index}`).join(", ");
    const coverage = exportedTilemapRgb555Coverage(`
      constexpr uint16_t layered_palette[16] = { 0x0, 0x1042, 0x2a7a };
      constexpr int layered_tile_count = 2;
      constexpr uint8_t layered_tiles[2][32] = {
        { ${tile(0)} }, { ${tile(1)} }
      };
      constexpr uint16_t layered_tilemap_entries[2] = { 0x0, 0x1 };
      const gbs::TileAsset layered_tile_asset = {
        reinterpret_cast<const uint8_t*>(layered_tiles), layered_tile_count, 0, false
      };
    `, "layered", 0.4, { excludeRgb555: [0] });

    expect(coverage).toMatchObject({
      exportedPixelCount: 64,
      exportedPixelRatio: 0.5,
      paletteIndices: [1]
    });
    expect(coverage.expectedRgb555).toEqual([0x1042]);
  });

  it("lists every RGB555 color actually referenced by a streamed tilemap viewport", () => {
    const coverage = {
      palettePixelCounts: [64, 0, 128, 32],
      palette: [0x1042, 0x7FFF, 0x2A7A, 0x21D5]
    };
    expect(usedExportedTilemapRgb555(coverage)).toEqual([0x1042, 0x2A7A, 0x21D5]);
  });

  it("compares every source PNG pixel with the reconstructed RGB555 tilemap", () => {
    const color = 0x2A7A;
    const rgb = decodeRgb555(color);
    const rgba = Uint8Array.from(Array.from({ length: 64 }, () => [...rgb, 255]).flat());
    const tile = Array.from({ length: 32 }, () => "0x11").join(", ");
    const header = `
      constexpr uint16_t exact_palette[16] = { 0x1042, ${color} };
      constexpr int exact_tile_count = 1;
      constexpr uint8_t exact_tiles[1][32] = { { ${tile} } };
      constexpr uint16_t exact_tilemap_entries[1] = { 0x0 };
      const gbs::TileAsset exact_tile_asset = {
        reinterpret_cast<const uint8_t*>(exact_tiles), exact_tile_count, 0, false
      };
    `;

    expect(auditRgbaAgainstExportedTilemap({
      headerSource: header,
      height: 8,
      pixels: rgba,
      symbol: "exact",
      width: 8
    })).toMatchObject({ ok: true, mismatchCount: 0, pixelCount: 64 });

    rgba[0] = 0;
    expect(auditRgbaAgainstExportedTilemap({
      headerSource: header,
      height: 8,
      pixels: rgba,
      symbol: "exact",
      width: 8
    })).toMatchObject({ ok: false, mismatchCount: 1 });
  });

  it("ignores residual RGB in transparent PNG pixels while auditing the layer", () => {
    const opaque = decodeRgb555(0x2A7A);
    const transparent = [255, 255, 255, 0];
    const rgba = Uint8Array.from([
      ...opaque, 255,
      ...Array.from({ length: 63 }, () => transparent).flat()
    ]);
    const tile = ["0x01", ...Array.from({ length: 31 }, () => "0x00")].join(", ");
    const header = `
      constexpr uint16_t transparent_source_palette[16] = { 0x0000, 0x2A7A };
      constexpr int transparent_source_tile_count = 1;
      constexpr uint8_t transparent_source_tiles[1][32] = { { ${tile} } };
      constexpr uint16_t transparent_source_tilemap_entries[1] = { 0x0 };
      const gbs::TileAsset transparent_source_tile_asset = {
        reinterpret_cast<const uint8_t*>(transparent_source_tiles), transparent_source_tile_count, 0, false
      };
    `;

    expect(auditRgbaAgainstExportedTilemap({
      headerSource: header,
      height: 8,
      pixels: rgba,
      symbol: "transparent_source",
      width: 8
    })).toMatchObject({ ok: true, mismatchCount: 0, pixelCount: 64 });
  });

  it("mantém o índice zero 4bpp como transparência sobre o backdrop, mesmo com banco", () => {
    const backdrop = 0x7AE8;
    const rgba = Uint8Array.from(Array.from({ length: 64 }, () => [...decodeRgb555(backdrop), 255]).flat());
    const tile = Array.from({ length: 32 }, () => "0x00").join(", ");
    const palette = Array.from({ length: 256 }, () => "0x0000").join(", ");
    const header = `
      constexpr uint16_t banked_zero_palette[256] = { ${palette} };
      constexpr int banked_zero_tile_count = 1;
      constexpr uint8_t banked_zero_tiles[1][32] = { { ${tile} } };
      constexpr uint16_t banked_zero_tilemap_entries[1] = { 0x1000 };
      const gbs::TileAsset banked_zero_tile_asset = {
        reinterpret_cast<const uint8_t*>(banked_zero_tiles), banked_zero_tile_count, 0, false
      };
    `;

    const decoded = decodeExportedTilemapRgba({
      headerSource: header,
      height: 8,
      symbol: "banked_zero",
      transparentPaletteZero: true,
      width: 8
    });
    expect(Array.from(decoded.pixels.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(rgba.length).toBe(8 * 8 * 4);
  });

  it("decodifica atlas indexado 8bpp sem aplicar bancos de paleta 4bpp", () => {
    const dark = 0x1111;
    const light = 0x3D2A;
    const tile = Array.from({ length: 64 }, (_, index) => index % 2 === 0 ? "0x01" : "0x02").join(", ");
    const header = `
      constexpr uint16_t rich8_palette[3] = { 0x0000, ${dark}, ${light} };
      constexpr int rich8_tile_count = 1;
      constexpr uint8_t rich8_tiles[1][64] = { { ${tile} } };
      constexpr uint16_t rich8_tilemap_entries[1] = { 0x0 };
      const gbs::TileAsset rich8_tile_asset = {
        reinterpret_cast<const uint8_t*>(rich8_tiles), rich8_tile_count, 0, false, gbs::ColorDepth::Bpp8
      };
    `;

    expect(dominantExportedTilemapRgb555(header, "rich8")).toMatchObject({
      bitsPerPixel: 8,
      expectedRgb555: dark,
      tileCount: 1
    });
    expect(exportedTilemapRgb555Coverage(header, "rich8", 0.9)).toMatchObject({
      bitsPerPixel: 8,
      tilemapEntryCount: 1
    });
    const decoded = decodeExportedTilemapRgba({
      headerSource: header,
      height: 8,
      symbol: "rich8",
      transparentPaletteZero: false,
      width: 8
    });
    expect(decoded.bitsPerPixel).toBe(8);
    expect(Array.from(decoded.pixels.slice(0, 8))).toEqual([
      ...decodeRgb555(dark), 255,
      ...decodeRgb555(light), 255
    ]);
  });

  it("compares background pixels by position while excluding only declared HUD and OAM masks", () => {
    const color = decodeRgb555(0x2A7A);
    const sourcePixels = Uint8Array.from(Array.from({ length: 64 }, () => [...color, 255]).flat());
    const framebuffer = Uint8Array.from(sourcePixels);
    framebuffer[0] = 0;

    expect(auditRgbaAgainstFramebufferWithMasks({
      framebuffer,
      framebufferHeight: 8,
      framebufferWidth: 8,
      height: 8,
      masks: [],
      sourcePixels,
      width: 8
    })).toMatchObject({
      ok: false,
      mismatchBounds: { maxX: 0, maxY: 0, minX: 0, minY: 0 },
      mismatchCount: 1,
      maskedPixelCount: 0
    });

    expect(auditRgbaAgainstFramebufferWithMasks({
      framebuffer,
      framebufferHeight: 8,
      framebufferWidth: 8,
      height: 8,
      masks: [{ height: 1, width: 1, x: 0, y: 0 }],
      sourcePixels,
      width: 8
    })).toMatchObject({ ok: true, mismatchCount: 0, maskedPixelCount: 1, comparedPixelCount: 63 });
  });

  it("compares a camera crop from a background larger than the framebuffer", () => {
    const left = decodeRgb555(0x1042);
    const right = decodeRgb555(0x2A7A);
    const sourcePixels = Uint8Array.from(Array.from({ length: 8 }, () => (
      Array.from({ length: 8 }, () => [...left, 255])
        .concat(Array.from({ length: 8 }, () => [...right, 255]))
    )).flat(2));
    const framebuffer = Uint8Array.from(Array.from({ length: 64 }, () => [...right, 255]).flat());

    expect(auditRgbaAgainstFramebufferWithMasks({
      compareHeight: 8,
      compareWidth: 8,
      framebuffer,
      framebufferHeight: 8,
      framebufferWidth: 8,
      height: 8,
      masks: [],
      sourcePixels,
      sourceX: 8,
      sourceY: 0,
      width: 16
    })).toMatchObject({ ok: true, mismatchCount: 0, source: { x: 8, y: 0 } });

    expect(findBestRgbaFramebufferCropWithMasks({
      compareHeight: 8,
      compareWidth: 8,
      framebuffer,
      framebufferHeight: 8,
      framebufferWidth: 8,
      height: 8,
      masks: [],
      maxSourceX: 8,
      maxSourceY: 0,
      sourcePixels,
      width: 16
    })).toMatchObject({ ok: true, mismatchCount: 0, source: { x: 8, y: 0 } });
  });

  it("reconstructs an OBJ metasprite frame and compares color plus transparency with its PNG source", () => {
    const transparent = [0, 0, 0, 0];
    const light = [...decodeRgb555(0x63BF), 255];
    const dark = [...decodeRgb555(0x1441), 255];
    const pixels = Uint8Array.from(Array.from({ length: 16 * 16 }, (_, index) => (
      index === 0 ? transparent : index % 2 === 0 ? light : dark
    )).flat());
    const firstTile = ["0x20", ...Array.from({ length: 31 }, () => "0x21")].join(", ");
    const regularTile = Array.from({ length: 32 }, () => "0x21").join(", ");
    const header = `
      constexpr uint16_t hero_palette[16] = { 0x0000, 0x63bf, 0x1441 };
      constexpr int hero_tile_count = 4;
      constexpr uint8_t hero_tiles[4][32] = {
        { ${firstTile} }, { ${regularTile} }, { ${regularTile} }, { ${regularTile} }
      };
      const gbs::TileAsset hero_tile_asset = {
        reinterpret_cast<const uint8_t*>(hero_tiles), hero_tile_count, 24, true
      };
      constexpr gbs::MetaSpritePart hero_frame_0_parts[1] = {
        { 0, 0, 24, 3, false, false, 16, 16 },
      };
    `;

    expect(auditRgbaAgainstExportedSpriteFrame({
      frameHeight: 16,
      frameIndex: 0,
      frameWidth: 16,
      headerSource: header,
      pixels,
      sheetWidth: 16,
      symbol: "hero"
    })).toMatchObject({
      alphaMismatchCount: 0,
      colorMismatchCount: 0,
      ok: true,
      opaquePixelCount: 255,
      pixelCount: 256
    });

    pixels[(8 * 4)] = 0;
    expect(auditRgbaAgainstExportedSpriteFrame({
      frameHeight: 16,
      frameIndex: 0,
      frameWidth: 16,
      headerSource: header,
      pixels,
      sheetWidth: 16,
      symbol: "hero"
    })).toMatchObject({ ok: false, colorMismatchCount: 1 });
  });

  it("audita o array de tiles específico de cada frame OBJ", () => {
    const firstColor = [...decodeRgb555(0x1111), 255];
    const secondColor = [...decodeRgb555(0x2222), 255];
    const pixels = Uint8Array.from(Array.from({ length: 8 }, () => [
      ...Array.from({ length: 8 }, () => firstColor),
      ...Array.from({ length: 8 }, () => secondColor)
    ]).flat(2));
    const firstTile = Array.from({ length: 32 }, () => "0x11").join(", ");
    const secondTile = Array.from({ length: 32 }, () => "0x22").join(", ");
    const header = `
      constexpr uint16_t hero_palette[16] = { 0x0000, 0x1111, 0x2222 };
      constexpr int hero_tile_count = 1;
      constexpr uint8_t hero_tiles[1][32] = { { ${firstTile} } };
      const gbs::TileAsset hero_tile_asset = { reinterpret_cast<const uint8_t*>(hero_tiles), hero_tile_count, 0, true };
      constexpr uint8_t hero_frame_0_tiles[1][32] = { { ${firstTile} } };
      const gbs::TileAsset hero_frame_0_tile_asset = { reinterpret_cast<const uint8_t*>(hero_frame_0_tiles), 1, 0, true };
      constexpr uint8_t hero_frame_1_tiles[1][32] = { { ${secondTile} } };
      const gbs::TileAsset hero_frame_1_tile_asset = { reinterpret_cast<const uint8_t*>(hero_frame_1_tiles), 1, 0, true };
      constexpr gbs::MetaSpritePart hero_frame_0_parts[1] = { { 0, 0, 0, 0, false, false, 8, 8 } };
      constexpr gbs::MetaSpritePart hero_frame_1_parts[1] = { { 0, 0, 0, 0, false, false, 8, 8 } };
    `;

    expect(auditRgbaAgainstExportedSpriteFrame({
      frameHeight: 8,
      frameIndex: 1,
      frameWidth: 8,
      headerSource: header,
      pixels,
      sheetWidth: 16,
      symbol: "hero"
    })).toMatchObject({ ok: true, colorMismatchCount: 0, alphaMismatchCount: 0 });
  });

  it("aceita o remapeamento explícito de uma paleta OBJ sem relaxar a transparência", () => {
    const transparent = [0, 0, 0, 0];
    const remappedColor = [...decodeRgb555(0x1441), 255];
    const header = `
      constexpr uint16_t remapped_palette[16] = { 0x0000, 0x1441, 0x0000 };
      constexpr int remapped_tile_count = 1;
      constexpr uint8_t remapped_tiles[1][32] = { { 0x10, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11 } };
      const gbs::TileAsset remapped_tile_asset = {
        reinterpret_cast<const uint8_t*>(remapped_tiles), remapped_tile_count, 0, true
      };
      constexpr gbs::MetaSpritePart remapped_frame_0_parts[1] = {
        { 0, 0, 0, 0, false, false, 8, 8 },
      };
    `;
    expect(auditRgbaAgainstExportedSpriteFrame({
      allowPaletteRemap: true,
      frameHeight: 8,
      frameIndex: 0,
      frameWidth: 8,
      headerSource: header,
      pixels: Uint8Array.from(Array.from({ length: 8 * 8 }, (_, index) => (
        index === 0 ? transparent : remappedColor
      )).flat()),
      sheetWidth: 8,
      symbol: "remapped"
    })).toMatchObject({ alphaMismatchCount: 0, colorMismatchCount: 0, ok: true, paletteRemapped: true });
  });

  it("compares every opaque source sprite pixel with an exact framebuffer region", () => {
    const source = Uint8Array.from([
      0, 0, 0, 0, ...decodeRgb555(0x63BF), 255,
      ...decodeRgb555(0x1441), 255, ...decodeRgb555(0x63BF), 255
    ]);
    const framebuffer = Uint8Array.from(Array.from({ length: 4 * 3 }, () => [0, 0, 0, 255]).flat());
    const paint = (x, y, rgb) => framebuffer.set([...rgb, 255], ((y * 4) + x) * 4);
    paint(2, 1, decodeRgb555(0x63BF));
    paint(1, 2, decodeRgb555(0x1441));
    paint(2, 2, decodeRgb555(0x63BF));

    expect(auditOpaqueRgbaAgainstFramebufferRegion({
      framebuffer,
      framebufferHeight: 3,
      framebufferWidth: 4,
      frameHeight: 2,
      frameWidth: 2,
      sourcePixels: source,
      sourceSheetWidth: 2,
      targetX: 1,
      targetY: 1
    })).toMatchObject({
      comparedPixelCount: 3,
      mismatchCount: 0,
      ok: true,
      target: { x: 1, y: 1 }
    });

    paint(2, 2, [255, 0, 0]);
    expect(auditOpaqueRgbaAgainstFramebufferRegion({
      framebuffer,
      framebufferHeight: 3,
      framebufferWidth: 4,
      frameHeight: 2,
      frameWidth: 2,
      sourcePixels: source,
      sourceSheetWidth: 2,
      targetX: 1,
      targetY: 1
    })).toMatchObject({ ok: false, mismatchCount: 1 });
  });

  it("accepts OBJ sprites whose transparent palette index is not zero", () => {
    const sourcePixels = new Uint8Array(8 * 8 * 4);
    sourcePixels.set([...decodeRgb555(0x63BF), 255], 0);
    for (let index = 1; index < 8 * 8; index += 1) {
      sourcePixels.set([0, 0, 0, 0], index * 4);
    }
    const header = `
      constexpr uint16_t cursor_palette[16] = { 0x0000, 0x63bf, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000 };
      constexpr int cursor_tile_count = 1;
      constexpr uint8_t cursor_tiles[1][32] = {
        { 0xf1, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff }
      };
      const gbs::TileAsset cursor_tile_asset = {
        reinterpret_cast<const uint8_t*>(cursor_tiles), cursor_tile_count, 0, true
      };
      constexpr gbs::MetaSpritePart cursor_frame_0_parts[1] = {
        { 0, 0, 0, 0, false, false, 8, 8 },
      };
    `;

    expect(auditRgbaAgainstExportedSpriteFrame({
      frameHeight: 8,
      frameIndex: 0,
      frameWidth: 8,
      headerSource: header,
      pixels: sourcePixels,
      sheetWidth: 8,
      symbol: "cursor",
      transparentPaletteIndex: 15
    })).toMatchObject({
      alphaMismatchCount: 0,
      colorMismatchCount: 0,
      ok: true,
      opaquePixelCount: 1
    });
  });

  it("finds the exact source frame, position and horizontal orientation in the framebuffer", () => {
    const transparent = [0, 0, 0, 0];
    const red = [...decodeRgb555(0x001F), 255];
    const green = [...decodeRgb555(0x03E0), 255];
    const source = Uint8Array.from([
      ...transparent, ...red,
      ...green, ...red,
      ...red, ...transparent,
      ...green, ...green
    ]);
    const framebuffer = Uint8Array.from(Array.from({ length: 5 * 4 }, () => [0, 0, 0, 255]).flat());
    const paint = (x, y, rgba) => framebuffer.set(rgba, ((y * 5) + x) * 4);
    paint(2, 1, red);
    paint(3, 1, green);
    paint(2, 2, green);
    paint(3, 2, green);

    expect(findBestOpaqueRgbaFramebufferFrame({
      candidateFlipsX: [false, true],
      candidateSourceXs: [0, 2],
      candidateTargets: [{ x: 1, y: 1 }, { x: 2, y: 1 }],
      framebuffer,
      framebufferHeight: 4,
      framebufferWidth: 5,
      frameHeight: 2,
      frameWidth: 2,
      sourcePixels: source,
      sourceSheetWidth: 4
    })).toMatchObject({
      candidateCount: 8,
      flipX: true,
      mismatchCount: 0,
      ok: true,
      sourceX: 2,
      target: { x: 2, y: 1 }
    });
  });

  it("ignora candidatos de sprite com poucos pixels comparaveis por oclusao", () => {
    const red = [...decodeRgb555(0x001F), 255];
    const blue = [...decodeRgb555(0x7C00), 255];
    const source = Uint8Array.from(Array.from({ length: 4 }, () => red).flat());
    const framebuffer = Uint8Array.from(Array.from({ length: 4 * 3 }, () => blue).flat());
    const paint = (x, y, rgba) => framebuffer.set(rgba, ((y * 4) + x) * 4);
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 2; x += 1) paint(x, y, red);
    }
    paint(2, 1, red);

    expect(findBestOpaqueRgbaFramebufferFrame({
      allowedOcclusionRgb555: [0x7C00],
      candidateFlipsX: [false],
      candidateSourceXs: [0],
      candidateTargets: [{ x: 2, y: 1 }, { x: 0, y: 0 }],
      framebuffer,
      framebufferHeight: 3,
      framebufferWidth: 4,
      frameHeight: 2,
      frameWidth: 2,
      minimumComparedPixelCount: 4,
      sourcePixels: source,
      sourceSheetWidth: 2
    })).toMatchObject({
      comparedPixelCount: 4,
      mismatchCount: 0,
      ok: true,
      target: { x: 0, y: 0 }
    });
  });

  it("aceita oclusao OBJ apenas no pixel e na cor comprovados do objeto a frente", () => {
    const red = [...decodeRgb555(0x001F), 255];
    const blue = [...decodeRgb555(0x7C00), 255];
    const source = Uint8Array.from([...red, ...red]);
    const framebuffer = Uint8Array.from([...red, ...blue]);
    const allowedOcclusionPixels = new Set([`1:${blue.slice(0, 3).join(",")}`]);
    expect(auditOpaqueRgbaAgainstFramebufferRegion({
      allowedOcclusionPixels,
      framebuffer,
      framebufferHeight: 1,
      framebufferWidth: 2,
      frameHeight: 1,
      frameWidth: 2,
      sourcePixels: source,
      sourceSheetWidth: 2,
      targetX: 0,
      targetY: 0
    })).toMatchObject({ comparedPixelCount: 1, occludedPixelCount: 1, mismatchCount: 0, ok: true });
    framebuffer.set([...decodeRgb555(0x03E0), 255], 4);
    expect(auditOpaqueRgbaAgainstFramebufferRegion({
      allowedOcclusionPixels,
      framebuffer,
      framebufferHeight: 1,
      framebufferWidth: 2,
      frameHeight: 1,
      frameWidth: 2,
      sourcePixels: source,
      sourceSheetWidth: 2,
      targetX: 0,
      targetY: 0
    })).toMatchObject({ mismatchCount: 1, ok: false });
  });

  it("excludes compiled background colors that occlude otherwise exact sprite pixels", () => {
    const red = [...decodeRgb555(0x001F), 255];
    const blue = [...decodeRgb555(0x7C00), 255];
    expect(auditOpaqueRgbaAgainstFramebufferRegion({
      allowedOcclusionRgb555: [0x7C00],
      framebuffer: Uint8Array.from([...red, ...blue]),
      framebufferHeight: 1,
      framebufferWidth: 2,
      frameHeight: 1,
      frameWidth: 2,
      sourcePixels: Uint8Array.from([...red, ...red]),
      sourceSheetWidth: 2,
      targetX: 0,
      targetY: 0
    })).toMatchObject({
      comparedPixelCount: 1,
      mismatchCount: 0,
      occludedPixelCount: 1,
      ok: true
    });
  });

  it("prefere evidencia visivel quando outro candidato esta totalmente ocluido", () => {
    const red = [...decodeRgb555(0x001F), 255];
    const blue = [...decodeRgb555(0x7C00), 255];
    const green = [...decodeRgb555(0x03E0), 255];
    expect(findBestOpaqueRgbaFramebufferFrame({
      allowedOcclusionRgb555: [0x7C00],
      candidateFlipsX: [false],
      candidateSourceXs: [0],
      candidateTargets: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      framebuffer: Uint8Array.from([...blue, ...green]),
      framebufferHeight: 1,
      framebufferWidth: 2,
      frameHeight: 1,
      frameWidth: 1,
      sourcePixels: Uint8Array.from(red),
      sourceSheetWidth: 1
    })).toMatchObject({
      comparedPixelCount: 1,
      mismatchCount: 1,
      occludedPixelCount: 0,
      ok: false,
      target: { x: 1, y: 0 }
    });
  });

  it("compares only the visible opaque pixels when a sprite is clipped by the viewport", () => {
    const red = [...decodeRgb555(0x001F), 255];
    const source = Uint8Array.from([...red, ...red, ...red, ...red]);
    const framebuffer = Uint8Array.from([...red, ...red]);

    expect(auditOpaqueRgbaAgainstFramebufferRegion({
      framebuffer,
      framebufferHeight: 1,
      framebufferWidth: 2,
      frameHeight: 2,
      frameWidth: 2,
      sourcePixels: source,
      sourceSheetWidth: 2,
      targetX: 0,
      targetY: 0
    })).toMatchObject({
      comparedPixelCount: 2,
      mismatchCount: 0,
      ok: true
    });
  });

  it("accepts palette zero when the exported RGB555 color survives in the framebuffer", () => {
    expect(auditRgb555FramebufferColor({
      colorHistogram: [
        { count: 27_190, rgb: [255, 239, 198] },
        { count: 6_410, rgb: [8, 16, 41] }
      ],
      expectedRgb555: 0x63BF,
      framebufferPixelCount: 38_400,
      minimumPixelRatio: 0.5
    })).toMatchObject({
      ok: true,
      actualCount: 27_190,
      actualRatio: 27_190 / 38_400,
      expectedRgb: [255, 239, 198]
    });
  });

  it("rejects a black backdrop that replaced the exported palette zero", () => {
    expect(auditRgb555FramebufferColor({
      colorHistogram: [
        { count: 27_190, rgb: [0, 0, 0] },
        { count: 6_410, rgb: [8, 16, 41] }
      ],
      expectedRgb555: 0x63BF,
      framebufferPixelCount: 38_400,
      minimumPixelRatio: 0.5
    })).toMatchObject({
      ok: false,
      actualCount: 0,
      expectedRgb: [255, 239, 198]
    });
  });

  it("proves that every framebuffer pixel keeps an exact exported RGB555 color", () => {
    expect(auditRgb555FramebufferPalette({
      colorHistogram: [
        { count: 20_000, rgb: [255, 239, 198] },
        { count: 12_000, rgb: [8, 16, 41] },
        { count: 6_400, rgb: [0, 0, 0] }
      ],
      expectedRgb555: [0x63BF, 0x1441, 0x0000],
      framebufferPixelCount: 38_400,
      minimumPixelRatio: 1
    })).toMatchObject({
      ok: true,
      actualCount: 38_400,
      actualRatio: 1,
      unexpectedColors: []
    });
  });

  it("reports a framebuffer color that cannot come from the exported RGB555 palettes", () => {
    expect(auditRgb555FramebufferPalette({
      colorHistogram: [
        { count: 38_000, rgb: [255, 239, 198] },
        { count: 400, rgb: [250, 230, 190] }
      ],
      expectedRgb555: [0x63BF],
      framebufferPixelCount: 38_400,
      minimumPixelRatio: 1
    })).toMatchObject({
      ok: false,
      actualCount: 38_000,
      unexpectedColors: [{ count: 400, rgb: [250, 230, 190] }]
    });
  });
});
