import type { GBAProjectData } from "./projectFile.js";

export const SCENE_ROUTE_DIRECTIONS = [
  "down",
  "up",
  "left",
  "right",
  "down_left",
  "down_right",
  "up_left",
  "up_right"
] as const;

export type SceneRouteDirection = typeof SCENE_ROUTE_DIRECTIONS[number];

export interface SceneRouteDestination {
  scene: string;
  x: number;
  y: number;
  direction: SceneRouteDirection;
  fadeFrames: number;
}

export interface SceneRouteCase extends SceneRouteDestination {
  value: number;
}

export interface SceneRouteTable {
  id: string;
  name: string;
  variable: string;
  routes: SceneRouteCase[];
  fallback: SceneRouteDestination | null;
}

export type SceneRouteTablePatch = Partial<Omit<SceneRouteTable, "id">>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function integerValue(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(numeric)));
}

function directionValue(value: unknown): SceneRouteDirection {
  return typeof value === "string" && (SCENE_ROUTE_DIRECTIONS as readonly string[]).includes(value)
    ? value as SceneRouteDirection
    : "down";
}

function normalizeDestination(value: unknown): SceneRouteDestination | null {
  if (!isRecord(value)) return null;
  const scene = stringValue(value.scene, "");
  if (!scene) return null;
  return {
    scene,
    x: integerValue(value.x, 0, -32768, 32767),
    y: integerValue(value.y, 0, -32768, 32767),
    direction: directionValue(value.direction),
    fadeFrames: integerValue(value.fadeFrames, 0, 0, 3600)
  };
}

export function normalizeSceneRouteTable(value: unknown, fallbackID = "scene-routes"): SceneRouteTable {
  const source = isRecord(value) ? value : {};
  const id = stringValue(source.id, fallbackID);
  const rawRoutes = Array.isArray(source.routes) ? source.routes : [];
  const routes: SceneRouteCase[] = [];
  const usedValues = new Set<number>();

  for (const rawRoute of rawRoutes) {
    const destination = normalizeDestination(rawRoute);
    if (!destination) continue;
    const route = {
      value: integerValue(isRecord(rawRoute) ? rawRoute.value : undefined, 0, -32768, 32767),
      ...destination
    };
    if (usedValues.has(route.value)) continue;
    usedValues.add(route.value);
    routes.push(route);
  }

  const fallback = normalizeDestination(source.fallback);
  return {
    id,
    name: stringValue(source.name, id),
    variable: stringValue(source.variable, ""),
    routes,
    fallback
  };
}

export function sceneRouteTablesFromProject(data: GBAProjectData): SceneRouteTable[] {
  const rawTables = Array.isArray(data.sceneRouteTables) ? data.sceneRouteTables : [];
  return rawTables.map((table, index) => normalizeSceneRouteTable(table, `scene-routes-${index + 1}`));
}

export function findSceneRouteTable(data: GBAProjectData, tableID: string): SceneRouteTable | null {
  return sceneRouteTablesFromProject(data).find((table) => table.id === tableID) ?? null;
}

export function resolveSceneRoute(table: SceneRouteTable, variableValue: number): SceneRouteDestination | null {
  const value = Number.isFinite(variableValue) ? Math.trunc(variableValue) : 0;
  return table.routes.find((route) => route.value === value) ?? table.fallback;
}

export function updateSceneRouteTableInProject(
  data: GBAProjectData,
  tableID: string,
  patch: SceneRouteTablePatch
): GBAProjectData {
  const tables = sceneRouteTablesFromProject(data);
  const index = tables.findIndex((table) => table.id === tableID);
  if (index < 0) return data;
  const updated = normalizeSceneRouteTable({ ...tables[index], ...patch }, tableID);
  return {
    ...data,
    sceneRouteTables: tables.map((table, tableIndex) => tableIndex === index ? updated : table)
  };
}

export function renameSceneRouteTableReferences(
  data: GBAProjectData,
  oldSceneName: string,
  nextSceneName: string
): void {
  if (!Array.isArray(data.sceneRouteTables)) return;

  data.sceneRouteTables = data.sceneRouteTables.map((value) => {
    if (!isRecord(value)) return value;
    const routes = Array.isArray(value.routes)
      ? value.routes.map((route) => {
          if (!isRecord(route) || route.scene !== oldSceneName) return route;
          return { ...route, scene: nextSceneName };
        })
      : value.routes;
    const fallback = isRecord(value.fallback) && value.fallback.scene === oldSceneName
      ? { ...value.fallback, scene: nextSceneName }
      : value.fallback;
    return { ...value, routes, fallback };
  });
}
