import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBlankProjectData } from "../shared/newProject.js";
import { createAudioItemInProject } from "../shared/audioWorkspace.js";
import { buildAudioPreviewRom } from "./engineAudioPreview.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

const output = process.env.GBA_AUDIO_PREVIEW_GAIN_ROM_QA;
describe.skipIf(!output)("audio preview gain matches in-game bus controls", () => {
  it("applies music and SFX volume once in real ARM preview and exported game ROMs", async () => {
    const root = path.resolve(output!); await mkdir(root, { recursive: true });
    const work = await mkdtemp(path.join(root, "owned-builds-"));
    const pack = path.resolve(process.env.GBA_TRACKER_ENGINE_PACK ?? "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
    const wasm = new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
    const evidence: Record<string, unknown>[] = [];
    const measure = async (file: string) => {
      const core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
      let sum = 0, count = 0, peak = 0;
      try {
        expect(core._gba_init()).toBe(1); const rom = await readFile(file), pointer = core._malloc(rom.length);
        core.HEAPU8.set(rom, pointer); expect(core._gba_load_rom(pointer, rom.length)).toBe(1); core._free(pointer);
        for (let frame = 0; frame < 240; ++frame) {
          core._gba_run_frame();
          if (frame < 120) continue;
          const pcm = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), core._gba_audio_sample_count() * 2);
          for (const sample of pcm) { sum += sample * sample; count++; peak = Math.max(peak, Math.abs(sample)); }
        }
        return { rms: Math.sqrt(sum / count), peak, samples: count, bytes: rom.length };
      } finally { core._gba_destroy(); }
    };
    try {
      for (const kind of ["Musica", "SFX"] as const) {
        let data = createAudioItemInProject(createBlankProjectData({ name: "Gain QA", includeStarterContent: false, sceneType: "cutscene" }), { id: "sound", name: "Sound", kind, synthesis: "PCM" });
        const item = (data.audioItems as any[])[0]; item.loops = true; item.volume = 100;
        if (kind === "Musica") {
          const pattern = item.patterns[0]; pattern.channels = [pattern.channels[0]];
          pattern.channels[0].notes = Array(64).fill("C4"); pattern.channels[0].volume = 30;
        } else { item.pcmSfx.durationMs = 1000; }
        (data.settings as any).audio.musicVolume = 80; (data.settings as any).audio.sfxVolume = 60;
        // Volume requests are applied at the end of a game tick. Yield between
        // controls so each category reaches the intended reference level.
        const commands = ["set_audio_volume all 100", "wait 1", "set_audio_volume music 80", "wait 1", "set_audio_volume sfx 60", "wait 1", `${kind === "Musica" ? "play_music" : "play_sfx"} Sound`, "wait 600"];
        for (const key of ["rooms", "scenas"]) for (const room of data[key] as Record<string, unknown>[]) room.eventBindings = { onInit: "gain_boot" };
        data.events = [{ id: "gain_boot", name: "gain_boot", category: "Cena", roomName: "cena_1", steps: commands.map(command => ({ command })) }];
        const projectPath = path.join(work, `${kind}.gba-project`); await writeFile(projectPath, JSON.stringify(data));
        const before = JSON.stringify(data);
        const preview = await buildAudioPreviewRom({ requestID: kind, data, projectPath, audioID: "sound", scope: "sequence" }, { enginePackPath: pack, assetcPath: path.join(pack, "tools/assetc"), gbsbuildPath: path.join(pack, "tools/gbsbuild"), webPlayerRoot: path.resolve("static/WebPlayer"), tempRoot: work });
        const prepared = prepareEngineProjectExport(data, { enginePackPath: pack }); expect(prepared.error).toBeUndefined(); expect(prepared.generated).toBeDefined();
        const destination = path.join(work, `game-${kind}`);
        await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, destination, assetcPath: path.join(pack, "tools/assetc"), cacheEnabled: false });
        const built = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: path.join(pack, "tools/gbsbuild"), projectDir: destination }); expect(built.exitCode, built.stderr).toBe(0);
        const game = await measure(path.join(destination, `build/${prepared.generated!.target}.gba`));
        const audition = await measure(preview.romPath);
        const ratio = audition.rms / game.rms;
        evidence.push({ kind, game, preview: audition, ratio });
        expect(JSON.stringify(data)).toBe(before); expect(game.rms).toBeGreaterThan(50);
        expect(ratio, `${kind}: preview gain must match the same in-game bus settings`).toBeGreaterThan(.95);
        expect(ratio).toBeLessThan(1.05);
      }
    } finally {
      await writeFile(path.join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
      await rm(work, { recursive: true, force: true });
    }
  }, 180_000);
});
