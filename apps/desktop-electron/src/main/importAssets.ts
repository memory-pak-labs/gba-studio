import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ImportedAssetFile } from "../shared/ipc.js";
import { assetKindForFileName, systemImageForAssetKind } from "../shared/filesWorkspace.js";

const ASSETS_FOLDER_NAME = "Assets";
const IMAGE_EXTENSIONS = ["apng", "bmp", "gif", "jpg", "jpeg", "png", "webp"];
const MUSIC_EXTENSIONS = ["it", "mod", "s3m", "xm"];
const SFX_EXTENSIONS = ["flac", "mp3", "ogg", "wav"];

export type AssetIDFactory = () => string;

export interface CopyReferenceImageIntoProjectAssetsOptions {
  projectPath: string;
  referenceAssetName: string;
  spriteSheetName: string;
}

export interface CopiedReferenceImageAsset {
  name: string;
  relativePath: string;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function uniqueDestinationPath(assetsDirectory: string, fileName: string): Promise<string> {
  const parsed = path.parse(fileName);
  let candidate = path.join(assetsDirectory, fileName);
  let index = 2;

  while (await fileExists(candidate)) {
    candidate = path.join(assetsDirectory, `${parsed.name} ${index}${parsed.ext}`);
    index += 1;
  }

  return candidate;
}

function fileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
}

function sourcePathTokens(sourcePath: string): string[] {
  return sourcePath
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[\\/._\-\s]+/)
    .filter(Boolean);
}

function tokenMatches(sourcePath: string, candidates: string[]): boolean {
  const tokens = sourcePathTokens(sourcePath);
  return candidates.some((candidate) => tokens.includes(candidate));
}

function importedAssetKindForSourcePath(sourcePath: string): string {
  const extension = fileExtension(sourcePath);

  if (MUSIC_EXTENSIONS.includes(extension) || tokenMatches(sourcePath, ["music", "musica", "musicas", "song", "songs", "bgm"])) {
    return "Musica";
  }

  if (SFX_EXTENSIONS.includes(extension) || tokenMatches(sourcePath, ["sfx", "sound", "sounds", "som", "sons"])) {
    return "SFX";
  }

  if (IMAGE_EXTENSIONS.includes(extension)) {
    if (tokenMatches(sourcePath, ["tile", "tiles", "tileset", "tilesets", "tilemap"])) {
      return "Tileset";
    }
    if (tokenMatches(sourcePath, ["ui", "dialogue", "dialogo", "dialogos", "dialog", "box", "frame", "cursor", "selector", "seletor"])) {
      return "UI";
    }
    if (tokenMatches(sourcePath, ["emote", "emotes", "emoji", "emojis", "emotion", "square"])) {
      return "Emote";
    }
    return "Sprite";
  }

  return assetKindForFileName(sourcePath);
}

function assetFolderForKind(kind: string): string {
  switch (kind) {
    case "Sprite":
      return "sprites";
    case "Tileset":
      return "tilesets";
    case "UI":
      return "ui";
    case "Emote":
      return "emotes";
    case "Background":
    case "Fundo":
      return "backgrounds";
    case "Animation Source":
      return "animations";
    case "Musica":
      return "music";
    case "SFX":
      return "sfx";
    case "Audio":
      return "audio";
    default:
      return "files";
  }
}

function assetsRelativePath(folderName: string, fileName: string): string {
  return `${ASSETS_FOLDER_NAME}/${folderName}/${fileName}`;
}

function projectRelativeSourcePath(projectPath: string, source: string): string {
  if (path.isAbsolute(source)) {
    return source;
  }

  return path.resolve(path.dirname(projectPath), source);
}

export interface CopyFilesIntoProjectAssetsOptions {
  forcedKind?: string;
}

export async function copyFilesIntoProjectAssets(
  projectPath: string,
  sourcePaths: string[],
  makeAssetID: AssetIDFactory,
  options: CopyFilesIntoProjectAssetsOptions = {}
): Promise<ImportedAssetFile[]> {
  const projectDirectory = path.dirname(projectPath);

  const importedAssets: ImportedAssetFile[] = [];
  for (const sourcePath of sourcePaths) {
    const kind = options.forcedKind ?? importedAssetKindForSourcePath(sourcePath);
    const assetFolder = assetFolderForKind(kind);
    const assetsDirectory = path.join(projectDirectory, ASSETS_FOLDER_NAME, assetFolder);
    await mkdir(assetsDirectory, { recursive: true });

    const destination = await uniqueDestinationPath(assetsDirectory, path.basename(sourcePath));
    await copyFile(sourcePath, destination);

    const name = path.basename(destination);
    importedAssets.push({
      id: makeAssetID(),
      name,
      relativePath: assetsRelativePath(assetFolder, name),
      kind,
      systemImage: systemImageForAssetKind(kind)
    });
  }

  return importedAssets;
}

export async function reimportFileIntoProjectAsset(
  projectPath: string,
  sourcePath: string,
  relativePath: string,
  makeAssetID: AssetIDFactory
): Promise<ImportedAssetFile> {
  const projectDirectory = path.resolve(path.dirname(projectPath));
  const destination = path.resolve(projectDirectory, relativePath);
  if (!destination.startsWith(`${projectDirectory}${path.sep}`)) {
    throw new Error("O destino de reimportacao precisa permanecer dentro da pasta do projeto.");
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(sourcePath, destination);
  const name = path.basename(destination);
  const kind = importedAssetKindForSourcePath(relativePath);
  return {
    id: makeAssetID(),
    name,
    relativePath: relativePath.replaceAll(path.sep, "/"),
    kind,
    systemImage: systemImageForAssetKind(kind)
  };
}

export async function copyReferenceImageIntoProjectAssets(
  options: CopyReferenceImageIntoProjectAssetsOptions
): Promise<CopiedReferenceImageAsset> {
  const projectDirectory = path.dirname(options.projectPath);
  const assetsDirectory = path.join(projectDirectory, ASSETS_FOLDER_NAME, "sprites");
  await mkdir(assetsDirectory, { recursive: true });

  const sourcePath = projectRelativeSourcePath(options.projectPath, options.referenceAssetName);
  const destination = await uniqueDestinationPath(assetsDirectory, path.basename(options.spriteSheetName));
  await copyFile(sourcePath, destination);

  const name = path.basename(destination);
  return {
    name,
    relativePath: assetsRelativePath("sprites", name)
  };
}
