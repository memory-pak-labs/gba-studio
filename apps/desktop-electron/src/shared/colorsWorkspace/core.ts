import type { GBAProjectData } from "../projectFile.js";
import {
  backgroundPaletteBankLimitForPolicy,
  effectiveBackgroundPaletteBankBudget,
  normalizeScenePaletteBankPolicy,
  type ScenePaletteBankPolicy
} from "../paletteContract.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function cloneProjectData<T>(data: T): T {
  return globalThis.structuredClone
    ? globalThis.structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as T);
}

function parsePaletteArray(value: unknown): number[] {
  return (Array.isArray(value) ? value : [])
    .filter((entry): entry is number => Number.isInteger(entry) && entry >= 0 && entry <= 0x7fff)
    .slice(0, 16);
}

export interface PaletteFamilyRecord {
  id: string;
  name: string;
  background: number[];
  objects: number[];
}

export function readPaletteFamilies(data: GBAProjectData): PaletteFamilyRecord[] {
  const records = Array.isArray(data.paletteFamilies) ? data.paletteFamilies.filter(isRecord) : [];
  const seen = new Set<string>();
  const families: PaletteFamilyRecord[] = [];
  for (const record of records) {
    const id = nullableString(record.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    families.push({
      id,
      name: stringField(record.name, id),
      background: parsePaletteArray(record.background),
      objects: parsePaletteArray(record.objects)
    });
  }
  return families;
}

export type PaletteSlot = "background" | "objects";

export interface PaletteFamilyUsage {
  count: number;
  labels: string[];
}

export interface PaletteFamilyPresentation {
  id: string;
  name: string;
  background: number[];
  objects: number[];
  usageCount: number;
  usageLabels: string[];
  hasProblems: boolean;
  origin: "manual";
}

export interface ColorsBankSlot {
  index: number;
  familyID: string | null;
  familyName: string | null;
  occupied: boolean;
}

export interface ColorsPaletteConsumer {
  roomID: string;
  roomName: string;
  sceneType: string;
  familyID: string | null;
  familyName: string | null;
  paletteBankPolicy: ScenePaletteBankPolicy;
  backgroundBankLimit: number;
}

export interface ColorsPaletteAssetConflict {
  assetName: string;
  kind: "sprite" | "tileset";
  roomNames: string[];
  familyIDs: string[];
  hasUnassignedRoom: boolean;
  reason: "multiple-families" | "unassigned-room" | "multiple-families-and-unassigned-room";
  resolution: "sprite-variant" | "background-repack-or-policy";
  resolvedByExport: boolean;
  references: ColorsPaletteAssetReference[];
}

export interface ColorsPaletteAssetReference {
  roomName: string;
  familyID: string | null;
  familyName: string | null;
  source: "family" | "intrinsic" | "missing-family";
}

export interface ColorsPaletteBudgetWarning {
  assetName: string;
  requestedBanks: number;
  detectedBanks: number | null;
  effectiveBanks: number;
  policy: ScenePaletteBankPolicy;
  roomNames: string[];
}

export interface ColorsBankUsage {
  bgOccupied: number;
  bgCapacity: number;
  objOccupied: number;
  objCapacity: number;
  bgBanks: ColorsBankSlot[];
  objBanks: ColorsBankSlot[];
  consumers: ColorsPaletteConsumer[];
  assignedRoomCount: number;
  unassignedRoomCount: number;
  unknownFamilyCount: number;
}

export interface ColorsWorkspacePresentation {
  families: PaletteFamilyPresentation[];
  selectedFamilyID: string | null;
  selectedFamily: PaletteFamilyPresentation | null;
  totalFamilyCount: number;
  bankUsage: ColorsBankUsage;
  paletteConflicts: ColorsPaletteAssetConflict[];
  paletteBudgetWarnings: ColorsPaletteBudgetWarning[];
  summary: string;
}

function computeFamilyUsage(
  familyID: string,
  rooms: Array<Record<string, unknown>>
): PaletteFamilyUsage {
  const labels: string[] = [];
  for (const room of rooms) {
    if (nullableString(room.paletteFamilyID) !== familyID) continue;
    const name = nullableString(room.name);
    if (name) labels.push(name);
  }
  return { count: labels.length, labels };
}

function detectFamilyProblems(family: PaletteFamilyRecord): boolean {
  return family.background.length === 0 && family.objects.length === 0;
}

function roomLabel(room: Record<string, unknown>, index: number): string {
  return nullableString(room.name) ?? nullableString(room.id) ?? `room_${index + 1}`;
}

function roomConsumer(
  room: Record<string, unknown>,
  index: number,
  familiesByID: Map<string, PaletteFamilyRecord>
): ColorsPaletteConsumer {
  const rawFamilyID = nullableString(room.paletteFamilyID);
  const family = rawFamilyID ? familiesByID.get(rawFamilyID) : undefined;
  const policy = normalizeScenePaletteBankPolicy(room.paletteBankPolicy);
  return {
    roomID: nullableString(room.id) ?? `room-${index + 1}`,
    roomName: roomLabel(room, index),
    sceneType: nullableString(room.sceneType) ?? "unknown",
    familyID: family?.id ?? null,
    familyName: family?.name ?? null,
    paletteBankPolicy: policy,
    backgroundBankLimit: backgroundPaletteBankLimitForPolicy(policy)
  };
}

function roomReferencedBackgroundAssets(room: Record<string, unknown>): string[] {
  const names = [room.backgroundAssetName, room.background, room.tilesetAssetName]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  const layers = Array.isArray(room.tileLayers) ? room.tileLayers.filter(isRecord) : [];
  for (const layer of layers) {
    const layerNames = [layer.assetName, layer.tilesetAssetName, layer.sourceAssetName];
    names.push(...layerNames
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim()));
    if (Array.isArray(layer.tileSourceAssetNames)) {
      names.push(...layer.tileSourceAssetNames
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim()));
    }
  }
  return Array.from(new Set(names));
}

