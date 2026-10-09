import { chmod, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { engineBuildCachePaths } from "./engineBuildCache.js";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "gba-incremental-export-")); roots.push(root);
  const pack = path.join(root, "pack");
  const template = path.join(pack, "templates", "exported_topdown");
  const tool = path.join(pack, "tools", "assetc");
  await mkdir(template, { recursive: true }); await mkdir(path.dirname(tool), { recursive: true });
  await writeFile(path.join(template, "main.cpp"), "source");
  await writeFile(tool, `#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const output = process.argv[process.argv.indexOf('-o') + 1];
const count = path.join(__dirname, 'calls');
fs.writeFileSync(count, String(Number(fs.existsSync(count) ? fs.readFileSync(count) : 0) + 1));
if (!fs.existsSync(path.join(output, 'asset_pack_report.json'))) fs.writeFileSync(path.join(output, 'data.hpp'), 'valid-header');
fs.writeFileSync(path.join(output, 'main.cpp'), 'source');
fs.writeFileSync(path.join(output, 'asset_pack_report.json'), JSON.stringify({rebuild_plan: {generate: 1}}));
`); await chmod(tool, 0o755);
  const projectPath = path.join(root, "game.gba-project"); await writeFile(projectPath, "{}");
  const options = {
    destination: path.join(root, "export"), projectPath, assetcPath: tool, cacheEnabled: true,
    prepared: { target: "game", assets: [], contract: { template_dir: template, generated_assets: ["data.hpp"], copied_assets: [] } }
  } as unknown as Parameters<typeof writeEngineSchemaExport>[0];
  return { root, pack, options, tool };
}

it("keeps unchanged export timestamps and never restores a ROM from an export snapshot", async () => {
  const { options } = await fixture();
  const first = await writeEngineSchemaExport(options);
  const header = path.join(options.destination, "data.hpp");
  await utimes(header, 1000, 1000);
  const before = (await stat(header)).mtimeMs;
  const build = path.join(options.destination, "build"); await mkdir(build);
  await writeFile(path.join(build, "game.gba"), "current-ROM");
  const snapshot = engineBuildCachePaths(options.projectPath!, first.cache!.fingerprint).snapshotPath;
  await mkdir(path.join(snapshot, "build")); await writeFile(path.join(snapshot, "build/game.gba"), "old-ROM");
  const second = await writeEngineSchemaExport(options);
  expect(second.cache?.hit).toBe(true);
  expect((await stat(header)).mtimeMs).toBe(before);
  expect(await readFile(path.join(build, "game.gba"), "utf8")).toBe("current-ROM");
});

it("rejects a corrupted export snapshot instead of accepting stale generated data", async () => {
  const { options, tool } = await fixture();
  const first = await writeEngineSchemaExport(options);
  const snapshot = engineBuildCachePaths(options.projectPath!, first.cache!.fingerprint).snapshotPath;
  await writeFile(path.join(snapshot, "data.hpp"), "corrupted-header");
  const second = await writeEngineSchemaExport(options);
  expect(second.cache?.hit).toBe(false);
  expect(await readFile(path.join(options.destination, "data.hpp"), "utf8")).toBe("valid-header");
  expect(await readFile(path.join(path.dirname(tool), "calls"), "utf8")).toBe("2");
});

it("does not seed a corrupted older snapshot when the scene contract changes", async () => {
  const {options}=await fixture();
  const first=await writeEngineSchemaExport(options);
  const snapshot=engineBuildCachePaths(options.projectPath!,first.cache!.fingerprint).snapshotPath;
  await writeFile(path.join(snapshot,"data.hpp"),"corrupted-header");
  const changed={...options,prepared:{...options.prepared,contract:{...options.prepared.contract,kind:"topdown" as const}}};
  await writeEngineSchemaExport(changed);
  expect(await readFile(path.join(options.destination,"data.hpp"),"utf8")).toBe("valid-header");
});

it("invalidates a bundled fallback asset when its actual bytes change", async () => {
  const {root,options}=await fixture();
  vi.spyOn(process,"cwd").mockReturnValue(root);
  const relative=`fixture-${path.basename(root)}/hero.bin`;
  const fallback=path.join(root,"default-assets/templates",relative);
  await mkdir(path.dirname(fallback),{recursive:true});await writeFile(fallback,"default-v1");
  const asset={source:"missing.bin",output:"hero.bin",bundledDefaultAsset:`template:${relative}`} as typeof options.prepared.assets[number];
  options.prepared.assets=[asset];options.prepared.contract.copied_assets=[asset];
  await writeEngineSchemaExport(options);
  await writeFile(fallback,"default-v2");
  const second=await writeEngineSchemaExport(options);
  expect(second.cache?.hit).toBe(false);
  expect(await readFile(path.join(options.destination,"hero.bin"),"utf8")).toBe("default-v2");
});

it("passes the disabled cache preference to the build without changing the prepared contract", async () => {
  const {options}=await fixture();
  const original=JSON.stringify(options.prepared.contract);
  const result=await writeEngineSchemaExport({...options,cacheEnabled:false});
  const contract=JSON.parse(await readFile(path.join(options.destination,"export_project.json"),"utf8"));
  expect(result.cache).toBeUndefined();
  expect(contract.build.incremental_cache).toBe(false);
  expect(JSON.stringify(options.prepared.contract)).toBe(original);
});
