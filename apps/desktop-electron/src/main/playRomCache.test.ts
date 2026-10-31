import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile, utimes, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { PlayRomCache, fingerprintPlayFiles } from "./playRomCache.js";
import type { PlayRomInputs } from "./playRomCache.js";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "play-rom-cache-test-")); roots.push(root);
  const rom = path.join(root, "game.gba"), asset = path.join(root, "Assets/image.png");
  const dependency = path.join(root, "runtime.hpp"), buildDir = path.join(root, "build");
  await mkdir(path.dirname(asset)); await mkdir(buildDir);
  await writeFile(asset, "asset-a"); await writeFile(rom, "rom-a"); await writeFile(dependency, "header-a");
  await writeFile(path.join(buildDir, ".gbsbuild-success.json"), JSON.stringify({ schema: 1, dependencies: { [dependency]: hash("header-a") } }));
  const inputs: PlayRomInputs = { projectPath: path.join(root, "game.gba-project"), data: { name: "Game" }, enginePack: { path: root, gbsbuildPath: path.join(root, "gbsbuild") }, bundledAssetRoots: [] };
  const capture = vi.fn(async () => fingerprintPlayFiles([asset]));
  const cache = new PlayRomCache({ captureInputs: capture });
  const built = { ran: true, exitCode: 0, summary: { target: "game", projectDir: root, buildDir, romPath: rom } };
  async function prime() {
    const candidate = await cache.begin(inputs, ["Assets/image.png"]);
    cache.exported(root, candidate, { canceled: false, destination: root, warnings: ["conversion warning"], target: "game" });
    cache.doctorCompleted(root, { ran: true, exitCode: 0 });
    expect(await cache.buildCompleted(root, built)).toBeUndefined();
  }
  return { root, cache, inputs, rom, asset, dependency, built, prime, capture };
}

