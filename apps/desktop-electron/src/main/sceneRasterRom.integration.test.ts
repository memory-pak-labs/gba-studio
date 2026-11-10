import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBlankProjectData } from "../shared/newProject.js";
import { defaultSceneComposition } from "../shared/sceneComposition.js";
import { normalizeSceneRasterEffects } from "../shared/sceneRasterEffects.js";
import { updateRoomFieldsInProject } from "../shared/roomsWorkspace.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

const output = process.env.GBA_SCENE_RASTER_ROM_QA;
describe.skipIf(!output)("authored raster effects through project, assetc and native ROM", () => {
  it("preserves the source, links the generated composition and animates the exported scene", async () => {
    const root = path.resolve(output!); await mkdir(root, { recursive: true });
    const pack = path.resolve(process.env.GBA_TRACKER_ENGINE_PACK ?? "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const source = createBlankProjectData({ name: "Ondas e céu", includeStarterContent: false });
    const before = JSON.stringify(source), room = (source.rooms as any[])[0];
    const composition = defaultSceneComposition(); composition.enabled = true;
    composition.effects.raster = normalizeSceneRasterEffects({ ripple: { enabled: true, layer: "BG1" }, gradient: { enabled: true } });
    const data = updateRoomFieldsInProject(source, room.id, { runtime: { type: "topdown", config: { composition } } });
    const projectPath = path.join(root, "copy.gba-project"); await writeFile(projectPath, JSON.stringify(data));
    const reopened = JSON.parse(await readFile(projectPath, "utf8"));
    const destination = path.join(root, "export"), evidence: Record<string, unknown> = { passed: false };
    let core: any;
    try {
      const prepared = prepareEngineProjectExport(reopened, { enginePackPath: pack });
      expect(prepared.error).toBeUndefined(); expect(prepared.generated).toBeDefined();
      await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, destination, assetcPath: path.join(pack, "tools/assetc"), cacheEnabled: false });
      const build = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: path.join(pack, "tools/gbsbuild"), projectDir: destination });
      expect(build.exitCode, build.stderr).toBe(0);
      const binary = path.join(destination, `build/${prepared.generated!.target}`);
      const symbols = execFileSync(path.join(process.env.DEVKITARM ?? "/opt/devkitpro/devkitARM", "bin/arm-none-eabi-nm"), ["-C", binary + ".elf"], { encoding: "utf8" });
      const at = (name: string) => parseInt(symbols.split("\n").find(line => line.endsWith(` ${name}`))!.split(" ")[0], 16);
      const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
      const wasm = new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
      core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
      expect(core._gba_init()).toBe(1); const rom = await readFile(binary + ".gba"), pointer = core._malloc(rom.length);
      core.HEAPU8.set(rom, pointer); expect(core._gba_load_rom(pointer, rom.length)).toBe(1); core._free(pointer);
      const byte = (address: number) => (core._gba_audio_register(address & ~1) >> ((address & 1) * 8)) & 255;
      for (let i = 0; i < 240; ++i) core._gba_run_frame();
      const phase = byte(at("scene_raster_phase"));
      for (let i = 0; i < 17; ++i) core._gba_run_frame();
      const nextPhase = byte(at("scene_raster_phase"));
      expect(nextPhase).not.toBe(phase);
      const active = byte(at("scene_raster_active"));
      expect(byte(at("scene_raster_tables") + active * 998 + 992)).toBe(3);
      expect(core._gba_audio_register(0x04000200) & 3).toBe(3);
      expect(JSON.stringify(source)).toBe(before);
      Object.assign(evidence, { passed: true, romBytes: rom.length, phase, nextPhase, active, projectPreserved: true });
    } finally {
      core?._gba_destroy();
      await writeFile(path.join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
      if (!process.env.GBA_SCENE_RASTER_RETAIN_EXPORT) await rm(destination, { recursive: true, force: true });
    }
  }, 180_000);
});

