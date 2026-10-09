import { app } from "electron";
import { resolveSmokeUserDataPath } from "./smokePaths.js";

export function previewVisualSmokeUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const url = env.GBA_STUDIO_PREVIEW_VISUAL_URL?.trim();
  return url || null;
}

export function isPreviewVisualSmokeMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return previewVisualSmokeUrl(env) !== null;
}

export function configureSmokeDevToolsPort(env: NodeJS.ProcessEnv = process.env): void {
  const userDataPath = resolveSmokeUserDataPath(env);
  if (userDataPath) {
    app.setPath("userData", userDataPath);
  }

  const port = env.GBA_STUDIO_SMOKE_CDP_PORT?.trim() ?? env.GBA_STUDIO_PREVIEW_VISUAL_CDP_PORT?.trim();
  if (!port) return;

  app.commandLine.appendSwitch("remote-debugging-port", port);
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
}
