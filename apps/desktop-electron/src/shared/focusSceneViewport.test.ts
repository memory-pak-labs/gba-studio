import { describe, expect, it } from "vitest";

import {
  deriveFocusSceneCameraScroll,
  deriveFocusSceneActorScroll,
  deriveFocusSceneViewportGeometry,
  deriveIsometricCameraPositionForPlayer
} from "./focusSceneViewport.js";

describe("deriveFocusSceneViewportGeometry", () => {
  it("usa toda a área disponível no mapa sem impor a proporção do GBA", () => {
    const geometry = deriveFocusSceneViewportGeometry({
      availableHeight: 500, availableWidth: 1000, roomHeightTiles: 40, roomWidthTiles: 60,
      viewMode: "map", zoom: 0.5
    });
    expect(geometry.viewportWidth).toBe(1000);
    expect(geometry.viewportHeight).toBe(500);
    expect(geometry.worldWidth).toBe(750);
    expect(geometry.worldHeight).toBe(500);
    expect(geometry.hasOverflow).toBe(false);
    const cropped = deriveFocusSceneViewportGeometry({
      availableHeight: 500, availableWidth: 1000, roomHeightTiles: 40, roomWidthTiles: 60
    });
    expect(cropped.viewportWidth / cropped.viewportHeight).toBe(1.5);
    expect(cropped.hasOverflow).toBe(true);
  });
  it("preenche a area central com um viewport GBA 3:2 sem overflow para cenas 30x20", () => {
    expect(deriveFocusSceneViewportGeometry({
      availableHeight: 640,
      availableWidth: 960,
      roomHeightTiles: 20,
      roomWidthTiles: 30
    })).toEqual({
      hasOverflow: false,
      overflowX: false,
      overflowY: false,
      scale: 4,
      viewportHeight: 640,
      viewportWidth: 960,
      worldHeight: 640,
      worldWidth: 960
    });
  });

  it("ajusta o mundo completo sem encolher a janela de revisão", () => {
    const geometry = deriveFocusSceneViewportGeometry({
      availableHeight: 640, availableWidth: 960, zoom: 0.3,
      isometricSurfaceSize: { width: 800, height: 416 },
      projection: "isometric", roomWidthTiles: 25, roomHeightTiles: 25
    });
    expect(geometry.scale).toBeCloseTo(1.2);
    expect(geometry.viewportWidth).toBe(960);
    expect(geometry.viewportHeight).toBe(640);
    expect(geometry.worldWidth).toBeCloseTo(960);
    expect(geometry.worldHeight).toBeCloseTo(499.2);
    expect(geometry.hasOverflow).toBe(false);
  });

  it("amplia a cena sem aumentar o tamanho da janela visível", () => {
    const geometry = deriveFocusSceneViewportGeometry({
      availableHeight: 640, availableWidth: 960, zoom: 2,
      roomWidthTiles: 30, roomHeightTiles: 20
    });
    expect(geometry.scale).toBe(8);
    expect(geometry.worldWidth).toBe(1920);
    expect(geometry.viewportWidth).toBe(960);
    expect(geometry.hasOverflow).toBe(true);
  });

  it("mantem o viewport 240x160 e amplia o mundo rolavel para cenas maiores", () => {
    expect(deriveFocusSceneViewportGeometry({
      availableHeight: 640,
      availableWidth: 960,
      roomHeightTiles: 40,
      roomWidthTiles: 60
    })).toEqual({
      hasOverflow: true,
      overflowX: true,
      overflowY: true,
      scale: 4,
      viewportHeight: 640,
      viewportWidth: 960,
      worldHeight: 1280,
      worldWidth: 1920
    });
  });

  it("preserva a proporcao 3:2 quando a altura disponivel limita a escala", () => {
    expect(deriveFocusSceneViewportGeometry({
      availableHeight: 500,
      availableWidth: 960,
      roomHeightTiles: 20,
      roomWidthTiles: 60
    })).toEqual({
      hasOverflow: true,
      overflowX: true,
      overflowY: false,
      scale: 3.125,
      viewportHeight: 500,
      viewportWidth: 750,
      worldHeight: 500,
      worldWidth: 1500
    });
  });

  it("calcula o mundo projetado de uma cena isometrica sem reduzir 32x16 a tiles ortogonais", () => {
    expect(deriveFocusSceneViewportGeometry({
      availableHeight: 640,
      availableWidth: 960,
      atlasTileHeight: 32,
      isometricConfig: {
        heightStep: 8,
        originX: 120,
        originY: 16,
        presentationZoom: 100,
        tileHeight: 16,
        tileWidth: 32
      },
      projection: "isometric",
      roomHeightTiles: 30,
      roomWidthTiles: 40
    })).toEqual({
      hasOverflow: true,
      overflowX: true,
      overflowY: true,
      scale: 4,
      viewportHeight: 640,
      viewportWidth: 960,
      worldHeight: 2304,
      worldWidth: 4480
    });
  });

  it("mantém o viewport GBA em escala completa e torna a composição estática rolável", () => {
    expect(deriveFocusSceneViewportGeometry({
      availableHeight: 640,
      availableWidth: 960,
      isometricConfig: {
        heightStep: 8,
        originX: 120,
        originY: 24,
        presentationZoom: 100,
        tileHeight: 16,
        tileWidth: 32
      },
      isometricSurfaceSize: { height: 320, width: 480 },
      projection: "isometric",
      roomHeightTiles: 8,
      roomWidthTiles: 12
    })).toEqual({
      hasOverflow: true,
      overflowX: true,
      overflowY: true,
      scale: 4,
      viewportHeight: 640,
      viewportWidth: 960,
      worldHeight: 1280,
      worldWidth: 1920
    });
  });
});

