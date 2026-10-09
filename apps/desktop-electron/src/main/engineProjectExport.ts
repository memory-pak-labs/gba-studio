import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { EngineProjectExport, EngineProjectExportAsset } from "../shared/engineProjectExport.js";
import type { EngineExportProjectContract, PreparedEngineSchemaExport } from "./exportEngineProject.js";
import {
  buildEngineCacheFingerprint,
  engineBuildCachePaths,
  readEngineBuildCacheSnapshot,
  readLatestEngineBuildCache,
  withEngineCacheRetention,
  writeEngineBuildCacheSnapshot,
  writeLatestEngineBuildCache
} from "./engineBuildCache.js";
import { acquireBuildLock, copyTreeIfChanged, exportedFileHashes, writeFileIfChanged } from "./stableBuildFiles.js";
import { touchDiskCacheEntry } from "./diskCacheRetention.js";

const execFileAsync = promisify(execFile);
// Cold exports of the complete showcase can exceed five minutes while assetc
// quantizes the scene palettes. Keep a bound without terminating valid builds.
const assetcTimeoutMs = 600_000;
const assetcMaxBuffer = 8 * 1024 * 1024;
const windowsShellScriptPattern = /\.(cmd|bat)$/i;

export interface WriteEngineProjectExportOptions {
  destination: string;
  generated: EngineProjectExport;
  projectPath?: string;
}

export interface WriteEngineProjectExportResult {
  destination: string;
  files: string[];
  warnings?: string[];
  cache?: {
    hit: boolean;
    fingerprint: string;
    rebuildPlan?: unknown;
  };
}

export interface WriteEngineSchemaExportOptions {
  destination: string;
  prepared: PreparedEngineSchemaExport;
  assetcPath: string;
  projectPath?: string;
  cacheEnabled?: boolean;
}

function toolInvocation(toolPath: string, args: string[]): { executable: string; args: string[] } {
  if (process.platform === "win32" && windowsShellScriptPattern.test(toolPath)) {
    return {
      executable: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", toolPath, ...args]
    };
  }
  return { executable: toolPath, args };
}

function execOptionsForTool(): ExecFileOptionsWithStringEncoding {
  return { encoding: "utf8" };
}

