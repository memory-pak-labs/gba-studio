import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyPluginAssetPack } from "../shared/gbaStudioPluginAssets.js";
import { loadPluginDataTables } from "./gbaStudioPluginDataTablesLoader.js";
import {
  pluginRepositoryEntryArchiveURL,
  parsePluginRepositoryJson,
  validatePluginRepositoryEntry,
  type PluginRepository,
  type PluginRepositoryEntry
} from "../shared/gbaStudioPluginRepository.js";
import {
  buildProjectPluginRegistry,
  loadedPluginFromManifest,
  parsePluginManifestJson,
  resolveProjectRootFromProjectPath,
  validatePluginManifest,
  type GBAStudioPluginManifest,
  type PluginImportedAssetRecord
} from "../shared/gbaStudioPlugins.js";
import { resolvePluginPathWithinRoot } from "../shared/pluginPathContainment.js";

const PLUGINS_FOLDER_NAME = "plugins";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isZipPath(sourcePath: string): boolean {
  return sourcePath.toLowerCase().endsWith(".zip");
}

function isUnsafeArchiveEntry(entryPath: string): boolean {
  const normalized = entryPath.replace(/\\/g, "/");
  return (
    path.isAbsolute(normalized) ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.endsWith("/..")
  );
}

async function findPluginManifestFiles(rootDirectory: string): Promise<string[]> {
  const manifests: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === "plugin.json") {
        manifests.push(entryPath);
      }
    }
  }

  if (await fileExists(rootDirectory)) {
    await walk(rootDirectory);
  }

  return manifests.sort();
}

export async function loadProjectPlugins(projectPath: string) {
  const projectRoot = resolveProjectRootFromProjectPath(projectPath);
  const pluginsDirectory = path.join(projectRoot, PLUGINS_FOLDER_NAME);
  const manifestPaths = await findPluginManifestFiles(pluginsDirectory);
  const plugins = [];
  const errors = [];
  const dataTables = [];
  const importedAssets: PluginImportedAssetRecord[] = [];

  for (const manifestPath of manifestPaths) {
    const parsed = parsePluginManifestJson(await readFile(manifestPath, "utf8"));
    if ("error" in parsed) {
      errors.push({ manifestPath, message: parsed.error });
      continue;
    }

    const loaded = loadedPluginFromManifest(parsed.manifest, path.dirname(manifestPath), manifestPath);
    if (!loaded) {
      errors.push({ manifestPath, message: `Tipo de plugin desconhecido: ${parsed.manifest.type}.` });
      continue;
    }

    plugins.push(loaded);

    if (loaded.normalizedType === "dataTablePack" || (loaded.manifest.dataTables?.length ?? 0) > 0) {
      const tableLoad = await loadPluginDataTables(loaded);
      dataTables.push(...tableLoad.tables);
      for (const tableError of tableLoad.errors) {
        errors.push({ manifestPath: tableError.source, message: tableError.message });
      }
    }
  }

  return buildProjectPluginRegistry(plugins, errors, { dataTables, importedAssets });
}

async function copyPluginDirectory(sourceRoot: string, destinationRoot: string): Promise<void> {
  await cp(sourceRoot, destinationRoot, { recursive: true, force: false, errorOnExist: true });
}

