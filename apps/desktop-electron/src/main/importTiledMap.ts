import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ImportedAssetFile } from "../shared/ipc.js";
import { parseTiledMapText, TILED_MAP_MAX_SOURCE_BYTES, type ParsedTiledMap } from "../shared/tiledImport.js";
import { resolvePluginPathWithinRoot } from "../shared/pluginPathContainment.js";
import { isSafePluginRelativePath } from "../shared/pluginPathSafety.js";
import { copyFilesIntoProjectAssets } from "./importAssets.js";
import { expandCompressedTiledMapText } from "./tiledMapCompression.js";

export interface PreparedTiledMapImport {
  parsed: ParsedTiledMap;
  sourcePath: string;
  importedTileset?: ImportedAssetFile;
  backgroundAssetName?: string;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveTilesetSourcePath(mapPath: string, tilesetImage: string | null): Promise<string | null> {
  if (!tilesetImage) return null;
  const normalized = tilesetImage.trim().replaceAll("\\", "/");
  if (!isSafePluginRelativePath(normalized)) {
    throw new Error(`Fonte de tileset Tiled insegura: ${tilesetImage}`);
  }
  const resolved = await resolvePluginPathWithinRoot(path.dirname(mapPath), normalized);
  if (!resolved) {
    throw new Error(`Fonte de tileset Tiled fora da pasta do mapa: ${tilesetImage}`);
  }
  return resolved;
}

/** Lê .json/.tmx, parseia e copia o PNG do tileset quando existir ao lado do mapa. */
export async function prepareTiledMapImport(
  projectPath: string,
  mapPath: string
): Promise<PreparedTiledMapImport> {
  const sourceStats = await stat(mapPath);
  if (sourceStats.size > TILED_MAP_MAX_SOURCE_BYTES) {
    throw new Error("Mapa Tiled excede o limite de tamanho para importacao segura.");
  }
  const text = expandCompressedTiledMapText(await readFile(mapPath, "utf8"));
  const parsed = parseTiledMapText(text);
  const tilesetSource = await resolveTilesetSourcePath(mapPath, parsed.tilesetImage);
  if (!tilesetSource || !(await fileExists(tilesetSource))) {
    return {
      parsed,
      sourcePath: mapPath,
      backgroundAssetName: parsed.tilesetImage
        ? path.basename(parsed.tilesetImage)
        : undefined
    };
  }

  const [importedTileset] = await copyFilesIntoProjectAssets(
    projectPath,
    [tilesetSource],
    randomUUID,
    { forcedKind: "Tileset" }
  );
  return {
    parsed,
    sourcePath: mapPath,
    importedTileset,
    backgroundAssetName: importedTileset?.name
      ?? path.basename(tilesetSource)
  };
}
