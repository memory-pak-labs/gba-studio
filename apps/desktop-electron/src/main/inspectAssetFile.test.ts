import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { inspectAssetFile } from "./inspectAssetFile.js";

describe("inspectAssetFile", () => {
  it("reads PNG dimensions, physical size and estimated 4bpp GBA budget", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "gba-asset-info-"));
    const projectPath = path.join(directory, "game.gba-project");
    const pngHeader = Buffer.alloc(32);
    pngHeader.set(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 0);
    pngHeader.writeUInt32BE(13, 8);
    pngHeader.write("IHDR", 12, "ascii");
    pngHeader.writeUInt32BE(128, 16);
    pngHeader.writeUInt32BE(64, 20);
    await writeFile(path.join(directory, "hero.png"), pngHeader);

    await expect(inspectAssetFile({ projectPath, source: "hero.png" })).resolves.toEqual({
      exists: true,
      format: "PNG",
      byteSize: 32,
      width: 128,
      height: 64,
      estimatedGbaBytes: 4128,
      gbaBudgetPercent: 4.2
    });
  });

  it("uses the unsaved 8bpp authoring mode for the image estimate", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "gba-asset-eight-"));
    const header = Buffer.alloc(24);
    header.set(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    header.writeUInt32BE(128, 16); header.writeUInt32BE(64, 20);
    await writeFile(path.join(directory, "hero.png"), header);
    expect(await inspectAssetFile({ projectPath: path.join(directory, "game.gba-project"), source: "hero.png", colorMode: "8bpp" })).toMatchObject({ estimatedGbaBytes: 8704, gbaBudgetPercent: 8.9 });
  });

  it("reports missing files without throwing", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "gba-asset-missing-"));
    await expect(inspectAssetFile({ projectPath: path.join(directory, "game.gba-project"), source: "missing.wav" })).resolves.toEqual({
      exists: false,
      format: "WAV"
    });
  });

  it("reports preparation metadata and the matching Engine Pack export", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "gba-asset-pipeline-"));
    const projectPath = path.join(directory, "demo.gba-project");
    const source = "Assets/sprites/hero.png";
    const sourcePath = path.join(directory, source);
    const exportPath = path.join(directory, "build", "demo");
    const pngHeader = Buffer.alloc(32);
    pngHeader.set(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 0);
    pngHeader.writeUInt32BE(13, 8);
    pngHeader.write("IHDR", 12, "ascii");
    pngHeader.writeUInt32BE(16, 16);
    pngHeader.writeUInt32BE(16, 20);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await mkdir(exportPath, { recursive: true });
    await writeFile(sourcePath, pngHeader);
    await writeFile(projectPath, JSON.stringify({
      assets: [{
        id: "hero",
        name: "hero.png",
        kind: "Sprite",
        metadata: { source, assetcStatus: "safe", assetcReviewed: true }
      }],
      settings: {
        build: { romFileName: "demo.gba" },
        general: { exportFolder: "build", gameTitle: "Demo" }
      }
    }));
    await writeFile(path.join(exportPath, "asset_pack_report.json"), JSON.stringify({
      ok: true,
      asset_reports: {
        hero: { id: "hero", ok: true, diagnostics: [] }
      },
      export_plan: {
        headers: [{
          id: "hero",
          header: "hero.hpp",
          inputs: ["assets/sprite/hero.png"],
          generate: true
        }]
      }
    }));

    const result = await inspectAssetFile({ projectPath, source, assetID: "hero" });

    expect(result.pipeline).toMatchObject({
      preparedStatus: "complete",
      exportedStatus: "complete",
      reportPath: path.join(exportPath, "asset_pack_report.json"),
      exportPath
    });
  });

  it("marks an export as attention when preparation is still pending", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "gba-asset-pipeline-pending-"));
    const projectPath = path.join(directory, "demo.gba-project");
    const source = "Assets/sprites/hero.png";
    const sourcePath = path.join(directory, source);
    const exportPath = path.join(directory, "build", "demo");
    const pngHeader = Buffer.alloc(32);
    pngHeader.set(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 0);
    pngHeader.writeUInt32BE(13, 8);
    pngHeader.write("IHDR", 12, "ascii");
    pngHeader.writeUInt32BE(16, 16);
    pngHeader.writeUInt32BE(16, 20);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await mkdir(exportPath, { recursive: true });
    await writeFile(sourcePath, pngHeader);
    await writeFile(projectPath, JSON.stringify({
      assets: [{
        id: "hero",
        name: "hero.png",
        kind: "Sprite",
        metadata: { source }
      }],
      settings: {
        build: { romFileName: "demo.gba" },
        general: { exportFolder: "build", gameTitle: "Demo" }
      }
    }));
    await writeFile(path.join(exportPath, "asset_pack_report.json"), JSON.stringify({
      ok: true,
      asset_reports: {
        hero: { id: "hero", ok: true, diagnostics: [] }
      }
    }));

    await expect(inspectAssetFile({ projectPath, source, assetID: "hero" })).resolves.toMatchObject({
      pipeline: {
        preparedStatus: "pending",
        exportedStatus: "attention",
        exportedDetail: "prepared_pending"
      }
    });
  });
});
