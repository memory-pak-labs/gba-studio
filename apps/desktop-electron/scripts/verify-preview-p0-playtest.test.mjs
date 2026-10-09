import { describe, expect, it } from "vitest";

import {
  applyPreviewP0VisualEvidence,
  validatePreviewP0VisualEvidence
} from "./verify-preview-p0-playtest.mjs";

const baseEvidence = {
  ok: true,
  previewPackageGenerated: true,
  previewPlaytestVerified: false,
  target: "electron_p0_functional",
  destination: "/tmp/web-preview",
  source: {
    id: "electron-p0-technical-fixture",
    role: "technical-contract-fixture"
  },
  files: {
    index: "/tmp/web-preview/index.html",
    playerEntry: "/tmp/web-preview/player/gbastudio-player.js",
    rom: "/tmp/web-preview/roms/electron_p0_functional.gba"
  },
  romCopied: true,
  runtimeComplete: true,
  missingRuntimeFiles: [],
  expectedRuntime: {
    core: "gba",
    romPath: "roms/electron_p0_functional.gba",
    playerPath: "player/gbastudio-player.js"
  }
};

const visualResult = {
  domReady: true,
  gameContainerFound: true,
  playerConfigFound: true,
  playerDomMounted: true,
  runtimeStarted: true,
  expectedCore: "gba",
  expectedRomPath: "roms/electron_p0_functional.gba",
  expectedPlayerPath: "player/gbastudio-player.js",
  screenshotPath: "/tmp/web-preview/preview-visual.png",
  screenshotBytes: 120_000,
  renderedText: "Electron P0 Functional ROM esperada: roms/electron_p0_functional.gba"
};

describe("verify-preview-p0-playtest", () => {
  it("accepts Electron visual evidence for the generated P0 Web preview package", () => {
    const validation = validatePreviewP0VisualEvidence(baseEvidence, visualResult);
    const updated = applyPreviewP0VisualEvidence(baseEvidence, visualResult);

    expect(validation).toEqual({ ok: true, failures: [] });
    expect(updated.previewPlaytestVerified).toBe(true);
    expect(updated.visualPreviewSmokePassed).toBe(true);
    expect(updated.visualEvidence.screenshotPath).toBe(visualResult.screenshotPath);
    expect(updated.visualEvidenceSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects visual evidence when the browser did not mount the player DOM", () => {
    const validation = validatePreviewP0VisualEvidence(baseEvidence, {
      ...visualResult,
      playerDomMounted: false
    });

    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain("O player do preview nao montou elementos no DOM.");
  });

  it("rejects visual evidence when the player did not start the GBA runtime", () => {
    const validation = validatePreviewP0VisualEvidence(baseEvidence, {
      ...visualResult,
      runtimeStarted: false
    });

    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain("O runtime GBA nao iniciou apos a acao Jogar.");
  });

  it("rejects visual evidence when the generated package has no real P0 ROM", () => {
    const validation = validatePreviewP0VisualEvidence({
      ...baseEvidence,
      romCopied: false,
      files: { ...baseEvidence.files, rom: undefined }
    }, visualResult);

    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain("O pacote de preview precisa conter a ROM técnica P0 real.");
  });

  it("rejects tiny or missing screenshots", () => {
    const validation = validatePreviewP0VisualEvidence(baseEvidence, {
      ...visualResult,
      screenshotBytes: 400
    });

    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain("O screenshot visual do preview esta ausente ou pequeno demais.");
  });
});
