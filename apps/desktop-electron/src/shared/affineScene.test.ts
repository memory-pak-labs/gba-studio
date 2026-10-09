import { describe, expect, it } from "vitest";

import {
  affineMatrixForScenePresentation,
  normalizeAffineScenePresentation
} from "./affineScene.js";

describe("affine scene presentation", () => {
  it("normaliza affine desligado sem asset nem reserva", () => {
    expect(normalizeAffineScenePresentation(undefined)).toEqual({
      enabled: false,
      assetId: "",
      layer: "BG2",
      scaleX: 1,
      scaleY: 1,
      rotationDegrees: 0,
      pivotX: 120,
      pivotY: 80,
      wrap: true,
      role: "decorative"
    });
  });

  it("limita valores autorais e calcula matriz 8.8", () => {
    const affine = normalizeAffineScenePresentation({
      enabled: true,
      assetId: "floor.affine.png",
      layer: "BG3",
      scaleX: 9,
      scaleY: 0.1,
      rotationDegrees: 270,
      pivotX: 120.8,
      pivotY: -4.2,
      wrap: false
    });

    expect(affine).toMatchObject({
      enabled: true,
      layer: "BG3",
      scaleX: 4,
      scaleY: 0.5,
      rotationDegrees: 180,
      pivotX: 121,
      pivotY: 0,
      wrap: false,
      role: "decorative"
    });
    expect(affineMatrixForScenePresentation(affine)).toEqual({
      pa: -64,
      pb: 0,
      pc: 0,
      pd: -512,
      referenceX8: 24128,
      referenceY8: 16384
    });
  });

  it("mantém o centro da fonte no pivô da viewport após quantizar a matriz", () => {
    const affine = normalizeAffineScenePresentation({
      enabled: true,
      assetId: "island.png",
      scaleX: 1.25,
      scaleY: 1.25,
      rotationDegrees: 12,
      pivotX: 120,
      pivotY: 80
    });

    expect(affineMatrixForScenePresentation(affine, { width: 128, height: 128 })).toEqual({
      pa: 200,
      pb: -43,
      pc: 43,
      pd: 200,
      referenceX8: -4176,
      referenceY8: -4776
    });
  });
});