async function extractZipArchive(zipPath: string, destinationDirectory: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  await mkdir(destinationDirectory, { recursive: true });
  if (process.platform === "win32") {
    await execFileAsync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destinationDirectory.replace(/'/g, "''")}' -Force`
      ],
      { windowsHide: true }
    );
    return;
  }

  await execFileAsync("unzip", ["-q", zipPath, "-d", destinationDirectory]);
}

async function findSinglePluginRoot(extractedDirectory: string): Promise<{ pluginRoot: string; manifestPath: string } | { error: string }> {
  const manifestPaths = await findPluginManifestFiles(extractedDirectory);
  if (manifestPaths.length === 0) return { error: "Archive nao contem plugin.json." };
  if (manifestPaths.length > 1) return { error: "Archive deve conter exatamente um plugin.json." };
  const manifestPath = manifestPaths[0]!;
  return {
    pluginRoot: path.dirname(manifestPath),
    manifestPath
  };
}

async function validateArchiveEntries(zipPath: string): Promise<{ ok: true } | { error: string }> {
  if (process.platform === "win32") {
    return { ok: true };
  }

  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync("unzip", ["-Z1", zipPath]);
  const entries = stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  if (entries.some(isUnsafeArchiveEntry)) {
    return { error: "Archive contem caminhos inseguros." };
  }
  return { ok: true };
}

export interface InstallPluginOptions {
  replacingExisting?: boolean;
}

export interface InstallPluginResult {
  ok: boolean;
  pluginId?: string;
  destination?: string;
  error?: string;
  registry?: ReturnType<typeof buildProjectPluginRegistry>;
  importedAssets?: PluginImportedAssetRecord[];
}

async function applyInstalledPluginSideEffects(
  projectPath: string,
  plugin: NonNullable<ReturnType<typeof loadedPluginFromManifest>>
): Promise<{ importedAssets: PluginImportedAssetRecord[]; errors: string[] }> {
  const projectRoot = resolveProjectRootFromProjectPath(projectPath);
  if (plugin.normalizedType !== "assetPack" && !(plugin.manifest.assets?.length ?? 0)) {
    return { importedAssets: [], errors: [] };
  }
  const applied = await applyPluginAssetPack(plugin, projectRoot);
  return { importedAssets: applied.imported, errors: applied.errors };
}

export async function fetchPluginRepository(repositoryURL: string): Promise<{ repository: PluginRepository } | { error: string }> {
  const trimmed = repositoryURL.trim();
  if (!trimmed) return { error: "URL do catalogo vazia." };

  try {
    const response = await fetch(trimmed);
    if (!response.ok) {
      return { error: `Falha ao baixar catalogo (${response.status}).` };
    }
    const text = await response.text();
    const parsed = parsePluginRepositoryJson(text);
    if ("error" in parsed) return parsed;
    return parsed;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function downloadRepositoryArchive(archiveURL: string, destinationPath: string): Promise<{ ok: true } | { error: string }> {
  try {
    const response = await fetch(archiveURL);
    if (!response.ok) {
      return { error: `Falha ao baixar plugin (${response.status}).` };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(destinationPath, buffer);
    return { ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function installPluginFromRepositoryEntry(
  projectPath: string,
  repositoryBaseURL: string,
  entry: PluginRepositoryEntry,
  options: InstallPluginOptions = {}
): Promise<InstallPluginResult> {
  const validated = validatePluginRepositoryEntry(entry);
  if ("error" in validated) return { ok: false, error: validated.error };
  const projectRoot = resolveProjectRootFromProjectPath(projectPath);
  const archiveURL = pluginRepositoryEntryArchiveURL(repositoryBaseURL, validated.entry);
  const temporaryArchive = path.join(projectRoot, `.plugin-download-${process.pid}-${Date.now()}.zip`);

  try {
    const downloaded = await downloadRepositoryArchive(archiveURL, temporaryArchive);
    if ("error" in downloaded) {
      return { ok: false, error: downloaded.error };
    }
    // Keep the archive alive until extraction and manifest validation finish.
    return await installPluginIntoProject(projectPath, temporaryArchive, options);
  } finally {
    await rm(temporaryArchive, { force: true });
  }
}

export async function installPluginIntoProject(
  projectPath: string,
  sourcePath: string,
  options: InstallPluginOptions = {}
): Promise<InstallPluginResult> {
  const projectRoot = resolveProjectRootFromProjectPath(projectPath);
  const pluginsDirectory = path.join(projectRoot, PLUGINS_FOLDER_NAME);
  let pluginRoot = sourcePath;
  let manifestPath = path.join(sourcePath, "plugin.json");
  let temporaryDirectory: string | null = null;

  try {
    if (isZipPath(sourcePath)) {
      const archiveValidation = await validateArchiveEntries(sourcePath);
      if ("error" in archiveValidation) {
        return { ok: false, error: archiveValidation.error };
      }

      temporaryDirectory = path.join(projectRoot, `.plugin-install-${process.pid}-${Date.now()}`);
      await extractZipArchive(sourcePath, temporaryDirectory);
      const resolved = await findSinglePluginRoot(temporaryDirectory);
      if ("error" in resolved) {
        return { ok: false, error: resolved.error };
      }
      pluginRoot = resolved.pluginRoot;
      manifestPath = resolved.manifestPath;
    } else if (!(await fileExists(manifestPath))) {
      return { ok: false, error: "Pasta selecionada nao contem plugin.json." };
    }

    const parsed = parsePluginManifestJson(await readFile(manifestPath, "utf8"));
    if ("error" in parsed) {
      return { ok: false, error: parsed.error };
    }

    await mkdir(pluginsDirectory, { recursive: true });
    const safePluginsDirectory = await resolvePluginPathWithinRoot(projectRoot, PLUGINS_FOLDER_NAME);
    const destination = safePluginsDirectory
      ? await resolvePluginPathWithinRoot(safePluginsDirectory, parsed.manifest.id)
      : null;
    if (!destination) {
      return { ok: false, error: "Destino de plugin inseguro." };
    }

    if ((await fileExists(destination)) && !options.replacingExisting) {
      return { ok: false, error: `Plugin ${parsed.manifest.id} ja esta instalado.` };
    }

    if (options.replacingExisting && (await fileExists(destination))) {
      await rm(destination, { recursive: true, force: true });
    }

    await copyPluginDirectory(pluginRoot, destination);
    const loaded = loadedPluginFromManifest(parsed.manifest, destination, path.join(destination, "plugin.json"));
    const sideEffects = loaded ? await applyInstalledPluginSideEffects(projectPath, loaded) : { importedAssets: [], errors: [] };
    const registry = await loadProjectPlugins(projectPath);
    if (sideEffects.errors.length > 0) {
      registry.errors.push(...sideEffects.errors.map((message) => ({
        manifestPath: destination,
        message
      })));
    }
    return {
      ok: true,
      pluginId: parsed.manifest.id,
      destination,
      registry,
      importedAssets: sideEffects.importedAssets
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

export async function writePluginFixture(
  projectRoot: string,
  manifest: GBAStudioPluginManifest,
  extraFiles: Record<string, string> = {}
): Promise<string> {
  const pluginRoot = path.join(projectRoot, PLUGINS_FOLDER_NAME, manifest.id);
  await mkdir(pluginRoot, { recursive: true });
  await writeFile(path.join(pluginRoot, "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  for (const [relativePath, contents] of Object.entries(extraFiles)) {
    const target = path.join(pluginRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
  }
  return pluginRoot;
}
