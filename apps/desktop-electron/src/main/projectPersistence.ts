import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { OpenProjectResult } from "../shared/ipc.js";
import type { ParsedGBAProject } from "../shared/projectFile.js";
import { parseGBAProjectFile, serializeGBAProjectFile } from "../shared/projectFile.js";
import {
  compactProjectTilemaps,
  expandProjectTilemaps,
  isSplitProjectManifest,
  joinSplitProjectResources,
  splitProjectResources,
  type SplitProjectManifest,
  type SplitProjectResource
} from "../shared/projectResourceFormat.js";
import { projectSlug } from "../shared/projectPaths.js";
import { resolvePluginPathWithinRoot } from "../shared/pluginPathContainment.js";
import { importGBStudioProject } from "./gbStudioProjectImport.js";

export interface SaveProjectFileOptions {
  appPath?: string;
  bundledAssetConflictPolicy?: "preserve" | "replace";
}

const ASSETS_FOLDER_NAME = "Assets";

const CURRENT_TEMPLATE_ASSET_FILES: Record<string, string> = {
  "topdown-player-4dir": "sprites/nara-topdown.png",
  "point-click-actor": "sprites/point-click-keeper-lantern.png",
  "point-click-cursor": "sprites/point-click-cursor.png",
  "platformer-player": "sprites/penedos-v10-nara.png",
  "isometric-actor": "sprites/player-pilot-32x32.png",
  "shmup-player": "sprites/tempestade-v3-player.png",
  "shmup-projectile": "sprites/storm-shot.png",
  "shmup-enemy": "sprites/tempestade-v3-drone-horizontal.png",
  "dialogue-box": "ui/frame-lumen-v2.png",
  "dialogue-portrait": "sprites/nara-portrait.png",
  "dialogue-selector": "ui/dialogue-selector-gba-v4.png",
  "isometric-sandbox-tiles": "backgrounds/tactical-v5-surface.png",
  "template:exemplo-gba/Assets/fonts/gba-variable-font.png": "fonts/gba-dialogue-font-v3.png"
};

