import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

const output = process.env.GBA_RACING_CAMERA_ROM_QA;
const music = process.env.GBA_RACING_CAMERA_AUDIO_SOURCE;
describe.skipIf(!output || !music)("rear-view car anchor during actual steering", () => {
  it("keeps the presented player anchor steady while turning with sixteen PCM voices", async () => {
    const root = path.resolve(output!); await mkdir(root, { recursive: true });
    const work = await mkdtemp(path.join(root, "owned-build-"));
    const template = path.resolve("default-assets/templates/exemplo-gba");
    const source = await readFile(path.join(template, "exemplo-gba.gba-project"));
    const pack = path.resolve(process.env.GBA_TRACKER_ENGINE_PACK ?? "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const evidence: Record<string, unknown> = { passed: false };
    try {
      expect(await readFile(path.join(pack, "templates/exported_mixed/racing_runtime.inc")))
        .toEqual(await readFile(path.join(pack, "templates/exported_racing/main.cpp")));
      await symlink(path.join(template, "Assets"), path.join(work, "Assets"), "dir");
      const musicBytes = await readFile(music!); await writeFile(path.join(work, "stress.xm"), musicBytes);
      const data = JSON.parse(source.toString()); const scene = "circuito_perspectiva";
      const room = data.scenas.find((room: any) => room.name === scene); expect(room).toBeDefined();
      const originalInit = room.eventBindings?.onInit;
      data.assets.push({ id: "qa_racing_music_asset", name: "stress.xm", kind: "Audio", metadata: { source: "stress.xm" } });
      data.audioItems.push({ id: "qa_racing_music", name: "qa_racing_music", kind: "Musica", sourceAssetID: "qa_racing_music_asset", volume: 100, loops: true });
      for (const key of ["rooms", "scenas"]) for (const current of data[key]) if (current.name === scene) current.eventBindings = { ...current.eventBindings, onInit: "qa_racing_boot" };
      data.events.push({ id: "qa_racing_boot", name: "qa_racing_boot", category: "Cena", roomName: scene, steps: [
        ...(originalInit ? [{ command: `call_event ${originalInit}` }] : []), { command: "play_music qa_racing_music" }
      ] });
      const projectPath = path.join(work, "qa.gba-project"); await writeFile(projectPath, JSON.stringify(data));
      const generated = prepareEngineProjectExport(data, { enginePackPath: pack, developmentStartScene: { name: scene } });
      expect(generated.error).toBeUndefined(); expect(generated.generated).toBeDefined();
      const destination = path.join(work, "export");
      await writeEngineSchemaExport({ prepared: generated.generated!, projectPath, destination, assetcPath: path.join(pack, "tools/assetc"), cacheEnabled: true });
      const built = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: path.join(pack, "tools/gbsbuild"), projectDir: destination });
      expect(built.exitCode, built.stderr).toBe(0);
      const rom = await readFile(path.join(destination, `build/${generated.generated!.target}.gba`));
      await writeFile(path.join(root, "last-test.gba"), rom);
      const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
      const { readRuntimeTelemetry } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-direct-player.mjs")).href);
      const { encodePngRgba } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("scripts/lib/png-icons.mjs")).href);
      const wasm = new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
      const core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
      try {
        expect(core._gba_init()).toBe(1); const pointer = core._malloc(rom.length); core.HEAPU8.set(rom, pointer);
        expect(core._gba_load_rom(pointer, rom.length)).toBe(1); core._free(pointer);
        // The canonical race has a blocking authored countdown before gameplay.
        // Observe its completion, rather than counting initialization as game cadence.
        const warmup = []; let ready = false;
        for (let frame = 0; frame < 1800; ++frame) {
          core._gba_run_frame();
          if (frame % 60 !== 59) continue;
          const telemetry = readRuntimeTelemetry(core); warmup.push({ videoFrames: frame + 1, telemetry });
          if (telemetry?.frame >= 10 && telemetry.audio?.activeVoiceCount === 16) { ready = true; break; }
        }
        evidence.warmup = warmup;
        expect(ready, "canonical countdown completes and all sixteen music voices start").toBe(true);
        // A stationary camera must keep the floor in the same place even when
        // the mixer occupies VBlank. This region excludes HUD and cars.
        const floorWaterPixels: number[] = [];
        const stationaryPlayer = readRuntimeTelemetry(core).player;
        core._gba_set_keys(0);
        for (let frame = 0; frame < 36; ++frame) {
          core._gba_run_frame();
          const telemetry = readRuntimeTelemetry(core);
          expect(telemetry.player).toEqual(stationaryPlayer);
          const pixels = core.HEAPU8.subarray(core._gba_framebuffer(), core._gba_framebuffer() + 240 * 160 * 4);
          let water = 0;
          for (let y = 65; y < 115; ++y) for (let x = 200; x < 232; ++x) {
            const index = (y * 240 + x) * 4;
            if (pixels[index] === 0 && pixels[index + 1] === 90 && pixels[index + 2] === 214) ++water;
          }
          floorWaterPixels.push(water);
        }
        evidence.stationaryFloorWaterPixels = floorWaterPixels;
        expect(new Set(floorWaterPixels).size, "stationary floor does not jump between scanlines").toBe(1);
        // Drive straight into the canonical circuit wall, then hold B to
        // escape. Restore the emulator afterwards so steering tests retain
        // their original starting conditions.
        const savedSize = core._gba_state_size();
        const savedPointer = core._malloc(savedSize);
        expect(savedPointer).toBeGreaterThan(0);
        try {
          expect(core._gba_save_state(savedPointer, savedSize)).toBe(1);
          const start = readRuntimeTelemetry(core);
          core._gba_set_keys(1); // A: accelerate
          let lastX = start.player.x, stableSamples = 0, wall: any = null;
          for (let frame = 0; frame < 900; ++frame) {
            core._gba_run_frame();
            if (frame % 15 !== 14) continue;
            const current = readRuntimeTelemetry(core);
            stableSamples = current.player.x === lastX ? stableSamples + 1 : 0;
            lastX = current.player.x;
            if (current.player.x > start.player.x + 24 && stableSamples >= 5) { wall = current; break; }
          }
          expect(wall, "car reaches and stops at the circuit wall").not.toBeNull();
          core._gba_set_keys(2); // B: brake, then reverse
          for (let frame = 0; frame < 120; ++frame) core._gba_run_frame();
          const reversed = readRuntimeTelemetry(core);
          evidence.reverseFromWall = { start: start.player, wall: wall.player, after: reversed.player,
            voices: reversed.audio.activeVoiceCount, underruns: reversed.audio.pcmUnderrunCount };
          const framebuffer = core._gba_framebuffer();
          const reversePixels = core.HEAPU8.slice(framebuffer, framebuffer + 240 * 160 * 4);
          await writeFile(path.join(root, "reverse-from-wall.png"), encodePngRgba({ width: 240, height: 160, pixels: reversePixels }));
          expect(reversed.player.x, "holding B backs away from the wall").toBeLessThan(wall.player.x - 4);
          expect(reversed.audio.activeVoiceCount).toBe(16);
          expect(reversed.audio.pcmUnderrunCount).toBe(0);
          // At this track's reverse speed the hundreds digit is 0. A negative
          // speed cast to unsigned produced 999 KMH; this pixel separates 0 from 9.
          const hundredsPixel = (149 * 240 + 180) * 4;
          expect([...reversePixels.slice(hundredsPixel, hundredsPixel + 3)], "reverse speed HUD does not wrap to 999")
            .toEqual([247, 231, 189]);
        } finally {
          expect(core._gba_load_state(savedPointer, savedSize)).toBe(1);
          core._free(savedPointer);
          core._gba_set_keys(0);
        }
        const windows: Record<string, unknown>[] = []; evidence.windows = windows;
        const yValues = new Set<number>(), headings = new Set<number>();
        let minVoices = 99, maxUnderruns = 0;
        for (const [name, keys] of [["right", 17], ["left", 33], ["right-again", 17]] as const) {
          core._gba_set_keys(keys); const start = readRuntimeTelemetry(core); expect(start).not.toBeNull();
          const samples = [];
          for (let frame = 0; frame < 360; ++frame) {
            core._gba_run_frame(); const telemetry = readRuntimeTelemetry(core); expect(telemetry).not.toBeNull();
            minVoices = Math.min(minVoices, telemetry.audio.activeVoiceCount); maxUnderruns = Math.max(maxUnderruns, telemetry.audio.pcmUnderrunCount);
            const attr0 = core._gba_audio_register(0x07000000), attr1 = core._gba_audio_register(0x07000002);
            expect(attr0 & 0x200, "player OAM remains visible").toBe(0);
            const y = attr0 & 255; yValues.add(y); headings.add(core._gba_audio_register(0x04000014) & 511);
            if (frame % 30 === 0) samples.push({ frame, y, x: attr1 & 511, worldX: telemetry.player.x, worldY: telemetry.player.y });
          }
          const framebuffer = core._gba_framebuffer();
          await writeFile(path.join(root, `${name}.png`), encodePngRgba({ width: 240, height: 160, pixels: core.HEAPU8.slice(framebuffer, framebuffer + 240 * 160 * 4) }));
          const end = readRuntimeTelemetry(core), updates = end.frame - start.frame;
          windows.push({ name, updates, videoFrames: 360, samples });
          expect(end.currentRoom).toBe(start.currentRoom); expect(updates).toBeGreaterThanOrEqual(176);
        }
        Object.assign(evidence, { romSha256: createHash("sha256").update(rom).digest("hex"), windows, minVoices, maxUnderruns, playerOamY: [...yValues], headingScrollValues: headings.size });
        expect(minVoices).toBe(16); expect(maxUnderruns).toBe(0); expect(headings.size, "actual steering traverses multiple camera angles").toBeGreaterThan(32);
        expect(yValues.size, "turning must not make the car jump vertically").toBe(1);
        evidence.passed = true;
      } finally { core._gba_destroy(); }
      expect(await readFile(path.join(template, "exemplo-gba.gba-project"))).toEqual(source);
    } finally {
      await writeFile(path.join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
      await rm(work, { recursive: true, force: true });
    }
  }, 600_000);
});
