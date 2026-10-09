import { describe, expect, it } from "vitest";

import { buildRacingPseudo3dPreviewModel } from "./racingPseudo3dPreview.js";
import { normalizeRacingSceneConfig } from "./sceneTypeProfiles.js";

describe("buildRacingPseudo3dPreviewModel", () => {
  it("compõe a câmera GBA em camadas e bandas de profundidade", () => {
    const model = buildRacingPseudo3dPreviewModel(
      normalizeRacingSceneConfig({
        presentation: "pseudo3d",
        showMinimap: true,
        pseudo3dVisuals: {
          horizonY: 48,
          panoramaBackgroundId: "circuit-sky.png",
          floorTilemapId: "circuit-floor.png",
          minimapAssetId: "circuit-minimap.png"
        }
      }),
      {
        floorURL: "asset://floor",
        minimapURL: "asset://minimap",
        panoramaURL: "asset://sky",
        playerURL: "asset://nara",
        rivalURL: "asset://rival"
      }
    );

    expect(model).toMatchObject({
      logicalWidth: 240,
      logicalHeight: 160,
      horizonY: 48,
      layers: ["panorama", "affine-floor", "racing-hud", "racer-player", "racer-rival"],
      technicalMapAvailable: true
    });
    expect(model.perspectiveBands).toHaveLength(14);
    expect(model.perspectiveBands[0]).toMatchObject({ top: 48 });
    expect(model.perspectiveBands.at(-1)).toMatchObject({ bottom: 160 });
    expect(model.perspectiveBands[0]!.scale).toBeLessThan(model.perspectiveBands.at(-1)!.scale);
  });

  it("não oferece mapa técnico sem o asset de chão", () => {
    const model = buildRacingPseudo3dPreviewModel(
      normalizeRacingSceneConfig({ presentation: "pseudo3d" }),
      { floorURL: null, minimapURL: null, panoramaURL: null, playerURL: null, rivalURL: null }
    );

    expect(model.technicalMapAvailable).toBe(false);
    expect(model.minimapVisible).toBe(false);
  });
});
