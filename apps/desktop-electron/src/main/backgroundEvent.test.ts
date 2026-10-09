import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import { buildAssetcTilesetPackGeneration } from "../shared/engineProjectExport.js";
import { createPreviewRuntime, runPreviewRuntimeEvent } from "../shared/previewRuntime.js";
import { deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace.js";
import { createBlankProjectData } from "../shared/newProject.js";
import type { GBAProjectData } from "../shared/projectFile.js";

function fixture(): GBAProjectData {
  const base = createBlankProjectData({ name: "Background Events", sceneType: "cutscene" });
  return {
    ...base, actors: [], animations: [], animationStates: [], spriteReferenceImages: [], dialogues: [], assetGroups: [],
    scenas: [{ id: "room-intro", name: "intro", sceneType: "cutscene", width: 30, height: 20, backgroundAssetName: "day.png",
      eventBindings: { onInit: "change" }, runtime: { type: "cutscene", config: { steps: [{ id: "frame", durationFrames: 60 }] } } }],
    assets: ["day.png", "night.png"].map(name => ({ id: name, name, kind: "Background", metadata: { source: `Assets/backgrounds/${name}`, width: 240, height: 160 } })),
    events: [{ id: "change", name: "change", category: "Cena", roomName: "intro", steps: [{ command: "set_background night.png" }] }],
    settings: { ...base.settings as Record<string, unknown>, general: { gameTitle: "Background Events", startScene: "intro", startSceneType: "cutscene", exportFolder: "build" }, save: { saveType: "sram", slots: 3, autoSave: false } }
  };
}

describe("troca de fundo por evento", () => {
  it.runIf(Boolean(process.env.GBA_STUDIO_BACKGROUND_EVENT_ROM_DIR))("compila a troca em uma ROM de cutscene", async () => {
    const root = path.resolve(process.env.GBA_STUDIO_BACKGROUND_EVENT_ROM_DIR!);
    const data = fixture();
    const scene = (data.scenas as Array<Record<string, unknown>>)[0];
    data.actors = [{ id: "witness", name: "Witness", roomName: "intro", x: 3, y: 3, spriteSheet: "witness.png" }];
    (data.assets as Array<Record<string, unknown>>).push({ id: "witness", name: "witness.png", kind: "Sprite", metadata: { source: "Assets/sprites/witness.png", width: 16, height: 16, frameWidth: 16, frameHeight: 16 } });
    scene.runtime = { type: "cutscene", config: { steps: [
      { id: "night", durationFrames: 0, autoAdvance: false },
      { id: "day", durationFrames: 0, autoAdvance: false, eventName: "restore" }
    ] } };
    (data.events as Array<Record<string, unknown>>).push({ id: "restore", name: "restore", category: "Cena", roomName: "intro", steps: [{ command: "set_background day.png" }] });
    await mkdir(path.join(root, "Assets/backgrounds"), { recursive: true });
    await mkdir(path.join(root, "Assets/sprites"), { recursive: true });
    // Synthetic solid-color fixtures make native framebuffer assertions exact.
    execFileSync("python3", ["-c", `import struct,zlib,sys
def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
for name,color,w,h in [('backgrounds/day',(248,0,0,255),240,160),('backgrounds/night',(0,0,248,255),240,160),('sprites/witness',(0,248,0,255),16,16)]:
 raw=(b'\\0'+bytes(color)*w)*h
 if name.startswith('sprites/'): raw=raw[:1]+bytes((0,0,0,0))+raw[5:]
 png=b'\\x89PNG\\r\\n\\x1a\\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
 open(sys.argv[1]+'/Assets/'+name+'.png','wb').write(png)
`, root]);
    const projectPath = path.join(root, "background_events.gba-project");
    await writeFile(projectPath, JSON.stringify({ schemaVersion: 1, data }));
    const enginePackPath = path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const prepared = prepareEngineProjectExport(data, { enginePackPath, enginePackVersion: "2.24.0" });
    expect(prepared.error).toBeUndefined();
    await writeEngineSchemaExport({ destination: path.join(root, "export"), assetcPath: path.join(enginePackPath, "tools/assetc"), prepared: prepared.generated!, projectPath, cacheEnabled: false });
    const build = await runGbsbuild({ enginePackPath, gbsbuildPath: path.join(enginePackPath, "tools/gbsbuild"), projectDir: path.join(root, "export") });
    expect(build, JSON.stringify(build)).toMatchObject({ exitCode: 0 });
  }, 120_000);
  it("retém o fundo usado somente pelo comando e remapeia o índice na cutscene", () => {
    const data = fixture();
    const pack = buildAssetcTilesetPackGeneration(data)!;
    expect(pack.assetsBySheet["night.png"]).toBeDefined();
    expect(pack.assetsBySheet["night.png"].bank_groups).toContain("scene_intro_background_night");
    const runtime = buildEngineExportProjectContract(data).cutscene_project!;
    expect(runtime.backgrounds?.map(bg => bg.name)).toEqual(["day", "night"]);
    expect(runtime.scenes[0].on_enter).toContainEqual({ op: "set_background", index: 1 });
    expect(runtime.assets?.tile_assets).toContain("night");
  });
  it("rejeita imagens inexistentes na exportação", () => {
    const data = fixture(); data.assets = (data.assets as Record<string, unknown>[]).filter(asset => asset.name !== "night.png");
    expect(() => buildEngineExportProjectContract(data)).toThrow(/fundo.*night.png/i);
  });
  it("remapeia índices quando o pack também contém fundos de outro runtime", () => {
    const data = fixture();
    (data.scenas as Array<Record<string, unknown>>).unshift({ id: "outside", name: "outside", sceneType: "topdown", width: 30, height: 20, backgroundAssetName: "outside.png" });
    (data.assets as Array<Record<string, unknown>>).unshift({ id: "outside", name: "outside.png", kind: "Background", metadata: { source: "Assets/backgrounds/outside.png", width: 240, height: 160 } });
    const runtime = buildEngineExportProjectContract(data).cutscene_project!;
    expect(runtime.backgrounds?.map(bg => bg.name)).toEqual(["day", "night"]);
    expect(runtime.scenes[0].on_enter).toContainEqual({ op: "set_background", index: 1 });
    expect(runtime.scripts?.flatMap(script => script.script)).toContainEqual({ op: "set_background", index: 1 });
  });
  it("preserva nomes de arquivos com espaços no seletor, export e Preview", () => {
    const data = fixture();
    const asset = (data.assets as Array<Record<string, unknown>>)[1];
    asset.name = "night scene.png";
    const event = (data.events as Array<Record<string, unknown>>)[0];
    event.steps = [{ command: "set_background night scene.png" }];
    expect(buildEngineExportProjectContract(data).cutscene_project?.scenes[0].on_enter)
      .toContainEqual({ op: "set_background", index: 1 });
    expect(runPreviewRuntimeEvent(createPreviewRuntime(data), "change").currentRoom?.backgroundAssetName).toBe("night scene.png");
    const step = deriveEventsWorkspacePresentation(data).groups.flatMap(group => group.events)[0].steps[0];
    expect(step.commandParameters).toHaveLength(1);
    expect(step.commandParameters[0].value).toBe("night scene.png");
  });
  it("troca somente a apresentação no Preview, preservando cena e colisões", () => {
    const initial = createPreviewRuntime(fixture());
    const next = runPreviewRuntimeEvent(initial, "change");
    expect(next.currentRoom?.name).toBe("intro");
    expect(next.currentRoom?.backgroundAssetName).toBe("night.png");
    expect(next.currentRoom?.collisionCells).toEqual(initial.currentRoom?.collisionCells);
    expect(next.project).toBe(initial.project);
  });
  it("oferece seleção de Background no bloco", () => {
    const step = deriveEventsWorkspacePresentation(fixture()).groups.flatMap(group => group.events)[0].steps[0];
    expect(step.commandParameters[0]).toMatchObject({ kind: "background", options: ["day.png", "night.png"] });
  });
});
