import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseTrackerModule } from "../shared/trackerModule.js";
import { editTrackerModuleInProject } from "../shared/trackerModuleEditing.js";
import { buildAudioPreviewRom, type AudioPreviewBuild } from "./engineAudioPreview.js";
import { prepareEngineProjectExport, resolveAudioPlayback } from "./exportEngineProject.js";
import { buildAssetcAudioPackGeneration } from "../shared/engineProjectExport.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

// Opt-in: real UI-saved copies, actual ARM builds and the bundled mGBA core.
// Build products stay in the caller's bounded TMPDIR; only measurements survive.
const snapshot = process.env.GBA_TRACKER_UI_SNAPSHOT;
const proofOutput = process.env.GBA_TRACKER_ROM_PROOF;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
describe.skipIf(!snapshot || !proofOutput)("native module editing ARM proof", () => {
  it("preserves native source playback and exports the saved edits in Porto Lúmen", async () => {
    const output = path.resolve(proofOutput!); await mkdir(output, { recursive: true });
    const root = await mkdtemp(path.join(os.tmpdir(), "tracker-rom-proof-"));
    try {
    const template = path.resolve("default-assets/templates/exemplo-gba");
    await cp(path.join(template, "Assets"), path.join(root, "Assets"), { recursive: true });
    await cp(path.join(path.dirname(snapshot!), "qa_native_source.s3m"), path.join(root, "Assets/audio/qa_native_source.s3m"));
    const saved = await readFile(snapshot!); const data = JSON.parse(saved.toString());
    const projectPath = path.join(root, "edited.gba-project"); await writeFile(projectPath, saved);
    const pack = path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const options = { enginePackPath: pack, assetcPath: path.join(pack, "tools/assetc"), gbsbuildPath: path.join(pack, "tools/gbsbuild"), webPlayerRoot: path.resolve("static/WebPlayer"), tempRoot: root };
    const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
    const wasm = new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
    async function play(romPath: string, preview: boolean) {
      const rom = await readFile(romPath); const pcmHash = createHash("sha256"); let peak = 0, audibleFrames = 0, witness = 0, voices = 0;
      const core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
      const word = (address: number) => (core._gba_audio_register(address) | core._gba_audio_register(address + 2) << 16) >>> 0;
      try {
        expect(core._gba_init()).toBe(1); const pointer = core._malloc(rom.length); core.HEAPU8.set(rom, pointer); expect(core._gba_load_rom(pointer, rom.length)).toBe(1); core._free(pointer);
        for (let frame = 0; frame < (preview ? 120 : 240); frame++) {
          core._gba_run_frame();
          const pcm = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), core._gba_audio_sample_count() * 2);
          let framePeak = 0; for (const sample of pcm) framePeak = Math.max(framePeak, Math.abs(sample));
          peak = Math.max(peak, framePeak); if (framePeak > 100) audibleFrames++;
          pcmHash.update(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
          if (preview) {
            if (!witness) for (let address = 0x02000000; address < 0x02040000 - 32; address += 4) if (word(address) === 0x41555043 && word(address + 4) === 0x50434d31) { witness = address; break; }
            if (witness && word(witness + 24) !== 2) {
              expect(word(witness + 24)).toBe(1); expect(word(witness + 20)).toBe(0);
              voices = Math.max(voices, word(witness + 16));
            }
          }
        }
        expect(peak).toBeGreaterThan(100); expect(audibleFrames).toBeGreaterThan(20);
        if (preview) { expect(witness).toBeGreaterThan(0); expect(voices).toBeGreaterThan(0); }
        return { romSha256: hash(rom), pcmSha256: pcmHash.digest("hex"), peak, audibleFrames, voices, romBytes: rom.length };
      } finally { core._gba_destroy(); }
    }
    const cases = [];
      for (const format of ["MOD", "S3M"] as const) {
        const item = data.audioItems.find((item: any) => item.trackerModule?.format === format);
        expect(item).toBeDefined();
        const asset = data.assets.find((asset: any) => asset.id === item.sourceAssetID);
        const file = path.join(root, asset.metadata.source); const sourceBytes = await readFile(file);
        const native = parseTrackerModule(sourceBytes, format, hash(sourceBytes));
        const sourceID = format === "MOD" ? "qa-mod-original" : "qa-s3m-original";
        const sourcePlayback = await buildAudioPreviewRom({ requestID: sourceID, data, projectPath, audioID: sourceID, scope: "sequence" }, options);
        const original = await play(sourcePlayback.romPath, true); await rm(sourcePlayback.directory, { recursive: true });
        const unchangedData = { ...data, audioItems: data.audioItems.map((audio: any) => audio.id === item.id ? { ...audio, ...native } : audio) };
        let previous: AudioPreviewBuild | undefined;
        const previews = [];
        const secondEdit = editTrackerModuleInProject(data, item.id, { type: "cell", patternID: item.patterns[0].id, channelID: item.patterns[0].channels[0].id, row: 0, fields: { note: "G4", instrument: 1 } });
        for (const [name, current] of [["unchanged-copy", unchangedData], ["ui-edit", data], ["second-edit", secondEdit]] as const) {
          const request = { requestID: name, data: current, projectPath, audioID: item.id, scope: "sequence" as const };
          const built = await buildAudioPreviewRom(request, options, previous);
          if (previous) { expect(built.fingerprint).not.toBe(previous.fingerprint); await rm(previous.directory, { recursive: true }); }
          expect(await buildAudioPreviewRom(request, options, built)).toBe(built);
          const measured = await play(built.romPath, true); previews.push({ name, ...measured }); previous = built;
          await writeFile(path.join(output, `${format}-${name}.json`), JSON.stringify(measured));
        }
        if (previous) await rm(previous.directory, { recursive: true });
        expect(previews[0].pcmSha256).toBe(original.pcmSha256);
        expect(previews[1].pcmSha256).not.toBe(original.pcmSha256);
        expect(previews[2].pcmSha256).not.toBe(previews[1].pcmSha256);
        const game = structuredClone(data);
        for (const scenes of [game.scenas, game.rooms]) for (const scene of scenes) if (scene.name === "porto_lumen") { scene.music = item.name; scene.eventBindings = { onInit: "qa_native_module_boot" }; }
        game.events.push({ id: "qa_native_module_boot", name: "qa_native_module_boot", category: "Cena", roomName: "porto_lumen", steps: [{ command: `play_music ${JSON.stringify(item.name)}` }, { command: "wait 240" }] });
        const prepared = prepareEngineProjectExport(game, { enginePackPath: pack, developmentStartScene: { name: "porto_lumen" } });
        expect(prepared.error).toBeUndefined();
        const playback = resolveAudioPlayback(game.audioItems, buildAssetcAudioPackGeneration(game)!, item.name);
        expect(playback?.op).toBe("run_audio_routine");
        const entry = prepared.generated!.contract.topdown_project!.rooms.find(room => room.name === "porto_lumen")!.on_enter!;
        expect(entry).toContainEqual({ op: "run_audio_routine", index: playback!.index });
        const destination = path.join(root, "game-export");
        await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, destination, assetcPath: options.assetcPath, cacheEnabled: true });
        const result = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: options.gbsbuildPath, projectDir: destination });
        await writeFile(path.join(output, `${format}-game-build.json`), JSON.stringify(result)); expect(result.exitCode).toBe(0);
        const normalGame = await play(path.join(destination, `build/${prepared.generated!.target}.gba`), false);
        expect(hash(await readFile(file))).toBe(hash(sourceBytes));
        cases.push({ format, sourceSha256: hash(sourceBytes), original, previews, normalGame });
        await writeFile(path.join(output, "native-rom-proof.json"), JSON.stringify({ passed: cases.length === 2, scene: "porto_lumen", cases }, null, 2));
      }
      expect(cases[0].normalGame.pcmSha256).not.toBe(cases[1].normalGame.pcmSha256);
      expect(await readFile(snapshot!)).toEqual(saved);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 1_800_000);
});
