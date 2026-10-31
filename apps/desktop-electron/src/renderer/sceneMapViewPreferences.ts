import { clampSceneMapZoom, type SceneMapPosition } from "../shared/sceneMapLayout.js";

export type SceneMapViewMode = "preview" | "diagram";

export function readSceneDiagramPositions(projectPath: string | undefined): Record<string, SceneMapPosition> {
  if (!projectPath) return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(`gba-studio:scene-diagram-positions:${projectPath}`) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([name, position]) => {
      if (!name.trim() || !position || typeof position !== "object" || Array.isArray(position)) return [];
      const { x, y } = position as Record<string, unknown>;
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return [];
      return [[name, { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) }]];
    }));
  } catch { return {}; }
}

export function writeSceneDiagramPositions(projectPath: string | undefined, positions: Record<string, SceneMapPosition>): void {
  if (!projectPath) return;
  try {
    window.localStorage.setItem(`gba-studio:scene-diagram-positions:${projectPath}`, JSON.stringify(positions));
  } catch { /* The current in-memory layout remains usable when storage is unavailable. */ }
}

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
