import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBlankProjectData } from "../shared/newProject.js";
import { makeXmFixture, makeItFixture } from "../shared/extendedTrackerFixtures.js";
import { parseTrackerModule, writeTrackerModule, type TrackerModuleSong } from "../shared/trackerModule.js";
import { createEditableTrackerCopyInProject, editTrackerModuleInProject, trackerModuleSong } from "../shared/trackerModuleEditing.js";
import { buildAudioPreviewRom } from "./engineAudioPreview.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
describe.skipIf(!process.env.GBA_EXTENDED_TRACKER_QA_OUTPUT)("XM/IT native PCM ROM proof", () => {
  it("plays sixteen native channels, exports edits, changes pitch, and preserves both sources", async () => {
    const output = path.resolve(process.env.GBA_EXTENDED_TRACKER_QA_OUTPUT!); await mkdir(output, { recursive: true });
    const temporary = await mkdtemp(path.join(output, "owned-builds-"));
    const pack = path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const options = { enginePackPath: pack, assetcPath: path.join(pack, "tools/assetc"), gbsbuildPath: path.join(pack, "tools/gbsbuild"), webPlayerRoot: path.resolve("static/WebPlayer"), tempRoot: temporary };
    const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
    const wasm = new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
    const { createNativeAudioRecorder } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("scripts/lib/native-audio-recorder.mjs")).href);
    const cases: Array<Record<string, unknown>> = [];
    async function replay(rom: Uint8Array, id: string, voicesExpected: number) {
      const core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
      const recorder = createNativeAudioRecorder(core, output); let peak = 0, voices = 0, witness = 0, ended = false; const pcmValues: number[] = [];
      const word = (address: number) => (core._gba_audio_register(address) | core._gba_audio_register(address + 2) << 16) >>> 0;
      try {
        expect(core._gba_init()).toBe(1); const pointer = core._malloc(rom.length); core.HEAPU8.set(rom, pointer); expect(core._gba_load_rom(pointer, rom.length)).toBe(1); core._free(pointer); recorder.select(id);
        for (let frame = 0; frame < 120; frame++) {
          core._gba_run_frame(); recorder.frame();
          if (!witness && voicesExpected) for (let address = 0x02000000; address < 0x02040000 - 32; address += 4) if (word(address) === 0x41555043 && word(address + 4) === 0x50434d31) { witness = address; break; }
          const pcm = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), core._gba_audio_sample_count() * 2);
          for (const value of pcm) peak = Math.max(peak, Math.abs(value));
          if (frame >= 8 && frame < 30) for (let i = 0; i < pcm.length; i += 2) pcmValues.push(pcm[i]);
          if (witness) { expect(word(witness + 20)).toBe(0); voices = Math.max(voices, word(witness + 16)); if (word(witness + 28)) { ended = true; break; } }
        }
        expect(peak).toBeGreaterThan(100);
        if (voicesExpected) { expect(witness).toBeGreaterThan(0); expect(voices).toBe(voicesExpected); expect(ended).toBe(true); }
        // Count positive crossings over the steady sine segment emitted by mGBA.
        let frequency = 0, power = 0;
        const signal = pcmValues.map((value, i) => value * (.5 - .5 * Math.cos(2 * Math.PI * i / (pcmValues.length - 1))));
        for (let candidate = 240; candidate <= 320; candidate += .25) {
          const coeff = 2 * Math.cos(2 * Math.PI * candidate / core._gba_audio_sample_rate()); let previous = 0, before = 0;
          for (const value of signal) { const next = value + coeff * previous - before; before = previous; previous = next; }
          const energy = previous * previous + before * before - coeff * previous * before;
          if (energy > power) { power = energy; frequency = candidate; }
        }
        const wav = recorder.stop(); return { id, romSha256: hash(rom), romBytes: rom.length, peak, voices, ended, frequency, wav };
      } finally { core._gba_destroy(); }
    }
    try {
      for (const format of ["XM", "IT"] as const) {
        const seed = format === "XM" ? makeXmFixture(16, 9) : makeItFixture(63, 9);
        let song = parseTrackerModule(seed, format, hash(seed));
        const channelCount = song.trackerModule.channelMap.length;
        for (let i = channelCount; i < 16; i++) {
          const physical = i - channelCount; song.trackerModule.channelMap.push(physical);
          song.patterns[0].channels.push({ id: `extra-${i}`, name: `Canal ${i + 1}`, type: "pcm", notes: Array(9).fill("---"), trackerCells: Array.from({ length: 9 }, () => ({ instrument: 0, effect: 0, parameter: 0 })) });
        }
        for (const channel of song.patterns[0].channels) {
          channel.notes.fill("---"); channel.trackerCells = Array.from({ length: 9 }, () => ({ instrument: 0, effect: 0, parameter: 0 }));
          channel.notes[0] = format === "XM" ? "C4" : "C5"; channel.trackerCells[0] = { instrument: 1, volume: format === "XM" ? 0x20 : 16, effect: 0, parameter: 0 };
          channel.notes[8] = "OFF";
        }
        const original = writeTrackerModule(seed, song); song = parseTrackerModule(original, format, hash(original));
        const source = `authored.${format.toLowerCase()}`, projectPath = path.join(output, `${format.toLowerCase()}.gba-project`);
        await writeFile(path.join(output, source), original);
        let base = createBlankProjectData({ name: `${format} PCM QA`, includeStarterContent: false, sceneType: "cutscene" });
        base.assets = [{ id: "module", name: source, kind: "Audio", metadata: { source } }];
        base.audioItems = [{ id: "original", name: `Tema ${format}`, kind: "Musica", sourceAssetID: "module", loops: false, volume: 100 }];
        let data = createEditableTrackerCopyInProject(base, "original", song, "copy");
        for (const phase of ["original", "edited"]) {
          if (phase === "edited") for (const channel of song.patterns[0].channels) data = editTrackerModuleInProject(data, "copy", { type: "cell", patternID: song.patterns[0].id, channelID: channel.id, row: 0, fields: { note: format === "XM" ? "D4" : "D5" } });
          await writeFile(projectPath, JSON.stringify(data, null, 2));
          const reopened = JSON.parse(await readFile(projectPath, "utf8"));
          expect(trackerModuleSong(reopened.audioItems[1]) as TrackerModuleSong).toMatchObject({ format });
          const built = await buildAudioPreviewRom({ requestID: `${format}-${phase}`, data: reopened, projectPath, audioID: phase === "original" ? "original" : "copy", scope: "sequence" }, options);
          try { cases.push(await replay(await readFile(built.romPath), `${format}-${phase}`, 16)); await writeFile(path.join(output, `${format}-${phase}-audio.hpp`), await readFile(path.join(built.directory, "audio.hpp"))); }
          finally { await rm(built.directory, { recursive: true, force: true }); }
        }
        const matching = cases.filter(c => String(c.id).startsWith(format));
        expect(Number(matching[0].frequency)).toBeGreaterThan(250); expect(Number(matching[0].frequency)).toBeLessThan(270);
        expect(Number(matching[1].frequency) / Number(matching[0].frequency)).toBeCloseTo(2 ** (2 / 12), 2);
        const game = structuredClone(data);
        for (const key of ["scenas", "rooms"]) for (const room of game[key] as Record<string, unknown>[]) room.eventBindings = { onInit: "qa_audio_boot" };
        game.events = [{ id: "qa_audio_boot", name: "qa_audio_boot", category: "Cena", roomName: "cena_1", steps: [{ command: `play_music "Tema ${format} (editável)"` }, { command: "wait 240" }] }];
        const prepared = prepareEngineProjectExport(game, { enginePackPath: pack }); expect(prepared.error).toBeUndefined(); expect(prepared.generated).toBeDefined();
        const destination = path.join(temporary, format); await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, destination, assetcPath: options.assetcPath });
        const built = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: options.gbsbuildPath, projectDir: destination }); expect(built.exitCode).toBe(0);
        cases.push(await replay(await readFile(path.join(destination, `build/${prepared.generated!.target}.gba`)), `${format}-game`, 0));
        expect(hash(await readFile(path.join(output, source)))).toBe(hash(original));
      }
      await writeFile(path.join(output, "native-result.json"), JSON.stringify({ passed: true, sourcesUnchanged: true, cases }, null, 2));
      const ui = createBlankProjectData({ name: "XM IT editor QA", includeStarterContent: false, sceneType: "cutscene" });
      ui.assets = []; ui.audioItems = [];
      for (const format of ["XM", "IT"] as const) {
        const source = `ui.${format.toLowerCase()}`, bytes = format === "XM" ? makeXmFixture(16, 96) : makeItFixture(63, 96);
        await writeFile(path.join(output, source), bytes);
        (ui.assets as any[]).push({ id: format, name: source, kind: "Audio", metadata: { source } });
        (ui.audioItems as any[]).push({ id: format, name: `Tema ${format}`, kind: "Musica", sourceAssetID: format, loops: false, volume: 100 });
      }
      await writeFile(path.join(output, "ui.gba-project"), JSON.stringify(ui, null, 2));
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }, 240000);
});
