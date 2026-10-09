import type { GBAProjectData } from "./projectFile.js";

export interface SceneProfileReferenceOption {
  value: number;
  label: string;
}

export interface SceneProfileReferenceIssue {
  owner: string;
  field: "nextSceneIndex" | "backgroundIndex" | "targetLevel";
  value: number;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const scenas = records(data.scenas);
  return scenas.length > 0 ? scenas : records(data.rooms);
}

function roomLabel(room: Record<string, unknown>, index: number): string {
  return typeof room.name === "string" && room.name.trim() ? room.name : `Cena ${index + 1}`;
}

function roomSceneType(room: Record<string, unknown>): string {
  return typeof room.sceneType === "string" ? room.sceneType : "topdown";
}

function numericField(source: unknown, key: string): number | null {
  if (!isRecord(source)) return null;
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function runtimeConfig(room: Record<string, unknown>): Record<string, unknown> | undefined {
  return isRecord(room.runtime) && isRecord(room.runtime.config) ? room.runtime.config : undefined;
}

export function sceneReferenceOptions(data: GBAProjectData, sceneType: "visualNovel" | "cutscene"): SceneProfileReferenceOption[] {
  return projectRooms(data)
    .filter((room) => roomSceneType(room) === sceneType)
    .map((room, index) => ({ value: index, label: roomLabel(room, index) }));
}

export function backgroundReferenceOptions(data: GBAProjectData): SceneProfileReferenceOption[] {
  const assetNames = new Set(records(data.assets).map((asset) => asset.name).filter((name): name is string => typeof name === "string"));
  const names: string[] = [];
  for (const room of projectRooms(data)) {
    const name = typeof room.backgroundAssetName === "string"
      ? room.backgroundAssetName
      : typeof room.background === "string" ? room.background : "";
    if (name && assetNames.has(name) && !names.includes(name)) names.push(name);
  }
  return names.map((label, value) => ({ value, label }));
}

const NON_PLAYABLE_SCENE_TYPES = new Set(["worldMap", "visualNovel", "cutscene", "menu"]);

export function worldMapTargetOptions(data: GBAProjectData): SceneProfileReferenceOption[] {
  return projectRooms(data)
    .filter((room) => !NON_PLAYABLE_SCENE_TYPES.has(roomSceneType(room)))
    .map((room, index) => ({ value: index, label: roomLabel(room, index) }));
}

function referenceIssue(
  owner: string,
  field: SceneProfileReferenceIssue["field"],
  value: number,
  options: SceneProfileReferenceOption[]
): SceneProfileReferenceIssue | null {
  if (value < 0 || options.some((option) => option.value === value)) return null;
  return { owner, field, value, message: `${owner}: referencia ${field} ${value} nao existe.` };
}

export function validateSceneProfileReferences(data: GBAProjectData): SceneProfileReferenceIssue[] {
  const visualNovelOptions = sceneReferenceOptions(data, "visualNovel");
  const cutsceneOptions = sceneReferenceOptions(data, "cutscene");
  const backgroundOptions = backgroundReferenceOptions(data);
  const targetOptions = worldMapTargetOptions(data);
  const issues: SceneProfileReferenceIssue[] = [];

  projectRooms(data).forEach((room, index) => {
    const owner = roomLabel(room, index);
    const config = runtimeConfig(room);
    const type = roomSceneType(room);
    const checks: Array<SceneProfileReferenceIssue | null> = [];
    if (type === "visualNovel") {
      const next = numericField(config, "nextSceneIndex");
      const background = numericField(config, "backgroundIndex");
      if (next !== null) checks.push(referenceIssue(owner, "nextSceneIndex", next, visualNovelOptions));
      if (background !== null) checks.push(referenceIssue(owner, "backgroundIndex", background, backgroundOptions));
    } else if (type === "cutscene") {
      const next = numericField(config, "nextSceneIndex");
      const background = numericField(config, "backgroundIndex");
      if (next !== null) checks.push(referenceIssue(owner, "nextSceneIndex", next, cutsceneOptions));
      if (background !== null) checks.push(referenceIssue(owner, "backgroundIndex", background, backgroundOptions));
    } else if (type === "worldMap") {
      const target = numericField(config, "targetLevel");
      if (target !== null) checks.push(referenceIssue(owner, "targetLevel", target, targetOptions));
    }
    issues.push(...checks.filter((issue): issue is SceneProfileReferenceIssue => issue !== null));
  });

  const settings = isRecord(data.settings) ? data.settings : {};
  for (const [section, owner, field, options] of [
    ["visualNovel", "Ajustes · Visual Novel", "nextSceneIndex", visualNovelOptions],
    ["visualNovel", "Ajustes · Visual Novel", "backgroundIndex", backgroundOptions],
    ["cutscene", "Ajustes · Cutscene", "nextSceneIndex", cutsceneOptions],
    ["cutscene", "Ajustes · Cutscene", "backgroundIndex", backgroundOptions],
    ["worldMap", "Ajustes · Mapa mundial", "targetLevel", targetOptions]
  ] as const) {
    const value = numericField(settings[section], field);
    if (value !== null) {
      const issue = referenceIssue(owner, field, value, options);
      if (issue) issues.push(issue);
    }
  }
  return issues;
}