describe.skipIf(!output)("raster effects in Porto Lúmen", () => {
  it("exports an isolated example copy and preserves gameplay and native music", async () => {
    const root = path.join(path.resolve(output!), "example"), destination = path.join(root, "export");
    await mkdir(root, { recursive: true });
    const template = path.resolve("default-assets/templates/exemplo-gba");
    const source = await readFile(path.join(template, "exemplo-gba.gba-project"));
    const pack = path.resolve(process.env.GBA_TRACKER_ENGINE_PACK!);
    let data = JSON.parse(source.toString());
    const room = data.rooms.find((r: any) => r.name === "porto_lumen");
    const composition = defaultSceneComposition(); composition.enabled = true;
    composition.effects.raster = normalizeSceneRasterEffects({ ripple: { enabled: true, layer: "BG2", amplitude: 6 }, gradient: { enabled: true } });
    data = updateRoomFieldsInProject(data, room.id, { runtime: { ...room.runtime, config: { ...room.runtime?.config, composition } } });
    await cp(path.join(template, "Assets"), path.join(root, "Assets"), { recursive: true });
    const projectPath = path.join(root, "copy.gba-project"); await writeFile(projectPath, JSON.stringify(data));
    let core: any; const evidence: Record<string, unknown> = { passed: false };
    try {
      const prepared = prepareEngineProjectExport(data, { enginePackPath: pack, developmentStartScene: { name: "porto_lumen" } });
      expect(prepared.error).toBeUndefined();
      // SDK-only iterations may reuse this owned export after checking every
      // contract field. The default path always regenerates it through assetc.
      if (process.env.GBA_SCENE_RASTER_REUSE_EXPORT) {
        const expected = { ...prepared.generated!.contract, build: { ...prepared.generated!.contract.build, incremental_cache: false } };
        expect(JSON.parse(await readFile(path.join(destination, "export_project.json"), "utf8"))).toEqual(expected);
      } else {
        await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, destination, assetcPath: path.join(pack, "tools/assetc"), cacheEnabled: false });
      }
      const build = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: path.join(pack, "tools/gbsbuild"), projectDir: destination });
      expect(build.exitCode, build.stderr).toBe(0);
      const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
      const { readRuntimeTelemetry } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-direct-player.mjs")).href);
      const { encodePngRgba } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("scripts/lib/png-icons.mjs")).href);
      const wasm = new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
      core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
      expect(core._gba_init()).toBe(1);
      const rom = await readFile(path.join(destination, `build/${prepared.generated!.target}.gba`)), pointer = core._malloc(rom.length);
      core.HEAPU8.set(rom, pointer); expect(core._gba_load_rom(pointer, rom.length)).toBe(1); core._free(pointer);
      for (let i = 0; i < 1000; ++i) core._gba_run_frame();
      const before = readRuntimeTelemetry(core); expect(before).not.toBeNull();
      core._gba_set_keys(16); for (let i = 0; i < 240; ++i) core._gba_run_frame(); core._gba_set_keys(0);
      const after = readRuntimeTelemetry(core); expect(after.frame - before.frame).toBeGreaterThanOrEqual(118);
      expect(after.currentRoom).toBe(before.currentRoom); expect(after.audio.pcmUnderrunCount).toBe(0);
      const pixels = core.HEAPU8.slice(core._gba_framebuffer(), core._gba_framebuffer() + 240 * 160 * 4);
      await writeFile(path.join(root, "porto-lumen.png"), encodePngRgba({ width: 240, height: 160, pixels }));
      expect(await readFile(path.join(template, "exemplo-gba.gba-project"))).toEqual(source);
      Object.assign(evidence, { passed: true, videoFrames: 240, gameUpdates: after.frame - before.frame, before, after, romBytes: rom.length });
    } finally {
      core?._gba_destroy(); await writeFile(path.join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
      if (!process.env.GBA_SCENE_RASTER_RETAIN_EXPORT) await rm(destination, { recursive: true, force: true });
      await rm(path.join(root, "Assets"), { recursive: true, force: true });
    }
  }, 300_000);
});
