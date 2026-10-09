import { copyFile } from "node:fs/promises";
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
