import { lstat, mkdir, readdir, rm, utimes } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { acquireBuildLock } from "./stableBuildFiles.js";

export interface DiskCachePolicy {
  maxBytes: number;
  maxEntries: number;
  maxAgeMs: number;
}

const weekMs = 7 * 24 * 60 * 60 * 1000;
export const stagingCachePolicy: DiskCachePolicy = { maxBytes: 2 * 1024 ** 3, maxEntries: 32, maxAgeMs: weekMs };
export const exportCachePolicy: DiskCachePolicy = { maxBytes: 512 * 1024 ** 2, maxEntries: 8, maxAgeMs: weekMs };

export interface DiskCachePruneResult {
  removed: string[];
  retainedBytes: number;
  retainedEntries: number;
  skipped: number;
  errors: string[];
}

interface PruneOptions {
  now?: number;
  onRemoved?: (key: string) => Promise<void>;
}

function lockBusy(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("Este projeto já está sendo exportado ou compilado.");
}

/** Cache readers/creators coordinate with eviction across processes. */
export async function withDiskCacheLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  try {
    const info = await lstat(root);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("O diretório de cache não pode ser um link simbólico.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(root, { recursive: true });
  }
  const started = Date.now();
  let release: () => Promise<void>;
  for (;;) {
    try { release = await acquireBuildLock(`${root}.retention-lock`); break; }
    catch (error) {
      if (!lockBusy(error) || Date.now() - started > 600_000) throw error;
      await delay(25);
    }
  }
  try { return await action(); } finally { await release(); }
}

export async function touchDiskCacheEntry(entry: string, now = Date.now()): Promise<void> {
  await utimes(entry, now / 1000, now / 1000);
}

async function directoryBytes(directory: string): Promise<number> {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    const info = await lstat(full);
    // lstat and the directory check deliberately avoid following symlinks.
    bytes += info.isDirectory() && !info.isSymbolicLink() ? await directoryBytes(full) : info.size;
  }
  return bytes;
}

/** Only SHA-256 directories owned by these caches are eligible for eviction. */
export async function pruneDiskCache(root: string, policy: DiskCachePolicy, options: PruneOptions = {}): Promise<DiskCachePruneResult> {
  const result: DiskCachePruneResult = { removed: [], retainedBytes: 0, retainedEntries: 0, skipped: 0, errors: [] };
  if (Object.values(policy).some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("Limites de cache inválidos.");
  }
  let releaseRoot: (() => Promise<void>) | undefined;
  const entries: Array<{ key: string; full: string; bytes: number; usedAt: number; inode: number; release: () => Promise<void> }> = [];
  try {
    const info = await lstat(root);
    if (!info.isDirectory() || info.isSymbolicLink()) return result;
    try { releaseRoot = await acquireBuildLock(`${root}.retention-lock`); }
    catch (error) { if (lockBusy(error)) { result.skipped++; return result; } throw error; }
    for (const item of await readdir(root, { withFileTypes: true })) {
      if (!/^[a-f0-9]{64}$/.test(item.name) || !item.isDirectory() || item.isSymbolicLink()) continue;
      const full = path.join(root, item.name);
      let release: (() => Promise<void>) | undefined;
      try {
        release = await acquireBuildLock(`${full}.lock`);
        const current = await lstat(full);
        if (!current.isDirectory() || current.isSymbolicLink()) { await release(); continue; }
        const bytes = await directoryBytes(full);
        entries.push({ key: item.name, full, bytes, usedAt: current.mtimeMs, inode: current.ino, release });
      } catch (error) {
        if (release) await release();
        if (lockBusy(error)) result.skipped++;
        else if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.errors.push(String(error));
      }
    }
    const now = options.now ?? Date.now();
    entries.sort((a, b) => b.usedAt - a.usedAt || a.key.localeCompare(b.key));
    for (const entry of entries) {
      if (now - entry.usedAt <= policy.maxAgeMs
        && result.retainedEntries < policy.maxEntries
        && result.retainedBytes + entry.bytes <= policy.maxBytes) {
        result.retainedEntries++; result.retainedBytes += entry.bytes; continue;
      }
      try {
        const current = await lstat(entry.full);
        if (current.isSymbolicLink() || !current.isDirectory() || current.ino !== entry.inode) { result.skipped++; continue; }
        await rm(entry.full, { recursive: true, force: true });
        result.removed.push(entry.key);
      } catch (error) {
        result.errors.push(String(error));
        result.retainedEntries++; result.retainedBytes += entry.bytes;
        continue;
      }
      try { await options.onRemoved?.(entry.key); } catch (error) { result.errors.push(String(error)); }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.errors.push(String(error));
  } finally {
    // A pruning failure must not strand locks or prevent a valid ROM/export.
    for (const entry of entries) { try { await entry.release(); } catch (error) { result.errors.push(String(error)); } }
    if (releaseRoot) { try { await releaseRoot(); } catch (error) { result.errors.push(String(error)); } }
  }
  return result;
}
