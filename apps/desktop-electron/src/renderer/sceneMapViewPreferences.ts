import { clampSceneMapZoom } from "../shared/sceneMapLayout.js";

export type SceneMapViewMode = "preview" | "diagram";

export function readSceneMapViewMode(projectPath: string | undefined): SceneMapViewMode {
  try {
    return projectPath && window.localStorage.getItem(`gba-studio:scene-map-view-mode:${projectPath}`) === "diagram" ? "diagram" : "preview";
  } catch { return "preview"; }
}

export function writeSceneMapViewMode(projectPath: string | undefined, mode: SceneMapViewMode): void {
  if (!projectPath) return;
  try { window.localStorage.setItem(`gba-studio:scene-map-view-mode:${projectPath}`, mode); } catch { /* Navigation remains available. */ }
}

function preferenceKey(projectPath: string): string {
  return `gba-studio:scene-map-view-zoom:${projectPath}`;
}

export function readSceneMapViewZoom(projectPath: string | undefined, fallback = 1): number {
  try {
    const stored = projectPath ? window.localStorage.getItem(preferenceKey(projectPath)) : null;
    if (stored !== null && Number.isFinite(Number(stored))) return clampSceneMapZoom(Number(stored));
  } catch { /* Navigation remains available when device preferences cannot be read. */ }
  return clampSceneMapZoom(fallback);
}

export function writeSceneMapViewZoom(projectPath: string | undefined, zoom: number): void {
  if (!projectPath) return;
  try {
    window.localStorage.setItem(preferenceKey(projectPath), String(clampSceneMapZoom(zoom)));
  } catch { /* Zoom still works in memory when device preferences cannot be saved. */ }
}
