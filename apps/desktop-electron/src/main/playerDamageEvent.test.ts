import { describe, expect, it } from "vitest";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { createPreviewRuntime, dispatchPreviewRuntimeAction } from "../shared/previewRuntime.js";
import type { GBAProjectData } from "../shared/projectFile.js";
import { parseGBAProjectFile } from "../shared/projectFile.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

function project(sceneType: "battleRpg" | "shmup"): GBAProjectData {
  return {
    assets: [], assetGroups: [], animations: [], animationStates: [], spriteReferenceImages: [], audioItems: [],
    scenas: [{ name: "arena", sceneType, width: 30, height: 20, runtime: { type: sceneType, config: sceneType === "battleRpg" ? { maxPartySize: 1, maxEnemies: 1, turnDelayFrames: 1 } : {} }, eventBindings: { onHitPlayer: "hurt" } }],
    actors: [
      { id: "player", name: "Player", roomName: "arena", x: 3, y: 4, battle: { side: "party", maxHp: 40, attack: 12, defense: 5, speed: 5, abilities: ["attack"] } },
      { id: "enemy", name: "Enemy", roomName: "arena", x: 5, y: 4, battle: { side: "enemy", maxHp: 15, attack: 6, defense: 2, speed: 5, abilities: ["attack"] } }
    ],
    events: [{ id: "hurt", name: "hurt", category: "Cena", sceneName: "arena", steps: [
      { command: "rumble_on_for 12", isEnabled: true },
      { command: "add_variable damage_count 1", isEnabled: true }
    ] }],
    variables: [{ name: "damage_count", initialValue: 0 }],
    settings: {
      general: { gameTitle: "Damage", startScene: "arena", startSceneType: sceneType, exportFolder: "build" },
      build: { romFileName: "damage.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
      preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
      audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
      save: { saveType: "sram", slots: 3, autoSave: false },
      debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
    }
  };
}

describe("player damage scene events", () => {
  it.each(["battleRpg", "shmup"] as const)("exports a room damage hook for %s", sceneType => {
    const result = prepareEngineProjectExport(project(sceneType));
    expect(result.error).toBeUndefined();
    const contract = result.generated!.contract;
    const hooks = sceneType === "battleRpg" ? contract.battle_rpg_project!.encounters : contract.shmup_project!.waves;
    expect(hooks[0]!.on_hit_player).toEqual([
      { op: "rumble_on_for", frames: 12 }, { op: "add_variable", variable: 0, amount: 1 }
    ]);
    expect(contract.requires.features).toContain(`${sceneType === "battleRpg" ? "battle_rpg" : "shmup"}_runtime.player_damage_event`);
  });

  it("runs rumble exactly once after party HP decreases, without reacting to the player's attack", () => {
    const initial = createPreviewRuntime(project("battleRpg"));
    const attack = dispatchPreviewRuntimeAction(dispatchPreviewRuntimeAction(initial, "action"), "action");
    expect(attack.battleEnemyHp).toEqual([5]);
    expect(attack.variables.damage_count ?? 0).toBe(0);
    const damaged = dispatchPreviewRuntimeAction(attack, "action");
    expect(damaged.battlePartyHp).toEqual([39]);
    expect(damaged.variables.damage_count).toBe(1);
    expect(damaged.linkCable.rumble.active).toBe(true);
    const nextMenu = dispatchPreviewRuntimeAction(damaged, "action");
    expect(nextMenu.variables.damage_count).toBe(1);
  });
});

describe.skipIf(!process.env.GBA_DAMAGE_QA_OUTPUT)("native damage event builds", () => {
  it("compiles standalone runtimes and a disposable copy of the complete project", async () => {
    const output = path.resolve(process.env.GBA_DAMAGE_QA_OUTPUT!);
    const enginePackPath = path.resolve("../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const projectPath = path.resolve("default-assets/templates/exemplo-gba/exemplo-gba.gba-project");
    const example = parseGBAProjectFile(await readFile(projectPath, "utf8")).data;
    const events = example.events as Array<Record<string, unknown>>;
    const addedEvents = new Set<string>();
    const roomRecords = [example.rooms, example.scenas].flatMap(value => Array.isArray(value) ? value : []) as Array<Record<string, unknown>>;
    for (const room of roomRecords) {
      if (!["battleRpg", "shmup"].includes(String(room.sceneType))) continue;
      const name = `qa_damage_${room.name}`;
      room.eventBindings = { ...(room.eventBindings as object), onHitPlayer: name };
      if (!addedEvents.has(name)) {
        events.push({ id: name, name, category: "Cena", roomName: room.name,
          steps: [{ command: "rumble_on_for 12", isEnabled: true }] });
        addedEvents.add(name);
      }
    }
    for (const [name, data] of [["battleRpg", project("battleRpg")], ["shmup", project("shmup")], ["complete", example]] as const) {
      const destination = path.join(output, name);
      await mkdir(destination, { recursive: true });
      const prepared = prepareEngineProjectExport(data, { enginePackPath });
      expect(prepared.error).toBeUndefined();
      if (name === "complete") {
        const contract = prepared.generated!.contract;
        const hooks = [...contract.battle_rpg_project!.encounters, ...contract.shmup_project!.waves];
        expect(hooks).toHaveLength(3);
        expect(hooks.every(hook => hook.on_hit_player?.some(command => command.op === "rumble_on_for"))).toBe(true);
      }
      await writeEngineSchemaExport({ prepared: prepared.generated!, destination, projectPath,
        assetcPath: path.join(enginePackPath, "tools/assetc"), cacheEnabled: false });
      const build = await runGbsbuild({ enginePackPath, gbsbuildPath: path.join(enginePackPath, "tools/gbsbuild"), projectDir: destination });
      await writeFile(path.join(destination, "native-build.json"), JSON.stringify(build, null, 2));
      expect(build.exitCode, build.stderr).toBe(0);
    }
  }, 600_000);
});