function computeBankUsage(
  families: PaletteFamilyRecord[],
  rooms: Array<Record<string, unknown>>
): ColorsBankUsage {
  const familiesByID = new Map(families.map((family) => [family.id, family]));
  const consumers = rooms.map((room, index) => roomConsumer(room, index, familiesByID));
  const assignedFamilyIDs = new Set(
    consumers.flatMap((consumer) => consumer.familyID ? [consumer.familyID] : [])
  );
  const assignedFamilies = families.filter((family) => assignedFamilyIDs.has(family.id));
  const bgBanks: ColorsBankSlot[] = Array.from({ length: 16 }, (_, index) => ({
    index,
    familyID: null,
    familyName: null,
    occupied: false
  }));
  const objBanks: ColorsBankSlot[] = Array.from({ length: 16 }, (_, index) => ({
    index,
    familyID: null,
    familyName: null,
    occupied: false
  }));

  let bgOccupied = 0;
  let objOccupied = 0;

  for (const family of assignedFamilies) {
    if (family.background.length > 0 && bgOccupied < 16) {
      const slot = bgBanks[bgOccupied];
      slot.familyID = family.id;
      slot.familyName = family.name;
      slot.occupied = true;
      bgOccupied++;
    }
    if (family.objects.length > 0 && objOccupied < 16) {
      const slot = objBanks[objOccupied];
      slot.familyID = family.id;
      slot.familyName = family.name;
      slot.occupied = true;
      objOccupied++;
    }
  }

  return {
    bgOccupied,
    bgCapacity: 16,
    objOccupied,
    objCapacity: 16,
    bgBanks,
    objBanks,
    consumers,
    assignedRoomCount: consumers.filter((consumer) => consumer.familyID !== null).length,
    unassignedRoomCount: consumers.filter((consumer) => consumer.familyID === null).length,
    unknownFamilyCount: rooms.filter((room) => {
      const familyID = nullableString(room.paletteFamilyID);
      return familyID !== null && !familiesByID.has(familyID);
    }).length
  };
}

