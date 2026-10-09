import { describe, expect, it } from "vitest";

import {
  affineMatrixForScenePresentation,
  normalizeAffineScenePresentation
} from "./affineScene.js";
import { exportAffineScenePresentation } from "./advancedVideoComposition.js";
import { resolveSceneRuntimePreviewProfile } from "./sceneRuntimeExport.js";
import { sceneTypeCapabilities } from "./sceneFeatureModules.js";

describe("affine scene export capability", () => {
  it("oferece affine opcional sem alterar os módulos de gameplay", () => {
    expect(sceneTypeCapabilities("platformer").runtimeCapabilities).toContain("affine_background_optional");
    expect(sceneTypeCapabilities("platformer").featureModules).not.toContain("affine");
    expect(resolveSceneRuntimePreviewProfile("battleRpg").capabilities).toContain("affine_background_preview");
  });

  it("não exporta affine quando a cena está desligada", () => {
    expect(exportAffineScenePresentation(
      normalizeAffineScenePresentation({ enabled: false }),
      () => "floor_affine"
    )).toBeNull();
  });

  it("converte a configuração autoral para o contrato nativo", () => {
    const presentation = normalizeAffineScenePresentation({
      enabled: true,
      assetId: "floor.affine.png",
      layer: "BG3",
      scaleX: 2,
      scaleY: 1,
      rotationDegrees: 90,
      pivotX: 120,
      pivotY: 80,
      wrap: false
    });
    const matrix = affineMatrixForScenePresentation(presentation);

    expect(exportAffineScenePresentation(presentation, (assetId) => `symbol_${assetId}`)).toEqual({
      asset: "symbol_floor.affine.png",
      layer: "BG3",
      wrap: false,
      pa: matrix.pa,
      pb: matrix.pb,
      pc: matrix.pc,
      pd: matrix.pd,
      reference_x_8: matrix.referenceX8,
      reference_y_8: matrix.referenceY8
    });
  });
});
