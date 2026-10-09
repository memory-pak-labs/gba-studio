import {
  controlledEntityContracts,
  resolveControlledEntityContract,
  type ControlledEntitySceneType
} from "../../scene-contracts/src/index.js";
import { migrateLegacyEventBindings } from "./eventBindingMigration.js";

export { migrateLegacyEventBindings } from "./eventBindingMigration.js";

export {
  GBA_SCENE_DEFAULT_HEIGHT_TILES,
  GBA_SCENE_DEFAULT_WIDTH_TILES,
  GBA_SCENE_GRID_PX,
  GBA_SCENE_VIEWPORT_HEIGHT_PX,
  GBA_SCENE_VIEWPORT_WIDTH_PX,
  normalizeGBAAssetDocument,
  normalizeGBASceneDocument
} from "./sceneDocument.js";
export type {
  GBAAssetDocument,
  GBAAssetMetadataDocument,
  GBASceneDocument,
  GBASceneCampaignDocument,
  GBAScenePaletteBankPolicy
} from "./sceneDocument.js";
export {
  normalizeGBAEntityDocument,
  normalizeGBAEventDocument
} from "./entityEventDocument.js";
export type {
  GBAEntityDocument,
  GBAEntityDocumentKind,
  GBAEventDocument,
  GBAEventStepDocument
} from "./entityEventDocument.js";
export {
  formatGBAEntityEventProjectionIssue,
  validateGBAEntityEventProjection
} from "./entityEventValidation.js";
export type {
  GBAEntityEventProjectionIssue,
  GBAEntityEventProjectionSource
} from "./entityEventValidation.js";

export type GBAProjectData = Record<string, unknown>;

/** Menor cena capaz de cobrir integralmente o viewport nativo de 240×160 px do GBA. */
export const GBA_MIN_SCENE_WIDTH_TILES = 30;
export const GBA_MIN_SCENE_HEIGHT_TILES = 20;

export interface GBAProjectSummary {
  schemaVersion: number | null;
  name: string;
  rooms: number;
  assets: number;
}

export interface ParsedGBAProject {
  data: GBAProjectData;
  summary: GBAProjectSummary;
}

export type GBAProjectWorkspaceID = "files" | "rooms" | "sprites" | "events" | "audio" | "settings";

export interface GBAProjectWorkspaceSchema {
  id: GBAProjectWorkspaceID;
  label: string;
  requiredTopLevelKeys: string[][];
}

export interface GBAProjectWorkspaceCoverageIssue {
  workspace: GBAProjectWorkspaceID;
  missingKeys: string[];
}

export interface GBAProjectFilesSchemaIssue {
  assetIndex: number;
  assetName: string;
  missingFields: string[];
  invalidFields: string[];
}

export interface GBAProjectAssetGroupSchemaIssue {
  groupPath: string;
  missingFields: string[];
  invalidFields: string[];
}

export interface GBAProjectRoomSchemaIssue {
  roomIndex: number;
  roomName: string;
  missingFields: string[];
  invalidFields: string[];
}

export interface GBAProjectRoomConnectionSchemaIssue {
  connectionIndex: number;
  connectionName: string;
  missingFields: string[];
  invalidFields: string[];
}

export interface GBAProjectRoomReferenceSchemaIssue {
  roomIndex: number;
  roomName: string;
  invalidFields: string[];
}

export interface GBAProjectRoomEntitySchemaIssue {
  source: "actors" | "triggers";
  itemIndex: number;
  itemName: string;
  missingFields: string[];
  invalidFields: string[];
}

export interface GBAProjectControlledEntitySchemaIssue {
  roomIndex: number;
  roomName: string;
  sceneType: string;
  code: "MISSING_CONTROLLED_ENTITY" | "CONTROLLED_ENTITY_NOT_IN_ROOM";
  expectedRole: string;
}

export interface GBAProjectAudioSchemaIssue {
  audioIndex: number;
  audioName: string;
  missingFields: string[];
  invalidFields: string[];
}

export interface GBAProjectEventSchemaIssue {
  eventIndex: number;
  eventName: string;
  missingFields: string[];
  invalidFields: string[];
}

export interface GBAProjectEventBindingSchemaIssue {
  source: "rooms" | "actors" | "triggers" | "scenaConnections";
  itemName: string;
  invalidFields: string[];
}

export interface GBAProjectSpriteSchemaIssue {
  source: "animations" | "animationStates";
  itemIndex: number;
  itemName: string;
  missingFields: string[];
  invalidFields: string[];
}

export type GBAProjectSettingsSectionID = "general" | "build" | "preview" | "audio" | "save" | "debug";

export interface GBAProjectSettingsSchemaIssue {
  section: GBAProjectSettingsSectionID;
  missingFields: string[];
  invalidFields: string[];
}

export type GBAProjectMigrationContractValidator =
  | "workspace"
  | "files"
  | "assetGroups"
  | "rooms"
  | "roomConnections"
  | "roomReferences"
  | "roomEntities"
  | "controlledEntities"
  | "sprites"
  | "events"
  | "eventBindings"
  | "audio"
  | "settings";

export interface GBAProjectMigrationContractIssue {
  validator: GBAProjectMigrationContractValidator;
  issue: unknown;
}

type GBAProjectSettingsFieldType = "string" | "number" | "boolean";

interface GBAProjectSettingsFieldSchema {
  key: string;
  type: GBAProjectSettingsFieldType;
}

export const PROJECT_SETTINGS_SECTIONS: GBAProjectSettingsSectionID[] = [
  "general",
  "build",
  "preview",
  "audio",
  "save",
  "debug"
];

export const PROJECT_SETTINGS_FIELD_SCHEMAS: Record<GBAProjectSettingsSectionID, GBAProjectSettingsFieldSchema[]> = {
  general: [
    { key: "gameTitle", type: "string" },
    { key: "startScene", type: "string" },
    { key: "exportFolder", type: "string" }
  ],
  build: [
    { key: "romFileName", type: "string" },
    { key: "exportFormat", type: "string" },
    { key: "engineBackend", type: "string" }
  ],
  preview: [
    { key: "defaultMode", type: "string" },
    { key: "scale", type: "number" },
    { key: "runAfterBuild", type: "boolean" }
  ],
  audio: [
    { key: "audioEngine", type: "string" },
    { key: "audioMode", type: "string" },
    { key: "masterVolume", type: "number" }
  ],
  save: [
    { key: "saveType", type: "string" },
    { key: "slots", type: "number" },
    { key: "autoSave", type: "boolean" }
  ],
  debug: [
    { key: "developerMode", type: "boolean" },
    { key: "preserveTempFiles", type: "boolean" },
    { key: "exportReadableButanoProject", type: "boolean" }
  ]
};

export const PROJECT_WORKSPACE_SCHEMAS: GBAProjectWorkspaceSchema[] = [
  {
    id: "files",
    label: "Arquivos",
    requiredTopLevelKeys: [["assets"]]
  },
  {
    id: "rooms",
    label: "Rooms",
    requiredTopLevelKeys: [["scenas", "rooms"]]
  },
  {
    id: "sprites",
    label: "Sprites",
    requiredTopLevelKeys: [["assets"], ["animations"], ["animationStates"], ["spriteReferenceImages"]]
  },
  {
    id: "events",
    label: "Eventos",
    requiredTopLevelKeys: [["events"]]
  },
  {
    id: "audio",
    label: "Audio",
    requiredTopLevelKeys: [["audioItems"]]
  },
  {
    id: "settings",
    label: "Settings",
    requiredTopLevelKeys: [["settings"]]
  }
];

