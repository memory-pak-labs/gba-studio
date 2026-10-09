import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENE_PALETTE_BANK_POLICY,
  GBA_BACKGROUND_PALETTE_BANK_CAPACITY,
  backgroundPaletteBankLimitForPolicy,
  effectiveBackgroundPaletteBankBudget,
  normalizeScenePaletteBankPolicy,
  scenePaletteBankPolicyLabel
} from "./paletteContract.js";

describe("paletteContract", () => {
  it("defaults incomplete scene data to the shared UI policy", () => {
    expect(normalizeScenePaletteBankPolicy(undefined)).toBe(DEFAULT_SCENE_PALETTE_BANK_POLICY);
    expect(normalizeScenePaletteBankPolicy("unknown")).toBe(DEFAULT_SCENE_PALETTE_BANK_POLICY);
    expect(backgroundPaletteBankLimitForPolicy(DEFAULT_SCENE_PALETTE_BANK_POLICY)).toBe(14);
  });

  it("allows all sixteen BG banks only for an explicit full-screen scene", () => {
    expect(normalizeScenePaletteBankPolicy("full-screen")).toBe("full-screen");
    expect(backgroundPaletteBankLimitForPolicy("full-screen")).toBe(GBA_BACKGROUND_PALETTE_BANK_CAPACITY);
    expect(effectiveBackgroundPaletteBankBudget(16, "full-screen")).toBe(16);
    expect(effectiveBackgroundPaletteBankBudget(16, "shared-ui")).toBe(14);
  });

  it("keeps configured budgets inside the policy limit", () => {
    expect(effectiveBackgroundPaletteBankBudget(3, "full-screen")).toBe(3);
    expect(effectiveBackgroundPaletteBankBudget(0, "full-screen")).toBe(1);
    expect(effectiveBackgroundPaletteBankBudget(20, "full-screen")).toBe(16);
    expect(scenePaletteBankPolicyLabel("shared-ui")).toContain("14");
    expect(scenePaletteBankPolicyLabel("full-screen")).toContain("16");
  });
});
