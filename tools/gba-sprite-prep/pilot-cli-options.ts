import path from "node:path";

export function resolvePilotRepositoryRoot(
  environment: NodeJS.ProcessEnv,
  bundleDirectory: string
): string {
  const launcherRoot = environment.GBA_SPRITE_REPO_ROOT?.trim();
  return launcherRoot ? path.resolve(launcherRoot) : path.resolve(bundleDirectory, "../..");
}
