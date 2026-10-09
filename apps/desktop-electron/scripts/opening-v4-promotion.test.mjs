import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { promoteApprovedOpeningV4, OPENING_V4_BACKGROUND } from "./opening-v4-promotion.mjs";
import { promoteApprovedOpeningV3 } from "./opening-v3-promotion.mjs";
import { promoteApprovedOpeningV2 } from "./opening-v2-promotion.mjs";

const projectURL = new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url);
const preparedURL = new URL("../fixtures/asset-provenance/opening-v4-per-tile-14-banks.png", import.meta.url);
const palettePlanURL = new URL("../fixtures/asset-provenance/opening-v4-palette-reference-plan.json", import.meta.url);
const canonicalURL = new URL(`../default-assets/templates/exemplo-gba/Assets/backgrounds/${OPENING_V4_BACKGROUND.name}`, import.meta.url);

describe("opening-v4 promotion", () => {
  it("troca somente o fundo aprovado e mantém quadros, atores e eventos", () => {
    const canonical = JSON.parse(readFileSync(projectURL, "utf8"));
    const v2 = promoteApprovedOpeningV2(canonical);
    const source = promoteApprovedOpeningV3(v2);
    const promoted = promoteApprovedOpeningV4(source);
    const before = source.rooms.find((room) => room.name === "abertura");
    const after = promoted.rooms.find((room) => room.name === "abertura");
    const asset = promoted.assets.find((item) => item.id === "opening-v4-background");

    expect(after.backgroundAssetName).toBe(OPENING_V4_BACKGROUND.name);
    expect(after.runtime.config.steps.map((step) => step.backgroundAssetName))
      .toEqual(before.runtime.config.steps.map((step) =>
        step.backgroundAssetName ? OPENING_V4_BACKGROUND.name : undefined));
    expect(after.runtime.config.steps.map(({ backgroundAssetName, ...step }) => step))
      .toEqual(before.runtime.config.steps.map(({ backgroundAssetName, ...step }) => step));
    expect(promoted.scenas.find((room) => room.name === "abertura")).toEqual(after);
    expect(promoted.actors).toEqual(source.actors);
    expect(promoted.animations).toEqual(source.animations);
    expect(promoted.animationStates).toEqual(source.animationStates);
    expect(promoted.events).toEqual(source.events);
    expect(promoted.rooms.filter((room) => room.name !== "abertura"))
      .toEqual(source.rooms.filter((room) => room.name !== "abertura"));
    expect(promoted.assets).toHaveLength(canonical.assets.length);
    expect(promoted.assets.some((item) => item.id === "opening-v2-background")).toBe(false);
    expect(promoted.assets.some((item) => item.id === "opening-v3-background")).toBe(false);
    expect(asset?.metadata).toMatchObject({
      source: `Assets/backgrounds/${OPENING_V4_BACKGROUND.name}`,
      preparedSha256: OPENING_V4_BACKGROUND.sha256,
      reviewStatus: "approved",
      visualStatus: "approved",
      candidateStatus: "canonical-integrated",
      backgroundPaletteBankBudget: 14,
      paletteBankCount: 14,
      backgroundPaletteReferencePlan: {
        banks: expect.arrayContaining([expect.any(Array)]),
        tile_palette_banks: expect.any(Array)
      }
    });
    expect(asset.metadata.backgroundPaletteReferencePlan.banks).toHaveLength(14);
    expect(asset.metadata.backgroundPaletteReferencePlan.tile_palette_banks).toHaveLength(600);
    expect(asset.metadata.backgroundPaletteReferencePlan).toEqual(JSON.parse(readFileSync(palettePlanURL, "utf8")));
    expect(canonical.assets.find((item) => item.id === "opening-v4-background")).toEqual(asset);
    expect(createHash("sha256").update(readFileSync(preparedURL)).digest("hex"))
      .toBe(OPENING_V4_BACKGROUND.sha256);
    expect(createHash("sha256").update(readFileSync(canonicalURL)).digest("hex"))
      .toBe(OPENING_V4_BACKGROUND.sha256);
    expect(promoteApprovedOpeningV4(promoted)).toEqual(promoted);
  });
});
