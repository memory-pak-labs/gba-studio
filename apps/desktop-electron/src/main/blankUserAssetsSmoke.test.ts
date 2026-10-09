import path from "node:path";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createActorInProject, createRoomInProject, createTriggerInProject, removeRoomFromProject, updateRoomFieldsInProject } from "../shared/roomsWorkspace.js";
import { updateSpriteAnimationFieldsInProject } from "../shared/spritesWorkspace.js";
import { replaceAssetFileInProject, appendImportedAssetsToProject } from "../shared/filesWorkspace.js";
import { parseGBAProjectFile, summarizeGBAProject } from "../shared/projectFile.js";
import { deriveProjectHealthReport } from "../shared/projectHealth.js";
import { copyFilesIntoProjectAssets } from "./importAssets.js";
import { saveProjectFileAtomically, openProjectFile } from "./projectPersistence.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";
import catalog from "../../default-assets/templates/blank/player-defaults.json" with { type: "json" };

// Diagnostic patterns, never distributed artwork. Each frame has asymmetric,
// RGB555-exact stripes so direction, frame streaming and palette swaps are observable.
function png(width: number, height: number, pixel: (x: number, y: number) => number[]): Buffer {
  function chunk(type: string, data: Buffer) {
    const label = Buffer.from(type); let crc = 0xffffffff;
    for (const byte of Buffer.concat([label, data])) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const head = Buffer.alloc(4); head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([head, label, data, tail]);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (width * 4 + 1) + 1 + x * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const sizes: Record<string, [number, number, number]> = {
  topdown: [8, 8, 3], platformer: [24, 40, 15], fighter: [64, 64, 15],
  "isometric-adventure": [48, 48, 7], "isometric-tactical": [32, 64, 15],
  shmup: [24, 24, 15], "point-click": [16, 32, 5],
  "racing-topdown": [32, 16, 9], "racing-rear": [64, 32, 12], "shmup-explosion": [8, 16, 4]
};

describe.skipIf(!process.env.GBA_USER_ASSETS_QA_OUTPUT)("blank user asset native matrix", () => {
  it("imports original patterns, saves/reopens and compiles every supported scene", async () => {
    const output = path.resolve(process.env.GBA_USER_ASSETS_QA_OUTPUT!);
    const projectPath = path.join(output, "project", "user_assets_qa.gba-project");
    await mkdir(path.dirname(projectPath), { recursive: true });
    await mkdir(path.join(output, "sources"), { recursive: true });
    let data = buildProjectFromTemplate("blank", { name: "QA assets autorais" });
    for (const sceneType of ["platformer", "isometricAdventure", "isometricTactical", "shmup", "racing", "luta", "pointAndClick", "visualNovel", "cutscene", "battleRpg", "dungeonCrawler", "menu", "worldMap", "custom"]) {
      data = createRoomInProject(data, { id: sceneType, name: `qa_${sceneType}`, sceneType, width: 30, height: 20 });
    }
    data = createRoomInProject(data, { id: "racingPerspective", name: "qa_racingPerspective", sceneType: "racing", width: 30, height: 20 });
    data = updateRoomFieldsInProject(data, "racingPerspective", { runtime: { type: "racing", config: { presentation: "pseudo3d" } } });
    const evidence = [];
    for (const [index, player] of [...catalog.players, ...catalog.effects].entries()) {
      const [width, height, defaultColors] = sizes[player.family]!;
      const opaque = Boolean(process.env.GBA_USER_ASSETS_QA_OPAQUE) && player.family === "topdown";
      const colorMode = process.env.GBA_USER_ASSETS_QA_8BPP && player.family !== "shmup-explosion" ? "8bpp" : "4bpp";
      const colors = opaque ? 2 : colorMode === "8bpp" ? 24 : defaultColors;
      const frames = Math.max(...player.animations.flatMap(a => a.sourceFrameIndexes)) + 1;
      const name = `QA own ${player.family}.png`;
      const sourcePath = path.join(output, "sources", name);
      const palette = Array.from({ length: colors }, (_, c) => [((c * 5 + index * 3 + 2) % 30 + 1) * 8, ((c * 11 + index * 7 + 4) % 30 + 1) * 8, ((c * 7 + index * 13 + 6) % 30 + 1) * 8, 255]);
      const image = png(width * frames, height, (x, y) => {
        const localX = x % width, frame = Math.floor(x / width);
        if (!opaque && (localX === 0 || localX === width - 1 || y === 0 || y === height - 1)) return [0, 0, 0, 0];
        // A binary frame marker in every 8x8 block keeps frames distinguishable
        // even with only two visible colors and after native OBJ decomposition.
        if (y % 8 === 1 && localX % 8 >= 1 && localX % 8 <= 6) return palette[(frame >> (localX % 8 - 1)) & 1]!;
        return palette[(localX + y * 3 + frame * 2) % colors]!;
      });
      await writeFile(sourcePath, image);
      const imported = await copyFilesIntoProjectAssets(projectPath, [sourcePath], () => `qa-${player.family}`, { forcedKind: "Sprite" });
      imported[0]!.metadata = { frameWidth: width, frameHeight: height, width: width * frames, height, streamFrames: true, provenance: "Original deterministic QA pattern", license: "Project-owned" };
      data = replaceAssetFileInProject(data, `asset-neutral-${player.family}`, imported[0]!);
      // Replace all authored references, including scene-specific bindings, while
      // retaining the existing clip/state IDs and their semantic directions.
      data = JSON.parse(JSON.stringify(data).replaceAll(JSON.stringify(player.spriteSheet), JSON.stringify(name)));
      const record = (data.assets as Record<string, any>[]).find(a => a.id === `asset-neutral-${player.family}`)!;
      record.metadata = { ...imported[0]!.metadata, source: imported[0]!.relativePath };
      data.animations = (data.animations as Record<string, any>[]).map(a => a.spriteSheet !== name ? a : ({
        ...a, frameWidth: width, frameHeight: height, originX: 0, originY: 0,
        frames: a.frames.map((f: Record<string, any>) => ({ ...f, width, height, originX: 0, originY: 0, tiles: [{ x: 8 - Math.floor(width / 2), y: 0, sliceX: f.sourceFrameIndex * width, sliceY: 0, sourceSheet: name, tileWidth: width, tileHeight: height }] }))
      }));
      expect(await readFile(path.join(path.dirname(projectPath), imported[0]!.relativePath))).toEqual(image);
      if (colorMode === "8bpp") {
        const animation = (data.animations as Record<string, any>[]).find(a => a.spriteSheet === name)!;
        data = updateSpriteAnimationFieldsInProject(data, String(animation.id), { colorMode });
      }
      evidence.push({ family: player.family, sheet: name, width, height, colors, frames, palette, opaque, colorMode, sourceSha256: createHash("sha256").update(image).digest("hex") });
    }
    // Two independent actors deliberately use different frames from the same
    // streamed sheet. Comparing only against any source frame would miss aliasing.
    data = createActorInProject(data, {
      id: "qa-independent-npc", name: "IndependentNPC", roomID: String((data.rooms as Record<string, any>[])[0]!.id),
      x: 5, y: 10, spriteSheet: "QA own topdown.png", animationName: "walk_down"
    });
    if (process.env.GBA_USER_ASSETS_QA_PROPS) data = createActorInProject(data, {
      id: "qa-animated-prop", name: "AnimatedProp", roomID: "pointAndClick",
      x: 5, y: 10, spriteSheet: "QA own point-click.png", animationName: "click"
    });
    if (process.env.GBA_USER_ASSETS_QA_8BPP) {
      const name = "QA own mixed-four.png", width = 16, height = 16, frames = 1;
      const sourcePath = path.join(output, "sources", name);
      const palette = [[248, 192, 8, 255], [8, 24, 240, 255], [200, 24, 8, 255]];
      const image = png(width, height, (x, y) => x === 0 || y === 0 || x === 15 || y === 15 ? [0, 0, 0, 0] : palette[(x + y) % 3]!);
      await writeFile(sourcePath, image);
      const imported = await copyFilesIntoProjectAssets(projectPath, [sourcePath], () => "qa-mixed-four", { forcedKind: "Sprite" });
      imported[0]!.metadata = { frameWidth: width, frameHeight: height, width, height, streamFrames: true, provenance: "Original deterministic QA pattern" };
      data = appendImportedAssetsToProject(data, imported);
      const animation = (data.animations as Record<string, any>[]).find(a => a.spriteSheet === name)!;
      data = updateSpriteAnimationFieldsInProject(data, animation.id, { frameWidth: width, frameHeight: height });
      for (const room of (data.rooms as Record<string, any>[]).filter(r => ["topdown", "pointAndClick", "isometricAdventure", "isometricTactical"].includes(r.sceneType))) {
        data = createActorInProject(data, { id: `mixed-four-${room.id}`, name: "MixedFourNPC", roomID: room.id, x: 12, y: 11, spriteSheet: name, animationName: "idle_down" });
      }
      evidence.push({ family: "mixed-four", sheet: name, width, height, colors: 3, frames, palette, opaque: false, colorMode: "4bpp", sourceSha256: createHash("sha256").update(image).digest("hex") });
    }
    if (process.env.GBA_USER_ASSETS_QA_TRANSITIONS) {
      data.events = [
        { id: "qa-transition-topdown", name: "qa_transition_topdown", category: "Cena", steps: [{ command: "wait 90" }, { command: "change_scene qa_platformer 10 12" }] },
        { id: "qa-transition-platformer", name: "qa_transition_platformer", category: "Trigger", steps: [{ command: "change_scene qa_menu" }] }
      ];
      data = updateRoomFieldsInProject(data, String((data.rooms as Record<string, any>[])[0].id), { eventBindings: { onInit: "qa_transition_topdown" } });
      data = createTriggerInProject(data, { id: "qa-transition-door", name: "QATransitionDoor", roomID: "platformer", x: 14, y: 0, width: 2, height: 20, eventName: "qa_transition_platformer" });
      if (process.env.GBA_USER_ASSETS_QA_ENTRY_WAIT) {
        (data.events as Record<string, any>[])[1].steps = [{ command: "wait 90" }, { command: "change_scene qa_menu" }];
        data = updateRoomFieldsInProject(data, "platformer", { eventBindings: { onInit: "qa_transition_platformer" } });
      }
      data = parseGBAProjectFile(JSON.stringify(data)).data;
    }
    await saveProjectFileAtomically(projectPath, { data, summary: summarizeGBAProject(data) }, { appPath: process.cwd() });
    expect((await openProjectFile(projectPath)).project?.data).toEqual(data);
    await writeFile(path.join(output, "sources.json"), JSON.stringify(evidence, null, 2));
    const supported = removeRoomFromProject(data, "custom");
    const health = deriveProjectHealthReport(supported);
    await writeFile(path.join(output, "project-health.json"), JSON.stringify(health, null, 2));
    expect(health.diagnostics.filter(diagnostic => diagnostic.severity === "error")).toEqual([]);
    await saveProjectFileAtomically(path.join(path.dirname(projectPath), "user_assets_native_qa.gba-project"), {
      data: supported, summary: summarizeGBAProject(supported)
    }, { appPath: process.cwd() });
    const enginePackPath = path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    await mkdir(path.join(output, "roms"), { recursive: true });
    const manifest = [];
    for (const room of supported.rooms as Record<string, any>[]) {
      if (process.env.GBA_USER_ASSETS_QA_SCENE && room.sceneType !== process.env.GBA_USER_ASSETS_QA_SCENE) continue;
      const prepared = prepareEngineProjectExport(supported, { enginePackPath, developmentStartScene: { id: room.id } });
      expect(prepared.error, room.name).toBeUndefined();
      if (!process.env.GBA_USER_ASSETS_QA_BUILD) continue;
      const destination = path.join(output, "exports", room.id);
      try {
        await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, cacheEnabled: false, assetcPath: path.join(enginePackPath, "tools/assetc"), destination });
        const build = await runGbsbuild({ enginePackPath, gbsbuildPath: path.join(enginePackPath, "tools/gbsbuild"), projectDir: destination });
        await writeFile(path.join(destination, "qa-build.json"), JSON.stringify(build, null, 2));
        expect(build.exitCode, room.name).toBe(0);
        const rom = path.join(destination, "build", `${prepared.generated!.target}.gba`);
        const scene = room.name === "Cena 1" ? "cena_1" : room.name;
        await copyFile(rom, path.join(output, "roms", `${scene}.gba`));
        manifest.push({ scene, roomID: room.id, runtime: room.sceneType, authoredProp: Boolean(process.env.GBA_USER_ASSETS_QA_PROPS), mixedColorDepth: Boolean(process.env.GBA_USER_ASSETS_QA_8BPP), romSha256: createHash("sha256").update(await readFile(rom)).digest("hex") });
        await writeFile(path.join(output, "roms", "manifest.json"), JSON.stringify(manifest, null, 2));
      } catch (error) {
        await writeFile(path.join(output, "failure.json"), JSON.stringify({ room: room.name, error: String(error) }, null, 2));
        throw error;
      }
    }
  }, 1_800_000);
});
