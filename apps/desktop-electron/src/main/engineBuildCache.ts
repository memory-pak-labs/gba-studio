import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GBAProjectData } from "../shared/projectFile.js";
import { exportCachePolicy, pruneDiskCache, withDiskCacheLock } from "./diskCacheRetention.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function projectPersistentBuildCacheEnabled(data: GBAProjectData): boolean {
  const settings = isRecord(data.settings) ? data.settings : {};
  const build = isRecord(settings.build) ? settings.build : {};
  return build.persistentBuildCache !== false;
}

export interface EngineBuildCacheFingerprintOptions {
  projectPath: string;
  contract: unknown;
  audio?: unknown;
  sourcePaths: readonly string[];
  engineDependencyPaths?: readonly string[];
}

export interface EngineBuildCacheManifest {
  schema: 1;
  fingerprint: string;
  outputPath: string;
  generatedAt: string;
  rebuildPlan?: unknown;
  files?: Record<string, string>;
}

export interface EngineBuildCachePaths {
  rootPath: string;
  snapshotPath: string;
  snapshotManifestPath: string;
  latestManifestPath: string;
}

export function engineBuildCachePaths(projectPath: string, fingerprint: string): EngineBuildCachePaths {
  const rootPath = path.join(path.dirname(projectPath), ".gba-cache", "engine");
  return {
    rootPath,
    snapshotPath: path.join(rootPath, "snapshots", fingerprint),
    snapshotManifestPath: path.join(rootPath, "manifests", `${fingerprint}.json`),
    latestManifestPath: path.join(rootPath, "latest.json")
  };
}

/** Serialize snapshot reads/writes with eviction, including different export destinations. */
export async function withEngineCacheRetention<T>(projectPath: string, action: () => Promise<T>): Promise<T> {
  const cachePaths = engineBuildCachePaths(projectPath, "latest");
  const cacheParent = path.join(path.dirname(projectPath), ".gba-cache");
  const snapshotRoot = path.join(cachePaths.rootPath, "snapshots");
  for (const directory of [cacheParent, cachePaths.rootPath, snapshotRoot, path.join(cachePaths.rootPath, "manifests")]) {
    try {
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("O diretório de cache não pode ser um link simbólico.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(directory, { recursive: true });
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("O diretório de cache não pode ser um link simbólico.");
    }
  }
  try { return await withDiskCacheLock(snapshotRoot, action); }
  finally {
    const retention = await pruneDiskCache(snapshotRoot, exportCachePolicy, {
      onRemoved: async key => {
        await rm(engineBuildCachePaths(projectPath, key).snapshotManifestPath, { force: true });
        if ((await readLatestEngineBuildCache(projectPath))?.fingerprint === key) {
          await rm(cachePaths.latestManifestPath, { force: true });
        }
      }
    });
    if (retention.errors.length) console.warn("[GBA Studio] Falha na retenção dos snapshots de exportação:", retention.errors);
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function hashEngineDependency(hash: ReturnType<typeof createHash>, dependencyPath: string): Promise<void> {
  hash.update(`\0engine-dependency:${dependencyPath}\0`);
  try {
    const entries = await readdir(dependencyPath, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      await hashEngineDependency(hash, path.join(dependencyPath, entry.name));
    }
  } catch {
    try {
      hash.update(await readFile(dependencyPath));
    } catch {
      hash.update("missing");
    }
  }
}

export async function buildEngineCacheFingerprint(options: EngineBuildCacheFingerprintOptions): Promise<string> {
  const hash = createHash("sha256");
  hash.update("export-snapshot-v2\0");
  hash.update(stableJson(options.contract));
  hash.update("\0audio\0");
  hash.update(stableJson(options.audio ?? null));
  const projectRoot = path.dirname(options.projectPath);
  for (const sourcePath of [...new Set(options.sourcePaths)].sort()) {
    hash.update(`\0asset:${sourcePath}\0`);
    if (path.isAbsolute(sourcePath)) {
      hash.update("absolute-path-rejected");
      continue;
    }
    try {
      hash.update(await readFile(path.resolve(projectRoot, sourcePath)));
    } catch {
      hash.update("missing");
    }
  }
  for (const dependencyPath of [...new Set(options.engineDependencyPaths ?? [])].sort()) {
    await hashEngineDependency(hash, dependencyPath);
  }
  return hash.digest("hex");
}

export async function readLatestEngineBuildCache(projectPath: string): Promise<EngineBuildCacheManifest | null> {
  const { latestManifestPath } = engineBuildCachePaths(projectPath, "latest");
  return readEngineBuildCacheManifest(latestManifestPath);
}

export async function readEngineBuildCacheSnapshot(
  projectPath: string,
  fingerprint: string
): Promise<EngineBuildCacheManifest | null> {
  const { snapshotManifestPath } = engineBuildCachePaths(projectPath, fingerprint);
  const manifest = await readEngineBuildCacheManifest(snapshotManifestPath);
  return manifest?.fingerprint === fingerprint ? manifest : null;
}

async function readEngineBuildCacheManifest(manifestPath: string): Promise<EngineBuildCacheManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as EngineBuildCacheManifest;
    return parsed?.schema === 1 && typeof parsed.fingerprint === "string" && /^[a-f0-9]+$/i.test(parsed.fingerprint) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeEngineBuildCacheManifest(
  manifestPath: string,
  rootPath: string,
  manifest: EngineBuildCacheManifest
): Promise<void> {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await mkdir(rootPath, { recursive: true });
  const temporaryPath = `${manifestPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporaryPath, manifestPath);
}

export async function writeLatestEngineBuildCache(
  projectPath: string,
  manifest: EngineBuildCacheManifest
): Promise<void> {
  const { latestManifestPath, rootPath } = engineBuildCachePaths(projectPath, manifest.fingerprint);
  await writeEngineBuildCacheManifest(latestManifestPath, rootPath, manifest);
}

export async function writeEngineBuildCacheSnapshot(
  projectPath: string,
  manifest: EngineBuildCacheManifest
): Promise<void> {
  const { snapshotManifestPath, rootPath } = engineBuildCachePaths(projectPath, manifest.fingerprint);
  await writeEngineBuildCacheManifest(snapshotManifestPath, rootPath, manifest);
}