function paletteConflict(
  assetName: string,
  kind: ColorsPaletteAssetConflict["kind"],
  roomEntries: Array<{ room: Record<string, unknown>; index: number }>,
  familiesByID: Map<string, PaletteFamilyRecord>
): ColorsPaletteAssetConflict | null {
  const roomNames = Array.from(new Set(roomEntries.map(({ room, index }) => roomLabel(room, index))));
  const references = roomEntries.map(({ room, index }) => {
    const familyID = nullableString(room.paletteFamilyID);
    const family = familyID ? familiesByID.get(familyID) : undefined;
    return {
      roomName: roomLabel(room, index),
      familyID: family?.id ?? null,
      familyName: family?.name ?? null,
      source: family ? "family" : familyID ? "missing-family" : "intrinsic"
    } satisfies ColorsPaletteAssetReference;
  });
  const familyIDs = Array.from(new Set(references.flatMap((reference) => (
    reference.familyID ? [reference.familyID] : []
  ))));
  // Assets used only by scenes without a family keep their intrinsic palette;
  // that is not a conflict until the same asset is mixed with a family.
  if (familyIDs.length === 0) return null;
  const hasUnassignedRoom = references.some((reference) => reference.source !== "family");
  if (familyIDs.length <= 1 && !hasUnassignedRoom) return null;
  const reason = familyIDs.length > 1
    ? hasUnassignedRoom ? "multiple-families-and-unassigned-room" : "multiple-families"
    : "unassigned-room";
  const resolvedByExport = kind === "sprite" && references.every((reference) => (
    reference.source === "intrinsic"
      || (reference.source === "family" && reference.familyID !== null && (familiesByID.get(reference.familyID)?.objects.length ?? 0) > 0)
  ));
  return {
    assetName,
    kind,
    roomNames,
    familyIDs,
    hasUnassignedRoom,
    reason,
    resolution: kind === "sprite" ? "sprite-variant" : "background-repack-or-policy",
    resolvedByExport,
    references
  };
}

function computePaletteConflicts(
  data: GBAProjectData,
  rooms: Array<Record<string, unknown>>,
  families: PaletteFamilyRecord[]
): ColorsPaletteAssetConflict[] {
  const familiesByID = new Map(families.map((family) => [family.id, family]));
  const conflicts: ColorsPaletteAssetConflict[] = [];
  const actors = Array.isArray(data.actors) ? data.actors.filter(isRecord) : [];
  const spriteRooms = new Map<string, Array<{ room: Record<string, unknown>; index: number }>>();
  actors.forEach((actor) => {
    const spriteSheet = nullableString(actor.spriteSheet);
    if (!spriteSheet) return;
    const actorRoom = nullableString(actor.roomName) ?? nullableString(actor.sceneName);
    const actorName = nullableString(actor.name);
    const matches = actorRoom
      ? rooms.flatMap((room, index) => (
        actorRoom === nullableString(room.id) || actorRoom === nullableString(room.name)
          ? [{ room, index }]
          : []
      ))
      : rooms.flatMap((room, index) => (
        !actorName || nullableString(room.playerActorName) === actorName ? [{ room, index }] : []
      ));
    if (matches.length === 0) return;
    spriteRooms.set(spriteSheet, [...(spriteRooms.get(spriteSheet) ?? []), ...matches]);
  });
  for (const [assetName, entries] of spriteRooms) {
    const conflict = paletteConflict(assetName, "sprite", entries, familiesByID);
    if (conflict) conflicts.push(conflict);
  }

  const tilesetRooms = new Map<string, Array<{ room: Record<string, unknown>; index: number }>>();
  rooms.forEach((room, index) => {
    for (const assetName of roomReferencedBackgroundAssets(room)) {
      tilesetRooms.set(assetName, [...(tilesetRooms.get(assetName) ?? []), { room, index }]);
    }
  });
  for (const [assetName, entries] of tilesetRooms) {
    const conflict = paletteConflict(assetName, "tileset", entries, familiesByID);
    if (conflict) conflicts.push(conflict);
  }
  return conflicts.sort((left, right) => left.assetName.localeCompare(right.assetName));
}

function computePaletteBudgetWarnings(
  data: GBAProjectData,
  rooms: Array<Record<string, unknown>>
): ColorsPaletteBudgetWarning[] {
  const assets = Array.isArray(data.assets) ? data.assets.filter(isRecord) : [];
  const warnings: ColorsPaletteBudgetWarning[] = [];
  for (const asset of assets) {
    const assetName = nullableString(asset.name);
    const metadata = isRecord(asset.metadata) ? asset.metadata : {};
    const requestedBanks = typeof metadata.backgroundPaletteBankBudget === "number"
      && Number.isFinite(metadata.backgroundPaletteBankBudget)
      ? Math.floor(metadata.backgroundPaletteBankBudget)
      : null;
    if (!assetName || requestedBanks === null || requestedBanks <= 0) continue;
    const detectedBanks = typeof metadata.paletteBankCount === "number"
      && Number.isFinite(metadata.paletteBankCount)
      && Number.isInteger(metadata.paletteBankCount)
      && metadata.paletteBankCount >= 1
      ? Math.min(16, metadata.paletteBankCount)
      : null;
    const consumers = rooms.flatMap((room, index) => {
      return roomReferencedBackgroundAssets(room).includes(assetName) ? [{ room, index }] : [];
    });
    if (consumers.length === 0) continue;
    const policy = consumers.every(({ room }) => normalizeScenePaletteBankPolicy(room.paletteBankPolicy) === "full-screen")
      ? "full-screen"
      : "shared-ui";
    const effectiveBanks = effectiveBackgroundPaletteBankBudget(requestedBanks, policy);
    const requiredBanks = detectedBanks ?? requestedBanks;
    if (effectiveBanks >= requiredBanks) continue;
    warnings.push({
      assetName,
      requestedBanks,
      detectedBanks,
      effectiveBanks,
      policy,
      roomNames: Array.from(new Set(consumers.map(({ room, index }) => roomLabel(room, index))))
    });
  }
  return warnings.sort((left, right) => left.assetName.localeCompare(right.assetName));
}

