import type { GBAProjectData } from "./projectFile.js";

export type CompactSequenceValue = string | number | boolean | null;

export interface CompactSequence {
  encoding: "rle-v1";
  length: number;
  runs: Array<[CompactSequenceValue, number]>;
}

export interface CompactMetatileSequence {
  encoding: "metatile-v1";
  width: number;
  height: number;
  blockWidth: number;
  blockHeight: number;
  dictionary: CompactSequenceValue[][];
  indices: number[];
}

export interface SplitProjectResourceReference {
  kind: "resource";
  collection: string;
  index: number;
  id: string;
  path: string;
}

export interface SplitProjectManifest extends GBAProjectData {
  format: "gbastudio.split-project";
  resourceSchema: 1;
  resources: SplitProjectResourceReference[];
  project: GBAProjectData;
}

export interface SplitProjectResource {
  schema: 1;
  kind: "resource";
  collection: string;
  index: number;
  id: string;
  path: string;
  data: unknown;
}

export interface SplitProjectResult {
  manifest: SplitProjectManifest;
  resources: SplitProjectResource[];
}

const splitCollections = [
  "rooms",
  "events",
  "assets",
  "actors",
  "triggers",
  "animations",
  "animationStates",
  "audioItems",
  "dialogues",
  "variables",
  "paletteFamilies",
  "spriteReferenceImages",
  "assetGroups",
  "scenas"
] as const;

