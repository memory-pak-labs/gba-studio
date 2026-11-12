import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { GBAProjectData } from "../shared/projectFile.js";
import { createBlankProjectData } from "../shared/newProject.js";
import { parseTrackerModule, type TrackerModuleFormat } from "../shared/trackerModule.js";
import { prepareTrackerModuleForEditingInProject } from "../shared/trackerModuleEditing.js";
import { buildAudioPreviewRom } from "./engineAudioPreview.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

const output = process.env.GBA_INPLACE_TRACKER_ROM_QA;
const snapshot = process.env.GBA_INPLACE_TRACKER_UI_SNAPSHOT;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
describe.skipIf(!output || !snapshot)("editing imported music in place in ARM ROMs", () => {
  it("preserves unedited PCM and plays the saved UI edits through the existing item identity", async () => {
    const root = path.resolve(output!); await mkdir(root, { recursive: true });
    const work = await mkdtemp(path.join(root, "owned-builds-"));
    const pack = path.resolve(process.env.GBA_TRACKER_ENGINE_PACK ?? "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const saved = JSON.parse(await readFile(snapshot!, "utf8"));
    const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
    const wasm = new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
    const evidence: unknown[] = [];
    async function measure(romPath: string) {
      const core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
      const pcmHash = createHash("sha256"); let peak = 0;
      try {
        expect(core._gba_init()).toBe(1); const rom = await readFile(romPath), pointer = core._malloc(rom.length);
        core.HEAPU8.set(rom, pointer); expect(core._gba_load_rom(pointer, rom.length)).toBe(1); core._free(pointer);
        for (let frame = 0; frame < 150; ++frame) {
          core._gba_run_frame();
          const pcm = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), core._gba_audio_sample_count() * 2);
          for (const sample of pcm) peak = Math.max(peak, Math.abs(sample));
          pcmHash.update(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
        }
        expect(peak).toBeGreaterThan(100);
        return { pcmSha256: pcmHash.digest("hex"), romSha256: hash(rom), peak };
      } finally { core._gba_destroy(); }
    }
    try {
      for (const format of ["MOD", "S3M", "XM", "IT"] as TrackerModuleFormat[]) {
        const item = saved.audioItems.find((item: any) => item.id === `qa-${format}`);
        expect(item.trackerModule.projectOverlay).toBe(true);
        const bytes = await readFile(path.join(path.dirname(snapshot!), `qa-inplace.${format.toLowerCase()}`));
        const source = `source.${format.toLowerCase()}`; await writeFile(path.join(work, source), bytes);
        const song = parseTrackerModule(bytes, format, hash(bytes));
        let data = createBlankProjectData({ name: "In-place audio QA", includeStarterContent: false, sceneType: "cutscene" });
        data.audioItems = [{ id: item.id, name: item.name, kind: "Musica", sourceAssetID: item.sourceAssetID, exportID: item.exportID, volume: item.volume, loops: item.loops }];
        data.assets = [{ id: item.sourceAssetID, name: source, kind: "Audio", metadata: { source } }];
        const projectPath = path.join(work, "qa.gba-project"); await writeFile(projectPath, JSON.stringify(data));
        const prepared = prepareTrackerModuleForEditingInProject(data, item.id, song);
        const edited: GBAProjectData = { ...prepared, audioItems: [item] };
        const results = [];
        for (const current of [data, prepared, edited]) {
          const preview = await buildAudioPreviewRom({ requestID: `${format}-${results.length}`, data: current, projectPath, audioID: item.id, scope: "sequence" }, { enginePackPath: pack, assetcPath: path.join(pack, "tools/assetc"), gbsbuildPath: path.join(pack, "tools/gbsbuild"), webPlayerRoot: path.resolve("static/WebPlayer"), tempRoot: work });
          try { results.push(await measure(preview.romPath)); } finally { await rm(preview.directory, { recursive: true }); }
        }
        expect(results[1].pcmSha256).toBe(results[0].pcmSha256);
        expect(results[2].pcmSha256).not.toBe(results[0].pcmSha256);
        // Existing event references resolve the same item after saving and reopening.
        for (const key of ["rooms", "scenas"]) for (const room of edited[key] as Record<string, unknown>[]) room.eventBindings = { onInit: "qa_play" };
        edited.events = [{ id: "qa_play", name: "qa_play", category: "Cena", roomName: "cena_1", steps: [{ command: `play_music ${JSON.stringify(item.name)}` }, { command: "wait 600" }] }];
        const generated = prepareEngineProjectExport(edited, { enginePackPath: pack }); expect(generated.error).toBeUndefined();
        const destination = path.join(work, `game-${format}`);
        await writeEngineSchemaExport({ prepared: generated.generated!, projectPath, destination, assetcPath: path.join(pack, "tools/assetc"), cacheEnabled: false });
        const built = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: path.join(pack, "tools/gbsbuild"), projectDir: destination }); expect(built.exitCode, built.stderr).toBe(0);
        const game = await measure(path.join(destination, `build/${generated.generated!.target}.gba`));
        expect(hash(await readFile(path.join(work, source)))).toBe(hash(bytes));
        expect(item.name).toBe(`QA ${format}`); expect(item.id).toBe(`qa-${format}`);
        evidence.push({ format, id: item.id, original: results[0], opened: results[1], edited: results[2], game, sourceSha256: hash(bytes) });
        await rm(destination, { recursive: true });
      }
    } finally {
      await writeFile(path.join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
      await rm(work, { recursive: true, force: true });
    }
  }, 300_000);
});
