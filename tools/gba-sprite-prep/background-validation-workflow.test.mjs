import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { materializeBackgroundValidation } from "./background-validation-workflow.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("materializeBackgroundValidation", () => {
  it("descobre o BG otimizado e grava evidencias individuais do assetc", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gba-background-validation-test-"));
    temporaryRoots.push(root);
    await writeFile(path.join(root, "export_project.json"), JSON.stringify({
      asset_pack: {
        assets: [{
          id: "scene-port",
          kind: "bg",
          png: "assets/image/scene-port.png",
          symbol: "scene_port",
          optimize_background_tiles: true,
          background_tile_budget: 64,
          background_palette_banks: 4
        }]
      }
    }));
    await writeFile(path.join(root, "asset_pack_report.json"), JSON.stringify({
      schema: 11,
      kind: "GBAStudioAssetPackReport",
      ok: true,
      budget_summary: {
        bg_tiles: { used: 64, capacity: 896 },
        bg_palette_colors: { used: 64, capacity: 256 }
      },
      asset_reports: [{
        id: "scene-port",
        kind: "bg",
        resources: {
          bg_tiles: 64,
          bg_palette_colors: 64,
          tilemap_entries: 4,
          tilemap_width: 2,
          tilemap_height: 2
        }
      }]
    }));
    await mkdir(path.join(root, "assets/image"), { recursive: true });
    await writeFile(path.join(root, "assets/image/scene-port.png"), "placeholder");

    const calls = [];
    const result = await materializeBackgroundValidation({
      destination: root,
      runAssetc: async (args) => {
        calls.push(args);
        const outputPath = args[args.indexOf("-o") + 1];
        await writeFile(outputPath, "generated");
        if (args.includes("--prepare-background-4bpp")) {
          await writeFile(args[args.indexOf("--background-report") + 1], JSON.stringify({
            schema_version: 1,
            runtime_bpp: 4,
            width: 16,
            height: 16,
            tile_count: 4,
            bank_count: 4,
            total_color_error: 0
          }));
        } else {
          await writeFile(args[args.indexOf("--background-tile-report") + 1], JSON.stringify({
            schema_version: 1,
            runtime_bpp: 4,
            optimization_enabled: true,
            tile_budget: 64,
            tile_count_before: 64,
            tile_count_after: 64,
            merged_tile_count: 64,
            total_mapping_error: 0
          }));
        }
        return { stdout: "", stderr: "" };
      }
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("--prepare-background-4bpp");
    expect(calls[1]).toContain("--background-tile-report");
    expect(result.status).toBe("pack-validated");
    expect(result.ready).toBe(true);
    expect(result.assets[0].assetId).toBe("scene-port");
    expect(JSON.parse(await readFile(path.join(root, "background-validation.json"), "utf8")))
      .toMatchObject({ kind: "GBAStudioBackgroundValidationReport", ready: true });
  });
});
