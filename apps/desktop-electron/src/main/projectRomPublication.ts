import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EnginePackBuildResult } from "../shared/ipc.js";

export async function publishEnginePackRomToProjectRoot(
  result: EnginePackBuildResult,
  projectPath?: string
): Promise<EnginePackBuildResult> {
  if (!projectPath || result.error || result.exitCode !== 0 || !result.summary?.romPath) {
    return result;
  }

  const sourcePath = result.summary.romPath;
  const publishedPath = path.join(path.dirname(projectPath), path.basename(sourcePath));
  if (path.resolve(sourcePath) === path.resolve(publishedPath)) {
    return result;
  }

  try {
    await copyFile(sourcePath, publishedPath);
    try {
      await copyFile(path.join(path.dirname(sourcePath), "event_source_map.json"), `${publishedPath}.events.json`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      // Clear an older map when a build has no event sources.
      await writeFile(`${publishedPath}.events.json`, JSON.stringify({ schema: 1, entries: [] }), "utf8");
    }
    return {
      ...result,
      summary: {
        ...result.summary,
        romPath: publishedPath
      }
    };
  } catch (error) {
    return {
      ...result,
      error: `A ROM foi compilada, mas nao foi possivel publica-la na raiz do projeto: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
