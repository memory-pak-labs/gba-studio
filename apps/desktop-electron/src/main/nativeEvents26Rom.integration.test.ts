import { describe, expect, it } from "vitest";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nativeEventFixture } from "./nativeEventTestFixture.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { saveProjectFileAtomically } from "./projectPersistence.js";
import { summarizeGBAProject } from "../shared/projectFile.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";
import { runGbsbuild } from "./enginePack.js";

const output = process.env.GBA_NATIVE_EVENTS_26_QA_OUTPUT;
describe.skipIf(!output)("26 authored native events through assetc and ARM", () => {
  it("saves, exports and builds the interactive, combat and clock fixtures", async () => {
    const qa = path.resolve(output!);
    const enginePackPath = path.join(qa, "EnginePack");
    for (const runtime of ["topdown", "luta", "platformer", "isometricAdventure"]) {
      const fight = runtime === "luta";
      const commands = fight ? [
        "luta_start_match final", "luta_set_rounds_to_win 3", "luta_set_round_timer 60",
        "luta_set_ism_style Nara v-ism", "luta_enable_alpha_counter Rival false",
        "luta_set_guard_power Rival 45", "luta_set_super_gauge Nara 80", "luta_add_super_gauge Nara 20",
        "luta_trigger_super Nara ultra", "wait 120", "luta_end_match player1"
      ] : runtime !== "topdown" ? ["start_game_clock 1 3 hud", "advance_time 1430", "wait 120"] : [
        "start_game_clock 1 60 hud", "advance_time 1430", "draw_text 1 1 overlay EVENTOS GBA",
        "draw_text 2 5 background TEXTO NO MUNDO", "set_actor_animation_state Hero combat-state",
        "cancel_actor_movement Target", "actor_effects Target flash 60 50",
        "projectile_load_slot 0 hero.png 3 150", "launch_projectile_slot Hero 0 right",
        "push_actor Keeper false", "start_segment 3 background", "wait 90", "stop_segment 3",
        "set_adventure_state run", "wait 10", "set_adventure_state blank", "wait 10", "set_adventure_state ground",
        "add_item coin 20", "add_item sword 1", "open_menu prompt answer",
        "open_code_lock unlocked 2 10", "open_equip_menu 2 true", "open_shop Keeper", "set_variable done 42"
      ];
      const data = nativeEventFixture(commands);
      const scenas = data.scenas as Record<string, unknown>[];
      scenas[0]!.sceneType = runtime;
      if (fight || runtime === "topdown") scenas[0]!.playerActorName = fight ? "Nara" : "Hero";
      scenas[0]!.eventBindings = { onInit: "boot" };
      const general = (data.settings as Record<string, Record<string, unknown>>).general!;
      general.startSceneType = runtime;
      general.gameTitle = `QA events ${runtime}`;
      const build = (data.settings as Record<string, Record<string, unknown>>).build!;
      build.enginePackPath = enginePackPath; build.romFileName = "events.gba";
      if (fight) {
        scenas.push({ name: "final", sceneType: "luta", width: 30, height: 20 });
        data.actors = [
          { id: "hero", name: "Nara", roomName: "start", battle: { side: "player1", maxHp: 100 } },
          { id: "rival", name: "Rival", roomName: "start", battle: { side: "player2", maxHp: 120 } },
          { id: "hero-final", name: "NaraFinal", roomName: "final", battle: { side: "player1", maxHp: 100 } },
          { id: "rival-final", name: "RivalFinal", roomName: "final", battle: { side: "player2", maxHp: 120 } }
        ];
      } else if (runtime === "topdown") {
        scenas[0]!.runtime = { type: "topdown", config: { modules: [
          { id: "inventory", enabled: true, settings: {} },
          { id: "shop", enabled: true, settings: { label: "POTION", item: 1, currencyItem: 0, price: 7 } }
        ] } };
        data.dialogues = [{ key: "prompt", text: "ESCOLHA", choices: ["SIM", "NAO"] }];
        data.assets = [{ id: "hero-sheet", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png", streamFrames: true } }];
        data.actors = [
          { id: "hero", name: "Hero", roomName: "start", x: 4, y: 4, spriteSheet: "hero.png" },
          { id: "target", name: "Target", roomName: "start", x: 8, y: 4, spriteSheet: "hero.png", health: 2 },
          { id: "keeper", name: "Keeper", roomName: "start", x: 12, y: 4, spriteSheet: "hero.png" }
        ];
        data.animations = [
          { id: "idle", name: "idle", state: "idle", direction: "down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 4 },
          { id: "walk", name: "walk", state: "walk", direction: "down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 4 }
        ];
        data.animationStates = [{ id: "combat-state", name: "combat", spriteSheet: "hero.png", animationType: "fixed_movement", mirrorLeftFromRight: false, animationIDs: ["idle", "walk"] }];
        (data.events as Record<string, unknown>[]).push({ id: "background", name: "background", category: "Cena", sceneName: "start", steps: [
          { command: "set_variable parallel 1" }, { command: "wait 300" }, { command: "set_variable parallel 2" }
        ] });
      }
      if (fight) {
        data.assets = [{ id: "hero-sheet", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } }];
        data.animations = [{ id: "idle", name: "idle", state: "idle", direction: "down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 4 }];
        for (const actor of data.actors as Record<string, unknown>[]) { actor.spriteSheet = "hero.png"; actor.animationName = "idle"; }
      }
      const dir = path.join(qa, runtime); await mkdir(path.join(dir, "Assets/sprites"), { recursive: true });
      if (fight || runtime === "topdown") await copyFile(path.resolve("../../packages/GBAStudioEngine/build/host/assetc/sprite16.png"), path.join(dir, "Assets/sprites/hero.png"));
      const projectPath = path.join(dir, "events.gba-project");
      await saveProjectFileAtomically(projectPath, { data, summary: summarizeGBAProject(data) }, { appPath: process.cwd() });
      const prepared = prepareEngineProjectExport(data, { enginePackPath });
      expect(prepared.error, runtime).toBeUndefined();
      await writeFile(path.join(dir, "contract.json"), JSON.stringify(prepared.generated!.contract, null, 2));
      const destination = path.join(dir, "export");
      await writeEngineSchemaExport({ prepared: prepared.generated!, projectPath, cacheEnabled: false, assetcPath: path.join(enginePackPath, "tools/assetc"), destination });
      const result = await runGbsbuild({ enginePackPath, gbsbuildPath: path.join(enginePackPath, "tools/gbsbuild"), projectDir: destination });
      await writeFile(path.join(dir, "build.json"), JSON.stringify(result, null, 2));
      expect(result.exitCode, runtime).toBe(0);
    }
  }, 180_000);
});
