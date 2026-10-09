import { basename } from "node:path";

export interface RecentProjectEntry {
  path: string;
  name: string;
}

export function isGbaProjectPath(path: string): boolean {
  return path.trim().toLowerCase().endsWith(".gba-project");
}

export function recentProjectNameFromPath(path: string): string {
  const fileName = basename(path);
  if (fileName.toLowerCase().endsWith(".gba-project")) {
    return fileName.slice(0, -".gba-project".length);
  }

  return fileName;
}

export function dedupeRecentProjectPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const path of paths) {
    const normalized = path.trim();
    if (!normalized || !isGbaProjectPath(normalized) || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function toRecentProjectEntries(paths: string[]): RecentProjectEntry[] {
  return dedupeRecentProjectPaths(paths).map((path) => ({
    path,
    name: recentProjectNameFromPath(path)
  }));
}
