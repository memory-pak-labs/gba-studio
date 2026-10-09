import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runGbsbuild, runGbsbuildDryRun } from "./enginePack.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { writeAuthorStressFixtureAssets } from "./authorStressFixtureAssets.js";
import { copyCurrentTechnicalAsset, currentTechnicalAssetSourcePath } from "./currentTechnicalAssets.js";
import { buildAuthorStressProject } from "../shared/authorStressProject.js";

const temporaryRoots: string[] = [];
const appRoot = process.cwd();
const enginePackPath = path.join(appRoot, "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
const assetcPath = path.join(enginePackPath, "tools", process.platform === "win32" ? "assetc.exe" : "assetc");
const gbsbuildPath = path.join(enginePackPath, "tools", process.platform === "win32" ? "gbsbuild.exe" : "gbsbuild");
const gbsdoctorPath = path.join(enginePackPath, "tools", process.platform === "win32" ? "gbsdoctor.exe" : "gbsdoctor");
const fixtureAssets = [
  "tiles/tiles_topdown_sandbox.png",
  "tiles/tiles_overworld.png",
  "sprites/player_topdown_4dir.png",
  "sprites/player_platformer.png",
  "sprites/player_shmup.png",
  "sprites/actor_isometric.png",
  "sprites/actor_point_click.png",
  "sprites/cursor_point_click.png",
  "portraits/portrait.png",
  "ui/dialogue_box.png",
  "ui/dialogue_selector.png",
  "fonts/gba-dialogue-font-v3.png",
  "fonts/gba-variable-font.png",
  "audio/intro_theme.mod",
  "audio/confirm.wav"
] as const;

async function materializeProject(projectRoot: string): Promise<string> {
  const projectPath = path.join(projectRoot, "observatorio_de_bruma_stress.gba-project");
  await mkdir(projectRoot, { recursive: true });
  await writeFile(projectPath, JSON.stringify({ schemaVersion: 1, data: buildAuthorStressProject() }, null, 2), "utf8");
  await Promise.all(fixtureAssets.map(async (relativePath) => {
    const destination = path.join(projectRoot, "Assets", relativePath);
    await copyCurrentTechnicalAsset({ appRoot, relativePath, destinationPath: destination });
  }));
  await writeAuthorStressFixtureAssets(projectRoot);
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ROM do projeto autoral de stress", () => {
  it.runIf(existsSync(assetcPath) && existsSync(gbsbuildPath) && existsSync(gbsdoctorPath))(
    "exporta seis rooms grandes e compila uma ROM com orcamento auditavel",
    async () => {
      const evidenceRoot = process.env.GBA_STUDIO_AUTHOR_STRESS_EVIDENCE_DIR;
      const root = evidenceRoot ? path.resolve(evidenceRoot) : await mkdtemp(path.join(os.tmpdir(), "gbastudio-author-stress-"));
      if (evidenceRoot) {
        await rm(root, { recursive: true, force: true });
        await mkdir(root, { recursive: true });
      } else {
        temporaryRoots.push(root);
      }

      const projectPath = await materializeProject(path.join(root, "project"));
      const destination = path.join(root, "exported-author-stress");
      const stagedTileset = await readFile(path.join(root, "project", "Assets", "tiles", "tiles_topdown_sandbox.png"));
      const canonicalTileset = currentTechnicalAssetSourcePath(appRoot, "tiles/tiles_topdown_sandbox.png");
      if (!canonicalTileset) throw new Error("Fonte canônica ausente para tiles/tiles_topdown_sandbox.png");
      const fixtureTileset = await readFile(canonicalTileset);
      const stagedPlayer = await readFile(path.join(root, "project", "Assets", "sprites", "player_topdown_4dir.png"));
      const canonicalPlayer = currentTechnicalAssetSourcePath(appRoot, "sprites/player_topdown_4dir.png");
      if (!canonicalPlayer) throw new Error("Fonte canônica ausente para sprites/player_topdown_4dir.png");
      const fixturePlayer = await readFile(canonicalPlayer);
      expect(createHash("sha256").update(stagedTileset).digest("hex"))
        .not.toBe(createHash("sha256").update(fixtureTileset).digest("hex"));
      expect(createHash("sha256").update(stagedPlayer).digest("hex"))
        .not.toBe(createHash("sha256").update(fixturePlayer).digest("hex"));
      const prepared = prepareEngineProjectExport(buildAuthorStressProject(), {
        enginePackPath,
        enginePackVersion: "2.24.0"
      });
      expect(prepared.error).toBeUndefined();
      expect(prepared.generated?.target).toBe("observatorio_de_bruma_stress");

      await writeEngineSchemaExport({
        destination,
        assetcPath,
        prepared: prepared.generated!,
        projectPath
      });

      const manifest = JSON.parse(await readFile(path.join(destination, "export_project.json"), "utf8")) as {
        topdown_project?: {
          rooms?: Array<{ metadata?: { camera_mode?: string } }>;
          camera?: { follow_player?: boolean };
        };
      };
      const assetReport = JSON.parse(await readFile(path.join(destination, "asset_pack_report.json"), "utf8")) as {
        budget_summary?: Record<string, { used?: number }>;
        diagnostics?: unknown[];
      };
      expect(manifest.topdown_project?.rooms).toHaveLength(6);
      expect(manifest.topdown_project?.rooms?.every((room) => room.metadata?.camera_mode === "follow")).toBe(true);
      expect(manifest.topdown_project?.camera?.follow_player).toBe(true);
      expect(assetReport.budget_summary).toBeTruthy();
      expect(assetReport.budget_summary?.bg_tiles?.used).toBeGreaterThanOrEqual(500);
      expect(assetReport.budget_summary?.bg_tiles).toMatchObject({
        capacity: 896,
        used: 721,
        remaining: 175
      });
      const header = await readFile(path.join(destination, "gbastudio_project_data.hpp"), "utf8");
      expect(header).toMatch(/observatorio_01_npcs,\s*96/);
      expect(header).toMatch(/observatorio_06_npcs,\s*96/);

      const dryRun = await runGbsbuildDryRun({ enginePackPath, gbsbuildPath, projectDir: destination });
      expect(dryRun.exitCode).toBe(0);
      const build = await runGbsbuild({ enginePackPath, gbsbuildPath, projectDir: destination });
      const romPath = path.join(destination, "build", "observatorio_de_bruma_stress.gba");
      expect(build.exitCode).toBe(0);
      expect(existsSync(romPath)).toBe(true);

      if (evidenceRoot) {
        await writeFile(path.join(root, "author_stress_export_evidence.json"), `${JSON.stringify({
          ok: true,
          projectPath,
          destination,
          romPath,
          roomCount: manifest.topdown_project?.rooms?.length ?? 0,
          budgetSummary: assetReport.budget_summary ?? {},
          diagnosticCount: assetReport.diagnostics?.length ?? 0,
          dryRunExitCode: dryRun.exitCode,
          buildExitCode: build.exitCode
        }, null, 2)}\n`, "utf8");
      }
    },
    120_000
  );
});
