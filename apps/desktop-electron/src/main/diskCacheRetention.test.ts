import { mkdir, mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireBuildLock } from "./stableBuildFiles.js";
import { pruneDiskCache, touchDiskCacheEntry, withDiskCacheLock } from "./diskCacheRetention.js";

const roots: string[] = [];
const now = 2_000_000_000_000;
const policy = { maxBytes: 12, maxEntries: 2, maxAgeMs: 100_000 };
const key = (n: number) => n.toString(16).padStart(64, "0");
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function root() { const value = await mkdtemp(path.join(os.tmpdir(), "gba-cache-retention-")); roots.push(value); return value; }
async function entry(directory: string, n: number, size = 4, age = n * 1000) {
  const destination = path.join(directory, key(n));
  await mkdir(destination);
  await writeFile(path.join(destination, "data"), Buffer.alloc(size));
  await utimes(destination, (now - age) / 1000, (now - age) / 1000);
  return destination;
}

describe("disk cache retention", () => {
  it("evicts least recently used entries to enforce the count limit", async () => {
    const directory = await root();
    await entry(directory, 1); await entry(directory, 2); await entry(directory, 3);
    const result = await pruneDiskCache(directory, policy, { now });
    expect(result.removed).toEqual([key(3)]);
    expect((await readdir(directory)).sort()).toEqual([key(1), key(2)]);
  });

  it("enforces the byte budget and removes a single oversized cache", async () => {
    const directory = await root();
    await entry(directory, 1, 20); await entry(directory, 2, 8);
    const result = await pruneDiskCache(directory, policy, { now });
    expect(result.removed).toContain(key(1));
    expect(result.retainedBytes).toBeLessThanOrEqual(policy.maxBytes);
    expect(await readFile(path.join(directory, key(2), "data"))).toHaveLength(8);
  });

  it("expires entries without recent use even below both size limits", async () => {
    const directory = await root(); await entry(directory, 1, 4, policy.maxAgeMs + 1);
    expect((await pruneDiskCache(directory, policy, { now })).removed).toEqual([key(1)]);
  });

  it("evicts older entries when their combined size exceeds the budget", async () => {
    const directory = await root(); await entry(directory, 1, 8); await entry(directory, 2, 8);
    const result = await pruneDiskCache(directory, policy, { now });
    expect(result.removed).toEqual([key(2)]); expect(result.retainedBytes).toBe(8);
  });

  it("reports metadata cleanup failures while releasing locks for future builds", async () => {
    const directory = await root(); await entry(directory, 1, 20);
    const result = await pruneDiskCache(directory, policy, { now, onRemoved: async () => { throw new Error("metadata denied"); } });
    expect(result.removed).toEqual([key(1)]); expect(result.errors).toContain("Error: metadata denied");
    await expect(withDiskCacheLock(directory, async () => "ready")).resolves.toBe("ready");
  });

  it("refreshes recency without modifying any generated file", async () => {
    const directory = await root(); const cached = await entry(directory, 1, 4, 200_000);
    await touchDiskCacheEntry(cached, now);
    expect((await pruneDiskCache(directory, policy, { now })).removed).toEqual([]);
    expect(await readFile(path.join(cached, "data"))).toEqual(Buffer.alloc(4));
  });

  it("preserves a running build and evicts it only after its lock is released", async () => {
    const directory = await root(); const cached = await entry(directory, 1, 20, 200_000);
    const release = await acquireBuildLock(`${cached}.lock`);
    try {
      expect((await pruneDiskCache(directory, policy, { now })).removed).toEqual([]);
      expect(await readFile(path.join(cached, "data"))).toHaveLength(20);
    } finally { await release(); }
    expect((await pruneDiskCache(directory, policy, { now })).removed).toEqual([key(1)]);
  });

  it("never follows symlinks or removes files and unrelated directory names", async () => {
    const directory = await root(); const outside = await root();
    await writeFile(path.join(outside, "original.png"), "source");
    await symlink(outside, path.join(directory, key(1)), process.platform === "win32" ? "junction" : "dir");
    await mkdir(path.join(directory, "personal-project"));
    await writeFile(path.join(directory, key(2)), "not-a-directory");
    const expired = await entry(directory, 3, 4, 200_000);
    await symlink(outside, path.join(expired, "linked-source"), process.platform === "win32" ? "junction" : "dir");
    expect((await pruneDiskCache(directory, policy, { now })).removed).toEqual([key(3)]);
    expect(await readFile(path.join(outside, "original.png"), "utf8")).toBe("source");
    expect((await readdir(directory)).sort()).toEqual([key(1), key(2), "personal-project"]);
  });

  it("does not prune a symlinked cache root", async () => {
    const directory = await root(); const outside = await root(); await entry(outside, 1, 20);
    const linked = path.join(directory, "cache");
    await symlink(outside, linked, process.platform === "win32" ? "junction" : "dir");
    expect((await pruneDiskCache(linked, policy, { now })).removed).toEqual([]);
    expect(await readFile(path.join(outside, key(1), "data"))).toHaveLength(20);
  });

  it("skips pruning while an export holds the cache lock and releases it after failure", async () => {
    const directory = await root(); await entry(directory, 1, 20);
    await expect(withDiskCacheLock(directory, async () => {
      expect((await pruneDiskCache(directory, policy, { now })).removed).toEqual([]);
      throw new Error("export failed");
    })).rejects.toThrow("export failed");
    expect((await pruneDiskCache(directory, policy, { now })).removed).toEqual([key(1)]);
  });

  it("serializes cache readers with maintenance instead of deleting their input", async () => {
    const directory = await root(); const order: string[] = [];
    let unblock!: () => void;
    const blocked = new Promise<void>(resolve => { unblock = resolve; });
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const first = withDiskCacheLock(directory, async () => { order.push("read"); started(); await blocked; order.push("end"); });
    await ready;
    const second = withDiskCacheLock(directory, async () => { order.push("next"); });
    unblock(); await Promise.all([first, second]);
    expect(order).toEqual(["read", "end", "next"]);
  });
});