export function deriveColorsWorkspacePresentation(
  data: GBAProjectData,
  selectedFamilyID?: string | null
): ColorsWorkspacePresentation {
  const families = readPaletteFamilies(data);
  const scenas = Array.isArray(data.scenas) ? data.scenas.filter(isRecord) : [];
  const rooms = Array.isArray(data.rooms) ? data.rooms.filter(isRecord) : [];
  const allRooms = [...scenas];
  for (const room of rooms) {
    const id = nullableString(room.id);
    if (id && !allRooms.some((r) => nullableString(r.id) === id)) {
      allRooms.push(room);
    }
  }

  const presentedFamilies: PaletteFamilyPresentation[] = families.map((family) => {
    const usage = computeFamilyUsage(family.id, allRooms);
    return {
      id: family.id,
      name: family.name,
      background: family.background,
      objects: family.objects,
      usageCount: usage.count,
      usageLabels: usage.labels,
      hasProblems: detectFamilyProblems(family),
      origin: "manual" as const
    };
  });

  const selectedID = selectedFamilyID === undefined
    ? presentedFamilies[0]?.id ?? null
    : selectedFamilyID && presentedFamilies.some((f) => f.id === selectedFamilyID)
      ? selectedFamilyID
      : null;

  const selectedFamily = selectedID
    ? presentedFamilies.find((f) => f.id === selectedID) ?? null
    : null;

  const bankUsage = computeBankUsage(families, allRooms);
  const paletteConflicts = computePaletteConflicts(data, allRooms, families);
  const paletteBudgetWarnings = computePaletteBudgetWarnings(data, allRooms);

  const summary = `${presentedFamilies.length} famílias`;

  return {
    families: presentedFamilies,
    selectedFamilyID: selectedID,
    selectedFamily,
    totalFamilyCount: presentedFamilies.length,
    bankUsage,
    paletteConflicts,
    paletteBudgetWarnings,
    summary
  };
}

export function colorsSelectionInEditorState(data: GBAProjectData): string | null {
  const editorState = isRecord(data.editorState) ? data.editorState : {};
  return nullableString(editorState.colorsSelectedFamilyID);
}

export function setColorSelectionInEditorState(data: GBAProjectData, familyID: string | null): GBAProjectData {
  const next = cloneProjectData(data);
  if (!isRecord(next.editorState)) {
    next.editorState = {};
  }
  const editorState = next.editorState as Record<string, unknown>;
  if (familyID) {
    editorState.colorsSelectedFamilyID = familyID;
  } else {
    delete editorState.colorsSelectedFamilyID;
  }
  return next;
}

export function nextPaletteFamilyID(data: GBAProjectData): string {
  const families = readPaletteFamilies(data);
  let maxIndex = 0;
  for (const family of families) {
    const match = family.id.match(/^palette-family-(\d+)$/);
    if (match) {
      const index = parseInt(match[1], 10);
      if (index >= maxIndex) maxIndex = index + 1;
    }
  }
  return `palette-family-${String(maxIndex).padStart(3, "0")}`;
}

export function nextPaletteFamilyName(data: GBAProjectData): string {
  const families = readPaletteFamilies(data);
  let maxIndex = 0;
  for (const family of families) {
    const match = family.name.match(/^Nova família (\d+)$/);
    if (match) {
      const index = parseInt(match[1], 10);
      if (index > maxIndex) maxIndex = index;
    }
  }
  return `Nova família ${maxIndex + 1}`;
}
