import { realpath } from "node:fs/promises";
import path from "node:path";
import { isSafePluginRelativePath } from "./pluginPathSafety.js";

function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative.length > 0 && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isNotFoundError(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

export async function resolvePluginPathWithinRoot(
  rootPath: string,
  relativePath: string
): Promise<string | null> {
  const normalized = relativePath.trim();
  if (!isSafePluginRelativePath(normalized)) return null;

  const rootRealPath = await realpath(rootPath);
  const segments = normalized.split("/");
  let currentPath = rootRealPath;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    const candidatePath = path.join(currentPath, segment);
    try {
      const resolvedPath = await realpath(candidatePath);
      if (!isPathWithinRoot(rootRealPath, resolvedPath)) return null;
      currentPath = resolvedPath;
    } catch (error) {
      if (isNotFoundError(error)) {
        return path.join(currentPath, ...segments.slice(index));
      }
      throw error;
    }
  }

  return currentPath;
}
