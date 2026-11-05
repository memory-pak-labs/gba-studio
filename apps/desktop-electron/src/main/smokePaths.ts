export function resolveSmokeProjectSavePath(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.GBA_STUDIO_SMOKE_PROJECT_SAVE_PATH?.trim();
  return value ? value : null;
}

export function resolveSmokeUserDataPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.GBA_STUDIO_SMOKE_USER_DATA_DIR?.trim();
  return value ? value : null;
}

/** Disposable smoke profiles must not modify the OS-wide recent-document list. */
export function registerRecentProjectDocument(
  projectPath: string,
  addRecentDocument: (path: string) => void,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!resolveSmokeUserDataPath(env)) addRecentDocument(projectPath);
}
