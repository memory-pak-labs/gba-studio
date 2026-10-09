import { access } from "node:fs/promises";
import { app } from "electron";

import { toRecentProjectEntries, type RecentProjectEntry } from "../shared/recentProjects.js";

export async function listRecentProjects(limit = 8): Promise<RecentProjectEntry[]> {
  const paths = app.getRecentDocuments();
  const entries = toRecentProjectEntries(paths);
  const verified: RecentProjectEntry[] = [];

  for (const entry of entries) {
    try {
      await access(entry.path);
      verified.push(entry);
      if (verified.length >= limit) {
        break;
      }
    } catch {
      // Ignore stale recent entries that no longer exist on disk.
    }
  }

  return verified;
}