describe("deriveFocusSceneActorScroll", () => {
  it("centraliza o conjunto de atores no viewport e respeita os limites do mundo", () => {
    expect(deriveFocusSceneActorScroll({
      actorBounds: { bottom: 242, left: 184, right: 671, top: -2 },
      currentScrollLeft: 406,
      currentScrollTop: 271,
      maxScrollLeft: 812,
      maxScrollTop: 542,
      viewportHeight: 541,
      viewportLeft: 327,
      viewportTop: 169,
      viewportWidth: 812
    })).toEqual({ scrollLeft: 101, scrollTop: 0 });
  });

  it("mantém a posição atual quando não há atores ou viewport mensurável", () => {
    expect(deriveFocusSceneActorScroll({
      actorBounds: null,
      currentScrollLeft: 12,
      currentScrollTop: 18,
      maxScrollLeft: 100,
      maxScrollTop: 80,
      viewportHeight: 541,
      viewportLeft: 0,
      viewportTop: 0,
      viewportWidth: 812
    })).toEqual({ scrollLeft: 12, scrollTop: 18 });
  });
});

describe("deriveIsometricCameraPositionForPlayer", () => {
  it("replica a zona de camera do Play para o jogador isometrico", () => {
    expect(deriveIsometricCameraPositionForPlayer({
      config: {
        heightStep: 8,
        originX: 120,
        originY: 24,
        presentationZoom: 100,
        tileHeight: 16,
        tileWidth: 32
      },
      player: { x: 19, y: 18, z: 0 },
      zones: [{
        area: { height: 19, width: 24, x: 8, y: 6 },
        bounds: { height: 392, width: 720, x: -168, y: 112 },
        id: "market-main",
        lockX: false,
        lockY: false,
        offset: { x: 0, y: 0 }
      }]
    })).toEqual({ cameraX: 40, cameraY: 232, zoneID: "market-main" });
  });

  it("mantem a camera sem zona quando o jogador nao esta em uma zona", () => {
    expect(deriveIsometricCameraPositionForPlayer({
      config: {
        heightStep: 8,
        originX: 120,
        originY: 24,
        presentationZoom: 100,
        tileHeight: 16,
        tileWidth: 32
      },
      player: { x: 2, y: 2, z: 0 },
      zones: [{
        area: { height: 2, width: 2, x: 8, y: 6 },
        bounds: { height: 160, width: 240, x: 0, y: 0 },
        id: "outside",
        lockX: false,
        lockY: false,
        offset: { x: 0, y: 0 }
      }]
    })).toBeNull();
  });
});

describe("deriveFocusSceneCameraScroll", () => {
  it("converte a camera do Play para o espaco escalado do Editor", () => {
    expect(deriveFocusSceneCameraScroll({
      cameraX: 40,
      cameraY: 232,
      maxScrollLeft: 3520,
      maxScrollTop: 1664,
      projectionOffset: { x: -360, y: 24 },
      scale: 4
    })).toEqual({ scrollLeft: 1600, scrollTop: 832 });
  });
});
