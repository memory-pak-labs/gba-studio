import type { GBAProjectData } from "./projectFile.js";

export type CartridgeRumbleProfile = "none" | "chisflash_v1_2";

export function isCartridgeRumbleProfile(value: unknown): value is CartridgeRumbleProfile {
  return value === "none" || value === "chisflash_v1_2";
}

export function projectCartridgeRumbleProfile(data: GBAProjectData): CartridgeRumbleProfile {
  const value = (data.settings as { hardware?: { rumbleCartridge?: unknown } } | undefined)?.hardware?.rumbleCartridge;
  if (value === undefined) return "none";
  if (!isCartridgeRumbleProfile(value)) throw new Error("Perfil de vibração do cartucho inválido.");
  return value;
}
