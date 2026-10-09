import type { GBAScenePaletteBankPolicy } from "../../../../packages/project-contract/src/index.js";

/**
 * Scene-level policy for the GBA BG palette banks.
 *
 * The GBA has 16 BG palette banks. Scenes that keep the shared dialogue/HUD
 * overlays resident reserve banks 14 and 15 for those overlays. A full-screen
 * scene can opt into all 16 banks when it does not use that shared contract.
 */
export type ScenePaletteBankPolicy = GBAScenePaletteBankPolicy;

export const DEFAULT_SCENE_PALETTE_BANK_POLICY: ScenePaletteBankPolicy = "shared-ui";
export const GBA_BACKGROUND_PALETTE_BANK_CAPACITY = 16;
export const GBA_SHARED_UI_BACKGROUND_PALETTE_BANK_LIMIT = 14;

export function normalizeScenePaletteBankPolicy(value: unknown): ScenePaletteBankPolicy {
  return value === "full-screen" ? "full-screen" : DEFAULT_SCENE_PALETTE_BANK_POLICY;
}

export function backgroundPaletteBankLimitForPolicy(
  policy: ScenePaletteBankPolicy = DEFAULT_SCENE_PALETTE_BANK_POLICY
): number {
  return policy === "full-screen"
    ? GBA_BACKGROUND_PALETTE_BANK_CAPACITY
    : GBA_SHARED_UI_BACKGROUND_PALETTE_BANK_LIMIT;
}

export function effectiveBackgroundPaletteBankBudget(
  configuredBudget: number | null | undefined,
  policy: ScenePaletteBankPolicy = DEFAULT_SCENE_PALETTE_BANK_POLICY
): number {
  const requestedBudget = typeof configuredBudget === "number" && Number.isFinite(configuredBudget)
    ? Math.floor(configuredBudget)
    : GBA_BACKGROUND_PALETTE_BANK_CAPACITY;
  return Math.max(1, Math.min(backgroundPaletteBankLimitForPolicy(policy), requestedBudget));
}

export function scenePaletteBankPolicyLabel(policy: ScenePaletteBankPolicy): string {
  return policy === "full-screen"
    ? "Tela cheia · até 16 bancos BG"
    : "UI compartilhada · 14 bancos BG";
}
