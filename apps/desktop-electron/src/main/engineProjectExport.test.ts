import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { writeEngineProjectExport, writeEngineSchemaExport } from "./engineProjectExport.js";
import { engineBuildCachePaths } from "./engineBuildCache.js";
import { runGbsbuild, runGbsbuildDryRun } from "./enginePack.js";
import { generateEngineProjectExport } from "../shared/engineProjectExport.js";
import { buildEngineExportProjectContract, prepareEngineProjectExport } from "./exportEngineProject.js";
import { buildFunctionalP0Project } from "../shared/functionalP0Project.js";
import { buildFunctionalRuntimeCanaryProject } from "../shared/functionalRuntimeCanaryProject.js";
import { buildFunctionalIsometricProject } from "../shared/functionalIsometricProject.js";
import { buildFunctionalPlatformerProject } from "../shared/functionalPlatformerProject.js";
import { buildFunctionalShmupProject } from "../shared/functionalShmupProject.js";
import { buildFunctionalCutsceneProject } from "../shared/functionalCutsceneProject.js";
import { buildFunctionalVisualNovelProject } from "../shared/functionalVisualNovelProject.js";
import { buildFunctionalWorldMapProject } from "../shared/functionalWorldMapProject.js";
import { buildFunctionalBattleRpgProject } from "../shared/functionalBattleRpgProject.js";
import { parseGBAProjectFile } from "../shared/projectFile.js";
import { saveProjectFileAtomically } from "./projectPersistence.js";
import { copyCurrentTechnicalAsset } from "./currentTechnicalAssets.js";
import type { GBAProjectData } from "../shared/projectFile.js";

