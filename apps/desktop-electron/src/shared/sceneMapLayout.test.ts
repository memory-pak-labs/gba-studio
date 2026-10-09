import { describe, expect, it } from "vitest";
import {
  clientPointToSceneMapWorld,
  defaultSceneMapPosition,
  deriveSceneMapCardDragPosition,
  deriveSceneMapCardDragTransform,
  displayedSceneMapCardSize,
  displayedSceneMapContentSize,
  displayedSceneMapPosition,
  fitSceneMapViewToCards,
  integerNearestNeighborPreviewFit,
  organizedSceneMapPositions,
  roomTilemapPreviewSignature,
  sceneMapCardChromeSize,
  sceneMapCardSize,
  sceneMapContentSize,
  sceneMapTileGridBackgroundStyle
} from "./sceneMapLayout.js";

describe("scene map layout", () => {
  it("keeps a static isometric background at its authored pixel size", () => {
    expect(sceneMapCardSize({ width: 30, height: 20, sceneType: "isometric",
      gbStudioUseBackgroundLayout: true, backgroundPixelWidth: 240, backgroundPixelHeight: 160,
      runtime: { type: "isometric", config: { worldMode: "static_composition" } }
    })).toEqual({ width: 240, height: 250 });
  });
  it("represents the full scene and its relative size in overview cards", () => {
    expect(sceneMapCardSize({ width: 120, height: 20 })).toEqual({ width: 960, height: 250 });
    expect(displayedSceneMapContentSize({ width: 60, height: 40 }, 1)).toEqual({ width: 480, height: 320 });
    expect(sceneMapContentSize({ width: 60, height: 40 })).toEqual({ width: 480, height: 320 });
  });

  it("bounds huge maps without changing the scene or its aspect ratio", () => {
    const room = { width: 600, height: 100 };
    expect(sceneMapCardSize(room)).toEqual({ width: 960, height: 250 });
    expect(sceneMapContentSize(room)).toEqual({ width: 4800, height: 800 });
    expect(displayedSceneMapContentSize(room, 1.25)).toEqual({ width: 1200, height: 200 });
  });

  it("uses the authored isometric surface instead of the logical tile grid", () => {
    expect(sceneMapCardSize({
      width: 25, height: 25, sceneType: "isometric",
      runtime: { type: "isometric", config: { pagedSurface: {
        backgroundAsset: "market.png", foregroundAsset: "market-front.png", width: 512, height: 344
      } } }
    })).toEqual({ width: 512, height: 434 });
  });
  it("scales scene content by GBA screen units", () => {
    expect(sceneMapContentSize({ width: 30, height: 20 })).toEqual({ width: 240, height: 160 });
    expect(sceneMapContentSize({ width: 60, height: 20 })).toEqual({ width: 480, height: 160 });
    expect(sceneMapContentSize({ width: 30, height: 40 })).toEqual({ width: 240, height: 320 });
  });

  it("inclui camadas autoradas na assinatura do preview", () => {
    const base = roomTilemapPreviewSignature("market", 40, 30, "market.png", [1, 2]);
    const withForeground = roomTilemapPreviewSignature("market", 40, 30, "market.png", [1, 2], ["BG1", [3, 4]]);

    expect(withForeground).not.toBe(base);
  });

  it("mantém cenas menores legíveis no mapa com o tamanho mínimo de um viewport GBA", () => {
    expect(sceneMapContentSize({ sceneType: "isometric", width: 12, height: 8 })).toEqual({ width: 240, height: 160 });
  });

  it("fits an isometric framebuffer without stretching it across the scene card", () => {
    expect(integerNearestNeighborPreviewFit(
      { width: 800, height: 400 },
      { width: 240, height: 160 }
    )).toEqual({
      divisor: 4,
      height: 100,
      width: 200
    });

    expect(integerNearestNeighborPreviewFit(
      { width: 240, height: 160 },
      { width: 240, height: 160 }
    )).toEqual({
      divisor: 1,
      height: 160,
      width: 240
    });
  });

  it("keeps preview aspect ratio with integer nearest-neighbor scaling", () => {
    expect(integerNearestNeighborPreviewFit(
      { width: 239, height: 158 },
      { width: 120, height: 120 }
    )).toEqual({
      divisor: 2,
      height: 79,
      width: 119
    });
  });

  it.each([80, 161, 255])("preserves the full logical width of a %sx18 imported scene", (width) => {
    expect(sceneMapContentSize({ width, height: 18 })).toEqual({
      width: width * 8,
      height: 144
    });
  });

  it("scales card chrome with the map and removes the footer at mini density", () => {
    expect(displayedSceneMapContentSize({ width: 30, height: 20 }, 3.5)).toEqual({ width: 840, height: 560 });
    expect(displayedSceneMapCardSize({ width: 30, height: 20 }, 3.5)).toEqual({ width: 840, height: 650 });
    expect(sceneMapCardChromeSize(0.5)).toEqual({ footerHeight: 0, headerHeight: 36.86 });
    expect(displayedSceneMapCardSize({ width: 30, height: 20 }, 0.5)).toEqual({ width: 120, height: 116.86 });
    expect(displayedSceneMapPosition({ x: 36, y: 48 }, 3)).toEqual({ x: 108, y: 144 });
  });

  it("places default cards in four non-overlapping columns", () => {
    const rooms = [
      { width: 30, height: 20 },
      { width: 30, height: 20 },
      { width: 60, height: 20 },
      { width: 30, height: 40 }
    ];

    expect(defaultSceneMapPosition(0, rooms)).toEqual({ x: 36, y: 36 });
    expect(defaultSceneMapPosition(1, rooms)).toEqual({ x: 324, y: 36 });
    expect(defaultSceneMapPosition(2, rooms)).toEqual({ x: 612, y: 36 });
    expect(defaultSceneMapPosition(3, rooms)).toEqual({ x: 1140, y: 36 });
  });

  it("organizes cards by order and reserves the full height of each row", () => {
    expect(organizedSceneMapPositions([
      { name: "logo", width: 30, height: 20 },
      { name: "wide", width: 60, height: 40 },
      { name: "menu", width: 30, height: 20 },
      { name: "next", width: 30, height: 20 },
      { name: "after", width: 30, height: 20 }
    ])).toEqual({
      logo: { x: 36, y: 36 },
      wide: { x: 324, y: 36 },
      menu: { x: 852, y: 36 },
      next: { x: 1140, y: 36 },
      after: { x: 36, y: 498 }
    });
  });

  it("derives scene map card drag positions in world units", () => {
    expect(deriveSceneMapCardDragPosition({
      canvasZoom: 1,
      clientX: 140,
      clientY: 120,
      startPosition: { x: 36, y: 36 },
      startX: 50,
      startY: 50
    })).toEqual({ x: 126, y: 106 });
  });

  it("derives scene map card drag transforms in world units", () => {
    expect(deriveSceneMapCardDragTransform({
      nextPosition: { x: 126, y: 106 },
      startPosition: { x: 36, y: 36 }
    })).toEqual({ x: 90, y: 70 });
  });

  it("converts client points to scene map world coordinates", () => {
    expect(clientPointToSceneMapWorld({
      clientX: 180,
      clientY: 140,
      scrollLeft: 120,
      scrollTop: 80,
      viewportLeft: 40,
      viewportTop: 20,
      zoom: 2
    })).toEqual({ x: 130, y: 100 });
  });

  it("fits the scene map viewport around card bounds with padding", () => {
    const room = { width: 30, height: 20 };
    const size = sceneMapCardSize(room);
    expect(fitSceneMapViewToCards({
      cards: [{
        position: { x: 100, y: 80 },
        size
      }],
      padding: 40,
      viewportHeight: 400,
      viewportWidth: 600
    })).toEqual({
      scrollLeft: 73,
      scrollTop: 48,
      zoom: 1.2121212121212122
    });
  });

  it("keeps scene map drag positions independent of zoom", () => {
    const startPosition = { x: 36, y: 36 };
    const atZoomOne = deriveSceneMapCardDragPosition({
      canvasZoom: 1,
      clientX: 140,
      clientY: 120,
      startPosition,
      startX: 50,
      startY: 50
    });
    const atZoomTwo = deriveSceneMapCardDragPosition({
      canvasZoom: 2,
      clientX: 230,
      clientY: 190,
      startPosition,
      startX: 50,
      startY: 50
    });
    expect(atZoomOne).toEqual(atZoomTwo);
  });

  it("sizes readonly tile grid backgrounds per room cell", () => {
    expect(sceneMapTileGridBackgroundStyle(240, 160, 30, 20)).toEqual({
      backgroundImage: [
        "linear-gradient(rgba(176, 188, 203, 0.45) 1px, transparent 1px)",
        "linear-gradient(90deg, rgba(176, 188, 203, 0.45) 1px, transparent 1px)"
      ].join(", "),
      backgroundSize: "8px 8px"
    });
  });

  it("changes tilemap preview signature when a painted cell changes", () => {
    const before = roomTilemapPreviewSignature("room-2", 30, 20, "tiles.png", [0, 1, 0]);
    const after = roomTilemapPreviewSignature("room-2", 30, 20, "tiles.png", [0, 2, 0]);
    expect(after).not.toBe(before);
  });
});
