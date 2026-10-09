import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openProjectFile, resolveProjectSaveDestination, saveProjectFileAtomically } from "./projectPersistence.js";
import { parseGBAProjectFile, summarizeGBAProject } from "../shared/projectFile.js";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";

const temporaryRoots: string[] = [];

async function makeTemporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project persistence", () => {
  it("saves and reopens a blank template without copying example assets or plugins", async () => {
    const root = await makeTemporaryRoot("gbastudio-blank-template-");
    const projectPath = resolveProjectSaveDestination(undefined, path.join(root, "Meu jogo.gba-project"), "Meu jogo");
    const data = buildProjectFromTemplate("blank", { name: "Meu jogo" });
    await saveProjectFileAtomically(projectPath, { data, summary: summarizeGBAProject(data) }, { appPath: process.cwd() });
    const opened = await openProjectFile(projectPath);
    expect(opened.project?.data).toEqual(data);
    expect(opened.project?.summary).toMatchObject({ rooms: 1, assets: (data.assets as unknown[]).length });
    expect(await readdir(path.dirname(projectPath))).toEqual(["Assets", "meu_jogo.gba-project"]);
    expect(await readdir(path.join(path.dirname(projectPath), "Assets"))).toEqual(["backgrounds", "portraits", "sprites", "ui"]);
    for (const asset of data.assets as Record<string, any>[]) {
      const copied = await readFile(path.join(path.dirname(projectPath), asset.metadata.source));
      const bundled = await readFile(path.join(process.cwd(), "default-assets/templates", asset.metadata.bundledDefaultAsset.slice("template:".length)));
      expect(copied.equals(bundled)).toBe(true);
    }
    const assets = data.assets as Record<string, any>[];
    expect(await readdir(path.join(path.dirname(projectPath), "Assets/sprites"))).toHaveLength(assets.filter(a => a.metadata.source.startsWith("Assets/sprites/")).length);
    expect(await readdir(path.join(path.dirname(projectPath), "Assets/ui"))).toHaveLength(assets.filter(a => a.metadata.source.startsWith("Assets/ui/")).length);
    expect(await readdir(path.join(path.dirname(projectPath), "Assets/portraits"))).toHaveLength(assets.filter(a => a.metadata.source.startsWith("Assets/portraits/")).length);
  });

  it("forces new projects into a folder named after the project", async () => {
    const root = await makeTemporaryRoot("gbastudio-project-destination-");

    expect(resolveProjectSaveDestination(undefined, path.join(root, "Meu Jogo.gba-project"), "Meu Jogo")).toBe(
      path.join(root, "meu_jogo", "meu_jogo.gba-project")
    );
    expect(resolveProjectSaveDestination(undefined, path.join(root, "meu_jogo", "meu_jogo.gba-project"), "Meu Jogo")).toBe(
      path.join(root, "meu_jogo", "meu_jogo.gba-project")
    );
  });

  it("keeps existing projects at their current path", async () => {
    const root = await makeTemporaryRoot("gbastudio-project-destination-");
    const currentPath = path.join(root, "legado", "jogo.gba-project");

    expect(resolveProjectSaveDestination(currentPath, path.join(root, "ignored.gba-project"), "Novo Nome")).toBe(currentPath);
  });

  it("opens a project file through the shared parser", async () => {
    const root = await makeTemporaryRoot("gbastudio-project-persistence-");
    const projectPath = path.join(root, "Open.gba-project");
    await writeFile(projectPath, '{"schemaVersion":1,"name":"Open Demo"}', "utf8");

    await expect(openProjectFile(projectPath)).resolves.toEqual({
      canceled: false,
      path: projectPath,
      project: {
        data: { schemaVersion: 1, name: "Open Demo" },
        summary: { schemaVersion: 1, name: "Open Demo", rooms: 0, assets: 0 }
      }
    });
  });

  it("imports .gbsproj files into a separate native project before opening", async () => {
    const root = await makeTemporaryRoot("gbastudio-project-import-");
    const sourceRoot = path.join(root, "Source");
    const sourceProjectPath = path.join(sourceRoot, "Source.gbsproj");
    await mkdir(path.join(sourceRoot, "project", "scenes", "start"), { recursive: true });
    await writeFile(sourceProjectPath, JSON.stringify({
      _resourceType: "project",
      name: "Imported Source",
      _version: "4.2.0",
      _release: "10"
    }), "utf8");
    await writeFile(path.join(sourceRoot, "project", "settings.gbsres"), JSON.stringify({
      _resourceType: "settings",
      startSceneId: "scene-start"
    }), "utf8");
    await writeFile(path.join(sourceRoot, "project", "scenes", "start", "scene.gbsres"), JSON.stringify({
      _resourceType: "scene",
      id: "scene-start",
      symbol: "scene_start",
      type: "TOPDOWN",
      width: 2,
      height: 2,
      collisions: "004+",
      script: []
    }), "utf8");

    const opened = await openProjectFile(sourceProjectPath);

    expect(opened).toMatchObject({
      canceled: false,
      path: path.join(root, "Source-gba-import", "imported_source.gba-project"),
      importReport: {
        kind: "gb-studio",
        sourcePath: sourceProjectPath,
        resourceCount: 2,
        translatedEventCount: 0,
        unsupportedEventCount: 0
      },
      project: {
        summary: { schemaVersion: 1, name: "Imported Source", rooms: 1 }
      }
    });
    expect(opened.path).not.toBe(sourceProjectPath);
  });

  it("saves through a temporary file in the destination directory", async () => {
    const root = await makeTemporaryRoot("gbastudio-project-persistence-");
    const projectPath = path.join(root, "Save.gba-project");
    const project = parseGBAProjectFile('{"schemaVersion":1,"name":"Atomic Save"}');

    await saveProjectFileAtomically(projectPath, project);

    await expect(readFile(projectPath, "utf8")).resolves.toBe('{\n  "schemaVersion": 1,\n  "name": "Atomic Save"\n}\n');
    await expect(readdir(root)).resolves.toEqual(expect.arrayContaining(["Assets", "Save.gba-project"]));
  });

  it("saves and opens split projects with compact .gbares resources", async () => {
    const root = await makeTemporaryRoot("gbastudio-project-split-");
    const projectPath = path.join(root, "Split.gba-project");
    const project = parseGBAProjectFile(JSON.stringify({
      schemaVersion: 2,
      name: "Split",
      settings: {
        build: {
          splitProjectResources: true,
          compactTilemaps: true
        }
      },
      rooms: [{
        id: "room-start",
        name: "Start",
        width: 4,
        height: 2,
        tilemap: [0, 0, 0, 0, 1, 1, 1, 1],
        collisions: [0, 0, 0, 0, 1, 1, 1, 1],
        collisionTypes: ["free", "free", "free", "free", "solid", "solid", "solid", "solid"],
        tileLayers: [{ mapping: "BG3", tilemap: [2, 2, 2, 2, 0, 0, 0, 0] }]
      }],
      events: [{ id: "event-boot", name: "Boot", steps: [{ command: "noop" }] }],
      assets: [{ id: "asset-player", name: "player.png", kind: "Sprite" }]
    }));

    await saveProjectFileAtomically(projectPath, project);

    const manifest = JSON.parse(await readFile(projectPath, "utf8")) as {
      format: string;
      resources: Array<{ path: string }>;
    };
    expect(manifest.format).toBe("gbastudio.split-project");
    expect(manifest.resources.map((resource) => resource.path)).toEqual([
      "Resources/rooms/000-start.gbares",
      "Resources/events/000-boot.gbares",
      "Resources/assets/000-player_png.gbares"
    ]);
    await expect(readFile(path.join(root, manifest.resources[0].path), "utf8")).resolves.toContain("\"rle-v1\"");

    const opened = await openProjectFile(projectPath);
    expect(opened.error).toBeUndefined();
    expect(opened.project?.data).toEqual(project.data);
  });

  it("compacts tilemaps in monolithic projects by default", async () => {
    const root = await makeTemporaryRoot("gbastudio-project-compact-");
    const projectPath = path.join(root, "Compact.gba-project");
    const project = parseGBAProjectFile(JSON.stringify({
      schemaVersion: 2,
      name: "Compact",
      rooms: [{
        id: "room-start",
        name: "Start",
        width: 4,
        height: 2,
        tilemap: [0, 0, 0, 0, 1, 1, 1, 1]
      }]
    }));

    await saveProjectFileAtomically(projectPath, project);

    await expect(readFile(projectPath, "utf8")).resolves.toContain("\"encoding\": \"rle-v1\"");
    const opened = await openProjectFile(projectPath);
    expect(opened.project?.data).toEqual(project.data);
  });

  it("keeps expanded tilemaps when compaction is explicitly disabled", async () => {
    const root = await makeTemporaryRoot("gbastudio-project-expanded-");
    const projectPath = path.join(root, "Expanded.gba-project");
    const project = parseGBAProjectFile(JSON.stringify({
      schemaVersion: 2,
      name: "Expanded",
      settings: { build: { compactTilemaps: false } },
      rooms: [{
        id: "room-start",
        name: "Start",
        width: 4,
        height: 2,
        tilemap: [0, 0, 0, 0, 1, 1, 1, 1]
      }]
    }));

    await saveProjectFileAtomically(projectPath, project);

    await expect(readFile(projectPath, "utf8")).resolves.not.toContain("\"encoding\"");
    const opened = await openProjectFile(projectPath);
    expect(opened.project?.data).toEqual(project.data);
  });

  it("creates the project folder and Assets directory before saving", async () => {
    const root = await makeTemporaryRoot("gbastudio-project-persistence-");
    const projectPath = path.join(root, "Saved", "meu_jogo", "meu_jogo.gba-project");
    const project = parseGBAProjectFile('{"schemaVersion":1,"name":"Meu Jogo"}');

    await saveProjectFileAtomically(projectPath, project);

    await expect(readFile(projectPath, "utf8")).resolves.toBe('{\n  "schemaVersion": 1,\n  "name": "Meu Jogo"\n}\n');
    await expect(readdir(path.join(root, "Saved", "meu_jogo"))).resolves.toEqual(
      expect.arrayContaining(["Assets", "meu_jogo.gba-project"])
    );
    await expect(readdir(path.join(root, "Saved", "meu_jogo", "Assets"))).resolves.toEqual([]);
  });

  it("materializes current template assets beside saved projects", async () => {
    const root = await makeTemporaryRoot("gbastudio-project-persistence-");
    const appRoot = path.join(root, "app");
    const projectPath = path.join(root, "Saved", "New.gba-project");
    const currentTemplateAssets = [
      { bundle: "topdown-player-4dir", source: "Assets/sprites/nara-topdown.png", kind: "Sprite", content: "topdown" },
      { bundle: "point-click-actor", source: "Assets/sprites/point-click-keeper-lantern.png", kind: "Sprite", content: "point-click-actor" },
      { bundle: "point-click-cursor", source: "Assets/sprites/point-click-cursor.png", kind: "Sprite", content: "point-click-cursor" },
      { bundle: "platformer-player", source: "Assets/sprites/penedos-v10-nara.png", kind: "Sprite", content: "platformer" },
      { bundle: "isometric-actor", source: "Assets/sprites/player-pilot-32x32.png", kind: "Sprite", content: "isometric-actor" },
      { bundle: "shmup-player", source: "Assets/sprites/tempestade-v3-player.png", kind: "Sprite", content: "shmup-player" },
      { bundle: "shmup-projectile", source: "Assets/sprites/storm-shot.png", kind: "Sprite", content: "shmup-projectile" },
      { bundle: "shmup-enemy", source: "Assets/sprites/tempestade-v3-drone-horizontal.png", kind: "Sprite", content: "shmup-enemy" },
      { bundle: "dialogue-portrait", source: "Assets/sprites/nara-portrait.png", kind: "Sprite", content: "portrait" },
      { bundle: "dialogue-box", source: "Assets/ui/frame-lumen-v2.png", kind: "UI", content: "box" },
      { bundle: "dialogue-selector", source: "Assets/ui/dialogue-selector-gba-v4.png", kind: "UI", content: "selector" },
      { bundle: "isometric-sandbox-tiles", source: "Assets/backgrounds/tactical-v5-surface.png", kind: "Background", content: "isometric" }
    ];
    const templateAssetsRoot = path.join(appRoot, "default-assets", "templates", "exemplo-gba", "Assets");
    await mkdir(path.dirname(projectPath), { recursive: true });
    for (const asset of currentTemplateAssets) {
      const sourcePath = path.join(templateAssetsRoot, asset.source.replace(/^Assets\//, ""));
      await mkdir(path.dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, asset.content, "utf8");
    }

    const project = parseGBAProjectFile(JSON.stringify({
      schemaVersion: 1,
      name: "New",
      assets: currentTemplateAssets.map((asset, index) => ({
        id: `asset-default-${index}`,
        name: path.basename(asset.source),
        kind: asset.kind,
        metadata: { source: asset.source, bundledDefaultAsset: asset.bundle }
      }))
    }));

    await saveProjectFileAtomically(projectPath, project, { appPath: appRoot });

    for (const asset of currentTemplateAssets) {
      await expect(readFile(path.join(root, "Saved", asset.source), "utf8")).resolves.toBe(asset.content);
    }
  });

  it("materializes assets bundled by a project template", async () => {
    const root = await makeTemporaryRoot("gbastudio-project-template-persistence-");
    const appRoot = path.join(root, "app");
    const projectPath = path.join(root, "Saved", "Template.gba-project");
    const bundledAssetPath = path.join(
      appRoot,
      "default-assets",
      "templates",
      "exemplo-gba",
      "Assets",
      "sprites",
      "nara-topdown.png"
    );
    await mkdir(path.dirname(bundledAssetPath), { recursive: true });
    await writeFile(bundledAssetPath, "template-nara", "utf8");

    const project = parseGBAProjectFile(JSON.stringify({
      schemaVersion: 1,
      name: "Template",
      assets: [{
        id: "asset-template-player",
        name: "nara-topdown.png",
        kind: "Sprite",
        metadata: {
          source: "Assets/sprites/nara-topdown.png",
          bundledDefaultAsset: "template:exemplo-gba/Assets/sprites/nara-topdown.png"
        }
      }]
    }));

    await saveProjectFileAtomically(projectPath, project, { appPath: appRoot });

    await expect(readFile(
      path.join(root, "Saved", "Assets", "sprites", "nara-topdown.png"),
      "utf8"
    )).resolves.toBe("template-nara");
  });

  it("preserves an existing bundled asset during a regular project save", async () => {
    const root = await makeTemporaryRoot("gbastudio-project-template-preserve-");
    const appRoot = path.join(root, "app");
    const projectPath = path.join(root, "Saved", "Template.gba-project");
    const bundledAssetPath = path.join(
      appRoot,
      "default-assets",
      "templates",
      "exemplo-gba",
      "Assets",
      "sprites",
      "nara-topdown.png"
    );
    const savedAssetPath = path.join(root, "Saved", "Assets", "sprites", "nara-topdown.png");
    await mkdir(path.dirname(bundledAssetPath), { recursive: true });
    await mkdir(path.dirname(savedAssetPath), { recursive: true });
    await writeFile(bundledAssetPath, "template-nara", "utf8");
    await writeFile(savedAssetPath, "user-edited-player", "utf8");

    const project = parseGBAProjectFile(JSON.stringify({
      schemaVersion: 1,
      name: "Template",
      assets: [{
        id: "asset-template-player",
        name: "nara-topdown.png",
        kind: "Sprite",
        metadata: {
          source: "Assets/sprites/nara-topdown.png",
          bundledDefaultAsset: "template:exemplo-gba/Assets/sprites/nara-topdown.png"
        }
      }]
    }));

    await saveProjectFileAtomically(projectPath, project, { appPath: appRoot });

    await expect(readFile(savedAssetPath, "utf8")).resolves.toBe("user-edited-player");
  });

  it("does not materialize a bundled asset outside the project root", async () => {
    const root = await makeTemporaryRoot("gbastudio-project-unsafe-source-");
    const appRoot = path.join(root, "app");
    const projectPath = path.join(root, "Saved", "Template.gba-project");
    const outsidePath = path.join(root, "outside.txt");
    const bundledAssetPath = path.join(appRoot, "default-assets", "templates", "safe", "sprites", "player.png");
    await mkdir(path.dirname(bundledAssetPath), { recursive: true });
    await writeFile(bundledAssetPath, "template-player", "utf8");
    await writeFile(outsidePath, "preserve", "utf8");

    const project = parseGBAProjectFile(JSON.stringify({
      schemaVersion: 1,
      name: "Unsafe Source",
      assets: [{
        id: "asset-unsafe-source",
        name: "player.png",
        kind: "Sprite",
        metadata: {
          source: "../outside.txt",
          bundledDefaultAsset: "template:safe/sprites/player.png"
        }
      }]
    }));

    await saveProjectFileAtomically(projectPath, project, { appPath: appRoot, bundledAssetConflictPolicy: "replace" });

    await expect(readFile(outsidePath, "utf8")).resolves.toBe("preserve");
  });

  it("creates the complete Exemplo GBA template without depending on the fixture directory", async () => {
    const root = await makeTemporaryRoot("gbastudio-exemplo-template-persistence-");
    const projectPath = path.join(root, "Saved", "Exemplo.gba-project");
    const data = buildProjectFromTemplate("exemplo-gba", { name: "Exemplo independente" });
    const assets = Array.isArray(data.assets) ? data.assets as Array<Record<string, unknown>> : [];
    const staleBackgroundPath = path.join(
      root,
      "Saved",
      "Assets",
      "backgrounds",
      "canonical-topdown-bg2-gba.png"
    );
    await mkdir(path.dirname(staleBackgroundPath), { recursive: true });
    await writeFile(staleBackgroundPath, "stale-background-from-older-template", "utf8");

    await saveProjectFileAtomically(projectPath, {
      data,
      summary: summarizeGBAProject(data)
    }, {
      appPath: process.cwd(),
      bundledAssetConflictPolicy: "replace"
    });

    await Promise.all(assets.map(async (asset) => {
      const metadata = asset.metadata as Record<string, unknown>;
      const source = String(metadata.source);
      const bundledDefaultAsset = String(metadata.bundledDefaultAsset);
      const bundledRelativePath = bundledDefaultAsset.replace(/^template:/, "");
      const [savedBytes, bundledBytes] = await Promise.all([
        readFile(path.join(root, "Saved", source)),
        readFile(path.join(process.cwd(), "default-assets", "templates", bundledRelativePath))
      ]);
      expect(savedBytes.equals(bundledBytes), source).toBe(true);
    }));

    expect(assets.length).toBeGreaterThanOrEqual(98);
    await expect(readFile(projectPath, "utf8")).resolves.not.toMatch(/\/Users|\.cache/);
  });
});
