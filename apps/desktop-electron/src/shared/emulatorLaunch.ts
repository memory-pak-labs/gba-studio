export type EmulatorLaunchKind = "macos-open-app" | "spawn";

export interface EmulatorLaunchPlan {
  kind: EmulatorLaunchKind;
  emulatorPath: string;
  romPath: string;
  spawnExecutable?: string;
}

// This module is imported both by main-process code (where `process` is always
// available) and by renderer code running with contextIsolation/nodeIntegration
// disabled (where the `process` global does not exist). Reading `process.platform`
// as a bare default parameter would throw a ReferenceError in the renderer, so we
// guard the lookup instead of assuming a Node environment.
function fallbackPlatform(): NodeJS.Platform {
  return typeof process !== "undefined" && process.platform ? process.platform : "darwin";
}

export function resolveDefaultEmulatorPath(platform: NodeJS.Platform = fallbackPlatform()): string {
  return platform === "darwin" ? "/Applications/mGBA.app" : "";
}

export function resolveConfiguredEmulatorPath(
  configuredPath: string,
  platform: NodeJS.Platform = fallbackPlatform()
): string {
  const trimmed = configuredPath.trim();
  return trimmed || resolveDefaultEmulatorPath(platform);
}

export function emulatorConfiguredForPlay(
  configuredPath: string,
  platform: NodeJS.Platform = fallbackPlatform()
): boolean {
  return resolveConfiguredEmulatorPath(configuredPath, platform).length > 0;
}

export function resolveEmulatorLaunchPlan(options: {
  emulatorPath: string;
  romPath: string;
  platform?: NodeJS.Platform;
}): EmulatorLaunchPlan {
  const platform = options.platform ?? fallbackPlatform();
  const emulatorPath = resolveConfiguredEmulatorPath(options.emulatorPath, platform);
  const romPath = options.romPath;
  const normalized = emulatorPath.replace(/\\/g, "/");

  if (platform === "darwin" && normalized.endsWith(".app")) {
    return { kind: "macos-open-app", emulatorPath, romPath };
  }

  const spawnExecutable = emulatorPath.trim() || (platform === "win32" ? "mgba.exe" : "mgba");
  return { kind: "spawn", emulatorPath, romPath, spawnExecutable };
}
