import type { GBAProjectData } from "./projectFile.js";
import { createRoomInProject, updateRoomFieldsInProject } from "./roomsWorkspace.js";

export const TILED_MAP_MAX_WIDTH = 1024;
export const TILED_MAP_MAX_HEIGHT = 1024;
export const TILED_MAP_MAX_TILES = TILED_MAP_MAX_WIDTH * TILED_MAP_MAX_HEIGHT;
export const TILED_MAP_MAX_SOURCE_BYTES = 16 * 1024 * 1024;
export const TILED_MAP_MAX_SOURCE_CHARS = TILED_MAP_MAX_SOURCE_BYTES;
export const TILED_MAP_MAX_COMPRESSED_BYTES = 8 * 1024 * 1024;
export const TILED_MAP_MAX_DECOMPRESSED_BYTES = TILED_MAP_MAX_TILES * 4;
export const TILED_MAP_MAX_TOTAL_DECOMPRESSED_BYTES = TILED_MAP_MAX_DECOMPRESSED_BYTES;

export interface TiledMapLayer {
  type?: string;
  name?: string;
  width?: number;
  height?: number;
  data?: unknown;
  visible?: boolean;
}

export interface TiledMapDocument {
  width?: number;
  height?: number;
  tilewidth?: number;
  tileheight?: number;
  layers?: TiledMapLayer[];
  tilesets?: Array<{
    firstgid?: number;
    name?: string;
    image?: string;
  }>;
}

export interface ParsedTiledMap {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tilemap: number[];
  layerName: string;
  tilesetImage: string | null;
  tilesetName: string | null;
}

export interface ImportTiledMapOptions {
  /** Required when creating a new room (no targetRoomId). */
  roomId?: string;
  roomName?: string;
  sceneType?: string;
  /** When set, updates that room in place and preserves actors/triggers. */
  targetRoomId?: string;
  layerName?: string;
  /** Override basename applied to room.backgroundAssetName after asset copy. */
  backgroundAssetName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function assertTiledMapDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Mapa Tiled sem width/height validos");
  }
  if (width > TILED_MAP_MAX_WIDTH || height > TILED_MAP_MAX_HEIGHT || width * height > TILED_MAP_MAX_TILES) {
    throw new Error(`Mapa Tiled excede o limite seguro de ${TILED_MAP_MAX_WIDTH}x${TILED_MAP_MAX_HEIGHT} celulas`);
  }
}

function assertTiledSourceSize(text: string): void {
  if (text.length > TILED_MAP_MAX_SOURCE_CHARS) {
    throw new Error("Mapa Tiled excede o limite de tamanho para importacao segura");
  }
}

function assertDelimitedEntryLimit(payload: string): void {
  let entries = payload.trim() ? 1 : 0;
  for (const character of payload) {
    if (character !== ",") continue;
    entries += 1;
    if (entries > TILED_MAP_MAX_TILES) {
      throw new Error("Layer Tiled excede o limite seguro de celulas");
    }
  }
}

function tileLayerData(layer: TiledMapLayer): number[] | null {
  if (!Array.isArray(layer.data)) return null;
  if (layer.data.length > TILED_MAP_MAX_TILES) {
    throw new Error("Layer Tiled excede o limite seguro de celulas");
  }
  return layer.data.map((value) => {
    const next = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(next) || next <= 0) return 0;
    // Tiled GIDs are 1-based; clear flip flags in the high bits.
    return Math.floor(next) & 0x1fffffff;
  });
}

function selectTileLayer(document: TiledMapDocument, preferredName?: string): TiledMapLayer {
  const layers = Array.isArray(document.layers) ? document.layers : [];
  const tileLayers = layers.filter((layer) => {
    const type = typeof layer.type === "string" ? layer.type.toLowerCase() : "tilelayer";
    return type === "tilelayer" && Array.isArray(layer.data);
  });
  if (tileLayers.length === 0) {
    throw new Error("Mapa Tiled sem layer tilelayer com data[]");
  }
  if (preferredName) {
    const named = tileLayers.find((layer) => layer.name === preferredName);
    if (named) return named;
  }
  const visible = tileLayers.find((layer) => layer.visible !== false);
  return visible ?? tileLayers[0]!;
}

