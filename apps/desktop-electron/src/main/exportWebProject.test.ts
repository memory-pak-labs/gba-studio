import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareWebProjectExport, ensureWebExportRomSource, resolveWebExportRomSource, writeWebProjectExport } from "./exportWebProject.js";
import { parseGBAProjectFile } from "../shared/projectFile.js";
import type { GBAProjectData } from "../shared/projectFile.js";

const temporaryRoots: string[] = [];

async function exportableProject(overrides: Partial<GBAProjectData> = {}): Promise<GBAProjectData> {
  const fixture = await readFile(path.join(process.cwd(), "../../packages/project-contract/fixtures/topdown-demo.gba-project"), "utf8");
  const project = parseGBAProjectFile(fixture);
  const baseSettings = (project.data.settings ?? {}) as Record<string, unknown>;
  const baseGeneral = (baseSettings.general ?? {}) as Record<string, unknown>;
  const baseBuild = (baseSettings.build ?? {}) as Record<string, unknown>;
  const overrideSettings = (overrides.settings ?? {}) as Record<string, unknown>;
  const overrideGeneral = (overrideSettings.general ?? {}) as Record<string, unknown>;
  const overrideBuild = (overrideSettings.build ?? {}) as Record<string, unknown>;
  return {
    ...project.data,
    name: "Web Demo",
    ...overrides,
    settings: {
      ...baseSettings,
      ...overrideSettings,
      general: {
        ...baseGeneral,
        gameTitle: "Web Demo",
        ...overrideGeneral
      },
      build: {
        ...baseBuild,
        romFileName: "web_demo.gba",
        exportFormat: "gba_rom",
        ...overrideBuild
      }
    },
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Web project export", () => {
  it("prepares an itch.io-ready static package around the generated Engine Pack project", async () => {
    const destination = await mkdtemp(path.join(os.tmpdir(), "gbastudio-web-export-"));
    temporaryRoots.push(destination);

    const prepared = prepareWebProjectExport(await exportableProject());
    expect(prepared.generated?.target).toBe("web_demo");

    const result = await writeWebProjectExport({
      destination,
      generated: prepared.generated!,
      requireRom: false
    });

    expect(result.files).toContain(path.join(destination, "index.html"));
    expect(result.files).toContain(path.join(destination, "manifest.json"));
    expect(result.files).toContain(path.join(destination, "README.md"));
    expect(result.files).toContain(path.join(destination, ".itch.toml"));
    expect(result.files).toContain(path.join(destination, "roms", "README.md"));
    expect(result.files).toContain(path.join(destination, "player", "gbastudio-player.js"));
    expect(result.files).toContain(path.join(destination, "player", "gbastudio-player.css"));
    expect(result.files).toContain(path.join(destination, "player", "runtime.html"));
    expect(result.files).toContain(path.join(destination, "player", "mgba-direct-player.mjs"));
    expect(result.files).toContain(path.join(destination, "player", "mgba-core.mjs"));
    expect(result.files).toContain(path.join(destination, "player", "mgba-core.wasm"));
    expect(result.files).toContain(path.join(destination, "licenses", "mGBA-MPL-2.0.txt"));
    expect(result.files).toContain(path.join(destination, "engine-project", "main.cpp"));
    expect(result.files).toContain(path.join(destination, "engine-project", "gbastudio_project_data.hpp"));
    expect(result.files).toContain(path.join(destination, "engine-project", "gbastudio_project.json"));
    expect(result.files).toContain(path.join(destination, "engine-project", "README.md"));
    const html = await readFile(path.join(destination, "index.html"), "utf8");
    expect(html).toContain("Web Demo");
    expect(html).toContain('window.GBAStudioPlayerConfig = {');
    expect(html).toContain('romUrl: "roms/web_demo.gba"');
    expect(html).toContain('<script src="player/gbastudio-player.js"></script>');
    expect(html).not.toContain("window.EJS_");
    const manifest = await readFile(path.join(destination, "manifest.json"), "utf8");
    expect(manifest).toContain('"romFileName": "web_demo.gba"');
    expect(manifest).toContain('"romPath": "roms/web_demo.gba"');
    expect(manifest).toContain('"romResolved": false');
    expect(manifest).toContain('"packageComplete": false');
    expect(manifest).toContain('"runtime": "gbastudio-player"');
    expect(manifest).toContain('"core": "mgba"');
    expect(manifest).toContain('"adapter": "mgba-wasm-direct"');
    expect(manifest).toContain('"mgba": "licenses/mGBA-MPL-2.0.txt"');
    expect(html).toContain("ROM ausente");
    const itchToml = await readFile(path.join(destination, ".itch.toml"), "utf8");
    expect(itchToml).toContain('title = "Web Demo"');
    expect(itchToml).toContain('kind = "html"');
    expect(itchToml).toContain('index_files = ["index.html"]');
    await expect(readFile(path.join(destination, "engine-project", "gbastudio_project.json"), "utf8")).resolves.toContain('"target": "web_demo"');
    await expect(readFile(path.join(destination, "roms", "README.md"), "utf8")).resolves.toContain("web_demo.gba");
  });

  it("copies project assets into the nested Engine Pack project", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-web-export-assets-"));
    temporaryRoots.push(root);
    const projectPath = path.join(root, "Game", "demo.gbastudio");
    const sourceAssetPath = path.join(root, "Game", "Assets", "sprites", "player_topdown_4dir.png");
    const pointClickActorPath = path.join(root, "Game", "Assets", "sprites", "actor_point_click.png");
    const pointClickCursorPath = path.join(root, "Game", "Assets", "sprites", "cursor_point_click.png");
    const destination = path.join(root, "web");
    await mkdir(path.dirname(sourceAssetPath), { recursive: true });
    await writeFile(projectPath, "{}", "utf8");
    await writeFile(sourceAssetPath, "sprite-bytes", "utf8");
    await writeFile(pointClickActorPath, "actor-bytes", "utf8");
    await writeFile(pointClickCursorPath, "cursor-bytes", "utf8");
    await mkdir(path.join(root, "Game", "Assets", "tiles"), { recursive: true });
    await mkdir(path.join(root, "Game", "Assets", "music"), { recursive: true });
    await mkdir(path.join(root, "Game", "Assets", "sounds"), { recursive: true });
    await writeFile(path.join(root, "Game", "Assets", "tiles", "tiles_overworld.png"), "tiles", "utf8");
    await writeFile(path.join(root, "Game", "Assets", "music", "intro_theme.mod"), "music", "utf8");
    await writeFile(path.join(root, "Game", "Assets", "sounds", "confirm.wav"), "sfx", "utf8");

    const prepared = prepareWebProjectExport(await exportableProject());

    const result = await writeWebProjectExport({
      destination,
      generated: prepared.generated!,
      projectPath,
      requireRom: false
    });

    const copiedAsset = path.join(destination, "engine-project", "assets", "sprite", "player_topdown_4dir.png");
    const copiedPointClickActor = path.join(destination, "engine-project", "assets", "sprite", "actor_point_click.png");
    const copiedPointClickCursor = path.join(destination, "engine-project", "assets", "sprite", "cursor_point_click.png");
    expect(result.files).toContain(copiedAsset);
    expect(result.files).toContain(copiedPointClickActor);
    expect(result.files).toContain(copiedPointClickCursor);
    await expect(readFile(copiedAsset, "utf8")).resolves.toBe("sprite-bytes");
    await expect(readFile(copiedPointClickActor, "utf8")).resolves.toBe("actor-bytes");
    await expect(readFile(copiedPointClickCursor, "utf8")).resolves.toBe("cursor-bytes");
  });

  it("copies a built ROM into the Web preview package when one is available", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-web-export-rom-"));
    temporaryRoots.push(root);
    const destination = path.join(root, "web");
    const romSourcePath = path.join(root, "build", "web_demo.gba");
    await mkdir(path.dirname(romSourcePath), { recursive: true });
    await writeFile(romSourcePath, "gba-rom-bytes", "utf8");

    const prepared = prepareWebProjectExport(await exportableProject());

    const result = await writeWebProjectExport({
      destination,
      generated: prepared.generated!,
      romSourcePath
    });

    const copiedRom = path.join(destination, "roms", "web_demo.gba");
    expect(result.files).toContain(copiedRom);
    await expect(readFile(copiedRom, "utf8")).resolves.toBe("gba-rom-bytes");
  });

  it("auto-discovers a built ROM from the project export folder when no explicit romSourcePath is passed", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-web-export-autorom-"));
    temporaryRoots.push(root);
    const destination = path.join(root, "web");
    const projectPath = path.join(root, "Game", "demo.gbastudio");
    const romSourcePath = path.join(root, "Game", "build", "web_demo.gba");
    await mkdir(path.dirname(romSourcePath), { recursive: true });
    await mkdir(path.dirname(projectPath), { recursive: true });
    await mkdir(path.join(root, "Game", "Assets", "sprites"), { recursive: true });
    await mkdir(path.join(root, "Game", "Assets", "tiles"), { recursive: true });
    await mkdir(path.join(root, "Game", "Assets", "music"), { recursive: true });
    await mkdir(path.join(root, "Game", "Assets", "sounds"), { recursive: true });
    await writeFile(projectPath, "{}", "utf8");
    await writeFile(path.join(root, "Game", "Assets", "sprites", "player_topdown_4dir.png"), "sprite-bytes", "utf8");
    await writeFile(path.join(root, "Game", "Assets", "sprites", "actor_point_click.png"), "actor-bytes", "utf8");
    await writeFile(path.join(root, "Game", "Assets", "sprites", "cursor_point_click.png"), "cursor-bytes", "utf8");
    await writeFile(path.join(root, "Game", "Assets", "tiles", "tiles_overworld.png"), "tiles", "utf8");
    await writeFile(path.join(root, "Game", "Assets", "music", "intro_theme.mod"), "music", "utf8");
    await writeFile(path.join(root, "Game", "Assets", "sounds", "confirm.wav"), "sfx", "utf8");
    await writeFile(romSourcePath, "gba-rom-bytes", "utf8");

    const project = await exportableProject({
      settings: {
        general: {
          exportFolder: "build"
        }
      }
    });
    const prepared = prepareWebProjectExport(project);
    expect(resolveWebExportRomSource(project, "web_demo.gba", projectPath)).toBe(romSourcePath);

    const result = await writeWebProjectExport({
      destination,
      generated: prepared.generated!,
      projectPath,
      projectData: project
    });

    const copiedRom = path.join(destination, "roms", "web_demo.gba");
    expect(result.files).toContain(copiedRom);
    await expect(readFile(copiedRom, "utf8")).resolves.toBe("gba-rom-bytes");
  });

  it("ensureWebExportRomSource falls back to buildRom when no ROM is discovered", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-web-export-buildrom-"));
    temporaryRoots.push(root);
    const projectPath = path.join(root, "Game", "demo.gbastudio");
    const builtRomPath = path.join(root, "Game", "build", "web_demo.gba");
    await mkdir(path.dirname(projectPath), { recursive: true });
    await writeFile(projectPath, "{}", "utf8");

    const project = await exportableProject();
    expect(resolveWebExportRomSource(project, "web_demo.gba", projectPath)).toBeNull();

    const resolution = await ensureWebExportRomSource({
      data: project,
      romFileName: "web_demo.gba",
      projectPath,
      buildRom: async () => {
        await mkdir(path.dirname(builtRomPath), { recursive: true });
        await writeFile(builtRomPath, "gba-rom-bytes", "utf8");
        return builtRomPath;
      }
    });

    expect(resolution).toEqual({
      romSourcePath: builtRomPath,
      source: "built"
    });
  });

  it("fails fast by default when no ROM is available (placeholder requires requireRom: false)", async () => {
    const destination = await mkdtemp(path.join(os.tmpdir(), "gbastudio-web-export-require-rom-"));
    temporaryRoots.push(destination);
    const prepared = prepareWebProjectExport(await exportableProject());

    await expect(writeWebProjectExport({
      destination,
      generated: prepared.generated!
    })).rejects.toThrow(/ROM/);
  });

  it("rejects a ROM filename that escapes the Web package", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-web-export-unsafe-rom-name-"));
    temporaryRoots.push(root);
    const destination = path.join(root, "web");
    const romSourcePath = path.join(root, "build", "web_demo.gba");
    const outsidePath = path.join(root, "outside.gba");
    await mkdir(path.dirname(romSourcePath), { recursive: true });
    await writeFile(romSourcePath, "gba-rom-bytes", "utf8");
    await writeFile(outsidePath, "preserve", "utf8");
    const prepared = prepareWebProjectExport(await exportableProject());
    const generated = { ...prepared.generated!, romFileName: "../outside.gba" };

    await expect(writeWebProjectExport({
      destination,
      generated,
      romSourcePath
    })).rejects.toThrow(/romFileName|ROM/);
    await expect(readFile(outsidePath, "utf8")).resolves.toBe("preserve");
  });

  it("marks packageComplete true only when a real .gba is copied", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-web-export-complete-"));
    temporaryRoots.push(root);
    const destination = path.join(root, "web");
    const romSourcePath = path.join(root, "build", "web_demo.gba");
    await mkdir(path.dirname(romSourcePath), { recursive: true });
    await writeFile(romSourcePath, "gba-rom-bytes", "utf8");
    const prepared = prepareWebProjectExport(await exportableProject());

    const result = await writeWebProjectExport({
      destination,
      generated: prepared.generated!,
      romSourcePath
    });

    expect(result.romResolved).toBe(true);
    const manifest = await readFile(path.join(destination, "manifest.json"), "utf8");
    expect(manifest).toContain('"romResolved": true');
    expect(manifest).toContain('"packageComplete": true');
    expect(result.files).toContain(path.join(destination, "roms", "web_demo.gba"));
  });
});
