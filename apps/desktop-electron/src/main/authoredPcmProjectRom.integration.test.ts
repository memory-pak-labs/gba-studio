import { describe, expect, it } from "vitest";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

// Opt-in proof against a project authored and saved through the rendered UI.
// Sources and build artifacts stay in the caller's disposable QA directory.
const source = process.env.GBA_AUDIO_PCM_UI_PROJECT;
const output = process.env.GBA_AUDIO_PCM_PROJECT_QA;
describe.skipIf(!source || !output)("PCM composer through normal game export", () => {
  it("plays the UI-authored song and both PCM effects in Porto Lúmen", async () => {
    const qa = path.resolve(output!); await mkdir(qa, { recursive: true });
    const original = await readFile(source!); const data = JSON.parse(original.toString());
    const authored = data.audioItems.filter((audio: any) => audio.synthesis === "PCM");
    const song = authored.find((audio: any) => audio.kind === "Musica");
    const synth = authored.find((audio: any) => audio.pcmSfx?.source === "synth");
    const sample = authored.find((audio: any) => audio.pcmSfx?.source === "sample");
    expect(song?.patterns[0].channels).toHaveLength(16); expect(synth).toBeDefined(); expect(sample).toBeDefined();
    const pack = path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    for (const scenes of [data.scenas, data.rooms]) for (const scene of scenes) if (scene.name === "porto_lumen") {
      scene.music = song.name; scene.eventBindings = { onInit: "qa_pcm_boot" };
    }
    data.events.push({ id: "qa_pcm_boot", name: "qa_pcm_boot", category: "Cena", sceneName: "porto_lumen", steps: [] });
    const boot = data.events.at(-1);
    const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
    const wasm = new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
    const { createNativeAudioRecorder } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("scripts/lib/native-audio-recorder.mjs")).href);
    const cases = [];
    const destination = path.join(qa, "export");
    for (const effects of [true, false]) {
      const name = effects ? "music-and-effects" : "music-only";
      boot.steps = effects ? [{ command: `play_music ${song.name}` }, { command: "wait 30" }, { command: `play_sfx ${synth.name}` }, { command: "wait 50" }, { command: `play_sfx ${sample.name}` }] : [{ command: `play_music ${song.name}` }, { command: "wait 150" }];
      const prepared = prepareEngineProjectExport(data, { enginePackPath: pack, developmentStartScene: { name: "porto_lumen" } });
      expect(prepared.error).toBeUndefined();
      const entry = prepared.generated!.contract.topdown_project!.rooms.find(room => room.name === "porto_lumen")!.on_enter!;
      expect(entry.some(command => command.op === "run_audio_routine")).toBe(true);
      if (effects) expect(entry.filter(command => command.op === "play_sfx")).toHaveLength(2);
      await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath: source!, destination, assetcPath: path.join(pack, "tools/assetc"), cacheEnabled: true });
      const result = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: path.join(pack, "tools/gbsbuild"), projectDir: destination });
      await writeFile(path.join(qa, `${name}-build.json`), JSON.stringify(result, null, 2)); expect(result.exitCode).toBe(0);
      const romPath = path.join(destination, `build/${prepared.generated!.target}.gba`);
      const rom = await readFile(romPath); await copyFile(romPath, path.join(qa, `${name}.gba`));
      const core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
      const recorder = createNativeAudioRecorder(core, qa); let peak = 0, audibleFrames = 0; const audioHash = createHash("sha256");
      try {
        expect(core._gba_init()).toBe(1); const pointer = core._malloc(rom.length); core.HEAPU8.set(rom, pointer); expect(core._gba_load_rom(pointer, rom.length)).toBe(1); core._free(pointer); recorder.select(name);
        for (let frame = 0; frame < 240; frame++) {
          core._gba_run_frame(); recorder.frame();
          const pcm = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), core._gba_audio_sample_count() * 2);
          let framePeak = 0; for (const value of pcm) framePeak = Math.max(framePeak, Math.abs(value));
          peak = Math.max(peak, framePeak); if (framePeak > 100) audibleFrames++;
          audioHash.update(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
        }
        const wav = recorder.stop(); expect(peak).toBeGreaterThan(1000); expect(audibleFrames).toBeGreaterThan(30);
        cases.push({ name, romBytes: rom.length, sha256: createHash("sha256").update(rom).digest("hex"), audioSha256: audioHash.digest("hex"), peak, audibleFrames, wav });
      } finally { core._gba_destroy(); }
    }
    expect(cases[0].audioSha256).not.toBe(cases[1].audioSha256);
    expect(await readFile(source!)).toEqual(original);
    await writeFile(path.join(qa, "normal-rom-proof.json"), JSON.stringify({ passed: true, scene: "porto_lumen", source, cases }, null, 2));
  }, 1_800_000);
});
