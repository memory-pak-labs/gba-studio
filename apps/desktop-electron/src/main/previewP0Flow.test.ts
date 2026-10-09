import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import p0SourceCatalog from "../../scripts/p0-source-catalog.json" with { type: "json" };
import { buildFunctionalP0Project } from "../shared/functionalP0Project.js";
import { parseGBAProjectFile } from "../shared/projectFile.js";
import { expandProjectTilemaps } from "../shared/projectResourceFormat.js";
import { inspectWebProjectRuntime, prepareWebProjectExport, writeWebProjectExport } from "./exportWebProject.js";

const temporaryRoots: string[] = [];

async function previewDestination(): Promise<string> {
  const evidencePath = process.env.GBA_STUDIO_PREVIEW_PLAYTEST_EVIDENCE;
  if (!evidencePath) {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-p0-preview-"));
    temporaryRoots.push(root);
    return root;
  }

  const root = path.join(dirname(evidencePath), "web-preview");
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  return root;
}

function writeEvidenceIfRequested(evidence: Record<string, unknown>): void {
  const outputPath = process.env.GBA_STUDIO_PREVIEW_PLAYTEST_EVIDENCE;
  if (!outputPath) return;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Electron technical P0 preview flow", () => {
  it("generates a Web preview package for the technical P0 fixture", async () => {
    const destination = await previewDestination();
    const projectPath = process.env.GBA_STUDIO_P0_PROJECT_PATH?.trim();
    const sourceId = process.env.GBA_STUDIO_P0_SOURCE_ID?.trim() || p0SourceCatalog.technicalFixture.id;
    const source = sourceId === p0SourceCatalog.technicalFixture.id
      ? p0SourceCatalog.technicalFixture
      : null;
    if (!source) {
      throw new Error(`O preview reduzido recebeu uma fonte que nao e a fixture tecnica: ${sourceId}`);
    }
    const project = projectPath && existsSync(projectPath)
      ? expandProjectTilemaps(parseGBAProjectFile(await readFile(projectPath, "utf8")).data)
      : buildFunctionalP0Project();
    const prepared = prepareWebProjectExport(project);

    expect(prepared.error).toBeUndefined();
    expect(prepared.generated?.target).toBe("electron_p0_functional");

    const romSourcePath = process.env.GBA_STUDIO_PREVIEW_ROM_SOURCE ?? path.join(destination, "source.gba");
    if (!process.env.GBA_STUDIO_PREVIEW_ROM_SOURCE) {
      writeFileSync(romSourcePath, "fake gba rom for package structure tests", "utf8");
    }

    const result = await writeWebProjectExport({
      destination,
      generated: prepared.generated!,
      romSourcePath
    });

    const manifestPath = path.join(destination, "manifest.json");
    const indexPath = path.join(destination, "index.html");
    const engineProjectPath = path.join(destination, "engine-project", "gbastudio_project.json");
    const dataHeaderPath = path.join(destination, "engine-project", "gbastudio_project_data.hpp");
    const playerEntryPath = path.join(destination, "player", "gbastudio-player.js");
    const romPlaceholderPath = path.join(destination, "roms", "README.md");
    const romPath = path.join(destination, "roms", "electron_p0_functional.gba");
    const romCopied = existsSync(romPath);
    const runtime = inspectWebProjectRuntime(destination, {
      romFileName: "electron_p0_functional.gba"
    });

    expect(result.files).toContain(indexPath);
    expect(result.files).toContain(manifestPath);
    expect(result.files).toContain(engineProjectPath);
    expect(result.files).toContain(dataHeaderPath);
    expect(result.files).toContain(playerEntryPath);
    expect(result.files).toContain(romCopied ? romPath : romPlaceholderPath);
    expect(runtime.runtimeComplete).toBe(true);
    expect(runtime.missingRuntimeFiles).toEqual([]);
    expect(runtime.requiredRuntimeFiles).toContain("player/mgba-core.wasm");
    expect(runtime.requiredRuntimeFiles).toContain("player/mgba-direct-player.mjs");

    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    const html = await readFile(indexPath, "utf8");
    const engineProject = JSON.parse(await readFile(engineProjectPath, "utf8")) as Record<string, unknown>;
    const dataHeader = await readFile(dataHeaderPath, "utf8");

    expect(manifest).toMatchObject({
      kind: "gbastudio_web_export",
      target: "electron_p0_functional",
      romPath: "roms/electron_p0_functional.gba",
      playerPath: "player/gbastudio-player.js",
      engineProjectPath: "engine-project/gbastudio_project.json"
    });
    expect(html).toContain('window.GBAStudioPlayerConfig = {');
    expect(html).toContain('romUrl: "roms/electron_p0_functional.gba"');
    expect(html).toContain('<script src="player/gbastudio-player.js"></script>');
    expect(engineProject).toMatchObject({
      backend: "gbastudio_engine",
      build: { target: "electron_p0_functional" }
    });
    expect(dataHeader).toContain("room_count = 2");
    expect(dataHeader).toContain("event_count = 5");
    expect(dataHeader).toContain("dialogue_count = 2");

    writeEvidenceIfRequested({
      ok: true,
      generatedAt: new Date().toISOString(),
      previewPackageGenerated: true,
      previewPlaytestVerified: false,
      sourceProjectPath: projectPath ?? null,
      source: {
        id: source.id,
        role: source.role,
        acceptanceSurfaces: source.acceptanceSurfaces,
        excludedFromCanonicalAcceptance: source.excludedFromCanonicalAcceptance
      },
      sourceProjectName: project.name,
      target: result.target,
      destination,
      files: {
        manifest: manifestPath,
        index: indexPath,
        engineProject: engineProjectPath,
        dataHeader: dataHeaderPath,
        playerEntry: playerEntryPath,
        rom: romCopied ? romPath : undefined,
        romPlaceholder: romCopied ? undefined : romPlaceholderPath
      },
      romCopied,
      runtimeComplete: runtime.runtimeComplete,
      missingRuntimeFiles: runtime.missingRuntimeFiles,
      requiredRuntimeFiles: runtime.requiredRuntimeFiles,
      expectedRuntime: {
        core: "gba",
        romPath: "roms/electron_p0_functional.gba",
        playerPath: "player/gbastudio-player.js"
      }
    });
  });
});