describe("validated Play ROM reuse", () => {
  it("reuses only a successfully exported, checked and built ROM and retains warnings", async () => {
    const f = await fixture(); expect(await f.cache.reuse(f.inputs)).toBeNull(); await f.prime();
    expect(await f.cache.reuse(f.inputs)).toMatchObject({ romPath: f.rom, warnings: ["conversion warning"],
      playBuildResult: f.built, playDoctorResult: { ran: true, exitCode: 0 } });
  });
  it("invalidates unsaved edits, another project, launch coordinates and cache opt-out", async () => {
    const f = await fixture(); await f.prime();
    for (const inputs of [ { ...f.inputs, data: { name: "Edited" } }, { ...f.inputs, projectPath: f.inputs.projectPath + "2" },
      { ...f.inputs, developmentStartScene: { name: "Porto", x: 2, y: 3, direction: "left" } },
      { ...f.inputs, data: { ...f.inputs.data, settings: { build: { persistentBuildCache: false } } } } ]) {
      expect(await f.cache.reuse(inputs)).toBeNull();
    }
  });
  it("detects changed asset bytes even when size and mtime are unchanged", async () => {
    const f = await fixture(); await f.prime(); await utimes(f.asset, 1, 1); await writeFile(f.asset, "asset-b"); await utimes(f.asset, 1, 1);
    expect(await f.cache.reuse(f.inputs)).toBeNull();
  });
  it.each(["rom", "dependency"] as const)("rejects a modified %s", async key => {
    const f = await fixture(); await f.prime(); await writeFile(f[key], "changed"); expect(await f.cache.reuse(f.inputs)).toBeNull();
  });
  it("rejects a removed ROM and a changed dependency tree", async () => {
    const f = await fixture(); await f.prime(); await rm(f.rom); expect(await f.cache.reuse(f.inputs)).toBeNull();
    const before = await fingerprintPlayFiles([f.root]); await writeFile(path.join(f.root, "plugin.json"), "new");
    expect(await fingerprintPlayFiles([f.root])).not.toBe(before);
  });
  it("does not remember an unchecked export or a failed build", async () => {
    const f = await fixture(); const candidate = await f.cache.begin(f.inputs, []);
    f.cache.exported(f.root, candidate, { canceled: false, destination: f.root });
    await f.cache.buildCompleted(f.root, f.built); expect(await f.cache.reuse(f.inputs)).toBeNull();
    await f.prime(); f.cache.exported(f.root, await f.cache.begin(f.inputs, []), { canceled: false, destination: f.root });
    f.cache.doctorCompleted(f.root, { ran: true, exitCode: 0 });
    await f.cache.buildCompleted(f.root, { ran: true, exitCode: 1, error: "failed" });
    await writeFile(f.rom, "failed-build-output"); expect(await f.cache.reuse(f.inputs)).toBeNull();
  });
  it("does not cache a rejected doctor result even when an artifact exists", async () => {
    const f = await fixture(); f.cache.exported(f.root, await f.cache.begin(f.inputs, []), { canceled: false, destination: f.root });
    f.cache.doctorCompleted(f.root, { ran: true, exitCode: 1, error: "invalid contract" });
    await f.cache.buildCompleted(f.root, f.built); expect(await f.cache.reuse(f.inputs)).toBeNull();
  });
  it("does not attach a ROM built with a different Engine Pack to the exported inputs", async () => {
    const f = await fixture(); f.cache.exported(f.root, await f.cache.begin(f.inputs, []), { canceled: false, destination: f.root });
    f.cache.doctorCompleted(f.root, { ran: true, exitCode: 0 });
    expect(await f.cache.buildCompleted(f.root, f.built, path.join(f.root, "other-pack"))).toContain("mudaram");
    expect(await f.cache.reuse(f.inputs)).toBeNull();
  });
  it("refuses changed inputs during the build or during cache lookup", async () => {
    const f = await fixture(); f.cache.exported(f.root, await f.cache.begin(f.inputs, []), { canceled: false, destination: f.root });
    f.cache.doctorCompleted(f.root, { ran: true, exitCode: 0 }); await writeFile(f.asset, "asset-b");
    expect(await f.cache.buildCompleted(f.root, f.built)).toContain("mudaram"); expect(await f.cache.reuse(f.inputs)).toBeNull();
    await f.prime(); f.capture.mockImplementationOnce(async () => fingerprintPlayFiles([f.asset])).mockResolvedValueOnce("changed-during-lookup");
    expect(await f.cache.reuse(f.inputs)).toBeNull();
  });
  it("fails closed without blocking the normal build when fingerprinting is unavailable", async () => {
    const f = await fixture(); f.capture.mockRejectedValue(new Error("unavailable"));
    expect(await f.cache.begin(f.inputs, [])).toBeNull(); expect(await f.cache.reuse(f.inputs)).toBeNull();
  });
  it("does not fingerprint sources outside the project's export boundary", async () => {
    const f = await fixture();
    expect(await f.cache.begin(f.inputs, ["../private.png"])).toBeNull();
    expect(await f.cache.begin(f.inputs, [path.join(f.root, "absolute.png")])).toBeNull();
    expect(f.capture).not.toHaveBeenCalled();
  });
  it.skipIf(process.platform === "win32")("checks project/plugin/Pack/toolchain contents with a POSIX compiler probe fixture", async () => {
    const f = await fixture(), pack = path.join(f.root, "pack"), sdk = path.join(f.root, "sdk");
    const components = path.join(sdk, "components"), bin = path.join(sdk, "bin");
    await Promise.all([mkdir(path.join(pack, "tools"), { recursive: true }), mkdir(components, { recursive: true }),
      mkdir(bin, { recursive: true }), mkdir(path.join(f.root, "tools"), { recursive: true }), mkdir(path.join(f.root, "plugins"), { recursive: true })]);
    const compiler = path.join(bin, "arm-none-eabi-g++");
    await writeFile(compiler, `#!${process.execPath}\nconst path=require('node:path');const name=process.argv[2].includes('libgcc')?'libgcc.a':process.argv[2].split('=')[1];console.log(path.join(${JSON.stringify(components)},name));\n`);
    await chmod(compiler, 0o755);
    const toolFiles = ["cc1plus", "as", "ld", "libgcc.a"].map(name => path.join(components, name));
    const header = path.join(pack, "engine.hpp"), plugin = path.join(f.root, "plugins/plugin.json");
    const hostTools = ["make", "bash", "python"].map(name => path.join(f.root, "tools", name));
    await Promise.all([...toolFiles, ...hostTools, header, plugin, path.join(bin, "arm-none-eabi-objcopy"), path.join(f.root, "tools/gbafix")].map(file => writeFile(file, "original")));
    vi.stubEnv("DEVKITPRO", f.root); vi.stubEnv("DEVKITARM", sdk);
    vi.stubEnv("MAKE", hostTools[0]); vi.stubEnv("GBS_SHELL", hostTools[1]); vi.stubEnv("GBA_STUDIO_PYTHON", hostTools[2]);
    const inputs = { ...f.inputs, enginePack: { path: pack, gbsbuildPath: path.join(pack, "tools/gbsbuild") }, developmentStartScene: { name: "Porto", x: 1, y: 2 } };
    const cache = new PlayRomCache();
    async function prime() {
      const candidate = await cache.begin(inputs, ["Assets/image.png"]); expect(candidate).not.toBeNull();
      cache.exported(f.root, candidate, { canceled: false, destination: f.root });
      cache.doctorCompleted(f.root, { ran: true, exitCode: 0 }); expect(await cache.buildCompleted(f.root, f.built)).toBeUndefined();
      expect(await cache.reuse(inputs)).toMatchObject({ romPath: f.rom });
    }
    await prime();
    expect(await cache.reuse({ ...inputs, developmentStartScene: { ...inputs.developmentStartScene, x: 3 } })).toBeNull();
    for (const file of [f.asset, header, plugin, toolFiles[0]]) {
      const previous = await readFile(file); await writeFile(file, "modified"); await utimes(file, 1, 1);
      expect(await cache.reuse(inputs)).toBeNull(); await writeFile(file, previous); await prime();
    }
    vi.stubEnv("CPPFLAGS", "-DCHANGED"); expect(await cache.reuse(inputs)).toBeNull();
  }, 20_000);
});
