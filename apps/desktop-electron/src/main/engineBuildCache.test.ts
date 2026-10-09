import { mkdir, mkdtemp, readFile, readdir, rm, symlink, truncate, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildEngineCacheFingerprint,
  engineBuildCachePaths,
  projectPersistentBuildCacheEnabled,
  readLatestEngineBuildCache,
  withEngineCacheRetention,
  writeEngineBuildCacheSnapshot,
  writeLatestEngineBuildCache
} from "./engineBuildCache.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("persistent engine build cache", () => {
  it("allows projects to explicitly disable the persistent cache", () => {
    expect(projectPersistentBuildCacheEnabled({})).toBe(true);
    expect(projectPersistentBuildCacheEnabled({
      settings: { build: { persistentBuildCache: false } }
    })).toBe(false);
  });

  it("changes its fingerprint when the contract, audio or a source asset changes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-engine-cache-"));
    roots.push(root);
    const projectPath = path.join(root, "game.gba-project");
    const assetPath = path.join(root, "player.png");
    await writeFile(projectPath, "{}", "utf8");
    await writeFile(assetPath, "frame-a", "utf8");

    const first = await buildEngineCacheFingerprint({
      projectPath,
      contract: { schema: 1, target: "game" },
      audio: { tracker: [] },
      sourcePaths: ["player.png"]
    });
    await writeFile(assetPath, "frame-b", "utf8");
    const second = await buildEngineCacheFingerprint({
      projectPath,
      contract: { schema: 1, target: "game" },
      audio: { tracker: [] },
      sourcePaths: ["player.png"]
    });
    const third = await buildEngineCacheFingerprint({
      projectPath,
      contract: { schema: 1, target: "game-2" },
      audio: { tracker: [] },
      sourcePaths: ["player.png"]
    });

    expect(second).not.toBe(first);
    expect(third).not.toBe(second);
  });

  it("changes its fingerprint when an Engine Pack dependency changes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-engine-cache-"));
    roots.push(root);
    const projectPath = path.join(root, "game.gba-project");
    const templatePath = path.join(root, "engine-pack", "templates", "exported_mixed");
    const runtimePath = path.join(templatePath, "menu_runtime.inc");
    await mkdir(templatePath, { recursive: true });
    await writeFile(projectPath, "{}", "utf8");
    await writeFile(runtimePath, "runtime-a", "utf8");

    const first = await buildEngineCacheFingerprint({
      projectPath,
      contract: { schema: 1, template_dir: templatePath },
      sourcePaths: [],
      engineDependencyPaths: [templatePath]
    });
    await writeFile(runtimePath, "runtime-b", "utf8");
    const second = await buildEngineCacheFingerprint({
      projectPath,
      contract: { schema: 1, template_dir: templatePath },
      sourcePaths: [],
      engineDependencyPaths: [templatePath]
    });

    expect(second).not.toBe(first);
  });

  it("persists the latest cache pointer beside the project", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-engine-cache-"));
    roots.push(root);
    const projectPath = path.join(root, "game.gba-project");
    const paths = engineBuildCachePaths(projectPath, "abc123");

    await writeLatestEngineBuildCache(projectPath, {
      schema: 1,
      fingerprint: "abc123",
      outputPath: paths.snapshotPath,
      generatedAt: "2026-07-23T00:00:00.000Z",
      rebuildPlan: { changed: ["player"] }
    });

    await expect(readLatestEngineBuildCache(projectPath)).resolves.toMatchObject({
      schema: 1,
      fingerprint: "abc123",
      rebuildPlan: { changed: ["player"] }
    });
    await expect(readFile(paths.latestManifestPath, "utf8")).resolves.toContain("\"abc123\"");
  });

  it("bounds export snapshots and removes only their matching metadata", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-engine-retention-")); roots.push(root);
    const projectPath = path.join(root, "game.gba-project");
    await writeFile(projectPath, "original-project");
    for (let n = 1; n <= 10; n++) {
      const fingerprint = n.toString(16).padStart(64, "0");
      const paths = engineBuildCachePaths(projectPath, fingerprint);
      await mkdir(paths.snapshotPath, { recursive: true });
      await writeFile(path.join(paths.snapshotPath, "export.cpp"), "generated");
      await utimes(paths.snapshotPath, (Date.now() - n * 1000) / 1000, (Date.now() - n * 1000) / 1000);
      const manifest = { schema: 1 as const, fingerprint, outputPath: paths.snapshotPath, generatedAt: new Date().toISOString() };
      await writeEngineBuildCacheSnapshot(projectPath, manifest);
      if (n === 1) await writeLatestEngineBuildCache(projectPath, manifest);
    }
    await withEngineCacheRetention(projectPath, async () => undefined);
    const paths = engineBuildCachePaths(projectPath, "latest");
    expect(await readdir(path.join(paths.rootPath, "snapshots"))).toHaveLength(8);
    expect(await readdir(path.join(paths.rootPath, "manifests"))).toHaveLength(8);
    expect((await readLatestEngineBuildCache(projectPath))?.fingerprint).toBe("1".padStart(64, "0"));
    expect(await readFile(projectPath, "utf8")).toBe("original-project");
  });

  it("drops an oversized snapshot and its latest pointer without removing the export", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-engine-retention-")); roots.push(root);
    const projectPath = path.join(root, "game.gba-project");
    const fingerprint = "a".repeat(64); const paths = engineBuildCachePaths(projectPath, fingerprint);
    await mkdir(paths.snapshotPath, { recursive: true });
    const large = path.join(paths.snapshotPath, "generated.bin");
    await writeFile(large, ""); await truncate(large, 512 * 1024 ** 2 + 1);
    await writeFile(path.join(root, "export.cpp"), "published-export");
    const manifest = { schema: 1 as const, fingerprint, outputPath: paths.snapshotPath, generatedAt: new Date().toISOString() };
    await writeEngineBuildCacheSnapshot(projectPath, manifest); await writeLatestEngineBuildCache(projectPath, manifest);
    await withEngineCacheRetention(projectPath, async () => undefined);
    expect(await readLatestEngineBuildCache(projectPath)).toBeNull();
    await expect(readFile(paths.snapshotManifestPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(root, "export.cpp"), "utf8")).toBe("published-export");
  });

  it("rejects a symlinked project cache without deleting the linked data", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-engine-retention-")); roots.push(root);
    const outside = await mkdtemp(path.join(os.tmpdir(), "gbastudio-personal-data-")); roots.push(outside);
    await writeFile(path.join(outside, "source.png"), "original");
    await symlink(outside, path.join(root, ".gba-cache"), process.platform === "win32" ? "junction" : "dir");
    await expect(withEngineCacheRetention(path.join(root, "game.gba-project"), async () => undefined)).rejects.toThrow(/link simbólico/);
    expect(await readFile(path.join(outside, "source.png"), "utf8")).toBe("original");
  });
});
