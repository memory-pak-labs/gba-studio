import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeSceneVideoBudgetReport, SceneVideoBudgetExportError } from "./sceneVideoBudgetExport.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { engineBuildCachePaths, writeEngineBuildCacheSnapshot, writeLatestEngineBuildCache } from "./engineBuildCache.js";
import { exportedFileHashes } from "./stableBuildFiles.js";
import { createBlankProjectData } from "../shared/newProject.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(oam: number) {
  const root = await mkdtemp(path.join(os.tmpdir(), "gba-video-budget-test-"));
  roots.push(root);
  await writeFile(path.join(root, "asset_pack_report.json"), JSON.stringify({ schema: 11, ok: true, allocations: [
    { bank_group: "scene_test", allocations: { oam_sprites: { start: 0, count: oam } } }
  ] }));
  return root;
}
const scenes = [{ name: "test" }];

describe("scene video budget export", () => {
  it("writes a structured scene report at the limit", async () => {
    const root = await fixture(128);
    const result = await writeSceneVideoBudgetReport(root, scenes);
    expect(result?.blocked).toBe(false);
    expect(JSON.parse(await readFile(path.join(root, "scene_video_budget.json"), "utf8"))).toEqual(result);
  });

  it("blocks export above the limit while preserving the structured error report", async () => {
    const root = await fixture(129);
    await expect(writeSceneVideoBudgetReport(root, scenes)).rejects.toBeInstanceOf(SceneVideoBudgetExportError);
    await expect(writeSceneVideoBudgetReport(root, scenes)).rejects.toThrow(/test.*OAM.*129.*128/);
    const result = JSON.parse(await readFile(path.join(root, "scene_video_budget.json"), "utf8"));
    expect(result.scenes[0].diagnostics).toContainEqual(expect.objectContaining({ resource: "oam", excess: 1 }));
  });

  it("rechecks compiled allocations and replaces an old report on cache reuse", async () => {
    const root = await fixture(128);
    await writeSceneVideoBudgetReport(root, scenes);
    await writeFile(path.join(root, "scene_video_budget.json"), '{"blocked":false,"complete":true}');
    const raw = JSON.parse(await readFile(path.join(root, "asset_pack_report.json"), "utf8"));
    raw.allocations[0].allocations.oam_sprites.count = 129;
    await writeFile(path.join(root, "asset_pack_report.json"), JSON.stringify(raw));
    await expect(writeSceneVideoBudgetReport(root, scenes)).rejects.toThrow(/Exportação bloqueada/);
    expect(JSON.parse(await readFile(path.join(root, "scene_video_budget.json"), "utf8"))).toMatchObject({ blocked: true, complete: false });
  });

  it("rejects a missing or malformed required report", async () => {
    const root = await fixture(1);
    await rm(path.join(root, "asset_pack_report.json"));
    await expect(writeSceneVideoBudgetReport(root, scenes)).rejects.toThrow();
    await writeFile(path.join(root, "asset_pack_report.json"), '{');
    await expect(writeSceneVideoBudgetReport(root, scenes)).rejects.toThrow();
  });

  it("enforces the check before cache promotion and on a trusted snapshot from an older exporter", async () => {
    const root = await fixture(128);
    const projectPath = path.join(root, "project.gba-project");
    await writeFile(projectPath, "{}");
    const assetcPath = path.join(root, "assetc.py");
    // A deterministic compiler fixture exercises the real subprocess/export and
    // cache flow. Native assetc integration is checked separately.
    await writeFile(assetcPath, [
      "import json, pathlib, sys",
      "out = pathlib.Path(sys.argv[sys.argv.index('-o')+1])",
      "contract = json.loads(pathlib.Path(sys.argv[-1]).read_text())",
      "counter = pathlib.Path(__file__).with_suffix('.count')",
      "counter.write_text(str(int(counter.read_text())+1) if counter.exists() else '1')",
      "for name in contract['generated_assets'] + [a['output'] for a in contract['copied_assets']]:",
      " p = out / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text('fixture')",
      "(out / 'asset_pack_report.json').write_text(pathlib.Path(__file__).with_suffix('.report.json').read_text())"
    ].join("\n"));
    const compiledReport = path.join(root, "assetc.report.json");
    const compiled = JSON.parse(await readFile(path.join(root, "asset_pack_report.json"), "utf8"));
    compiled.allocations[0].bank_group = "global";
    const valid = JSON.stringify(compiled);
    const invalid = JSON.parse(valid);
    invalid.allocations[0].allocations.oam_sprites.count = 129;
    await writeFile(compiledReport, JSON.stringify(invalid));
    const prepared = { target: "test", assets: [], contract: buildEngineExportProjectContract(createBlankProjectData({ name: "Video budget" })) };
    const options = { prepared, assetcPath, projectPath, cacheEnabled: true };
    await expect(writeEngineSchemaExport({ ...options, destination: path.join(root, "invalid") })).rejects.toThrow(/cena_1.*OAM.*129\/128/);
    await expect(readFile(engineBuildCachePaths(projectPath, "unused").latestManifestPath)).rejects.toThrow();
    await writeFile(compiledReport, valid);
    const first = await writeEngineSchemaExport({ ...options, destination: path.join(root, "valid") });
    expect(first.videoBudget?.blocked).toBe(false);
    expect(first.cache?.hit).toBe(false);
    const cached = await writeEngineSchemaExport({ ...options, destination: path.join(root, "cached") });
    expect(cached.cache?.hit).toBe(true);
    expect(cached.videoBudget).toEqual(first.videoBudget);
    expect(await readFile(path.join(root, "assetc.count"), "utf8")).toBe("2");

    // Seed an integrity-valid legacy snapshot with no derived video verdict and
    // an allocation that the new checker rejects. Integrity is not a budget check.
    const fingerprint = first.cache!.fingerprint;
    const paths = engineBuildCachePaths(projectPath, fingerprint);
    await writeFile(path.join(paths.snapshotPath, "asset_pack_report.json"), JSON.stringify(invalid));
    await rm(path.join(paths.snapshotPath, "scene_video_budget.json"));
    const manifest = { schema: 1 as const, fingerprint, outputPath: paths.snapshotPath, generatedAt: new Date().toISOString(), files: await exportedFileHashes(paths.snapshotPath) };
    await writeEngineBuildCacheSnapshot(projectPath, manifest);
    await writeLatestEngineBuildCache(projectPath, manifest);
    await expect(writeEngineSchemaExport({ ...options, destination: path.join(root, "old-cache") })).rejects.toThrow(/cena_1.*OAM.*129\/128/);
    expect(await readFile(path.join(root, "assetc.count"), "utf8")).toBe("2");
    expect(JSON.parse(await readFile(path.join(root, "old-cache/scene_video_budget.json"), "utf8"))).toMatchObject({ blocked: true });
  });
});
