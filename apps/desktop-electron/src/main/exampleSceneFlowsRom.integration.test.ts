import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";
const output = process.env.GBA_EXAMPLE_SCENE_ROM_QA;
it.skipIf(!output)("exports the complete example with isolated QA navigation and the corrected native runtimes", async () => {
  const root = path.resolve(output!); await mkdir(root, { recursive: true });
  const work = await mkdtemp(path.join(root, "owned-build-"));
  const template = path.resolve("default-assets/templates/exemplo-gba");
  const source = await readFile(path.join(template, "exemplo-gba.gba-project"));
  const pack = path.join(work, "pack"), destination = path.join(work, "export");
  try {
    await cp(path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack"), pack, { recursive: true });
    const engine = path.resolve("../../packages/GBAStudioEngine");
    for (const [from, targets] of [
      ["build/gba/lib/libgbastudio_engine.a", ["lib/libgbastudio_engine.a"]],
      ["engine/include/gbs/platformer.hpp", ["include/gbs/platformer.hpp"]],
      ["templates/exported_menu/main.cpp", ["templates/exported_menu/main.cpp", "templates/exported_mixed/menu_runtime.inc"]],
      ["examples/platformer_basic/src/main.cpp", ["templates/platformer_basic/main.cpp", "templates/exported_platformer/main.cpp", "templates/exported_mixed/platformer_runtime.inc"]]
    ] as const) for (const to of targets) await cp(path.join(engine, from), path.join(pack, to));
    await symlink(path.join(template, "Assets"), path.join(work, "Assets"), "dir");
    const data = JSON.parse(source.toString());
    // Navigation is confined to this disposable copy. Every scene and authored
    // gameplay event comes from the complete canonical project.
    const targets = ["nome_jogador", "penedos_vento", "tempestade"];
    for (const key of ["rooms", "scenas"]) {
      const menu = data[key].find((room: any) => room.name === "menu_start");
      menu.runtime.config.items = [
        ...targets.map((name, index) => ({ id: `qa-${name}`, label: `QA ${name}`, action: "select", eventName: `qa-${name}`, enabled: true, clickBox: { x: 20, y: 30 + 14 * index, width: 112, height: 12 } })),
        ...menu.runtime.config.items
      ];
    }
    data.events.push(...targets.map(name => ({ id: `qa-${name}`, name: `qa-${name}`, roomName: "menu_start", category: "Cena", steps: [{ command: `change_scene ${name}` }] })));
    const projectPath = path.join(work, "qa.gba-project"); await writeFile(projectPath, JSON.stringify(data));
    const prepared = prepareEngineProjectExport(data, { enginePackPath: pack });
    expect(prepared.error).toBeUndefined(); expect(prepared.generated).toBeDefined();
    await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, destination, assetcPath: path.join(pack, "tools/assetc"), cacheEnabled: false });
    const built = await runGbsbuild({ enginePackPath: pack, gbsbuildPath: path.join(pack, "tools/gbsbuild"), projectDir: destination });
    await writeFile(path.join(root, "rom-build.log"), built.stdout + "\n" + built.stderr);
    expect(built.exitCode, built.stderr).toBe(0);
    const rom = path.join(destination, "build", `${prepared.generated!.target}.gba`);
    await cp(rom, path.join(root, "example-flows.gba"));
    await cp(rom.replace(/\.gba$/, ".elf"), path.join(root, "example-flows.elf"));
    await cp(path.join(destination, "export_project.json"), path.join(root, "export_project.json"));
    await writeFile(path.join(root, "build-evidence.json"), JSON.stringify({ templateSha256: createHash("sha256").update(source).digest("hex"), romSha256: createHash("sha256").update(await readFile(rom)).digest("hex"), romBytes: (await readFile(rom)).length, qaOnlyNavigation: targets }, null, 2));
  } finally {
    await rm(work, { recursive: true, force: true });
    expect(await readFile(path.join(template, "exemplo-gba.gba-project"))).toEqual(source);
  }
}, 600_000);
