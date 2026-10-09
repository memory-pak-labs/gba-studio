import { describe, expect, it } from "vitest";

import {
  normalizeGBAAssetDocument,
  normalizeGBASceneDocument
} from "../../../../packages/project-contract/src/sceneDocument.js";

describe("shared scene and asset documents", () => {
  it("normalizes the common scene fields without changing the persisted room shape", () => {
    const room = {
      id: "room-map",
      name: "Mapa",
      sceneType: "shmup",
      width: 30,
      height: 20,
      backgroundAssetName: "map.png",
      backgroundRenderMode: "tilemap",
      tilemap: [1, 2, 3],
      tileLayers: [
        { mapping: "BG1", tilemap: [9, 8] },
        { mapping: "BG2", tilemap: [1, 2, 3] }
      ],
      collisionTypes: ["free", "solid"],
      hudPresetId: "hud-map-corners",
      runtime: { type: "shmup", config: { modules: [] } },
      eventBindings: { onInit: "boot" }
    };

    expect(normalizeGBASceneDocument(room)).toEqual({
      schema: "gba-scene/v1",
      id: "room-map",
      name: "Mapa",
      sceneType: "shmup",
      runtimeProfile: "shmup",
      paletteBankPolicy: "shared-ui",
      sizeTiles: { width: 30, height: 20 },
      viewport: { widthPx: 240, heightPx: 160, gridPx: 8 },
      background: {
        assetName: "map.png",
        renderMode: "tilemap"
      },
      tilemap: {
        base: [1, 2, 3],
        foreground: [9, 8]
      },
      collisionTypes: ["free", "solid"],
      hudPresetId: "hud-map-corners",
      music: null,
      eventBindings: { onInit: "boot" }
    });
    expect(room).toHaveProperty("tileLayers");
  });

  it("normalizes common asset metadata while preserving source and technical limits", () => {
    expect(normalizeGBAAssetDocument({
      id: "asset-bg",
      name: "map.png",
      kind: "Background",
      metadata: {
        source: "Assets/backgrounds/map.png",
        license: "Project-owned",
        role: "map-bg",
        sceneRoles: ["map-bg", "topdown-bg"],
        width: 240,
        height: 160,
        colorMode: "4bpp",
        tileCount: 480,
        paletteBankCount: 1
      }
    })).toEqual({
      schema: "gba-asset/v1",
      id: "asset-bg",
      name: "map.png",
      kind: "Background",
      source: "Assets/backgrounds/map.png",
      metadata: {
        license: "Project-owned",
        role: "map-bg",
        sceneRoles: ["map-bg", "topdown-bg"],
        width: 240,
        height: 160,
        colorMode: "4bpp",
        tileCount: 480,
        paletteBankCount: 1
      }
    });
  });

  it("normalizes the optional display name and campaign metadata", () => {
    expect(normalizeGBASceneDocument({
      id: "room-port",
      name: "port",
      displayName: "Jogo · Porto de Lúmen",
      campaign: {
        chapter: 2,
        title: "Capítulo 1 · Porto de Lúmen",
        objective: "Encontrar a estrutura.",
        nextScene: "route",
        completionVariable: "farolParts.frame",
        completedValue: 3,
        controls: "Direcional move.",
        success: "Rota aberta.",
        failureRecovery: "Tente novamente.",
        tutorialDialogue: "porto_intro"
      }
    })).toMatchObject({
      displayName: "Jogo · Porto de Lúmen",
      campaign: {
        chapter: 2,
        title: "Capítulo 1 · Porto de Lúmen",
        objective: "Encontrar a estrutura.",
        nextScene: "route",
        completionVariable: "farolParts.frame",
        completedValue: 3,
        controls: "Direcional move.",
        success: "Rota aberta.",
        failureRecovery: "Tente novamente.",
        tutorialDialogue: "porto_intro"
      }
    });
  });
});
