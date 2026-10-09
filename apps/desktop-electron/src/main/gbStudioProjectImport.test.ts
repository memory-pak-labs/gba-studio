import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateGBAProjectMigrationContract } from "../../../../packages/project-contract/src/index.js";
import { parseGBAProjectFile } from "../shared/projectFile.js";
import { blockingGBStudioImportDiagnostics, importGBStudioProject } from "./gbStudioProjectImport.js";

const temporaryRoots: string[] = [];

async function makeTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "gba-studio-gbs-import-"));
  temporaryRoots.push(root);
  return root;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("GB Studio project import", () => {
  it("identifica diagnosticos que representam perda obrigatoria antes do export", () => {
    expect(blockingGBStudioImportDiagnostics({
      gbStudioImport: {
        diagnostics: [
          { code: "unsupported-event", message: "EVENT_UNKNOWN" },
          { code: "sprite-placeholder-normalized", message: "placeholder" }
        ]
      }
    })).toEqual([
      { code: "unsupported-event", message: "EVENT_UNKNOWN" }
    ]);
  });

  it("materializes a split .gbsproj as an independent native GBA Studio project", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "Demo");
    const sourceProjectPath = path.join(sourceRoot, "Demo.gbsproj");
    const sourceManifest = {
      _resourceType: "project",
      name: "Demo GB",
      author: "GB Author",
      _version: "4.2.0",
      _release: "10"
    };

    await writeJson(sourceProjectPath, sourceManifest);
    await writeJson(path.join(sourceRoot, "project", "settings.gbsres"), {
      _resourceType: "settings",
      startSceneId: "scene-1"
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "intro", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-1",
      name: "Intro",
      symbol: "scene_intro",
      type: "TOPDOWN",
      width: 20,
      height: 18,
      backgroundId: "background-1",
      collisions: "0"
    });
    await writeJson(path.join(sourceRoot, "assets", "backgrounds", "intro.png.gbsres"), {
      _resourceType: "background",
      id: "background-1",
      name: "Intro",
      filename: "intro.png",
      width: 20,
      height: 18
    });
    await writeFile(path.join(sourceRoot, "assets", "backgrounds", "intro.png"), "fake-png", "utf8");

    const result = await importGBStudioProject(sourceProjectPath);

    expect(result.projectPath).toBe(path.join(root, "Demo-gba-import", "demo_gb.gba-project"));
    expect(result.report).toMatchObject({ resourceCount: 3, copiedAssetCount: 1, sourceVersion: "4.2.0" });
    expect(result.project.data).toMatchObject({
      schemaVersion: 1,
      name: "Demo GB",
      gbStudioImport: {
        sourceVersion: "4.2.0",
        sourceRelease: "10",
        sourceAuthor: "GB Author",
        sourceProjectFile: "Demo.gbsproj"
      }
    });
    expect(result.project.data.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "gb-background-background-1",
        name: "intro.png",
        kind: "Background",
        metadata: expect.objectContaining({
          source: "Assets/backgrounds/intro.png",
          placeholder: true,
          provenance: "GB Studio placeholder"
        })
      })
    ]));
    expect(validateGBAProjectMigrationContract(result.project.data)).toEqual([]);

    const saved = parseGBAProjectFile(await readFile(result.projectPath, "utf8"));
    expect(saved.data).toEqual(result.project.data);
    await expect(readFile(path.join(root, "Demo-gba-import", "Assets", "backgrounds", "intro.png"), "utf8"))
      .resolves.toBe("fake-png");
    await expect(readFile(path.join(root, "Demo-gba-import", "ASSET_PROVENANCE.md"), "utf8"))
      .resolves.toContain("placeholder");
    await expect(readFile(path.join(root, "Demo-gba-import", "LICENSE-GB-STUDIO-MIT.txt"), "utf8"))
      .resolves.toContain("MIT License");
    await expect(readFile(sourceProjectPath, "utf8"))
      .resolves.toBe(`${JSON.stringify(sourceManifest, null, 2)}\n`);
  });

  it("converts rooms, collisions, actors, triggers and supported scripts with explicit diagnostics", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "Playable");
    const sourceProjectPath = path.join(sourceRoot, "Playable.gbsproj");

    await writeJson(sourceProjectPath, {
      _resourceType: "project",
      name: "Playable Import",
      author: "GB Author",
      _version: "4.2.0",
      _release: "10"
    });
    await writeJson(path.join(sourceRoot, "project", "settings.gbsres"), {
      _resourceType: "settings",
      startSceneId: "scene-intro"
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "intro", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-intro",
      name: "Intro Room",
      symbol: "scene_intro",
      type: "TOPDOWN",
      width: 4,
      height: 2,
      backgroundId: "",
      collisions: "002+0f2+004+",
      script: [
        {
          id: "event-text",
          command: "EVENT_TEXT",
          args: { text: ["Ola do GB Studio"], avatarId: "" }
        },
        {
          id: "event-push-scene",
          command: "EVENT_SCENE_PUSH_STATE",
          args: {}
        },
        {
          id: "event-switch",
          command: "EVENT_SWITCH_SCENE",
          args: {
            sceneId: "scene-cave",
            x: { type: "number", value: 1 },
            y: { type: "number", value: 1 },
            direction: "down"
          }
        },
        {
          id: "event-unknown",
          command: "EVENT_NOT_SUPPORTED_YET",
          args: {}
        }
      ]
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "intro", "actors", "guide.gbsres"), {
      _resourceType: "actor",
      id: "actor-guide",
      symbol: "actor_guide",
      name: "Guide",
      x: 1,
      y: 1,
      spriteSheetId: "",
      script: [
        {
          id: "actor-text",
          command: "EVENT_TEXT",
          args: { text: ["Siga-me"], avatarId: "" }
        }
      ],
      startScript: [],
      updateScript: []
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "intro", "triggers", "exit.gbsres"), {
      _resourceType: "trigger",
      id: "trigger-exit",
      symbol: "trigger_exit",
      name: "Exit",
      x: 3,
      y: 0,
      width: 1,
      height: 2,
      script: [
        {
          id: "trigger-switch",
          command: "EVENT_SWITCH_SCENE",
          args: {
            sceneId: "scene-cave",
            x: { type: "number", value: 0 },
            y: { type: "number", value: 1 },
            direction: "left"
          }
        }
      ],
      leaveScript: []
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "cave", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-cave",
      name: "Cave",
      symbol: "scene_cave",
      type: "PLATFORM",
      width: 2,
      height: 2,
      backgroundId: "",
      collisions: "004+",
      script: [
        {
          id: "event-pop-scene",
          command: "EVENT_SCENE_POP_STATE",
          args: { fadeSpeed: "2" }
        }
      ]
    });

    const result = await importGBStudioProject(sourceProjectPath);
    const rooms = result.project.data.rooms as Record<string, unknown>[];
    const actors = result.project.data.actors as Record<string, unknown>[];
    const triggers = result.project.data.triggers as Record<string, unknown>[];
    const events = result.project.data.events as Array<{ name: string; steps: Array<{ command: string }> }>;
    const dialogues = result.project.data.dialogues as Array<{ key: string; text: string }>;

    expect(rooms).toHaveLength(2);
    expect(rooms[0]).toMatchObject({
      id: "gb-scene-scene-intro",
      name: "scene_intro",
      sceneType: "topdown",
      cameraMode: "follow_player",
      width: 4,
      height: 2,
      collisions: ["free", "free", "solid", "solid", "free", "free", "free", "free"],
      collisionTypes: ["free", "free", "solid", "solid", "free", "free", "free", "free"],
      eventBindings: { onInit: "scene_intro_on_enter" }
    });
    expect(rooms[1]).toMatchObject({
      name: "scene_cave",
      sceneType: "platformer",
      cameraMode: "follow_player"
    });
    expect(actors).toEqual([
      expect.objectContaining({
        id: "gb-actor-actor-guide",
        name: "Guide",
        roomName: "scene_intro",
        x: 1,
        y: 1,
        eventBindings: { onInteract: "actor_guide_on_interact" }
      })
    ]);
    expect(triggers).toEqual([
      expect.objectContaining({
        id: "gb-trigger-trigger-exit",
        name: "Exit",
        roomName: "scene_intro",
        width: 1,
        height: 2,
        eventBindings: { onEnter: "trigger_exit_on_enter" }
      })
    ]);
    expect(events.find((event) => event.name === "scene_intro_on_enter")?.steps.map((step) => step.command)).toEqual([
      expect.stringMatching(/^show_dialogue gb_dialogue_/),
      "scene_stack_push",
      "change_scene scene_cave 1 1 down",
      "end_event",
      "noop"
    ]);
    expect(events.find((event) => event.name === "scene_cave_on_enter")?.steps.map((step) => step.command)).toEqual([
      "scene_stack_previous"
    ]);
    expect(events.find((event) => event.name === "trigger_exit_on_enter")?.steps.map((step) => step.command)).toEqual([
      "change_scene scene_cave 0 1 left",
      "end_event"
    ]);
    expect(dialogues.map((dialogue) => dialogue.text)).toEqual(expect.arrayContaining(["Ola do GB Studio", "Siga-me"]));
    expect(result.report).toMatchObject({ translatedEventCount: 6, unsupportedEventCount: 1 });
    expect(result.report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "unsupported-event",
        sourceCommand: "EVENT_NOT_SUPPORTED_YET",
        sourceEventID: "event-unknown"
      })
    ]));
    expect(validateGBAProjectMigrationContract(result.project.data)).toEqual([]);
  });

  it("rebuilds sprite animations and connects audio, variables and custom scripts", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "AssetsAndScripts");
    const sourceProjectPath = path.join(sourceRoot, "AssetsAndScripts.gbsproj");

    await writeJson(sourceProjectPath, {
      _resourceType: "project",
      name: "Assets and Scripts",
      _version: "4.2.0",
      _release: "10"
    });
    await writeJson(path.join(sourceRoot, "project", "settings.gbsres"), {
      _resourceType: "settings",
      startSceneId: "scene-main"
    });
    await writeJson(path.join(sourceRoot, "project", "variables.gbsres"), {
      _resourceType: "variables",
      variables: [{ id: "1", name: "Score", symbol: "var_score" }],
      constants: []
    });
    await writeJson(path.join(sourceRoot, "project", "scripts", "bonus.gbsres"), {
      _resourceType: "script",
      id: "script-bonus",
      name: "Bonus",
      symbol: "script_bonus",
      script: [
        {
          id: "set-score",
          command: "EVENT_SET_VALUE",
          args: { variable: "1", value: { type: "number", value: 7 } }
        }
      ]
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "main", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-main",
      name: "Main",
      symbol: "scene_main",
      type: "TOPDOWN",
      width: 2,
      height: 2,
      backgroundId: "",
      collisions: "004+",
      script: [
        { id: "music", command: "EVENT_MUSIC_PLAY", args: { musicId: "music-theme", loop: true } },
        { id: "sound", command: "EVENT_SOUND_PLAY_EFFECT", args: { type: "sound-hit", wait: false } },
        {
          id: "call",
          command: "EVENT_CALL_CUSTOM_EVENT",
          args: { customEventId: "script-bonus" },
          children: {
            script: [{
              id: "set-score-inline-copy",
              command: "EVENT_SET_VALUE",
              args: { variable: "1", value: { type: "number", value: 7 } }
            }]
          }
        }
      ]
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "main", "actors", "hero.gbsres"), {
      _resourceType: "actor",
      id: "actor-hero",
      symbol: "actor_hero",
      name: "Hero",
      x: 0,
      y: 0,
      spriteSheetId: "sprite-hero",
      script: [],
      startScript: [],
      updateScript: []
    });
    await writeJson(path.join(sourceRoot, "assets", "sprites", "hero.png.gbsres"), {
      _resourceType: "sprite",
      id: "sprite-hero",
      name: "hero",
      symbol: "sprite_hero",
      filename: "hero.png",
      canvasWidth: 16,
      canvasHeight: 16,
      boundsX: 0,
      boundsY: 0,
      boundsWidth: 16,
      boundsHeight: 16,
      animSpeed: 8,
      states: [
        {
          id: "state-hero",
          name: "Default",
          animationType: "fixed",
          flipLeft: false,
          animations: [
            {
              id: "animation-hero-idle",
              frames: [
                {
                  id: "frame-hero-idle",
                  tiles: [
                    { id: "tile-a", x: 0, y: 0, sliceX: 0, sliceY: 0, flipX: false, flipY: false, paletteIndex: 2, objPalette: "OBP0", priority: false },
                    { id: "tile-b", x: 8, y: 0, sliceX: 8, sliceY: 0, flipX: false, flipY: false, paletteIndex: 2, objPalette: "OBP0", priority: false }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });
    await mkdir(path.join(sourceRoot, "assets", "sprites"), { recursive: true });
    await writeFile(path.join(sourceRoot, "assets", "sprites", "hero.png"), "sprite", "utf8");
    await writeJson(path.join(sourceRoot, "assets", "music", "theme.mod.gbsres"), {
      _resourceType: "music",
      id: "music-theme",
      name: "Theme",
      symbol: "song_theme",
      filename: "theme.mod",
      type: "mod"
    });
    await mkdir(path.join(sourceRoot, "assets", "music"), { recursive: true });
    await writeFile(path.join(sourceRoot, "assets", "music", "theme.mod"), "music", "utf8");
    await writeJson(path.join(sourceRoot, "assets", "sounds", "hit.wav.gbsres"), {
      _resourceType: "sound",
      id: "sound-hit",
      name: "Hit",
      symbol: "sound_hit",
      filename: "hit.wav",
      type: "wav"
    });
    await mkdir(path.join(sourceRoot, "assets", "sounds"), { recursive: true });
    await writeFile(path.join(sourceRoot, "assets", "sounds", "hit.wav"), "sound", "utf8");

    const result = await importGBStudioProject(sourceProjectPath);
    const animations = result.project.data.animations as Record<string, unknown>[];
    const animationStates = result.project.data.animationStates as Record<string, unknown>[];
    const actors = result.project.data.actors as Record<string, unknown>[];
    const events = result.project.data.events as Array<{ name: string; steps: Array<{ command: string }> }>;

    expect(animations).toEqual([
      expect.objectContaining({
        id: "gb-animation-animation-hero-idle",
        name: "idle",
        spriteSheet: "hero.png",
        frameWidth: 16,
        frameHeight: 16,
        colorMode: "4bpp",
        frames: [
          expect.objectContaining({
            width: 16,
            height: 16,
            tiles: [
              expect.objectContaining({ sourceSheet: "hero.png", sliceX: 0, tileWidth: 8, paletteIndex: 2 }),
              expect.objectContaining({ sourceSheet: "hero.png", sliceX: 8, tileWidth: 8, paletteIndex: 2 })
            ]
          })
        ]
      })
    ]);
    expect(animationStates).toEqual([
      expect.objectContaining({
        id: "gb-state-state-hero",
        name: "default",
        spriteSheet: "hero.png",
        animationIDs: ["gb-animation-animation-hero-idle"]
      })
    ]);
    expect(actors).toEqual([
      expect.objectContaining({
        name: "Hero",
        spriteSheet: "hero.png",
        animationStateID: "gb-state-state-hero",
        animationName: "idle"
      })
    ]);
    expect(result.project.data.audioItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "theme.mod", kind: "Musica", format: "MOD" }),
      expect.objectContaining({ name: "hit.wav", kind: "SFX", format: "WAV" })
    ]));
    expect(result.project.data.variables).toEqual([
      expect.objectContaining({ id: "gb-variable-1", name: "var_score", displayName: "Score", initialValue: 0 })
    ]);
    expect(events.find((event) => event.name === "scene_main_on_enter")?.steps.map((step) => step.command)).toEqual([
      "play_music theme.mod",
      "play_sfx hit.wav",
      "call_event script_bonus"
    ]);
    expect(events.find((event) => event.name === "script_bonus")?.steps.map((step) => step.command)).toEqual([
      "set_variable var_score 7"
    ]);
    expect(result.report).toMatchObject({ translatedEventCount: 4, unsupportedEventCount: 0 });
    expect(validateGBAProjectMigrationContract(result.project.data)).toEqual([]);
  });

  it("connects each GB Studio default player sprite to its native runtime", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "RuntimePlayers");
    const sourceProjectPath = path.join(sourceRoot, "RuntimePlayers.gbsproj");
    await writeJson(sourceProjectPath, { _resourceType: "project", name: "Runtime Players" });
    await writeJson(path.join(sourceRoot, "project", "settings.gbsres"), {
      _resourceType: "settings",
      startSceneId: "scene-topdown",
      startX: 3,
      startY: 4,
      startDirection: "right",
      defaultPlayerSprites: {
        TOPDOWN: "sprite-topdown",
        PLATFORM: "sprite-platformer",
        POINTNCLICK: "sprite-cursor",
        SHMUP: "sprite-ship"
      }
    });

    const scenes = [
      ["scene-topdown", "Topdown", "TOPDOWN"],
      ["scene-platformer", "Platformer", "PLATFORM"],
      ["scene-point-click", "Point Click", "POINTNCLICK"],
      ["scene-shmup", "Shmup", "SHMUP"]
    ];
    for (const [id, name, type] of scenes) {
      await writeJson(path.join(sourceRoot, "project", "scenes", id, "scene.gbsres"), {
        _resourceType: "scene",
        id,
        name,
        symbol: id,
        type,
        width: 20,
        height: 18,
        backgroundId: "",
        collisions: ""
      });
    }

    const animation = (id: string, hasTiles = true) => ({
      id,
      frames: [{
        id: `${id}-frame`,
        tiles: hasTiles ? [{ id: `${id}-tile`, x: 0, y: 0, sliceX: 0, sliceY: 0 }] : []
      }]
    });
    const spriteResources = [
      {
        id: "sprite-topdown",
        filename: "player.png",
        animationType: "multi_movement",
        animations: Array.from({ length: 8 }, (_value, index) => animation(`topdown-${index}`, [0, 2, 3, 4, 6, 7].includes(index)))
      },
      {
        id: "sprite-platformer",
        filename: "player_platform.png",
        animationType: "platform_player",
        animations: Array.from({ length: 8 }, (_value, index) => animation(`platform-${index}`, [0, 2, 4, 6].includes(index)))
      },
      {
        id: "sprite-cursor",
        filename: "cursor.png",
        animationType: "cursor",
        animations: Array.from({ length: 8 }, (_value, index) => animation(`cursor-${index}`, index < 2))
      },
      {
        id: "sprite-ship",
        filename: "player_ship.png",
        animationType: "multi_movement",
        animations: Array.from({ length: 8 }, (_value, index) => animation(`ship-${index}`, [0, 2, 3, 4, 6, 7].includes(index)))
      }
    ];
    for (const sprite of spriteResources) {
      await writeJson(path.join(sourceRoot, "assets", "sprites", `${sprite.filename}.gbsres`), {
        _resourceType: "sprite",
        id: sprite.id,
        name: path.basename(sprite.filename, ".png"),
        filename: sprite.filename,
        canvasWidth: 16,
        canvasHeight: 16,
        boundsWidth: 16,
        boundsHeight: 16,
        animSpeed: 8,
        states: [{
          id: `${sprite.id}-state`,
          name: "",
          animationType: sprite.animationType,
          flipLeft: true,
          animations: sprite.animations
        }]
      });
      await mkdir(path.join(sourceRoot, "assets", "sprites"), { recursive: true });
      await writeFile(path.join(sourceRoot, "assets", "sprites", sprite.filename), "sprite", "utf8");
    }

    const result = await importGBStudioProject(sourceProjectPath);
    const players = (result.project.data.actors as Record<string, unknown>[])
      .filter((actor) => actor.name === "Player");
    expect(players).toEqual(expect.arrayContaining([
      expect.objectContaining({ roomName: "scene_topdown", x: 3, y: 4, direction: "right", spriteSheet: "player.png", animationName: "idle_right" }),
      expect.objectContaining({ roomName: "scene_platformer", spriteSheet: "player_platform.png", animationName: "idle_right" }),
      expect.objectContaining({ roomName: "scene_point_click", spriteSheet: "cursor.png", animationName: "idle" })
    ]));
    expect(players).toHaveLength(3);
    expect(result.project.data.settings).toMatchObject({
      topdown: { playerSprite: "player.png" },
      platformer: { playerSprite: "player_platform.png" },
      pointAndClick: { cursorImage: "cursor.png" },
      shmup: { playerSprite: "player_ship.png" }
    });
    const platformerAnimations = (result.project.data.animations as Record<string, unknown>[])
      .filter((item) => item.spriteSheet === "player_platform.png")
      .map((item) => item.name);
    expect(platformerAnimations).toEqual(["idle_right", "jump_right", "walk_right", "climb"]);
    const cursorAnimations = (result.project.data.animations as Record<string, unknown>[])
      .filter((item) => item.spriteSheet === "cursor.png")
      .map((item) => item.name);
    expect(cursorAnimations).toEqual(["idle", "hover"]);
  });

  it("normalizes oversized sprite frames to a GBA layout that divides the source sheet", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "WideSprite");
    const sourceProjectPath = path.join(sourceRoot, "WideSprite.gbsproj");

    await writeJson(sourceProjectPath, {
      _resourceType: "project",
      name: "Wide Sprite"
    });
    await writeJson(path.join(sourceRoot, "assets", "sprites", "elephant.png.gbsres"), {
      _resourceType: "sprite",
      id: "sprite-elephant",
      name: "Elephant",
      filename: "elephant.png",
      width: 80,
      height: 48,
      canvasWidth: 80,
      canvasHeight: 48,
      states: [{
        id: "state-elephant",
        name: "Default",
        animationType: "fixed",
        animations: [{
          id: "animation-elephant",
          frames: [{
            id: "frame-elephant",
            tiles: Array.from({ length: 19 }, (_, index) => ({
              id: `tile-${index}`,
              x: (index % 10) * 8,
              y: Math.floor(index / 10) * 8,
              sliceX: (index % 10) * 8,
              sliceY: Math.floor(index / 10) * 8
            }))
          }]
        }]
      }]
    });
    await mkdir(path.join(sourceRoot, "assets", "sprites"), { recursive: true });
    await writeFile(path.join(sourceRoot, "assets", "sprites", "elephant.png"), "sprite", "utf8");

    const result = await importGBStudioProject(sourceProjectPath);
    const [animation] = result.project.data.animations as Array<Record<string, unknown>>;

    expect(animation).toMatchObject({ frameWidth: 40, frameHeight: 48 });
    expect(80 % Number(animation?.frameWidth)).toBe(0);
    expect(48 % Number(animation?.frameHeight)).toBe(0);
    expect(result.report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "sprite-placeholder-normalized", sourceResourceID: "sprite-elephant" })
    ]));
  });

  it("uses the physical sheet size when the logical sprite canvas is wider than the PNG", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "LogicalCanvas");
    const sourceProjectPath = path.join(sourceRoot, "LogicalCanvas.gbsproj");

    await writeJson(sourceProjectPath, { _resourceType: "project", name: "Logical Canvas" });
    await writeJson(path.join(sourceRoot, "assets", "sprites", "hearts.png.gbsres"), {
      _resourceType: "sprite",
      id: "sprite-hearts",
      filename: "hearts.png",
      width: 16,
      height: 16,
      canvasWidth: 32,
      canvasHeight: 16,
      states: [{
        id: "state-hearts",
        name: "Default",
        animationType: "fixed",
        animations: [{
          id: "animation-hearts",
          frames: [{ id: "frame-hearts", tiles: [{ id: "tile-heart", x: 0, y: 0, sliceX: 0, sliceY: 0 }] }]
        }]
      }]
    });
    await mkdir(path.join(sourceRoot, "assets", "sprites"), { recursive: true });
    await writeFile(path.join(sourceRoot, "assets", "sprites", "hearts.png"), "sprite", "utf8");

    const result = await importGBStudioProject(sourceProjectPath);
    const [animation] = result.project.data.animations as Array<Record<string, unknown>>;

    expect(animation).toMatchObject({ frameWidth: 16, frameHeight: 16 });
  });

  it("preserves every sprite and scene background when a project uses more than 15 sprite sheets", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "LargePlaceholderSet");
    const sourceProjectPath = path.join(sourceRoot, "LargePlaceholderSet.gbsproj");

    await writeJson(sourceProjectPath, { _resourceType: "project", name: "Large Placeholder Set" });
    await writeJson(path.join(sourceRoot, "project", "settings.gbsres"), {
      _resourceType: "settings",
      startSceneId: "scene-0",
      defaultPlayerSprites: { TOPDOWN: "sprite-0" }
    });
    for (let index = 0; index < 17; index += 1) {
      await writeJson(path.join(sourceRoot, "assets", "sprites", `sprite-${index}.png.gbsres`), {
        _resourceType: "sprite",
        id: `sprite-${index}`,
        filename: `sprite-${index}.png`,
        width: 16,
        height: 16,
        canvasWidth: 16,
        canvasHeight: 16,
        states: [{
          id: `state-${index}`,
          name: "Default",
          animationType: "fixed",
          animations: [{
            id: `animation-${index}`,
            frames: [{ id: `frame-${index}`, tiles: [{ id: `tile-${index}`, x: 0, y: 0, sliceX: 0, sliceY: 0 }] }]
          }]
        }]
      });
      await mkdir(path.join(sourceRoot, "assets", "sprites"), { recursive: true });
      await writeFile(path.join(sourceRoot, "assets", "sprites", `sprite-${index}.png`), "sprite", "utf8");
      await writeJson(path.join(sourceRoot, "project", "scenes", "scene-0", "actors", `actor-${index}.gbsres`), {
        _resourceType: "actor",
        id: `actor-${index}`,
        name: `Actor ${index}`,
        x: index,
        y: 0,
        spriteSheetId: `sprite-${index}`
      });
    }
    for (let index = 0; index < 9; index += 1) {
      await writeJson(path.join(sourceRoot, "assets", "backgrounds", `background-${index}.png.gbsres`), {
        _resourceType: "background",
        id: `background-${index}`,
        filename: `background-${index}.png`,
        width: 20,
        height: 18
      });
      await mkdir(path.join(sourceRoot, "assets", "backgrounds"), { recursive: true });
      await writeFile(path.join(sourceRoot, "assets", "backgrounds", `background-${index}.png`), "background", "utf8");
      await writeJson(path.join(sourceRoot, "project", "scenes", `scene-${index}`, "scene.gbsres"), {
        _resourceType: "scene",
        id: `scene-${index}`,
        symbol: `scene_${index}`,
        type: "TOPDOWN",
        width: 20,
        height: 18,
        backgroundId: `background-${index}`,
        collisions: "0"
      });
    }

    const result = await importGBStudioProject(sourceProjectPath);
    const actors = result.project.data.actors as Array<Record<string, unknown>>;
    const rooms = result.project.data.rooms as Array<Record<string, unknown>>;

    expect(new Set(actors.map((actor) => actor.spriteSheet))).toEqual(new Set(
      Array.from({ length: 17 }, (_item, index) => `sprite-${index}.png`)
    ));
    expect(actors.find((actor) => actor.gbStudioName === "Actor 16")).toMatchObject({
      name: "actor_16",
      spriteSheet: "sprite-16.png"
    });
    expect(new Set(rooms.map((room) => room.backgroundAssetName))).toEqual(new Set(
      Array.from({ length: 9 }, (_item, index) => `background-${index}.png`)
    ));
    expect(rooms.find((room) => room.name === "scene_8")).toMatchObject({
      backgroundAssetName: "background-8.png",
      gbStudioUseBackgroundLayout: true
    });
    expect(result.report.diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "runtime-placeholder-consolidated" })
    ]));
    expect(result.project.data.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "sprite-16.png",
        metadata: expect.objectContaining({ placeholder: true, provenance: "GB Studio placeholder" })
      })
    ]));
    await expect(readFile(path.join(result.projectPath, "..", "Assets", "sprites", "sprite-16.png"), "utf8"))
      .resolves.toBe("sprite");
  });

  it("uses unique GB Studio symbols when actor display names collide", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "DuplicateActors");
    const sourceProjectPath = path.join(sourceRoot, "DuplicateActors.gbsproj");

    await writeJson(sourceProjectPath, { _resourceType: "project", name: "Duplicate Actors" });
    await writeJson(path.join(sourceRoot, "project", "scenes", "main", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-main",
      symbol: "scene_main",
      type: "TOPDOWN",
      width: 4,
      height: 2,
      collisions: "008+"
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "main", "actors", "left.gbsres"), {
      _resourceType: "actor",
      id: "actor-left",
      name: "Machine",
      symbol: "actor_machine_left",
      x: 0,
      y: 0
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "main", "actors", "right.gbsres"), {
      _resourceType: "actor",
      id: "actor-right",
      name: "Machine",
      symbol: "actor_machine_right",
      x: 2,
      y: 0,
      script: [{
        id: "move-self",
        command: "EVENT_ACTOR_SET_POSITION",
        args: { actorId: "$self$", x: 3, y: 1 }
      }]
    });

    const result = await importGBStudioProject(sourceProjectPath);
    const actors = result.project.data.actors as Array<Record<string, unknown>>;
    const event = (result.project.data.events as Array<{ name: string; steps: Array<{ command: string }> }>)
      .find((candidate) => candidate.name === "actor_machine_right_on_interact");

    expect(actors.map((actor) => actor.name)).toEqual(["actor_machine_left", "actor_machine_right"]);
    expect(actors.map((actor) => actor.gbStudioName)).toEqual(["Machine", "Machine"]);
    expect(event?.steps.map((step) => step.command)).toEqual([
      "set_actor_position actor_machine_right 3 1"
    ]);
    expect(result.report.unsupportedEventCount).toBe(0);
  });

  it("specializes parameterized custom events at the actor call site", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "ParameterizedEvents");
    const sourceProjectPath = path.join(sourceRoot, "ParameterizedEvents.gbsproj");

    await writeJson(sourceProjectPath, { _resourceType: "project", name: "Parameterized Events" });
    await writeJson(path.join(sourceRoot, "project", "variables.gbsres"), {
      _resourceType: "variables",
      variables: [{ id: "12", name: "Score", symbol: "VAR_SCORE" }]
    });
    await writeJson(path.join(sourceRoot, "project", "scripts", "move_actor.gbsres"), {
      _resourceType: "script",
      id: "custom-move",
      name: "Move Actor",
      symbol: "script_move_actor",
      actors: { "0": { id: "0", name: "Actor" } },
      variables: { V0: { id: "V0", name: "Score" } },
      script: [
        { id: "move", command: "EVENT_ACTOR_MOVE_RELATIVE", args: { actorId: "0", x: 2, y: 0 } },
        { id: "score", command: "EVENT_SET_VALUE", args: { variable: "V0", value: 5 } }
      ]
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "main", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-main",
      symbol: "scene_main",
      type: "TOPDOWN",
      width: 4,
      height: 2,
      collisions: "008+"
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "main", "actors", "guide.gbsres"), {
      _resourceType: "actor",
      id: "actor-guide",
      symbol: "actor_guide",
      x: 0,
      y: 0,
      updateScript: [{
        id: "call-move",
        command: "EVENT_CALL_CUSTOM_EVENT",
        args: {
          customEventId: "custom-move",
          "$variable[V0]$": { type: "variable", value: "12" }
        }
      }]
    });

    const result = await importGBStudioProject(sourceProjectPath);
    const events = result.project.data.events as Array<{ name: string; steps: Array<{ command: string }> }>;

    expect(events.find((event) => event.name === "actor_guide_on_update")?.steps.map((step) => step.command)).toEqual([
      "move_actor_relative actor_guide 2 0",
      "set_variable var_score 5"
    ]);
    expect(events.find((event) => event.name === "script_move_actor")).toBeUndefined();
    expect(result.report.unsupportedEventCount).toBe(0);
  });

  it("turns GB Studio input scripts into explicit per-button handler events", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "InputScripts");
    const sourceProjectPath = path.join(sourceRoot, "InputScripts.gbsproj");

    await writeJson(sourceProjectPath, { _resourceType: "project", name: "Input Scripts" });
    await writeJson(path.join(sourceRoot, "project", "scenes", "space", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-space",
      symbol: "scene_space",
      type: "SHMUP",
      width: 40,
      height: 18,
      collisions: "0",
      script: [{
        id: "attach-fire",
        command: "EVENT_SET_INPUT_SCRIPT",
        args: { input: ["a", "b"], override: false },
        children: {
          true: [{
            id: "limit-fire",
            command: "EVENT_RATE_LIMIT",
            args: {
              variable: "19",
              time: { type: "number", value: 0.5 }
            },
            children: {
              true: [{
                id: "fire",
                command: "EVENT_LAUNCH_PROJECTILE",
                args: { actorId: "player", directionType: "direction", direction: "right", speed: 3 }
              }]
            }
          }]
        }
      }]
    });

    const result = await importGBStudioProject(sourceProjectPath);
    const events = result.project.data.events as Array<{ name: string; roomName?: string; steps: Array<{ command: string }> }>;
    const rooms = result.project.data.rooms as Array<{ name: string; eventBindings?: Record<string, string> }>;
    const onEnter = events.find((event) => event.name === "scene_space_on_enter");
    const handlerName = "scene_space_on_enter_input_attach_fire";

    expect(onEnter?.steps.map((step) => step.command)).toEqual([
      `attach_button a ${handlerName} false`,
      `attach_button b ${handlerName} false`
    ]);
    expect(rooms.find((room) => room.name === "scene_space")?.eventBindings).toEqual({
      onInit: "scene_space_on_enter"
    });
    expect(events.find((event) => event.name === handlerName)).toMatchObject({
      roomName: "scene_space",
      steps: [
        expect.objectContaining({ command: "rate_limit 30 19" }),
        expect.objectContaining({ command: "launch_projectile Player right 3" }),
        expect.objectContaining({ command: "rate_limit_end" })
      ]
    });
    expect(result.report.unsupportedEventCount).toBe(0);
  });

  it("translates nested GB Studio branches and high-frequency runtime commands", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "NestedEvents");
    const sourceProjectPath = path.join(sourceRoot, "NestedEvents.gbsproj");

    await writeJson(sourceProjectPath, { _resourceType: "project", name: "Nested Events" });
    await writeJson(path.join(sourceRoot, "project", "variables.gbsres"), {
      _resourceType: "variables",
      variables: [{ id: "1", name: "Score", symbol: "VAR_SCORE" }]
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "main", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-main",
      symbol: "scene_main",
      type: "TOPDOWN",
      width: 2,
      height: 2,
      collisions: "004+"
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "main", "actors", "guide.gbsres"), {
      _resourceType: "actor",
      id: "actor-guide",
      name: "Guide",
      symbol: "actor_guide",
      x: 0,
      y: 0,
      script: [
        { id: "choice", command: "EVENT_CHOICE", args: { variable: "1", trueText: "Sim", falseText: "Nao" } },
        {
          id: "condition",
          command: "EVENT_IF",
          args: { variable: "1", condition: { type: "variable", value: "1" } },
          children: {
            true: [
              { id: "dec", command: "EVENT_DEC_VALUE", args: { variable: "1" } },
              { id: "position", command: "EVENT_ACTOR_SET_POSITION", args: { actorId: "$self$", x: { type: "number", value: 4 }, y: { type: "number", value: 5 } } },
              { id: "direction", command: "EVENT_ACTOR_SET_DIRECTION", args: { actorId: "$self$", direction: "left" } },
              { id: "frame", command: "EVENT_ACTOR_SET_FRAME", args: { actorId: "$self$", frame: { type: "number", value: 2 } } },
              { id: "move", command: "EVENT_ACTOR_MOVE_TO", args: { actorId: "$self$", x: { type: "number", value: 7 }, y: { type: "number", value: 8 } } },
              { id: "music", command: "EVENT_MUSIC_STOP", args: {} },
              { id: "save", command: "EVENT_SAVE_DATA", args: { saveSlot: 2 } },
              { id: "input", command: "EVENT_AWAIT_INPUT", args: { input: ["a", "b"] } },
              { id: "bounce", command: "EVENT_PLAYER_BOUNCE", args: { height: "high" } },
              { id: "crash-1", command: "EVENT_SOUND_PLAY_EFFECT", args: { type: "crash", duration: 0.5, wait: false } },
              { id: "crash-2", command: "EVENT_SOUND_PLAY_EFFECT", args: { type: "crash", duration: 0.5, wait: false } },
              { id: "projectile", command: "EVENT_LAUNCH_PROJECTILE", args: { actorId: "$self$", directionType: "direction", direction: "right", speed: 3 } },
              { id: "deprecated-animate", command: "EVENT_ACTOR_SET_ANIMATE", args: { actorId: "$self$", animate: true } }
            ],
            false: [{ id: "fallback", command: "EVENT_TEXT", args: { text: "Ainda nao." } }]
          }
        }
      ]
    });

    const result = await importGBStudioProject(sourceProjectPath);
    const event = (result.project.data.events as Array<{ name: string; steps: Array<{ command: string }> }>)
      .find((candidate) => candidate.name === "actor_guide_on_interact");

    expect(event?.steps.map((step) => step.command)).toEqual([
      "show_choice gb_dialogue_1",
      "if_variable var_score 1",
      "add_variable var_score -1",
      "set_actor_position Guide 4 5",
      "set_actor_direction Guide left",
      "set_actor_animation_frame Guide 2",
      "move_actor_to Guide 7 8",
      "stop_music",
      "save_game 2",
      "wait_button a,b",
      "player_bounce 3 20",
      "play_sfx gb_builtin_crash",
      "play_sfx gb_builtin_crash",
      "launch_projectile Guide right 3",
      "noop",
      "else",
      "show_dialogue gb_dialogue_2",
      "condition_end"
    ]);
    expect(event?.steps.find((step) => step.command === "noop")).toMatchObject({
      gbStudioCommand: "EVENT_ACTOR_SET_ANIMATE",
      gbStudioNoopReason: "deprecated-upstream"
    });
    expect(result.project.data.audioItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "gb-audio-builtin-crash",
        name: "gb_builtin_crash",
        kind: "SFX",
        format: "COMPOSED",
        bpm: 60,
        patterns: [expect.objectContaining({
          channels: [expect.objectContaining({ name: "Noise", type: "noise", notes: ["K"] })]
        })]
      })
    ]));
    expect((result.project.data.audioItems as Array<{ id: string }>).filter((item) => (
      item.id === "gb-audio-builtin-crash"
    ))).toHaveLength(1);
    expect(result.project.data.dialogues).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "gb_dialogue_1", choices: ["Sim", "Nao"] }),
      expect.objectContaining({ key: "gb_dialogue_2", text: "Ainda nao." })
    ]));
    expect(result.report.unsupportedEventCount).toBe(0);
  });

  it("preserves mixed GB Studio scene types, full dimensions and out-of-viewport entities", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "MixedRuntime");
    const sourceProjectPath = path.join(sourceRoot, "MixedRuntime.gbsproj");

    await writeJson(sourceProjectPath, { _resourceType: "project", name: "Mixed Runtime" });
    await writeJson(path.join(sourceRoot, "project", "settings.gbsres"), {
      _resourceType: "settings",
      startSceneId: "scene-topdown"
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "topdown", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-topdown",
      symbol: "scene_topdown",
      type: "TOPDOWN",
      width: 2,
      height: 2,
      collisions: "004+"
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "shmup", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-shmup",
      symbol: "scene_shmup",
      type: "SHMUP",
      width: 80,
      height: 2,
      collisions: "00a0+"
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "shmup", "actors", "enemy.gbsres"), {
      _resourceType: "actor",
      id: "actor-enemy",
      name: "Enemy",
      x: 70,
      y: 1
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "shmup", "triggers", "exit.gbsres"), {
      _resourceType: "trigger",
      id: "trigger-exit",
      name: "Exit",
      x: 75,
      y: 0,
      width: 10,
      height: 2
    });

    const result = await importGBStudioProject(sourceProjectPath);
    const rooms = result.project.data.rooms as Array<Record<string, unknown>>;

    expect(rooms.map((room) => room.sceneType)).toEqual(["topdown", "shmup"]);
    expect(rooms.find((room) => room.name === "scene_topdown")).toMatchObject({
      cameraMode: "follow_player"
    });
    expect(rooms.find((room) => room.name === "scene_shmup")).toMatchObject({
      sceneType: "shmup",
      cameraMode: "fixed_center",
      width: 80,
      height: 2
    });
    expect((result.project.data.actors as Array<Record<string, unknown>>)[0]).toMatchObject({
      x: 70,
      y: 1
    });
    expect((result.project.data.triggers as Array<Record<string, unknown>>)[0]).toMatchObject({
      x: 75,
      width: 10,
      height: 2
    });
    expect(result.report.diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "runtime-placeholder-consolidated",
        message: expect.stringContaining("unico runtime")
      })
    ]));
  });

  it("inherits sparse actor prefab sprites and update scripts", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "ActorPrefab");
    const sourceProjectPath = path.join(sourceRoot, "ActorPrefab.gbsproj");

    await writeJson(sourceProjectPath, { _resourceType: "project", name: "Actor Prefab" });
    await writeJson(path.join(sourceRoot, "project", "scenes", "main", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-main",
      symbol: "scene_main",
      type: "TOPDOWN",
      width: 2,
      height: 2,
      collisions: "004+"
    });
    await writeJson(path.join(sourceRoot, "project", "actorPrefabs", "walker.gbsres"), {
      _resourceType: "actorPrefab",
      id: "prefab-walker",
      spriteSheetId: "sprite-walker",
      updateScript: [{ id: "update-wait", command: "EVENT_WAIT", args: { frames: 12 } }]
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "main", "actors", "walker.gbsres"), {
      _resourceType: "actor",
      id: "actor-walker",
      name: "Walker",
      prefabId: "prefab-walker",
      x: 0,
      y: 0
    });
    await writeJson(path.join(sourceRoot, "assets", "sprites", "walker.png.gbsres"), {
      _resourceType: "sprite",
      id: "sprite-walker",
      filename: "walker.png",
      width: 16,
      height: 16,
      canvasWidth: 16,
      canvasHeight: 16,
      states: [{
        id: "state-walker",
        name: "Default",
        animationType: "fixed",
        animations: [{ id: "animation-walker", frames: [{ id: "frame-walker", tiles: [{ id: "tile-walker", x: 0, y: 0, sliceX: 0, sliceY: 0 }] }] }]
      }]
    });
    await mkdir(path.join(sourceRoot, "assets", "sprites"), { recursive: true });
    await writeFile(path.join(sourceRoot, "assets", "sprites", "walker.png"), "sprite", "utf8");

    const result = await importGBStudioProject(sourceProjectPath);
    const [actor] = result.project.data.actors as Array<Record<string, unknown>>;
    const updateEvent = (result.project.data.events as Array<{ name: string; steps: Array<{ command: string }> }>)
      .find((event) => event.name === "actor_actor_walker_on_update");

    expect(actor).toMatchObject({
      spriteSheet: "walker.png",
      gbStudioPrefabID: "prefab-walker",
      eventBindings: { onUpdate: "actor_actor_walker_on_update" }
    });
    expect(updateEvent?.steps.map((step) => step.command)).toEqual(["wait 12"]);
  });

  it("preserves dynamic sprite swaps, actor emotes and GB Studio animation ticks", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "ActorVisualEvents");
    const sourceProjectPath = path.join(sourceRoot, "ActorVisualEvents.gbsproj");

    await writeJson(sourceProjectPath, { _resourceType: "project", name: "Actor Visual Events" });
    await writeJson(path.join(sourceRoot, "project", "settings.gbsres"), {
      _resourceType: "settings",
      startSceneId: "scene-space"
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "space", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-space",
      symbol: "scene_space",
      type: "SHMUP",
      width: 80,
      height: 18,
      collisions: "0"
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "space", "actors", "drone.gbsres"), {
      _resourceType: "actor",
      id: "actor-drone",
      symbol: "actor_drone",
      name: "Drone",
      x: 10,
      y: 6,
      spriteSheetId: "sprite-drone",
      script: [
        { id: "swap", command: "EVENT_ACTOR_SET_SPRITE", args: { actorId: "$self$", spriteSheetId: "sprite-explosion" } },
        { id: "emote", command: "EVENT_ACTOR_EMOTE", args: { actorId: "$self$", emoteId: "emote-alert" } },
        { id: "normal-speed", command: "EVENT_ACTOR_SET_ANIMATION_SPEED", args: { actorId: "$self$", speed: 15 } },
        { id: "slow-speed", command: "EVENT_ACTOR_SET_ANIMATION_SPEED", args: { actorId: "$self$", speed: 255 } }
      ]
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "space", "triggers", "warning.gbsres"), {
      _resourceType: "trigger",
      id: "trigger-warning",
      symbol: "trigger_warning",
      x: 1,
      y: 1,
      width: 1,
      height: 1,
      script: [
        { id: "player-emote", command: "EVENT_ACTOR_EMOTE", args: { actorId: "$self$", emoteId: "emote-alert" } }
      ]
    });

    const spriteResource = (id: string, filename: string) => ({
      _resourceType: "sprite",
      id,
      filename,
      width: 16,
      height: 16,
      canvasWidth: 16,
      canvasHeight: 16,
      animSpeed: 15,
      states: [{
        id: `${id}-state`,
        name: "Default",
        animationType: "fixed",
        animations: [{ id: `${id}-animation`, frames: [{ id: `${id}-frame`, tiles: [{ id: `${id}-tile`, x: 0, y: 0, sliceX: 0, sliceY: 0 }] }] }]
      }]
    });
    await writeJson(path.join(sourceRoot, "assets", "sprites", "drone.png.gbsres"), spriteResource("sprite-drone", "drone.png"));
    await writeJson(path.join(sourceRoot, "assets", "sprites", "explosion.png.gbsres"), spriteResource("sprite-explosion", "explosion.png"));
    await writeJson(path.join(sourceRoot, "assets", "emotes", "alert.png.gbsres"), {
      _resourceType: "emote",
      id: "emote-alert",
      filename: "alert.png"
    });
    await mkdir(path.join(sourceRoot, "assets", "sprites"), { recursive: true });
    await mkdir(path.join(sourceRoot, "assets", "emotes"), { recursive: true });
    await writeFile(path.join(sourceRoot, "assets", "sprites", "drone.png"), "sprite", "utf8");
    await writeFile(path.join(sourceRoot, "assets", "sprites", "explosion.png"), "sprite", "utf8");
    await writeFile(path.join(sourceRoot, "assets", "emotes", "alert.png"), "emote", "utf8");

    const result = await importGBStudioProject(sourceProjectPath);
    const events = result.project.data.events as Array<{ name: string; steps: Array<{ command: string }> }>;
    const actorEvent = events.find((event) => event.name === "actor_drone_on_interact");
    const triggerEvent = events.find((event) => event.name === "trigger_warning_on_enter");

    expect(actorEvent?.steps.map((step) => step.command)).toEqual([
      "set_actor_sprite Drone explosion.png",
      "show_actor_gesture Drone alert.png 60",
      "set_actor_animation_speed Drone 100",
      "set_actor_animation_speed Drone 6"
    ]);
    expect(triggerEvent?.steps.map((step) => step.command)).toEqual([
      "show_actor_gesture Player alert.png 60"
    ]);
    expect(result.report.unsupportedEventCount).toBe(0);
  });

  it("preserves GB Studio overlay coordinates and movement duration in scene scripts", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "OverlayScene");
    const sourceProjectPath = path.join(sourceRoot, "OverlayScene.gbsproj");

    await writeJson(sourceProjectPath, {
      _resourceType: "project",
      name: "Overlay Scene",
      _version: "4.2.0",
      _release: "10"
    });
    await writeJson(path.join(sourceRoot, "project", "settings.gbsres"), {
      _resourceType: "settings",
      startSceneId: "scene-logo"
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "logo", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-logo",
      name: "Logo",
      symbol: "farol_prologo",
      type: "TOPDOWN",
      width: 20,
      height: 18,
      collisions: "00168+",
      script: [
        { id: "show", command: "EVENT_OVERLAY_SHOW", args: { color: "black", x: 0, y: 0 } },
        { id: "move", command: "EVENT_OVERLAY_MOVE_TO", args: { x: 0, y: 18, speed: 1 } },
        { id: "hide", command: "EVENT_OVERLAY_HIDE", args: {} }
      ]
    });

    const result = await importGBStudioProject(sourceProjectPath);
    const events = result.project.data.events as Array<{ name: string; steps: Array<{ command: string }> }>;

    expect(events.find((event) => event.name === "farol_prologo_on_enter")?.steps.map((step) => step.command)).toEqual([
      "overlay_show 0 0 240 160",
      "overlay_move 0 160 160",
      "overlay_hide 0"
    ]);
    expect(result.report.diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "unsupported-event",
        sourceCommand: expect.stringMatching(/^EVENT_OVERLAY_/)
      })
    ]));
    expect(result.report).toMatchObject({ translatedEventCount: 3, unsupportedEventCount: 0 });
  });

  it("preserves scripted player activation, position, movement and direction", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "PlayerCommands");
    const sourceProjectPath = path.join(sourceRoot, "PlayerCommands.gbsproj");

    await writeJson(sourceProjectPath, { _resourceType: "project", name: "Player Commands" });
    await writeJson(path.join(sourceRoot, "project", "settings.gbsres"), {
      _resourceType: "settings",
      startSceneId: "scene-main"
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "main", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-main",
      name: "Main",
      symbol: "scene_main",
      type: "TOPDOWN",
      width: 32,
      height: 18,
      collisions: "0090+",
      script: [
        { id: "off", command: "EVENT_ACTOR_DEACTIVATE", args: { actorId: "player" } },
        { id: "position", command: "EVENT_ACTOR_SET_POSITION", args: { actorId: "player", x: 12, y: 7 } },
        {
          id: "relative",
          command: "EVENT_ACTOR_MOVE_RELATIVE",
          args: {
            actorId: "player",
            x: { type: "number", value: 2 },
            y: { type: "number", value: -1 }
          }
        },
        { id: "move-to", command: "EVENT_ACTOR_MOVE_TO", args: { actorId: "player", x: 20, y: 8 } },
        {
          id: "direction",
          command: "EVENT_ACTOR_SET_DIRECTION",
          args: { actorId: "player", direction: { type: "direction", value: "right" } }
        },
        { id: "on", command: "EVENT_ACTOR_ACTIVATE", args: { actorId: "player" } }
      ]
    });

    const result = await importGBStudioProject(sourceProjectPath);
    const events = result.project.data.events as Array<{ name: string; steps: Array<{ command: string }> }>;

    expect(events.find((event) => event.name === "scene_main_on_enter")?.steps.map((step) => step.command)).toEqual([
      "set_actor_active Player false",
      "set_actor_position Player 12 7",
      "move_actor_relative Player 2 -1",
      "move_actor_to Player 20 8",
      "set_actor_direction Player right",
      "set_actor_active Player true"
    ]);
    expect(result.report).toMatchObject({ translatedEventCount: 6, unsupportedEventCount: 0 });
  });

  it("preserves GB Studio subpixel player speed and collision-aware actor pushes", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "PlayerSpeedAndPush");
    const sourceProjectPath = path.join(sourceRoot, "PlayerSpeedAndPush.gbsproj");

    await writeJson(sourceProjectPath, { _resourceType: "project", name: "Player Speed And Push" });
    await writeJson(path.join(sourceRoot, "project", "settings.gbsres"), {
      _resourceType: "settings",
      startSceneId: "scene-main"
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "main", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-main",
      name: "Main",
      symbol: "scene_main",
      type: "TOPDOWN",
      width: 32,
      height: 18,
      collisions: "0090+",
      script: [
        { id: "half-speed", command: "EVENT_ACTOR_SET_MOVEMENT_SPEED", args: { actorId: "$self$", speed: 0.5 } },
        { id: "normal-speed", command: "EVENT_ACTOR_SET_MOVEMENT_SPEED", args: { actorId: "player", speed: 1 } }
      ]
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "main", "actors", "rock.gbsres"), {
      _resourceType: "actor",
      id: "actor-rock",
      name: "Rock",
      symbol: "actor_rock",
      x: 4,
      y: 7,
      script: [
        { id: "push-two", command: "EVENT_ACTOR_PUSH", args: { continue: false } },
        { id: "push-until", command: "EVENT_ACTOR_PUSH", args: { continue: true } }
      ]
    });

    const result = await importGBStudioProject(sourceProjectPath);
    const events = result.project.data.events as Array<{ name: string; steps: Array<{ command: string }> }>;

    expect(events.find((event) => event.name === "scene_main_on_enter")?.steps.map((step) => step.command)).toEqual([
      "set_actor_active Player true",
      "set_actor_movement_speed Player 50",
      "set_actor_active Player true",
      "set_actor_movement_speed Player 100"
    ]);
    expect(events.find((event) => event.name === "actor_rock_on_interact")?.steps.map((step) => step.command)).toEqual([
      "set_actor_active Rock true",
      "push_actor_away_from_player Rock 2",
      "set_actor_active Rock true",
      "push_actor_away_from_player Rock 100"
    ]);
    expect(result.report).toMatchObject({ translatedEventCount: 4, unsupportedEventCount: 0 });
  });

  it("preserves GB Studio platformer callbacks, timers and structured control flow", async () => {
    const root = await makeTemporaryRoot();
    const sourceRoot = path.join(root, "PlatformerControlFlow");
    const sourceProjectPath = path.join(sourceRoot, "PlatformerControlFlow.gbsproj");

    await writeJson(sourceProjectPath, { _resourceType: "project", name: "Platformer Control Flow" });
    await writeJson(path.join(sourceRoot, "project", "settings.gbsres"), {
      _resourceType: "settings",
      startSceneId: "scene-stage"
    });
    await writeJson(path.join(sourceRoot, "project", "scenes", "stage", "scene.gbsres"), {
      _resourceType: "scene",
      id: "scene-stage",
      name: "Stage",
      symbol: "scene_stage",
      type: "PLATFORM",
      width: 80,
      height: 18,
      collisions: "001440+",
      script: [
        { id: "blank", command: "EVENT_PLATFORMER_STATE_SET", args: { state: "blank" } },
        {
          id: "knockback-callback",
          command: "EVENT_SET_PLATFORMER_CALLBACK_SCRIPT",
          args: { event: "knockbackStart" },
          children: { script: [{ id: "knockback-wait", command: "EVENT_WAIT", args: { frames: 2 } }] }
        },
        {
          id: "blank-callback",
          command: "EVENT_SET_PLATFORMER_CALLBACK_SCRIPT",
          args: { event: "blankStart" },
          children: { script: [{ id: "blank-wait", command: "EVENT_WAIT", args: { frames: 3 } }] }
        },
        {
          id: "input",
          command: "EVENT_IF_INPUT",
          args: { input: ["up"] },
          children: {
            true: [{ id: "input-true", command: "EVENT_WAIT", args: { frames: 4 } }],
            false: [{ id: "input-false", command: "EVENT_WAIT", args: { frames: 5 } }]
          }
        },
        { id: "seed", command: "EVENT_RNG_SEED", args: {} },
        {
          id: "loop",
          command: "EVENT_LOOP",
          args: {},
          children: { true: [{ id: "loop-wait", command: "EVENT_WAIT", args: { frames: 6 } }] }
        },
        {
          id: "timer",
          command: "EVENT_SET_TIMER_SCRIPT",
          args: { timer: 1, duration: 0.3 },
          children: { script: [{ id: "timer-wait", command: "EVENT_WAIT", args: { frames: 7 } }] }
        },
        {
          id: "random",
          command: "EVENT_VARIABLE_MATH",
          args: { vectorX: "T0", operation: "set", other: "rnd", minValue: "0", maxValue: "5" }
        },
        {
          id: "switch",
          command: "EVENT_SWITCH",
          args: { variable: "T0", choices: 1, value0: { type: "number", value: 1 } },
          children: {
            true0: [{ id: "case-wait", command: "EVENT_WAIT", args: { frames: 8 } }],
            false: [{ id: "else-wait", command: "EVENT_WAIT", args: { frames: 9 } }]
          }
        },
        { id: "ground", command: "EVENT_PLATFORMER_STATE_SET", args: { state: "ground" } },
        {
          id: "engine-field",
          command: "EVENT_ENGINE_FIELD_SET",
          args: { engineFieldKey: "plat_blank_grav", value: { type: "number", value: 1802 } }
        },
        {
          id: "tile-sequence",
          command: "EVENT_REPLACE_TILE_XY_SEQUENCE",
          args: {
            x: { type: "number", value: 22 },
            y: { type: "number", value: 6 },
            tileIndex: { type: "number", value: 0 },
            frames: { type: "number", value: 4 },
            variable: "L0",
            tilesetId: "tileset-blank"
          }
        },
        {
          id: "if-saved",
          command: "EVENT_IF_SAVED_DATA",
          args: { saveSlot: 0 },
          children: {
            true: [{ id: "saved-true", command: "EVENT_LOAD_DATA", args: { saveSlot: 0 } }],
            false: [{ id: "saved-false", command: "EVENT_WAIT", args: { frames: 11 } }]
          }
        }
      ]
    });
    await writeJson(path.join(sourceRoot, "assets", "tilesets", "blank_tiles.png.gbsres"), {
      _resourceType: "tileset",
      id: "tileset-blank",
      name: "Blank Tiles",
      filename: "blank_tiles.png"
    });
    await writeFile(path.join(sourceRoot, "assets", "tilesets", "blank_tiles.png"), "fake-png", "utf8");

    const result = await importGBStudioProject(sourceProjectPath);
    const events = result.project.data.events as Array<{ name: string; steps: Array<{ command: string }> }>;
    const main = events.find((event) => event.name === "scene_stage_on_enter");

    expect(main?.steps.map((step) => step.command.split(" ")[0])).toEqual([
      "set_platformer_state",
      "attach_platform_callback",
      "attach_platform_callback",
      "if_button",
      "wait",
      "else",
      "wait",
      "condition_end",
      "seed_random",
      "loop_begin",
      "wait",
      "loop_end",
      "timer_attach",
      "random_variable",
      "switch_variable",
      "set_platformer_state",
      "set_engine_field",
      "replace_tile_animation",
      "if_save_game",
      "load_game",
      "else",
      "wait",
      "condition_end"
    ]);
    expect(events.filter((event) => event.name.includes("_platform_callback_")).map((event) => event.steps[0]?.command))
      .toEqual(["wait 2", "wait 3"]);
    expect(events.find((event) => event.name.includes("_timer_"))?.steps[0]?.command).toBe("wait 7");
    expect(events.filter((event) => event.name.includes("_switch_")).map((event) => event.steps[0]?.command))
      .toEqual(["wait 8", "wait 9"]);
    expect(main?.steps.find((step) => step.command.startsWith("replace_tile_animation"))?.command)
      .toBe("replace_tile_animation 22 6 0 4 l0 blank_tiles.png");
    expect(result.report).toMatchObject({ translatedEventCount: 23, unsupportedEventCount: 0 });
  });
});
