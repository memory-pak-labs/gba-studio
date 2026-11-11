import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBlankProjectData } from "../shared/newProject.js";
import { createAudioItemInProject } from "../shared/audioWorkspace.js";
import { decodeWav, encodeWav, updateWavEditInProject, type WavEdit } from "../shared/wavEditing.js";
import { buildAudioPreviewRom, type AudioPreviewBuild } from "./engineAudioPreview.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

describe.skipIf(!process.env.GBA_WAV_EDITOR_QA_OUTPUT)("edited WAV ARM/mGBA proof", () => {
  it("exports cuts, fades and loops to imported SFX, PCM SFX and instruments, invalidates previews and preserves sources", async () => {
    const output = path.resolve(process.env.GBA_WAV_EDITOR_QA_OUTPUT!); await mkdir(output, { recursive: true });
    const work = await mkdtemp(path.join(output, "wav-proof-work-"));
    const temporary = path.join(work, "temporary-builds"); await mkdir(temporary);
    const projectPath = path.join(work, "wav-editor.gba-project");
    const sourcePath = path.join(work, "bell.wav");
    const original = encodeWav({ sampleRate: 8000, channels: [Float32Array.from({ length: 8000 }, (_, i) => Math.sin(i * Math.PI * 2 * 330 / 8000) * .2), Float32Array.from({ length: 8000 }, (_, i) => Math.sin(i * Math.PI * 2 * 330 / 8000) * .1)], loop: null });
    const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    await writeFile(path.join(output, "bell.wav"), original);
    await writeFile(sourcePath, original);
    let base = createBlankProjectData({ name: "WAV ROM QA", includeStarterContent: false, sceneType: "cutscene" });
    base.assets = [{ id: "wav", name: "bell.wav", kind: "Audio", metadata: { source: "bell.wav" } }];
    base.audioItems = [{ id: "imported", name: "WAV importado", kind: "SFX", exportID: "imported", sourceAssetID: "wav", loops: false, volume: 100 }];
    base = createAudioItemInProject(base, { id: "pcm-fx", name: "SFX PCM", kind: "SFX", synthesis: "PCM" });
    const effect = (base.audioItems as any[]).find(a => a.id === "pcm-fx"); effect.loops = true;
    Object.assign(effect.pcmSfx, { source: "sample", sampleAssetID: "wav", durationMs: 800, trimStartMs: 0, pitchSemitones: 0, attackMs: 0, releaseMs: 0 });
    base = createAudioItemInProject(base, { id: "song", name: "Instrumento WAV", kind: "Musica", synthesis: "PCM" });
    const song = (base.audioItems as any[]).find(a => a.id === "song"); song.loops = false; song.patterns[0].steps = 8;
    song.patterns[0].channels = [{ id: "lane", name: "Sino", type: "pcm", sampleAssetID: "wav", sampleRootNote: "C4", sampleLoop: true, instrument: "PCM Sine", volume: 65, notes: ["C4", "---", "C4", "---", "C5", "---", "G4", "---"] }];
    const recipe: WavEdit = { version: 1, sourceSha256: hash(original), sampleRate: 8000, sourceFrames: 8000, trimStart: 800, trimEnd: 6400, loop: { start: 1600, end: 4000 }, operations: [{ type: "normalize", start: 800, end: 6400 }, { type: "fadeIn", start: 800, end: 1600 }, { type: "fadeOut", start: 5600, end: 6400 }] };
    const edited = updateWavEditInProject(base, "wav", recipe);
    await writeFile(projectPath, JSON.stringify(edited, null, 2));
    await writeFile(path.join(output, "wav-editor.gba-project"), JSON.stringify(edited, null, 2));
    const pack = path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const options = { enginePackPath: pack, assetcPath: path.join(pack, "tools/assetc"), gbsbuildPath: path.join(pack, "tools/gbsbuild"), webPlayerRoot: path.resolve("static/WebPlayer"), tempRoot: temporary };
    const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
    const wasm = new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
    const { createNativeAudioRecorder } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("scripts/lib/native-audio-recorder.mjs")).href);
    const builds: AudioPreviewBuild[] = [], results: Record<string, unknown>[] = [];
    let previous: AudioPreviewBuild | undefined;
    try {
      for (const id of ["original", "edited", "loop", "pcm-fx", "song"]) {
        const data = structuredClone(id === "original" ? base : edited);
        const audioID = ["original", "edited", "loop"].includes(id) ? "imported" : id;
        if (id === "loop") (data.audioItems as any[]).find(a => a.id === audioID).loops = true;
        const request = { requestID: id, data, projectPath, audioID, scope: "sequence" as const };
        const built = await buildAudioPreviewRom(request, options, previous); builds.push(built);
        if (id === "edited") {
          expect(built.fingerprint).not.toBe(previous!.fingerprint);
          expect(await buildAudioPreviewRom(request, options, built)).toBe(built);
        }
        previous = built;
        const header = await readFile(path.join(built.directory, "audio.hpp"), "utf8");
        if (id === "loop") expect(header).toMatch(/true, 800, 3200/);
        if (id === "pcm-fx") expect(header).toMatch(/true, 3154, 12614/);
        if (id === "song") expect(header).toMatch(/true, 800, 3200/);
        const rom = await readFile(built.romPath);
        const core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
        const recorder = createNativeAudioRecorder(core, output); let witness = 0, peak = 0, voices = 0, ended = false, latePlaying = false, executedFrames = 0;
        const word = (address: number) => (core._gba_audio_register(address) | core._gba_audio_register(address + 2) << 16) >>> 0;
        const timeline = [];
        try {
          expect(core._gba_init()).toBe(1); const pointer = core._malloc(rom.length); core.HEAPU8.set(rom, pointer); expect(core._gba_load_rom(pointer, rom.length)).toBe(1); core._free(pointer); recorder.select(id);
          for (let frame = 0; frame < 180; frame++) {
            core._gba_run_frame(); recorder.frame();
            executedFrames++;
            if (!witness) for (let address = 0x02000000; address < 0x02040000 - 32; address += 4) if (word(address) === 0x41555043 && word(address + 4) === 0x50434d31) { witness = address; break; }
            const pcm = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), core._gba_audio_sample_count() * 2);
            for (const value of pcm) peak = Math.max(peak, Math.abs(value));
            if (!witness || word(witness + 24) === 2) continue;
            expect(word(witness + 24)).toBe(1); expect(word(witness + 20)).toBe(0);
            voices = Math.max(voices, word(witness + 16)); if (frame > 130 && word(witness + 16)) latePlaying = true;
            if (frame % 8 === 0) timeline.push({ frame, engineFrame: word(witness + 8), playing: word(witness + 12), voices: word(witness + 16), underruns: word(witness + 20) });
            if (word(witness + 28)) { ended = true; break; }
          }
          expect(witness).toBeGreaterThan(0); expect(peak).toBeGreaterThan(100); expect(voices).toBeGreaterThan(0);
          if (["loop", "pcm-fx"].includes(id)) { expect(latePlaying).toBe(true); expect(ended).toBe(false); }
          else expect(ended).toBe(true);
          const wav = recorder.stop();
          await writeFile(path.join(output, `${id}-audio.hpp`), header);
          results.push({ id, romSha256: hash(rom), romBytes: rom.length, fingerprint: built.fingerprint, peak, voices, ended, latePlaying, executedFrames, wav, timeline });
        } finally { core._gba_destroy(); }
      }
      expect(Number(results[1].executedFrames)).toBeLessThan(Number(results[0].executedFrames));
      expect(Number(results[1].peak)).toBeGreaterThan(Number(results[0].peak) * 2);
      const game = structuredClone(edited);
      for (const key of ["scenas", "rooms"]) for (const room of game[key] as Record<string, unknown>[]) room.eventBindings = { onInit: "qa_wav_boot" };
      game.events = [{ id: "qa_wav_boot", name: "qa_wav_boot", category: "Cena", roomName: "cena_1", steps: [{ command: 'play_sfx "WAV importado"' }, { command: "wait 240" }] }];
      const prepare = (data: typeof game) => {
        const result = prepareEngineProjectExport(data, { enginePackPath: pack });
        expect(result.error).toBeUndefined(); expect(result.generated).toBeDefined(); return result.generated!;
      };
      const prepared = prepare(game), destination = path.join(temporary, "regular-export");
      const first = await writeEngineSchemaExport({ prepared, projectPath, destination, assetcPath: options.assetcPath, cacheEnabled: true });
      const cached = await writeEngineSchemaExport({ prepared, projectPath, destination, assetcPath: options.assetcPath, cacheEnabled: true });
      expect(cached.cache?.hit).toBe(true);
      const changed = updateWavEditInProject(game, "wav", { ...recipe, trimStart: 880 });
      const changedPrepared = prepare(changed);
      const rebuilt = await writeEngineSchemaExport({ prepared: changedPrepared, projectPath, destination, assetcPath: options.assetcPath, cacheEnabled: true });
      expect(rebuilt.cache?.fingerprint).not.toBe(first.cache?.fingerprint); expect(rebuilt.cache?.hit).toBe(false);
      const staged = decodeWav(await readFile(path.join(destination, "assets/audio/bell.wav")));
      expect(staged.channels[0].length).toBe(5520); expect(staged.loop).toEqual({ start: 720, end: 3120 });
      const build = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: options.gbsbuildPath, projectDir: destination }); expect(build.exitCode).toBe(0);
      const rom = await readFile(path.join(destination, `build/${changedPrepared.target}.gba`));
      const core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
      let gamePeak = 0;
      try {
        expect(core._gba_init()).toBe(1); const pointer = core._malloc(rom.length); core.HEAPU8.set(rom, pointer); expect(core._gba_load_rom(pointer, rom.length)).toBe(1); core._free(pointer);
        for (let frame = 0; frame < 120; frame++) { core._gba_run_frame(); const pcm = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), core._gba_audio_sample_count() * 2); for (const value of pcm) gamePeak = Math.max(gamePeak, Math.abs(value)); }
        expect(gamePeak).toBeGreaterThan(100);
      } finally { core._gba_destroy(); }
      expect(hash(await readFile(sourcePath))).toBe(hash(original));
      await writeFile(path.join(output, "native-result.json"), JSON.stringify({ passed: true, sourceUnchanged: true, cases: results, regularGame: { romSha256: hash(rom), romBytes: rom.length, peak: gamePeak, cacheHit: cached.cache?.hit, cacheInvalidated: rebuilt.cache?.fingerprint !== first.cache?.fingerprint } }, null, 2));
    } finally {
      for (const built of builds) await rm(built.directory, { recursive: true, force: true });
      await rm(work, { recursive: true, force: true });
    }
  }, 180000);
});
