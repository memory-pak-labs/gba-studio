import { describe, expect, it } from "vitest";
import {
  buildEngineDialogueCharacterSound,
  buildEngineDialogueFrameIndex,
  buildEngineDialogueTextSpeedFrames,
  buildEngineDialogueUiConfig,
  buildEngineDialogueWrapColumns,
  buildEngineDialogueWrapLines,
  buildEngineInteractButton,
  buildEnginePlatformerPhysicsConfig,
  buildEngineProjectSaveConfig,
  buildEngineTopdownActorSizePx,
  buildEngineTopdownPlayerSpeed,
  dialoguePreviewBoxLayout,
  dialoguePreviewLayoutForSettings,
  dialoguePreviewNameLabelLayout,
  dialoguePreviewPortraitSourceRect,
  dialoguePreviewPortraitSlotLayout,
  resolveDialogueUiSettings,
  resolveSceneRuntimePreviewProfile,
  previewExportStatusForSceneType,
  resolveSceneRuntimeExport,
  roomMatchesExportKind
} from "./sceneRuntimeExport.js";

describe("sceneRuntimeExport", () => {
  it("normaliza uma unica configuracao de dialogo para Preview e exportacao", () => {
    expect(resolveDialogueUiSettings({
      boxPosition: "Superior",
      boxWidth: 208,
      boxHeight: 32,
      selectorImage: "ui/cursor.png",
      showPortrait: false,
      portraitLayout: "fixed_slots"
    })).toEqual({
      boxImage: "ui/dialogue_box.png",
      selectorImage: "ui/cursor.png",
      font: "GBA padrao",
      boxPosition: "Superior",
      boxWidth: 208,
      boxHeight: 32,
      showPortrait: false,
      showCharacterName: true,
      portraitPosition: "Esquerda",
      portraitLayout: "fixed_slots",
      nameLabelMode: "inline",
      textSpeed: "Normal"
    });
  });

  it("centraliza o perfil que o Preview compartilha com a exportacao", () => {
    expect(resolveSceneRuntimePreviewProfile("Plataforma")).toEqual({
      sceneType: "platformer",
      movement: "side_scroll",
      projection: "orthographic",
      exportStatus: "native",
      capabilities: ["tile_collision", "actor_interaction", "trigger_overlap", "gravity_preview", "affine_background_preview"],
      preflightProfileId: "platformer",
      preflightLayerIds: ["background", "obstacles", "collision", "actors"]
    });
    expect(resolveSceneRuntimePreviewProfile("Dungeon Crawler")).toEqual({
      sceneType: "dungeonCrawler",
      movement: "step_and_turn",
      projection: "first_person_grid",
      exportStatus: "native",
      capabilities: ["tile_collision", "actor_interaction", "trigger_overlap", "relative_grid_movement", "affine_background_preview"],
      preflightProfileId: "dungeonCrawler",
      preflightLayerIds: ["corridor", "collision", "actors", "hud"]
    });
    expect(resolveSceneRuntimePreviewProfile("Isométrico")).toEqual({
      sceneType: "isometric",
      movement: "eight_way_diagonal",
      projection: "isometric",
      exportStatus: "native",
      capabilities: ["tile_collision", "actor_interaction", "trigger_overlap", "isometric_projection", "affine_background_preview"],
      preflightProfileId: "isometric",
      preflightLayerIds: ["surface", "foreground", "height", "actors"]
    });
    expect(resolveSceneRuntimePreviewProfile("shmup")).toEqual({
      sceneType: "shmup",
      movement: "horizontal_scroll",
      projection: "orthographic",
      exportStatus: "native",
      capabilities: [
        "tile_collision",
        "actor_interaction",
        "trigger_overlap",
        "hud_bg0",
        "actors_obj",
        "obstacles_bg1",
        "collision_data",
        "affine_tiled_background",
        "affine_background_preview"
      ],
      preflightProfileId: "shmup",
      preflightLayerIds: ["hud", "obstacles", "actors", "background", "collision"]
    });
    expect(resolveSceneRuntimePreviewProfile("luta")).toEqual({
      sceneType: "luta",
      movement: "fighting",
      projection: "battle_stage",
      exportStatus: "native",
      capabilities: [
        "actor_interaction",
        "fighting_state",
        "camera_follow",
        "hud_bg0",
        "actors_obj",
        "affine_background_preview"
      ],
      preflightProfileId: "luta",
      preflightLayerIds: ["background", "collision", "actors", "hud"]
    });
  });

  it("maps platformer to the native platformer export kind", () => {
    expect(resolveSceneRuntimeExport("Plataforma")).toMatchObject({
      sceneType: "platformer",
      kind: "platformer",
      runtimeProfile: "platformer",
      adapter: "platformer_project",
      adapterStatus: "native",
      templateDirName: "exported_platformer",
      projectData: "platformer_project_data.hpp"
    });
    expect(previewExportStatusForSceneType("platformer")).toBe("native");
  });

  it("carries the reusable scene capability contract into runtime export resolution", () => {
    const resolution = resolveSceneRuntimeExport("shmup");
    expect(resolution).toMatchObject({
      featureModules: ["movement", "score", "waves", "camera"],
      runtimeCapabilities: expect.arrayContaining(["shmup_score", "shmup_waves"]),
      budget: expect.objectContaining({ oam: expect.any(Number), vramBytes: expect.any(Number) })
    });
    expect(resolution.capabilityManifest.capabilities.find((capability) => capability.id === "score"))
      .toMatchObject({ status: { available: true, enabled: false, required: false, verified: true } });
    expect(resolveSceneRuntimeExport("topdown").featureModules).toEqual([
      "movement", "dialogue", "inventory", "quests", "shop", "camera"
    ]);
  });

  it("faz o Preview consumir o manifesto somente quando a cena declara opt-in", () => {
    expect(resolveSceneRuntimePreviewProfile("shmup").capabilityManifest).toBeUndefined();
    expect(resolveSceneRuntimePreviewProfile("shmup", {
      modules: [{ id: "score", enabled: true, settings: { pointsPerEnemy: 250 } }]
    }).capabilityManifest?.capabilities.find((capability) => capability.id === "score"))
      .toMatchObject({
        settings: { pointsPerEnemy: 250 },
        status: { available: true, enabled: true, required: false, verified: true }
      });
  });

  it("expõe o contrato tático opt-in e o perfil de preflight no Preview", () => {
    const preview = resolveSceneRuntimePreviewProfile("isometric", {
      gameplayMode: "tactical",
      tacticalCapabilities: [{ id: "tactical_units", enabled: true, settings: {} }],
      tacticalPresentation: { schema: 1, units: [{ actorId: "nara", sheet: "nara.png" }] }
    });

    expect(preview).toMatchObject({
      preflightProfileId: "tacticalGrid",
      preflightLayerIds: ["surface", "grid", "actors", "hud", "collision"],
      tacticalPresentation: { schema: 1, units: [{ actorId: "nara", sheet: "nara.png" }], props: [] }
    });
    expect(preview.capabilities).toContain("isometric_runtime.tactical_unit_states");
    expect(preview.capabilityManifest?.capabilities.find((capability) => capability.id === "tactical_units"))
      .toMatchObject({ status: { available: true, enabled: true, required: false, verified: true } });
  });

  it("expõe o perfil de preflight e as camadas do contrato para todos os runtimes do Preview", () => {
    expect(resolveSceneRuntimePreviewProfile("luta")).toMatchObject({
      movement: "fighting",
      projection: "battle_stage",
      preflightProfileId: "luta",
      preflightLayerIds: expect.arrayContaining(["background", "actors", "hud", "collision"])
    });
    expect(resolveSceneRuntimePreviewProfile("menu")).toMatchObject({
      movement: "menu_navigation",
      projection: "ui",
      preflightProfileId: "menu",
      preflightLayerIds: expect.arrayContaining(["background", "hud"])
    });
    expect(resolveSceneRuntimePreviewProfile("custom", { advancedCapabilities: [] })).toMatchObject({
      movement: "custom",
      projection: "custom",
      preflightProfileId: "custom",
      preflightLayerIds: expect.arrayContaining(["background", "actors", "collision"])
    });
  });

  it("maps isometric to the native isometric export kind", () => {
    expect(resolveSceneRuntimeExport("Isométrico")).toMatchObject({
      sceneType: "isometric",
      kind: "isometric",
      runtimeProfile: "isometric",
      roomRuntimeProfile: "isometric",
      adapter: "isometric_project",
      adapterStatus: "native",
      templateDirName: "exported_isometric",
      projectData: "isometric_project_data.hpp"
    });
    expect(previewExportStatusForSceneType("isometric")).toBe("native");
  });

  it("maps dungeon crawler to the native dungeon crawler export kind", () => {
    expect(resolveSceneRuntimeExport("Dungeon Crawler")).toMatchObject({
      sceneType: "dungeonCrawler",
      kind: "dungeon_crawler",
      runtimeProfile: "dungeon_crawler",
      roomRuntimeProfile: "dungeonCrawler",
      adapter: "dungeon_crawler_project",
      adapterStatus: "native",
      templateDirName: "exported_dungeon_crawler",
      projectData: "dungeon_crawler_project_data.hpp"
    });
    expect(previewExportStatusForSceneType("dungeonCrawler")).toBe("native");
  });

  it("maps racing to the native racing export kind", () => {
    expect(resolveSceneRuntimeExport("Corrida")).toMatchObject({
      sceneType: "racing",
      kind: "racing",
      runtimeProfile: "racing",
      roomRuntimeProfile: "racing",
      adapter: "racing_project",
      adapterStatus: "native",
      templateDirName: "exported_racing",
      projectData: "racing_project_data.hpp"
    });
    expect(previewExportStatusForSceneType("racing")).toBe("native");
  });

  it("maps point-and-click and shmup to native export kinds", () => {
    expect(resolveSceneRuntimeExport("Apontar e clicar")).toMatchObject({
      sceneType: "pointAndClick",
      kind: "point_click",
      runtimeProfile: "point_click",
      adapter: "point_click_project",
      adapterStatus: "native",
      templateDirName: "exported_point_click",
      projectData: "point_click_project_data.hpp"
    });
    expect(resolveSceneRuntimeExport("Shoot em Up")).toMatchObject({
      sceneType: "shmup",
      kind: "shmup",
      runtimeProfile: "shmup",
      adapter: "shmup_project",
      adapterStatus: "native",
      templateDirName: "exported_shmup",
      projectData: "shmup_project_data.hpp"
    });
    expect(previewExportStatusForSceneType("pointAndClick")).toBe("native");
    expect(previewExportStatusForSceneType("shmup")).toBe("native");
  });

  it("maps visual novel to the native visual_novel export kind", () => {
    expect(resolveSceneRuntimeExport("Visual Novel")).toMatchObject({
      sceneType: "visualNovel",
      kind: "visual_novel",
      runtimeProfile: "visual_novel",
      adapter: "visual_novel_project",
      adapterStatus: "native",
      templateDirName: "exported_visual_novel",
      projectData: "visual_novel_project_data.hpp"
    });
    expect(previewExportStatusForSceneType("visualNovel")).toBe("native");
  });

  it("maps menu to the native menu export kind", () => {
    expect(resolveSceneRuntimeExport("Menu / UI")).toMatchObject({
      sceneType: "menu",
      kind: "menu",
      runtimeProfile: "menu",
      adapter: "menu_project",
      adapterStatus: "native",
      templateDirName: "exported_menu",
      projectData: "menu_project_data.hpp"
    });
    expect(previewExportStatusForSceneType("menu")).toBe("native");
  });

  it("maps cutscene to the native cutscene export kind", () => {
    expect(resolveSceneRuntimeExport("Cutscene")).toMatchObject({
      sceneType: "cutscene",
      kind: "cutscene",
      runtimeProfile: "cutscene",
      adapter: "cutscene_project",
      adapterStatus: "native",
      templateDirName: "exported_cutscene",
      projectData: "cutscene_project_data.hpp"
    });
    expect(previewExportStatusForSceneType("cutscene")).toBe("native");
  });

  it("maps world map to the native world_map export kind", () => {
    expect(resolveSceneRuntimeExport("Mapa mundial")).toMatchObject({
      sceneType: "worldMap",
      kind: "world_map",
      runtimeProfile: "world_map",
      adapter: "world_map_project",
      adapterStatus: "native",
      templateDirName: "exported_world_map",
      projectData: "world_map_project_data.hpp"
    });
    expect(previewExportStatusForSceneType("worldMap")).toBe("native");
  });

  it("keeps topdown native and maps battle RPG to its native adapter", () => {
    expect(resolveSceneRuntimeExport("topdown")).toMatchObject({
      kind: "topdown",
      runtimeProfile: "topdown",
      adapterStatus: "native",
      adapter: "topdown_project"
    });
    expect(resolveSceneRuntimeExport("battleRpg")).toMatchObject({
      kind: "battle_rpg",
      runtimeProfile: "battle_rpg",
      roomRuntimeProfile: "battleRpg",
      adapter: "battle_rpg_project",
      adapterStatus: "native",
      templateDirName: "exported_battle_rpg",
      projectData: "battle_rpg_project_data.hpp"
    });
    expect(previewExportStatusForSceneType("topdown")).toBe("native");
    expect(previewExportStatusForSceneType("battleRpg")).toBe("native");
  });

  it("filters rooms for the winning export kind", () => {
    expect(roomMatchesExportKind("platformer", "platformer")).toBe(true);
    expect(roomMatchesExportKind("topdown", "platformer")).toBe(false);
    expect(roomMatchesExportKind("isometric", "isometric")).toBe(true);
    expect(roomMatchesExportKind("isometric", "topdown")).toBe(false);
    expect(roomMatchesExportKind("pointAndClick", "point_click")).toBe(true);
    expect(roomMatchesExportKind("pointAndClick", "topdown")).toBe(false);
    expect(roomMatchesExportKind("shmup", "shmup")).toBe(true);
    expect(roomMatchesExportKind("shmup", "topdown")).toBe(false);
    expect(roomMatchesExportKind("visualNovel", "visual_novel")).toBe(true);
    expect(roomMatchesExportKind("visualNovel", "topdown")).toBe(false);
    expect(roomMatchesExportKind("menu", "menu")).toBe(true);
    expect(roomMatchesExportKind("menu", "topdown")).toBe(false);
    expect(roomMatchesExportKind("cutscene", "cutscene")).toBe(true);
    expect(roomMatchesExportKind("cutscene", "topdown")).toBe(false);
    expect(roomMatchesExportKind("worldMap", "world_map")).toBe(true);
    expect(roomMatchesExportKind("worldMap", "topdown")).toBe(false);
    expect(roomMatchesExportKind("topdown", "isometric")).toBe(false);
    expect(roomMatchesExportKind("platformer", "topdown")).toBe(false);
  });

  it("converts settings.platformer values into engine fixed-point config", () => {
    expect(buildEnginePlatformerPhysicsConfig(null)).toEqual({
      max_run_speed_x256: 0x0180,
      acceleration_x256: 0x0040,
      friction_x256: 0x0030,
      gravity_x256: 0x0030,
      max_fall_speed_x256: 0x0400,
      jump_speed_x256: 0x0580,
      coyote_frames: 4,
      jump_buffer_frames: 5,
      ladders_enabled: true,
      max_air_jumps: 0,
      wall_jump_enabled: false,
      wall_slide_enabled: true,
      jump_min_height_x256: 0,
      jump_hold_frames: 1,
      jump_height_reduction_x256: 0,
      air_control_enabled: true,
      turn_in_air_enabled: true,
      air_deceleration_x256: 0,
      drop_through_mode: 0,
      camera_follow_directions: 15,
      camera_deadzone_x_pixels: 0,
      camera_lock_edge: 0,
      wall_slide_speed_x256: 0x0180,
      wall_jump_speed_x256: 0x0500,
      wall_jump_push_x256: 0x0300,
      dash_enabled: false,
      dash_style: 2,
      dash_momentum: 0,
      dash_through: 0,
      dash_recharge_frames: 0,
      dash_speed_x256: 0x0600,
      dash_frames: 8,
      glide_enabled: false,
      glide_fall_speed_x256: 0x0140,
      platform_actor_collision_group: 0,
      solid_actor_collision_group: 0,
      actor_gravity_enabled: false
    });
    expect(buildEnginePlatformerPhysicsConfig({
      walkSpeed: 1.5,
      acceleration: 0.25,
      gravity: 0.5,
      maxFallSpeed: 4,
      coyoteTime: 6,
      jumpBuffer: 8,
      ladders: false,
      doubleJump: true,
      wallJump: true,
      wallSlide: true,
      jumpMinHeight: 1.25,
      jumpFrames: 12,
      jumpReduction: 0.5,
      airControl: false,
      changeDirectionInAir: false,
      airDeceleration: 0.125,
      dropThrough: "down_tap",
      cameraFollow: 5,
      cameraDeadzoneX: 24,
      cameraLockEdge: "right",
      dashStyle: "air",
      dashMomentum: "both",
      dashThrough: "actors_triggers",
      dashRechargeFrames: 30,
      platformActorCollisionGroup: 2,
      solidActorCollisionGroup: 4,
      actorGravity: true,
      wallSlideSpeed: 1.25,
      wallJumpSpeed: 5.25,
      wallJumpPush: 3.5,
      dash: true,
      dashSpeed: 7,
      dashFrames: 10,
      glide: true,
      glideFallSpeed: 1.125
    })).toEqual({
      max_run_speed_x256: 384,
      acceleration_x256: 64,
      friction_x256: 0x0030,
      gravity_x256: 128,
      max_fall_speed_x256: 1024,
      jump_speed_x256: 0x0580,
      coyote_frames: 6,
      jump_buffer_frames: 8,
      ladders_enabled: false,
      max_air_jumps: 1,
      wall_jump_enabled: true,
      wall_slide_enabled: true,
      jump_min_height_x256: 320,
      jump_hold_frames: 12,
      jump_height_reduction_x256: 128,
      air_control_enabled: false,
      turn_in_air_enabled: false,
      air_deceleration_x256: 32,
      drop_through_mode: 2,
      camera_follow_directions: 5,
      camera_deadzone_x_pixels: 24,
      camera_lock_edge: 2,
      dash_style: 1,
      dash_momentum: 2,
      dash_through: 2,
      dash_recharge_frames: 30,
      platform_actor_collision_group: 2,
      solid_actor_collision_group: 4,
      actor_gravity_enabled: true,
      wall_slide_speed_x256: 320,
      wall_jump_speed_x256: 1344,
      wall_jump_push_x256: 896,
      dash_enabled: true,
      dash_speed_x256: 1792,
      dash_frames: 10,
      glide_enabled: true,
      glide_fall_speed_x256: 288
    });
  });

  it("resolves settings.topdown.walkSpeed into exportable player speed", () => {
    expect(buildEngineTopdownPlayerSpeed(null)).toBe(1);
    expect(buildEngineTopdownPlayerSpeed({})).toBe(1);
    expect(buildEngineTopdownPlayerSpeed({ walkSpeed: 1.75 })).toBe(1.75);
    expect(buildEngineTopdownPlayerSpeed({ walkSpeed: 0 })).toBe(1);
    expect(buildEngineTopdownPlayerSpeed({ walkSpeed: "2.5" })).toBe(2.5);
  });

  it("resolves settings.topdown.gridSize into actor pixel size", () => {
    expect(buildEngineTopdownActorSizePx(null)).toBe(16);
    expect(buildEngineTopdownActorSizePx({ gridSize: "8 px" })).toBe(8);
    expect(buildEngineTopdownActorSizePx({ gridSize: "16 px" })).toBe(16);
    expect(buildEngineTopdownActorSizePx({ gridSize: "12 px" })).toBe(16);
  });

  it("maps settings.save into engine SRAM save config", () => {
    expect(buildEngineProjectSaveConfig(null)).toEqual({
      enabled: true,
      autosave: true,
      signature: "GBUS",
      slot_count: 3,
      slot_capacity: 2048,
      offset: 0,
      version: 1,
      ui: {
        enabled: true,
        slotCount: 3,
        selectedSlot: 1,
        layout: "cards",
        confirmDelete: true,
        actions: { continue: "Continuar", load: "Carregar", delete: "Apagar" },
        metadata: { playerName: true, playTime: true, location: true }
      }
    });
    expect(buildEngineProjectSaveConfig({ slots: 5, autoSave: false, manualSave: true, saveType: "sram" })).toEqual({
      enabled: true,
      autosave: false,
      signature: "GBUS",
      slot_count: 5,
      slot_capacity: 2048,
      offset: 0,
      version: 1,
      ui: expect.objectContaining({
        actions: { continue: "Continuar", load: "Carregar", delete: "Apagar" },
        metadata: { playerName: true, playTime: true, location: true }
      })
    });
    expect(buildEngineProjectSaveConfig({ autoSave: false, manualSave: false, saveType: "sram" })).toMatchObject({
      enabled: false,
      autosave: false,
      ui: { enabled: false }
    });
    expect(buildEngineProjectSaveConfig({ autoSave: true, manualSave: true, saveType: "none" })).toMatchObject({
      enabled: false,
      autosave: false,
      ui: { enabled: false }
    });
    expect(buildEngineProjectSaveConfig({ slots: 3, autoSave: true, saveType: "flash1m" })).toMatchObject({
      enabled: true,
      autosave: true,
      save_type: "flash1m",
      slot_count: 3,
      slot_capacity: 4096,
      ui: { enabled: true, slotCount: 3 }
    });
    expect(buildEngineProjectSaveConfig({ slots: 99 })).toMatchObject({
      slot_count: 16,
      slot_capacity: 2048,
      ui: { slotCount: 16 }
    });
    expect(buildEngineProjectSaveConfig(null, { profileId: "portable", customLabels: true }).ui).toMatchObject({
      profileId: "portable",
      customLabels: true
    });
  });

  it("maps settings.uiDialogs text speed and character sound for ROM boot", () => {
    expect(buildEngineDialogueTextSpeedFrames(null)).toBe(2);
    expect(buildEngineDialogueTextSpeedFrames({ textSpeed: "Normal" })).toBe(2);
    expect(buildEngineDialogueTextSpeedFrames({ textSpeed: "Rapida" })).toBe(1);
    expect(buildEngineDialogueTextSpeedFrames({ textSpeed: "Lenta" })).toBe(4);
    expect(buildEngineDialogueTextSpeedFrames({ textSpeed: "5" })).toBe(5);
    expect(buildEngineDialogueCharacterSound({ characterSound: "text_blip" })).toBe("text_blip");
    expect(buildEngineDialogueCharacterSound({})).toBeNull();
  });

  it("normalizes interact button settings for engine export", () => {
    expect(buildEngineInteractButton(null)).toBe("A");
    expect(buildEngineInteractButton({ interactButton: "B" })).toBe("B");
    expect(buildEngineInteractButton({ interactButton: "start" })).toBe("Start");
    expect(buildEngineInteractButton({ interactButton: "invalid" })).toBe("A");
  });

  it("maps uiDialogs layout into dialogue frame and wrap settings", () => {
    expect(buildEngineDialogueFrameIndex({ boxPosition: "Inferior" })).toBe(0);
    expect(buildEngineDialogueFrameIndex({ boxPosition: "Superior" })).toBe(1);
    expect(buildEngineDialogueFrameIndex({ boxPosition: "Centro" })).toBe(2);
    expect(buildEngineDialogueWrapColumns({ boxWidth: 224 })).toBe(28);
    expect(buildEngineDialogueWrapLines({ boxHeight: 40 })).toBe(3);
    expect(buildEngineDialogueWrapLines({ boxHeight: 48 })).toBe(4);
    expect(buildEngineDialogueUiConfig({ boxPosition: "Superior", boxWidth: 208, boxHeight: 32 })).toEqual({
      frame_index: 1,
      wrap_columns: 26,
      wrap_lines: 2,
      box_width: 26,
      box_height: 4
    });
    expect(buildEngineDialogueUiConfig({
      boxPosition: "Inferior",
      boxWidth: 208,
      boxHeight: 48,
      boxImage: "ui/dialogue_box.png",
      selectorImage: "ui/dialogue_cursor.png",
      font: "ui/dialogue_font.png",
      showPortrait: false,
      showCharacterName: true,
      portraitPosition: "Esquerda"
    })).toEqual({
      frame_index: 0,
      wrap_columns: 26,
      wrap_lines: 4,
      box_width: 26,
      box_height: 6,
      box_image: "ui/dialogue_box.png",
      selector_image: "ui/dialogue_cursor.png",
      font: "ui/dialogue_font.png",
      show_portrait: false,
      show_character_name: true,
      portrait_position: "Esquerda"
    });
  });

  it("mantém a geometria do snapshot alinhada aos frames nativos do diálogo", () => {
    expect(dialoguePreviewBoxLayout(0)).toEqual({ x: 8, y: 112, width: 224, height: 40 });
    expect(dialoguePreviewBoxLayout(1)).toEqual({ x: 8, y: 0, width: 224, height: 40 });
    expect(dialoguePreviewBoxLayout(2)).toEqual({ x: 8, y: 56, width: 224, height: 40 });
    expect(dialoguePreviewBoxLayout(3)).toEqual({ x: 8, y: 120, width: 144, height: 40 });
    expect(dialoguePreviewBoxLayout(4)).toEqual({ x: 152, y: 120, width: 88, height: 40 });
    expect(dialoguePreviewPortraitSlotLayout(0, true)).toEqual({ x: 168, y: 48, width: 64, height: 64 });
    expect(dialoguePreviewPortraitSlotLayout(0, false)).toEqual({ x: 8, y: 48, width: 64, height: 64 });
  });

  it("evita sobreposição da etiqueta com o slot do retrato", () => {
    expect(dialoguePreviewNameLabelLayout(0, "Guardiã", true, true)).toEqual({
      x: 96,
      y: 88,
      width: 72,
      height: 24
    });
    expect(dialoguePreviewNameLabelLayout(0, "Nara", true, false)).toEqual({
      x: 72,
      y: 88,
      width: 48,
      height: 24
    });
    expect(dialoguePreviewNameLabelLayout(0, "Nara", true, false, false)).toEqual({
      x: 8,
      y: 88,
      width: 48,
      height: 24
    });
    expect(dialoguePreviewNameLabelLayout(0, "Nara", true, true, false)).toEqual({
      x: 184,
      y: 88,
      width: 48,
      height: 24
    });
    expect(dialoguePreviewLayoutForSettings({
      boxPosition: "Inferior",
      portraitLayout: "fixed_slots",
      portraitPosition: "Direita",
      nameLabelMode: "above"
    }, "NPC", undefined, false).nameLabel).toEqual({
      x: 192,
      y: 88,
      width: 40,
      height: 24
    });
  });

  it("ajusta moldura e etiqueta ao frame de retrato sem ampliar o sprite", () => {
    const settings = { portraitLayout: "fixed_slots", nameLabelMode: "above", boxHeight: 40 };
    const left = dialoguePreviewLayoutForSettings(settings, "Nara", "Esquerda", true, { width: 32, height: 32 });
    expect(left.portraitSlot).toEqual({ x: 8, y: 80, width: 32, height: 32 });
    expect(left.nameLabel.x).toBe(40);
    const right = dialoguePreviewLayoutForSettings(settings, "Guardiã", "Direita", true, { width: 32, height: 32 });
    expect(right.portraitSlot).toEqual({ x: 200, y: 80, width: 32, height: 32 });
    const larger = dialoguePreviewLayoutForSettings(settings, "Guardiã", "Direita", true, { width: 48, height: 48 });
    expect(larger.portraitSlot).toEqual({ x: 184, y: 64, width: 48, height: 48 });
  });

  it("agrupa o nome ao lado interno do retrato à direita em 32 e 48 pixels", () => {
    const settings = { portraitLayout: "fixed_slots", nameLabelMode: "above", boxHeight: 40 };
    for (const size of [32, 48]) {
      const layout = dialoguePreviewLayoutForSettings(settings, "Guardiã", "Direita", true, { width: size, height: size });
      expect(layout.nameLabel.x + layout.nameLabel.width).toBe(layout.portraitSlot.x);
      expect(layout.nameLabel.y + layout.nameLabel.height).toBe(layout.portraitSlot.y + layout.portraitSlot.height);
      const long = dialoguePreviewLayoutForSettings(settings, "Guardiã dos faróis e sinais da costa", "Direita", true, { width: size, height: size });
      expect(long.nameLabel.x).toBe(8);
      expect(long.nameLabel.x + long.nameLabel.width).toBe(long.portraitSlot.x);
    }
  });

  it("recorta uma unica moldura da spritesheet de retrato", () => {
    expect(dialoguePreviewPortraitSourceRect(64, 32, 32, 32)).toEqual({
      x: 0,
      y: 0,
      width: 32,
      height: 32
    });
    expect(dialoguePreviewPortraitSourceRect(64, 32, 32, 32, 1)).toEqual({
      x: 32,
      y: 0,
      width: 32,
      height: 32
    });
    expect(dialoguePreviewPortraitSourceRect(64, 32)).toEqual({
      x: 0,
      y: 0,
      width: 32,
      height: 32
    });
    expect(dialoguePreviewPortraitSourceRect(48, 48)).toEqual({
      x: 0,
      y: 0,
      width: 48,
      height: 48
    });
  });

  it("exports the optional fixed 64x64 portrait slot layout", () => {
    expect(buildEngineDialogueUiConfig({
      portraitLayout: "fixed_slots",
      portraitPosition: "Esquerda"
    })).toEqual({
      frame_index: 0,
      wrap_columns: 28,
      wrap_lines: 3,
      box_width: 28,
      box_height: 5,
      portrait_position: "Esquerda",
      portrait_layout: "fixed_slots"
    });
  });

  it("exports the optional name label mode", () => {
    expect(buildEngineDialogueUiConfig({ nameLabelMode: "above" })).toMatchObject({
      name_label_mode: "above"
    });
    expect(resolveDialogueUiSettings({ nameLabelMode: "above" }).nameLabelMode).toBe("above");
  });
});
