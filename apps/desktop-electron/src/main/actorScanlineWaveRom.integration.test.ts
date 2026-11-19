import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defaultSceneComposition } from "../shared/sceneComposition.js";
import { normalizeSceneRasterEffects } from "../shared/sceneRasterEffects.js";
import { nativeEventFixture } from "./nativeEventTestFixture.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

const output = process.env.GBA_ACTOR_SCANLINE_ROM_QA;
describe.skipIf(!output)("actor scanline wave through export and ARM rendering", () => {
  it.each(["topdown", "platformer"])("deforms only the targeted actor and clears its OAM state in %s", async runtime => {
    const root = path.resolve(output!);
    await mkdir(root, { recursive: true });
    const work = await mkdtemp(path.join(root, runtime + "-wave-"));
    const data = nativeEventFixture([
      "actor_scanline_wave Target 600 100", "wait 52", "actor_scanline_wave Target 1 0",
      "wait 44", "actor_scanline_wave Target 600 100", "wait 44", "change_scene plain"
    ]);
    data.scenas = [
      { name: "start", sceneType: runtime, width: 30, height: 20, playerActorName: "Hero", eventBindings: { onInit: "boot" } },
      { name: "plain", sceneType: runtime, width: 30, height: 20, playerActorName: "Hero" }
    ];
    if (runtime === "topdown") {
      const composition = defaultSceneComposition();
      composition.enabled = true;
      composition.effects.raster = normalizeSceneRasterEffects({
        gradient: { enabled: true, from: "#000000", to: "#102040" }
      });
      (data.scenas as Record<string, unknown>[])[0].runtime = { type: "topdown", config: { composition } };
    }
    (data.settings as { general: Record<string, unknown> }).general.startSceneType = runtime;
    data.actors = ["start", "plain"].flatMap(roomName => [
      { id: roomName + "-hero", name: "Hero", roomName, x: 5, y: 7, spriteSheet: "blue.png" },
      { id: roomName + "-target", name: "Target", roomName, x: 13, y: 8, spriteSheet: "red.png" },
      { id: roomName + "-guide", name: "Guide", roomName, x: 20, y: 8, spriteSheet: "green.png" }
    ]);
    const colors = { red: 0, green: 1, blue: 2 } as const;
    data.assets = Object.keys(colors).map(color => ({ id: color, name: color + ".png", kind: "Sprite", metadata: { source: "Assets/" + color + ".png" } }));
    data.animations = Object.keys(colors).map(color => ({
      id: color + "-idle", name: "idle", state: "idle", direction: "down", spriteSheet: color + ".png", frameWidth: color === "red" ? 48 : 16, frameHeight: 16, frameCount: 1, fps: 4
    }));
    const { encodePngRgba } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("scripts/lib/png-icons.mjs")).href);
    await mkdir(path.join(work, "Assets"));
    for (const [color, channel] of Object.entries(colors)) {
      const width = color === "red" ? 48 : 16;
      const pixels = new Uint8Array(width * 16 * 4);
      for (let i = 0; i < pixels.length; i += 4) { pixels[i + channel] = 255; pixels[i + 3] = 255; }
      await writeFile(path.join(work, "Assets", color + ".png"), encodePngRgba({ width, height: 16, pixels }));
    }
    const projectPath = path.join(work, "wave.gba-project");
    await writeFile(projectPath, JSON.stringify(data));
    const pack = path.resolve(process.env.GBA_TRACKER_ENGINE_PACK ?? "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const prepared = prepareEngineProjectExport(data, { enginePackPath: pack });
    expect(prepared.error).toBeUndefined();
    expect(prepared.generated!.contract.requires.features).toContain("render_runtime.actor_scanline_wave");
    const destination = path.join(work, "export");
    await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, destination, assetcPath: path.join(pack, "tools/assetc"), cacheEnabled: false });
    const build = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: path.join(pack, "tools/gbsbuild"), projectDir: destination });
    expect(build.exitCode, build.stderr).toBe(0);
    const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
    const { readRuntimeTelemetry } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-direct-player.mjs")).href);
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
      const capture = async (number: number) => {
        const pointer = core._gba_framebuffer();
        const pixels = core.HEAPU8.slice(pointer, pointer + 240 * 160 * 4);
        const edges = [[], []] as [number[], number[]];
        const targetPixelCounts: number[] = [];
        for (let y = 0; y < 160; ++y) {
          const left = [-1, -1];
          let targetPixels = 0;
          for (let x = 0; x < 240; ++x) {
            const pixel = (y * 240 + x) * 4;
            if (pixels[pixel] > 200 && pixels[pixel + 1] < 10 && pixels[pixel + 2] < 10) {
              if (left[0] < 0) left[0] = x;
              ++targetPixels;
            }
            if (pixels[pixel + 1] > 200 && pixels[pixel] < 10 && pixels[pixel + 2] < 10 && left[1] < 0) left[1] = x;
            pixels[pixel + 3] = 255;
          }
          if (targetPixels) targetPixelCounts.push(targetPixels);
          left.forEach((x, c) => { if (x >= 0) edges[c].push(x); });
        }
        await writeFile(path.join(work, `frame-${number}.png`), encodePngRgba({ width: 240, height: 160, pixels }));
        return { number, room: readRuntimeTelemetry(core)?.currentRoom, hblankOam: !!(core._gba_audio_register(0x04000000) & 32),
          backdropBlue: pixels[(159 * 240 + 1) * 4 + 2],
          widths: edges.map(rows => new Set(rows).size), rows: edges.map(rows => rows.length), edges, targetPixelCounts };
      };
      const frames = [];
      for (let i = 1; i <= 205; ++i) {
        core._gba_run_frame();
        if ([25, 32, 78, 121, 205].includes(i)) frames.push(await capture(i));
      }
      await writeFile(path.join(work, "evidence.json"), JSON.stringify(frames, null, 2));
      expect(frames.map(frame => frame.hblankOam)).toEqual([true, true, false, true, false]);
      expect(frames.every(frame => frame.rows.every(rows => rows === 16))).toBe(true);
      expect(frames.every(frame => frame.targetPixelCounts.every(count => count === 48))).toBe(true);
      expect(frames.map(frame => frame.widths[1])).toEqual([1, 1, 1, 1, 1]);
      expect(frames[0].widths[0]).toBeGreaterThan(4);
      expect(frames[1].edges[0]).not.toEqual(frames[0].edges[0]);
      expect(frames[2].widths[0]).toBe(1);
      expect(frames[3].widths[0]).toBeGreaterThan(4);
      expect(frames[4].room).not.toBe(frames[0].room);
      expect(frames[4].widths[0]).toBe(1);
      if (runtime === "topdown") {
        // The scene gradient remains enabled while the actor effect is off and on.
        expect(frames.slice(0, 4).map(frame => frame.backdropBlue)).toEqual([66, 66, 66, 66]);
        expect(frames[4].backdropBlue).not.toBe(66);
      }
    } finally {
      core._gba_destroy();
    }
  }, 120_000);
});
