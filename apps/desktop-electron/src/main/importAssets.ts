import { access, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImportedAssetFile } from "../shared/ipc.js";
import { assetKindForFileName, systemImageForAssetKind } from "../shared/filesWorkspace.js";
import { convertSoundFont } from "./soundFont.js";
import { validateAssetReplacement } from "./assetReplacementFormat.js";
import { resolvePluginPathWithinRoot } from "../shared/pluginPathContainment.js";

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
    if (tokenMatches(sourcePath, ["background", "backgrounds", "fundo", "fundos"])) {
      return "Background";
    }
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
    if (fileExtension(sourcePath) === "sf2") {
      if ((await stat(sourcePath)).size > 128 * 1024 * 1024) throw new Error("SoundFont: banco maior que 128 MiB.");
      const converted = convertSoundFont(await readFile(sourcePath), path.basename(sourcePath));
      const audioDirectory = path.join(projectDirectory, ASSETS_FOLDER_NAME, "audio");
      await mkdir(audioDirectory, { recursive: true });
      const directory = await mkdtemp(path.join(audioDirectory, "sf2-"));
      const generated: ImportedAssetFile[] = [];
      try {
        for (const [index, instrument] of converted.instruments.entries()) {
          const fileName = `zone-${index + 1}.wav`;
          await writeFile(path.join(directory, fileName), instrument.wav, { flag: "wx" });
          generated.push({ id: makeAssetID(), name: `${path.basename(directory)}-${fileName}`,
            relativePath: `${ASSETS_FOLDER_NAME}/audio/${path.basename(directory)}/${fileName}`, kind: "Audio", systemImage: "music.note",
            metadata: { soundFontInstrument: { name: instrument.name, sampleRootNote: instrument.rootNote, sampleLoop: instrument.loop, envelope: "Soft ADSR" },
              soundFont: { sourceName: path.basename(sourcePath), sourceSha256: converted.sourceSha256, copyright: converted.copyright,
                preset: instrument.preset, bank: instrument.bank, keyRange: instrument.keyRange, velocityRange: instrument.velocityRange,
                warnings: converted.warnings } } });
        }
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
      }
      importedAssets.push(...generated);
      continue;
    }
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
  const currentSource = relativePath.replaceAll("\\", "/");
  const name = path.posix.basename(currentSource);
  if (!name || name === "." || name === "..") throw new Error("O destino de reimportacao precisa permanecer dentro da pasta do projeto.");
  const bytes = await readFile(sourcePath);
  validateAssetReplacement(bytes, sourcePath, name);
  const revisionsPath = `${ASSETS_FOLDER_NAME}/revisions`;
  const revisionsDirectory = await resolvePluginPathWithinRoot(projectDirectory, revisionsPath);
  if (!revisionsDirectory) throw new Error("O destino de reimportacao precisa permanecer dentro da pasta do projeto.");

  const id = makeAssetID();
  await mkdir(revisionsDirectory, { recursive: true });
  const revisionDirectory = await mkdtemp(path.join(revisionsDirectory, "asset-"));
  try {
    // The previous file can still be used by the saved project or an undo entry.
    await writeFile(path.join(revisionDirectory, name), bytes, { flag: "wx" });
  } catch (error) {
    await rm(revisionDirectory, { recursive: true, force: true });
    throw error;
  }

  const kind = importedAssetKindForSourcePath(currentSource);
  return {
    id,
    name,
    relativePath: `${revisionsPath}/${path.basename(revisionDirectory)}/${name}`,
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
