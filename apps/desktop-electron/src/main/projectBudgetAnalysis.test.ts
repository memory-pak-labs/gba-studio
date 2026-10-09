import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildFunctionalP0Project } from "../shared/functionalP0Project.js";
import { analyzePreparedProjectBudget } from "./projectBudgetAnalysis.js";
import { copyCurrentTechnicalAsset } from "./currentTechnicalAssets.js";

const temporaryRoots: string[] = [];
const enginePackPath = path.join(process.cwd(), "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
const assetcPath = path.join(enginePackPath, "tools", process.platform === "win32" ? "assetc.exe" : "assetc");

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project budget analysis", () => {
  it.runIf(existsSync(assetcPath))("runs assetc in a temporary export and returns scene resource banks without leaving build files beside the project", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gba-budget-analysis-test-"));
    temporaryRoots.push(root);
    const projectPath = path.join(root, "budget.gba-project");
    const project = buildFunctionalP0Project();
    await writeFile(projectPath, JSON.stringify({ schemaVersion: 1, data: project }), "utf8");

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
    ];
    for (const relativePath of fixtureAssets) {
      const destination = path.join(root, "Assets", relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyCurrentTechnicalAsset({
        appRoot: process.cwd(),
        relativePath,
        destinationPath: destination
      });
    }

    const result = await analyzePreparedProjectBudget({
      assetcPath,
      enginePackPath,
      enginePackVersion: "1.70.0",
      project,
      projectPath
    });

    expect(result.ok, result.error).toBe(true);
    expect(result.report?.schema).toBeGreaterThanOrEqual(11);
    expect(result.report?.budget_summary?.bg_tiles?.capacity).toBe(896);
    expect(result.report?.resource_bank_groups?.some((group) => group.name.startsWith("scene_"))).toBe(true);
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.target).toBeTruthy();
  }, 20_000);
});
