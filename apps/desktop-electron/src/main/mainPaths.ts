import { join } from "node:path";

export function preloadScriptPath(mainDirectory: string): string {
  return join(mainDirectory, "../preload/preload.mjs");
}
