import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBlankProjectData } from "../shared/newProject.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

const output = process.env.GBA_RUMBLE_ROM_QA;
describe.skipIf(!output)("cartridge profile in exported ROM", () => {
  it("installs the selected provider and removes it when re-exported as disabled", async () => {
    const root = path.resolve(output!); await mkdir(root, { recursive: true });
    const destination = path.join(root, "export");
    const pack = path.resolve(process.env.GBA_TRACKER_ENGINE_PACK ?? "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const data = createBlankProjectData({ name: "Rumble", includeStarterContent: false });
    const projectPath = path.join(root, "source.gba-project");
    await writeFile(projectPath, JSON.stringify(data));
    const original = await readFile(projectPath);
    const { default: create } = await import(/* @vite-ignore */ pathToFileURL(path.resolve("static/WebPlayer/player/mgba-core.mjs")).href);
    const wasm = new WebAssembly.Module(await readFile("static/WebPlayer/player/mgba-core.wasm"));
    const evidence: unknown[] = [];
    let ownedCache: string | undefined;
    try {
      for (const profile of ["none", "chisflash_v1_2", "none"]) {
        (data.settings as any).hardware.rumbleCartridge = profile;
        const prepared = prepareEngineProjectExport(data, { enginePackPath: pack });
        expect(prepared.error).toBeUndefined(); expect(prepared.generated).toBeDefined();
        await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, destination, assetcPath: path.join(pack, "tools/assetc"), cacheEnabled: false });
        const identity = createHash("sha256").update(JSON.stringify([await realpath(destination),path.resolve(destination,"build"),await realpath(pack)])).digest("hex");
        ownedCache = path.join(os.tmpdir(),"gbastudio-engine-build-cache",identity);
        const config = await readFile(path.join(destination, "rumble_config.cpp"), "utf8");
        expect(config.includes("ChisFlashV12")).toBe(profile !== "none");
        const build = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: path.join(pack, "tools/gbsbuild"), projectDir: destination });
        expect(build.exitCode, build.stderr).toBe(0);
        const romPath = path.join(destination, `build/${prepared.generated!.target}.gba`);
        const symbols = execFileSync(path.join(process.env.DEVKITARM ?? "/opt/devkitpro/devkitARM", "bin/arm-none-eabi-nm"), ["-C", romPath.replace(/\.gba$/, ".elf")], { encoding: "utf8" });
        const line = symbols.split("\n").find(line => line.endsWith("::s_rumble_available"));
        expect(line).toBeDefined();
        const address = parseInt(line!.split(" ")[0], 16);
        const hook = symbols.split("\n").find(line => line.endsWith(" gbs_project_configure_rumble"));
        expect(hook).toContain(" T ");
        const core = await create({ print() {}, printErr() {}, instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) { const instance = new WebAssembly.Instance(wasm, imports); done(instance); return instance.exports; } });
        try {
          expect(core._gba_init()).toBe(1);
          const rom = await readFile(romPath), pointer = core._malloc(rom.length);
          core.HEAPU8.set(rom, pointer); expect(core._gba_load_rom(pointer, rom.length)).toBe(1); core._free(pointer);
          for (let frame = 0; frame < 120; ++frame) core._gba_run_frame();
          const available = (core._gba_audio_register(address & ~1) >> ((address & 1) * 8)) & 255;
          expect(available).toBe(profile === "none" ? 0 : 1);
          evidence.push({ profile, romBytes: rom.length, available, passed: true });
        } finally { core._gba_destroy(); }
      }
      expect(await readFile(projectPath)).toEqual(original);
    } finally {
      await writeFile(path.join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
      await rm(destination, { recursive: true, force: true });
      if (ownedCache) await rm(ownedCache, { recursive: true, force: true });
    }
  }, 180_000);
});