const compactRoomArrayKeys = new Set(["collisions", "collisionTypes", "heightMap", "heightMapCells"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCompactSequence(value: unknown): value is CompactSequence {
  return isRecord(value)
    && value.encoding === "rle-v1"
    && Number.isInteger(value.length)
    && Number(value.length) >= 0
    && Array.isArray(value.runs);
}

function isCompactSequenceValue(value: unknown): value is CompactSequenceValue {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function isMetatileSequence(value: unknown): value is CompactMetatileSequence {
  return isRecord(value)
    && value.encoding === "metatile-v1"
    && Number.isInteger(value.width)
    && Number(value.width) > 0
    && Number.isInteger(value.height)
    && Number(value.height) > 0
    && Number.isInteger(value.blockWidth)
    && Number(value.blockWidth) > 0
    && Number.isInteger(value.blockHeight)
    && Number(value.blockHeight) > 0
    && Array.isArray(value.dictionary)
    && Array.isArray(value.indices);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function encodeCompactSequence(values: readonly CompactSequenceValue[]): CompactSequence {
  const runs: CompactSequence["runs"] = [];
  for (const value of values) {
    const previous = runs.at(-1);
    if (previous && Object.is(previous[0], value)) {
      previous[1] += 1;
    } else {
      runs.push([value, 1]);
    }
  }
  return { encoding: "rle-v1", length: values.length, runs };
}

export function decodeCompactSequence(sequence: CompactSequence): CompactSequenceValue[] {
  if (!isCompactSequence(sequence)) {
    throw new Error("Sequência compacta inválida.");
  }
  const result: CompactSequenceValue[] = [];
  for (const run of sequence.runs) {
    if (!Array.isArray(run) || run.length !== 2 || !Number.isInteger(run[1]) || run[1] <= 0) {
      throw new Error("Run RLE inválido.");
    }
    const value = run[0];
    if (!isCompactSequenceValue(value)) {
      throw new Error("Valor RLE inválido.");
    }
    for (let count = 0; count < run[1]; count += 1) result.push(value);
  }
  if (result.length !== sequence.length) {
    throw new Error(`Sequência RLE declarou ${sequence.length} valores, mas produziu ${result.length}.`);
  }
  return result;
}

export function encodeMetatileSequence(
  values: readonly CompactSequenceValue[],
  width: number,
  height: number,
  blockWidth: number = 2,
  blockHeight: number = 2
): CompactMetatileSequence {
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || !Number.isInteger(blockWidth)
    || !Number.isInteger(blockHeight)
    || width <= 0
    || height <= 0
    || blockWidth <= 0
    || blockHeight <= 0
    || width % blockWidth !== 0
    || height % blockHeight !== 0
    || values.length !== width * height
  ) {
    throw new Error("Dimensões de metatile inválidas.");
  }

  const dictionary: CompactSequenceValue[][] = [];
  const dictionaryBySignature = new Map<string, number>();
  const indices: number[] = [];
  for (let blockY = 0; blockY < height; blockY += blockHeight) {
    for (let blockX = 0; blockX < width; blockX += blockWidth) {
      const block: CompactSequenceValue[] = [];
      for (let localY = 0; localY < blockHeight; localY += 1) {
        for (let localX = 0; localX < blockWidth; localX += 1) {
          block.push(values[((blockY + localY) * width) + blockX + localX]);
        }
      }
      const signature = JSON.stringify(block);
      let dictionaryIndex = dictionaryBySignature.get(signature);
      if (dictionaryIndex === undefined) {
        dictionaryIndex = dictionary.length;
        dictionaryBySignature.set(signature, dictionaryIndex);
        dictionary.push(block);
      }
      indices.push(dictionaryIndex);
    }
  }
  return {
    encoding: "metatile-v1",
    width,
    height,
    blockWidth,
    blockHeight,
    dictionary,
    indices
  };
}

export function decodeMetatileSequence(sequence: CompactMetatileSequence): CompactSequenceValue[] {
  if (!isMetatileSequence(sequence)) throw new Error("Sequência de metatiles inválida.");
  const { width, height, blockWidth, blockHeight } = sequence;
  if (width % blockWidth !== 0 || height % blockHeight !== 0) {
    throw new Error("Mapa de metatiles não é divisível pelo bloco declarado.");
  }
  const blockLength = blockWidth * blockHeight;
  if (sequence.dictionary.some((block) => (
    !Array.isArray(block)
    || block.length !== blockLength
    || block.some((value) => !isCompactSequenceValue(value))
  ))) {
    throw new Error("Dicionário de metatiles inválido.");
  }
  const expectedIndices = (width / blockWidth) * (height / blockHeight);
  if (
    sequence.indices.length !== expectedIndices
    || sequence.indices.some((index) => (
      !Number.isInteger(index)
      || index < 0
      || index >= sequence.dictionary.length
    ))
  ) {
    throw new Error("Mapa de índices de metatiles inválido.");
  }

  const result: CompactSequenceValue[] = Array.from({ length: width * height }, () => null);
  let mapIndex = 0;
  for (let blockY = 0; blockY < height; blockY += blockHeight) {
    for (let blockX = 0; blockX < width; blockX += blockWidth) {
      const block = sequence.dictionary[sequence.indices[mapIndex]];
      mapIndex += 1;
      for (let localY = 0; localY < blockHeight; localY += 1) {
        for (let localX = 0; localX < blockWidth; localX += 1) {
          result[((blockY + localY) * width) + blockX + localX] = (
            block[(localY * blockWidth) + localX]
          );
        }
      }
    }
  }
  return result;
}

function compactArray(value: unknown): unknown {
  if (!Array.isArray(value) || value.length === 0) return value;
  if (!value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item))) return value;
  return encodeCompactSequence(value as CompactSequenceValue[]);
}

function compactTilemap(value: unknown, width: number, height: number): unknown {
  if (
    !Array.isArray(value)
    || value.length !== width * height
    || !value.every(isCompactSequenceValue)
  ) {
    return compactArray(value);
  }
  const values = value as CompactSequenceValue[];
  const rle = encodeCompactSequence(values);
  const candidates: Array<CompactSequence | CompactMetatileSequence> = [rle];
  for (const [blockWidth, blockHeight] of [[4, 4], [2, 2]] as const) {
    if (width % blockWidth === 0 && height % blockHeight === 0) {
      candidates.push(encodeMetatileSequence(values, width, height, blockWidth, blockHeight));
    }
  }
  return candidates.reduce((smallest, candidate) => (
    JSON.stringify(candidate).length < JSON.stringify(smallest).length ? candidate : smallest
  ));
}

function compactRoom(room: Record<string, unknown>): void {
  const width = Number.isInteger(room.width) && Number(room.width) > 0 ? Number(room.width) : 0;
  const height = Number.isInteger(room.height) && Number(room.height) > 0 ? Number(room.height) : 0;
  if ("tilemap" in room) room.tilemap = compactTilemap(room.tilemap, width, height);
  for (const key of compactRoomArrayKeys) {
    if (key in room) room[key] = compactTilemap(room[key], width, height);
  }
  if (Array.isArray(room.tileLayers)) {
    for (const layer of room.tileLayers) {
      if (!isRecord(layer)) continue;
      if ("tilemap" in layer) layer.tilemap = compactTilemap(layer.tilemap, width, height);
      if ("tileSourceAssetNames" in layer) {
        layer.tileSourceAssetNames = compactArray(layer.tileSourceAssetNames);
      }
    }
  }
}

function expandCompactValue(value: unknown): unknown {
  if (isCompactSequence(value)) return decodeCompactSequence(value);
  if (isMetatileSequence(value)) return decodeMetatileSequence(value);
  return value;
}

function expandRoom(room: Record<string, unknown>): void {
  room.tilemap = expandCompactValue(room.tilemap);
  for (const key of compactRoomArrayKeys) {
    room[key] = expandCompactValue(room[key]);
  }
  if (Array.isArray(room.tileLayers)) {
    for (const layer of room.tileLayers) {
      if (!isRecord(layer)) continue;
      layer.tilemap = expandCompactValue(layer.tilemap);
      layer.tileSourceAssetNames = expandCompactValue(layer.tileSourceAssetNames);
    }
  }
}

export function compactProjectTilemaps(project: GBAProjectData): GBAProjectData {
  const next = clone(project);
  for (const collection of ["rooms", "scenas"]) {
    const rooms = next[collection];
    if (!Array.isArray(rooms)) continue;
    for (const room of rooms) {
      if (isRecord(room)) compactRoom(room);
    }
  }
  return next;
}

export function expandProjectTilemaps(project: GBAProjectData): GBAProjectData {
  const next = clone(project);
  for (const collection of ["rooms", "scenas"]) {
    const rooms = next[collection];
    if (!Array.isArray(rooms)) continue;
    for (const room of rooms) {
      if (isRecord(room)) expandRoom(room);
    }
  }
  return next;
}

function resourceSlug(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "resource";
}

function resourceIdentity(value: unknown, collection: string, index: number): { id: string; slug: string } {
  const record = isRecord(value) ? value : {};
  const id = typeof record.id === "string" && record.id.trim()
    ? record.id.trim()
    : `${collection}-${index}`;
  const label = typeof record.name === "string" && record.name.trim()
    ? record.name.trim()
    : id;
  return { id, slug: resourceSlug(label) };
}

export function splitProjectResources(project: GBAProjectData): SplitProjectResult {
  const compact = compactProjectTilemaps(project);
  const core = clone(compact);
  const resources: SplitProjectResource[] = [];

  for (const collection of splitCollections) {
    const values = core[collection];
    if (!Array.isArray(values)) continue;
    delete core[collection];
    values.forEach((data, index) => {
      const identity = resourceIdentity(data, collection, index);
      const resourcePath = `Resources/${collection}/${String(index).padStart(3, "0")}-${identity.slug}.gbares`;
      resources.push({
        schema: 1,
        kind: "resource",
        collection,
        index,
        id: identity.id,
        path: resourcePath,
        data
      });
    });
  }

  const references = resources.map(({ collection, index, id, path }) => ({
    kind: "resource" as const,
    collection,
    index,
    id,
    path
  }));
  const manifest: SplitProjectManifest = {
    schemaVersion: compact.schemaVersion,
    name: compact.name,
    format: "gbastudio.split-project",
    resourceSchema: 1,
    resources: references,
    project: core
  };
  return { manifest, resources };
}

export function isSplitProjectManifest(value: unknown): value is SplitProjectManifest {
  return isRecord(value)
    && value.format === "gbastudio.split-project"
    && value.resourceSchema === 1
    && Array.isArray(value.resources)
    && isRecord(value.project);
}

export function joinSplitProjectResources(
  manifest: SplitProjectManifest,
  resources: readonly SplitProjectResource[]
): GBAProjectData {
  if (!isSplitProjectManifest(manifest)) throw new Error("Manifesto split inválido.");
  const byPath = new Map(resources.map((resource) => [resource.path, resource]));
  const project = clone(manifest.project);
  const collections = new Map<string, Array<{ index: number; data: unknown }>>();

  for (const reference of manifest.resources) {
    const resource = byPath.get(reference.path);
    if (!resource) throw new Error(`Recurso split ausente: ${reference.path}`);
    if (
      resource.schema !== 1
      || resource.kind !== "resource"
      || resource.collection !== reference.collection
      || resource.index !== reference.index
      || resource.id !== reference.id
    ) {
      throw new Error(`Contrato do recurso split divergente: ${reference.path}`);
    }
    const entries = collections.get(reference.collection) ?? [];
    entries.push({ index: reference.index, data: resource.data });
    collections.set(reference.collection, entries);
  }

  for (const [collection, entries] of collections) {
    project[collection] = entries.sort((left, right) => left.index - right.index).map((entry) => entry.data);
  }
  return expandProjectTilemaps(project);
}
