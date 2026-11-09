import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBlankProjectData } from "../shared/newProject.js";
import { createAudioItemInProject } from "../shared/audioWorkspace.js";
import { updatePcmSfxInProject } from "../shared/audioPcm.js";
import { buildAudioPreviewRom } from "./engineAudioPreview.js";

describe.skipIf(!process.env.GBA_AUDIO_PCM_QA_OUTPUT)("authored PCM ARM/mGBA proof", () => {
  it("plays all sixteen composed lanes, their rests, a synthesized effect and a transformed WAV", async () => {
    const output = path.resolve(process.env.GBA_AUDIO_PCM_QA_OUTPUT!); await mkdir(output, { recursive: true });
    const pack = path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const projectPath = path.join(output, "composer.gba-project");
    let data = createAudioItemInProject(createBlankProjectData({ name: "PCM ROM", includeStarterContent: false }), { id: "song", name: "Sixteen", kind: "Musica", synthesis: "PCM" });
    const song = (data.audioItems as any[])[0]; song.patterns[0].steps = 8;
    song.patterns[0].channels = Array.from({ length: 16 }, (_, i) => ({ id: `c${i}`, name: `PCM ${i + 1}`, type: "pcm", instrument: "PCM Triangle", envelope: "Short Decay", volume: 12, pan: i % 2 ? 100 : -100, notes: [i % 2 ? "E4" : "C4", "---", "G4", "---", "C5", "---", "E4", "---"] }));
    data = createAudioItemInProject(data, { id: "synth", name: "Synth", kind: "SFX", synthesis: "PCM" });
    data = updatePcmSfxInProject(data, "synth", { durationMs: 400, frequencyStart: 880, frequencyEnd: 220, noiseMix: 20, releaseMs: 80 });
    await mkdir(path.join(output, "Assets"), { recursive: true });
    await copyFile(path.resolve("default-assets/templates/exemplo-gba/Assets/audio/coastal-v1/sources/farol_sfx_vitoria.wav"), path.join(output, "Assets/vitoria.wav"));
    data.assets = [...data.assets as any[], { id: "wav", name: "vitoria.wav", kind: "Audio", metadata: { source: "Assets/vitoria.wav" } }];
    data = createAudioItemInProject(data, { id: "sample", name: "Sample", kind: "SFX", synthesis: "PCM" });
    data = updatePcmSfxInProject(data, "sample", { source: "sample", sampleAssetID: "wav", durationMs: 200, trimStartMs: 80, pitchSemitones: 12, attackMs: 5, releaseMs: 25 });
    await writeFile(projectPath, JSON.stringify(data));
    const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
    const wasm = new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
    const { createNativeAudioRecorder } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("scripts/lib/native-audio-recorder.mjs")).href);
    const cases = [];
    for (const id of ["song", "synth", "sample"]) {
      const built = await buildAudioPreviewRom({ requestID: id, data, projectPath, audioID: id, scope: "sequence" }, { enginePackPath: pack, assetcPath: path.join(pack, "tools/assetc"), gbsbuildPath: path.join(pack, "tools/gbsbuild"), webPlayerRoot: path.resolve("static/WebPlayer"), tempRoot: output });
      const rom = await readFile(built.romPath);
      const core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
      const recorder = createNativeAudioRecorder(core, output); let witness = 0, peak = 0, voices = 0, rested = false, ended = false, stereoDifferences = 0;
      const snapshots = [];
      const word = (address: number) => (core._gba_audio_register(address) | core._gba_audio_register(address + 2) << 16) >>> 0;
      try {
        expect(core._gba_init()).toBe(1); const pointer = core._malloc(rom.length); core.HEAPU8.set(rom, pointer); expect(core._gba_load_rom(pointer, rom.length)).toBe(1); core._free(pointer);
        recorder.select(id);
        for (let frame = 0; frame < 180; frame++) {
          core._gba_run_frame(); recorder.frame();
          if (!witness) for (let address = 0x02000000; address < 0x02040000 - 32; address += 4) if (word(address) === 0x41555043 && word(address + 4) === 0x50434d31) { witness = address; break; }
          const pcm = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), core._gba_audio_sample_count() * 2);
          for (const value of pcm) peak = Math.max(peak, Math.abs(value));
          for (let i = 0; i < pcm.length; i += 2) if (pcm[i] !== pcm[i + 1]) stereoDifferences++;
          if (!witness) continue;
          expect(word(witness + 24)).toBe(1); expect(word(witness + 20)).toBe(0);
          voices = Math.max(voices, word(witness + 16));
          const row = word(witness + 8) % ((built.rowFrames ?? 1) * 2);
          if (id === "song" && row > (built.rowFrames ?? 1) + 2 && !word(witness + 16)) rested = true;
          if (frame % 8 === 0) snapshots.push({ videoFrame: frame, engineFrame: word(witness + 8), voices: word(witness + 16), underruns: word(witness + 20) });
          if (word(witness + 28)) { ended = true; break; }
        }
        const wav = recorder.stop();
        await writeFile(path.join(output, `attempt-${id}.json`), JSON.stringify({ id, ...built, witness, peak, voices, rested, ended, stereoDifferences, snapshots }, null, 2));
        expect(witness).toBeGreaterThan(0); expect(peak).toBeGreaterThan(100);
        if (id === "song") { expect(voices).toBe(16); expect(rested).toBe(true); expect(stereoDifferences).toBeGreaterThan(0); } else expect(ended).toBe(true);
        cases.push({ id, ...built, wav, peak, voices, rested, ended, stereoDifferences, sha256: createHash("sha256").update(rom).digest("hex"), snapshots });
      } finally { core._gba_destroy(); }
    }
    await writeFile(path.join(output, "native-proof.json"), JSON.stringify({ passed: true, cases }, null, 2));
  }, 180000);
});
