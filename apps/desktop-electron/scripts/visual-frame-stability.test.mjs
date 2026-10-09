import { describe, expect, it } from "vitest";

import { auditTemporalVisualStability } from "./visual-frame-stability.mjs";

function sample(index, overrides = {}) {
  const defaultRegion = {
    dominantColorRatio: 0.7,
    meaningful: true,
    nonBlackRatio: 0.8,
    pixelCount: 240 * 112,
    uniqueColorCount: 12
  };
  return {
    frame: {
      dominantColorRatio: 0.7,
      meaningful: true,
      nonBlackRatio: 0.8,
      pixelCount: 240 * 160,
      uniqueColorCount: 12,
      ...overrides.frame
    },
    regions: {
      background: { ...defaultRegion, ...overrides.regions?.background },
      hudTop: { ...defaultRegion, ...overrides.regions?.hudTop, pixelCount: 240 * 48 },
      hudBottom: { ...defaultRegion, ...overrides.regions?.hudBottom, pixelCount: 240 * 48 },
      dialogue: { ...defaultRegion, ...overrides.regions?.dialogue, pixelCount: 240 * 48 },
      titleMenu: { ...defaultRegion, ...overrides.regions?.titleMenu, pixelCount: 240 * 160 },
      menu: { ...defaultRegion, ...overrides.regions?.menu, pixelCount: 240 * 160 },
      actors: overrides.regions?.actors ?? [{ ...defaultRegion, pixelCount: 32 * 32 }]
    },
    runtime: {
      actorCount: 1,
      firstActor: { visible: true },
      frame: index,
      ...overrides.runtime
    }
  };
}

describe("estabilidade temporal do framebuffer", () => {
  it("detecta um frame vazio transitório no background", () => {
    const samples = [
      sample(10),
      sample(11, { frame: { meaningful: false, nonBlackRatio: 0, uniqueColorCount: 1 } }),
      sample(12)
    ];

    expect(auditTemporalVisualStability(samples)).toMatchObject({
      background: {
        ok: false,
        transientBlankFrames: [1]
      },
      frame: {
        ok: false,
        transientBlankFrames: [1]
      },
      ok: false
    });
  });

  it("detecta o desaparecimento transitório de um ator", () => {
    const samples = [
      sample(20),
      sample(21, { runtime: { actorCount: 0, firstActor: { visible: false } } }),
      sample(22)
    ];

    expect(auditTemporalVisualStability(samples)).toMatchObject({
      actors: {
        ok: false,
        transientDisappearanceFrames: [1]
      },
      ok: false
    });
  });

  it("detecta o apagão transitório da região de pixels de um ator", () => {
    const samples = [
      sample(23),
      sample(24, {
        regions: {
          actors: [{ meaningful: false, nonBlackRatio: 0, uniqueColorCount: 1, dominantColorRatio: 1 }]
        }
      }),
      sample(25)
    ];

    expect(auditTemporalVisualStability(samples)).toMatchObject({
      actors: {
        audited: true,
        ok: false,
        transientBlankFrames: [1]
      },
      ok: false
    });
    expect(auditTemporalVisualStability(samples).issues).toContain(
      "A região visual dos atores ficou vazia entre frames válidos: 1."
    );
  });

  it("detecta o apagão transitório de uma região sem apagar o restante do framebuffer", () => {
    const samples = [
      sample(24),
      sample(25, {
        regions: {
          background: { meaningful: false, nonBlackRatio: 0, uniqueColorCount: 1, dominantColorRatio: 1 }
        }
      }),
      sample(26)
    ];

    expect(auditTemporalVisualStability(samples)).toMatchObject({
      background: {
        ok: false,
        transientBlankFrames: [1]
      },
      ok: false
    });
    expect(auditTemporalVisualStability(samples).issues).toContain(
      "A camada de cenário ficou vazia entre frames válidos: 1."
    );
  });

  it("aceita animação válida do background e dos atores", () => {
    const samples = [
      sample(30, { frame: { uniqueColorCount: 12 } }),
      sample(31, { frame: { uniqueColorCount: 14 } }),
      sample(32, { frame: { uniqueColorCount: 13 } }),
      sample(33, { frame: { uniqueColorCount: 15 } })
    ];

    expect(auditTemporalVisualStability(samples)).toMatchObject({
      actors: { ok: true },
      background: { ok: true },
      frame: { ok: true },
      ok: true
    });
  });

  it("detecta uma assinatura de cenário que muda por um único frame e retorna", () => {
    const samples = [
      sample(40, { regions: { background: { signature: "surface-a" } } }),
      sample(41, { regions: { background: { signature: "surface-b" } } }),
      sample(42, { regions: { background: { signature: "surface-a" } } })
    ];

    expect(auditTemporalVisualStability(samples, { enforceSignatureContinuity: true })).toMatchObject({
      background: {
        ok: false,
        transientSignatureFrames: [1]
      },
      ok: false
    });
  });
});
