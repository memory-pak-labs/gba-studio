import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

// Opt-in, serial A/B replay of demanding example scenes. The caller supplies
// authored 16-channel XM/IT controls; bundled sources stay intact. One ROM per
// scene switches music via QA buttons, avoiding repeated asset generation. This is a performance gate: failures
// retain the measurements, rather than silently reducing the channel count.
const output = process.env.GBA_TRACKER_SCENE_QA;
const sources = process.env.GBA_TRACKER_SCENE_SOURCES;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
describe.skipIf(!output || !sources)("XM/IT envelopes and effects in example scenes", () => {
  it("retains scene initialization and records cadence, all voices and underruns", async () => {
    const qa = path.resolve(output!); await mkdir(qa, { recursive: true });
    const template = path.resolve("default-assets/templates/exemplo-gba");
    const original = await readFile(path.join(template, "exemplo-gba.gba-project"));
    const pack = path.resolve(process.env.GBA_TRACKER_ENGINE_PACK ?? "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const projectRoot = path.join(qa, "owned-project"); await mkdir(projectRoot);
    await symlink(path.join(template, "Assets"), path.join(projectRoot, "Assets"), "dir");
    const modules = new Map<string, Buffer>();
    for (const name of ["load-static.xm", "load-effects.xm", "load-effects.it"]) {
      const file = path.join(sources!, name), bytes = await readFile(file);
      modules.set(name, bytes); await copyFile(file, path.join(projectRoot, name));
    }
    const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
    const { readRuntimeTelemetry } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-direct-player.mjs")).href);
    const { createNativeAudioRecorder } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("scripts/lib/native-audio-recorder.mjs")).href);
    const { encodePngRgba } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("scripts/lib/png-icons.mjs")).href);
    const wasm = new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
    const cases: Array<Record<string, unknown>> = [];
    let ownedBuildCache: string | undefined;
    try {
      for (const scene of process.env.GBA_TRACKER_SCENE_NAMES?.split(",") ?? ["porto_lumen", "mercado_suspenso", "penedos_vento"]) {
        const destination = path.join(projectRoot, "export");
        const data = JSON.parse(original.toString());
        const room = data.rooms.find((r: any) => r.name === scene);
        const init = room.eventBindings?.onInit;
        for (const collection of [data.rooms, data.scenas]) for (const r of collection) if (r.name === scene) r.eventBindings = { ...r.eventBindings, onInit: "qa_tracker_boot" };
        for (const [id, file, format] of [["static", "load-static.xm", "XM"], ["effects", "load-effects.xm", "XM"], ["it", "load-effects.it", "IT"]]) {
          data.assets.push({ id: `qa_module_${id}`, name: file, kind: "Audio", metadata: { source: file } });
          data.audioItems.push({ id: `qa_${id}`, name: `qa_${id}`, kind: "Musica", format, sourceAssetID: `qa_module_${id}`, volume: 100, loops: true });
          data.events.push({ id: `qa_play_${id}`, name: `qa_play_${id}`, roomName: scene, category: "Cena", steps: [{ command: `play_music qa_${id}` }] });
        }
        data.events.push({ id: "qa_stop", name: "qa_stop", roomName: scene, category: "Cena", steps: [{ command: "stop_music" }] });
        data.events.push({ id: "qa_tracker_boot", name: "qa_tracker_boot", roomName: scene, category: "Cena", steps: [
          ...(init ? [{ command: `call_event ${init}` }] : []),
          { command: "play_music qa_static" },
          { command: "attach_button L qa_stop false" },
          { command: "attach_button R qa_play_effects false" },
          { command: "attach_button Select qa_play_it false" },
        ] });
        const projectPath = path.join(projectRoot, "qa.gba-project"); await writeFile(projectPath, JSON.stringify(data));
        const prepared = prepareEngineProjectExport(data, { enginePackPath: pack, developmentStartScene: { name: scene } });
        expect(prepared.error).toBeUndefined(); expect(prepared.generated).toBeDefined();
        await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, destination, assetcPath: path.join(pack, "tools/assetc"), cacheEnabled: true });
        const identity = digest(Buffer.from(JSON.stringify([await realpath(destination), path.resolve(destination, "build"), await realpath(pack)])));
        ownedBuildCache = path.join(os.tmpdir(), "gbastudio-engine-build-cache", identity);
        const build = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: path.join(pack, "tools/gbsbuild"), projectDir: destination });
        await writeFile(path.join(qa, `${scene}-build.json`), JSON.stringify(build, null, 2)); expect(build.exitCode).toBe(0);
        const rom = await readFile(path.join(destination, `build/${prepared.generated!.target}.gba`));
        if (process.env.GBA_TRACKER_RETAIN_BUILD) {
          await cp(destination, path.join(path.resolve(process.env.GBA_TRACKER_RETAIN_BUILD), scene), { recursive: true });
        }
        let baselineUpdates: number[] = [];
        for (const mode of scene === "porto_lumen" ? ["off", "static", "effects", "it"] : ["off", "static", "effects"]) {
          const core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
          const recorder = createNativeAudioRecorder(core, qa);
          const windows = []; let peak = 0, underruns = 0, minVoices = 99;
          try {
            expect(core._gba_init()).toBe(1); const pointer = core._malloc(rom.length);
            core.HEAPU8.set(rom, pointer); expect(core._gba_load_rom(pointer, rom.length)).toBe(1); core._free(pointer);
            for (let i = 0; i < 180; i++) core._gba_run_frame();
            const modeKey = mode === "off" ? 512 : mode === "effects" ? 256 : mode === "it" ? 4 : 0;
            core._gba_set_keys(modeKey); for (let i = 0; i < 4; i++) core._gba_run_frame();
            core._gba_set_keys(0); for (let i = 0; i < 1000; i++) core._gba_run_frame();
            const framebuffer = core._gba_framebuffer();
            await writeFile(path.join(qa, `${scene}-${mode}.png`), encodePngRgba({
              width: 240, height: 160,
              pixels: core.HEAPU8.slice(framebuffer, framebuffer + 240 * 160 * 4),
            }));
            recorder.select(`${scene}-${mode}`);
            for (const [gesture, keys] of [["idle", 0], ["right", 16], ["stop", 0]] as const) {
              core._gba_set_keys(keys); const start = readRuntimeTelemetry(core); expect(start).not.toBeNull();
              for (let i = 0; i < 240; i++) {
                core._gba_run_frame(); recorder.frame();
                const state = readRuntimeTelemetry(core); expect(state).not.toBeNull();
                underruns = Math.max(underruns, state.audio.pcmUnderrunCount);
                minVoices = Math.min(minVoices, state.audio.activeVoiceCount);
                expect(core._gba_audio_register(0x04000204)).toBe(0x4317);
                const pcm = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), core._gba_audio_sample_count() * 2);
                for (const value of pcm) peak = Math.max(peak, Math.abs(value));
              }
              const end = readRuntimeTelemetry(core);
              windows.push({ gesture, videoFrames: 240, gameUpdates: end.frame - start.frame, start, end });
              expect(end.currentRoom).toBe(start.currentRoom);
            }
            const result = { scene, mode, romBytes: rom.length, romSha256: digest(rom), peak, underruns, minVoices, windows, wav: recorder.stop() };
            cases.push(result); await writeFile(path.join(qa, "scene-results.json"), JSON.stringify(cases, null, 2));
            console.log(JSON.stringify({ scene, mode, peak, underruns, minVoices, updates: windows.map(w => w.gameUpdates) }));
            expect(underruns).toBe(0);
            if (mode !== "off") { expect(minVoices).toBe(16); expect(peak).toBeGreaterThan(100); }
            if (mode === "off") baselineUpdates = windows.map(w => w.gameUpdates);
            // Aim for >= half the no-music cadence (~30 Hz). A small tolerance
            // accounts for scene work at a boundary; raw counts remain in JSON.
            expect.soft(windows.every((w, i) => w.gameUpdates >= Math.floor(baselineUpdates[i] * 0.49)), `${scene}/${mode}: cadence`).toBe(true);
          } finally { core._gba_destroy(); }
        }
      }
      expect(await readFile(path.join(template, "exemplo-gba.gba-project"))).toEqual(original);
      for (const [name, bytes] of modules) expect(await readFile(path.join(sources!, name))).toEqual(bytes);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
      if (ownedBuildCache) await rm(ownedBuildCache, { recursive: true, force: true });
    }
  }, 1_800_000);
});