function countArrayField(data: GBAProjectData, key: string): number {
  const value = data[key];
  return Array.isArray(value) ? value.length : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringField(data: GBAProjectData, key: string, fallback: string): string {
  const value = data[key];
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function numberField(data: GBAProjectData, key: string): number | null {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isSwiftSplitProjectManifest(data: GBAProjectData): boolean {
  return data.format === "gbastudio.split-project" && isRecord(data.parts);
}

export function summarizeGBAProject(data: GBAProjectData): GBAProjectSummary {
  return {
    schemaVersion: numberField(data, "schemaVersion"),
    name: stringField(data, "name", "Projeto sem nome"),
    rooms: countArrayField(data, "rooms") || countArrayField(data, "scenas"),
    assets: countArrayField(data, "assets")
  };
}

export function parseGBAProjectFile(contents: string): ParsedGBAProject {
  const parsed = JSON.parse(contents) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Arquivo .gba-project precisa conter um objeto JSON.");
  }

  const data = parsed as GBAProjectData;
  if (isSwiftSplitProjectManifest(data)) {
    throw new Error("Projeto split do Swift ainda nao e suportado pelo Project I/O P0 do Electron; abra um .gba-project monolitico da migracao.");
  }

  const migratedData = migrateLegacyEventBindings(data);

  return {
    data: migratedData,
    summary: summarizeGBAProject(migratedData)
  };
}

export function serializeGBAProjectFile(project: ParsedGBAProject): string {
  return `${JSON.stringify(project.data, null, 2)}\n`;
}

export function validateWorkspaceSchemaCoverage(data: GBAProjectData): GBAProjectWorkspaceCoverageIssue[] {
  return PROJECT_WORKSPACE_SCHEMAS.flatMap((schema) => {
    const missingKeys = schema.requiredTopLevelKeys
      .filter((alternatives) => !alternatives.some((key) => Object.prototype.hasOwnProperty.call(data, key)))
      .map((alternatives) => alternatives.join("|"));

    return missingKeys.length > 0 ? [{ workspace: schema.id, missingKeys }] : [];
  });
}

export function validateFilesSchemaCoverage(data: GBAProjectData): GBAProjectFilesSchemaIssue[] {
  return projectArray(data, "assets").flatMap((asset, index) => {
    const missingFields: string[] = [];
    const invalidFields: string[] = [];

    const id = asset.id;
    const name = asset.name;
    const kind = asset.kind;
    const metadata = asset.metadata;

    if (id === undefined) {
      missingFields.push("id");
    } else if (typeof id !== "string" || id.trim().length === 0) {
      invalidFields.push("id");
    }

    if (name === undefined) {
      missingFields.push("name");
    } else if (typeof name !== "string" || name.trim().length === 0) {
      invalidFields.push("name");
    }

    if (kind === undefined) {
      missingFields.push("kind");
    } else if (typeof kind !== "string" || kind.trim().length === 0) {
      invalidFields.push("kind");
    }

    if (metadata !== undefined) {
      if (!isRecord(metadata)) {
        invalidFields.push("metadata");
      } else if (metadata.source !== undefined && (typeof metadata.source !== "string" || metadata.source.trim().length === 0)) {
        invalidFields.push("metadata.source");
      }
    }

    if (missingFields.length === 0 && invalidFields.length === 0) return [];

    return [{
      assetIndex: index,
      assetName: typeof name === "string" && name.trim().length > 0 ? name.trim() : `Asset ${index + 1}`,
      missingFields,
      invalidFields
    }];
  });
}

function validAssetIDs(data: GBAProjectData): Set<string> {
  return new Set(
    projectArray(data, "assets")
      .map((asset) => asset.id)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
  );
}

function assetGroupPath(name: unknown, fallback: string, parentPath: string | null): string {
  const groupName = typeof name === "string" && name.trim().length > 0 ? name.trim() : fallback;
  return parentPath ? `${parentPath} / ${groupName}` : groupName;
}

function validateAssetGroupRecord(
  group: Record<string, unknown>,
  index: number,
  assetIDs: Set<string>,
  parentPath: string | null
): GBAProjectAssetGroupSchemaIssue[] {
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  const groupPath = assetGroupPath(group.name, `Group ${index + 1}`, parentPath);

  if (group.id === undefined) {
    missingFields.push("id");
  } else if (typeof group.id !== "string" || group.id.trim().length === 0) {
    invalidFields.push("id");
  }

  if (group.name === undefined) {
    missingFields.push("name");
  } else if (typeof group.name !== "string" || group.name.trim().length === 0) {
    invalidFields.push("name");
  }

  if (group.assetIDs === undefined) {
    missingFields.push("assetIDs");
  } else if (!Array.isArray(group.assetIDs)) {
    invalidFields.push("assetIDs");
  } else {
    for (const [assetIndex, assetID] of group.assetIDs.entries()) {
      if (typeof assetID !== "string" || assetID.trim().length === 0 || !assetIDs.has(assetID)) {
        invalidFields.push(`assetIDs[${assetIndex}]`);
      }
    }
  }

  const children = group.children;
  if (children === undefined) {
    missingFields.push("children");
  } else if (!Array.isArray(children)) {
    invalidFields.push("children");
  }

  const currentIssues = missingFields.length > 0 || invalidFields.length > 0
    ? [{ groupPath, missingFields, invalidFields }]
    : [];

  const childIssues = Array.isArray(children)
    ? children
      .filter(isRecord)
      .flatMap((child, childIndex) => validateAssetGroupRecord(child, childIndex, assetIDs, groupPath))
    : [];

  return [...currentIssues, ...childIssues];
}

export function validateAssetGroupSchemaCoverage(data: GBAProjectData): GBAProjectAssetGroupSchemaIssue[] {
  const assetIDs = validAssetIDs(data);
  return projectArray(data, "assetGroups").flatMap((group, index) => (
    validateAssetGroupRecord(group, index, assetIDs, null)
  ));
}

export function projectRoomRecords(data: GBAProjectData): Record<string, unknown>[] {
  const scenas = projectArray(data, "scenas");
  if (scenas.length > 0) return scenas;
  return projectArray(data, "rooms");
}

function positiveNumberIsValid(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function roomCellCount(width: unknown, height: unknown): number | null {
  if (typeof width !== "number" || typeof height !== "number") return null;
  return positiveNumberIsValid(width) && positiveNumberIsValid(height) ? width * height : null;
}

function validateRoomTilemap(value: unknown, expectedCellCount: number | null, invalidFields: string[]): void {
  if (value === undefined) return;

  if (isCompactRoomSequence(value)) {
    validateCompactRoomSequence(value, expectedCellCount, "tilemap", (entry) => (
      typeof entry === "number" && Number.isFinite(entry)
    ), invalidFields);
    return;
  }

  if (!Array.isArray(value)) {
    invalidFields.push("tilemap");
    return;
  }

  for (const [cellIndex, cell] of value.entries()) {
    if (typeof cell !== "number" || !Number.isFinite(cell)) {
      invalidFields.push(`tilemap[${cellIndex}]`);
    }
  }

  if (expectedCellCount !== null && value.length !== expectedCellCount) {
    invalidFields.push("tilemap.length");
  }
}

function validateRoomCollisionTypes(value: unknown, expectedCellCount: number | null, invalidFields: string[]): void {
  if (value === undefined) return;

  if (isCompactRoomSequence(value)) {
    const allowed = new Set([
      "free", "solid", "down", "up", "left", "right", "water", "damage", "ladder", "event",
      "slope_up_right", "slope_up_left"
    ]);
    validateCompactRoomSequence(value, expectedCellCount, "collisionTypes", (entry) => (
      typeof entry === "string" && allowed.has(entry)
    ), invalidFields);
    return;
  }

  if (!Array.isArray(value)) {
    invalidFields.push("collisionTypes");
    return;
  }

  const allowed = new Set([
    "free", "solid", "down", "up", "left", "right", "water", "damage", "ladder", "event",
    "slope_up_right", "slope_up_left"
  ]);
  for (const [cellIndex, cell] of value.entries()) {
    if (typeof cell !== "string" || !allowed.has(cell)) {
      invalidFields.push(`collisionTypes[${cellIndex}]`);
    }
  }

  if (expectedCellCount !== null && value.length > expectedCellCount) {
    invalidFields.push("collisionTypes.length");
  }
}

interface CompactRoomSequence {
  encoding: "rle-v1";
  length: number;
  runs: unknown[];
}

function isCompactRoomSequence(value: unknown): value is CompactRoomSequence {
  return isRecord(value)
    && value.encoding === "rle-v1"
    && Number.isInteger(value.length)
    && Number(value.length) >= 0
    && Array.isArray(value.runs);
}

function validateCompactRoomSequence(
  value: CompactRoomSequence,
  expectedCellCount: number | null,
  field: string,
  isEntryValid: (entry: unknown) => boolean,
  invalidFields: string[]
): void {
  if (expectedCellCount !== null && value.length !== expectedCellCount) {
    invalidFields.push(`${field}.length`);
  }

  let expandedLength = 0;
  for (const [runIndex, run] of value.runs.entries()) {
    if (!Array.isArray(run) || run.length !== 2 || !Number.isInteger(run[1]) || run[1] <= 0 || !isEntryValid(run[0])) {
      invalidFields.push(`${field}.runs[${runIndex}]`);
      continue;
    }
    expandedLength += run[1];
  }

  if (expandedLength !== value.length) {
    invalidFields.push(`${field}.length`);
  }
}

function projectRoomNames(data: GBAProjectData): Set<string> {
  return new Set(
    projectRoomRecords(data)
      .map((room) => room.name)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      .map((name) => name.trim())
  );
}

function projectRoomConnectionRecords(data: GBAProjectData): Array<{ connection: unknown; index: number }> {
  if (!isRecord(data.editorState) || !Array.isArray(data.editorState.scenaConnections)) return [];
  return data.editorState.scenaConnections.map((connection, index) => ({ connection, index }));
}

export function validateRoomSchemaCoverage(data: GBAProjectData): GBAProjectRoomSchemaIssue[] {
  return projectRoomRecords(data).flatMap((room, index) => {
    const missingFields: string[] = [];
    const invalidFields: string[] = [];

    const name = room.name;
    const width = room.width;
    const height = room.height;

    if (name === undefined) {
      missingFields.push("name");
    } else if (typeof name !== "string" || name.trim().length === 0) {
      invalidFields.push("name");
    }

    if (width === undefined) {
      missingFields.push("width");
    } else if (
      typeof width !== "number" ||
      !Number.isFinite(width) ||
      !Number.isInteger(width) ||
      width <= 0
    ) {
      invalidFields.push("width");
    }

    if (height === undefined) {
      missingFields.push("height");
    } else if (
      typeof height !== "number" ||
      !Number.isFinite(height) ||
      !Number.isInteger(height) ||
      height <= 0
    ) {
      invalidFields.push("height");
    }

    const expectedCellCount = roomCellCount(width, height);
    validateRoomTilemap(room.tilemap, expectedCellCount, invalidFields);
    validateRoomCollisionTypes(room.collisionTypes, expectedCellCount, invalidFields);

    if (missingFields.length === 0 && invalidFields.length === 0) return [];

    return [{
      roomIndex: index,
      roomName: typeof name === "string" && name.trim().length > 0 ? name.trim() : `Room ${index + 1}`,
      missingFields,
      invalidFields
    }];
  });
}

function roomConnectionName(connection: Record<string, unknown>, index: number): string {
  const eventName = connection.eventName;
  if (typeof eventName === "string" && eventName.trim().length > 0) return eventName.trim();

  const from = connection.from;
  const to = connection.to;
  if (typeof from === "string" && from.trim().length > 0 && typeof to === "string" && to.trim().length > 0) {
    return `${from.trim()} -> ${to.trim()}`;
  }

  return `Connection ${index + 1}`;
}

export function validateRoomConnectionSchemaCoverage(data: GBAProjectData): GBAProjectRoomConnectionSchemaIssue[] {
  const roomNames = projectRoomNames(data);

  return projectRoomConnectionRecords(data).flatMap(({ connection, index }) => {
    const missingFields: string[] = [];
    const invalidFields: string[] = [];

    if (!isRecord(connection)) {
      return [{
        connectionIndex: index,
        connectionName: `Connection ${index + 1}`,
        missingFields,
        invalidFields: ["connection"]
      }];
    }

    const from = connection.from;
    const to = connection.to;
    const eventName = connection.eventName;

    if (from === undefined) {
      missingFields.push("from");
    } else if (typeof from !== "string" || from.trim().length === 0 || (roomNames.size > 0 && !roomNames.has(from.trim()))) {
      invalidFields.push("from");
    }

    if (to === undefined) {
      missingFields.push("to");
    } else if (
      typeof to !== "string" ||
      to.trim().length === 0 ||
      (roomNames.size > 0 && !roomNames.has(to.trim())) ||
      (typeof from === "string" && from.trim().length > 0 && to.trim() === from.trim())
    ) {
      invalidFields.push("to");
    }

    if (eventName !== undefined && (typeof eventName !== "string" || eventName.trim().length === 0)) {
      invalidFields.push("eventName");
    }

    if (missingFields.length === 0 && invalidFields.length === 0) return [];

    return [{
      connectionIndex: index,
      connectionName: roomConnectionName(connection, index),
      missingFields,
      invalidFields
    }];
  });
}

function projectNames(data: GBAProjectData, key: string): Set<string> {
  return new Set(
    projectArray(data, key)
      .map((record) => record.name)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      .map((name) => name.trim())
  );
}

function isBackgroundAssetKind(value: unknown): boolean {
  return typeof value === "string" && ["background", "image", "imagem", "tileset", "tilemap"].includes(value.trim().toLowerCase());
}

function backgroundAssetNames(data: GBAProjectData): Set<string> {
  return new Set(
    projectArray(data, "assets")
      .filter((asset) => isBackgroundAssetKind(asset.kind))
      .map((asset) => asset.name)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      .map((name) => name.trim())
  );
}

function optionalReferenceValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalMusicReferenceValue(value: unknown): string | null {
  const reference = optionalReferenceValue(value);
  return reference !== null && reference.toLowerCase() !== "silent" ? reference : null;
}

export function validateRoomReferenceSchemaCoverage(data: GBAProjectData): GBAProjectRoomReferenceSchemaIssue[] {
  const musicNames = projectNames(data, "audioItems");
  const backgroundNames = backgroundAssetNames(data);
  const actorNames = projectNames(data, "actors");

  return projectRoomRecords(data).flatMap((room, index) => {
    const invalidFields: string[] = [];
    const music = optionalMusicReferenceValue(room.music);
    const backgroundAssetName = optionalReferenceValue(room.backgroundAssetName);
    const playerActorName = optionalReferenceValue(room.playerActorName);

    if (music !== null && !musicNames.has(music)) {
      invalidFields.push("music");
    }

    if (backgroundAssetName !== null && !backgroundNames.has(backgroundAssetName)) {
      invalidFields.push("backgroundAssetName");
    }

    if (playerActorName !== null && !actorNames.has(playerActorName)) {
      invalidFields.push("playerActorName");
    }

    if (invalidFields.length === 0) return [];

    const name = room.name;
    return [{
      roomIndex: index,
      roomName: typeof name === "string" && name.trim().length > 0 ? name.trim() : `Room ${index + 1}`,
      invalidFields
    }];
  });
}

function finiteNumberFieldIsValid(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

interface RoomBounds {
  width: number;
  height: number;
}

function roomBoundsByName(data: GBAProjectData): Map<string, RoomBounds> {
  const bounds = new Map<string, RoomBounds>();
  for (const room of projectRoomRecords(data)) {
    const width = finiteNumberOrNull(room.width);
    const height = finiteNumberOrNull(room.height);
    if (
      typeof room.name === "string" &&
      room.name.trim().length > 0 &&
      width !== null &&
      width > 0 &&
      height !== null &&
      height > 0
    ) {
      bounds.set(room.name.trim(), { width, height });
    }
  }
  return bounds;
}

function validateRoomEntity(
  source: "actors" | "triggers",
  entity: Record<string, unknown>,
  index: number,
  roomNames: Set<string>,
  boundsByRoomName: Map<string, RoomBounds>
): GBAProjectRoomEntitySchemaIssue[] {
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  const name = entity.name;
  const roomName = typeof entity.roomName === "string" ? entity.roomName.trim() : null;

  if (entity.id === undefined) {
    missingFields.push("id");
  } else if (typeof entity.id !== "string" || entity.id.trim().length === 0) {
    invalidFields.push("id");
  }

  if (name === undefined) {
    missingFields.push("name");
  } else if (typeof name !== "string" || name.trim().length === 0) {
    invalidFields.push("name");
  }

  if (entity.roomName !== undefined && (typeof entity.roomName !== "string" || !roomNames.has(entity.roomName.trim()))) {
    invalidFields.push("roomName");
  }

  if (entity.x !== undefined && !finiteNumberFieldIsValid(entity.x)) {
    invalidFields.push("x");
  }

  if (entity.y !== undefined && !finiteNumberFieldIsValid(entity.y)) {
    invalidFields.push("y");
  }

  const bounds = roomName ? boundsByRoomName.get(roomName) : undefined;
  const x = finiteNumberOrNull(entity.x);
  const y = finiteNumberOrNull(entity.y);
  const width = finiteNumberOrNull(entity.width);
  const height = finiteNumberOrNull(entity.height);
  const entityWidth = source === "triggers" && width !== null && width > 0 ? width : 1;
  const entityHeight = source === "triggers" && height !== null && height > 0 ? height : 1;
  if (x !== null && (x < 0 || (bounds && x + entityWidth > bounds.width))) {
    invalidFields.push("x");
  }
  if (y !== null && (y < 0 || (bounds && y + entityHeight > bounds.height))) {
    invalidFields.push("y");
  }

  if (source === "triggers") {
    if (entity.width !== undefined && !positiveNumberIsValid(entity.width)) {
      invalidFields.push("width");
    }

    if (entity.height !== undefined && !positiveNumberIsValid(entity.height)) {
      invalidFields.push("height");
    }
  } else {
    const boundedIntegerFields = [
      ["collisionGroup", entity.collisionGroup, 0, 15],
      ["collisionMask", entity.collisionMask, 0, 0xFFFF],
      ["pushPriority", entity.pushPriority, 0, 255]
    ] as const;
    for (const [field, value, minimum, maximum] of boundedIntegerFields) {
      if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum)) {
        invalidFields.push(field);
      }
    }
    if (entity.pushable !== undefined && typeof entity.pushable !== "boolean") {
      invalidFields.push("pushable");
    }
  }

  if (missingFields.length === 0 && invalidFields.length === 0) return [];

  const fallbackName = source === "actors" ? `Actor ${index + 1}` : `Trigger ${index + 1}`;
  return [{
    source,
    itemIndex: index,
    itemName: typeof name === "string" && name.trim().length > 0 ? name.trim() : fallbackName,
    missingFields,
    invalidFields
  }];
}

export function validateRoomEntitySchemaCoverage(data: GBAProjectData): GBAProjectRoomEntitySchemaIssue[] {
  const roomNames = projectRoomNames(data);
  const boundsByRoomName = roomBoundsByName(data);
  const actorIssues = projectArray(data, "actors").flatMap((actor, index) => validateRoomEntity("actors", actor, index, roomNames, boundsByRoomName));
  const triggerIssues = projectArray(data, "triggers").flatMap((trigger, index) => validateRoomEntity("triggers", trigger, index, roomNames, boundsByRoomName));
  return [...actorIssues, ...triggerIssues];
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isControlledEntitySceneType(value: string): value is ControlledEntitySceneType {
  return Object.hasOwn(controlledEntityContracts, value);
}

function worldMapNavigable(room: Record<string, unknown>): boolean {
  if (!isRecord(room.runtime) || !isRecord(room.runtime.config)) return false;
  return room.runtime.config.navigable === true;
}

export function validateControlledEntitySchemaCoverage(data: GBAProjectData): GBAProjectControlledEntitySchemaIssue[] {
  const actors = projectArray(data, "actors");

  return projectRoomRecords(data).flatMap((room, roomIndex): GBAProjectControlledEntitySchemaIssue[] => {
    const sceneType = nonEmptyString(room.sceneType);
    if (sceneType === null || !isControlledEntitySceneType(sceneType)) return [];

    const contract = resolveControlledEntityContract(sceneType, {
      worldMapNavigable: worldMapNavigable(room)
    });
    if (!contract.required) return [];

    const roomName = nonEmptyString(room.name) ?? `Room ${roomIndex + 1}`;
    const playerActorName = nonEmptyString(room.playerActorName);
    const issue = (code: GBAProjectControlledEntitySchemaIssue["code"]): GBAProjectControlledEntitySchemaIssue => ({
      roomIndex,
      roomName,
      sceneType,
      code,
      expectedRole: contract.role
    });

    if (playerActorName === null) return [];

    const isActorInRoom = actors.some((actor) => (
      nonEmptyString(actor.name) === playerActorName && nonEmptyString(actor.roomName) === roomName
    ));
    return isActorInRoom ? [] : [issue("CONTROLLED_ENTITY_NOT_IN_ROOM")];
  });
}

function isKnownAudioKind(value: string): boolean {
  return ["musica", "música", "music", "sfx", "sound", "efeito"].includes(value.trim().toLowerCase());
}

function isAudioAssetKind(value: unknown): boolean {
  return typeof value === "string" && ["audio", "musica", "música", "music", "sfx", "sound", "efeito"].includes(value.trim().toLowerCase());
}

function audioAssetNames(data: GBAProjectData): Set<string> {
  return new Set(
    projectArray(data, "assets")
      .filter((asset) => isAudioAssetKind(asset.kind))
      .map((asset) => asset.name)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      .map((name) => name.trim())
  );
}

function patternIDs(audio: Record<string, unknown>): Set<string> {
  return new Set(
    projectArray(audio, "patterns")
      .map((pattern) => pattern.id)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .map((id) => id.trim())
  );
}

function pushUnique(target: string[], field: string): void {
  if (!target.includes(field)) {
    target.push(field);
  }
}

function validateAudioChannelSchema(channel: unknown, fieldPrefix: string, invalidFields: string[]): void {
  if (!isRecord(channel)) {
    pushUnique(invalidFields, fieldPrefix);
    return;
  }

  const id = channel.id;
  if (typeof id !== "string" || id.trim().length === 0) {
    pushUnique(invalidFields, `${fieldPrefix}.id`);
  }

  const name = channel.name;
  if (typeof name !== "string" || name.trim().length === 0) {
    pushUnique(invalidFields, `${fieldPrefix}.name`);
  }

  const type = channel.type;
  if (typeof type !== "string" || type.trim().length === 0) {
    pushUnique(invalidFields, `${fieldPrefix}.type`);
  }

  const notes = channel.notes;
  if (notes !== undefined) {
    if (!Array.isArray(notes)) {
      pushUnique(invalidFields, `${fieldPrefix}.notes`);
    } else {
      for (const [noteIndex, note] of notes.entries()) {
        if (typeof note !== "string") {
          pushUnique(invalidFields, `${fieldPrefix}.notes[${noteIndex}]`);
        }
      }
    }
  }

  if (channel.instrumentID !== undefined && (typeof channel.instrumentID !== "string" || !channel.instrumentID.trim())) pushUnique(invalidFields, `${fieldPrefix}.instrumentID`);
  if (channel.pan !== undefined && (!Number.isInteger(channel.pan) || Number(channel.pan) < -127 || Number(channel.pan) > 127)) pushUnique(invalidFields, `${fieldPrefix}.pan`);

  if (channel.muted !== undefined && typeof channel.muted !== "boolean") {
    pushUnique(invalidFields, `${fieldPrefix}.muted`);
  }

  if (channel.solo !== undefined && typeof channel.solo !== "boolean") {
    pushUnique(invalidFields, `${fieldPrefix}.solo`);
  }

  if (channel.volume !== undefined && (typeof channel.volume !== "number" || !Number.isFinite(channel.volume) || channel.volume < 0 || channel.volume > 100)) {
    pushUnique(invalidFields, `${fieldPrefix}.volume`);
  }
}

function validateAudioTrackerSchema(audio: Record<string, unknown>, invalidFields: string[]): void {
  const patterns = audio.patterns;
  if (patterns !== undefined) {
    if (!Array.isArray(patterns)) {
      pushUnique(invalidFields, "patterns");
    } else {
      for (const [patternIndex, pattern] of patterns.entries()) {
        const patternPrefix = `patterns[${patternIndex}]`;
        if (!isRecord(pattern)) {
          pushUnique(invalidFields, patternPrefix);
          continue;
        }

        const id = pattern.id;
        if (typeof id !== "string" || id.trim().length === 0) {
          pushUnique(invalidFields, `${patternPrefix}.id`);
        }

        const name = pattern.name;
        if (typeof name !== "string" || name.trim().length === 0) {
          pushUnique(invalidFields, `${patternPrefix}.name`);
        }

        const channels = pattern.channels;
        if (channels !== undefined) {
          if (!Array.isArray(channels)) {
            pushUnique(invalidFields, `${patternPrefix}.channels`);
          } else {
            for (const [channelIndex, channel] of channels.entries()) {
              validateAudioChannelSchema(channel, `${patternPrefix}.channels[${channelIndex}]`, invalidFields);
            }
          }
        }
      }
    }
  }

  const channels = audio.channels;
  if (channels !== undefined) {
    if (!Array.isArray(channels)) {
      pushUnique(invalidFields, "channels");
    } else {
      for (const [channelIndex, channel] of channels.entries()) {
        validateAudioChannelSchema(channel, `channels[${channelIndex}]`, invalidFields);
      }
    }
  }
}

export function validateAudioSchemaCoverage(data: GBAProjectData): GBAProjectAudioSchemaIssue[] {
  const knownAudioAssetNames = audioAssetNames(data);

  const bankInvalid: string[] = [];
  const bankIDs = new Set<string>();
  if (data.audioInstruments !== undefined && !Array.isArray(data.audioInstruments)) bankInvalid.push("audioInstruments");
  for (const [index, instrument] of (Array.isArray(data.audioInstruments) ? data.audioInstruments : []).entries()) {
    const prefix = `audioInstruments[${index}]`;
    if (!isRecord(instrument)) { bankInvalid.push(prefix); continue; }
    if (typeof instrument.id !== "string" || !instrument.id.trim() || bankIDs.has(instrument.id)) bankInvalid.push(`${prefix}.id`);
    else bankIDs.add(instrument.id);
    if (typeof instrument.name !== "string" || !instrument.name.trim()) bankInvalid.push(`${prefix}.name`);
    if (typeof instrument.sampleRootNote !== "string" || !/^[A-G]#?[2-7]$/.test(instrument.sampleRootNote)) bankInvalid.push(`${prefix}.sampleRootNote`);
    if (typeof instrument.sampleLoop !== "boolean") bankInvalid.push(`${prefix}.sampleLoop`);
    if (!["Soft ADSR", "Short Decay"].includes(String(instrument.envelope))) bankInvalid.push(`${prefix}.envelope`);
    if (!projectArray(data, "assets").some(asset => asset.id === instrument.sampleAssetID && ["Audio", "Musica", "SFX"].includes(String(asset.kind)) && /\.wav$/i.test(String(asset.name)) && isRecord(asset.metadata) && asset.metadata.source)) bankInvalid.push(`${prefix}.sampleAssetID`);
  }
  const bankIssues: GBAProjectAudioSchemaIssue[] = bankInvalid.length ? [{ audioIndex: -1, audioName: "Banco de instrumentos", missingFields: [], invalidFields: bankInvalid }] : [];
  return [...bankIssues, ...projectArray(data, "audioItems").flatMap((audio, index) => {
    const missingFields: string[] = [];
    const invalidFields: string[] = [];

    const name = audio.name;
    const kind = audio.kind;
    const hasComposedSource = typeof audio.format === "string" && audio.format.trim().toUpperCase() === "COMPOSED";

    if (name === undefined) {
      missingFields.push("name");
    } else if (typeof name !== "string" || name.trim().length === 0) {
      invalidFields.push("name");
    } else if (!hasComposedSource && knownAudioAssetNames.size > 0 && !knownAudioAssetNames.has(name.trim())) {
      invalidFields.push("name");
    }

    if (kind === undefined) {
      missingFields.push("kind");
    } else if (typeof kind !== "string" || !isKnownAudioKind(kind)) {
      invalidFields.push("kind");
    }

    if (audio.bpm !== undefined && (!Number.isFinite(audio.bpm) || typeof audio.bpm !== "number" || audio.bpm < 40 || audio.bpm > 240)) {
      invalidFields.push("bpm");
    }

    if (audio.volume !== undefined && (!Number.isFinite(audio.volume) || typeof audio.volume !== "number" || audio.volume < 0 || audio.volume > 127)) {
      invalidFields.push("volume");
    }

    if (audio.patternOrder !== undefined) {
      if (!Array.isArray(audio.patternOrder)) {
        invalidFields.push("patternOrder");
      } else {
        const knownPatternIDs = patternIDs(audio);
        for (const [patternIndex, patternID] of audio.patternOrder.entries()) {
          if (typeof patternID !== "string" || patternID.trim().length === 0 || !knownPatternIDs.has(patternID.trim())) {
            invalidFields.push(`patternOrder[${patternIndex}]`);
          }
        }
      }
    }

    validateAudioTrackerSchema(audio, invalidFields);
    for (const channel of [...projectArray(audio, "channels"), ...projectArray(audio, "patterns").flatMap(pattern => projectArray(pattern, "channels"))]) {
      if (channel.instrumentID && !bankIDs.has(String(channel.instrumentID))) invalidFields.push("instrumentID");
    }

    if (missingFields.length === 0 && invalidFields.length === 0) return [];

    return [{
      audioIndex: index,
      audioName: typeof name === "string" && name.trim().length > 0 ? name.trim() : `Audio ${index + 1}`,
      missingFields,
      invalidFields
    }];
  })];
}

function commandValueIsValid(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function eventRoomNames(data: GBAProjectData): Set<string> {
  return projectRoomNames(data);
}

function eventNames(data: GBAProjectData): Set<string> {
  return projectNames(data, "events");
}

function dialogueKeys(data: GBAProjectData): Set<string> {
  return new Set(
    projectArray(data, "dialogues")
      .map((dialogue) => dialogue.key ?? dialogue.id ?? dialogue.name)
      .filter((key): key is string => typeof key === "string" && key.trim().length > 0)
      .map((key) => key.trim())
  );
}

function eventAudioItems(data: GBAProjectData): { music: Set<string>; sfx: Set<string> } {
  const music = new Set<string>();
  const sfx = new Set<string>();

  for (const audio of projectArray(data, "audioItems")) {
    const name = audio.name;
    const kind = audio.kind;
    if (typeof name !== "string" || name.trim().length === 0 || typeof kind !== "string") continue;
    const normalizedKind = kind.trim().toLowerCase();
    if (["musica", "música", "music"].includes(normalizedKind)) {
      music.add(name.trim());
    }
    if (["sfx", "sound", "efeito"].includes(normalizedKind)) {
      sfx.add(name.trim());
    }
  }

  return { music, sfx };
}

function commandReferenceIsValid(
  command: string,
  rooms: Set<string>,
  audio: { music: Set<string>; sfx: Set<string> },
  events: Set<string>,
  dialogues: Set<string>
): boolean {
  const parts = command.trim().split(/\s+/);
  const opcode = parts[0];
  const operand = parts[1] ?? "";

  if (opcode === "change_scene") {
    return operand.length > 0 && (rooms.size === 0 || rooms.has(operand));
  }

  if (opcode === "play_music") {
    return operand.length > 0 && (audio.music.size === 0 || audio.music.has(operand));
  }

  if (opcode === "play_sfx") {
    return operand.length > 0 && (audio.sfx.size === 0 || audio.sfx.has(operand));
  }

  if (opcode === "show_dialogue" || opcode === "show_choice") {
    return operand.length > 0 && dialogues.has(operand);
  }

  if (["call_event", "lock_script", "unlock_script", "timer_restart", "timer_remove"].includes(opcode)) {
    return operand.length > 0 && (events.size === 0 || events.has(operand));
  }

  if (opcode === "choice_event") {
    if (operand.length === 0 || !dialogues.has(operand)) return false;
    const choiceIndex = parts[2] ?? "";
    if (!/^\d+$/.test(choiceIndex)) return false;
    const targetEvent = parts[3] ?? "";
    return targetEvent.length > 0 && (events.size === 0 || events.has(targetEvent));
  }

  if (opcode === "attach_button" || opcode === "timer_attach") {
    const targetEvent = parts[2] ?? "";
    return targetEvent.length > 0 && (events.size === 0 || events.has(targetEvent));
  }

  return true;
}

export function validateEventSchemaCoverage(data: GBAProjectData): GBAProjectEventSchemaIssue[] {
  const rooms = eventRoomNames(data);
  const audio = eventAudioItems(data);
  const events = eventNames(data);
  const dialogues = dialogueKeys(data);

  return projectArray(data, "events").flatMap((event, index) => {
    const missingFields: string[] = [];
    const invalidFields: string[] = [];

    const name = event.name;
    const category = event.category;
    const steps = Array.isArray(event.steps) ? event.steps : null;

    if (name === undefined) {
      missingFields.push("name");
    } else if (typeof name !== "string" || name.trim().length === 0) {
      invalidFields.push("name");
    }

    if (category === undefined) {
      missingFields.push("category");
    } else if (typeof category !== "string" || category.trim().length === 0) {
      invalidFields.push("category");
    }

    if (!commandValueIsValid(event.command) && !steps) {
      missingFields.push("command|steps");
    } else if (typeof event.command === "string" && !commandReferenceIsValid(event.command, rooms, audio, events, dialogues)) {
      invalidFields.push("command");
    }

    if (event.steps !== undefined && !Array.isArray(event.steps)) {
      invalidFields.push("steps");
    }

    if (steps) {
      for (const [stepIndex, step] of steps.entries()) {
        if (!isRecord(step) || !commandValueIsValid(step.command)) {
          invalidFields.push(`steps[${stepIndex}].command`);
        } else if (typeof step.command === "string" && !commandReferenceIsValid(step.command, rooms, audio, events, dialogues)) {
          invalidFields.push(`steps[${stepIndex}].command`);
        }
        if (isRecord(step) && step.isEnabled !== undefined && typeof step.isEnabled !== "boolean") {
          invalidFields.push(`steps[${stepIndex}].isEnabled`);
        }
      }
    }

    if (missingFields.length === 0 && invalidFields.length === 0) return [];

    return [{
      eventIndex: index,
      eventName: typeof name === "string" && name.trim().length > 0 ? name.trim() : `Evento ${index + 1}`,
      missingFields,
      invalidFields
    }];
  });
}

function eventBindingItemName(item: Record<string, unknown>, fallback: string): string {
  const name = item.name;
  if (typeof name === "string" && name.trim().length > 0) return name.trim();

  const from = item.from;
  const to = item.to;
  if (typeof from === "string" && from.trim().length > 0 && typeof to === "string" && to.trim().length > 0) {
    return `${from.trim()} -> ${to.trim()}`;
  }

  return fallback;
}

function collectInvalidEventBindingFields(
  item: Record<string, unknown>,
  fields: string[],
  events: Set<string>
): string[] {
  const invalidFields: string[] = [];

  for (const field of fields) {
    const value = item[field];
    if (value !== undefined && (typeof value !== "string" || value.trim().length === 0 || !events.has(value.trim()))) {
      invalidFields.push(field);
    }
  }

  const bindings = item.eventBindings;
  if (isRecord(bindings)) {
    for (const [key, value] of Object.entries(bindings)) {
      const bindingName = optionalReferenceValue(value);
      if (bindingName !== null && !events.has(bindingName)) {
        invalidFields.push(`eventBindings.${key}`);
      }
    }
  }

  return invalidFields;
}

function eventBindingIssuesForRecords(
  source: GBAProjectEventBindingSchemaIssue["source"],
  records: Record<string, unknown>[],
  fields: string[],
  events: Set<string>
): GBAProjectEventBindingSchemaIssue[] {
  return records.flatMap((record, index) => {
    const invalidFields = collectInvalidEventBindingFields(record, fields, events);
    if (invalidFields.length === 0) return [];

    const fallback = source === "scenaConnections" ? `Connection ${index + 1}` : `${source} ${index + 1}`;
    return [{
      source,
      itemName: eventBindingItemName(record, fallback),
      invalidFields
    }];
  });
}

export function validateEventBindingSchemaCoverage(data: GBAProjectData): GBAProjectEventBindingSchemaIssue[] {
  const events = eventNames(data);
  if (events.size === 0) return [];

  return [
    ...eventBindingIssuesForRecords("rooms", projectRoomRecords(data), ["eventName", "onEnterEventName", "onLeaveEventName"], events),
    ...eventBindingIssuesForRecords("actors", projectArray(data, "actors"), ["eventName"], events),
    ...eventBindingIssuesForRecords("triggers", projectArray(data, "triggers"), ["eventName", "onEnterEventName", "onLeaveEventName"], events),
    ...eventBindingIssuesForRecords("scenaConnections", projectRoomConnectionRecords(data).map((item) => (
      isRecord(item.connection) ? item.connection : {}
    )), ["eventName", "onEnterEventName", "onExitEventName"], events)
  ];
}

function nonNegativeNumberIsValid(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function integerRangeIsValid(value: unknown, minimum: number, maximum: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function validateSpriteTileSchema(tile: unknown, prefix: string, assetNames: Set<string>, invalidFields: string[]): void {
  if (!isRecord(tile)) {
    pushUnique(invalidFields, prefix);
    return;
  }

  for (const key of ["x", "y", "sliceX", "sliceY"] as const) {
    const value = tile[key];
    if (typeof value !== "number" || !Number.isFinite(value) || (key.startsWith("slice") && value < 0)) {
      pushUnique(invalidFields, `${prefix}.${key}`);
    }
  }

  const sourceSheet = tile.sourceSheet;
  if (sourceSheet !== undefined) {
    const sourceSheetName = optionalReferenceValue(sourceSheet);
    if (typeof sourceSheet !== "string" || (sourceSheetName !== null && assetNames.size > 0 && !assetNames.has(sourceSheetName))) {
      pushUnique(invalidFields, `${prefix}.sourceSheet`);
    }
  }

  for (const key of ["tileWidth", "tileHeight"] as const) {
    const value = tile[key];
    if (value !== undefined && !positiveNumberIsValid(value)) {
      pushUnique(invalidFields, `${prefix}.${key}`);
    }
  }

  for (const key of ["flipX", "flipY", "priority"] as const) {
    if (tile[key] !== undefined && typeof tile[key] !== "boolean") {
      pushUnique(invalidFields, `${prefix}.${key}`);
    }
  }

  if (tile.paletteIndex !== undefined && !integerRangeIsValid(tile.paletteIndex, 0, 15)) {
    pushUnique(invalidFields, `${prefix}.paletteIndex`);
  }
}

function validateSpriteFrameSchema(animation: Record<string, unknown>, assetNames: Set<string>, invalidFields: string[]): void {
  const frames = animation.frames;
  if (frames === undefined) return;

  if (!Array.isArray(frames)) {
    pushUnique(invalidFields, "frames");
    return;
  }

  for (const [frameIndex, frame] of frames.entries()) {
    const framePrefix = `frames[${frameIndex}]`;
    if (!isRecord(frame)) {
      pushUnique(invalidFields, framePrefix);
      continue;
    }

    for (const key of ["width", "height"] as const) {
      const value = frame[key];
      if (value !== undefined && !positiveNumberIsValid(value)) {
        pushUnique(invalidFields, `${framePrefix}.${key}`);
      }
    }

    for (const key of ["originX", "originY"] as const) {
      const value = frame[key];
      if (value !== undefined && !finiteNumberFieldIsValid(value)) {
        pushUnique(invalidFields, `${framePrefix}.${key}`);
      }
    }

    const tiles = frame.tiles;
    if (tiles !== undefined) {
      if (!Array.isArray(tiles)) {
        pushUnique(invalidFields, `${framePrefix}.tiles`);
      } else {
        for (const [tileIndex, tile] of tiles.entries()) {
          validateSpriteTileSchema(tile, `${framePrefix}.tiles[${tileIndex}]`, assetNames, invalidFields);
        }
      }
    }
  }
}

function validateSpriteFrameEventSchema(animation: Record<string, unknown>, invalidFields: string[]): void {
  const frameEvents = animation.frameEvents;
  if (frameEvents === undefined) return;

  if (!Array.isArray(frameEvents)) {
    pushUnique(invalidFields, "frameEvents");
    return;
  }

  for (const [frameIndex, frameEventList] of frameEvents.entries()) {
    const framePrefix = `frameEvents[${frameIndex}]`;
    if (!Array.isArray(frameEventList)) {
      pushUnique(invalidFields, framePrefix);
      continue;
    }

    for (const [eventIndex, frameEvent] of frameEventList.entries()) {
      const eventPrefix = `${framePrefix}[${eventIndex}]`;
      if (!isRecord(frameEvent)) {
        pushUnique(invalidFields, eventPrefix);
        continue;
      }

      for (const key of ["type", "value"] as const) {
        const value = frameEvent[key];
        if (typeof value !== "string" || value.trim().length === 0) {
          pushUnique(invalidFields, `${eventPrefix}.${key}`);
        }
      }
    }
  }
}

export function validateSpriteSchemaCoverage(data: GBAProjectData): GBAProjectSpriteSchemaIssue[] {
  const assetNames = new Set(
    projectArray(data, "assets")
      .map((asset) => asset.name)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      .map((name) => name.trim())
  );
  const knownAnimationSpriteSheets = new Map(
    projectArray(data, "animations").flatMap((animation) => {
      const id = typeof animation.id === "string" ? animation.id.trim() : "";
      const spriteSheet = typeof animation.spriteSheet === "string" ? animation.spriteSheet.trim() : "";
      return id ? [[id, spriteSheet] as const] : [];
    })
  );
  const knownAnimationIDs = new Set(knownAnimationSpriteSheets.keys());
  const animationTypes = new Set([
    "fixed",
    "fixed_movement",
    "horizontal",
    "horizontal_movement",
    "four_direction",
    "four_direction_movement",
    "directional_view",
    "platform_player",
    "cursor"
  ]);

  const animationIssues = projectArray(data, "animations").flatMap((animation, index): GBAProjectSpriteSchemaIssue[] => {
    const missingFields: string[] = [];
    const invalidFields: string[] = [];
    const name = animation.name;
    const spriteSheet = animation.spriteSheet;
    const frameWidth = animation.frameWidth;
    const frameHeight = animation.frameHeight;

    if (name === undefined) {
      missingFields.push("name");
    } else if (typeof name !== "string" || name.trim().length === 0) {
      invalidFields.push("name");
    }

    if (spriteSheet === undefined) {
      missingFields.push("spriteSheet");
    } else if (typeof spriteSheet !== "string" || spriteSheet.trim().length === 0) {
      invalidFields.push("spriteSheet");
    } else if (assetNames.size > 0 && !assetNames.has(spriteSheet.trim())) {
      invalidFields.push("spriteSheet");
    }

    if (frameWidth === undefined) {
      missingFields.push("frameWidth");
    } else if (!positiveNumberIsValid(frameWidth)) {
      invalidFields.push("frameWidth");
    }

    if (frameHeight === undefined) {
      missingFields.push("frameHeight");
    } else if (!positiveNumberIsValid(frameHeight)) {
      invalidFields.push("frameHeight");
    }

    for (const key of ["originX", "originY"] as const) {
      const value = animation[key];
      if (value !== undefined && !finiteNumberFieldIsValid(value)) {
        invalidFields.push(key);
      }
    }

    for (const key of ["hitboxX", "hitboxY"] as const) {
      const value = animation[key];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
        invalidFields.push(key);
      }
    }

    for (const key of ["hitboxWidth", "hitboxHeight"] as const) {
      const value = animation[key];
      if (value !== undefined && !positiveNumberIsValid(value)) {
        invalidFields.push(key);
      }
    }

    validateSpriteFrameSchema(animation, assetNames, invalidFields);
    validateSpriteFrameEventSchema(animation, invalidFields);

    if (missingFields.length === 0 && invalidFields.length === 0) return [];

    return [{
      source: "animations",
      itemIndex: index,
      itemName: typeof name === "string" && name.trim().length > 0 ? name.trim() : `Sprite ${index + 1}`,
      missingFields,
      invalidFields
    }];
  });

  const stateIssues = projectArray(data, "animationStates").flatMap((state, index): GBAProjectSpriteSchemaIssue[] => {
    const missingFields: string[] = [];
    const invalidFields: string[] = [];
    const id = state.id;
    const name = state.name;
    const spriteSheet = state.spriteSheet;
    const animationIDs = state.animationIDs;

    if (id === undefined) {
      missingFields.push("id");
    } else if (typeof id !== "string" || id.trim().length === 0) {
      invalidFields.push("id");
    }

    if (spriteSheet === undefined) {
      missingFields.push("spriteSheet");
    } else if (typeof spriteSheet !== "string" || spriteSheet.trim().length === 0 || (assetNames.size > 0 && !assetNames.has(spriteSheet.trim()))) {
      invalidFields.push("spriteSheet");
    }

    if (state.animationType === undefined) {
      missingFields.push("animationType");
    } else if (typeof state.animationType !== "string" || !animationTypes.has(state.animationType)) {
      invalidFields.push("animationType");
    }

    if (state.mirrorLeftFromRight === undefined) {
      missingFields.push("mirrorLeftFromRight");
    } else if (typeof state.mirrorLeftFromRight !== "boolean") {
      invalidFields.push("mirrorLeftFromRight");
    }

    if (name === undefined) {
      missingFields.push("name");
    } else if (typeof name !== "string" || name.trim().length === 0) {
      invalidFields.push("name");
    }

    if (animationIDs === undefined) {
      missingFields.push("animationIDs");
    } else if (!Array.isArray(animationIDs)) {
      invalidFields.push("animationIDs");
    } else {
      for (const [animationIndex, animationID] of animationIDs.entries()) {
        const normalizedAnimationID = typeof animationID === "string" ? animationID.trim() : "";
        if (
          !normalizedAnimationID
          || !knownAnimationIDs.has(normalizedAnimationID)
          || (typeof spriteSheet === "string" && spriteSheet.trim().length > 0 && knownAnimationSpriteSheets.get(normalizedAnimationID) !== spriteSheet.trim())
        ) {
          invalidFields.push(`animationIDs[${animationIndex}]`);
        }
      }
    }

    if (missingFields.length === 0 && invalidFields.length === 0) return [];

    return [{
      source: "animationStates",
      itemIndex: index,
      itemName: typeof name === "string" && name.trim().length > 0 ? name.trim() : `Sprite State ${index + 1}`,
      missingFields,
      invalidFields
    }];
  });

  return [...animationIssues, ...stateIssues];
}

function settingsRecord(data: GBAProjectData): Record<string, unknown> | null {
  return isRecord(data.settings) ? data.settings : null;
}

function settingsFieldIsValid(value: unknown, type: GBAProjectSettingsFieldType): boolean {
  if (type === "string") return typeof value === "string" && value.trim().length > 0;
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === "boolean";
}

function stringSetting(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numericSetting(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function enumSettingIsValid(value: unknown, allowedValues: string[]): boolean {
  const normalized = stringSetting(value);
  return normalized !== null && allowedValues.includes(normalized);
}

function romFileNameIsValid(value: unknown): boolean {
  const romFileName = stringSetting(value);
  return romFileName !== null
    && romFileName.endsWith(".gba")
    && !romFileName.includes("/")
    && !romFileName.includes("\\")
    && romFileName.length > ".gba".length;
}

function integerInRangeIsValid(value: unknown, minimum: number, maximum: number): boolean {
  const number = numericSetting(value);
  return number !== null && Number.isInteger(number) && number >= minimum && number <= maximum;
}

function numberInRangeIsValid(value: unknown, minimum: number, maximum: number): boolean {
  const number = numericSetting(value);
  return number !== null && number >= minimum && number <= maximum;
}

export function validateSettingsSchemaCoverage(data: GBAProjectData): GBAProjectSettingsSchemaIssue[] {
  const settings = settingsRecord(data);
  const roomNames = projectRoomNames(data);

  return PROJECT_SETTINGS_SECTIONS.flatMap((section): GBAProjectSettingsSchemaIssue[] => {
    const sectionValue = settings?.[section];

    if (sectionValue === undefined) {
      return [{ section, missingFields: ["section"], invalidFields: [] }];
    }

    if (!isRecord(sectionValue)) {
      return [{ section, missingFields: [], invalidFields: ["section"] }];
    }

    const missingFields: string[] = [];
    const invalidFields: string[] = [];
    const pushInvalidField = (field: string): void => {
      if (!invalidFields.includes(field)) {
        invalidFields.push(field);
      }
    };

    for (const field of PROJECT_SETTINGS_FIELD_SCHEMAS[section]) {
      const value = sectionValue[field.key];
      if (value === undefined) {
        missingFields.push(field.key);
      } else if (!settingsFieldIsValid(value, field.type)) {
        pushInvalidField(field.key);
      }
    }

    if (section === "general") {
      const startScene = sectionValue.startScene;
      if (typeof startScene === "string" && startScene.trim().length > 0 && roomNames.size > 0 && !roomNames.has(startScene.trim())) {
        pushInvalidField("startScene");
      }
    }

    if (section === "build") {
      const engineBackend = sectionValue.engineBackend;
      if (!romFileNameIsValid(sectionValue.romFileName)) {
        pushInvalidField("romFileName");
      }
      if (!enumSettingIsValid(sectionValue.exportFormat, ["gba_rom"])) {
        pushInvalidField("exportFormat");
      }
      if (!enumSettingIsValid(engineBackend, ["gbastudio_engine", "butano"])) {
        pushInvalidField("engineBackend");
      }
      if (engineBackend === "gbastudio_engine" && !settingsFieldIsValid(sectionValue.enginePackPath, "string")) {
        pushInvalidField("enginePackPath");
      }
    }

    if (section === "preview") {
      if (!enumSettingIsValid(sectionValue.defaultMode, ["quick_preview"])) {
        pushInvalidField("defaultMode");
      }
      if (!integerInRangeIsValid(sectionValue.scale, 1, 8)) {
        pushInvalidField("scale");
      }
    }

    if (section === "audio") {
      if (!enumSettingIsValid(sectionValue.audioEngine, ["gbastudio_engine_audio", "butano_audio"])) {
        pushInvalidField("audioEngine");
      }
      if (!enumSettingIsValid(sectionValue.audioMode, ["chiptune_pcm"])) {
        pushInvalidField("audioMode");
      }
      if (!numberInRangeIsValid(sectionValue.masterVolume, 0, 127)) {
        pushInvalidField("masterVolume");
      }
    }

    if (section === "save") {
      if (!enumSettingIsValid(sectionValue.saveType, ["sram", "flash1m"])) {
        pushInvalidField("saveType");
      }
      if (!integerInRangeIsValid(sectionValue.slots, 1, 16)) {
        pushInvalidField("slots");
      }
    }

    return missingFields.length > 0 || invalidFields.length > 0
      ? [{ section, missingFields, invalidFields }]
      : [];
  });
}

function contractIssues(validator: GBAProjectMigrationContractValidator, issues: unknown[]): GBAProjectMigrationContractIssue[] {
  return issues.map((issue) => ({ validator, issue }));
}

export function validateGBAProjectMigrationContract(data: GBAProjectData): GBAProjectMigrationContractIssue[] {
  return [
    ...contractIssues("workspace", validateWorkspaceSchemaCoverage(data)),
    ...contractIssues("files", validateFilesSchemaCoverage(data)),
    ...contractIssues("assetGroups", validateAssetGroupSchemaCoverage(data)),
    ...contractIssues("rooms", validateRoomSchemaCoverage(data)),
    ...contractIssues("roomConnections", validateRoomConnectionSchemaCoverage(data)),
    ...contractIssues("roomReferences", validateRoomReferenceSchemaCoverage(data)),
    ...contractIssues("roomEntities", validateRoomEntitySchemaCoverage(data)),
    ...contractIssues("controlledEntities", validateControlledEntitySchemaCoverage(data)),
    ...contractIssues("sprites", validateSpriteSchemaCoverage(data)),
    ...contractIssues("events", validateEventSchemaCoverage(data)),
    ...contractIssues("eventBindings", validateEventBindingSchemaCoverage(data)),
    ...contractIssues("audio", validateAudioSchemaCoverage(data)),
    ...contractIssues("settings", validateSettingsSchemaCoverage(data))
  ];
}