function finalizeParsedMap(
  width: number,
  height: number,
  tileWidth: number,
  tileHeight: number,
  data: number[],
  layerName: string,
  tilesetImage: string | null,
  tilesetName: string | null
): ParsedTiledMap {
  assertTiledMapDimensions(width, height);
  if (data.length > TILED_MAP_MAX_TILES) {
    throw new Error("Layer Tiled excede o limite seguro de celulas");
  }
  const expected = width * height;
  const tilemap = data.length >= expected
    ? data.slice(0, expected)
    : [...data, ...Array.from({ length: expected - data.length }, () => 0)];
  return {
    width,
    height,
    tileWidth,
    tileHeight,
    tilemap,
    layerName,
    tilesetImage,
    tilesetName
  };
}

/** Converte JSON Tiled (mapa) no tilemap flat do editor. */
export function parseTiledMapJson(raw: unknown, options: { layerName?: string } = {}): ParsedTiledMap {
  if (!isRecord(raw)) {
    throw new Error("JSON Tiled invalido: raiz precisa ser objeto");
  }
  const document = raw as TiledMapDocument;
  const layer = selectTileLayer(document, options.layerName);
  const width = positiveInteger(layer.width ?? document.width, 0);
  const height = positiveInteger(layer.height ?? document.height, 0);
  assertTiledMapDimensions(width, height);
  const data = tileLayerData(layer);
  if (!data) {
    throw new Error("Layer Tiled sem data[]");
  }
  const tileset = Array.isArray(document.tilesets) ? document.tilesets[0] : undefined;
  return finalizeParsedMap(
    width,
    height,
    positiveInteger(document.tilewidth, 8),
    positiveInteger(document.tileheight, 8),
    data,
    typeof layer.name === "string" && layer.name.trim() ? layer.name.trim() : "Ground",
    typeof tileset?.image === "string" && tileset.image.trim() ? tileset.image.trim() : null,
    typeof tileset?.name === "string" && tileset.name.trim() ? tileset.name.trim() : null
  );
}

function xmlAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"))
    ?? tag.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i"));
  return match?.[1] ?? null;
}

function decodeTiledLayerPayload(encoding: string | null, compression: string | null, payload: string): number[] {
  const normalizedEncoding = (encoding ?? "csv").trim().toLowerCase();
  const normalizedCompression = (compression ?? "").trim().toLowerCase();
  if (normalizedCompression && normalizedCompression !== "none") {
    throw new Error(`TMX com compression="${normalizedCompression}" nao suportado (use CSV ou base64 sem compressao)`);
  }
  if (normalizedEncoding === "csv" || !normalizedEncoding) {
    assertDelimitedEntryLimit(payload);
    return payload
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => {
        const next = Number(token);
        if (!Number.isFinite(next) || next <= 0) return 0;
        return Math.floor(next) & 0x1fffffff;
      });
  }
  if (normalizedEncoding === "base64") {
    const binary = typeof atob === "function"
      ? atob(payload.replace(/\s+/g, ""))
      : Buffer.from(payload.replace(/\s+/g, ""), "base64").toString("binary");
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    if (bytes.length > TILED_MAP_MAX_DECOMPRESSED_BYTES) {
      throw new Error("TMX base64 excede o limite seguro de dados descomprimidos");
    }
    if (bytes.length % 4 !== 0) {
      throw new Error("TMX base64 invalido: tamanho nao multiplo de 4 bytes");
    }
    const gids: number[] = [];
    for (let offset = 0; offset < bytes.length; offset += 4) {
      const gid = bytes[offset]!
        | (bytes[offset + 1]! << 8)
        | (bytes[offset + 2]! << 16)
        | (bytes[offset + 3]! << 24);
      gids.push(gid <= 0 ? 0 : gid & 0x1fffffff);
    }
    return gids;
  }
  throw new Error(`TMX encoding="${normalizedEncoding}" nao suportado`);
}