export function resolveProjectSaveDestination(
  currentPath: string | undefined,
  selectedPath: string,
  projectName: string
): string {
  if (currentPath) return currentPath;

  const slug = projectSlug(projectName);
  const selectedDirectory = path.dirname(selectedPath);
  const projectDirectory = path.basename(selectedDirectory).toLowerCase() === slug.toLowerCase()
    ? selectedDirectory
    : path.join(selectedDirectory, slug);
  return path.join(projectDirectory, `${slug}.gba-project`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function projectBuildSettings(project: ParsedGBAProject): Record<string, unknown> {
  const settings = isRecord(project.data.settings) ? project.data.settings : {};
  return isRecord(settings.build) ? settings.build : {};
}

async function safeProjectResourcePath(projectPath: string, relativePath: string): Promise<string> {
  if (path.isAbsolute(relativePath)) throw new Error(`Recurso split usa caminho absoluto: ${relativePath}`);
  const root = path.resolve(path.dirname(projectPath));
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Recurso split fora do projeto: ${relativePath}`);
  }
  const containedPath = await resolvePluginPathWithinRoot(root, relativePath.replaceAll("\\", "/"));
  if (!containedPath) throw new Error(`Recurso split fora do projeto: ${relativePath}`);
  return containedPath;
}

async function readSplitProject(projectPath: string, manifest: SplitProjectManifest): Promise<ParsedGBAProject> {
  const resources = await Promise.all(manifest.resources.map(async (reference) => {
    const resourcePath = await safeProjectResourcePath(projectPath, reference.path);
    return JSON.parse(await readFile(resourcePath, "utf8")) as SplitProjectResource;
  }));
  const data = joinSplitProjectResources(manifest, resources);
  return parseGBAProjectFile(JSON.stringify(data));
}

async function writeJsonAtomically(destination: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporaryPath, destination);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function writeSplitResource(projectPath: string, resource: SplitProjectResource): Promise<string> {
  const destination = await safeProjectResourcePath(projectPath, resource.path);
  const contents = `${JSON.stringify(resource, null, 2)}\n`;
  if (!(await fileExists(destination))) {
    await writeJsonAtomically(destination, resource);
    return resource.path;
  }
  if (await readFile(destination, "utf8") === contents) return resource.path;

  // Keep every resource referenced by the last committed manifest intact.
  // A failed save can leave an unreferenced revision, never a mixed project.
  const digest = createHash("sha256").update(contents).digest("hex");
  const revisionPath = resource.path.replace(/\.gbares$/, `.${digest}.gbares`);
  const revision = { ...resource, path: revisionPath };
  const revisionDestination = await safeProjectResourcePath(projectPath, revisionPath);
  if (await fileExists(revisionDestination)) {
    if (await readFile(revisionDestination, "utf8") !== `${JSON.stringify(revision, null, 2)}\n`) {
      throw new Error(`Revisão de recurso split divergente: ${revisionPath}`);
    }
  } else {
    await writeJsonAtomically(revisionDestination, revision);
  }
  return revisionPath;
}

function bundledDefaultAssetPath(appPath: string, bundledDefaultAsset: string): string | null {
  const templatePrefix = "template:";
  if (!bundledDefaultAsset.startsWith(templatePrefix)) return null;
  const relativePath = bundledDefaultAsset.slice(templatePrefix.length).replaceAll("\\", "/");
  const normalizedPath = path.posix.normalize(relativePath);
  if (
    !normalizedPath ||
    normalizedPath === "." ||
    normalizedPath === ".." ||
    normalizedPath.startsWith("../") ||
    path.posix.isAbsolute(normalizedPath)
  ) {
    return null;
  }

  const templatesRoot = path.resolve(appPath, "default-assets", "templates");
  const resolvedPath = path.resolve(templatesRoot, ...normalizedPath.split("/"));
  return resolvedPath.startsWith(`${templatesRoot}${path.sep}`) ? resolvedPath : null;
}

function currentTemplateDefaultAssetPath(appPath: string, bundledDefaultAsset: string): string | null {
  const relativePath = CURRENT_TEMPLATE_ASSET_FILES[bundledDefaultAsset];
  return relativePath
    ? path.join(appPath, "default-assets", "templates", "exemplo-gba", "Assets", relativePath)
    : null;
}

async function materializeBundledDefaultAssets(
  destination: string,
  project: ParsedGBAProject,
  appPath: string,
  conflictPolicy: NonNullable<SaveProjectFileOptions["bundledAssetConflictPolicy"]>
): Promise<void> {
  const assets = Array.isArray(project.data.assets) ? project.data.assets.filter(isRecord) : [];
  for (const asset of assets) {
    const metadata = isRecord(asset.metadata) ? asset.metadata : null;
    const bundledDefaultAsset = typeof metadata?.bundledDefaultAsset === "string" ? metadata.bundledDefaultAsset.trim() : "";
    const source = typeof metadata?.source === "string" ? metadata.source.trim() : "";
    if (!bundledDefaultAsset || !source) continue;

    let sourcePath = bundledDefaultAssetPath(appPath, bundledDefaultAsset);
    if (!sourcePath || !(await fileExists(sourcePath))) {
      const currentTemplatePath = currentTemplateDefaultAssetPath(appPath, bundledDefaultAsset);
      if (currentTemplatePath && await fileExists(currentTemplatePath)) sourcePath = currentTemplatePath;
    }
    if (!sourcePath) continue;

    const targetPath = await resolvePluginPathWithinRoot(path.dirname(destination), source.replaceAll("\\", "/"));
    if (!targetPath) continue;
    const targetExists = await fileExists(targetPath);
    if (targetExists && conflictPolicy === "preserve") continue;
    if (targetExists) {
      const [sourceBytes, targetBytes] = await Promise.all([
        readFile(sourcePath),
        readFile(targetPath)
      ]);
      if (sourceBytes.equals(targetBytes)) continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }
}

export async function openProjectFile(projectPath: string): Promise<OpenProjectResult> {
  try {
    if (path.extname(projectPath).toLowerCase() === ".gbsproj") {
      const imported = await importGBStudioProject(projectPath);
      return {
        canceled: false,
        path: imported.projectPath,
        project: imported.project,
        importReport: {
          kind: "gb-studio",
          sourcePath: imported.sourceProjectPath,
          resourceCount: imported.report.resourceCount,
          copiedAssetCount: imported.report.copiedAssetCount,
          translatedEventCount: imported.report.translatedEventCount,
          unsupportedEventCount: imported.report.unsupportedEventCount,
          warningCount: imported.report.warnings.length,
          diagnosticCount: imported.report.diagnostics.length
        }
      };
    }
    const contents = await readFile(projectPath, "utf8");
    const raw = JSON.parse(contents) as unknown;
    if (isSplitProjectManifest(raw)) {
      return {
        canceled: false,
        path: projectPath,
        project: await readSplitProject(projectPath, raw)
      };
    }
    return {
      canceled: false,
      path: projectPath,
      project: parseGBAProjectFile(JSON.stringify(expandProjectTilemaps(raw as Record<string, unknown>)))
    };
  } catch (error) {
    return {
      canceled: false,
      path: projectPath,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

const pendingProjectSaves = new Map<string, Promise<void>>();

export async function saveProjectFileAtomically(
  destination: string,
  project: ParsedGBAProject,
  options: SaveProjectFileOptions = {}
): Promise<void> {
  const key = path.resolve(destination);
  const snapshot = structuredClone(project);
  const save = (pendingProjectSaves.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => writeProjectFileAtomically(destination, snapshot, { ...options }));
  pendingProjectSaves.set(key, save);
  try {
    await save;
  } finally {
    if (pendingProjectSaves.get(key) === save) pendingProjectSaves.delete(key);
  }
}

async function writeProjectFileAtomically(
  destination: string,
  project: ParsedGBAProject,
  options: SaveProjectFileOptions = {}
): Promise<void> {
  const directory = path.dirname(destination);
  const basename = path.basename(destination);
  const temporaryPath = path.join(directory, `.${basename}.${randomUUID()}.tmp`);

  try {
    await mkdir(directory, { recursive: true });
    await mkdir(path.join(directory, ASSETS_FOLDER_NAME), { recursive: true });
    const buildSettings = projectBuildSettings(project);
    const splitResources = buildSettings.splitProjectResources === true;
    const compactTilemaps = buildSettings.compactTilemaps !== false;
    if (splitResources) {
      const split = splitProjectResources(project.data);
      for (const [index, resource] of split.resources.entries()) {
        split.manifest.resources[index]!.path = await writeSplitResource(destination, resource);
      }
      await writeFile(temporaryPath, `${JSON.stringify(split.manifest, null, 2)}\n`, "utf8");
    } else if (compactTilemaps) {
      await writeFile(temporaryPath, `${JSON.stringify(compactProjectTilemaps(project.data), null, 2)}\n`, "utf8");
    } else {
      await writeFile(temporaryPath, serializeGBAProjectFile(project), "utf8");
    }
    await materializeBundledDefaultAssets(
      destination,
      project,
      options.appPath ?? process.cwd(),
      options.bundledAssetConflictPolicy ?? "preserve"
    );
    await rename(temporaryPath, destination);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