function safeDestinationPath(destination: string, relativePath: string): string {
  const resolvedDestination = path.resolve(destination);
  const resolvedFile = path.resolve(resolvedDestination, relativePath);
  const relative = path.relative(resolvedDestination, resolvedFile);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Arquivo exportado fora do destino: ${relativePath}`);
  }
  return resolvedFile;
}

function safeProjectSourcePath(projectPath: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Asset exportado usa caminho absoluto: ${relativePath}`);
  }

  const projectDirectory = path.dirname(projectPath);
  const resolvedProjectDirectory = path.resolve(projectDirectory);
  const resolvedFile = path.resolve(resolvedProjectDirectory, relativePath);
  const relative = path.relative(resolvedProjectDirectory, resolvedFile);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Asset exportado fora do projeto: ${relativePath}`);
  }
  return resolvedFile;
}

async function resolveGeneratedAssetSource(projectPath: string, asset: EngineProjectExportAsset): Promise<string> {
  const projectSourceFile = safeProjectSourcePath(projectPath, asset.source);
  let sourceFile = projectSourceFile;
  try {
    await access(sourceFile);
  } catch (error) {
    const bundledDefaultAsset = asset.bundledDefaultAsset;
    if (!bundledDefaultAsset?.startsWith("template:")) throw error;
    const relativeTemplatePath = bundledDefaultAsset.slice("template:".length).replaceAll("\\", "/");
    const normalizedPath = path.posix.normalize(relativeTemplatePath);
    if (
      !normalizedPath ||
      normalizedPath === "." ||
      normalizedPath === ".." ||
      normalizedPath.startsWith("../") ||
      path.posix.isAbsolute(normalizedPath)
    ) throw error;
    const roots = [
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../default-assets/templates"),
      path.resolve(process.cwd(), "default-assets/templates"),
      ...(process.resourcesPath ? [path.resolve(process.resourcesPath, "default-assets/templates")] : [])
    ];
    const bundledCandidates = roots.map((root) => path.resolve(root, ...normalizedPath.split("/")));
    const bundledSource = await (async () => {
      for (const candidate of bundledCandidates) {
        try {
          await access(candidate);
          return candidate;
        } catch {
          // Continue through the development, source and packaged roots.
        }
      }
      return null;
    })();
    if (!bundledSource) throw error;
    sourceFile = bundledSource;
  }
  return sourceFile;
}

async function copyGeneratedAsset(destination: string, projectPath: string, asset: EngineProjectExportAsset): Promise<string> {
  const sourceFile = await resolveGeneratedAssetSource(projectPath, asset);
  const destinationFile = safeDestinationPath(destination, asset.output);
  await mkdir(path.dirname(destinationFile), { recursive: true });
  await writeFileIfChanged(destinationFile, await readFile(sourceFile));
  return destinationFile;
}

export async function writeEngineProjectExport(options: WriteEngineProjectExportOptions): Promise<WriteEngineProjectExportResult> {
  await mkdir(options.destination, { recursive: true });

  const files: string[] = [];
  for (const file of options.generated.files) {
    const destinationFile = safeDestinationPath(options.destination, file.path);
    await mkdir(path.dirname(destinationFile), { recursive: true });
    await writeFileIfChanged(destinationFile, file.contents);
    files.push(destinationFile);
  }

  if (options.projectPath) {
    for (const asset of options.generated.assets) {
      files.push(await copyGeneratedAsset(options.destination, options.projectPath, asset));
    }
  }

  return {
    destination: options.destination,
    files
  };
}

async function listExportedFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    return entry.isDirectory() ? listExportedFiles(fullPath) : [fullPath];
  }));
  return nested.flat().sort();
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function cacheSnapshotCanBeCopied(destination: string, snapshotPath: string): boolean {
  const relative = path.relative(path.resolve(destination), path.resolve(snapshotPath));
  return relative.startsWith("..") || path.isAbsolute(relative);
}

async function copyCachedExport(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  await copyTreeIfChanged(source, destination);
}

async function snapshotIntegrityMatches(snapshot: string, files: Record<string, string> | undefined): Promise<boolean> {
  if (!files) return false;
  try {
    return JSON.stringify(Object.entries(await exportedFileHashes(snapshot)).sort())
      === JSON.stringify(Object.entries(files).sort());
  } catch { return false; }
}

async function cacheSnapshotHasRequiredFiles(
  snapshotPath: string,
  contract: EngineExportProjectContract,
  audioPack: WriteEngineSchemaExportOptions["prepared"]["audioPack"]
): Promise<boolean> {
  const requiredFiles = new Set([
    "export_project.json",
    ...contract.generated_assets,
    ...contract.copied_assets.map((asset) => asset.output),
    ...(audioPack?.sourceCopies.map((asset) => asset.output) ?? [])
  ]);
  return (await Promise.all([...requiredFiles].map(async (relativePath) => {
    try {
      return await pathExists(safeDestinationPath(snapshotPath, relativePath));
    } catch {
      return false;
    }
  }))).every(Boolean);
}

function parseAssetcWarnings(stderr: string): string[] {
  return [...new Set(stderr
    .split(/\r?\n/)
    .map((line) => line.match(/^AVISO\[[^\]]+\]:\s*(.+)$/)?.[1]?.trim())
    .filter((message): message is string => Boolean(message)))];
}

export async function writeEngineSchemaExport(options: WriteEngineSchemaExportOptions): Promise<WriteEngineProjectExportResult> {
  const release = await acquireBuildLock(`${path.resolve(options.destination)}.export-lock`);
  try {
    return options.projectPath && options.cacheEnabled === true
      ? await withEngineCacheRetention(options.projectPath, () => writeLockedEngineSchemaExport(options))
      : await writeLockedEngineSchemaExport(options);
  } finally { await release(); }
}

async function writeLockedEngineSchemaExport(options: WriteEngineSchemaExportOptions): Promise<WriteEngineProjectExportResult> {
  await mkdir(options.destination, { recursive: true });

  const sourcePaths = [
    ...options.prepared.assets.map((asset) => asset.source),
    ...(options.prepared.audioPack?.sourceCopies.map((asset) => asset.source) ?? [])
  ];
  const templateDirectory = options.prepared.contract.template_dir;
  const enginePackRoot = path.dirname(path.dirname(templateDirectory));
  const cacheEnabled = Boolean(options.projectPath) && options.cacheEnabled === true;
  const contract = options.cacheEnabled === false
    ? {...options.prepared.contract, build: {...options.prepared.contract.build, incremental_cache: false}}
    : options.prepared.contract;
  const bundledSourcePaths = options.projectPath
    ? await Promise.all(options.prepared.assets.filter(asset => asset.bundledDefaultAsset)
      .map(asset => resolveGeneratedAssetSource(options.projectPath as string, asset)))
    : [];
  const fingerprintOptions = options.projectPath ? {
        projectPath: options.projectPath,
        contract,
        audio: options.prepared.audioPack?.document,
        sourcePaths,
        engineDependencyPaths: [
          templateDirectory,
          options.assetcPath,
          path.join(enginePackRoot, "enginepack.json"),
          path.join(enginePackRoot, "lib", "libgbastudio_engine.a"),
          ...bundledSourcePaths
        ]
      } : null;
  const fingerprint = cacheEnabled && fingerprintOptions ? await buildEngineCacheFingerprint(fingerprintOptions) : null;
  const cachePaths = fingerprint && options.projectPath
    ? engineBuildCachePaths(options.projectPath, fingerprint)
    : null;
  const latestCache = cacheEnabled && options.projectPath
    ? await readLatestEngineBuildCache(options.projectPath)
    : null;
  const snapshotCache = cachePaths && options.projectPath
    ? await readEngineBuildCacheSnapshot(options.projectPath, fingerprint as string)
    : null;
  const matchingCache = latestCache?.fingerprint === fingerprint
    ? latestCache
    : snapshotCache;

  if (
    cachePaths
    && fingerprint
    && matchingCache
    && matchingCache.files
    && cacheSnapshotCanBeCopied(options.destination, cachePaths.snapshotPath)
    && await pathExists(cachePaths.snapshotPath)
    && await cacheSnapshotHasRequiredFiles(
      cachePaths.snapshotPath,
      options.prepared.contract,
      options.prepared.audioPack
    )
    && await snapshotIntegrityMatches(cachePaths.snapshotPath, matchingCache.files)
  ) {
    await copyCachedExport(cachePaths.snapshotPath, options.destination);
    await touchDiskCacheEntry(cachePaths.snapshotPath);
    if (fingerprintOptions && await buildEngineCacheFingerprint(fingerprintOptions) !== fingerprint) {
      throw new Error("Assets ou Engine Pack mudaram durante a exportação. Execute Play novamente.");
    }
    if (options.projectPath && latestCache?.fingerprint !== fingerprint) {
      await writeLatestEngineBuildCache(options.projectPath, matchingCache);
    }
    return {
      destination: options.destination,
      files: await listExportedFiles(options.destination),
      cache: {
        hit: true,
        fingerprint,
        ...(matchingCache.rebuildPlan !== undefined ? { rebuildPlan: matchingCache.rebuildPlan } : {})
      }
    };
  }

  if (
    latestCache
    && options.projectPath
    && latestCache.fingerprint !== fingerprint
  ) {
    const previousSnapshot = engineBuildCachePaths(options.projectPath, latestCache.fingerprint).snapshotPath;
    if (
      cacheSnapshotCanBeCopied(options.destination, previousSnapshot)
      && await snapshotIntegrityMatches(previousSnapshot, latestCache.files)
    ) {
      await copyCachedExport(previousSnapshot, options.destination);
    } else {
      // Without a trusted report assetc must regenerate, even if headers exist.
      await rm(path.join(options.destination, "asset_pack_report.json"), { force: true });
    }
  }
  if (matchingCache && cachePaths && !await snapshotIntegrityMatches(cachePaths.snapshotPath, matchingCache.files)) {
    await rm(path.join(options.destination, "asset_pack_report.json"), { force: true });
  }

  if (options.prepared.audioPack) {
    const jsonPath = safeDestinationPath(options.destination, options.prepared.audioPack.packAsset.audio_json);
    await mkdir(path.dirname(jsonPath), { recursive: true });
    await writeFileIfChanged(jsonPath, `${JSON.stringify(options.prepared.audioPack.document, null, 2)}\n`);

    if (options.projectPath) {
      for (const asset of options.prepared.audioPack.sourceCopies) {
        await copyGeneratedAsset(options.destination, options.projectPath, asset);
      }
    }
  }

  const contractPath = safeDestinationPath(options.destination, "export_project.json");
  await writeFileIfChanged(contractPath, `${JSON.stringify(contract, null, 2)}\n`);

  if (options.projectPath) {
    for (const asset of options.prepared.assets) {
      await copyGeneratedAsset(options.destination, options.projectPath, asset);
    }
  }

  const assetcArgs = [
    "--export-project-json",
    "-o",
    options.destination,
    contractPath
  ];
  const invocation = toolInvocation(options.assetcPath, assetcArgs);
  const { stderr } = await execFileAsync(invocation.executable, invocation.args, {
    ...execOptionsForTool(),
    timeout: assetcTimeoutMs,
    maxBuffer: assetcMaxBuffer
  });
  if (fingerprint && fingerprintOptions && await buildEngineCacheFingerprint(fingerprintOptions) !== fingerprint) {
    throw new Error("Assets ou Engine Pack mudaram durante a exportação. Execute Play novamente.");
  }

  const assetPackReportPath = safeDestinationPath(options.destination, "asset_pack_report.json");
  let rebuildPlan: unknown;
  try {
    const assetPackReport = JSON.parse(await readFile(assetPackReportPath, "utf8")) as {
      export_plan?: { headers?: Array<{ header?: string; generate?: boolean }> };
      rebuild_plan?: unknown;
    };
    rebuildPlan = assetPackReport.rebuild_plan;
    const generatedAssets = (assetPackReport.export_plan?.headers ?? [])
      .filter((header) => header.generate !== false && typeof header.header === "string")
      .map((header) => header.header as string);
    if (generatedAssets.length > 0) {
      const summaryPath = safeDestinationPath(options.destination, "engine_export_summary.json");
      await writeFile(summaryPath, `${JSON.stringify({
        schema: 1,
        generatedAssets,
        assetPackReportPath: "asset_pack_report.json"
      }, null, 2)}\n`, "utf8");
    }
  } catch {
    // asset_pack_report.json is optional when no asset_pack is present
  }

  if (
    cachePaths
    && fingerprint
    && options.projectPath
    && cacheSnapshotCanBeCopied(options.destination, cachePaths.snapshotPath)
  ) {
    await mkdir(cachePaths.snapshotPath, { recursive: true });
    await copyCachedExport(options.destination, cachePaths.snapshotPath);
    const manifest = {
      schema: 1,
      fingerprint,
      outputPath: cachePaths.snapshotPath,
      generatedAt: new Date().toISOString(),
      files: await exportedFileHashes(cachePaths.snapshotPath),
      ...(rebuildPlan !== undefined ? { rebuildPlan } : {})
    } as const;
    await writeEngineBuildCacheSnapshot(options.projectPath, manifest);
    await writeLatestEngineBuildCache(options.projectPath, manifest);
    await touchDiskCacheEntry(cachePaths.snapshotPath);
  }

  return {
    destination: options.destination,
    files: await listExportedFiles(options.destination),
    warnings: parseAssetcWarnings(stderr),
    ...(fingerprint
      ? {
          cache: {
            hit: false,
            fingerprint,
            ...(rebuildPlan !== undefined ? { rebuildPlan } : {})
          }
        }
      : {})
  };
}
