import { access, copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import type { LoadedGBAStudioPlugin } from "./gbaStudioPlugins.js";
import { resolvePluginPathWithinRoot } from "./pluginPathContainment.js";
import { isSafePluginRelativePath } from "./pluginPathSafety.js";

export interface PluginAssetDefinition {
  source: string;
  kind?: string;
  name?: string;
}

export interface PluginImportedAssetRecord {
  pluginId: string;
  source: string;
  relativePath: string;
  name: string;
  kind: string;
}

const ASSETS_FOLDER_NAME = "Assets";

const IMAGE_EXTENSIONS = new Set(["apng", "bmp", "gif", "jpg", "jpeg", "png", "webp"]);
const MUSIC_EXTENSIONS = new Set(["it", "mod", "s3m", "xm"]);
const SFX_EXTENSIONS = new Set(["flac", "mp3", "ogg", "wav"]);

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function fileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
}

function inferAssetKind(relativePath: string, explicitKind?: string): string {
  const trimmed = explicitKind?.trim();
  if (trimmed) return trimmed;

  const extension = fileExtension(relativePath);
  const lowerPath = relativePath.toLowerCase();

  if (MUSIC_EXTENSIONS.has(extension) || lowerPath.includes("/music/")) return "Musica";
  if (SFX_EXTENSIONS.has(extension) || lowerPath.includes("/sounds/") || lowerPath.includes("/sfx/")) return "SFX";
  if (lowerPath.includes("/tiles/") || lowerPath.includes("tileset")) return "Tileset";
  if (lowerPath.includes("/ui/")) return "UI";
  if (IMAGE_EXTENSIONS.has(extension)) return "Sprite";
  return "Asset";
}

function assetFolderForKind(kind: string): string {
  if (kind === "Musica") return "music";
  if (kind === "SFX") return "sounds";
  if (kind === "Tileset") return "tiles";
  if (kind === "UI") return "ui";
  if (kind === "Sprite") return "sprites";
  return "misc";
}

async function uniqueDestinationPath(assetsDirectory: string, fileName: string): Promise<string> {
  const parsed = path.parse(fileName);
  let candidate = path.join(assetsDirectory, fileName);
  let index = 2;
  while (await fileExists(candidate)) {
    candidate = path.join(assetsDirectory, `${parsed.name}_${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

function manifestAssetDefinitions(plugin: LoadedGBAStudioPlugin): PluginAssetDefinition[] {
  const manifestAssets = Array.isArray((plugin.manifest as { assets?: unknown }).assets)
    ? (plugin.manifest as { assets: unknown[] }).assets
    : [];
  const parsed: PluginAssetDefinition[] = [];

  for (const asset of manifestAssets) {
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) continue;
    const record = asset as Record<string, unknown>;
    const source = typeof record.source === "string" ? record.source.trim() : "";
    if (!source) continue;
    parsed.push({
      source,
      kind: typeof record.kind === "string" ? record.kind : undefined,
      name: typeof record.name === "string" ? record.name : undefined
    });
  }

  return parsed;
}

async function discoverAssetsDirectory(plugin: LoadedGBAStudioPlugin): Promise<string[]> {
  const assetsDirectory = path.join(plugin.pluginRoot, "assets");
  if (!(await fileExists(assetsDirectory))) return [];

  const discovered: string[] = [];
  async function walk(directory: string, prefix = ""): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, relative);
        continue;
      }
      if (entry.isFile()) {
        discovered.push(`assets/${relative.replace(/\\/g, "/")}`);
      }
    }
  }

  await walk(assetsDirectory);
  return discovered;
}

export async function applyPluginAssetPack(
  plugin: LoadedGBAStudioPlugin,
  projectRoot: string
): Promise<{ imported: PluginImportedAssetRecord[]; errors: string[] }> {
  const imported: PluginImportedAssetRecord[] = [];
  const errors: string[] = [];
  const manifestAssets = manifestAssetDefinitions(plugin);
  const discoveredAssets = plugin.normalizedType === "assetPack" ? await discoverAssetsDirectory(plugin) : [];
  const sourcePaths = new Set([
    ...manifestAssets.map((asset) => asset.source),
    ...discoveredAssets
  ]);

  for (const source of sourcePaths) {
    const manifestAsset = manifestAssets.find((asset) => asset.source === source);
    if (!isSafePluginRelativePath(source)) {
      errors.push(`Asset de plugin com caminho inseguro: ${source}`);
      continue;
    }

    const absoluteSource = await resolvePluginPathWithinRoot(plugin.pluginRoot, source);
    if (!absoluteSource) {
      errors.push(`Asset de plugin com caminho inseguro: ${source}`);
      continue;
    }
    if (!(await fileExists(absoluteSource))) {
      errors.push(`Asset de plugin ausente: ${source}`);
      continue;
    }

    const fileName = path.basename(source);
    const kind = inferAssetKind(source, manifestAsset?.kind);
    const assetsDirectory = path.join(projectRoot, ASSETS_FOLDER_NAME, assetFolderForKind(kind));
    await mkdir(assetsDirectory, { recursive: true });
    const destination = await uniqueDestinationPath(assetsDirectory, fileName);
    await copyFile(absoluteSource, destination);

    const relativePath = path.relative(projectRoot, destination).replace(/\\/g, "/");
    imported.push({
      pluginId: plugin.manifest.id,
      source,
      relativePath,
      name: manifestAsset?.name?.trim() || path.parse(fileName).name,
      kind
    });
  }

  return { imported, errors };
}
