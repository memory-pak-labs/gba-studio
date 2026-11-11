import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBlankProjectData } from "../shared/newProject.js";
import { createAudioItemInProject } from "../shared/audioWorkspace.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";
import { buildAudioPreviewRom } from "./engineAudioPreview.js";

const output = process.env.GBA_MIXING_RATE_ROM_QA;
describe.skipIf(!output)("configured mixer rate in exported and preview ROMs", () => {
  it("links project configuration and auditions all supported rates through the real engine", async () => {
    const root = path.resolve(output!); await mkdir(root, { recursive: true });
    const pack = path.resolve(process.env.GBA_TRACKER_ENGINE_PACK ?? "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const data = createAudioItemInProject(createBlankProjectData({ name: "Mixagem", includeStarterContent: false }), { id: "song", name: "Tema", kind: "Musica", synthesis: "PCM" });
    (data.audioItems as any[])[0].patterns[0].channels[0].notes = Array(64).fill("C4");
    (data.settings as any).audio.mixingRate = 21024;
    const projectPath = path.join(root, "mix.gba-project"); await writeFile(projectPath, JSON.stringify(data));
    const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
    const wasm = new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
    const evidence: unknown[] = [], directories: string[] = [];
    const replay = async (romPath: string, rate: number, preview: boolean) => {
      const symbols = execFileSync(path.join(process.env.DEVKITARM ?? "/opt/devkitpro/devkitARM", "bin/arm-none-eabi-nm"), ["-C", romPath.replace(/\.gba$/, ".elf")], { encoding: "utf8" });
      const address = (name: string) => parseInt(symbols.split("\n").find(line => line.endsWith(`::${name}`))!.split(" ")[0], 16);
      const core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
      try {
        expect(core._gba_init()).toBe(1); const rom = await readFile(romPath), pointer = core._malloc(rom.length);
        core.HEAPU8.set(rom, pointer); expect(core._gba_load_rom(pointer, rom.length)).toBe(1); core._free(pointer);
        const read32 = (at: number) => (core._gba_audio_register(at) | core._gba_audio_register(at + 2) << 16) >>> 0;
        for (let i = 0; i < 120; ++i) core._gba_run_frame();
        expect(read32(address("pcm_mix_rate_hz"))).toBe(rate);
        expect(core._gba_audio_register(address("pcm_mix_sample_count"))).toBe(rate / 10512 * 176);
        if (preview) expect(read32(address("pcm_submitted_blocks"))).toBeGreaterThan(60);
        evidence.push({ preview, rate, romBytes: rom.length, passed: true });
      } finally { core._gba_destroy(); }
    };
    try {
      const destination = path.join(root, "export"); directories.push(destination);
      const prepared = prepareEngineProjectExport(data, { enginePackPath: pack });
      expect(prepared.error).toBeUndefined(); expect(prepared.generated).toBeDefined();
      await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, destination, assetcPath: path.join(pack, "tools/assetc"), cacheEnabled: false });
      expect(await readFile(path.join(destination, "audio_config.cpp"), "utf8")).toContain("return 21024;");
      const build = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: path.join(pack, "tools/gbsbuild"), projectDir: destination });
      expect(build.exitCode, build.stderr).toBe(0);
      await replay(path.join(destination, `build/${prepared.generated!.target}.gba`), 21024, false);
      for (const rate of [10512, 21024, 31536]) {
        (data.settings as any).audio.mixingRate = rate;
        const preview = await buildAudioPreviewRom({ data, projectPath, audioID: "song", requestID: `mix-${rate}`, scope: "sequence" }, { enginePackPath: pack, assetcPath: path.join(pack, "tools/assetc"), gbsbuildPath: path.join(pack, "tools/gbsbuild"), webPlayerRoot: path.resolve("static/WebPlayer"), tempRoot: root });
        directories.push(preview.directory); await replay(preview.romPath, rate, true);
      }
      expect(JSON.parse(await readFile(projectPath, "utf8")).settings.audio.mixingRate).toBe(21024);
    } finally {
      await writeFile(path.join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
      for (const directory of directories) await rm(directory, { recursive: true, force: true });
    }
  }, 180_000);
});