const temporaryRoots: string[] = [];
const execFileAsync = promisify(execFile);
const localEnginePackPath = path.join(process.cwd(), "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
const localAssetcPath = path.join(localEnginePackPath, "tools", process.platform === "win32" ? "assetc.exe" : "assetc");
const localGbsdoctorPath = path.join(localEnginePackPath, "tools", process.platform === "win32" ? "gbsdoctor.exe" : "gbsdoctor");
const localGbsbuildPath = path.join(localEnginePackPath, "tools", process.platform === "win32" ? "gbsbuild.exe" : "gbsbuild");
const functionalP0FixtureAssetPaths = [
  "tiles/tiles_topdown_sandbox.png",
  "tiles/tiles_overworld.png",
  "tiles/isometric-sandbox-sheet.png",
  "sprites/player_topdown_4dir.png",
  "sprites/actor_point_click.png",
  "sprites/cursor_point_click.png",
  "sprites/player_platformer.png",
  "sprites/actor_isometric.png",
  "sprites/player_shmup.png",
  "sprites/projectile_shmup.png",
  "sprites/enemy_shmup.png",
  "portraits/portrait.png",
  "ui/dialogue_box.png",
  "ui/dialogue_selector.png",
  "fonts/gba-dialogue-font-v3.png",
  "fonts/gba-variable-font.png",
  "audio/intro_theme.mod",
  "audio/confirm.wav"
] as const;
const fixtureEvidenceDir = process.env.GBA_STUDIO_ENGINE_EXPORT_EVIDENCE_DIR;
const p0EvidenceDir = process.env.GBA_STUDIO_ENGINE_P0_EXPORT_EVIDENCE_DIR;
const runtimeCanaryEvidenceDir = process.env.GBA_STUDIO_RUNTIME_CANARY_EXPORT_EVIDENCE_DIR;
const mixedRuntimeEvidenceDir = process.env.GBA_STUDIO_MIXED_RUNTIME_EXPORT_EVIDENCE_DIR;
const templateP0EvidenceDir = process.env.GBA_STUDIO_TEMPLATE_P0_EXPORT_EVIDENCE_DIR;
const isometricAnimationEvidenceDir = process.env.GBA_STUDIO_ISOMETRIC_ANIMATION_EXPORT_EVIDENCE_DIR;

function exportableProject(overrides: GBAProjectData): GBAProjectData {
  return {
    assets: [],
    assetGroups: [],
    scenas: [{ name: "start", width: 20, height: 18 }],
    animations: [],
    animationStates: [],
    spriteReferenceImages: [],
    audioItems: [],
    events: [],
    ...overrides,
    settings: {
      general: {
        gameTitle: "Export Test",
        startScene: "start",
        startSceneType: "topdown",
        exportFolder: "build",
        ...((overrides.settings as { general?: Record<string, unknown> } | undefined)?.general ?? {})
      },
      build: {
        romFileName: "export_test.gba",
        exportFormat: "gba_rom",
        engineBackend: "gbastudio_engine",
        enginePackPath: localEnginePackPath,
        ...((overrides.settings as { build?: Record<string, unknown> } | undefined)?.build ?? {})
      },
      preview: {
        defaultMode: "quick_preview",
        scale: 3,
        runAfterBuild: false
      },
      audio: {
        audioEngine: "gbastudio_engine_audio",
        audioMode: "chiptune_pcm",
        masterVolume: 100
      },
      save: {
        saveType: "sram",
        slots: 3,
        autoSave: true
      },
      debug: {
        developerMode: false,
        preserveTempFiles: false,
        exportReadableButanoProject: false
      }
    }
  };
}

async function materializeFunctionalP0ProjectTree(
  projectRoot: string,
  project: GBAProjectData,
  projectFileName = "electron-p0.gbastudio"
): Promise<string> {
  const projectPath = path.join(projectRoot, projectFileName);
  await mkdir(projectRoot, { recursive: true });
  await writeFile(projectPath, JSON.stringify({ schemaVersion: 1, data: project }, null, 2), "utf8");

  await Promise.all(functionalP0FixtureAssetPaths.map(async (relativeAssetPath) => {
    const destinationPath = path.join(projectRoot, "Assets", relativeAssetPath);
    await copyCurrentTechnicalAsset({
      appRoot: process.cwd(),
      relativePath: relativeAssetPath,
      destinationPath
    });
  }));

  return projectPath;
}

function withComposedConfirmSfx(project: GBAProjectData): GBAProjectData {
  const audioItems = Array.isArray(project.audioItems) ? [...project.audioItems] : [];
  const confirmIndex = audioItems.findIndex((item) => (
    typeof item === "object"
    && item !== null
    && !Array.isArray(item)
    && ((item as Record<string, unknown>).id === "audio-confirm"
      || (item as Record<string, unknown>).name === "confirm.wav")
  ));
  if (confirmIndex < 0) return project;

  const confirm = audioItems[confirmIndex] as Record<string, unknown>;
  const channels = Array.isArray(confirm.channels) ? confirm.channels : [];
  const hasComposedNoise = channels.some((channel) => (
    typeof channel === "object"
    && channel !== null
    && !Array.isArray(channel)
    && Array.isArray((channel as Record<string, unknown>).notes)
    && ((channel as Record<string, unknown>).notes as unknown[]).some((note) => (
      typeof note === "string" && note.trim().length > 0 && note.trim() !== "---"
    ))
  ));
  if (hasComposedNoise) return project;

  audioItems[confirmIndex] = {
    ...confirm,
    channels: [{
      id: "ch-noise",
      name: "Noise",
      type: "noise",
      instrument: "Noise Kit",
      volume: 13,
      dutyCycle: "Noise",
      notes: ["K", "---", "S"],
      muted: false,
      solo: false
    }]
  };
  return { ...project, audioItems };
}

function buildFunctionalP0NativeExportProject(): GBAProjectData {
  return buildFunctionalP0Project();
}

async function assertNativeVisualExportArtifacts(destination: string, expectedTarget: string): Promise<void> {
  const exportContract = JSON.parse(await readFile(path.join(destination, "export_project.json"), "utf8")) as {
    asset_pack?: { assets?: Array<{ kind?: string }> };
    topdown_project?: {
      player?: { metasprite?: unknown; animations?: unknown[] };
      rooms?: Array<{ visual_tilemap?: string; visual_tiles?: number[]; foreground_tiles?: number[] }>;
    };
  };
  expect(exportContract.topdown_project?.player?.metasprite).toBeTruthy();
  expect(exportContract.topdown_project?.player?.animations?.length).toBeGreaterThan(0);
  expect(exportContract.topdown_project?.rooms?.[0]?.visual_tilemap).toBeTruthy();
  expect(exportContract.topdown_project?.rooms?.[0]?.visual_tiles?.length).toBeGreaterThan(0);
  expect(exportContract.asset_pack?.assets).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "bg" }),
    expect.objectContaining({ kind: "obj" })
  ]));

  const mainCpp = await readFile(path.join(destination, "main.cpp"), "utf8");
  expect(mainCpp).toContain("load_project_assets()");
  expect(mainCpp).toContain("gbs::draw_room_to_bg(gbs::BackgroundLayer::BG2");
  expect(mainCpp).toContain("gbs::draw_room_to_bg(gbs::BackgroundLayer::BG1");
  expect(mainCpp).toContain("set_actor_metasprite(");
  expect(mainCpp).not.toContain("struct RuntimeWitnessState");
  expect(mainCpp).not.toContain("tile_runtime_player");
  const projectHeader = await readFile(path.join(destination, "gbastudio_project_data.hpp"), "utf8");
  expect(projectHeader).toContain("const gbs::TopDownProjectData project");
  if (expectedTarget === "electron_p0_functional") {
    const audioPack = JSON.parse(await readFile(path.join(destination, "assets/audio/project_audio.json"), "utf8")) as {
      pcm?: unknown[];
      sfx?: unknown[];
      tracker?: unknown[];
    };
    expect(audioPack.pcm).toHaveLength(1);
    expect(audioPack.sfx).toHaveLength(0);
    expect(audioPack.tracker).toHaveLength(1);
    const generatedExport = JSON.parse(await readFile(path.join(destination, "export_project.json"), "utf8")) as {
      topdown_project?: { scripts?: Array<{ name?: string; script?: Array<{ op?: string }> }> };
    };
    expect(generatedExport.topdown_project?.scripts?.find((script) => script.name === "room_boot")?.script)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ op: "run_audio_routine" }),
        expect.objectContaining({ op: "play_pcm_sfx" })
      ]));
    const animationNames = (exportContract.topdown_project?.player?.animations ?? [])
      .map((animation) => (animation && typeof animation === "object" && "name" in animation
        ? String((animation as { name?: string }).name ?? "")
        : ""));
    expect(animationNames).toEqual([
      "idle_down",
      "idle_right",
      "idle_up",
      "idle_left",
      "walk_down",
      "walk_right",
      "walk_up",
      "walk_left"
    ]);
    expect(projectHeader).toContain("player_walk_down_animation");
    const animationCountMatch = projectHeader.match(/player_animations,\s*\n\s*(\d+)/);
    expect(Number(animationCountMatch?.[1] ?? 0)).toBe(8);
  }

  const { stdout } = await execFileAsync(localGbsdoctorPath, [
    "--engine-pack",
    localEnginePackPath,
    "--project-dir",
    destination,
    "--json",
    "--skip-toolchain"
  ], { maxBuffer: 8 * 1024 * 1024 });
  expect(JSON.parse(stdout) as { ok?: boolean }).toMatchObject({ ok: true });

  const buildDryRun = await runGbsbuildDryRun({
    enginePackPath: localEnginePackPath,
    gbsbuildPath: localGbsbuildPath,
    projectDir: destination
  });
  expect(buildDryRun.exitCode).toBe(0);
  expect(buildDryRun.summary?.command).toContain(`TARGET=${expectedTarget}`);

  const build = await runGbsbuild({
    enginePackPath: localEnginePackPath,
    gbsbuildPath: localGbsbuildPath,
    projectDir: destination
  });
  expect(build.exitCode).toBe(0);
  expect(existsSync(path.join(destination, "build", `${expectedTarget}.gba`))).toBe(true);
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Engine project export writer", () => {
  it("writes export_project.json and delegates package generation to assetc", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-schema-export-"));
    temporaryRoots.push(root);
    const enginePackPath = path.join(root, "EnginePack");
    const toolsPath = path.join(enginePackPath, "tools");
    const destination = path.join(root, "exported");
    await mkdir(toolsPath, { recursive: true });
    const assetcPath = path.join(toolsPath, process.platform === "win32" ? "assetc.cmd" : "assetc");
    const helperPath = path.join(toolsPath, "assetc-fake.cjs");
    await writeFile(helperPath, [
      "const { readFileSync, writeFileSync } = require('node:fs');",
      "const { join } = require('node:path');",
      "const args = process.argv.slice(2);",
      "if (args[0] !== '--export-project-json') process.exit(64);",
      "const output = args[args.indexOf('-o') + 1];",
      "const contractPath = args.at(-1);",
      "const contract = JSON.parse(readFileSync(contractPath, 'utf8'));",
      "writeFileSync(join(output, 'gbastudio_project.json'), JSON.stringify({ schema: 1, backend: 'gbastudio_engine', kind: contract.kind, entry: contract.entry, project_data: contract.project_data, generated_assets: contract.generated_assets, requires: contract.requires, build: contract.build }, null, 2) + '\\n');",
      "writeFileSync(join(output, 'main.cpp'), 'int main() { return 0; }\\n');",
      "writeFileSync(join(output, 'gbastudio_project_data.hpp'), '#pragma once\\n');",
      "process.stderr.write('AVISO[palette_quantized]: tiles.png: paleta RGBA reduzida automaticamente para 16 cores.\\n');",
      "process.stderr.write('AVISO[palette_quantized]: tiles.png: paleta RGBA reduzida automaticamente para 16 cores.\\n');",
      ""
    ].join("\n"), "utf8");
    await writeFile(
      assetcPath,
      process.platform === "win32"
        ? `@echo off\r\nnode "%~dp0assetc-fake.cjs" %*\r\n`
        : "#!/bin/sh\nnode \"$(dirname \"$0\")/assetc-fake.cjs\" \"$@\"\n",
      "utf8"
    );
    if (process.platform !== "win32") {
      await chmod(assetcPath, 0o755);
    }

    const contract = buildEngineExportProjectContract(exportableProject({
      name: "Schema Export",
      settings: {
        build: { romFileName: "schema_export.gba" }
      }
    }), { enginePackPath, enginePackVersion: "2.24.0" });

    const result = await writeEngineSchemaExport({
      destination,
      assetcPath,
      prepared: { target: "schema_export", contract, assets: [] }
    });

    expect(result.files).toEqual([
      path.join(destination, "export_project.json"),
      path.join(destination, "gbastudio_project.json"),
      path.join(destination, "gbastudio_project_data.hpp"),
      path.join(destination, "main.cpp")
    ]);
    expect(result.warnings).toEqual([
      "tiles.png: paleta RGBA reduzida automaticamente para 16 cores."
    ]);
    await expect(readFile(path.join(destination, "export_project.json"), "utf8")).resolves.toContain('"topdown_project"');
    await expect(readFile(path.join(destination, "gbastudio_project.json"), "utf8")).resolves.toContain('"target": "schema_export"');
  });

  it("reuses a persistent project cache and preserves the assetc rebuild plan", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-schema-cache-"));
    temporaryRoots.push(root);
    const projectPath = path.join(root, "game.gba-project");
    const toolsPath = path.join(root, "tools");
    const counterPath = path.join(root, "assetc-count.txt");
    await mkdir(toolsPath, { recursive: true });
    await writeFile(projectPath, "{}", "utf8");
    const assetcPath = path.join(toolsPath, process.platform === "win32" ? "assetc.cmd" : "assetc");
    const helperPath = path.join(toolsPath, "assetc-cache-fake.cjs");
    await writeFile(helperPath, [
      "const { existsSync, readFileSync, writeFileSync } = require('node:fs');",
      "const { join } = require('node:path');",
      `const counter = ${JSON.stringify(counterPath)};`,
      "const count = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) + 1 : 1;",
      "writeFileSync(counter, String(count));",
      "const args = process.argv.slice(2);",
      "const output = args[args.indexOf('-o') + 1];",
      "writeFileSync(join(output, 'main.cpp'), 'int main() { return 0; }\\n');",
      "writeFileSync(join(output, 'gbastudio_project.json'), '{}\\n');",
      "writeFileSync(join(output, 'gbastudio_project_data.hpp'), '#pragma once\\n');",
      "writeFileSync(join(output, 'asset_pack_report.json'), JSON.stringify({ rebuild_plan: { changed: ['player'], reused: ['tiles'] } }, null, 2));",
      ""
    ].join("\n"), "utf8");
    await writeFile(
      assetcPath,
      process.platform === "win32"
        ? `@echo off\r\nnode "%~dp0assetc-cache-fake.cjs" %*\r\n`
        : "#!/bin/sh\nnode \"$(dirname \"$0\")/assetc-cache-fake.cjs\" \"$@\"\n",
      "utf8"
    );
    if (process.platform !== "win32") await chmod(assetcPath, 0o755);

    const prepared = {
      target: "cached",
      contract: buildEngineExportProjectContract(exportableProject({
        name: "Cached",
        settings: { build: { romFileName: "cached.gba" } }
      })),
      assets: []
    };
    const first = await writeEngineSchemaExport({
      destination: path.join(root, "first"),
      assetcPath,
      prepared,
      projectPath,
      cacheEnabled: true
    });
    const second = await writeEngineSchemaExport({
      destination: path.join(root, "second"),
      assetcPath,
      prepared,
      projectPath,
      cacheEnabled: true
    });
    const revisedPrepared = {
      ...prepared,
      contract: buildEngineExportProjectContract(exportableProject({
        name: "Cached revision",
        settings: { build: { romFileName: "cached_revision.gba" } }
      }))
    };
    const third = await writeEngineSchemaExport({
      destination: path.join(root, "third"),
      assetcPath,
      prepared: revisedPrepared,
      projectPath,
      cacheEnabled: true
    });
    const fourth = await writeEngineSchemaExport({
      destination: path.join(root, "fourth"),
      assetcPath,
      prepared,
      projectPath,
      cacheEnabled: true
    });

    expect(first.cache).toMatchObject({
      hit: false,
      rebuildPlan: { changed: ["player"], reused: ["tiles"] }
    });
    expect(second.cache).toMatchObject({
      hit: true,
      rebuildPlan: { changed: ["player"], reused: ["tiles"] }
    });
    expect(third.cache).toMatchObject({ hit: false });
    expect(fourth.cache).toMatchObject({
      hit: true,
      rebuildPlan: { changed: ["player"], reused: ["tiles"] }
    });
    await expect(readFile(counterPath, "utf8")).resolves.toBe("2");
    await expect(readFile(path.join(root, "second", "main.cpp"), "utf8")).resolves.toContain("int main");
    await expect(readFile(path.join(root, "fourth", "main.cpp"), "utf8")).resolves.toContain("int main");
  });

  it("rebuilds when a cached generated asset is missing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-schema-cache-missing-"));
    temporaryRoots.push(root);
    const projectPath = path.join(root, "game.gba-project");
    const toolsPath = path.join(root, "tools");
    const counterPath = path.join(root, "assetc-count.txt");
    await mkdir(toolsPath, { recursive: true });
    await writeFile(projectPath, "{}", "utf8");
    const assetcPath = path.join(toolsPath, process.platform === "win32" ? "assetc.cmd" : "assetc");
    const helperPath = path.join(toolsPath, "assetc-missing-cache-fake.cjs");
    await writeFile(helperPath, [
      "const { existsSync, readFileSync, writeFileSync } = require('node:fs');",
      "const { join } = require('node:path');",
      `const counter = ${JSON.stringify(counterPath)};`,
      "const count = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) + 1 : 1;",
      "writeFileSync(counter, String(count));",
      "const args = process.argv.slice(2);",
      "const output = args[args.indexOf('-o') + 1];",
      "writeFileSync(join(output, 'main.cpp'), 'int main() { return 0; }\\n');",
      "writeFileSync(join(output, 'gbastudio_project.json'), '{}\\n');",
      "writeFileSync(join(output, 'gbastudio_project_data.hpp'), '#pragma once\\n');",
      "writeFileSync(join(output, 'required.hpp'), '#pragma once\\n');",
      "writeFileSync(join(output, 'asset_pack_report.json'), JSON.stringify({ rebuild_plan: { changed: ['player'], reused: ['tiles'] } }, null, 2));",
      ""
    ].join("\n"), "utf8");
    await writeFile(
      assetcPath,
      process.platform === "win32"
        ? `@echo off\r\nnode "%~dp0assetc-missing-cache-fake.cjs" %*\r\n`
        : "#!/bin/sh\nnode \"$(dirname \"$0\")/assetc-missing-cache-fake.cjs\" \"$@\"\n",
      "utf8"
    );
    if (process.platform !== "win32") await chmod(assetcPath, 0o755);

    const baseContract = buildEngineExportProjectContract(exportableProject({
      name: "Missing Cached Asset",
      settings: { build: { romFileName: "missing_cached_asset.gba" } }
    }));
    const prepared = {
      target: "missing-cached-asset",
      contract: { ...baseContract, generated_assets: ["required.hpp"] },
      assets: []
    };
    await writeEngineSchemaExport({
      destination: path.join(root, "first"),
      assetcPath,
      prepared,
      projectPath,
      cacheEnabled: true
    });

    const snapshotPath = engineBuildCachePaths(projectPath, "latest").rootPath;
    const snapshot = await readFile(path.join(snapshotPath, "latest.json"), "utf8");
    const fingerprint = JSON.parse(snapshot).fingerprint;
    await rm(path.join(engineBuildCachePaths(projectPath, fingerprint).snapshotPath, "required.hpp"));

    const second = await writeEngineSchemaExport({
      destination: path.join(root, "second"),
      assetcPath,
      prepared,
      projectPath,
      cacheEnabled: true
    });

    expect(second.cache).toMatchObject({ hit: false });
    await expect(readFile(counterPath, "utf8")).resolves.toBe("2");
    await expect(readFile(path.join(root, "second", "required.hpp"), "utf8")).resolves.toContain("#pragma once");
  });

  it("writes generated Engine Pack project files to a destination directory", async () => {
    const destination = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-export-"));
    temporaryRoots.push(destination);
    const generated = generateEngineProjectExport(exportableProject({
      name: "Export Test",
      settings: {
        build: { romFileName: "export_test.gba" }
      }
    }));

    const result = await writeEngineProjectExport({ destination, generated });

    expect(result).toEqual({
      destination,
      files: [
        path.join(destination, "main.cpp"),
        path.join(destination, "gbastudio_project_data.hpp"),
        path.join(destination, "gbastudio_project.json"),
        path.join(destination, "README.md")
      ]
    });
    await expect(readFile(path.join(destination, "gbastudio_project.json"), "utf8")).resolves.toContain('"target": "export_test"');
  });

  it("generates separate BG2 ground and BG1 foreground data for the playable runtime", () => {
    const generated = generateEngineProjectExport(buildFunctionalRuntimeCanaryProject());
    const header = generated.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";
    const main = generated.files.find((file) => file.path === "main.cpp")?.contents ?? "";

    expect(header).toContain("struct ForegroundCellData");
    expect(header).toContain("constexpr ForegroundCellData foreground_cells");
    expect(header).toContain("{0, 336, 142}");
    expect(main).toContain("gbs::set_bg_tile(gbs::BackgroundLayer::BG1");
    expect(main).toContain("gbs::set_bg_tile(gbs::BackgroundLayer::BG2");
  });

  it("copies processable project assets into the exported Engine Pack package", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-export-assets-"));
    temporaryRoots.push(root);
    const projectPath = path.join(root, "Game", "demo.gba-project");
    const sourceAssetPath = path.join(root, "Game", "Assets", "Sprites", "Player Idle.PNG");
    const destination = path.join(root, "exported");
    await mkdir(path.dirname(sourceAssetPath), { recursive: true });
    await writeFile(projectPath, "{}", "utf8");
    await writeFile(sourceAssetPath, "sprite-bytes", "utf8");

    const generated = generateEngineProjectExport(exportableProject({
      name: "Asset Copy",
      assets: [
        { id: "asset-player", name: "Player Idle.PNG", kind: "Sprite", metadata: { source: "Assets/Sprites/Player Idle.PNG" } }
      ]
    }));

    const result = await writeEngineProjectExport({ destination, generated, projectPath });

    const copiedAsset = path.join(destination, "assets", "sprite", "player_idle.png");
    expect(result.files).toContain(copiedAsset);
    await expect(readFile(copiedAsset, "utf8")).resolves.toBe("sprite-bytes");
  });

  it.runIf(existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))("exports generated assets that pass the real Engine Pack doctor", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-export-doctor-"));
    temporaryRoots.push(root);
    const projectPath = path.join(root, "Game", "demo.gba-project");
    const sourceAssetPath = path.join(root, "Game", "Assets", "Sprites", "Player Idle.PNG");
    const destination = path.join(root, "exported");
    await mkdir(path.dirname(sourceAssetPath), { recursive: true });
    await writeFile(projectPath, "{}", "utf8");
    await writeFile(sourceAssetPath, "sprite-bytes", "utf8");

    const generated = generateEngineProjectExport(exportableProject({
      name: "Asset Doctor",
      settings: {
        build: { romFileName: "asset_doctor.gba" }
      },
      assets: [
        { id: "asset-player", name: "Player Idle.PNG", kind: "Sprite", metadata: { source: "Assets/Sprites/Player Idle.PNG" } }
      ]
    }));
    await writeEngineProjectExport({ destination, generated, projectPath });

    const { stdout } = await execFileAsync(localGbsdoctorPath, [
      "--engine-pack",
      localEnginePackPath,
      "--project-dir",
      destination,
      "--json",
      "--skip-toolchain"
    ], { maxBuffer: 8 * 1024 * 1024 });
    const report = JSON.parse(stdout) as { checks?: Array<{ key?: string; ok?: boolean; value?: unknown }> };
    expect(report.checks).toContainEqual(expect.objectContaining({
      key: "project_generated_asset",
      ok: true,
      value: "assets/sprite/player_idle.png"
    }));

    const buildDryRun = await runGbsbuildDryRun({
      enginePackPath: localEnginePackPath,
      gbsbuildPath: localGbsbuildPath,
      projectDir: destination
    });
    expect(buildDryRun.exitCode).toBe(0);
    expect(buildDryRun.summary?.projectDir ? await realpath(buildDryRun.summary.projectDir) : "").toBe(await realpath(destination));
    expect(buildDryRun.summary?.command).toContain("TARGET=asset_doctor");

    const build = await runGbsbuild({
      enginePackPath: localEnginePackPath,
      gbsbuildPath: localGbsbuildPath,
      projectDir: destination
    });
    expect(build.exitCode).toBe(0);
    expect(existsSync(path.join(destination, "build", "asset_doctor.gba"))).toBe(true);
  });

  it.runIf(existsSync(localAssetcPath) && existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))("exports the shared fixture through assetc export_project.json into a buildable Engine Pack ROM", async () => {
    const root = fixtureEvidenceDir
      ? path.resolve(fixtureEvidenceDir)
      : await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-schema-export-real-"));
    if (fixtureEvidenceDir) {
      await rm(root, { recursive: true, force: true });
      await mkdir(root, { recursive: true });
    } else {
      temporaryRoots.push(root);
    }
    const projectRoot = path.join(root, "Game");
    const projectPath = path.join(projectRoot, "topdown-demo.gba-project");
    const destination = path.join(root, "exported-fixture");
    const fixture = await readFile(path.join(process.cwd(), "../../packages/project-contract/fixtures/topdown-demo.gba-project"), "utf8");
    const project = withComposedConfirmSfx(parseGBAProjectFile(fixture).data);
    project.actors = [
      ...(Array.isArray(project.actors) ? project.actors : []),
      { id: "actor-guide", name: "Guide", roomName: "overworld_start", x: 4, y: 5 }
    ];
    project.events = [
      ...(Array.isArray(project.events) ? project.events : []).map((event) => (
        typeof event === "object" && event !== null && !Array.isArray(event) && event.name === "room_boot"
          ? {
              ...event,
              steps: [
                ...(Array.isArray(event.steps) ? event.steps : []),
                { command: "set_variable score 1" },
                { command: "set_variable story.target 1" },
                { command: "if_variable_variable score story.target" },
                { command: "add_variable route 1" },
                { command: "if_engine_field player_x 16" },
                { command: "add_variable route 1" },
                { command: "if_engine_field_variable player_y story.target" },
                { command: "add_variable route 1" },
                { command: "if_button a" },
                { command: "add_variable route 1" },
                { command: "if_actor_direction Guide down" },
                { command: "add_variable route 1" },
                { command: "if_actor_at_position Guide 4 5" },
                { command: "add_variable route 1" },
                { command: "if_actor_distance Guide player 8" },
                { command: "add_variable route 1" },
                { command: "if_actor_relative Guide player right" },
                { command: "add_variable route 1" },
                { command: "attach_button a on_action" },
                { command: "timer_attach 60 on_tick" }
              ]
            }
          : event
      )),
      {
        id: "event-native-state",
        name: "native_state",
        category: "Controle",
        steps: [
          { command: "set_variable_flags story.flags 6" },
          { command: "set_actor_collision_enabled Guide false" },
          { command: "set_all_sprites_visible false" },
          { command: "set_actor_animation_speed Guide 125" },
          { command: "player_bounce 2 30" },
          { command: "set_actor_collision_box Guide 0 1 12 14" },
          { command: "set_player_speed_profile 110 175 a 3" },
          { command: "set_player_movement_state swimming water" },
          { command: "store_actor_position Guide actor.x actor.y" },
          { command: "store_actor_direction Guide actor.direction" },
          { command: "set_random_seed story.seed" },
          { command: "wait_button a" },
          { command: "set_stat hp 16 24" },
          { command: "remove_button b" },
          { command: "timer_restart on_tick" },
          { command: "timer_remove on_tick" }
        ]
      },
      { id: "event-action", name: "on_action", category: "Controle", steps: [{ command: "show_dialogue callback_action" }] },
      { id: "event-tick", name: "on_tick", category: "Controle", steps: [{ command: "add_variable timer.count 1" }] }
    ];
    project.dialogues = [
      ...(Array.isArray(project.dialogues) ? project.dialogues : []),
      { key: "callback_action", text: "CALLBACK A OK", character: "Runtime" }
    ];
    await mkdir(projectRoot, { recursive: true });
    await writeFile(projectPath, JSON.stringify({ schemaVersion: 1, data: project }, null, 2), "utf8");
    await mkdir(path.join(projectRoot, "Assets", "tiles"), { recursive: true });
    await mkdir(path.join(projectRoot, "Assets", "sprites"), { recursive: true });
    await mkdir(path.join(projectRoot, "Assets", "music"), { recursive: true });
    await mkdir(path.join(projectRoot, "Assets", "sounds"), { recursive: true });
    await copyCurrentTechnicalAsset({
      appRoot: process.cwd(),
      relativePath: "tiles/tiles_overworld.png",
      destinationPath: path.join(projectRoot, "Assets", "tiles", "tiles_overworld.png")
    });
    await copyCurrentTechnicalAsset({
      appRoot: process.cwd(),
      relativePath: "sprites/player_topdown_4dir.png",
      destinationPath: path.join(projectRoot, "Assets", "sprites", "player_topdown_4dir.png")
    });
    await copyCurrentTechnicalAsset({
      appRoot: process.cwd(),
      relativePath: "sprites/actor_point_click.png",
      destinationPath: path.join(projectRoot, "Assets", "sprites", "actor_point_click.png")
    });
    await copyCurrentTechnicalAsset({
      appRoot: process.cwd(),
      relativePath: "sprites/cursor_point_click.png",
      destinationPath: path.join(projectRoot, "Assets", "sprites", "cursor_point_click.png")
    });
    await copyCurrentTechnicalAsset({
      appRoot: process.cwd(),
      relativePath: "fonts/gba-dialogue-font-v3.png",
      destinationPath: path.join(projectRoot, "Assets", "fonts", "gba-dialogue-font-v3.png")
    });
    await copyCurrentTechnicalAsset({
      appRoot: process.cwd(),
      relativePath: "fonts/gba-variable-font.png",
      destinationPath: path.join(projectRoot, "Assets", "fonts", "gba-variable-font.png")
    });
    await writeFile(path.join(projectRoot, "Assets", "music", "intro_theme.mod"), "music", "utf8");
    await writeFile(path.join(projectRoot, "Assets", "sounds", "confirm.wav"), "sfx", "utf8");

    const prepared = prepareEngineProjectExport(project, {
      enginePackPath: localEnginePackPath,
      enginePackVersion: "2.24.0"
    });
    expect(prepared.error).toBeUndefined();
    expect(prepared.generated).toBeDefined();
    await writeEngineSchemaExport({
      destination,
      assetcPath: localAssetcPath,
      prepared: prepared.generated!,
      projectPath
    });

    await expect(readFile(path.join(destination, "export_project.json"), "utf8")).resolves.toContain('"topdown_project"');
    await expect(readFile(path.join(destination, "gbastudio_project.json"), "utf8")).resolves.toContain('"runtime_profile": "topdown"');
    const generatedHeader = await readFile(path.join(destination, "gbastudio_project_data.hpp"), "utf8");
    for (const eventOp of [
      "SetVariableFlags",
      "SetActorCollisionEnabled",
      "SetAllSpritesVisible",
      "SetActorAnimationSpeed",
      "PlayerBounce",
      "SetActorCollisionBox",
      "SetPlayerSpeedProfile",
      "SetPlayerMovementState",
      "StoreActorPosition",
      "StoreActorDirection",
      "SetRandomSeed",
      "WaitButtonPressed",
      "SetStat",
      "JumpIfVariableEqualsVariable",
      "JumpIfEngineFieldEquals",
      "JumpIfEngineFieldEqualsVariable",
      "JumpIfButtonPressed",
      "JumpIfActorDirection",
      "JumpIfActorAtPosition",
      "JumpIfActorDistance",
      "JumpIfActorRelative",
      "AttachButtonEvent",
      "RemoveButtonEvent",
      "AttachTimerEvent",
      "RestartTimerEvent",
      "RemoveTimerEvent"
    ]) {
      expect(generatedHeader).toContain(`gbs::EventOp::${eventOp}`);
    }
    const generatedMain = await readFile(path.join(destination, "main.cpp"), "utf8");
    expect(generatedMain).toContain("gbs::update_button_event_bindings(event_state)");
    expect(generatedMain).toContain("gbs::update_timer_event_bindings(event_state)");
    expect(generatedMain).toContain("sync_event_player_actor_state();");
    await assertNativeVisualExportArtifacts(destination, "electron_topdown_demo");

    const schemaValidation = await execFileAsync(localGbsdoctorPath, [
      "--engine-pack",
      localEnginePackPath,
      "--validate-public-schema",
      "auto",
      "--schema-document",
      path.join(destination, "gbastudio_project.json"),
      "--json"
    ], { maxBuffer: 8 * 1024 * 1024 });
    expect(JSON.parse(schemaValidation.stdout) as { ok?: boolean }).toMatchObject({ ok: true });
  }, 20_000);

  it.runIf(existsSync(localAssetcPath) && existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))("exports a platformer start room through assetc into a buildable native platformer ROM", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-platformer-export-real-"));
    temporaryRoots.push(root);
    const projectRoot = path.join(root, "Game");
    const projectPath = path.join(projectRoot, "platformer-demo.gba-project");
    const destination = path.join(root, "exported-platformer");
    const project = exportableProject({
      name: "Platformer Export",
      scenas: [{
        id: "room-platformer",
        name: "stage_1",
        width: 20,
        height: 18,
        sceneType: "platformer",
        eventBindings: { onInit: "room_boot" },
        collisionTypes: Array.from({ length: 20 * 18 }, (_item, index) => index >= 20 * 16 ? "solid" : "free")
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "stage_1", x: 2, y: 12 }],
      events: [{ id: "event-room", name: "room_boot", category: "Cena", steps: [{ command: "show_dialogue intro" }] }],
      dialogues: [{ key: "intro", text: "Platformer native export." }],
      settings: {
        general: { gameTitle: "Platformer Export", startScene: "stage_1", startSceneType: "platformer" },
        build: { romFileName: "platformer_export.gba" }
      }
    });
    await mkdir(projectRoot, { recursive: true });
    await writeFile(projectPath, JSON.stringify(project, null, 2), "utf8");

    const prepared = prepareEngineProjectExport(project, {
      enginePackPath: localEnginePackPath,
      enginePackVersion: "2.24.0"
    });
    expect(prepared.error).toBeUndefined();
    expect(prepared.generated).toBeDefined();
    await writeEngineSchemaExport({
      destination,
      assetcPath: localAssetcPath,
      prepared: prepared.generated!,
      projectPath
    });

    await expect(readFile(path.join(destination, "export_project.json"), "utf8")).resolves.toContain('"platformer_project"');
    await expect(readFile(path.join(destination, "gbastudio_project.json"), "utf8")).resolves.toContain('"runtime_profile": "platformer"');
    await expect(readFile(path.join(destination, "platformer_project_data.hpp"), "utf8")).resolves.toContain("const gbs::PlatformerProjectData project");

    const schemaValidation = await execFileAsync(localGbsdoctorPath, [
      "--engine-pack",
      localEnginePackPath,
      "--validate-public-schema",
      "auto",
      "--schema-document",
      path.join(destination, "gbastudio_project.json"),
      "--json"
    ], { maxBuffer: 8 * 1024 * 1024 });
    expect(JSON.parse(schemaValidation.stdout) as { ok?: boolean }).toMatchObject({ ok: true });

    const { stdout } = await execFileAsync(localGbsdoctorPath, [
      "--engine-pack",
      localEnginePackPath,
      "--project-dir",
      destination,
      "--json",
      "--skip-toolchain"
    ], { maxBuffer: 8 * 1024 * 1024 });
    expect(JSON.parse(stdout) as { ok?: boolean }).toMatchObject({ ok: true });

    const buildDryRun = await runGbsbuildDryRun({
      enginePackPath: localEnginePackPath,
      gbsbuildPath: localGbsbuildPath,
      projectDir: destination
    });
    expect(buildDryRun.exitCode).toBe(0);
    expect(buildDryRun.summary?.command).toContain("TARGET=platformer_export");

    const build = await runGbsbuild({
      enginePackPath: localEnginePackPath,
      gbsbuildPath: localGbsbuildPath,
      projectDir: destination
    });
    expect(build.exitCode, build.stderr ?? build.error).toBe(0);
    expect(existsSync(path.join(destination, "build", "platformer_export.gba"))).toBe(true);
  });

  it.runIf(existsSync(localAssetcPath) && existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))("exports a dungeon crawler room through assetc into a buildable native ROM", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-dungeon-export-real-"));
    temporaryRoots.push(root);
    const projectRoot = path.join(root, "Game");
    const projectPath = path.join(projectRoot, "dungeon-demo.gba-project");
    const destination = path.join(root, "exported-dungeon");
    const width = 16;
    const height = 16;
    const project = exportableProject({
      name: "Dungeon Crawler Export",
      scenas: [{
        id: "room-dungeon",
        name: "crypt",
        width,
        height,
        sceneType: "dungeonCrawler",
        collisionTypes: Array.from({ length: width * height }, (_item, index) => {
          const x = index % width;
          const y = Math.floor(index / width);
          return x === 0 || y === 0 || x === width - 1 || y === height - 1 ? "solid" : "free";
        }),
        runtime: {
          type: "dungeonCrawler",
          config: { stepDurationMs: 200, turnDurationMs: 100, allowBackstep: true, viewDistance: 6 }
        }
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "crypt", x: 2, y: 2, direction: "right" }],
      settings: {
        general: { gameTitle: "Dungeon Crawler Export", startScene: "crypt", startSceneType: "dungeonCrawler" },
        build: { romFileName: "dungeon_crawler_export.gba" }
      }
    });
    await mkdir(projectRoot, { recursive: true });
    await writeFile(projectPath, JSON.stringify(project, null, 2), "utf8");

    const prepared = prepareEngineProjectExport(project, {
      enginePackPath: localEnginePackPath,
      enginePackVersion: "2.24.0"
    });
    expect(prepared.error).toBeUndefined();
    await writeEngineSchemaExport({
      destination,
      assetcPath: localAssetcPath,
      prepared: prepared.generated!,
      projectPath
    });

    await expect(readFile(path.join(destination, "export_project.json"), "utf8")).resolves.toContain('"dungeon_crawler_project"');
    await expect(readFile(path.join(destination, "gbastudio_project.json"), "utf8")).resolves.toContain('"runtime_profile": "dungeon_crawler"');
    await expect(readFile(path.join(destination, "dungeon_crawler_project_data.hpp"), "utf8")).resolves.toContain("gbs::DungeonCrawlerProjectData project");

    const schemaValidation = await execFileAsync(localGbsdoctorPath, [
      "--engine-pack", localEnginePackPath,
      "--validate-public-schema", "auto",
      "--schema-document", path.join(destination, "gbastudio_project.json"),
      "--json"
    ], { maxBuffer: 8 * 1024 * 1024 });
    expect(JSON.parse(schemaValidation.stdout) as { ok?: boolean }).toMatchObject({ ok: true });

    const build = await runGbsbuild({
      enginePackPath: localEnginePackPath,
      gbsbuildPath: localGbsbuildPath,
      projectDir: destination
    });
    expect(build.exitCode, build.stderr ?? build.error).toBe(0);
    expect(existsSync(path.join(destination, "build", "dungeon_crawler_export.gba"))).toBe(true);
  });

  it.runIf(existsSync(localAssetcPath) && existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))("exports a racing room through assetc into a buildable native ROM", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-racing-export-real-"));
    temporaryRoots.push(root);
    const projectRoot = path.join(root, "Game");
    const projectPath = path.join(projectRoot, "racing-demo.gba-project");
    const destination = path.join(root, "exported-racing");
    const width = 16;
    const height = 32;
    const project = exportableProject({
      name: "Racing Export",
      scenas: [{
        id: "room-racing",
        name: "coastal_track",
        width,
        height,
        sceneType: "racing",
        collisionTypes: Array.from({ length: width * height }, (_item, index) => {
          const x = index % width;
          return x < 2 || x > width - 3 ? "solid" : "free";
        }),
        runtime: { type: "racing", config: { maxSpeed: 6, acceleration: 10, brakePower: 14, steeringSpeed: 2.5 } }
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "coastal_track", x: 8, y: 28 }],
      settings: {
        general: { gameTitle: "Racing Export", startScene: "coastal_track", startSceneType: "racing" },
        build: { romFileName: "racing_export.gba" }
      }
    });
    await mkdir(projectRoot, { recursive: true });
    await writeFile(projectPath, JSON.stringify(project, null, 2), "utf8");

    const prepared = prepareEngineProjectExport(project, {
      enginePackPath: localEnginePackPath,
      enginePackVersion: "2.24.0"
    });
    expect(prepared.error).toBeUndefined();
    await writeEngineSchemaExport({
      destination,
      assetcPath: localAssetcPath,
      prepared: prepared.generated!,
      projectPath
    });

    await expect(readFile(path.join(destination, "export_project.json"), "utf8")).resolves.toContain('"racing_project"');
    await expect(readFile(path.join(destination, "gbastudio_project.json"), "utf8")).resolves.toContain('"runtime_profile": "racing"');
    await expect(readFile(path.join(destination, "racing_project_data.hpp"), "utf8")).resolves.toContain("gbs::RacingProjectData project");

    const build = await runGbsbuild({
      enginePackPath: localEnginePackPath,
      gbsbuildPath: localGbsbuildPath,
      projectDir: destination
    });
    expect(build.exitCode, build.stderr ?? build.error).toBe(0);
    expect(existsSync(path.join(destination, "build", "racing_export.gba"))).toBe(true);
  });

  it.runIf(existsSync(localAssetcPath) && existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))("exports a battle RPG room through assetc into a buildable native ROM", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-battle-rpg-export-real-"));
    temporaryRoots.push(root);
    const projectRoot = path.join(root, "Game");
    const projectPath = path.join(projectRoot, "battle-demo.gba-project");
    const destination = path.join(root, "exported-battle-rpg");
    const project = exportableProject({
      name: "Battle RPG Export",
      scenas: [{
        id: "room-battle", name: "arena", width: 16, height: 16, sceneType: "battleRpg",
        runtime: { type: "battleRpg", config: { maxPartySize: 3, maxEnemies: 4, turnDelayFrames: 12, activeTimeBattle: false, escapeEnabled: true } }
      }],
      settings: {
        general: { gameTitle: "Battle RPG Export", startScene: "arena", startSceneType: "battleRpg" },
        build: { romFileName: "battle_rpg_export.gba" }
      }
    });
    await mkdir(projectRoot, { recursive: true });
    await writeFile(projectPath, JSON.stringify(project, null, 2), "utf8");
    const prepared = prepareEngineProjectExport(project, { enginePackPath: localEnginePackPath, enginePackVersion: "2.24.0" });
    expect(prepared.error).toBeUndefined();
    await writeEngineSchemaExport({ destination, assetcPath: localAssetcPath, prepared: prepared.generated!, projectPath });
    await expect(readFile(path.join(destination, "battle_rpg_project_data.hpp"), "utf8")).resolves.toContain("gbs::BattleRpgProjectData project");
    const build = await runGbsbuild({ enginePackPath: localEnginePackPath, gbsbuildPath: localGbsbuildPath, projectDir: destination });
    expect(build.exitCode, build.stderr ?? build.error).toBe(0);
    expect(existsSync(path.join(destination, "build", "battle_rpg_export.gba"))).toBe(true);
  });

  it.runIf(existsSync(localAssetcPath) && existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))("exports a point-and-click room profile into a buildable native ROM", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-point-click-export-real-"));
    temporaryRoots.push(root);
    const projectRoot = path.join(root, "Game");
    const projectPath = path.join(projectRoot, "point-click-demo.gba-project");
    const destination = path.join(root, "exported-point-click");
    const project = exportableProject({
      name: "Point Click Export",
      scenas: [{
        id: "room-office",
        name: "office",
        width: 20,
        height: 18,
        sceneType: "pointAndClick",
        runtime: { type: "pointAndClick", config: { cursorSpeed: 4, hotspotPadding: 3 } }
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "office", x: 7, y: 5 }],
      triggers: [{
        id: "trigger-door",
        name: "Door",
        roomName: "office",
        x: 10,
        y: 4,
        width: 2,
        height: 3,
        eventBindings: { onInteract: "door_use" }
      }],
      events: [{ id: "event-door", name: "door_use", category: "Cena", steps: [{ command: "show_dialogue intro" }] }],
      dialogues: [{ key: "intro", text: "Point click native export." }],
      settings: {
        general: { gameTitle: "Point Click Export", startScene: "office", startSceneType: "pointAndClick" },
        pointAndClick: { cursorSpeed: 2 },
        build: { romFileName: "point_click_export.gba" }
      }
    });
    await mkdir(projectRoot, { recursive: true });
    await writeFile(projectPath, JSON.stringify(project, null, 2), "utf8");

    const prepared = prepareEngineProjectExport(project, {
      enginePackPath: localEnginePackPath,
      enginePackVersion: "2.24.0"
    });
    expect(prepared.error).toBeUndefined();
    await writeEngineSchemaExport({
      destination,
      assetcPath: localAssetcPath,
      prepared: prepared.generated!,
      projectPath
    });

    const contract = await readFile(path.join(destination, "export_project.json"), "utf8");
    const header = await readFile(path.join(destination, "point_click_project_data.hpp"), "utf8");
    expect(contract).toContain('"on_click"');
    expect(contract).toContain('"cursor_speed": 4');
    expect(header).toContain('gbs::PointClickSceneData { "office"');
    expect(header).toContain('"scene_office", 4, nullptr, 0, nullptr, 0 }');

    const build = await runGbsbuild({
      enginePackPath: localEnginePackPath,
      gbsbuildPath: localGbsbuildPath,
      projectDir: destination
    });
    expect(build.exitCode).toBe(0);
    expect(existsSync(path.join(destination, "build", "point_click_export.gba"))).toBe(true);
  });

  it.runIf(existsSync(localAssetcPath) && existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))("exports a shmup wave profile into a buildable native ROM", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-shmup-export-real-"));
    temporaryRoots.push(root);
    const projectRoot = path.join(root, "Game");
    const projectPath = path.join(projectRoot, "shmup-demo.gba-project");
    const destination = path.join(root, "exported-shmup");
    const project = exportableProject({
      name: "Shmup Export",
      scenas: [{
        id: "room-wave",
        name: "wave_1",
        width: 30,
        height: 20,
        sceneType: "shmup",
        runtime: { type: "shmup", config: { playerSpeed: 4, fireCooldown: 6, scrollSpeed: 3 } }
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "wave_1", x: 7, y: 12 }],
      settings: {
        general: { gameTitle: "Shmup Export", startScene: "wave_1", startSceneType: "shmup" },
        shmup: { playerSpeed: 2, fireRate: 8, scrollSpeed: 1 },
        build: { romFileName: "shmup_export.gba" }
      }
    });
    await mkdir(projectRoot, { recursive: true });
    await writeFile(projectPath, JSON.stringify(project, null, 2), "utf8");

    const prepared = prepareEngineProjectExport(project, {
      enginePackPath: localEnginePackPath,
      enginePackVersion: "2.24.0"
    });
    expect(prepared.error).toBeUndefined();
    await writeEngineSchemaExport({
      destination,
      assetcPath: localAssetcPath,
      prepared: prepared.generated!,
      projectPath
    });

    const contract = await readFile(path.join(destination, "export_project.json"), "utf8");
    const header = await readFile(path.join(destination, "shmup_project_data.hpp"), "utf8");
    expect(contract).toContain('"player_speed": 4');
    expect(contract).toContain('"fire_cooldown": 6');
    expect(header).toContain("static_cast<uint8_t>(4), static_cast<uint8_t>(6)");

    const build = await runGbsbuild({
      enginePackPath: localEnginePackPath,
      gbsbuildPath: localGbsbuildPath,
      projectDir: destination
    });
    expect(build.exitCode, build.stderr ?? build.error).toBe(0);
    expect(existsSync(path.join(destination, "build", "shmup_export.gba"))).toBe(true);
  });

  it.runIf(existsSync(localAssetcPath) && existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))(
    "exports representative native templates into buildable ROMs",
    async () => {
      const root = templateP0EvidenceDir
        ? path.resolve(templateP0EvidenceDir)
        : await mkdtemp(path.join(os.tmpdir(), "gbastudio-template-p0-roms-"));
      if (templateP0EvidenceDir) {
        await rm(root, { recursive: true, force: true });
        await mkdir(root, { recursive: true });
      } else {
        temporaryRoots.push(root);
      }

      const battleRpgProject = buildFunctionalBattleRpgProject();
      const battleRpgSettings = battleRpgProject.settings as Record<string, Record<string, unknown>>;
      battleRpgSettings.build = {
        ...battleRpgSettings.build,
        gameCode: "BRP1",
        makerCode: "GS",
        romVersion: 7
      };

      const cases = [
        {
          id: "platformer",
          project: buildFunctionalPlatformerProject(),
          rom: "platformer_demo.gba",
          header: "platformer_project_data.hpp",
          expectedHeaderSymbols: ["player_platformer_metasprites", "platformer_player_idle_animation"]
        },
        {
          id: "isometric",
          project: buildFunctionalIsometricProject(),
          rom: "isometric_demo.gba",
          header: "isometric_project_data.hpp",
          expectedHeaderSymbols: [
            "actor_isometric_metasprites[0].parts[0].tile_index",
            "static_cast<uint8_t>(32)",
            "market_actor_0_animation_set",
            "market_actor_1_animation_set",
            "market_actor_animations",
            "garden_actor_animations"
          ]
        },
        {
          id: "shmup",
          project: buildFunctionalShmupProject(),
          rom: "shmup_demo.gba",
          header: "shmup_project_data.hpp",
          expectedHeaderSymbols: [
            "&player_shmup_metasprites[0]",
            "&projectile_shmup_metasprites[0]",
            "&enemy_shmup_metasprites[0]"
          ]
        },
        {
          id: "cutscene",
          project: buildFunctionalCutsceneProject(),
          rom: "cutscene_demo.gba",
          header: "cutscene_project_data.hpp",
          expectedHeaderSymbols: [
            "cutscene_scene_0_steps",
            "static_cast<uint16_t>(90)",
            "static_cast<uint16_t>(120)"
          ]
        },
        {
          id: "visual-novel",
          project: buildFunctionalVisualNovelProject(),
          rom: "visual_novel_demo.gba",
          header: "visual_novel_project_data.hpp",
          expectedHeaderSymbols: [
            "constexpr gbs::VisualNovelSceneData scenes[]",
            "constexpr gbs::VisualNovelChoiceGroupData visual_novel_choice_groups[]"
          ]
        },
        {
          id: "world-map",
          project: buildFunctionalWorldMapProject(),
          rom: "world_map_demo.gba",
          header: "world_map_project_data.hpp",
          expectedHeaderSymbols: [
            "constexpr gbs::WorldMapNodeData nodes[]",
            "\"castle\", gbs::Vec2i { 160, 48 }, 2"
          ]
        },
        {
          id: "battle-rpg",
          project: battleRpgProject,
          rom: "battle_rpg_demo.gba",
          header: "battle_rpg_project_data.hpp",
          expectedHeaderSymbols: [
            "constexpr gbs::BattleRpgEncounterData encounters[]",
            "Hero",
            "Slime"
          ]
        }
      ] as const;

      for (const entry of cases) {
        const caseRoot = path.join(root, entry.id);
        const projectRoot = path.join(caseRoot, "Game");
        const destination = path.join(caseRoot, "export");
        const projectPath = await materializeFunctionalP0ProjectTree(
          projectRoot,
          entry.project,
          `${entry.id}.gba-project`
        );
        const prepared = prepareEngineProjectExport(entry.project, {
          enginePackPath: localEnginePackPath,
          enginePackVersion: "2.24.0"
        });
        expect(prepared.error).toBeUndefined();
        await writeEngineSchemaExport({
          destination,
          assetcPath: localAssetcPath,
          prepared: prepared.generated!,
          projectPath
        });

        const header = await readFile(path.join(destination, entry.header), "utf8");
        for (const symbol of entry.expectedHeaderSymbols) expect(header).toContain(symbol);
        const build = await runGbsbuild({
          enginePackPath: localEnginePackPath,
          gbsbuildPath: localGbsbuildPath,
          projectDir: destination
        });
        expect(build.exitCode, build.stderr ?? build.error).toBe(0);
        const romPath = path.join(destination, "build", entry.rom);
        expect(existsSync(romPath)).toBe(true);
        if (entry.id === "battle-rpg") {
          const rom = await readFile(romPath);
          expect(rom.subarray(0xa0, 0xac).toString("ascii")).toBe("BATTLE RPG D");
          expect(rom.subarray(0xac, 0xb0).toString("ascii")).toBe("BRP1");
          expect(rom.subarray(0xb0, 0xb2).toString("ascii")).toBe("GS");
          expect(rom[0xbc]).toBe(7);
          const headerSum = rom.subarray(0xa0, 0xbd).reduce((sum, byte) => sum + byte, 0);
          expect(rom[0xbd]).toBe((-0x19 - headerSum) & 0xff);
          expect(rom.includes(Buffer.from("SRAM_V113\0", "ascii"))).toBe(true);
        }
      }
    },
    60_000
  );

  it.runIf(existsSync(localAssetcPath) && existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))("exports topdown, platformer and isometric rooms into one buildable mixed runtime ROM", async () => {
    const root = mixedRuntimeEvidenceDir
      ? path.resolve(mixedRuntimeEvidenceDir)
      : await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-mixed-runtime-real-"));
    if (mixedRuntimeEvidenceDir) {
      await rm(root, { recursive: true, force: true });
      await mkdir(root, { recursive: true });
    } else {
      temporaryRoots.push(root);
    }
    const projectRoot = path.join(root, "Game");
    const projectPath = path.join(projectRoot, "mixed-demo.gba-project");
    const destination = path.join(root, "exported-mixed");
    const project = exportableProject({
      name: "Mixed Runtime Export",
      scenas: [
        {
          id: "room-town",
          name: "town",
          width: 20,
          height: 18,
          sceneType: "topdown",
          eventBindings: { onInit: "enter_stage" }
        },
        {
          id: "room-stage",
          name: "stage",
          width: 20,
          height: 18,
          sceneType: "platformer",
          collisionTypes: Array.from({ length: 20 * 18 }, (_item, index) => index >= 20 * 16 ? "solid" : "free")
        },
        {
          id: "room-cave",
          name: "cave",
          width: 20,
          height: 18,
          sceneType: "isometric"
        }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "town", x: 2, y: 3 }],
      events: [{
        id: "event-enter-stage",
        name: "enter_stage",
        category: "Cena",
        steps: [{ command: "change_scene stage 4 8" }]
      }],
      editorState: {
        scenaConnections: [
          {
            from: "stage",
            to: "cave",
            exit: { x: 18, y: 8, width: 2, height: 2 },
            entry: { x: 1, y: 8, width: 2, height: 2 }
          },
          {
            from: "cave",
            to: "town",
            exit: { x: 18, y: 8, width: 2, height: 2 },
            entry: { x: 1, y: 8, width: 2, height: 2 }
          }
        ]
      },
      settings: {
        general: { gameTitle: "Mixed Runtime Export", startScene: "town", startSceneType: "topdown" },
        build: { romFileName: "mixed_runtime_export.gba" }
      }
    });
    await mkdir(projectRoot, { recursive: true });
    await writeFile(projectPath, JSON.stringify(project, null, 2), "utf8");

    const prepared = prepareEngineProjectExport(project, {
      enginePackPath: localEnginePackPath,
      enginePackVersion: "2.24.0"
    });
    expect(prepared.error).toBeUndefined();
    expect(prepared.generated?.contract).toMatchObject({
      kind: "mixed",
      runtime_dispatch: {
        initial_runtime: "topdown",
        runtimes: ["topdown", "platformer", "isometric"]
      },
      build: {
        sources: ["main.cpp", "topdown_runtime.cpp", "platformer_runtime.cpp", "isometric_runtime.cpp"]
      }
    });
    prepared.generated!.contract.platformer_project!.backdrop_color = 31;
    await writeEngineSchemaExport({
      destination,
      assetcPath: localAssetcPath,
      prepared: prepared.generated!,
      projectPath
    });

    const generatedTopdown = await readFile(path.join(destination, "topdown_project_data.hpp"), "utf8");
    const generatedPlatformer = await readFile(path.join(destination, "platformer_project_data.hpp"), "utf8");
    const generatedIsometric = await readFile(path.join(destination, "isometric_project_data.hpp"), "utf8");
    const generatedPlatformerRuntime = await readFile(path.join(destination, "platformer_runtime.inc"), "utf8");
    expect(generatedTopdown).toContain("gbs::EventOp::WarpRuntime");
    expect(generatedPlatformer).toContain("gbs::EventOp::WarpRuntime");
    expect(generatedIsometric).toContain("gbs::EventOp::WarpRuntime");
    expect(generatedPlatformerRuntime).toContain("gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, bg2_tiles != nullptr);");
    expect(generatedPlatformerRuntime).toContain("gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, room.bg3_tiles != nullptr);");
    for (const runtimeSource of ["topdown_runtime.cpp", "platformer_runtime.cpp", "isometric_runtime.cpp"]) {
      expect(existsSync(path.join(destination, runtimeSource))).toBe(true);
    }

    const schemaValidation = await execFileAsync(localGbsdoctorPath, [
      "--engine-pack",
      localEnginePackPath,
      "--validate-public-schema",
      "auto",
      "--schema-document",
      path.join(destination, "gbastudio_project.json"),
      "--json"
    ], { maxBuffer: 8 * 1024 * 1024 });
    expect(JSON.parse(schemaValidation.stdout) as { ok?: boolean }).toMatchObject({ ok: true });

    const { stdout } = await execFileAsync(localGbsdoctorPath, [
      "--engine-pack",
      localEnginePackPath,
      "--project-dir",
      destination,
      "--json",
      "--skip-toolchain"
    ], { maxBuffer: 8 * 1024 * 1024 });
    expect(JSON.parse(stdout) as { ok?: boolean }).toMatchObject({ ok: true });

    const build = await runGbsbuild({
      enginePackPath: localEnginePackPath,
      gbsbuildPath: localGbsbuildPath,
      projectDir: destination
    });
    expect(build.exitCode).toBe(0);
    expect(existsSync(path.join(destination, "build", "mixed_runtime_export.gba"))).toBe(true);
  }, 20_000);

  it.runIf(existsSync(localAssetcPath) && existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))("materializes the bundled isometric tilemap and builds a native ROM", async () => {
    const root = isometricAnimationEvidenceDir
      ? path.resolve(isometricAnimationEvidenceDir)
      : await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-isometric-default-"));
    if (isometricAnimationEvidenceDir) {
      await rm(root, { recursive: true, force: true });
      await mkdir(root, { recursive: true });
    } else {
      temporaryRoots.push(root);
    }
    const projectRoot = path.join(root, "Game");
    const projectPath = path.join(projectRoot, "isometric-default.gba-project");
    const destination = path.join(root, "exported-isometric-default");
    const project = buildFunctionalIsometricProject();

    await saveProjectFileAtomically(projectPath, parseGBAProjectFile(JSON.stringify(project)), {
      appPath: process.cwd()
    });
    const materializedTileset = path.join(projectRoot, "Assets", "tiles", "isometric-sandbox-sheet.png");
    expect(existsSync(materializedTileset)).toBe(true);
    expect((await readFile(materializedTileset)).equals(
      await readFile(path.join(
        process.cwd(),
        "default-assets",
        "templates",
        "exemplo-gba",
        "Assets",
        "backgrounds",
        "tactical-v5-surface.png"
      ))
    )).toBe(true);

    const prepared = prepareEngineProjectExport(project, {
      enginePackPath: localEnginePackPath,
      enginePackVersion: "2.24.0"
    });
    expect(prepared.error).toBeUndefined();
    await writeEngineSchemaExport({
      destination,
      assetcPath: localAssetcPath,
      prepared: prepared.generated!,
      projectPath
    });
    const generatedMain = await readFile(path.join(destination, "main.cpp"), "utf8");
    expect(generatedMain).toContain("constexpr size_t iso_surface_layer_tile_count = 40 * 12;");
    expect(generatedMain).toContain("gbs::collect_iso_surface_dirty_tile_runs(");
    expect(generatedMain).toContain("upload_iso_surface_tile_run(dirty_runs[index]);");
    expect(generatedMain).toContain("iso_surface_tiles + run.first_tile * 32");
    expect(generatedMain).toContain("1 + layer_offset");
    expect(generatedMain).toContain("first_layer ? 0 : iso_surface_second_tile_base / 512");
    expect(generatedMain).toContain("gbs::set_bg_character_base(gbs::BackgroundLayer::BG1, 0);");
    expect(generatedMain).toContain("gbs::set_bg_character_base(gbs::BackgroundLayer::BG2, 2);");
    expect(generatedMain).toContain("gbs::set_bg_character_base(gbs::BackgroundLayer::BG3, 1);");
    // The two surface layers each hold 12 tile rows: BG2 begins after 96 pixels.
    expect(generatedMain).toContain("gbs::TileMapAsset { iso_surface_map, 40, 12 }");
    expect(generatedMain).toContain("gbs::set_bg_scroll(gbs::BackgroundLayer::BG2, surface_scroll_x, -96 + surface_scroll_y);");
    expect(generatedMain).toContain("gbs::IsoActorAnimationState actor_animation_states[max_actor_count]");
    expect(generatedMain).toContain("gbs::set_iso_actor_motion(actor_animation_states[0], input_delta");
    expect(generatedMain).toContain("gbs::apply_iso_actor_animation(");

    const { stdout } = await execFileAsync(localGbsdoctorPath, [
      "--engine-pack",
      localEnginePackPath,
      "--project-dir",
      destination,
      "--json",
      "--skip-toolchain"
    ], { maxBuffer: 8 * 1024 * 1024 });
    expect(JSON.parse(stdout) as { ok?: boolean }).toMatchObject({ ok: true });

    const build = await runGbsbuild({
      enginePackPath: localEnginePackPath,
      gbsbuildPath: localGbsbuildPath,
      projectDir: destination
    });
    expect(build.exitCode, build.stderr ?? build.error).toBe(0);
    expect(existsSync(path.join(destination, "build", "isometric_demo.gba"))).toBe(true);
  }, 20_000);

  it.runIf(existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))("exports the real migration fixture into a buildable runtime overlay ROM", async () => {
    const root = fixtureEvidenceDir
      ? path.resolve(fixtureEvidenceDir)
      : await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-export-fixture-"));
    if (fixtureEvidenceDir) {
      await rm(root, { recursive: true, force: true });
      await mkdir(root, { recursive: true });
    } else {
      temporaryRoots.push(root);
    }
    const projectRoot = path.join(root, "Game");
    const projectPath = path.join(projectRoot, "topdown-demo.gba-project");
    const destination = path.join(root, "exported-fixture");
    const fixture = await readFile(path.join(process.cwd(), "../../packages/project-contract/fixtures/topdown-demo.gba-project"), "utf8");
    const project = parseGBAProjectFile(fixture);
    await mkdir(projectRoot, { recursive: true });
    await writeFile(projectPath, fixture, "utf8");
    await mkdir(path.join(projectRoot, "Assets", "tiles"), { recursive: true });
    await mkdir(path.join(projectRoot, "Assets", "sprites"), { recursive: true });
    await mkdir(path.join(projectRoot, "Assets", "music"), { recursive: true });
    await mkdir(path.join(projectRoot, "Assets", "sounds"), { recursive: true });
    await writeFile(path.join(projectRoot, "Assets", "tiles", "tiles_overworld.png"), "tiles", "utf8");
    await writeFile(path.join(projectRoot, "Assets", "sprites", "player_topdown_4dir.png"), "sprite", "utf8");
    await writeFile(path.join(projectRoot, "Assets", "sprites", "actor_point_click.png"), "actor", "utf8");
    await writeFile(path.join(projectRoot, "Assets", "sprites", "cursor_point_click.png"), "cursor", "utf8");
    await writeFile(path.join(projectRoot, "Assets", "music", "intro_theme.mod"), "music", "utf8");
    await writeFile(path.join(projectRoot, "Assets", "sounds", "confirm.wav"), "sfx", "utf8");

    const generated = generateEngineProjectExport(project.data);
    expect(generated.files.find((file) => file.path === "main.cpp")?.contents).toContain("gbs::draw_debug_overlay(true);");
    await writeEngineProjectExport({ destination, generated, projectPath });

    const { stdout } = await execFileAsync(localGbsdoctorPath, [
      "--engine-pack",
      localEnginePackPath,
      "--project-dir",
      destination,
      "--json",
      "--skip-toolchain"
    ], { maxBuffer: 8 * 1024 * 1024 });
    const report = JSON.parse(stdout) as { checks?: Array<{ key?: string; ok?: boolean; value?: unknown }> };
    expect(report.checks).toContainEqual(expect.objectContaining({
      key: "project_generated_asset",
      ok: true,
      value: "assets/image/tiles_overworld.png"
    }));

    const buildDryRun = await runGbsbuildDryRun({
      enginePackPath: localEnginePackPath,
      gbsbuildPath: localGbsbuildPath,
      projectDir: destination
    });
    expect(buildDryRun.exitCode).toBe(0);
    expect(buildDryRun.summary?.command).toContain("TARGET=electron_topdown_demo");

    const build = await runGbsbuild({
      enginePackPath: localEnginePackPath,
      gbsbuildPath: localGbsbuildPath,
      projectDir: destination
    });
    expect(build.exitCode).toBe(0);
    expect(existsSync(path.join(destination, "build", "electron_topdown_demo.gba"))).toBe(true);
  });

  it.runIf(existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))("exports the Electron technical P0 fixture into a buildable ROM", async () => {
    const root = p0EvidenceDir
      ? path.resolve(p0EvidenceDir)
      : await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-export-p0-"));
    if (p0EvidenceDir) {
      await rm(root, { recursive: true, force: true });
      await mkdir(root, { recursive: true });
    } else {
      temporaryRoots.push(root);
    }
    const projectRoot = path.join(root, "Game");
    const destination = path.join(root, "exported-p0");
    const project = buildFunctionalP0Project();
    const projectPath = await materializeFunctionalP0ProjectTree(projectRoot, project);

    const generated = generateEngineProjectExport(project);
    expect(generated.target).toBe("electron_p0_functional");
    await writeEngineProjectExport({ destination, generated, projectPath });

    const { stdout } = await execFileAsync(localGbsdoctorPath, [
      "--engine-pack",
      localEnginePackPath,
      "--project-dir",
      destination,
      "--json",
      "--skip-toolchain"
    ], { maxBuffer: 8 * 1024 * 1024 });
    const report = JSON.parse(stdout) as { checks?: Array<{ key?: string; ok?: boolean; value?: unknown }> };
    expect(report.checks).toContainEqual(expect.objectContaining({
      key: "project_generated_asset",
      ok: true,
      value: "assets/image/tiles_topdown_sandbox.png"
    }));
    expect(report.checks).toContainEqual(expect.objectContaining({
      key: "project_generated_asset",
      ok: true,
      value: "assets/sprite/player_topdown_4dir.png"
    }));
    expect(report.checks).toContainEqual(expect.objectContaining({
      key: "project_generated_asset",
      ok: true,
      value: "assets/audio/intro_theme.mod"
    }));

    const buildDryRun = await runGbsbuildDryRun({
      enginePackPath: localEnginePackPath,
      gbsbuildPath: localGbsbuildPath,
      projectDir: destination
    });
    expect(buildDryRun.exitCode).toBe(0);
    expect(buildDryRun.summary?.command).toContain("TARGET=electron_p0_functional");

    const build = await runGbsbuild({
      enginePackPath: localEnginePackPath,
      gbsbuildPath: localGbsbuildPath,
      projectDir: destination
    });
    expect(build.exitCode).toBe(0);
    expect(existsSync(path.join(destination, "build", "electron_p0_functional.gba"))).toBe(true);
  });

  it.runIf(existsSync(localAssetcPath) && existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))("exports the Electron technical P0 fixture through assetc into a buildable native topdown ROM", async () => {
    const root = p0EvidenceDir
      ? path.resolve(p0EvidenceDir)
      : await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-export-p0-native-"));
    if (p0EvidenceDir) {
      await rm(root, { recursive: true, force: true });
      await mkdir(root, { recursive: true });
    } else {
      temporaryRoots.push(root);
    }
    const projectRoot = path.join(root, "Game");
    const destination = path.join(root, "exported-p0");
    const project = buildFunctionalP0NativeExportProject();
    const projectPath = await materializeFunctionalP0ProjectTree(projectRoot, project);

    const prepared = prepareEngineProjectExport(project, {
      enginePackPath: localEnginePackPath,
      enginePackVersion: "2.24.0"
    });
    expect(prepared.error).toBeUndefined();
    expect(prepared.generated).toBeDefined();
    await writeEngineSchemaExport({
      destination,
      assetcPath: localAssetcPath,
      prepared: prepared.generated!,
      projectPath
    });

    await assertNativeVisualExportArtifacts(destination, "electron_p0_functional");
  }, 20_000);

  it.runIf(existsSync(localAssetcPath) && existsSync(localGbsdoctorPath) && existsSync(localGbsbuildPath))("exports the runtime canary through assetc into a buildable native ROM", async () => {
    const root = runtimeCanaryEvidenceDir
      ? path.resolve(runtimeCanaryEvidenceDir)
      : await mkdtemp(path.join(os.tmpdir(), "gbastudio-runtime-canary-native-"));
    if (runtimeCanaryEvidenceDir) {
      await rm(root, { recursive: true, force: true });
      await mkdir(root, { recursive: true });
    } else {
      temporaryRoots.push(root);
    }
    const projectRoot = path.join(root, "Game");
    const destination = path.join(root, "exported-canary");
    const project = withComposedConfirmSfx(buildFunctionalRuntimeCanaryProject());
    const projectPath = await materializeFunctionalP0ProjectTree(projectRoot, project, "runtime-canary.gbastudio");

    const prepared = prepareEngineProjectExport(project, {
      enginePackPath: localEnginePackPath,
      enginePackVersion: "2.24.0"
    });
    expect(prepared.error).toBeUndefined();
    expect(prepared.generated).toBeDefined();
    await writeEngineSchemaExport({
      destination,
      assetcPath: localAssetcPath,
      prepared: prepared.generated!,
      projectPath
    });

    await assertNativeVisualExportArtifacts(destination, "runtime_canary");
  }, 20_000);

  it("rejects generated file paths that try to leave the destination", async () => {
    const destination = await mkdtemp(path.join(os.tmpdir(), "gbastudio-electron-export-"));
    temporaryRoots.push(destination);

    await expect(
      writeEngineProjectExport({
        destination,
        generated: {
          target: "bad",
          assets: [],
          files: [{ path: "../bad.cpp", contents: "" }]
        }
      })
    ).rejects.toThrow("fora do destino");
  });
});
