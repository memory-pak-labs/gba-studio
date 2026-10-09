import { describe, expect, it } from "vitest";

import { auditIsometricPreviewStability } from "./isometric-preview-stability.mjs";

function sample(index, overrides = {}) {
  return {
    rasterBitmap: { height: 115, width: 224 },
    hasRasterContent: true,
    hasPreviewLayer: true,
    layer: { height: 115, width: 224 },
    nonTransparentPixelCount: 12_185,
    projection: "isometric-contain",
    signature: "mercado-suspenso",
    frame: index,
    ...overrides
  };
}

describe("estabilidade temporal do card isométrico", () => {
  it("aceita um card não vazio com geometria e imagem estáveis", () => {
    expect(auditIsometricPreviewStability([sample(1), sample(2), sample(3)])).toMatchObject({
      image: { changedFrames: [], transientFrames: [] },
      geometry: { changedFrames: [], transientFrames: [] },
      invalidFrames: [],
      ok: true,
      sampleCount: 3
    });
  });

  it("detecta um frame transparente entre duas imagens válidas", () => {
    const result = auditIsometricPreviewStability([
      sample(1),
      sample(2, { hasRasterContent: false, hasPreviewLayer: false, nonTransparentPixelCount: 0 }),
      sample(3)
    ]);

    expect(result).toMatchObject({ ok: false, invalidFrames: [1], transientBlankFrames: [1] });
  });

  it("detecta uma troca de assinatura ou geometria que retorna no frame seguinte", () => {
    const result = auditIsometricPreviewStability([
      sample(1),
      sample(2, {
        rasterBitmap: { height: 120, width: 224 },
        layer: { height: 120, width: 224 },
        signature: "flicker"
      }),
      sample(3)
    ]);

    expect(result).toMatchObject({
      geometry: { transientFrames: [1] },
      image: { transientFrames: [1] },
      ok: false
    });
  });

  it("aceita amostragem do fundo em camadas de imagem sem canvas DOM", () => {
    const samples = [sample(1), sample(2), sample(3)].map((entry) => ({
      ...entry,
      backgroundLayout: true,
      hasCanvas: false,
      projection: "fill",
      rasterSource: "image-layers"
    }));

    expect(auditIsometricPreviewStability(samples)).toMatchObject({ ok: true, invalidFrames: [] });
  });

  it("não aceita preencher o card isométrico quando a cena não usa layout em camadas", () => {
    const result = auditIsometricPreviewStability([
      sample(1, { projection: "fill" }),
      sample(2, { projection: "fill" }),
      sample(3, { projection: "fill" })
    ]);

    expect(result).toMatchObject({ ok: false, invalidFrames: [0, 1, 2] });
  });
});
