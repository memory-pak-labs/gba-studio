import { sceneTileLayerEmptyTile } from "./sceneTileLayers.js";
import type { GBAProjectData } from "./projectFile.js";

/** Practical upper bound for BG tile indices in a single 4bpp char block on GBA hardware. */
export const tilemapGbaMaxTileIndex = 1023;

export const tilemapAuditWarningLabels = {
  tileIndexAboveHardwareLimit: "Tilemap referencia indice acima do limite pratico do GBA (1023).",
  negativeTileIndex: "Tilemap contem indice de tile negativo invalido."
} as const;

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = (data as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : [];
}

function roomName(room: Record<string, unknown>, index: number): string {
  const name = room.name;
  return typeof name === "string" && name.trim().length > 0 ? name.trim() : `room_${index + 1}`;
}

function numericTileValues(tilemap: unknown): number[] {
  if (!Array.isArray(tilemap)) return [];
  return tilemap
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map(Math.floor);
}

function auditTileValues(roomLabel: string, tilemap: unknown, warnings: Set<string>, sourceCellCount?: number): void {
  const values = numericTileValues(tilemap);
  if (values.length === 0) return;

  const negative = values.filter((value) => value < 0 && value !== sceneTileLayerEmptyTile);
  if (negative.length > 0) {
    warnings.add(`${tilemapAuditWarningLabels.negativeTileIndex} (${roomLabel})`);
  }

  const positive = values.filter((value) => value >= 0);
  if (positive.length === 0) return;

  const maxTileId = Math.max(...positive);
  if (sourceCellCount !== undefined) {
    if (maxTileId > sourceCellCount) warnings.add(`Piso afim referencia celula fora da imagem fonte (${roomLabel}: max=${maxTileId}, cells=${sourceCellCount})`);
  } else if (maxTileId > tilemapGbaMaxTileIndex) {
    warnings.add(`${tilemapAuditWarningLabels.tileIndexAboveHardwareLimit} (${roomLabel}: max=${maxTileId})`);
  }
}

export function auditProjectTilemapWarnings(data: GBAProjectData): string[] {
  const warnings = new Set<string>();

  projectArray(data, "scenas").forEach((room, index) => {
    const label = roomName(room, index);
    const runtime=room.runtime as Record<string,unknown> | undefined;
    const config=runtime?.config as Record<string,unknown> | undefined;
    const visuals=config?.pseudo3dVisuals as Record<string,unknown> | undefined;
    const source=runtime?.type === "racing" && config?.presentation === "pseudo3d" && config?.topdownTrack
      ? projectArray(data,"assets").find(a=>a.name===visuals?.floorTilemapId || a.id===visuals?.floorTilemapId) : undefined;
    const metadata=source?.metadata as Record<string,unknown> | undefined;
    const sourceCells=metadata && Number(metadata.width)>0 && Number(metadata.height)>0
      ? Math.floor(Number(metadata.width)/8)*Math.floor(Number(metadata.height)/8) : undefined;
    // Affine editor IDs address source PNG cells (1-based), before assetc deduplication.
    auditTileValues(label, room.tilemap, warnings,sourceCells);

    const layers = room.layers;
    if (!Array.isArray(layers)) return;
    for (const layer of layers) {
      if (!layer || typeof layer !== "object") continue;
      auditTileValues(`${label}/${String((layer as Record<string, unknown>).mapping ?? "layer")}`, (layer as Record<string, unknown>).tilemap, warnings);
    }
  });

  return [...warnings];
}

/** Critical tilemap issues that should block ROM export until the room tilemap is fixed. */
export function auditProjectTilemapBlockingErrors(data: GBAProjectData): string[] {
  return auditProjectTilemapWarnings(data).map((warning) => `Tilemap: ${warning}`);
}