/** Converte XML TMX (subset CSV/base64 sem compressao) no tilemap flat do editor. */
export function parseTiledMapXml(xml: string, options: { layerName?: string } = {}): ParsedTiledMap {
  assertTiledSourceSize(xml);
  const source = xml.trim();
  if (!source.includes("<map")) {
    throw new Error("TMX invalido: elemento <map> ausente");
  }
  const mapTag = source.match(/<map\b[^>]*>/i)?.[0];
  if (!mapTag) {
    throw new Error("TMX invalido: tag <map> malformada");
  }
  const mapWidth = positiveInteger(Number(xmlAttribute(mapTag, "width")), 0);
  const mapHeight = positiveInteger(Number(xmlAttribute(mapTag, "height")), 0);
  const tileWidth = positiveInteger(Number(xmlAttribute(mapTag, "tilewidth")), 8);
  const tileHeight = positiveInteger(Number(xmlAttribute(mapTag, "tileheight")), 8);

  const layerBlocks = Array.from(source.matchAll(/<layer\b([^>]*)>([\s\S]*?)<\/layer>/gi));
  if (layerBlocks.length === 0) {
    throw new Error("TMX sem <layer> tilelayer");
  }
  const preferred = options.layerName
    ? layerBlocks.find((match) => xmlAttribute(match[1] ?? "", "name") === options.layerName)
    : undefined;
  const selected = preferred ?? layerBlocks[0]!;
  const layerAttrs = selected[1] ?? "";
  const layerBody = selected[2] ?? "";
  const layerName = xmlAttribute(layerAttrs, "name")?.trim() || "Ground";
  const width = positiveInteger(Number(xmlAttribute(layerAttrs, "width")), mapWidth);
  const height = positiveInteger(Number(xmlAttribute(layerAttrs, "height")), mapHeight);
  assertTiledMapDimensions(width, height);
  const dataMatch = layerBody.match(/<data\b([^>]*)>([\s\S]*?)<\/data>/i);
  if (!dataMatch) {
    throw new Error(`TMX layer "${layerName}" sem <data>`);
  }
  const dataAttrs = dataMatch[1] ?? "";
  const payload = (dataMatch[2] ?? "").trim();
  const data = decodeTiledLayerPayload(
    xmlAttribute(dataAttrs, "encoding"),
    xmlAttribute(dataAttrs, "compression"),
    payload
  );

  const tilesetMatch = source.match(/<tileset\b([^>]*)>([\s\S]*?)<\/tileset>/i)
    ?? source.match(/<tileset\b([^>]*)\/>/i);
  const tilesetAttrs = tilesetMatch?.[1] ?? "";
  const tilesetBody = tilesetMatch?.[2] ?? "";
  const tilesetName = xmlAttribute(tilesetAttrs, "name");
  const imageTag = tilesetBody.match(/<image\b[^>]*>/i)?.[0] ?? "";
  const tilesetImage = xmlAttribute(imageTag, "source");

  return finalizeParsedMap(
    width,
    height,
    tileWidth,
    tileHeight,
    data,
    layerName,
    tilesetImage,
    tilesetName
  );
}

/** Detecta JSON ou TMX a partir do texto do arquivo. */
export function parseTiledMapText(text: string, options: { layerName?: string } = {}): ParsedTiledMap {
  assertTiledSourceSize(text);
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Arquivo Tiled vazio");
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseTiledMapJson(JSON.parse(trimmed) as unknown, options);
  }
  if (trimmed.includes("<map")) {
    return parseTiledMapXml(trimmed, options);
  }
  throw new Error("Formato Tiled nao reconhecido (esperado .json ou .tmx)");
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  return Array.isArray(data.scenas)
    ? data.scenas.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

function roomIdOf(room: Record<string, unknown>, index: number): string {
  const id = room.id;
  return typeof id === "string" && id.trim() ? id.trim() : `room-${index + 1}`;
}

function resolveParsedTiledMap(
  source: unknown,
  options: { layerName?: string } = {}
): ParsedTiledMap {
  if (typeof source === "string") {
    return parseTiledMapText(source, options);
  }
  if (isRecord(source)
    && Array.isArray(source.tilemap)
    && typeof source.layerName === "string"
    && typeof source.tileWidth === "number"
    && typeof source.width === "number"
    && typeof source.height === "number") {
    const tilemap = tileLayerData({ data: source.tilemap });
    if (!tilemap) {
      throw new Error("Mapa Tiled pre-parseado sem tilemap valido");
    }
    return finalizeParsedMap(
      positiveInteger(source.width, 0),
      positiveInteger(source.height, 0),
      positiveInteger(source.tileWidth, 8),
      positiveInteger(source.tileHeight, 8),
      tilemap,
      source.layerName,
      typeof source.tilesetImage === "string" ? source.tilesetImage : null,
      typeof source.tilesetName === "string" ? source.tilesetName : null
    );
  }
  return parseTiledMapJson(source, options);
}

