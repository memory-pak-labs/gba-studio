import { describe, expect, it } from "vitest";
import { deriveAudioWorkspacePresentation } from "./audioWorkspace.js";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";
import { deriveFilesWorkspacePresentation } from "./filesWorkspace.js";
import { createBlankProjectData } from "./newProject.js";
import { SCENE_TYPE_OPTIONS } from "./sceneTypes.js";
import { summarizeGBAProject } from "./projectFile.js";
import { validateGBAProjectMigrationContract } from "../../../../packages/project-contract/src/index.js";
import { deriveRoomsWorkspacePresentation } from "./roomsWorkspace.js";
import { deriveSettingsWorkspacePresentation } from "./settingsWorkspace.js";
import { deriveSpritesWorkspacePresentation } from "./spritesWorkspace.js";

describe("createBlankProjectData", () => {
  it("cria um projeto em branco valido para abrir direto no Editor", () => {
    const project = createBlankProjectData({ name: "Novo projeto", exportFolder: "/tmp/gba-studio" });

    expect(summarizeGBAProject(project)).toEqual({
      schemaVersion: 1,
      name: "Novo projeto",
      rooms: 1,
      assets: 13
    });
    expect(validateGBAProjectMigrationContract(project)).toEqual([]);

    const rooms = deriveRoomsWorkspacePresentation(project);
    expect(rooms.summary.roomCount).toBe(1);
    expect(rooms.summary.activeRoomName).toBe("cena_1");
    expect(rooms.summary.startRoomName).toBe("cena_1");
    expect((project.scenas as Record<string, unknown>[])[0]).toMatchObject({ cameraZoom: 100 });
    expect(rooms.rooms[0]?.tileCells).toHaveLength(600);
    expect(rooms.rooms[0]?.playerActorName).toBe("Player");
    expect(rooms.entities[0]).toMatchObject({
      name: "Player",
      roomName: "cena_1",
      spriteSheet: "player_topdown_4dir.png",
      animationName: "idle_down"
    });
    expect((project.settings as { general?: { startScene?: string } } | undefined)?.general?.startScene).toBe("cena_1");

    const files = deriveFilesWorkspacePresentation(project);
    expect(files.assets.map((asset) => asset.name)).toEqual([
      "player_topdown_4dir.png",
      "player_platformer.png",
      "player_shmup.png",
      "actor_isometric.png",
      "actor_point_click.png",
      "nara-racer.png",
      "nara-fighter.png",
      "cursor_point_click.png",
      "portrait.png",
      "dialogue_box.png",
      "dialogue_selector.png",
      "gba-dialogue-font-v3.png",
      "gba-variable-font.png"
    ]);
    expect(files.assets
      .filter((asset) => !["portrait.png", "gba-variable-font.png"].includes(asset.name))
      .every((asset) => asset.isUsed)).toBe(true);
    expect(files.assets.find((asset) => asset.name === "portrait.png")?.isUsed).toBe(false);
    expect(files.assets.filter((asset) => asset.kind === "Sprite")).toEqual([
      expect.objectContaining({
        name: "player_topdown_4dir.png",
        source: "Assets/sprites/player_topdown_4dir.png",
        bundledDefaultAsset: "topdown-player-4dir",
        previewKind: "image",
        usageLabels: expect.arrayContaining(["Ator: Player"])
      }),
      expect.objectContaining({
        name: "player_platformer.png",
        source: "Assets/sprites/player_platformer.png",
        bundledDefaultAsset: "platformer-player",
        previewKind: "image"
      }),
      expect.objectContaining({
        name: "player_shmup.png",
        source: "Assets/sprites/player_shmup.png",
        bundledDefaultAsset: "shmup-player",
        previewKind: "image"
      }),
      expect.objectContaining({
        name: "actor_isometric.png",
        source: "Assets/sprites/actor_isometric.png",
        bundledDefaultAsset: "isometric-actor",
        previewKind: "image"
      }),
      expect.objectContaining({
        name: "actor_point_click.png",
        source: "Assets/sprites/actor_point_click.png",
        bundledDefaultAsset: "point-click-actor",
        previewKind: "image"
      }),
      expect.objectContaining({
        name: "nara-racer.png",
        source: "Assets/sprites/nara-racer.png",
        bundledDefaultAsset: "template:exemplo-gba/Assets/sprites/nara-racer.png",
        previewKind: "image"
      }),
      expect.objectContaining({
        name: "nara-fighter.png",
        source: "Assets/sprites/nara-fighter.png",
        bundledDefaultAsset: "template:exemplo-gba/Assets/sprites/nara-fighter.png",
        previewKind: "image"
      }),
      expect.objectContaining({
        name: "cursor_point_click.png",
        source: "Assets/sprites/cursor_point_click.png",
        bundledDefaultAsset: "point-click-cursor",
        previewKind: "image"
      })
    ]);
    expect(files.assets.find((asset) => asset.name === "portrait.png")).toMatchObject({
      kind: "Portrait",
      source: "Assets/portraits/portrait.png",
      bundledDefaultAsset: "dialogue-portrait",
      previewKind: "image"
    });
    expect(files.assets.filter((asset) => asset.kind === "FONT")).toEqual([
      expect.objectContaining({
        name: "gba-dialogue-font-v3.png",
        source: "Assets/fonts/gba-dialogue-font-v3.png",
        bundledDefaultAsset: "template:exemplo-gba/Assets/fonts/gba-dialogue-font-v3.png",
        previewKind: "image",
        isUsed: true
      }),
      expect.objectContaining({
        name: "gba-variable-font.png",
        source: "Assets/fonts/gba-variable-font.png",
        bundledDefaultAsset: "template:exemplo-gba/Assets/fonts/gba-variable-font.png",
        previewKind: "image"
      })
    ]);

    const sprites = deriveSpritesWorkspacePresentation(project);
    expect(sprites.summary.spriteSheetCount).toBe(8);
    expect(sprites.summary.animationCount).toBe(28);
    expect(sprites.summary.animationStateCount).toBe(7);
    expect(sprites.animationsBySheet["player_topdown_4dir.png"].map((animation) => animation.name)).toEqual([
      "idle_down",
      "idle_left",
      "idle_right",
      "idle_up",
      "walk_down",
      "walk_left",
      "walk_right",
      "walk_up"
    ]);
    const topdownPlayerAnimations = (project.animations as Record<string, unknown>[])
      .filter((animation) => animation.spriteSheet === "player_topdown_4dir.png");
    expect(topdownPlayerAnimations).toHaveLength(8);
    for (const animation of topdownPlayerAnimations) {
      expect(animation).toMatchObject({
        originX: 0,
        originY: 0,
        hitboxX: 0,
        hitboxY: 0,
        hitboxWidth: 16,
        hitboxHeight: 8
      });
      for (const frame of animation.frames as Record<string, unknown>[]) {
        expect(frame).toMatchObject({ originX: 0, originY: 0 });
      }
    }
    expect((project.animations as Record<string, unknown>[]).find(
      (animation) => animation.spriteSheet === "actor_point_click.png"
    )).toMatchObject({
      name: "point_click_actor_idle",
      originX: 0,
      originY: 0,
      hitboxX: 0,
      hitboxY: 0,
      hitboxWidth: 16,
      hitboxHeight: 16,
      frames: [expect.objectContaining({ originX: 0, originY: 0 })]
    });
    expect((project.animationStates as Record<string, unknown>[])[0]).toMatchObject({
      id: "state-player-default",
      name: "default",
      spriteSheet: "player_topdown_4dir.png",
      animationType: "four_direction_movement",
      mirrorLeftFromRight: true,
      animationIDs: [
        "animation-player-idle-down",
        "animation-player-idle-up",
        "animation-player-idle-right",
        "animation-player-idle-left",
        "animation-player-walk-down",
        "animation-player-walk-up",
        "animation-player-walk-right",
        "animation-player-walk-left"
      ]
    });
    expect((project.animationStates as Record<string, unknown>[])[1]).toMatchObject({
      id: "state-player-point-click",
      animationType: "fixed",
      spriteSheet: "actor_point_click.png"
    });
    expect((project.actors as Record<string, unknown>[])[0]).toMatchObject({
      animationStateID: "state-player-default"
    });
    expect(deriveEventsWorkspacePresentation(project).summary.eventCount).toBe(0);
    expect(deriveAudioWorkspacePresentation(project).summary.audioCount).toBe(0);

    const settings = deriveSettingsWorkspacePresentation(project);
    expect(settings.summary.startScene).toBe("cena_1");
    expect(settings.summary.exportFolder).toBe("/tmp/gba-studio");
    expect(settings.summary.engineBackend).toBe("gbastudio_engine");
    expect((project.settings as Record<string, Record<string, unknown>>).pointAndClick.cursorImage).toBe(
      "cursor_point_click.png"
    );
    const projectSettings = project.settings as { sceneTypes?: { enabled?: Record<string, boolean> } };
    expect(Object.keys(projectSettings.sceneTypes?.enabled ?? {}).sort()).toEqual(SCENE_TYPE_OPTIONS.map((option) => option.id).sort());
    expect((project.settings as {
      sceneTypes?: { defaultPlayerSprites?: Record<string, string> };
    }).sceneTypes?.defaultPlayerSprites).toMatchObject({
      topdown: "player_topdown_4dir.png",
      platformer: "player_platformer.png",
      pointAndClick: "actor_point_click.png",
      shmup: "player_shmup.png",
      isometric: "actor_isometric.png",
      racing: "nara-racer.png",
      luta: "nara-fighter.png",
      cutscene: ""
    });
    expect(settings.sections.find((section) => section.id === "uiDialogs")?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Imagem caixa", value: "dialogue_box.png" }),
        expect.objectContaining({ label: "Imagem seletor", value: "dialogue_selector.png" }),
        expect.objectContaining({ label: "Titulo menu Start", value: "Menu" }),
        expect.objectContaining({ label: "Exibir Itens no Start", value: "nao" }),
        expect.objectContaining({ label: "Exibir Mapa no Start", value: "nao" })
      ])
    );
  });

  it.each([
    {
      sceneType: "topdown",
      spriteSheet: "player_topdown_4dir.png",
      animationStateID: "state-player-default",
      animationName: "idle_down"
    },
    {
      sceneType: "platformer",
      spriteSheet: "player_platformer.png",
      animationStateID: "state-player-platformer",
      animationName: "idle_right"
    },
    {
      sceneType: "pointAndClick",
      spriteSheet: "actor_point_click.png",
      animationStateID: "state-player-point-click",
      animationName: "point_click_actor_idle"
    },
    {
      sceneType: "shmup",
      spriteSheet: "player_shmup.png",
      animationStateID: "state-player-shmup",
      animationName: "idle"
    },
    {
      sceneType: "isometric",
      spriteSheet: "actor_isometric.png",
      animationStateID: "state-player-isometric",
      animationName: "idle_down_left"
    },
    {
      sceneType: "racing",
      spriteSheet: "nara-racer.png",
      animationStateID: "state-player-racing",
      animationName: "idle"
    },
    {
      sceneType: "luta",
      spriteSheet: "nara-fighter.png",
      animationStateID: "state-player-luta",
      animationName: "idle"
    }
  ])("gera o ator Player padrão para a cena $sceneType", (expected) => {
    const project = createBlankProjectData({ name: `Projeto ${expected.sceneType}`, sceneType: expected.sceneType });
    const room = (project.scenas as Record<string, unknown>[])[0];
    const actor = (project.actors as Record<string, unknown>[])[0];

    expect(room).toMatchObject({ sceneType: expected.sceneType, playerActorName: "Player" });
    expect(actor).toMatchObject({
      name: "Player",
      roomName: "cena_1",
      spriteSheet: expected.spriteSheet,
      animationStateID: expected.animationStateID,
      animationName: expected.animationName
    });
    expect((project.settings as Record<string, Record<string, unknown>>).general).toMatchObject({
      startSceneType: expected.sceneType,
      startPlayer: "Player"
    });
  });

  it("não cria Player em cenas em branco que não possuem entidade controlada", () => {
    const project = createBlankProjectData({ name: "Cutscene em branco", sceneType: "cutscene" });

    expect(project.actors).toEqual([]);
    expect((project.scenas as Record<string, unknown>[])[0]).not.toHaveProperty("playerActorName");
    expect((project.settings as Record<string, Record<string, unknown>>).general).toMatchObject({
      startSceneType: "cutscene",
      startPlayer: ""
    });
  });

  it("normaliza nomes vazios e gera um nome de ROM seguro", () => {
    const project = createBlankProjectData({ name: "  Meu Jogo: Alpha!  " });

    expect(project.name).toBe("Meu Jogo: Alpha!");
    const settings = project.settings as Record<string, Record<string, unknown>>;
    expect(settings.build).toMatchObject({
      romFileName: "meu_jogo_alpha.gba",
      gameCode: "GBS0",
      makerCode: "00",
      romVersion: 0
    });
    expect(settings.save).not.toHaveProperty("useChecksum");
  });
});
