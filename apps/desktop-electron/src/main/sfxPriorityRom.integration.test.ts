import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createAudioItemInProject, updateAudioItemFieldsInProject } from "../shared/audioWorkspace.js";
import { updatePcmSfxInProject } from "../shared/audioPcm.js";
import { createBlankProjectData } from "../shared/newProject.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

const output = process.env.GBA_SFX_PRIORITY_ROM_QA;
describe.skipIf(!output)("SFX priority through export and the ARM mixer", () => {
  it("preserves the higher-priority effect while a new voice replaces the lowest-priority effect", async () => {
    const root = path.resolve(output!);
    await mkdir(root, { recursive: true });
    const work = await mkdtemp(path.join(root, "sfx-priority-"));
    const frequencies = { alarm: 420, low: 610, mid: 820, high: 1010, replacement: 1250 };
    let data = createBlankProjectData({ name: "Prioridade SFX", includeStarterContent: false });
    for (const [name, hz] of Object.entries(frequencies)) {
      data = createAudioItemInProject(data, { id: name, name, kind: "SFX", synthesis: "PCM" });
      data = updateAudioItemFieldsInProject(data, name, { volume: 30 });
      data = updatePcmSfxInProject(data, name, { frequencyStart: hz, frequencyEnd: hz, durationMs: 1800, attackMs: 0, releaseMs: 0 });
    }
    for (const key of ["rooms", "scenas"]) for (const room of data[key] as Record<string, unknown>[]) room.eventBindings = { onInit: "sonic_test" };
    data.events = [{ id: "sonic_test", name: "sonic_test", roomName: "cena_1", category: "Cena", steps: [
      "play_sfx_instance alarm 1 255", "wait 1", "play_sfx_instance low 2 0", "wait 1",
      "play_sfx_instance mid 3 8", "wait 1", "play_sfx_instance high 4 9", "wait 1",
      "wait 36", "play_sfx replacement", "wait 120"
    ].map(command => ({ command })) }];
    const projectPath = path.join(work, "priority.gba-project");
    await writeFile(projectPath, JSON.stringify(data));
    const pack = path.resolve(process.env.GBA_TRACKER_ENGINE_PACK ?? "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const prepared = prepareEngineProjectExport(data, { enginePackPath: pack });
    expect(prepared.error).toBeUndefined();
    const destination = path.join(work, "export");
    await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, destination, assetcPath: path.join(pack, "tools/assetc"), cacheEnabled: false });
    const build = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: path.join(pack, "tools/gbsbuild"), projectDir: destination });
    expect(build.exitCode, build.stderr).toBe(0);
    const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
    const wasm = new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
    const core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) {
      const instance = new WebAssembly.Instance(wasm, imports);
      done(instance);
      return instance.exports;
    } });
    try {
      expect(core._gba_init()).toBe(1);
      const rom = await readFile(path.join(destination, "build", prepared.generated!.target + ".gba"));
      const pointer = core._malloc(rom.length);
      core.HEAPU8.set(rom, pointer);
      expect(core._gba_load_rom(pointer, rom.length)).toBe(1);
      core._free(pointer);
      const windows: number[][] = [[], []];
      for (let frame = 0; frame < 94; ++frame) {
        core._gba_run_frame();
        const buffer = frame >= 20 && frame < 35 ? windows[0] : frame >= 66 && frame < 89 ? windows[1] : undefined;
        if (!buffer) continue;
        const stereo = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), core._gba_audio_sample_count() * 2);
        for (let i = 0; i < stereo.length; i += 2) buffer.push(stereo[i]);
      }
      const rate = core._gba_audio_sample_rate();
      const amplitude = (samples: number[], frequency: number) => {
        let real = 0, imaginary = 0;
        for (let i = 0; i < samples.length; ++i) {
          const phase = i * frequency * 2 * Math.PI / rate;
          real += samples[i] * Math.cos(phase);
          imaginary += samples[i] * Math.sin(phase);
        }
        return 2 * Math.hypot(real, imaginary) / samples.length;
      };
      const [before, after] = windows.map(samples => Object.fromEntries(
        Object.entries(frequencies).map(([name, hz]) => [name, amplitude(samples, hz)])
      ));
      await writeFile(path.join(work, "evidence.json"), JSON.stringify({ before, after, sampleCounts: windows.map(window => window.length) }, null, 2));
      expect(before.alarm).toBeGreaterThan(100);
      expect(before.low).toBeGreaterThan(100);
      expect(after.alarm).toBeGreaterThan(before.alarm * 0.75);
      expect(after.low).toBeLessThan(before.low * 0.1);
      expect(after.replacement).toBeGreaterThan(100);
    } finally {
      core._gba_destroy();
    }
  }, 120_000);
});