function fitTilemapToRoom(parsed: ParsedTiledMap, room: Record<string, unknown>): number[] {
  const targetWidth = positiveInteger(room.width, parsed.width);
  const targetHeight = positiveInteger(room.height, parsed.height);
  assertTiledMapDimensions(targetWidth, targetHeight);
  const fitted = Array.from({ length: targetWidth * targetHeight }, () => 0);
  const copiedWidth = Math.min(parsed.width, targetWidth);
  const copiedHeight = Math.min(parsed.height, targetHeight);
  for (let y = 0; y < copiedHeight; y += 1) {
    for (let x = 0; x < copiedWidth; x += 1) {
      fitted[(y * targetWidth) + x] = parsed.tilemap[(y * parsed.width) + x] ?? 0;
    }
  }
  return fitted;
}

/**
 * Importa mapa Tiled (JSON, TMX texto ou ParsedTiledMap) para o projeto.
 * - Sem targetRoomId: cria room nova.
 * - Com targetRoomId: atualiza width/height/tilemap/background e preserva actors/triggers.
 */
export function importTiledMapIntoProject(
  data: GBAProjectData,
  tiledSource: unknown,
  options: ImportTiledMapOptions
): GBAProjectData {
  const parsed = resolveParsedTiledMap(tiledSource, { layerName: options.layerName });
  const backgroundAssetName = options.backgroundAssetName
    ?? (parsed.tilesetImage
      ? parsed.tilesetImage.split(/[\\/]/).pop() ?? parsed.tilesetImage
      : undefined);

  if (options.targetRoomId) {
    const rooms = projectRooms(data);
    const exists = rooms.some((room, index) => roomIdOf(room, index) === options.targetRoomId);
    if (!exists) {
      throw new Error(`Room alvo nao encontrada: ${options.targetRoomId}`);
    }
    let next = updateRoomFieldsInProject(data, options.targetRoomId, {
      width: parsed.width,
      height: parsed.height,
      ...(backgroundAssetName ? { backgroundAssetName } : {}),
      backgroundRenderMode: "tilemap"
    });
    const nextRooms = projectRooms(next);
    const roomIndex = nextRooms.findIndex((room, index) => roomIdOf(room, index) === options.targetRoomId);
    if (roomIndex < 0) return next;
    const room = nextRooms[roomIndex]!;
    room.tilemap = fitTilemapToRoom(parsed, room);
    room.backgroundRenderMode = "tilemap";
    if (backgroundAssetName) {
      room.backgroundAssetName = backgroundAssetName;
    }
    return {
      ...next,
      scenas: nextRooms
    };
  }

  const createdRoomId = options.roomId?.trim();
  const createdRoomName = options.roomName?.trim();
  if (!createdRoomId || !createdRoomName) {
    throw new Error("roomId e roomName sao obrigatorios ao criar room a partir de mapa Tiled");
  }
  let next = createRoomInProject(data, {
    id: createdRoomId,
    name: createdRoomName,
    width: parsed.width,
    height: parsed.height,
    sceneType: options.sceneType ?? "topdown"
  });
  const rooms = projectRooms(next);
  const roomIndex = rooms.findIndex((room, index) => roomIdOf(room, index) === createdRoomId);
  if (roomIndex < 0) {
    throw new Error(`Falha ao criar room Tiled: ${createdRoomId}`);
  }
  const room = rooms[roomIndex]!;
  room.tilemap = fitTilemapToRoom(parsed, room);
  room.backgroundRenderMode = "tilemap";
  if (backgroundAssetName) {
    room.backgroundAssetName = backgroundAssetName;
  }
  return {
    ...next,
    scenas: rooms
  };
}
