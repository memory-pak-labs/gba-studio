import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildEngineExportProjectContract, prepareEngineProjectExport, resolveSmokeEngineExportRoot, tacticalMarkerIndices } from "./exportEngineProject.js";
import { parseGBAProjectFile, type GBAProjectData } from "../shared/projectFile.js";
import { installGameplayComponentInProject } from "../shared/advancedTools.js";
import { compactProjectTilemaps } from "../shared/projectResourceFormat.js";
import { buildProjectPluginRegistry } from "../shared/gbaStudioPlugins.js";
import { defaultSceneComposition } from "../shared/sceneComposition.js";
import { defaultSceneResourceManifest } from "../shared/sceneResourceContract.js";
import { createBlankProjectData } from "../shared/newProject.js";
import { createRoomInProject } from "../shared/roomsWorkspace.js";

function project(overrides: GBAProjectData): GBAProjectData {
  return {
    assets: [],
    assetGroups: [],
    scenas: [{ name: "start", width: 20, height: 18 }],
    animations: [],
    animationStates: [],
    spriteReferenceImages: [],
    audioItems: [],
    events: [],
    settings: {
      general: { gameTitle: "Export", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
      build: { romFileName: "export.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
      preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
      audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
      save: { saveType: "sram", slots: 3, autoSave: true },
      debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
    },
    ...overrides
  };
}

describe("tacticalMarkerIndices", () => {
  it("uses each asset's own frame zero when the cursor, range and target use separate sheets", () => {
    expect(tacticalMarkerIndices("cursor", "range", "target")).toEqual({ cursor: 0, range: 0, target: 0 });
    expect(tacticalMarkerIndices("marker", "marker", "marker")).toEqual({ cursor: 0, range: 1, target: 2 });
    expect(tacticalMarkerIndices("marker#cursor", "marker#range", "marker#target")).toEqual({ cursor: 0, range: 1, target: 2 });
    expect(tacticalMarkerIndices("cursor", "shared", "shared")).toEqual({ cursor: 0, range: 0, target: 1 });
  });
});

describe("prepareEngineProjectExport", () => {
  it("exports multiple tactical presets with separate residency groups without mutating authoring data", () => {
    let data = createBlankProjectData({ name: "Duas arenas", includeStarterContent: false });
    for (const id of ["arena-a", "arena-b"]) {
      data = createRoomInProject(data, { id, name: id, width: 6, height: 6,
        sceneType: "isometric", presetID: "isometricTactical" });
    }
    const before = JSON.stringify(data);
    const prepared = prepareEngineProjectExport(data);
    expect(prepared.error).toBeUndefined();
    const contract = prepared.generated!.contract;
    const sets = contract.asset_pack!.resident_sets!;
    expect(sets).toHaveLength(2);
    expect(new Set(sets.flatMap(set => set.groups)).size).toBe(sets.reduce((sum, set) => sum + set.groups.length, 0));
    for (const room of contract.isometric_project!.rooms) {
      const set = sets.find(set => set.room === room.name)!;
      expect(room.tactical_presentation!.surface_pages!.map(page => page.bank_group)).toEqual(set.groups);
      expect(room.tactical_presentation!.surface_residency!.exclusive_bank_groups).toEqual(set.groups);
      for (const group of set.groups) {
        expect(contract.asset_pack!.assets.some(asset => {
          const banks = asset as typeof asset & { bank_groups?: string[]; bank_group?: string };
          return banks.bank_groups?.includes(group) || banks.bank_group === group;
        })).toBe(true);
      }
    }
    expect(JSON.stringify(data)).toBe(before);
    expect(buildEngineExportProjectContract(data).asset_pack!.resident_sets).toEqual(sets);
  });
  it("emite o contrato físico GBA junto do export e bloqueia OBJ incompatível", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ name: "start", width: 40, height: 20, sceneType: "topdown" }]
    }));

    expect(contract.hardware_contract).toMatchObject({
      viewport: { widthPixels: 240, heightPixels: 160, widthTiles: 30, heightTiles: 20 },
      configuredBackgroundMapSize: { id: "32x32" },
      scenes: [expect.objectContaining({ effectiveMapSize: expect.objectContaining({ id: "64x32" }) })]
    });
    expect(contract.requires.features).toContain("hardware.gba_native_contract");

    const blocked = prepareEngineProjectExport(project({
      animations: [{ name: "broken", frameWidth: 22, frameHeight: 16, colorMode: "4bpp" }]
    }));
    expect(blocked.error).toContain("SPRITE_FRAME_NOT_TILE_ALIGNED");
  });

  it("exporta a coleção rooms persistida quando scenas não está presente", () => {
    const data = project({
      rooms: [{ name: "start", width: 30, height: 20, sceneType: "topdown" }]
    });
    delete data.scenas;

    const result = prepareEngineProjectExport(data);

    expect(result.error).toBeUndefined();
    expect(result.generated?.contract.topdown_project?.rooms).toHaveLength(1);
  });

  it("bloqueia export de importacao GB Studio com evento obrigatorio nao traduzido", () => {
    const result = prepareEngineProjectExport(project({
      gbStudioImport: {
        diagnostics: [{ code: "unsupported-event", message: "EVENT_UNKNOWN" }]
      }
    }));

    expect(result).toEqual({
      error: expect.stringContaining("unsupported-event")
    });
  });

  it("propaga a política manual de compressão da cena para o asset pack", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [{ id: "asset-forest", name: "forest.png", kind: "Background", metadata: { source: "Assets/backgrounds/forest.png", colorMode: "4bpp" } }],
      scenas: [{
        name: "start",
        width: 20,
        height: 18,
        backgroundAssetName: "forest.png",
        runtime: {
          type: "topdown",
          config: {
            resources: {
              resources: [{
                id: "forest",
                assetId: "forest.png",
                kind: "regular_bg",
                enabled: true,
                required: true,
                bpp: 4,
                palette: { id: "forest_palette", slot: "background", colors: 16 },
                compression: { strategy: "manual", tiles: "huffman", tilemap: "lz77", palette: "none" },
                tileLimit: 1024,
                resourceGroup: "scene_start",
                prefetch: "scene",
                cache: "resident",
                evictionPriority: 0,
                dependencies: [],
                fallback: { mode: "error" },
                budget: { bgTiles: 1, objTiles: 0, oam: 0, paletteColors: 16, vramBytes: 64, eventBytes: 0, audioBytes: 0, dmaBytes: 0, vblankTicks: 0, cpuWorkTicks: 0 }
              }]
            }
          }
        }
      }]
    }));

    expect(contract.scene_contracts[0]?.resources.resources[0]?.compression).toEqual({
      strategy: "manual",
      tiles: "huffman",
      tilemap: "lz77",
      palette: "none"
    });
    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "forest",
        compression_policy: { strategy: "manual", tiles: "huffman", tilemap: "lz77", palette: "none" }
      })
    ]));
  });

  it("exports a scene compositor and typed resource manifest without enabling other scenes", () => {
    const composition = {
      ...defaultSceneComposition(),
      enabled: true,
      mode: "bitmap4" as const,
      layers: [{
        id: "sky",
        kind: "bitmap" as const,
        role: "decorative" as const,
        layer: "BITMAP" as const,
        enabled: true,
        priority: 2 as const,
        assetId: "sky.png",
        parallax: { x256: 256, y256: 256 },
        scroll: { x: 0, y: 0 },
        bitmapPage: 0 as const
      }]
    };
    const resources = {
      ...defaultSceneResourceManifest(),
      resources: [{
        id: "sky",
        assetId: "sky.png",
        kind: "bitmap4" as const,
        enabled: true,
        required: true,
        bpp: 8 as const,
        palette: { id: "sky_palette", slot: "background" as const, colors: 256 },
        compression: "lz77" as const,
        tileLimit: 0,
        resourceGroup: "scene_start",
        prefetch: "scene" as const,
        cache: "resident" as const,
        evictionPriority: 0,
        dependencies: ["sky_palette"],
        fallback: { mode: "error" as const },
        budget: { ...composition.budget, vramBytes: 19200 }
      }]
    };
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        name: "start",
        sceneType: "topdown",
        width: 20,
        height: 18,
        runtime: { type: "topdown", config: { composition, resources } }
      }]
    }));

    expect(contract.scene_contracts[0]).toMatchObject({
      name: "start",
      composition: { enabled: true, mode: "bitmap4", display_mode: 4, default_tiled: false },
      resources: { resources: [{ id: "sky", asset: "sky.png", bpp: 8, resource_group: "scene_start" }] }
    });
    expect(contract.topdown_project?.rooms[0]?.video).toMatchObject({
      display_mode: 4,
      bitmap: { asset: "sky_bitmap", color_depth: 8 }
    });
  });

  it("serializa o contrato estrito de capabilities por cena sem ativar módulos omitidos", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        name: "start",
        sceneType: "topdown",
        width: 30,
        height: 20
      }]
    }));
    const capabilityManifest = (contract as unknown as {
      capability_manifest?: {
        scenes: Array<{
          name: string;
          preflight?: { profileId: string; collision: { independentOfArt: boolean }; budget: { safeLimit: Record<string, number> } };
          capabilities: Array<{ id: string; status: { enabled: boolean } }>;
        }>;
      };
    }).capability_manifest;

    expect(capabilityManifest).toBeDefined();
    expect(capabilityManifest?.scenes[0]).toMatchObject({ name: "start" });
    expect(capabilityManifest?.scenes[0]?.capabilities.find((capability) => capability.id === "quests")).toMatchObject({
      status: { enabled: false }
    });
    expect(capabilityManifest?.scenes[0]?.preflight).toMatchObject({
      profileId: "topdown",
      collision: { independentOfArt: true },
      budget: { safeLimit: { bgTiles: expect.any(Number), cpuWorkTicks: expect.any(Number) } }
    });
  });

  it("exporta o contrato universal de capacidades para o runtime", () => {
    const contract = buildEngineExportProjectContract(project({
      settings: {
        general: { gameTitle: "Export", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "export.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        backgrounds: { graphicsMode: "Mode 2 - Affine" },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        runtimeCapabilities: {
          rtc: { enabled: true },
          link: { enabled: true },
          affine: { enabled: true }
        }
      }
    }));
    const runtimeCapabilities = (contract as unknown as {
      runtime_capabilities?: {
        schema: number;
        registry: string;
        capabilities: Array<{ id: string; enabled: boolean; required: boolean }>;
      };
    }).runtime_capabilities;

    expect(runtimeCapabilities).toMatchObject({
      schema: 1,
      registry: "gba-studio-runtime-capabilities",
      capabilities: [
        { id: "save", enabled: true, required: true },
        { id: "rtc", enabled: true, required: true },
        { id: "link", enabled: true, required: true },
        { id: "affine", enabled: true, required: true }
      ]
    });
  });

  it("compila o avanço explícito de campanha para variável e transição nativas", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        {
          id: "room-port",
          name: "port",
          sceneType: "topdown",
          width: 16,
          height: 12,
          campaign: {
            chapter: 2,
            title: "Capítulo 1",
            objective: "Encontrar a estrutura.",
            nextScene: "route",
            completionVariable: "story.progress",
            completedValue: 2,
            controls: "A confirma.",
            success: "Rota aberta.",
            failureRecovery: "Tente novamente.",
            tutorialDialogue: null
          }
        },
        { id: "room-route", name: "route", sceneType: "topdown", width: 16, height: 12 }
      ],
      variables: [{ name: "progress", displayName: "story.progress" }],
      events: [{
        id: "event-finish",
        name: "finish",
        category: "Cena",
        roomName: "port",
        steps: [{ command: "advance_campaign" }]
      }],
      settings: {
        general: { gameTitle: "Export", startScene: "port", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "export.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.scripts.find((entry) => entry.name === "finish")?.script).toEqual([
      { op: "set_variable", variable: 0, value: 2 },
      { op: "warp", room: 1, x: 8 * 8, y: 8 * 8 }
    ]);
  });

  it("exporta tilemap, foreground e colisões pelos aliases do contrato comum", () => {
    const data = project({
      scenas: [{
        id: "room-porto",
        name: "porto",
        sceneType: "topdown",
        width: 2,
        height: 2,
        tilemap: [7, 8, 9, 10],
        foregroundTiles: [11, 12, 13, 14],
        collisions: ["solid", "free", "damage", "free"]
      }]
    });
    (data.settings as Record<string, Record<string, unknown>>).general.startScene = "porto";
    const contract = buildEngineExportProjectContract(data);
    const room = contract.topdown_project?.rooms[0];

    expect(room).toMatchObject({
      visual_tiles: [7, 8, 9, 10],
      foreground_tiles: [11, 12, 13, 14],
      collision_types: ["solid", "free", "damage", "free"],
      collision_flags: [1, 0, 64, 0]
    });
  });

  it("expande metatiles autorados para o tilemap físico e preserva o custo da abstração", () => {
    const data = project({
      scenas: [{
        id: "room-metatiles",
        name: "start",
        sceneType: "topdown",
        width: 4,
        height: 2,
        runtime: {
          type: "topdown",
          config: {
            capabilities: [{ id: "metatiles", enabled: true, settings: { blockSize: "2x2" } }],
            metatiles: {
              enabled: true,
              contract: "gba-authored-metatile-2x2-v1",
              fallback: "error",
              library: [
                { id: "grass", label: "Grama", tiles: [10, 11, 12, 13], semantic: { collision: "free" } },
                { id: "water", label: "Água", tiles: [20, 21, 22, 23], semantic: { collision: "water" } }
              ],
              map: [0, 1]
            }
          }
        }
      }]
    });
    const contract = buildEngineExportProjectContract(data);
    const room = contract.topdown_project?.rooms[0];

    expect(room).toMatchObject({
      visual_tiles: [10, 11, 20, 21, 12, 13, 22, 23],
      collision_types: ["free", "free", "water", "water", "free", "free", "water", "water"],
      metatile_authoring: expect.objectContaining({
        contract: "gba-authored-metatile-2x2-v1",
        physical: expect.objectContaining({ width_tiles: 4, height_tiles: 2 })
      })
    });
    expect(contract.scene_contracts[0]).toMatchObject({
      metatiles: expect.objectContaining({ export_cost: expect.objectContaining({ bgTiles: 8, vramBytes: 8 * 32 }) })
    });
    const manifest = (contract as unknown as { capability_manifest: { scenes: Array<{ capabilities: Array<{ id: string; status: { enabled: boolean } }> }> } }).capability_manifest;
    expect(manifest.scenes[0]?.capabilities.find((capability) => capability.id === "metatiles")).toMatchObject({
      status: { enabled: true }
    });
  });

  it("exige opt-in explícito para HBlank/HDMA antes de exportar a cena", () => {
    const composition = {
      ...defaultSceneComposition(),
      enabled: true,
      effects: {
        ...defaultSceneComposition().effects,
        hblank: {
          ...defaultSceneComposition().effects.hblank,
          enabled: true,
          hdma: true,
          scrollOffsets: Array.from({ length: 160 }, () => 0)
        }
      }
    };

    expect(() => buildEngineExportProjectContract(project({
      scenas: [{
        name: "start",
        sceneType: "shmup",
        width: 30,
        height: 20,
        runtime: { type: "shmup", config: { composition } }
      }]
    }))).toThrow(/hblank_timeline/);
  });

  it("exporta keyframes affine OBJ do contrato runtime para o Engine Pack", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        name: "start",
        sceneType: "topdown",
        width: 20,
        height: 18,
        runtime: {
          type: "topdown",
          config: {
            capabilities: [{
              id: "affine_obj",
              enabled: true,
              settings: { matrixIndex: 2, scaleX: 1, scaleY: 1, rotationDegrees: 0 }
            }],
            affineObj: {
              easing: "ease_in",
              keyframes: [
                { frame: 0, pa: 256, pb: 0, pc: 0, pd: 256 },
                { frame: 30, pa: 128, pb: 64, pc: -64, pd: 512 }
              ]
            }
          }
        }
      }]
    }));

    expect(contract.topdown_project?.player.affine_obj).toMatchObject({
      enabled: true,
      matrix_index: 2,
      easing: "ease_in",
      keyframes: [
        { frame: 0, pa: 256, pb: 0, pc: 0, pd: 256 },
        { frame: 30, pa: 128, pb: 64, pc: -64, pd: 512 }
      ]
    });
  });

  it("uses the dialogue choice state machine for native battle commands", async () => {
    const templatePath = path.resolve(process.cwd(), "../../packages/GBAStudioEngine/templates/exported_battle_rpg/main.cpp");
    const template = await readFile(templatePath, "utf8");

    expect(template).toContain("gbs::show_dialogue_choices");
    expect(template).toContain("battle_menu_dialogue");
    expect(template).toContain('{ "ATACAR", 0 }');
    expect(template).toContain("FUGIR");
    expect(template).toContain("BattleMenuPage::Targets");
    expect(template).toContain("battle_target_choices");
    expect(template).toContain("gbs::init_hud(battle_hud)");
    expect(template).toContain("gbs::draw_hud(battle_hud)");
    expect(template).toMatch(/void apply_battle_visuals[\s\S]*?gbs::render_ui_assets\(\);/);
    expect(template).toMatch(/draw_battle\(\);[\s\S]*?sync_runtime_telemetry\(\);[\s\S]*?gbs::wait_vblank\(\);[\s\S]*?gbs::render_ui_assets\(\);[\s\S]*?gbs::draw_hud\(battle_hud\);/);
    expect(template).toContain("clear_battle_meter_tiles");
    expect(template).not.toMatch(/for \(int y = 0; y < 20; \+\+y\)/);
    expect(template).toContain("ensure_battle_prompt_visible");
    expect(template).toMatch(/gbastudio_dialogue_ui::configure\(\);[\s\S]*?show_battle_menu_root\(\);/);
    expect(template).toContain("VITORIA!");
    expect(template).toContain("DERROTA!");
    expect(template).toContain("gbs::advance_dialogue(battle_menu_dialogue, input)");
    expect(template).toContain("gbs::ButtonB");
    expect(template).not.toContain("gbs::try_escape_battle(state, encounter) || state_changed");
  });

  it("mantém a HUD fixa da Dungeon Crawler sobre um background autoral", async () => {
    const templatePath = path.resolve(process.cwd(), "../../packages/GBAStudioEngine/templates/exported_dungeon_crawler/main.cpp");
    const template = await readFile(templatePath, "utf8");

    expect(template).toContain('gbs::set_hud_text(hud, "HP 03", "START: ITEM");');
    expect(template).toMatch(/void apply_room_visuals\(\)[\s\S]*?BG0 is reserved for the fixed UI layer[\s\S]*?set_bg_enabled\(gbs::BackgroundLayer::BG0, true\);/);
    expect(template).toMatch(/void apply_room_visuals\(\)[\s\S]*?gbs::load_tiles\(project\.tile_assets\[index\]\);[\s\S]*?gbs::render_ui_assets\(\);/);
    expect(template).toMatch(/void draw_view\(\)[\s\S]*?fixed UI layer used by the approved HUD[\s\S]*?fill_rect\(0, 0, 30, 20, 0\);[\s\S]*?set_bg_enabled\(gbs::BackgroundLayer::BG0, true\);/);
    expect(template).toMatch(/void draw_view\(\)[\s\S]*?cached_view_room == current_room_index[\s\S]*?cached_view_position\.x == runtime_state\.position\.x[\s\S]*?return;[\s\S]*?cached_view_room = current_room_index;/);
    expect(template).toMatch(/void apply_room_visuals\(\)[\s\S]*?invalidate_dungeon_view_cache\(\);/);
    expect(template).toMatch(/draw_actors\(\);[\s\S]*?set_bg_priority\(gbs::BackgroundLayer::BG0, 0\);[\s\S]*?gbs::draw_hud\(hud\);[\s\S]*?gbs::draw_dialogue\(dialogue\);/);
    expect(template).not.toMatch(/if \(room\.background_index >= 0[\s\S]*?set_bg_enabled\(gbs::BackgroundLayer::BG0, false\)/);
  });

  it("desenha retratos fixos depois da limpeza da HUD avançada", async () => {
    const cutsceneTemplate = await readFile(
      path.resolve(process.cwd(), "../../packages/GBAStudioEngine/templates/exported_cutscene/main.cpp"),
      "utf8"
    );
    const visualNovelTemplate = await readFile(
      path.resolve(process.cwd(), "../../packages/GBAStudioEngine/templates/exported_visual_novel/main.cpp"),
      "utf8"
    );

    expect(cutsceneTemplate).toMatch(
      /gbs::draw_hud\(hud\);[\s\S]*?gbs::draw_dialogue\(dialogue\);[\s\S]*?draw_dialogue_portrait\(\);/
    );
    expect(visualNovelTemplate).toMatch(
      /gbs::draw_hud\(hud\);[\s\S]*?gbs::draw_dialogue\(dialogue\);[\s\S]*?draw_dialogue_portrait\(\);/
    );
  });

  it("alimenta slots independentes para score, vidas e onda do SHMUP", async () => {
    const templatePath = path.resolve(process.cwd(), "../../packages/GBAStudioEngine/templates/exported_shmup/main.cpp");
    const template = await readFile(templatePath, "utf8");

    expect(template).toContain("hud_score_buffer");
    expect(template).toContain("hud_lives_buffer");
    expect(template).toContain("hud_wave_buffer");
    expect(template).toContain("gbs::set_hud_text_slots(hud, text_slots, 3);");
  });

  it("aplica o último keyframe alcançado da timeline HBlank no runtime SHMUP", async () => {
    const templatePath = path.resolve(process.cwd(), "../../packages/GBAStudioEngine/templates/exported_shmup/main.cpp");
    const template = await readFile(templatePath, "utf8");

    expect(template).toContain("composition.hblank_timeline_count");
    expect(template).toContain("composition.hblank_timeline[index].frame <= frame");
    expect(template).toContain("selected_keyframe->scroll_offsets");
    expect(template).toContain("refresh_scene_composition_hblank(shmup_state.frame_counter)");
  });

  it("exports compiled advanced tools as a ROM-facing contract", () => {
    const data = project({
      advancedTools: {
        inputReplays: [{
          schema: 1,
          id: "route-1",
          seed: 9,
          initialSaveSlot: 0,
          initialVariables: {},
          initialInventory: {},
          runs: [{ frame: { held: ["A"], pressed: ["A"] }, frames: 2 }],
          checkpoints: {},
          frameCount: 2
        }],
        saveLabSnapshots: [{
          id: "save-1",
          name: "Teste",
          slot: 0,
          variables: { story: 2 },
          inventory: { key: 1 },
          corruption: "none"
        }],
        actorStateMachines: [{
          id: "enemy",
          initialState: "idle",
          states: [{ id: "idle", onUpdate: ["wait 1"] }],
          transitions: []
        }]
      },
      scenas: [{
        name: "start",
        sceneType: "topdown",
        width: 20,
        height: 18,
        runtime: {
          type: "topdown",
          config: {
            capabilities: [{ id: "animation_state_machine", enabled: true, settings: {} }]
          }
        }
      }]
    });

    const result = prepareEngineProjectExport(data);

    expect(result.error).toBeUndefined();
    expect(result.generated?.contract.advanced_tools).toMatchObject({
      schema: 1,
      replays: [expect.objectContaining({ id: "route-1", frame_count: 2 })],
      save_snapshots: [expect.objectContaining({ id: "save-1", slot: 0 })],
      state_machines: [expect.objectContaining({ id: "enemy", initial_state: "idle" })]
    });
    expect(result.generated?.contract.requires.features).toContain("advanced_tools_data");
  });

  it("exports every installable gameplay component using native commands", () => {
    const componentIDs = ["dialogue", "shop", "quest", "inventory", "checkpoint", "door", "enemy", "hud"] as const;
    const data = componentIDs.reduce(
      (current, componentID) => installGameplayComponentInProject(current, componentID),
      project({})
    );

    const result = prepareEngineProjectExport(data);

    expect(result.error).toBeUndefined();
    expect(result.generated?.contract.topdown_project?.scripts).toHaveLength(8);
    expect(result.generated?.contract.topdown_project?.scripts.map((event) => event.name)).toEqual(expect.arrayContaining([
      "component_dialogue_show",
      "component_shop_open",
      "component_inventory_add",
      "component_enemy_spawn"
    ]));
  });

  it("compiles plugin data table lookups into native ROM variable writes", () => {
    const data = project({
      events: [{
        id: "event-load-stats",
        name: "load_stats",
        category: "Cena",
        steps: [{ command: "data_table_lookup party 1 hero.hp hero.attack" }]
      }]
    });
    const pluginRegistry = buildProjectPluginRegistry([], [], {
      dataTables: [{
        id: "farol/party",
        symbol: "party",
        label: "Party",
        indexVariable: null,
        columns: [{ variable: "hp" }, { variable: "attack" }],
        rows: [
          { label: "lia", values: [6, 2] },
          { label: "mara", values: [9, 4] }
        ],
        rowSize: 2,
        pluginId: "farol"
      }]
    });

    const result = prepareEngineProjectExport(data, { pluginRegistry });

    expect(result.error).toBeUndefined();
    expect(result.generated?.contract.topdown_project?.scripts[0]).toMatchObject({
      name: "load_stats",
      script: [
        { op: "set_variable", variable: 1, value: 9 },
        { op: "set_variable", variable: 0, value: 4 }
      ]
    });
  });

  it("exports a sanitized physical GBA cartridge header", () => {
    const contract = buildEngineExportProjectContract(project({
      name: "Projeto",
      settings: {
        general: { gameTitle: "Ação São João!", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: {
          romFileName: "acao.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack",
          gameCode: "br-1", makerCode: "g$", romVersion: 7
        },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true, manualSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.build).toEqual({
      target: "acao",
      make_target: "all",
      rom_title: "ACAO SAO JOA",
      game_code: "BR1X",
      maker_code: "GX",
      rom_version: "07"
    });
  });

  it("forwards the RTC cartridge Flash1M save profile into the engine export", () => {
    const source = project({});
    const settings = source.settings as Record<string, unknown>;
    source.settings = {
      ...settings,
      save: { ...(settings.save as Record<string, unknown>), saveType: "flash1m", slots: 3 }
    };
    const contract = buildEngineExportProjectContract(source);
    expect(contract.topdown_project?.save).toMatchObject({
      enabled: true,
      save_type: "flash1m",
      slot_capacity: 4096,
      slot_count: 3
    });
  });

  it("builds the semantic Engine Pack export_project.json contract from the shared topdown fixture", async () => {
    const fixture = await readFile(path.join(process.cwd(), "../../packages/project-contract/fixtures/topdown-demo.gba-project"), "utf8");
    const project = parseGBAProjectFile(fixture);
    const contract = buildEngineExportProjectContract(project.data, {
      enginePackPath: "/packs/GBAStudioEnginePack",
      enginePackVersion: "2.24.0"
    });

    expect(contract).toMatchObject({
      schema: 1,
      backend: "gbastudio_engine",
      kind: "topdown",
      runtime_profile: "topdown",
      template_dir: path.join("/packs/GBAStudioEnginePack", "templates", "exported_topdown"),
      entry: "main.cpp",
      project_data: "gbastudio_project_data.hpp",
      build: { target: "electron_topdown_demo", make_target: "all" },
      requires: {
        engine_pack: ">=2.24.0",
        features: expect.arrayContaining(["topdown_project_data", "dialogue.visual_box", "events.progressive_event_runner"])
      }
    });
    expect(contract.generated_assets).toEqual(expect.arrayContaining([
      "player_topdown_4dir.hpp",
      "tiles_overworld.hpp"
    ]));
    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "obj", name: "player_topdown_4dir", header: "player_topdown_4dir.hpp" }),
      expect.objectContaining({ kind: "bg", name: "tiles_overworld", header: "tiles_overworld.hpp" })
    ]));
    expect(contract.copied_assets.map((asset) => asset.output)).toEqual([
      "assets/image/tiles_overworld.png",
      "assets/sprite/player_topdown_4dir.png",
      "assets/sprite/actor_point_click.png",
      "assets/sprite/cursor_point_click.png",
      "assets/audio/intro_theme.mod",
      "assets/audio/confirm.wav"
    ]);
    expect(contract.topdown_project).toBeDefined();
    const topdownProject = contract.topdown_project!;
    expect(topdownProject.rooms).toHaveLength(2);
    expect(topdownProject.rooms[0]).toMatchObject({
      name: "overworld_start",
      width_tiles: 30,
      height_tiles: 20,
      metadata: {
        player_start: { x: 120, y: 80 }
      }
    });
    expect(topdownProject.player).toMatchObject({ position: { x: 120, y: 80 }, direction: "down" });
    expect(topdownProject.rooms[0].collision_flags).toHaveLength(600);
    expect(topdownProject.rooms[0].collision_flags.slice(0, 4)).toEqual([1, 0, 0, 1]);
    expect(topdownProject.dialogue_lines).toEqual([
      { text: "Ola, viajante!", speaker: "Ana", portrait: "ana_portrait.png", key: "intro_001" },
      { text: "Tenho itens raros.", speaker: "Mercador", portrait: "shopkeeper.png", key: "npc_shop" }
    ]);
    expect(topdownProject.choice_groups).toEqual([
      {
        line: 0,
        choices: [
          { text: "Vamos explorar", value: 1 },
          { text: "Abrir inventario", value: 2 }
        ]
      },
      {
        line: 1,
        choices: [
          { text: "Comprar", value: 1 },
          { text: "Sair", value: 2 }
        ]
      }
    ]);
    expect(topdownProject.scripts).toEqual(expect.arrayContaining([
      { name: "room_boot", script: [{ op: "run_audio_routine", index: 0 }, { op: "show_dialogue", dialogue: 0 }] },
      { name: "npc_shop", script: [{ op: "show_choice", group: 1 }, { op: "play_sfx", index: 0 }] },
      { name: "door_enter", script: [{ op: "warp", room: 1, x: 8, y: 80 }] }
    ]));
  });

  it("exports top-down quest and shop module semantics for the native runtime", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        name: "start",
        sceneType: "topdown",
        width: 20,
        height: 18,
        runtime: {
          type: "topdown",
          config: {
            modules: [
              { id: "inventory", enabled: true, settings: {} },
              { id: "quests", enabled: true, settings: { stateVariable: 4, objectiveItem: 2, rewardItem: 3 } },
              { id: "shop", enabled: true, settings: { label: "POTION", item: 5, currencyItem: 1, price: 7 } }
            ]
          }
        }
      }]
    }));

    expect(contract.topdown_project).toMatchObject({
      inventory_enabled: true,
      quests_enabled: true,
      shop_enabled: true,
      quests: [{ state_variable: 4, objective_item: 2, reward_item: 3 }],
      shop_items: [{ label: "POTION", item: 5, currency_item: 1, price: 7 }]
    });
  });

  it("exports independent Dungeon Crawler feature modules to the native project", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        name: "start",
        sceneType: "dungeonCrawler",
        width: 8,
        height: 8,
        runtime: {
          type: "dungeonCrawler",
          config: {
            modules: [
              { id: "inventory", enabled: false, settings: {} },
              { id: "battle", enabled: true, settings: {} },
              { id: "compass", enabled: true, settings: {} },
              { id: "map", enabled: true, settings: {} },
              { id: "movement", enabled: true, settings: { depthSprites: false } }
            ]
          }
        }
      }]
    }));

    expect(contract.dungeon_crawler_project).toMatchObject({
      inventory_enabled: false,
      battle_enabled: true,
      compass_enabled: true,
      map_enabled: true,
      depth_sprites_enabled: false
    });
  });

  it("agrega módulos Dungeon Crawler das salas da mesma campanha", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        {
          name: "start",
          sceneType: "dungeonCrawler",
          width: 8,
          height: 8,
          runtime: {
            type: "dungeonCrawler",
            config: {
              modules: [
                { id: "movement", enabled: true, settings: { depthSprites: true } },
                { id: "compass", enabled: true, settings: {} },
                { id: "map", enabled: true, settings: {} }
              ]
            }
          }
        },
        {
          name: "combat",
          sceneType: "dungeonCrawler",
          width: 8,
          height: 8,
          runtime: {
            type: "dungeonCrawler",
            config: {
              modules: [{
                id: "battle",
                enabled: true,
                settings: {
                  enemyActor: "Sentinel",
                  enemyName: "SENTINEL",
                  maxHp: 3,
                  playerDamage: 1,
                  enemyDamage: 1,
                  rewardItem: 3,
                  rewardQuantity: 1
                }
              }]
            }
          }
        },
        {
          name: "exit",
          sceneType: "dungeonCrawler",
          width: 8,
          height: 8,
          runtime: {
            type: "dungeonCrawler",
            config: {
              modules: [{
                id: "inventory",
                enabled: true,
                settings: { item: 2, label: "CÉLULA", initialQuantity: 0, healAmount: 1 }
              }]
            }
          }
        }
      ],
      actors: [{
        id: "actor-sentinel",
        name: "Sentinel",
        roomName: "combat",
        x: 4,
        y: 4,
        spriteSheet: "sentinel.png",
        animationName: "sentinel_far"
      }],
      assets: [{ id: "asset-sentinel", name: "sentinel.png", kind: "Sprite", metadata: {
        source: "Assets/sprites/sentinel.png",
        role: "dungeon-depth-actor"
      }}]
    }));

    expect(contract.dungeon_crawler_project).toMatchObject({
      inventory_enabled: true,
      battle_enabled: true,
      compass_enabled: true,
      map_enabled: true,
      depth_sprites_enabled: true,
      rooms: expect.arrayContaining([
        expect.objectContaining({ name: "start", battle_enabled: false }),
        expect.objectContaining({ name: "combat", battle_enabled: true }),
        expect.objectContaining({ name: "exit", battle_enabled: false })
      ]),
      inventory_items: [{ label: "CÉLULA", item: 2, initial_quantity: 0, heal_amount: 1 }],
      battle: expect.objectContaining({ enemy_name: "SENTINEL", enemy_actor_index: 0 })
    });
  });

  it("resolves the configured startPlayer actor instead of hardcoding Player", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } }
      ],
      scenas: [
        { id: "room-1", name: "ilha_farol", width: 30, height: 20, playerActorName: "Nina" }
      ],
      actors: [
        {
          id: "actor-nina",
          name: "Nina",
          roomName: "ilha_farol",
          x: 15,
          y: 10,
          spriteSheet: "hero.png",
          animationName: "idle_down"
        },
        {
          id: "actor-guide",
          name: "Guide",
          roomName: "ilha_farol",
          x: 20,
          y: 8,
          spriteSheet: "hero.png",
          animationName: "idle_down"
        }
      ],
      animations: [
        { id: "anim-idle", name: "idle_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 10 },
        { id: "anim-walk", name: "walk_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 10 }
      ],
      settings: {
        general: {
          gameTitle: "Farol",
          startScene: "ilha_farol",
          startSceneType: "topdown",
          startPlayer: "Nina",
          exportFolder: "build"
        },
        build: { romFileName: "farol.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }), {
      enginePackPath: "/packs/GBAStudioEnginePack",
      enginePackVersion: "2.24.0"
    });

    expect(contract.topdown_project?.player).toMatchObject({
      position: { x: 120, y: 80 },
      metasprite: { asset: "hero", index: expect.any(Number) },
      emit_animation_fallback: false
    });
    expect(contract.topdown_project?.rooms[0]?.npcs?.map((npc) => npc.name)).toEqual(["Guide"]);
    expect(contract.topdown_project?.rooms[0]?.metadata.player_start).toEqual({ x: 120, y: 80 });
  });

  it("converts topdown editor tile coordinates to engine pixels", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-1", name: "town", width: 20, height: 18, playerActorName: "Player" },
        { id: "room-2", name: "shop", width: 16, height: 16, playerActorName: "Player" }
      ],
      actors: [
        { id: "actor-player-town", name: "Player", roomName: "town", x: 5, y: 7, spriteSheet: "hero.png", animationName: "idle" },
        { id: "actor-npc", name: "Guide", roomName: "town", x: 9, y: 4, eventName: "npc_talk" },
        { id: "actor-player-shop", name: "Player", roomName: "shop", x: 2, y: 3, spriteSheet: "hero.png", animationName: "idle" }
      ],
      triggers: [{
        id: "trigger-door",
        name: "Door",
        roomName: "town",
        x: 10,
        y: 6,
        width: 2,
        height: 2,
        eventName: "door_enter"
      }],
      dialogues: [{ key: "intro", text: "Ola" }],
      events: [
        { id: "event-door", name: "door_enter", category: "Trigger", steps: [{ command: "change_scene shop" }] },
        { id: "event-npc", name: "npc_talk", category: "Dialogo", steps: [{ command: "show_dialogue intro" }] }
      ],
      editorState: {
        scenaConnections: [{
          from: "town",
          to: "shop",
          exit: { x: 10, y: 6, width: 2, height: 2 },
          entry: { x: 2, y: 3, width: 1, height: 1 }
        }]
      },
      settings: {
        general: { gameTitle: "Tile Export", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "tile-export.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }), {
      enginePackPath: "/packs/GBAStudioEnginePack",
      enginePackVersion: "2.24.0"
    });

    const town = contract.topdown_project?.rooms.find((room) => room.name === "town");
    const shop = contract.topdown_project?.rooms.find((room) => room.name === "shop");

    expect(town?.metadata.player_start).toEqual({ x: 40, y: 56 });
    expect(shop?.metadata.player_start).toEqual({ x: 16, y: 24 });
    expect(town?.npcs?.[0]?.position).toEqual({ x: 72, y: 32 });
    expect(town?.triggers?.[0]?.area).toEqual({ x: 80, y: 48, width: 16, height: 16 });
    expect(town?.portals?.[0]).toMatchObject({
      area: { x: 80, y: 48, width: 16, height: 16 },
      target_position: { x: 24, y: 24 }
    });
  });

  it("compiles change_scene warp positions in pixels using connection entry or tile coords", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-1", name: "room_1", width: 30, height: 20 },
        { id: "room-2", name: "room_2", width: 30, height: 20 }
      ],
      triggers: [{
        id: "trigger-door",
        name: "Door",
        roomName: "room_1",
        x: 28,
        y: 10,
        width: 2,
        height: 2,
        eventName: "door_to_room_2"
      }],
      actors: [{
        id: "actor-player",
        name: "Player",
        roomName: "room_1",
        x: 15,
        y: 10,
        spriteSheet: "player_topdown_4dir.png",
        animationName: "idle_down"
      }],
      assets: [{
        id: "asset-player",
        name: "player_topdown_4dir.png",
        kind: "Sprite",
        metadata: { source: "Assets/sprites/player_topdown_4dir.png" }
      }],
      events: [
        { id: "event-door", name: "door_to_room_2", category: "Trigger", steps: [{ command: "change_scene room_2" }] },
        { id: "event-explicit", name: "explicit_warp", category: "Trigger", steps: [{ command: "change_scene room_2 4 6 right" }] }
      ],
      editorState: {
        scenaConnections: [{ from: "room_1", to: "room_2", eventName: "door_to_room_2" }]
      },
      settings: {
        general: { gameTitle: "Warp Export", startScene: "room_1", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "warp-export.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }), {
      enginePackPath: "/packs/GBAStudioEnginePack",
      enginePackVersion: "2.24.0"
    });

    const scripts = contract.topdown_project?.scripts ?? [];
    expect(scripts.find((entry) => entry.name === "door_to_room_2")?.script).toEqual([
      { op: "warp", room: 1, x: 8, y: 80 }
    ]);
    expect(scripts.find((entry) => entry.name === "explicit_warp")?.script).toEqual([
      { op: "set_player_direction", direction: "right" },
      { op: "warp", room: 1, x: 32, y: 48 }
    ]);
    expect(contract.topdown_project?.rooms.map((room) => room.resource_bank_group)).toEqual([
      "scene_room_1",
      "scene_room_2"
    ]);
    expect(contract.topdown_project?.rooms[0]?.portals?.[0]).toMatchObject({
      target_position: { x: 8, y: 80 },
      target_direction: "right"
    });
  });

  it("exports change_scene from topdown to platformer through the mixed runtime dispatcher", () => {
    const data = project({
      scenas: [
        { id: "room-town", name: "town", sceneType: "topdown", width: 20, height: 18 },
        { id: "room-stage", name: "stage", sceneType: "platformer", width: 30, height: 18 }
      ],
      events: [{
        id: "event-door",
        name: "door_to_stage",
        category: "Trigger",
        steps: [{ command: "change_scene stage" }]
      }],
      settings: {
        general: { gameTitle: "Mixed Runtime", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "mixed-runtime.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });
    const contract = buildEngineExportProjectContract(data);
    const prepared = prepareEngineProjectExport(data);

    expect(contract).toMatchObject({
      kind: "mixed",
      runtime_profile: "mixed",
      project_data: "mixed_project_data.hpp",
      runtime_dispatch: {
        initial_runtime: "topdown",
        initial_room: 0,
        runtimes: ["topdown", "platformer"]
      }
    });
    expect(contract.template_dir).toContain("exported_mixed");
    expect(contract.topdown_project?.rooms.map((room) => room.name)).toEqual(["town"]);
    expect(contract.platformer_project?.rooms.map((room) => room.name)).toEqual(["stage"]);
    expect(contract.topdown_project?.rooms[0]?.resource_bank_group).toBe("scene_town");
    expect(contract.platformer_project?.rooms[0]?.resource_bank_group).toBe("scene_stage");
    expect(contract.topdown_project?.scripts.find((script) => script.name === "door_to_stage")?.script).toEqual([
      { op: "warp_runtime", runtime: "platformer", room: 0, x: 64, y: 64 }
    ]);
    expect(prepared.error).toBeUndefined();
    expect(prepared.generated?.contract.kind).toBe("mixed");
  });

  it("exports a cutscene and gameplay scene through the mixed runtime dispatcher", () => {
    const data = project({
      scenas: [
        {
          id: "room-intro",
          name: "intro",
          sceneType: "cutscene",
          width: 20,
          height: 18,
          runtime: {
            type: "cutscene",
            config: {
              steps: [{
                id: "intro-step",
                dialogueKey: "",
                eventName: "finish_intro",
                durationFrames: 1,
                autoAdvance: true,
                skippable: true,
                waitForDialogue: false,
                onSkipEventName: "",
                targetSceneIndex: -1,
                branchVariable: -1,
                branchValue: 0,
                branchTargetSceneIndex: -1,
                branchTargetStepIndex: -1
              }]
            }
          }
        },
        { id: "room-town", name: "town", sceneType: "topdown", width: 20, height: 18 }
      ],
      events: [{
        id: "event-finish-intro",
        name: "finish_intro",
        roomName: "intro",
        category: "Cena",
        steps: [{ command: "change_scene town 8 8" }]
      }],
      settings: {
        general: { gameTitle: "Cutscene Mixed", startScene: "intro", startSceneType: "cutscene", exportFolder: "build" },
        build: { romFileName: "cutscene-mixed.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    const contract = buildEngineExportProjectContract(data);

    expect(contract).toMatchObject({
      kind: "mixed",
      runtime_profile: "mixed",
      runtime_dispatch: {
        initial_runtime: "cutscene",
        initial_room: 0,
        runtimes: ["cutscene", "topdown"]
      },
      build: {
        sources: ["main.cpp", "cutscene_runtime.cpp", "topdown_runtime.cpp"]
      }
    });
    expect(contract.cutscene_project?.scenes[0]?.steps[0]?.script).toEqual([
      { op: "warp_runtime", runtime: "topdown", room: 0, x: 64, y: 64 }
    ]);
    expect(contract.topdown_project?.rooms.map((room) => room.name)).toEqual(["town"]);
  });

  it("exports visual novel and world map scenes through the mixed runtime dispatcher", () => {
    const data = project({
      scenas: [
        {
          id: "room-story",
          name: "story",
          sceneType: "visualNovel",
          width: 20,
          height: 18,
          eventBindings: { onInit: "story_to_map" }
        },
        {
          id: "room-map",
          name: "map",
          sceneType: "worldMap",
          width: 20,
          height: 18,
          eventBindings: { onInit: "map_to_town" }
        },
        { id: "room-town", name: "town", sceneType: "topdown", width: 20, height: 18 }
      ],
      events: [
        { id: "event-story-map", name: "story_to_map", roomName: "story", category: "Cena", steps: [{ command: "change_scene map" }] },
        { id: "event-map-town", name: "map_to_town", roomName: "map", category: "Cena", steps: [{ command: "change_scene town" }] }
      ],
      settings: {
        general: { gameTitle: "Narrative Mixed", startScene: "story", startSceneType: "visualNovel", exportFolder: "build" },
        build: { romFileName: "narrative-mixed.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    const contract = buildEngineExportProjectContract(data);

    expect(contract.runtime_dispatch).toMatchObject({
      initial_runtime: "visual_novel",
      runtimes: ["visual_novel", "world_map", "topdown"]
    });
    expect(contract.build.sources).toEqual([
      "main.cpp",
      "visual_novel_runtime.cpp",
      "world_map_runtime.cpp",
      "topdown_runtime.cpp"
    ]);
    expect(contract.visual_novel_project?.scenes[0]?.on_enter).toContainEqual({
      op: "warp_runtime", runtime: "world_map", room: 0, x: 64, y: 64
    });
    expect(contract.world_map_project?.nodes[0]?.on_select).toContainEqual({
      op: "warp_runtime", runtime: "topdown", room: 0, x: 64, y: 64
    });
  });

  it("exports Battle RPG outcome hooks through the mixed runtime dispatcher", () => {
    const data = project({
      scenas: [
        {
          id: "room-battle",
          name: "arena",
          sceneType: "battleRpg",
          width: 20,
          height: 18,
          runtime: { type: "battleRpg", config: { maxPartySize: 1, maxEnemies: 1 } },
          eventBindings: {
            onInit: "battle_enter",
            onVictory: "battle_victory",
            onDefeat: "battle_defeat",
            onEscape: "battle_escape"
          }
        },
        { id: "room-town", name: "town", sceneType: "topdown", width: 20, height: 18 }
      ],
      actors: [
        { id: "actor-hero", name: "Hero", roomName: "arena", battle: { side: "party", maxHp: 20, attack: 8, defense: 3, speed: 5, abilities: ["attack", "heal"] } },
        { id: "actor-slime", name: "Slime", roomName: "arena", battle: { side: "enemy", maxHp: 8, attack: 3, defense: 1, speed: 2, abilities: ["attack"] } }
      ],
      audioItems: [{ id: "audio-confirm", name: "confirm", kind: "sfx" }],
      dialogues: [{ id: "dialogue-win", key: "battle_win", character: "System", text: "Vitoria!" }],
      events: [
        { id: "event-enter", name: "battle_enter", roomName: "arena", category: "Batalha", steps: [{ command: "set_variable battle.started 1" }] },
        { id: "event-win", name: "battle_victory", roomName: "arena", category: "Batalha", steps: [{ command: "play_sfx confirm" }, { command: "show_dialogue battle_win" }, { command: "change_scene town" }] },
        { id: "event-defeat", name: "battle_defeat", roomName: "arena", category: "Batalha", steps: [{ command: "set_variable battle.lost 1" }, { command: "change_scene arena" }] },
        { id: "event-escape", name: "battle_escape", roomName: "arena", category: "Batalha", steps: [{ command: "set_variable battle.escaped 1" }, { command: "change_scene arena" }] }
      ],
      variables: [{ name: "battle.started" }, { name: "battle.lost" }, { name: "battle.escaped" }],
      settings: {
        general: { gameTitle: "Battle Mixed", startScene: "arena", startSceneType: "battleRpg", exportFolder: "build" },
        build: { romFileName: "battle-mixed.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    const contract = buildEngineExportProjectContract(data);

    expect(contract.runtime_dispatch).toMatchObject({
      initial_runtime: "battle_rpg",
      runtimes: ["battle_rpg", "topdown"]
    });
    expect(contract.build.sources).toEqual(["main.cpp", "battle_rpg_runtime.cpp", "topdown_runtime.cpp"]);
    expect(contract.battle_rpg_project).toMatchObject({
      save: { enabled: true, slot_count: 3 },
      dialogue_lines: [expect.objectContaining({ text: "Vitoria!" })],
      encounters: [expect.objectContaining({
        on_enter: [{ op: "set_variable", variable: 0, value: 1 }],
        on_victory: [
          { op: "play_sfx", index: 0 },
          { op: "show_dialogue", dialogue: 0 },
          { op: "warp_runtime", runtime: "topdown", room: 0, x: 64, y: 64 }
        ],
        on_defeat: [
          { op: "set_variable", variable: 1, value: 1 },
          { op: "warp_runtime", runtime: "battle_rpg", room: 0, x: 64, y: 64 }
        ],
        on_escape: [
          { op: "set_variable", variable: 2, value: 1 },
          { op: "warp_runtime", runtime: "battle_rpg", room: 0, x: 64, y: 64 }
        ]
      })]
    });
  });

  it("exports fighting stage entry and outcome event hooks", () => {
    const data = project({
      scenas: [{
        id: "room-fight",
        name: "arena",
        sceneType: "luta",
        width: 30,
        height: 20,
        runtime: { type: "luta", config: {} },
        eventBindings: {
          onInit: "fight_enter",
          onVictory: "fight_victory",
          onDefeat: "fight_defeat"
        }
      }],
      events: [
        { id: "event-enter", name: "fight_enter", roomName: "arena", category: "Batalha", steps: [{ command: "set_variable fight.started 1" }] },
        { id: "event-victory", name: "fight_victory", roomName: "arena", category: "Batalha", steps: [{ command: "set_variable fight.won 1" }] },
        { id: "event-defeat", name: "fight_defeat", roomName: "arena", category: "Batalha", steps: [{ command: "set_variable fight.lost 1" }] }
      ],
      variables: [{ name: "fight.started" }, { name: "fight.won" }, { name: "fight.lost" }],
      settings: {
        general: { gameTitle: "Fight", startScene: "arena", startSceneType: "luta", exportFolder: "build" },
        build: { romFileName: "fight.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    const contract = buildEngineExportProjectContract(data);

    expect(contract.luta_project?.stages[0]).toMatchObject({
      on_enter: [{ op: "set_variable", variable: 0, value: 1 }],
      on_victory: [{ op: "set_variable", variable: 1, value: 1 }],
      on_defeat: [{ op: "set_variable", variable: 2, value: 1 }]
    });
  });

  it("compiles scene stack commands with the runtime that owns each script", () => {
    const data = project({
      scenas: [
        { id: "room-menu", name: "menu", sceneType: "topdown", width: 20, height: 18 },
        { id: "room-stage", name: "stage", sceneType: "platformer", width: 80, height: 18 }
      ],
      events: [
        {
          id: "event-open-menu",
          name: "open_menu",
          roomName: "stage",
          category: "Cena",
          steps: [{ command: "scene_stack_push" }, { command: "change_scene menu 4 5" }]
        },
        {
          id: "event-close-menu",
          name: "close_menu",
          roomName: "menu",
          category: "Cena",
          steps: [{ command: "scene_stack_previous" }]
        }
      ],
      settings: {
        general: { gameTitle: "Scene Stack", startScene: "stage", startSceneType: "platformer", exportFolder: "build" },
        build: { romFileName: "scene-stack.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    const contract = buildEngineExportProjectContract(data);

    expect(contract.platformer_project?.scripts.find((script) => script.name === "open_menu")?.script).toEqual([
      { op: "scene_stack_push", runtime: "platformer" },
      { op: "warp_runtime", runtime: "topdown", room: 0, x: 32, y: 40 }
    ]);
    expect(contract.topdown_project?.scripts.find((script) => script.name === "close_menu")?.script).toEqual([
      { op: "scene_stack_previous", runtime: "topdown" }
    ]);
  });

  it("expands persisted compact tilemaps before preparing the Engine Pack export", async () => {
    const fixture = await readFile(path.join(process.cwd(), "../../packages/project-contract/fixtures/topdown-demo.gba-project"), "utf8");
    const project = parseGBAProjectFile(fixture);
    const compactProject = compactProjectTilemaps(project.data);

    const result = prepareEngineProjectExport(compactProject);

    expect(result.error).toBeUndefined();
    expect(result.generated?.contract).toMatchObject({
      kind: "topdown",
      runtime_profile: "topdown"
    });
  });

  it("keeps wide rooms and exports topdown, platformer, shmup and point-and-click in one ROM", () => {
    const data = project({
      scenas: [
        { id: "room-town", name: "town", sceneType: "topdown", width: 56, height: 56 },
        {
          id: "room-stage",
          name: "stage",
          sceneType: "platformer",
          width: 161,
          height: 18,
          backgroundAssetName: "space.png",
          gbStudioUseBackgroundLayout: true
        },
        {
          id: "room-space",
          name: "space",
          sceneType: "shmup",
          width: 255,
          height: 18,
          backgroundAssetName: "space.png",
          runtime: { type: "shmup", config: { playerSpeed: 3, fireCooldown: 8, scrollSpeed: 2 } }
        },
        { id: "room-console", name: "console", sceneType: "pointAndClick", width: 80, height: 18 }
      ],
      assets: [{
        id: "asset-space",
        name: "space.png",
        kind: "Background",
        metadata: { source: "Assets/backgrounds/space.png", width: 2040, height: 144 }
      }],
      settings: {
        general: { gameTitle: "Wide Mixed Runtime", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "wide-mixed.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    const contract = buildEngineExportProjectContract(data);

    expect(contract.kind).toBe("mixed");
    expect(contract.runtime_dispatch?.runtimes).toEqual(["topdown", "platformer", "shmup", "point_click"]);
    expect(contract.build.sources).toEqual([
      "main.cpp",
      "topdown_runtime.cpp",
      "platformer_runtime.cpp",
      "shmup_runtime.cpp",
      "point_click_runtime.cpp"
    ]);
    expect(contract.platformer_project?.rooms[0]).toMatchObject({
      width_tiles: 161,
      height_tiles: 18,
      visual_tilemap: "space",
      visual_tilemap_layout: "source_asset"
    });
    expect(contract.shmup_project).toMatchObject({
      resource_banks: "asset_pack",
      waves: [expect.objectContaining({
        resource_bank_group: "scene_space"
      })],
      backgrounds: [expect.objectContaining({
        width_tiles: 255,
        height_tiles: 18,
        layers: [expect.objectContaining({
          layer: "bg2",
          tilemap: expect.any(String),
          scroll: { x: 2, y: 0 }
        })]
      })]
    });
    expect(contract.point_click_project?.scenes[0]?.name).toBe("console");
  });

  it("limits topdown backgrounds to tilemaps referenced by topdown rooms", () => {
    const data = project({
      scenas: [
        {
          id: "room-town",
          name: "town",
          sceneType: "topdown",
          width: 20,
          height: 18,
          backgroundAssetName: "town.png",
          gbStudioUseBackgroundLayout: true
        },
        {
          id: "screen-title",
          name: "title",
          sceneType: "menu",
          width: 30,
          height: 20,
          backgroundAssetName: "title.png"
        }
      ],
      assets: [
        { id: "asset-town", name: "town.png", kind: "Background", metadata: { source: "Assets/backgrounds/town.png", width: 240, height: 160 } },
        { id: "asset-title", name: "title.png", kind: "Background", metadata: { source: "Assets/backgrounds/title.png", width: 240, height: 160 } }
      ],
      settings: {
        general: { gameTitle: "Topdown Backgrounds", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "topdown-backgrounds.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    const contract = buildEngineExportProjectContract(data);

    expect(contract.topdown_project?.backgrounds?.map((background) => background.tilemap)).toEqual(["town"]);
    expect(contract.topdown_project?.rooms[0]).toMatchObject({
      visual_tilemap: "town",
      visual_tilemap_layout: "source_asset"
    });
  });

  it("starts a development export directly in a selected mixed-runtime scene without mutating the project", () => {
    const data = project({
      scenas: [
        { id: "room-town", name: "town", sceneType: "topdown", width: 20, height: 18 },
        { id: "room-stage", name: "stage", sceneType: "platformer", width: 80, height: 18 },
        {
          id: "room-space",
          name: "space",
          sceneType: "shmup",
          width: 255,
          height: 18,
          backgroundAssetName: "space.png"
        },
        { id: "room-console", name: "console", sceneType: "pointAndClick", width: 80, height: 18 }
      ],
      assets: [{
        id: "asset-space",
        name: "space.png",
        kind: "Background",
        metadata: { source: "Assets/backgrounds/space.png", width: 2040, height: 144 }
      }],
      settings: {
        general: { gameTitle: "Development scene launch", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "development-scene.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: true, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    const shmupContract = buildEngineExportProjectContract(data, {
      developmentStartScene: { id: "room-space", x: 12, y: 7, direction: "left" }
    });
    const pointClickContract = buildEngineExportProjectContract(data, {
      developmentStartScene: { name: "console" }
    });

    expect(shmupContract.runtime_dispatch).toMatchObject({ initial_runtime: "shmup", initial_room: 0 });
    expect(shmupContract.shmup_project?.initial_wave).toBe(0);
    expect(shmupContract.shmup_project?.player.position).toEqual({ x: 96, y: 56 });
    expect(shmupContract.shmup_project?.backgrounds?.[0]).toMatchObject({ width_tiles: 255, height_tiles: 18 });
    expect(pointClickContract.runtime_dispatch).toMatchObject({ initial_runtime: "point_click", initial_room: 0 });
    expect(pointClickContract.point_click_project?.initial_scene).toBe(0);
    expect((data.settings as Record<string, Record<string, unknown>>).general.startScene).toBe("town");
  });

  it("does not inherit the global position when testing another development scene", () => {
    const data = project({
      scenas: [
        { id: "a", name: "town", sceneType: "topdown", width: 30, height: 20 },
        { id: "b", name: "shop", sceneType: "topdown", width: 30, height: 20, playerActorName: "Player" }
      ],
      actors: [{ id: "player-shop", name: "Player", roomName: "shop", x: 4, y: 6 }],
      settings: { ...(project({}).settings as Record<string, unknown>), general: { gameTitle: "Test", startScene: "town", startSceneType: "topdown", exportFolder: "build", startX: 20, startY: 12, startDirection: "left" } }
    });
    const before = JSON.stringify(data);
    const contract = buildEngineExportProjectContract(data, { developmentStartScene: { name: "shop" } });
    expect(contract.topdown_project?.rooms.find(room => room.name === "shop")?.metadata.player_start).toEqual({ x: 32, y: 48 });
    expect(JSON.stringify(data)).toBe(before);
  });

  it("exports the three authored shmup planes with independent horizontal scroll", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-storm",
        name: "storm",
        sceneType: "shmup",
        width: 60,
        height: 20,
        backgroundAssetName: "storm-mid.png",
        runtime: { type: "shmup", config: { scrollSpeed: 2 } },
        tileLayers: [
          { mapping: "BG3", tileSourceAssetNames: ["storm-sky.png"] },
          { mapping: "BG2", tileSourceAssetNames: ["storm-mid.png"] },
          { mapping: "BG1", tileSourceAssetNames: ["storm-foreground.png"] },
        ],
      }],
      assets: [
        { id: "asset-storm-sky", name: "storm-sky.png", kind: "Background", metadata: { source: "Assets/backgrounds/storm-sky.png", width: 480, height: 160 } },
        { id: "asset-storm-mid", name: "storm-mid.png", kind: "Background", metadata: { source: "Assets/backgrounds/storm-mid.png", width: 480, height: 160 } },
        { id: "asset-storm-foreground", name: "storm-foreground.png", kind: "Background", metadata: { source: "Assets/backgrounds/storm-foreground.png", width: 480, height: 160 } },
      ],
      settings: {
        general: { gameTitle: "Storm", startScene: "storm", startSceneType: "shmup", exportFolder: "build" },
        build: { romFileName: "storm.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
      },
    }));

    expect(contract.shmup_project?.backgrounds).toEqual([expect.objectContaining({
      name: "storm",
      width_tiles: 60,
      height_tiles: 20,
      layers: [
        expect.objectContaining({ layer: "bg3", scroll: { x: 1, y: 0 } }),
        expect.objectContaining({ layer: "bg2", scroll: { x: 2, y: 0 } }),
        expect.objectContaining({ layer: "bg1", scroll: { x: 3, y: 0 } }),
      ],
    })]);
  });

  it("exports the explicit affine SHMUP composition with the physical world contract", () => {
    const composition = {
      ...defaultSceneComposition(),
      enabled: true,
      mode: "affine" as const,
      layers: [{
        id: "day-background",
        kind: "affine_bg" as const,
        role: "decorative" as const,
        layer: "BG2" as const,
        enabled: true,
        priority: 2 as const,
        assetId: "day-bg.png",
        parallax: { x256: 256, y256: 256 },
        scroll: { x: 0, y: 0 },
        affine: {
          rotationDegrees: 0,
          scaleX: 1,
          scaleY: 1,
          pivotX: 120,
          pivotY: 80,
          wrap: false
        },
        bitmapPage: 0 as const
      }]
    };
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-day",
        name: "day-shmup",
        sceneType: "shmup",
        width: 90,
        height: 20,
        runtime: {
          type: "shmup",
          config: {
            composition,
            capabilities: [{ id: "affine_background", enabled: true, settings: {} }],
            scrollSpeed: 2
          }
        },
        collisionTypes: Array.from({ length: 90 * 20 }, () => "free")
      }],
      assets: [{
        id: "asset-day-bg",
        name: "day-bg.png",
        kind: "Background",
        colorMode: "8bpp-affine",
        metadata: { kind: "affine_bg", colorMode: "8bpp-affine", width: 1024, height: 1024 }
      }],
      settings: {
        general: { gameTitle: "Day SHMUP", startScene: "day-shmup", exportFolder: "build" },
        build: { romFileName: "day-shmup.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.shmup_project?.player.size).toEqual({ x: 32, y: 32 });
    expect(contract.shmup_project?.backgrounds).toEqual([expect.objectContaining({
      width_tiles: 90,
      height_tiles: 20,
      layers: [],
      video: expect.objectContaining({
        display_mode: 1,
        affine: expect.objectContaining({ layer: "BG2", asset: "day_bg" })
      }),
      collision_width_tiles: 90,
      collision_height_tiles: 20,
      collision_flags: expect.any(Array),
      world_width_pixels: 720,
      world_height_pixels: 160
    })]);
    expect(contract.shmup_project?.backgrounds?.[0]?.layers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ layer: "bg2" })])
    );
    expect(contract.shmup_project?.video).toEqual({ display_mode: 0, affine: null, bitmap: null });
  });

  it("exports SHMUP score and wave module semantics to the native project", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-storm",
        name: "start",
        sceneType: "shmup",
        width: 60,
        height: 20,
        runtime: {
          type: "shmup",
          config: {
            modules: [
              { id: "score", enabled: true, settings: { initialScore: 250, pointsPerEnemy: 250, initialLives: 5, persistHighScore: false } },
              { id: "waves", enabled: true, settings: { maxWaves: 3, loop: true } }
            ]
          }
        }
      }]
    }));

    expect(contract.shmup_project).toMatchObject({
      score_enabled: true,
      high_score_enabled: false,
      initial_score: 250,
      initial_lives: 5,
      waves_enabled: true,
      max_waves: 3,
      loop_waves: true,
      waves: [expect.objectContaining({
        enemies: [expect.objectContaining({ score: 250 })]
      })]
    });
  });

  it("exports an authored SHMUP wave plan as distinct linked waves", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-storm",
        name: "storm",
        sceneType: "shmup",
        width: 60,
        height: 20,
        playerActorName: "Player",
        runtime: {
          type: "shmup",
          config: {
            wavePlan: [
              { name: "entrada", startFrame: 0, scrollSpeed: 1 },
              { name: "nucleo", startFrame: 90, scrollSpeed: 2, playerSpeed: 3, fireCooldown: 6 }
            ]
          }
        }
      }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "storm", x: 8, y: 10 },
        { id: "actor-scout-a", name: "Scout A", roomName: "storm", x: 24, y: 6, waveIndex: 0 },
        { id: "actor-scout-b", name: "Scout B", roomName: "storm", x: 40, y: 12, waveIndex: 1 }
      ],
      settings: {
        general: { gameTitle: "SHMUP Waves", startScene: "storm", startSceneType: "shmup", exportFolder: "build" },
        shmup: { playerSpeed: 2, fireRate: 8, scrollSpeed: 1 },
        build: { romFileName: "shmup-waves.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.shmup_project?.waves).toMatchObject([
      {
        name: "entrada",
        start_frame: 0,
        next_wave: 1,
        enemies: [expect.objectContaining({ name: "Scout A" })]
      },
      {
        name: "nucleo",
        start_frame: 90,
        next_wave: -1,
        player_speed: 3,
        fire_cooldown: 6,
        enemies: [expect.objectContaining({ name: "Scout B" })]
      }
    ]);
  });

  it("rejects a development scene override that does not exist", () => {
    expect(() => buildEngineExportProjectContract(project({}), {
      developmentStartScene: { id: "missing-room" }
    })).toThrow('Cena de desenvolvimento nao encontrada: id "missing-room".');
  });

  it("keeps scene event indexes stable while compiling actor commands only for the owning runtime", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-town", name: "start", sceneType: "topdown", width: 20, height: 18 },
        { id: "room-stage", name: "stage", sceneType: "platformer", width: 80, height: 18 }
      ],
      actors: [{ id: "actor-stage", name: "StageGuide", roomName: "stage", x: 70, y: 8 }],
      events: [{
        id: "event-stage-guide",
        name: "stage_guide_update",
        roomName: "stage",
        category: "Ator",
        steps: [{ command: "set_actor_visible StageGuide false" }]
      }]
    }));

    expect(contract.topdown_project?.scripts[0]).toEqual({ name: "stage_guide_update", script: [] });
    expect(contract.platformer_project?.scripts[0]).toEqual({
      name: "stage_guide_update",
      script: [{ op: "set_actor_visible", actor: 0, value: 0 }]
    });
  });

  it("exports a topdown connection to an isometric room as a dispatcher portal", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-town", name: "town", sceneType: "topdown", width: 20, height: 18 },
        { id: "room-cave", name: "cave", sceneType: "isometric", width: 24, height: 20 }
      ],
      editorState: {
        scenaConnections: [{ from: "town", to: "cave", eventName: "enter_cave" }]
      },
      settings: {
        general: { gameTitle: "Mixed Runtime", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "mixed-runtime.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.kind).toBe("mixed");
    expect(contract.isometric_project?.rooms.map((room) => room.name)).toEqual(["cave"]);
    expect(contract.isometric_project?.rooms[0]?.resource_bank_group).toBe("scene_cave");
    expect(contract.topdown_project?.rooms[0]?.portals?.[0]?.script).toEqual([
      { op: "warp_runtime", runtime: "isometric", room: 0, x: 1, y: 10 }
    ]);
  });

  it("accepts an isometric connection into the selected topdown runtime", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-town", name: "town", sceneType: "topdown", width: 20, height: 18 },
        { id: "room-cave", name: "cave", sceneType: "isometric", width: 24, height: 20 }
      ],
      editorState: {
        scenaConnections: [{
          from: "cave",
          to: "town",
          eventName: "leave_cave",
          exit: { x: 4, y: 5, width: 2, height: 1 },
          entry: { x: 2, y: 3, width: 1, height: 1 }
        }]
      },
      settings: {
        general: { gameTitle: "Mixed Runtime", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "mixed-runtime.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.kind).toBe("mixed");
    expect(contract.runtime_dispatch).toMatchObject({
      initial_runtime: "topdown",
      initial_room: 0,
      runtimes: ["topdown", "isometric"],
      save: {
        enabled: true,
        signature: "GBUS",
        slot_count: 3
      }
    });
    expect(contract.isometric_project?.rooms[0]?.tile_events).toEqual([{
      area: { x: 4, y: 5, width: 2, height: 1 },
      on_interact: [{ op: "warp_runtime", runtime: "topdown", room: 0, x: 24, y: 24 }]
    }]);
  });

  it("exports platformer camera zones independently from cross-runtime connection triggers", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-town", name: "town", sceneType: "topdown", width: 20, height: 18 },
        {
          id: "room-stage",
          name: "stage",
          sceneType: "platformer",
          width: 24,
          height: 20,
          cameraZones: [{
            id: "zone-stage",
            name: "Arena",
            area: { x: 3, y: 4, width: 5, height: 6 },
            bounds: { x: 16, y: 32, width: 256, height: 160 },
            offset: { x: 8, y: -4 },
            lockX: true,
            lockY: false
          }]
        }
      ],
      editorState: {
        scenaConnections: [{
          from: "stage",
          to: "town",
          exit: { x: 5, y: 6, width: 2, height: 2 },
          entry: { x: 2, y: 3, width: 1, height: 1 }
        }]
      },
      settings: {
        general: { gameTitle: "Mixed Runtime", startScene: "stage", startSceneType: "platformer", exportFolder: "build" },
        build: { romFileName: "mixed-runtime.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    const room = contract.platformer_project?.rooms[0];
    expect(room?.camera_zones).toEqual([{
      area: { x: 24, y: 32, width: 40, height: 48 },
      bounds: { x: 16, y: 32, width: 256, height: 160 },
      offset: { x: 8, y: -4 },
      lock_x: true,
      lock_y: false
    }]);
    expect(room?.triggers).toEqual([{
      area: { x: 40, y: 48, width: 16, height: 16 },
      on_enter: [{ op: "warp_runtime", runtime: "topdown", room: 0, x: 24, y: 24 }]
    }]);
  });

  it("exports topdown and isometric camera zones using their native coordinate spaces", () => {
    const zone = {
      id: "zone-entry",
      name: "Entrada",
      area: { x: 2, y: 3, width: 4, height: 2 },
      bounds: { x: 16, y: 24, width: 320, height: 192 },
      offset: { x: 6, y: -2 },
      lockX: true,
      lockY: false
    };
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-top", name: "town", sceneType: "topdown", width: 20, height: 18, cameraZones: [zone] },
        { id: "room-iso", name: "plaza", sceneType: "isometric", width: 16, height: 16, cameraZones: [zone] }
      ],
      settings: {
        general: { gameTitle: "Camera Zones", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "camera-zones.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.rooms[0]?.camera_zones?.[0]).toMatchObject({
      area: { x: 16, y: 24, width: 32, height: 16 },
      bounds: zone.bounds,
      offset: zone.offset,
      lock_x: true,
      lock_y: false
    });
    expect(contract.isometric_project?.rooms[0]?.camera_zones?.[0]).toMatchObject({
      area: zone.area,
      bounds: zone.bounds,
      offset: zone.offset,
      lock_x: true,
      lock_y: false
    });
    expect(contract.requires.features).toEqual(expect.arrayContaining([
      "topdown_runtime.camera_zones",
      "isometric_runtime.camera_zones"
    ]));
  });

  it("uses the configured player actor as the topdown boot spawn even when the initial room has a connection", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-1", name: "room_1", sceneType: "topdown", width: 20, height: 18, cameraPosition: { x: 0, y: 0 } },
        { id: "room-2", name: "room_2", sceneType: "topdown", width: 24, height: 20, cameraBounds: { x: 2, y: 2, width: 22, height: 18 } }
      ],
      actors: [
        { id: "player-1", name: "Player", roomName: "room_1", x: 2, y: 3 },
        { id: "player-2", name: "Player", roomName: "room_2", x: 7, y: 9 }
      ],
      editorState: {
        scenaConnections: [{ from: "room_1", to: "room_2", eventName: "enter_room_2" }]
      },
      settings: {
        general: { gameTitle: "Initial Room", startScene: "room_2", startSceneType: "topdown", startPlayer: "Player", exportFolder: "build" },
        build: { romFileName: "initial-room.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }), {
      enginePackPath: "/packs/GBAStudioEnginePack",
      enginePackVersion: "2.24.0"
    });

    expect(contract.topdown_project?.initial_room).toBe(1);
    expect(contract.topdown_project?.player.position).toEqual({ x: 56, y: 72 });
    expect(contract.topdown_project?.player.direction).toBe("down");
    expect(contract.topdown_project?.camera.position).toEqual({ x: 16, y: 16 });
    expect(contract.topdown_project?.rooms[1]?.metadata.camera_bounds).toEqual({
      x: 16,
      y: 16,
      width: 176,
      height: 144
    });
  });

  it("returns a generated export for projects that pass the migration contract", () => {
    const result = prepareEngineProjectExport(project({ name: "Valid Export" }));

    expect(result.error).toBeUndefined();
    expect(result.generated?.target).toBe("export");
  });

  it("lists processable assets in the Engine contract and prepared export", () => {
    const result = prepareEngineProjectExport(project({
      name: "Asset Export",
      assets: [
        { id: "asset-player", name: "Player Idle.PNG", kind: "Sprite", metadata: { source: "Assets/Sprites/Player Idle.PNG" } },
        { id: "asset-theme", name: "Theme.MOD", kind: "Audio", metadata: { source: "Assets/Audio/Theme.MOD" } }
      ]
    }));

    expect(result.error).toBeUndefined();
    expect(result.generated?.contract.generated_assets).toEqual([]);
    expect(result.generated?.contract.copied_assets).toEqual([
      {
        id: "asset-player",
        name: "Player Idle.PNG",
        kind: "Sprite",
        source: "Assets/Sprites/Player Idle.PNG",
        output: "assets/sprite/player_idle.png"
      },
      {
        id: "asset-theme",
        name: "Theme.MOD",
        kind: "Audio",
        source: "Assets/Audio/Theme.MOD",
        output: "assets/audio/theme.mod"
      }
    ]);
    expect(result.generated?.assets).toEqual([
      {
        id: "asset-player",
        name: "Player Idle.PNG",
        kind: "Sprite",
        source: "Assets/Sprites/Player Idle.PNG",
        output: "assets/sprite/player_idle.png"
      },
      {
        id: "asset-theme",
        name: "Theme.MOD",
        kind: "Audio",
        source: "Assets/Audio/Theme.MOD",
        output: "assets/audio/theme.mod"
      }
    ]);
  });

  it("maps call_event commands to Engine script calls", () => {
    const contract = buildEngineExportProjectContract(project({
      events: [
        { id: "event-room", name: "room_boot", category: "Cena", steps: [{ command: "call_event player_start" }] },
        { id: "event-player", name: "player_start", category: "Controle", steps: [{ command: "show_dialogue intro" }] }
      ],
      dialogues: [{ key: "intro", text: "Ola" }]
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      { name: "room_boot", script: [{ op: "call_script", index: 1 }] },
      { name: "player_start", script: [{ op: "show_dialogue", dialogue: 0 }] }
    ]));
  });

  it("keeps call_event script indices aligned with topdown_project.scripts even when an earlier event compiles to an empty script", () => {
    // O motor real (assetc: emit_topdown_project_scripts) enderaca "scripts" por posicao no array
    // (CallScript.a), nao por nome. Se o exportador pular eventos cujo script compilado fica vazio
    // (por exemplo um evento que so contem "choice_event", resolvido em compile-time para
    // choice_groups), todos os indices de call_event apos ele ficam deslocados e passam a chamar
    // o script errado no ROM.
    const contract = buildEngineExportProjectContract(project({
      dialogues: [{ key: "intro", text: "Ola", choices: ["Ir", "Voltar"] }],
      events: [
        {
          id: "event-choice-binding-only",
          name: "choice_binding_only",
          category: "Dialogo",
          steps: [{ command: "choice_event intro 0 target_event" }]
        },
        {
          id: "event-target",
          name: "target_event",
          category: "Controle",
          steps: [{ command: "show_dialogue intro" }]
        },
        {
          id: "event-caller",
          name: "caller_event",
          category: "Controle",
          steps: [{ command: "call_event target_event" }]
        }
      ]
    }));

    expect(contract.topdown_project?.scripts).toEqual([
      { name: "choice_binding_only", script: [] },
      { name: "target_event", script: [{ op: "show_dialogue", dialogue: 0 }] },
      { name: "caller_event", script: [{ op: "call_script", index: 1 }] }
    ]);
  });

  it("compiles play_music for editor-composed tracker (no imported mod) into RunAudioRoutine", () => {
    const contract = buildEngineExportProjectContract(project({
      audioItems: [{
        id: "audio-battle",
        name: "battle_theme",
        kind: "Musica",
        format: "MOD",
        exportID: "battle_theme",
        loops: true,
        patterns: [{
          id: "pattern-main",
          name: "Main",
          steps: 4,
          channels: [{
            id: "pattern-main-pulse1",
            name: "Pulse 1",
            type: "pulse1",
            notes: ["C4", "", "E4", ""]
          }]
        }],
        patternOrder: ["pattern-main"]
      }],
      events: [{
        id: "event-boot",
        name: "room_boot",
        category: "Cena",
        steps: [{ command: "play_music battle_theme" }]
      }]
    }));

    const roomBootScript = contract.topdown_project?.scripts.find((script) => script.name === "room_boot")?.script;
    expect(roomBootScript).toEqual([{ op: "run_audio_routine", index: 0 }]);
    expect(contract.copied_assets ?? []).toEqual([]);
    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "audio", audio_json: "assets/audio/project_audio.json" })
    ]));
  });

  it("compiles play_music/play_sfx into the opcodes that actually read tracker/pcm assets (RunAudioRoutine/PlayPcmSfx), not the always-empty synth tables (PlayMusic/PlaySfx)", () => {
    // O motor real (gbs_event.cpp) so liga musica/sfx do projeto (arquivos .mod/.wav importados)
    // via RunAudioRoutine (project.tracker_assets) e PlayPcmSfx (project.pcm_assets). PlayMusic e
    // PlaySfx apontam para project.music_assets/sfx_assets, uma tabela "sintetizada" que o
    // exportador nunca preenche (buildAssetcAudioPackGeneration so gera tracker/pcm) - ou seja,
    // "play_music"/"play_sfx" compilados como esses ops nunca tocam nada no ROM.
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-theme", name: "theme.mod", kind: "Audio", metadata: { source: "Assets/music/theme.mod" } },
        { id: "asset-confirm", name: "confirm.wav", kind: "Audio", metadata: { source: "Assets/sounds/confirm.wav" } }
      ],
      audioItems: [
        { id: "audio-theme", name: "theme.mod", kind: "Musica", format: "MOD", exportID: "theme", loops: true },
        { id: "audio-confirm", name: "confirm.wav", kind: "SFX", format: "WAV", exportID: "confirm", loops: false }
      ],
      events: [
        {
          id: "event-room",
          name: "room_boot",
          category: "Cena",
          steps: [{ command: "play_music theme.mod" }, { command: "play_sfx confirm.wav" }]
        }
      ]
    }));

    const roomBootScript = contract.topdown_project?.scripts.find((script) => script.name === "room_boot")?.script;
    expect(roomBootScript).toEqual([
      { op: "run_audio_routine", index: 0 },
      { op: "play_pcm_sfx", index: 0 }
    ]);
  });

  it("compiles advanced audio buses, fades and PCM SFX playback options", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-confirm", name: "confirm.wav", kind: "Audio", metadata: { source: "Assets/sounds/confirm.wav" } }
      ],
      audioItems: [
        { id: "audio-confirm", name: "confirm.wav", kind: "SFX", format: "WAV", exportID: "confirm", loops: false }
      ],
      events: [{
        id: "event-audio",
        name: "audio_mix",
        category: "Audio",
        steps: [
          { command: "mute_audio_channel music true" },
          { command: "set_audio_volume sfx 80" },
          { command: "fade_audio_volume pcm_music 25 90" },
          { command: "play_sfx confirm.wav 60 12" }
        ]
      }]
    }));

    expect(contract.topdown_project?.scripts.find((script) => script.name === "audio_mix")?.script).toEqual([
      { op: "mute_audio_channel", channel: "music", muted: true },
      { op: "set_audio_volume", channel: "sfx", volume: 12 },
      { op: "fade_audio_volume", channel: "pcm_music", volume: 4, frames: 90 },
      { op: "play_pcm_sfx", index: 0, volume: 9, priority: 12 }
    ]);
  });

  it("exports state and inventory event commands using the numeric variable/item slots the Engine assetc expects", () => {
    // O assetc real (GBAStudioEngine/tools/assetc/assetc.py) nao aceita chaves string ("key") nem
    // o op "set_flag" (nao existe no motor - flags sao variaveis 0/1). Ele exige indices numericos
    // ("variable"/"item") resolvidos a partir de uma tabela estavel por projeto.
    const contract = buildEngineExportProjectContract(project({
      events: [
        {
          id: "event-state",
          name: "state_flow",
          category: "Controle",
          steps: [
            { command: "set_variable score 10" },
            { command: "add_variable score 5" },
            { command: "multiply_variable score 2" },
            { command: "set_flag story.progress true" },
            { command: "add_variable_flags story.flags 1" },
            { command: "add_item potion 2" },
            { command: "modify_wallet wallet.gold 25 999" },
            { command: "set_equipped_item 0 sword" }
          ]
        }
      ]
    }));

    // Registro de variaveis (ordem alfabetica e deterministica): score=0, story.flags=1, story.progress=2, wallet.gold=3
    // Registro de itens: potion=0, sword=1
    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      {
        name: "state_flow",
        script: [
          { op: "set_variable", variable: 0, value: 10 },
          { op: "add_variable", variable: 0, amount: 5 },
          { op: "multiply_variable", variable: 0, amount: 2 },
          { op: "set_variable", variable: 2, value: 1 },
          { op: "add_variable_flags", variable: 1, mask: 1 },
          { op: "add_inventory_item", item: 0, quantity: 2 },
          { op: "modify_wallet", variable: 3, amount: 25, max: 999 },
          { op: "set_equipped_item", slot: 0, item: 1 }
        ]
      }
    ]));
  });

  it("exports the native Engine batch for flags, actor runtime state and player bounce", () => {
    const contract = buildEngineExportProjectContract(project({
      actors: [{ id: "actor-guide", name: "Guide", roomName: "start", x: 4, y: 5 }],
      events: [
        {
          id: "event-native-state",
          name: "native_state",
          category: "Controle",
          steps: [
            { command: "add_variable_flags story.flags 1" },
            { command: "set_variable_flags story.flags 6" },
            { command: "clear_variable_flags story.flags 2" },
            { command: "reset_variables_false" },
            { command: "set_actor_collision_enabled Guide false" },
            { command: "set_all_sprites_visible false" },
            { command: "set_actor_animation_speed Guide 125" },
            { command: "player_bounce 2 30" }
          ]
        }
      ]
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      {
        name: "native_state",
        script: [
          { op: "add_variable_flags", variable: 0, mask: 1 },
          { op: "set_variable_flags", variable: 0, mask: 6 },
          { op: "clear_variable_flags", variable: 0, mask: 2 },
          { op: "reset_variables_false" },
          { op: "set_actor_collision_enabled", actor: 0, value: 0 },
          { op: "set_all_sprites_visible", value: 0 },
          { op: "set_actor_animation_speed", actor: 0, percent: 125 },
          { op: "player_bounce", height_tiles: 2, frames: 30 }
        ]
      }
    ]));
  });

  it("exports native actor reads, player movement, input, random seed and stat commands", () => {
    const contract = buildEngineExportProjectContract(project({
      actors: [{ id: "actor-guide", name: "Guide", roomName: "start", x: 4, y: 5 }],
      events: [
        {
          id: "event-native-control",
          name: "native_control",
          category: "Controle",
          steps: [
            { command: "set_actor_collision_box Guide 0 1 12 14" },
            { command: "set_player_speed_profile 110 175 a 3" },
            { command: "set_player_movement_state swimming water" },
            { command: "store_actor_position Guide actor.x actor.y" },
            { command: "store_actor_direction Guide actor.direction" },
            { command: "set_random_seed story.seed" },
            { command: "wait_button a" },
            { command: "set_stat hp 16 24" }
          ]
        }
      ]
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      {
        name: "native_control",
        script: [
          { op: "set_actor_collision_box", actor: 0, offset_x: 0, offset_y: 1, width: 12, height: 14 },
          { op: "set_player_speed_profile", walk_speed: 110, run_speed: 175, stamina_cost: 3 },
          { op: "set_player_movement_state", state: "swimming", tile_tag: "water" },
          { op: "store_actor_position", actor: 0, variable_x: 1, variable_y: 2 },
          { op: "store_actor_direction", actor: 0, variable: 0 },
          { op: "set_random_seed", variable: 3 },
          { op: "wait_button", button: "a" },
          { op: "set_stat", stat: "hp", current: 16, max: 24 }
        ]
      }
    ]));
  });

  it("exports random_variable with the min/max range the Engine assetc expects", () => {
    const contract = buildEngineExportProjectContract(project({
      events: [
        {
          id: "event-dice",
          name: "roll_dice",
          category: "Controle",
          steps: [{ command: "random_variable story.dice 1 6" }]
        }
      ]
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      { name: "roll_dice", script: [{ op: "random_variable", variable: 0, min: 1, max: 6 }] }
    ]));
  });

  it("attaches per-choice scripts to choice_groups when events register choice_event bindings", () => {
    // O motor real (GBAStudioEngine) executa a escolha via choice_groups[].choices[].script no
    // momento da selecao - nao existe "registro" de choice_event em runtime como no preview.
    // O export precisa resolver os bindings choice_event em tempo de compilacao.
    const contract = buildEngineExportProjectContract(project({
      dialogues: [{ key: "intro", text: "O que deseja fazer?", choices: ["Explorar", "Abrir inventario"] }],
      events: [
        {
          id: "event-room-boot",
          name: "room_boot",
          category: "Cena",
          steps: [
            { command: "show_choice intro" },
            { command: "choice_event intro 0 on_explore" },
            { command: "choice_event intro 1 on_inventory" }
          ]
        },
        {
          id: "event-explore",
          name: "on_explore",
          category: "Controle",
          steps: [{ command: "set_variable route 1" }]
        },
        {
          id: "event-inventory",
          name: "on_inventory",
          category: "Controle",
          steps: [{ command: "set_variable route 2" }]
        }
      ]
    }));

    expect(contract.topdown_project?.choice_groups).toEqual([
      {
        line: 0,
        choices: [
          { text: "Explorar", value: 1, script: [{ op: "set_variable", variable: 0, value: 1 }] },
          { text: "Abrir inventario", value: 2, script: [{ op: "set_variable", variable: 0, value: 2 }] }
        ]
      }
    ]);

    // choice_event e um binding resolvido em compile-time, nao aparece como opcode inline no script.
    const roomBootScript = contract.topdown_project?.scripts.find((script) => script.name === "room_boot")?.script ?? [];
    expect(roomBootScript).toEqual([{ op: "show_choice", group: 0 }]);
  });

  it("compiles conditional guards (if_variable/if_flag/has_item/if_scene) into jump_if_* pairs", () => {
    // O preview trata "if_X" como "pula o proximo passo se falso" (guarda uma unica instrucao).
    // O motor real nao tem esse conceito - so jump_if_*/jump com offset relativo. O compilador
    // precisa emitir o par [jump_if_<cond> offset=2, jump offset=1+N, ...N instrucoes guardadas].
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { name: "start", width: 20, height: 18 },
        { name: "vault", width: 20, height: 18 }
      ],
      events: [
        {
          id: "event-guard",
          name: "guarded_flow",
          category: "Controle",
          steps: [
            { command: "if_variable score 10" },
            { command: "set_variable route 1" },
            { command: "if_flag story.progress true" },
            { command: "add_variable route 1" },
            { command: "has_item potion 1" },
            { command: "add_variable route 1" },
            { command: "if_scene vault" },
            { command: "add_variable route 1" }
          ]
        }
      ]
    }));

    // Registro de variaveis (ordem alfabetica): route=0, score=1, story.progress=2
    // Registro de itens: potion=0
    const script = contract.topdown_project?.scripts.find((entry) => entry.name === "guarded_flow")?.script;
    expect(script).toEqual([
      { op: "jump_if_variable_equals", variable: 1, value: 10, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "set_variable", variable: 0, value: 1 },
      { op: "jump_if_variable_equals", variable: 2, value: 1, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "add_variable", variable: 0, amount: 1 },
      { op: "jump_if_inventory_at_least", item: 0, quantity: 1, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "add_variable", variable: 0, amount: 1 },
      { op: "jump_if_room_equals", room: 1, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "add_variable", variable: 0, amount: 1 }
    ]);
  });

  it("compiles native actor, input, engine-field and variable conditions into ROM guards", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-start", name: "start", width: 20, height: 18, playerActorName: "Player" }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "start", x: 2, y: 2 },
        { id: "actor-guide", name: "Guide", roomName: "start", x: 4, y: 3 }
      ],
      variables: [{ name: "route" }, { name: "score" }, { name: "story.target" }],
      events: [{
        id: "event-native-conditions",
        name: "native_conditions",
        category: "Controle",
        steps: [
          { command: "if_variable_variable score story.target" },
          { command: "add_variable route 1" },
          { command: "if_engine_field player_x 40" },
          { command: "add_variable route 1" },
          { command: "if_engine_field_variable player_y story.target" },
          { command: "add_variable route 1" },
          { command: "read_rtc hour route" },
          { command: "if_rtc weekday 6" },
          { command: "add_variable route 1" },
          { command: "if_button a" },
          { command: "add_variable route 1" },
          { command: "if_actor_direction Guide down" },
          { command: "add_variable route 1" },
          { command: "if_actor_at_position Guide 4 3" },
          { command: "add_variable route 1" },
          { command: "if_actor_distance Guide player 2" },
          { command: "add_variable route 1" },
          { command: "if_actor_relative Guide player right" },
          { command: "add_variable route 1" }
        ]
      }]
    }));

    const script = contract.topdown_project?.scripts.find((entry) => entry.name === "native_conditions")?.script;
    expect(script).toEqual([
      { op: "jump_if_variable_equals_variable", variable: 1, other_variable: 2, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "add_variable", variable: 0, amount: 1 },
      { op: "jump_if_engine_field_equals", field: "player_x", value: 40, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "add_variable", variable: 0, amount: 1 },
      { op: "jump_if_engine_field_equals_variable", field: "player_y", variable: 2, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "add_variable", variable: 0, amount: 1 },
      { op: "read_rtc", field: "hour", variable: 0 },
      { op: "if_rtc", field: "weekday", value: 6, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "add_variable", variable: 0, amount: 1 },
      { op: "jump_if_button_pressed", button: "a", offset: 2 },
      { op: "jump", offset: 2 },
      { op: "add_variable", variable: 0, amount: 1 },
      { op: "jump_if_actor_direction", actor: 0, direction: "down", offset: 2 },
      { op: "jump", offset: 2 },
      { op: "add_variable", variable: 0, amount: 1 },
      { op: "jump_if_actor_at_position", actor: 0, x: 4, y: 3, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "add_variable", variable: 0, amount: 1 },
      { op: "jump_if_actor_distance", actor: 0, other_actor: -1, distance: 2, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "add_variable", variable: 0, amount: 1 },
      { op: "jump_if_actor_relative", actor: 0, other_actor: -1, relation: "right", offset: 2 },
      { op: "jump", offset: 2 },
      { op: "add_variable", variable: 0, amount: 1 }
    ]);
    expect(contract.export_warnings).toBeUndefined();
  });

  it("compiles button and timer callback lifecycle commands for the ROM", () => {
    const contract = buildEngineExportProjectContract(project({
      events: [
        { id: "event-action", name: "on_action", category: "Controle", steps: [{ command: "set_variable action 1" }] },
        { id: "event-tick", name: "on_tick", category: "Controle", steps: [{ command: "add_variable ticks 1" }] },
        {
          id: "event-bindings",
          name: "install_bindings",
          category: "Controle",
          steps: [
            { command: "attach_button a on_action true" },
            { command: "remove_button b" },
            { command: "timer_attach 60 on_tick" },
            { command: "timer_restart on_tick" },
            { command: "timer_remove on_tick" }
          ]
        }
      ]
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([{
      name: "install_bindings",
      script: [
        { op: "attach_button_event", button: "a", index: 0, override: true },
        { op: "remove_button_event", button: "b" },
        { op: "attach_timer_event", frames: 60, index: 1 },
        { op: "restart_timer_event", index: 1 },
        { op: "remove_timer_event", index: 1 }
      ]
    }]));
    expect(contract.export_warnings).toBeUndefined();
  });

  it("compiles if/else branches into jump_if_* with true and false paths", () => {
    const contract = buildEngineExportProjectContract(project({
      events: [
        {
          id: "event-if-else",
          name: "branch_else",
          category: "Controle",
          steps: [
            { command: "if_variable score 10" },
            { command: "set_variable route 1" },
            { command: "else" },
            { command: "set_variable route 2" },
            { command: "if_variable score 0" },
            { command: "set_variable route 9" }
          ]
        }
      ]
    }));

    const script = contract.topdown_project?.scripts.find((entry) => entry.name === "branch_else")?.script;
    expect(script).toEqual([
      { op: "jump_if_variable_equals", variable: 1, value: 10, offset: 2 },
      { op: "jump", offset: 3 },
      { op: "set_variable", variable: 0, value: 1 },
      { op: "jump", offset: 2 },
      { op: "set_variable", variable: 0, value: 2 },
      { op: "jump_if_variable_equals", variable: 1, value: 0, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "set_variable", variable: 0, value: 9 }
    ]);
  });

  it("compiles switch_variable into chained jump_if_* guards with call_script bodies", () => {
    const contract = buildEngineExportProjectContract(project({
      events: [
        {
          id: "event-route-0",
          name: "route_zero",
          category: "Controle",
          steps: [{ command: "set_variable route 0" }]
        },
        {
          id: "event-route-1",
          name: "route_one",
          category: "Controle",
          steps: [{ command: "set_variable route 1" }]
        },
        {
          id: "event-switch",
          name: "pick_route",
          category: "Controle",
          steps: [{ command: "switch_variable route 0 route_zero 1 route_one" }]
        }
      ]
    }));

    const script = contract.topdown_project?.scripts.find((entry) => entry.name === "pick_route")?.script;
    expect(script).toEqual([
      { op: "jump_if_variable_equals", variable: 0, value: 0, offset: 2 },
      { op: "jump", offset: 3 },
      { op: "call_script", index: 0 },
      { op: "jump", offset: 5 },
      { op: "jump_if_variable_equals", variable: 0, value: 1, offset: 2 },
      { op: "jump", offset: 3 },
      { op: "call_script", index: 1 },
      { op: "jump", offset: 1 }
    ]);
  });

  it("compiles GB Studio loops, switch else, timers and platformer state callbacks", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [{
        id: "tileset-1",
        name: "tileset_1.png",
        kind: "Tileset",
        metadata: { source: "Assets/tilesets/tileset_1.png" }
      }],
      events: [
        { id: "case-one", name: "case_one", category: "Controle", steps: [{ command: "wait 1" }] },
        { id: "case-else", name: "case_else", category: "Controle", steps: [{ command: "wait 2" }] },
        { id: "blank-callback", name: "blank_callback", category: "Controle", steps: [{ command: "wait 3" }] },
        { id: "timer", name: "timer_tick", category: "Controle", steps: [{ command: "wait 4" }] },
        {
          id: "main",
          name: "main",
          category: "Controle",
          steps: [
            { command: "seed_random" },
            { command: "set_platformer_state blank" },
            { command: "attach_platform_callback blankStart blank_callback" },
            { command: "timer_attach 18 timer_tick" },
            { command: "if_button up" },
            { command: "set_variable route 1" },
            { command: "condition_end" },
            { command: "loop_begin title" },
            { command: "wait 6" },
            { command: "loop_end title" },
            { command: "switch_variable route 1 case_one else case_else" },
            { command: "set_engine_field plat_blank_grav 1802" },
            { command: "replace_tile_animation 22 6 0 4 tile_frame tileset_1.png" },
            { command: "if_save_game 0" },
            { command: "wait 7" },
            { command: "else" },
            { command: "wait 8" },
            { command: "condition_end" },
            { command: "end_event" }
          ]
        }
      ]
    }));

    const script = contract.topdown_project?.scripts.find((entry) => entry.name === "main")?.script;
    expect(script).toEqual([
      { op: "seed_random" },
      { op: "set_platformer_state", state: "blank" },
      { op: "attach_platform_callback", callback: "blankStart", index: 2 },
      { op: "attach_timer_event", frames: 18, index: 3 },
      { op: "jump_if_button_pressed", button: "up", offset: 2 },
      { op: "jump", offset: 2 },
      { op: "set_variable", variable: 0, value: 1 },
      { op: "wait", frames: 6 },
      { op: "jump", offset: -1 },
      { op: "jump_if_variable_equals", variable: 0, value: 1, offset: 2 },
      { op: "jump", offset: 3 },
      { op: "call_script", index: 0 },
      { op: "jump", offset: 2 },
      { op: "call_script", index: 1 },
      { op: "set_engine_field", field: "plat_blank_grav", value: 1802 },
      { op: "replace_tile_sequence", x: 22, y: 6, tile: 0, frames: 4, variable: 1, tile_asset: 0 },
      { op: "jump_if_save_exists", slot: 0, offset: 2 },
      { op: "jump", offset: 3 },
      { op: "wait", frames: 7 },
      { op: "jump", offset: 2 },
      { op: "wait", frames: 8 },
      { op: "end" }
    ]);
    expect(contract.export_warnings).toBeUndefined();
  });

  it("compiles repeat_expression ne into jump_if equals guards that skip body when equal", () => {
    const contract = buildEngineExportProjectContract(project({
      events: [
        {
          id: "event-tick",
          name: "tick",
          category: "Controle",
          steps: [{ command: "add_variable counter 1" }]
        },
        {
          id: "event-loop-ne",
          name: "loop_ne",
          category: "Controle",
          steps: [{ command: "repeat_expression counter ne 3 tick 1" }]
        }
      ]
    }));

    const script = contract.topdown_project?.scripts.find((entry) => entry.name === "loop_ne")?.script;
    expect(script).toEqual([
      { op: "jump_if_variable_equals", variable: 0, value: 3, offset: 2 },
      { op: "call_script", index: 0 }
    ]);
  });

  it("compiles stop_event into jump that skips remaining steps", () => {
    const contract = buildEngineExportProjectContract(project({
      events: [{
        id: "event-stop",
        name: "early_exit",
        category: "Controle",
        steps: [
          { command: "set_variable route 1" },
          { command: "stop_event" },
          { command: "set_variable route 99" }
        ]
      }]
    }));

    const script = contract.topdown_project?.scripts.find((entry) => entry.name === "early_exit")?.script;
    expect(script).toEqual([
      { op: "set_variable", variable: 0, value: 1 },
      { op: "jump", offset: 1 }
    ]);
  });

  it("exports platformer room triggers and npc on_interact bindings", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-platformer",
        name: "stage_1",
        width: 20,
        height: 16,
        sceneType: "platformer",
        eventBindings: { onInit: "room_boot" }
      }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "stage_1", x: 2, y: 10 },
        {
          id: "actor-guide",
          name: "Guide",
          roomName: "stage_1",
          x: 8,
          y: 10,
          eventBindings: { onInteract: "npc_talk" }
        }
      ],
      triggers: [{
        id: "trigger-goal",
        name: "Goal",
        roomName: "stage_1",
        x: 16,
        y: 8,
        width: 2,
        height: 2,
        eventBindings: { onEnter: "goal_enter", onLeave: "goal_leave" }
      }],
      events: [
        { id: "event-room", name: "room_boot", category: "Cena", steps: [{ command: "noop" }] },
        { id: "event-npc", name: "npc_talk", category: "Cena", steps: [{ command: "show_dialogue intro" }] },
        { id: "event-enter", name: "goal_enter", category: "Cena", steps: [{ command: "set_variable goal 1" }] },
        { id: "event-leave", name: "goal_leave", category: "Cena", steps: [{ command: "set_variable goal 0" }] }
      ],
      dialogues: [{ key: "intro", text: "Bem-vindo." }],
      settings: {
        general: { gameTitle: "Platformer Entities", startScene: "stage_1", startSceneType: "platformer", exportFolder: "build" },
        build: { romFileName: "platformer_entities.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        platformer: {
          walkSpeed: 1.5,
          gravity: 0.5,
          maxFallSpeed: 4,
          coyoteTime: 4,
          jumpBuffer: 5,
          ladders: false
        }
      }
    }));

    const room = contract.platformer_project?.rooms[0];
    expect(room?.triggers).toEqual([{
      area: { x: 128, y: 64, width: 16, height: 16 },
      on_enter: [{ op: "set_variable", variable: 0, value: 1 }],
      on_leave: [{ op: "set_variable", variable: 0, value: 0 }]
    }]);
    expect(room?.npcs?.[0]).toMatchObject({
      name: "Guide",
      position: { x: 64, y: 80 },
      on_interact: [{ op: "show_dialogue", dialogue: 0 }]
    });
  });

  it("compiles repeat_expression into guarded call_script iterations", () => {
    const contract = buildEngineExportProjectContract(project({
      events: [
        {
          id: "event-tick",
          name: "tick",
          category: "Controle",
          steps: [{ command: "add_variable counter 1" }]
        },
        {
          id: "event-loop",
          name: "loop",
          category: "Controle",
          steps: [{ command: "repeat_expression counter lt 3 tick 2" }]
        }
      ]
    }));

    const script = contract.topdown_project?.scripts.find((entry) => entry.name === "loop")?.script;
    expect(script).toEqual([
      { op: "jump_if_variable_less_than", variable: 0, value: 3, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "call_script", index: 0 },
      { op: "jump_if_variable_less_than", variable: 0, value: 3, offset: 2 },
      { op: "jump", offset: 2 },
      { op: "call_script", index: 0 }
    ]);
  });

  it("keeps platformer triggers inside the logical room bounds", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "wide-stage",
        name: "wide_stage",
        width: 80,
        height: 18,
        sceneType: "platformer",
        runtime: { type: "platformer" }
      }],
      actors: [{ id: "player", name: "Player", roomName: "wide_stage", x: 2, y: 12 }],
      triggers: [{
        id: "far-trigger",
        name: "Far Trigger",
        roomName: "wide_stage",
        x: 79,
        y: 12,
        width: 1,
        height: 2,
        eventBindings: { onEnter: "far_enter" }
      }],
      events: [{ id: "far-enter", name: "far_enter", category: "Cena", steps: [{ command: "set_variable far 1" }] }],
      settings: {
        general: { gameTitle: "Wide Trigger", startScene: "wide_stage", startSceneType: "platformer", exportFolder: "build" },
        build: { romFileName: "wide_trigger.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: false },
        debug: { developerMode: true, preserveTempFiles: false, exportReadableButanoProject: false },
        platformer: { walkSpeed: 1.5, gravity: 0.5, maxFallSpeed: 4, coyoteTime: 4, jumpBuffer: 5, ladders: false }
      }
    }));

    expect(contract.platformer_project?.rooms[0]?.triggers).toEqual([{
      area: { x: 624, y: 96, width: 16, height: 16 },
      on_enter: [{ op: "set_variable", variable: 0, value: 1 }]
    }]);
  });

  it("exports platformer connections as runtime-backed entry triggers", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-a", name: "stage_a", width: 20, height: 16, sceneType: "platformer" },
        { id: "room-b", name: "stage_b", width: 20, height: 16, sceneType: "platformer" }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "stage_a", x: 2, y: 10 }],
      events: [
        { id: "event-portal", name: "portal_fx", category: "Cena", steps: [{ command: "play_sfx confirm.wav" }] }
      ],
      audioItems: [{ name: "confirm.wav", kind: "SFX" }],
      editorState: {
        scenaConnections: [{
          from: "stage_a",
          to: "stage_b",
          eventName: "portal_fx",
          exit: { x: 18, y: 7, width: 2, height: 2 },
          entry: { x: 1, y: 7, width: 2, height: 2 }
        }]
      },
      settings: {
        general: { gameTitle: "Platformer Portals", startScene: "stage_a", startSceneType: "platformer", exportFolder: "build" },
        build: { romFileName: "platformer_portals.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        platformer: { walkSpeed: 1.5, gravity: 0.5, maxFallSpeed: 4, coyoteTime: 4, jumpBuffer: 5, ladders: false }
      }
    }));

    const room = contract.platformer_project?.rooms.find((entry) => entry.name === "stage_a");
    expect(room?.camera_zones).toBeUndefined();
    expect(room?.triggers).toEqual([{
      area: { x: 144, y: 56, width: 16, height: 16 },
      on_enter: [{ op: "play_sfx", index: 0 }, { op: "warp", room: 1, x: 24, y: 64 }]
    }]);
  });

  it("exports per-room platformer physics and native collision effect bits", () => {
    const collisionTypes = Array.from({ length: 12 }, () => "free");
    collisionTypes.splice(0, 9, "solid", "down", "up", "left", "right", "water", "damage", "ladder", "event");
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-platform-profile",
        name: "physics_lab",
        width: 4,
        height: 3,
        sceneType: "platformer",
        collisionTypes,
        runtime: {
          type: "platformer",
          config: {
            walkSpeed: 2,
            acceleration: 0.5,
            friction: 0.25,
            gravity: 0.75,
            maxFallSpeed: 5,
            jumpSpeed: 6,
            coyoteTime: 7,
            jumpBuffer: 8,
            ladders: false
          }
        }
      }],
      actors: [{
        id: "actor-guide",
        name: "Guia",
        roomName: "physics_lab",
        spriteSheet: "guide.png"
      }],
      settings: {
        general: { gameTitle: "Platform Profile", startScene: "physics_lab", startSceneType: "platformer", exportFolder: "build" },
        build: { romFileName: "platform_profile.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        platformer: { gravity: 0.25 }
      }
    }));

    expect(contract.platformer_project?.rooms[0]).toMatchObject({
      collision_flags: [1, 2, 4, 16, 8, 32, 64, 128, 0, 0, 0, 0],
      config: {
        max_run_speed_x256: 512,
        acceleration_x256: 128,
        friction_x256: 64,
        gravity_x256: 192,
        max_fall_speed_x256: 1280,
        jump_speed_x256: 1536,
        coyote_frames: 7,
        jump_buffer_frames: 8,
        ladders_enabled: false
      }
    });
  });

  it("exports show_choice using the choice_groups index, not the raw dialogue index", () => {
    // O assetc real (emit_topdown_choice_groups) enumera choice_groups (so dialogos com choices) e
    // ShowChoice.group referencia essa posicao compactada - nao o indice bruto em dialogue_lines.
    const contract = buildEngineExportProjectContract(project({
      dialogues: [
        { key: "info", text: "So um aviso." },
        { key: "intro", text: "O que deseja fazer?", choices: ["Explorar", "Sair"] }
      ],
      events: [
        {
          id: "event-shop",
          name: "npc_shop",
          category: "Cena",
          steps: [{ command: "show_choice intro" }]
        }
      ]
    }));

    const script = contract.topdown_project?.scripts.find((entry) => entry.name === "npc_shop")?.script;
    expect(script).toEqual([{ op: "show_choice", group: 0 }]);
  });

  it("builds a mixed Engine contract when platformer starts a project that also has topdown rooms", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        {
          id: "room-platformer",
          name: "climb",
          width: 20,
          height: 18,
          sceneType: "platformer",
          eventBindings: { onInit: "room_boot" },
          collisionTypes: Array.from({ length: 20 * 18 }, (_item, index) => index >= 20 * 16 ? "solid" : "free")
        },
        { id: "room-topdown", name: "market", width: 16, height: 16, sceneType: "topdown" }
      ],
      actors: [{
        id: "actor-player",
        name: "Player",
        roomName: "climb",
        x: 2,
        y: 12,
        spriteSheet: "platformer-player.png",
        animationName: "idle_right"
      }],
      animations: [{
        id: "platformer-idle",
        name: "idle_right",
        spriteSheet: "platformer-player.png",
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 1,
        fps: 8,
        hitboxX: 0,
        hitboxY: -16,
        hitboxWidth: 16,
        hitboxHeight: 24
      }],
      events: [{ id: "event-room", name: "room_boot", category: "Cena", steps: [{ command: "show_dialogue intro" }] }],
      dialogues: [{ key: "intro", text: "Pule para testar." }],
      settings: {
        general: { gameTitle: "Scene Profiles", startScene: "climb", startSceneType: "platformer", exportFolder: "build" },
        build: { romFileName: "scene_profiles.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        platformer: {
          walkSpeed: 1.5,
          acceleration: 0.25,
          gravity: 0.5,
          maxFallSpeed: 4,
          coyoteTime: 6,
          jumpBuffer: 8,
          ladders: false
        }
      }
    }));

    expect(contract).toMatchObject({
      kind: "mixed",
      runtime_profile: "mixed",
      template_dir: path.join("/opt/GBAStudioEnginePack", "templates", "exported_mixed"),
      project_data: "mixed_project_data.hpp",
      requires: {
        features: expect.arrayContaining([
          "runtime_dispatch.mixed",
          "events.warp_runtime",
          "platformer_runtime",
          "topdown_runtime"
        ])
      }
    });
    expect(contract.runtime_contract).toEqual({
      scene_type: "platformer",
      adapter: "mixed_runtime_project",
      adapter_status: "native",
      rooms: [
        { name: "climb", scene_type: "platformer", runtime_profile: "platformer" },
        { name: "market", scene_type: "topdown", runtime_profile: "topdown" }
      ]
    });
    expect(contract.platformer_project).toBeDefined();
    const platformerProject = contract.platformer_project!;
    expect(platformerProject.config).toEqual({
      max_run_speed_x256: 384,
      acceleration_x256: 64,
      friction_x256: 0x0030,
      gravity_x256: 128,
      max_fall_speed_x256: 1024,
      jump_speed_x256: 0x0580,
      coyote_frames: 6,
      jump_buffer_frames: 8,
      ladders_enabled: false,
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
    expect(platformerProject.rooms.map((room) => ({
      name: room.name,
      width_tiles: room.width_tiles,
      height_tiles: room.height_tiles,
      player_start: room.player_start,
      player_collision_offset: room.player_collision_offset,
      on_enter: room.on_enter
    }))).toEqual([
      {
        name: "climb",
        width_tiles: 20,
        height_tiles: 18,
        player_start: { x: 16, y: 96, width: 16, height: 24 },
        player_collision_offset: { x: 0, y: -16 },
        on_enter: [{ op: "show_dialogue", dialogue: 0 }]
      }
    ]);
    expect(platformerProject.dialogue_lines).toEqual([
      { text: "Pule para testar.", speaker: "", portrait: "", key: "intro" }
    ]);
  });

  it("exports authored topdown hitboxes for the player and every NPC", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-town", name: "start", width: 20, height: 18, sceneType: "topdown", playerActorName: "Player" }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "start", x: 4, y: 6, spriteSheet: "hero.png", animationName: "idle_down" },
        { id: "actor-elephant", name: "Elephant", roomName: "start", x: 10, y: 8, spriteSheet: "elephant.png", animationName: "idle" }
      ],
      animations: [
        { id: "hero-idle", name: "idle_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32, hitboxX: -8, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 },
        { id: "elephant-idle", name: "idle", spriteSheet: "elephant.png", frameWidth: 64, frameHeight: 48, hitboxX: -21, hitboxY: -31, hitboxWidth: 47, hitboxHeight: 39 }
      ]
    }));

    expect(contract.topdown_project?.player).toMatchObject({
      size: { x: 16, y: 16 },
      collision_offset: { x: -8, y: -16 }
    });
    expect(contract.topdown_project?.rooms[0]?.npcs).toEqual([
      expect.objectContaining({
        name: "Elephant",
        size: { x: 47, y: 39 },
        collision_offset: { x: -21, y: -31 }
      })
    ]);
  });

  it("exports canonical idle, walk, jump and fall animations for the platformer player", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [{
        id: "asset-hero",
        name: "hero.png",
        kind: "Sprite",
        metadata: { source: "Assets/sprites/hero.png", width: 80, height: 32 }
      }, {
        id: "asset-gardener",
        name: "gardener.png",
        kind: "Sprite",
        metadata: { source: "Assets/sprites/gardener.png", width: 16, height: 32 }
      }],
      scenas: [{ id: "room-stage", name: "stage", width: 64, height: 16, sceneType: "platformer" }],
      actors: [{
        id: "actor-player",
        name: "Player",
        roomName: "stage",
        x: 2,
        y: 10,
        spriteSheet: "hero.png",
        animationName: "idle_right"
      }, {
        id: "actor-gardener",
        name: "Gardener",
        roomName: "stage",
        x: 45,
        y: 13,
        spriteSheet: "gardener.png",
        animationName: "idle_right"
      }],
      animations: [
        { id: "idle", name: "idle_right", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32, frameCount: 1, fps: 10, hitboxX: 0, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 24 },
        { id: "walk", name: "walk_right", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32, frameCount: 2, fps: 12 },
        { id: "jump", name: "jump_right", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32, frameCount: 1, fps: 10 },
        { id: "fall", name: "fall_right", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32, frameCount: 1, fps: 10 },
        { id: "gardener-idle", name: "idle_right", spriteSheet: "gardener.png", frameWidth: 16, frameHeight: 32, frameCount: 1, fps: 8, hitboxX: -8, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }
      ],
      settings: {
        general: { gameTitle: "Platformer Animado", startScene: "stage", startSceneType: "platformer", startPlayer: "Player", exportFolder: "build" },
        build: { romFileName: "platformer.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: false },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.platformer_project?.player).toMatchObject({
      metasprite: { asset: "hero", index: 0 },
      animation: { asset: "hero" },
      animations: {
        idle: { asset: "hero", frame_indices: [0], durations: [6] },
        walk: { asset: "hero", frame_indices: [0, 1], durations: [5, 5] },
        jump: { asset: "hero", frame_indices: [0], durations: [6] },
        fall: { asset: "hero", frame_indices: [0], durations: [6] }
      }
    });
    expect(contract.platformer_project).toMatchObject({
      resource_banks: "asset_pack",
      assets: {
        bg_palettes: [],
        obj_palettes: ["hero", "gardener"],
        tile_assets: ["hero", "gardener"]
      }
    });
    expect(contract.platformer_project?.rooms[0]?.player_start).toEqual({
      x: 16,
      y: 80,
      width: 16,
      height: 24
    });
    expect(contract.platformer_project?.rooms[0]?.player_collision_offset).toEqual({ x: 0, y: -16 });
    expect(contract.platformer_project?.rooms[0]?.npcs?.[0]).toMatchObject({
      name: "Gardener",
      position: { x: 360, y: 104 },
      size: { x: 16, y: 16 },
      collision_offset: { x: -8, y: -16 }
    });
  });

  it("exports platformer player lifecycle events in the player contract", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [{
        id: "asset-player",
        name: "platformer-player.png",
        kind: "Sprite",
        metadata: { source: "Assets/sprites/platformer-player.png", width: 16, height: 32 }
      }],
      scenas: [{ id: "room-stage", name: "stage", width: 20, height: 18, sceneType: "platformer", playerActorName: "Player" }],
      actors: [{
        id: "actor-player",
        name: "Player",
        roomName: "stage",
        x: 2,
        y: 10,
        spriteSheet: "platformer-player.png",
        animationName: "idle_right",
        eventBindings: { onInit: "player_start", onUpdate: "player_tick" }
      }],
      animations: [{
        id: "player-idle",
        name: "idle_right",
        spriteSheet: "platformer-player.png",
        frameWidth: 16,
        frameHeight: 32,
        frameCount: 1,
        fps: 10
      }],
      variables: [{ name: "score" }],
      events: [{
        id: "event-player-start",
        name: "player_start",
        category: "Ator",
        steps: [{ command: "set_variable score 1" }]
      }, {
        id: "event-player-update",
        name: "player_tick",
        category: "Ator",
        steps: [{ command: "add_variable score 1" }]
      }],
      settings: {
        general: { gameTitle: "Platformer Player Events", startScene: "stage", startSceneType: "platformer", startPlayer: "Player", exportFolder: "build" },
        build: { romFileName: "platformer-player-events.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: false },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.platformer_project?.player).toEqual(expect.objectContaining({
      on_start: [{ op: "set_variable", variable: 0, value: 1 }],
      on_update: [{ op: "add_variable", variable: 0, amount: 1 }]
    }));
  });

  it("prefers the GB Studio platformer player when a directed platformer room has no local player actor", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        {
          id: "asset-topdown",
          name: "topdown.png",
          kind: "Sprite",
          metadata: { source: "Assets/sprites/topdown.png", width: 16, height: 32 }
        },
        {
          id: "asset-platformer",
          name: "platformer.png",
          kind: "Sprite",
          metadata: { source: "Assets/sprites/platformer.png", width: 320, height: 32 }
        }
      ],
      scenas: [
        { id: "room-town", name: "town", width: 20, height: 18, sceneType: "topdown" },
        { id: "room-platformer-home", name: "platformer_home", width: 24, height: 18, sceneType: "platformer" },
        { id: "room-stage", name: "directed_stage", width: 80, height: 18, sceneType: "platformer" }
      ],
      actors: [
        {
          id: "player-topdown",
          name: "Player",
          roomName: "town",
          x: 2,
          y: 10,
          spriteSheet: "topdown.png",
          animationName: "idle_down",
          gbStudioPlayerRuntime: "TOPDOWN"
        },
        {
          id: "player-platformer",
          name: "Player",
          roomName: "platformer_home",
          x: 2,
          y: 10,
          spriteSheet: "platformer.png",
          animationName: "idle_right",
          gbStudioPlayerRuntime: "PLATFORM"
        }
      ],
      events: [{
        id: "event-enter-directed-stage",
        name: "enter_directed_stage",
        category: "Cena",
        steps: [{ command: "change_scene directed_stage 6 14 right" }]
      }],
      animations: [
        { id: "topdown-idle", name: "idle_down", spriteSheet: "topdown.png", frameWidth: 16, frameHeight: 32, frameCount: 1, fps: 8 },
        { id: "platform-idle", name: "idle_right", spriteSheet: "platformer.png", frameWidth: 32, frameHeight: 32, frameCount: 1, fps: 8 },
        { id: "platform-walk", name: "walk_right", spriteSheet: "platformer.png", frameWidth: 32, frameHeight: 32, frameCount: 4, fps: 10 },
        { id: "platform-jump", name: "jump_right", spriteSheet: "platformer.png", frameWidth: 32, frameHeight: 32, frameCount: 2, fps: 8 },
        { id: "platform-fall", name: "fall_right", spriteSheet: "platformer.png", frameWidth: 32, frameHeight: 32, frameCount: 1, fps: 8 },
        { id: "platform-climb", name: "climb_right", spriteSheet: "platformer.png", frameWidth: 32, frameHeight: 32, frameCount: 2, fps: 7 },
        { id: "platform-wall-slide", name: "wall_slide_right", spriteSheet: "platformer.png", frameWidth: 32, frameHeight: 32, frameCount: 1, fps: 8 },
        { id: "platform-dash", name: "dash_right", spriteSheet: "platformer.png", frameWidth: 32, frameHeight: 32, frameCount: 1, fps: 12 },
        { id: "platform-glide", name: "glide_right", spriteSheet: "platformer.png", frameWidth: 32, frameHeight: 32, frameCount: 1, fps: 8 }
      ],
      settings: {
        general: { gameTitle: "Platformer dirigido", startScene: "directed_stage", startSceneType: "platformer", startPlayer: "Player", exportFolder: "build" },
        build: { romFileName: "platformer.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: false },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.platformer_project?.player).toMatchObject({
      metasprite: { asset: "platformer", index: 0 },
      animations: {
        idle: { asset: "platformer" },
        walk: { asset: "platformer" },
        jump: { asset: "platformer" },
        fall: { asset: "platformer" },
        climb: { asset: "platformer" },
        wall_slide: { asset: "platformer" },
        dash: { asset: "platformer" },
        glide: { asset: "platformer" }
      }
    });
    expect(contract.platformer_project?.rooms.find((room) => room.name === "directed_stage")?.player_start).toMatchObject({
      x: 48,
      y: 112
    });
  });

  it("keeps an oversized platformer player fully inside the room at a border spawn", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [{
        id: "asset-platformer-player",
        name: "platformer-player.png",
        kind: "Sprite",
        metadata: { source: "Assets/sprites/platformer-player.png", width: 320, height: 32 }
      }],
      scenas: [{ id: "room-stage", name: "stage", width: 20, height: 18, sceneType: "platformer" }],
      actors: [{
        id: "actor-player",
        name: "Player",
        roomName: "stage",
        x: 0,
        y: 1,
        spriteSheet: "platformer-player.png",
        animationName: "idle_right",
        gbStudioPlayerRuntime: "PLATFORM"
      }],
      animations: [{
        id: "platform-idle",
        name: "idle_right",
        spriteSheet: "platformer-player.png",
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 1,
        fps: 8,
        hitboxX: 0,
        hitboxY: -16,
        hitboxWidth: 16,
        hitboxHeight: 24
      }],
      settings: {
        general: { gameTitle: "Spawn seguro", startScene: "stage", startSceneType: "platformer", startPlayer: "Player", exportFolder: "build" },
        build: { romFileName: "safe_spawn.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: false },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.platformer_project?.rooms[0]?.player_start).toEqual({
      x: 8,
      y: 24,
      width: 16,
      height: 24
    });
    expect(contract.platformer_project?.rooms[0]?.player_collision_offset).toEqual({ x: 0, y: -16 });
  });

  it("exports platformer ramps separately from flags and damage cells as hazards", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-stage",
        name: "stage",
        width: 3,
        height: 3,
        sceneType: "platformer",
        collisionTypes: [
          "free", "slope_up_right", "slope_up_left",
          "down", "up", "left",
          "right", "ladder", "damage"
        ]
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "stage", x: 0, y: 0 }],
      settings: {
        general: { gameTitle: "Colisoes", startScene: "stage", startSceneType: "platformer", exportFolder: "build" },
        build: { romFileName: "collisions.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: false },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    const room = contract.platformer_project?.rooms[0];
    expect(room?.collision_flags).toEqual([0, 0, 0, 2, 4, 16, 8, 128, 64]);
    expect(room?.collision_slopes).toEqual([0, 2, 4, 0, 0, 0, 0, 0, 0]);
    expect(room?.hazards).toEqual([{
      area: { x: 16, y: 16, width: 8, height: 8 },
      damage: 1,
      respawn: true
    }]);
  });

  it("exports authored platformer BG3, BG2 and BG1 layers with independent assets", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-sky", name: "stage-sky.png", kind: "Background", metadata: { source: "Assets/backgrounds/stage-sky.png" } },
        { id: "asset-terrain", name: "stage-terrain.png", kind: "Background", metadata: { source: "Assets/backgrounds/stage-terrain.png" } },
        { id: "asset-details", name: "stage-details.png", kind: "Background", metadata: { source: "Assets/backgrounds/stage-details.png" } }
      ],
      scenas: [{
        id: "room-stage",
        name: "stage",
        width: 2,
        height: 2,
        sceneType: "platformer",
        backgroundAssetName: "stage-terrain.png",
        gbStudioUseBackgroundLayout: true,
        parallax: { mode: "bg3", offsetX: 0, offsetY: 0, speedX: 128, speedY: 192 },
        tileLayers: [
          { mapping: "BG3", tilemap: [0, 0, 0, 0], tileSourceAssetNames: ["stage-sky.png", "stage-sky.png", "stage-sky.png", "stage-sky.png"] },
          { mapping: "BG2", tilemap: [0, 0, 0, 0], tileSourceAssetNames: ["stage-terrain.png", "stage-terrain.png", "stage-terrain.png", "stage-terrain.png"] },
          { mapping: "BG1", tilemap: [0, 0, 0, 0], tileSourceAssetNames: ["stage-details.png", "stage-details.png", "stage-details.png", "stage-details.png"] },
          { mapping: "BG0", tilemap: [-1, -1, -1, -1], tileSourceAssetNames: ["", "", "", ""] }
        ]
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "stage", x: 0, y: 0 }],
      settings: {
        general: { gameTitle: "Layered Platformer", startScene: "stage", startSceneType: "platformer", exportFolder: "build" },
        build: { romFileName: "layered.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: false },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "stage_sky", kind: "bg" }),
      expect.objectContaining({ name: "stage_terrain", kind: "bg" }),
      expect.objectContaining({ name: "stage_details", kind: "bg" })
    ]));
    expect(contract.platformer_project?.rooms[0]?.background_layers).toEqual([
      {
        layer: "bg3",
        tiles: [0, 0, 0, 0],
        tilemap: "stage_sky",
        tilemap_layout: "source_asset",
        parallax: { x: 128, y: 192 }
      },
      {
        layer: "bg2",
        tiles: [0, 0, 0, 0],
        tilemap: "stage_terrain",
        tilemap_layout: "source_asset",
        parallax: { x: 256, y: 256 }
      },
      {
        layer: "bg1",
        tiles: [0, 0, 0, 0],
        tilemap: "stage_details",
        tilemap_layout: "source_asset",
        parallax: { x: 256, y: 256 }
      }
    ]);
  });

  it("inherits the source background layout for the platformer base layer without explicit tile sources", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [{ id: "orange", name: "orange.png", kind: "Background",
        metadata: { source: "Assets/backgrounds/orange.png", width: 240, height: 160 } }],
      scenas: [{ id: "stage", name: "start", width: 30, height: 20, sceneType: "platformer",
        backgroundAssetName: "orange.png", gbStudioUseBackgroundLayout: true,
        tilemap: Array.from({ length: 600 }, (_, index) => index + 1),
        tileLayers: [{ mapping: "BG2", tilemap: Array.from({ length: 600 }, (_, index) => index + 1),
          tileSourceAssetNames: [] }] }],
      actors: [{ id: "player", name: "Player", roomName: "start", x: 15, y: 10 }]
    }));
    expect(contract.platformer_project?.rooms[0]?.background_layers).toEqual([
      expect.objectContaining({ layer: "bg2", tilemap: "orange", tilemap_layout: "source_asset" })
    ]);
  });

  it("uses a runtime base as the opaque platformer visual while preserving authored layers", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-runtime", name: "stage-runtime-base.png", kind: "Background", metadata: { source: "Assets/backgrounds/stage-runtime-base.png" } },
        { id: "asset-sky", name: "stage-sky.png", kind: "Background", metadata: { source: "Assets/backgrounds/stage-sky.png" } },
        { id: "asset-terrain", name: "stage-terrain.png", kind: "Background", metadata: { source: "Assets/backgrounds/stage-terrain.png" } }
      ],
      scenas: [{
        id: "room-stage",
        name: "stage",
        width: 2,
        height: 2,
        sceneType: "platformer",
        backgroundAssetName: "stage-terrain.png",
        runtimeBaseBackgroundAssetName: "stage-runtime-base.png",
        gbStudioUseBackgroundLayout: true,
        tileLayers: [
          { mapping: "BG3", tilemap: [0, 0, 0, 0], tileSourceAssetNames: ["stage-sky.png", "stage-sky.png", "stage-sky.png", "stage-sky.png"] },
          { mapping: "BG2", tilemap: [0, 0, 0, 0], tileSourceAssetNames: ["stage-terrain.png", "stage-terrain.png", "stage-terrain.png", "stage-terrain.png"] }
        ]
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "stage", x: 0, y: 0 }],
      settings: {
        general: { gameTitle: "Runtime composite", startScene: "stage", startSceneType: "platformer", exportFolder: "build" },
        build: { romFileName: "runtime-composite.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: false },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.platformer_project?.rooms[0]).toMatchObject({
      visual_tilemap: "stage_runtime_base",
      visual_tilemap_layout: "source_asset",
      background_layers: [
        expect.objectContaining({ layer: "bg3", tilemap: "stage_sky" }),
        expect.objectContaining({ layer: "bg2", tilemap: "stage_terrain" })
      ]
    });
  });

  it("exports isometric and platformer rooms through the mixed project contract", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        {
          id: "room-iso",
          name: "market",
          width: 16,
          height: 16,
          sceneType: "isometric",
          cameraMode: "follow_player",
          cameraZoom: 250,
          backgroundAssetName: "isometric-sandbox-sheet.png",
          backgroundRenderMode: "tilemap",
          gbStudioUseBackgroundLayout: false,
          runtime: { type: "isometric", config: { tileWidth: 32, originY: 24, presentationZoom: 175 } },
          heightLevels: Array.from({ length: 16 * 16 }, (_, cellIndex) => cellIndex === (7 * 16 + 6) ? 1 : 0),
          tileLayers: [
            { mapping: "BG3", tilemap: [3] },
            { mapping: "BG2", tilemap: [2] },
            { mapping: "BG1", tilemap: [1] },
            { mapping: "BG0", tilemap: [4] }
          ]
        },
        { id: "room-platformer", name: "climb", width: 20, height: 18, sceneType: "platformer" }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "market", x: 3, y: 4, z: 1 }],
      triggers: [{
        id: "trigger-market-gate",
        name: "Market Gate",
        roomName: "market",
        x: 6,
        y: 7,
        width: 2,
        height: 3,
        eventBindings: { onEnter: "market_enter", onLeave: "market_leave", onInteract: "market_interact" }
      }],
      events: [
        { id: "event-market-enter", name: "market_enter", category: "Trigger", steps: [{ command: "set_variable gate 1" }] },
        { id: "event-market-leave", name: "market_leave", category: "Trigger", steps: [{ command: "set_variable gate 0" }] },
        { id: "event-market-interact", name: "market_interact", category: "Trigger", steps: [{ command: "set_variable gate 2" }] }
      ],
      assets: [{
        id: "asset-iso-tiles",
        name: "isometric-sandbox-sheet.png",
        kind: "Tileset",
        metadata: { source: "Assets/tiles/isometric-sandbox-sheet.png", atlasRenderOffsetY: -35 }
      }],
      settings: {
        general: { gameTitle: "Scene Profiles", startScene: "market", startSceneType: "isometric", exportFolder: "build" },
        build: { romFileName: "scene_profiles.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        isometric: { tileWidth: "16 px", tileHeight: "8 px" }
      }
    }));

    expect(contract.kind).toBe("mixed");
    expect(contract.runtime_profile).toBe("mixed");
    expect(contract.project_data).toBe("mixed_project_data.hpp");
    expect(contract.template_dir).toContain("exported_mixed");
    expect(contract.topdown_project).toBeUndefined();
    expect(contract.runtime_contract).toEqual({
      scene_type: "isometric",
      adapter: "mixed_runtime_project",
      adapter_status: "native",
      rooms: [
        { name: "market", scene_type: "isometric", runtime_profile: "isometric" },
        { name: "climb", scene_type: "platformer", runtime_profile: "platformer" }
      ]
    });
    expect(contract.isometric_project).toBeDefined();
    const isometricProject = contract.isometric_project!;
    expect(isometricProject.rooms[0].tileset_render_offset_y_pixels).toBe(-35);
    expect(isometricProject.initial_room).toBe(0);
    expect(isometricProject.rooms.map((room) => ({
      name: room.name,
      width_tiles: room.width_tiles,
      height_tiles: room.height_tiles,
      actors: room.actors
    }))).toEqual([
      {
        name: "market",
        width_tiles: 16,
        height_tiles: 16,
        actors: [{
          tile: { x: 3, y: 4, z: 1 },
          screen_offset: { x: 0, y: 0 },
          tile_index: 0,
          palette: 0,
          follow_player: true
        }]
      }
    ]);
    expect(isometricProject.rooms[0]?.triggers).toEqual([{
      area: { x: 6, y: 7, width: 2, height: 3 },
      on_enter: [{ op: "set_variable", variable: 0, value: 1 }],
      on_leave: [{ op: "set_variable", variable: 0, value: 0 }]
    }]);
    expect(isometricProject.rooms[0]?.tile_events).toEqual([{
      area: { x: 6, y: 7, width: 2, height: 3, z: 1 },
      on_interact: [{ op: "set_variable", variable: 0, value: 2 }]
    }]);
    expect(isometricProject.rooms[0]?.background_layers).toEqual({
      bg3: expect.arrayContaining([3]),
      bg2: expect.arrayContaining([2]),
      bg1: expect.arrayContaining([1]),
      bg0: expect.arrayContaining([4])
    });
    expect(isometricProject.rooms[0]?.grid).toEqual({
      tile_width_pixels: 32,
      tile_height_pixels: 16,
      height_step_pixels: 8,
      origin: { x: 120, y: 24 },
      gameplay_mode: "adventure",
      profile: "diamond-2to1",
      projection: "diamond",
      movement_model: "free",
      height_mode: "levels"
    });
    expect(isometricProject.rooms[0]?.world_mode).toBe("scrollable_tiled_world");
    expect(isometricProject.rooms[0]?.camera).toEqual({
      position: { x: 0, y: 80 },
      bounds: { x: -136, y: 24, width: 512, height: 272 },
      bounds_enabled: true,
      zoom_x256: 448,
      target_zoom_x256: 448,
      follow_enabled: true,
      smoothing_x256: 64,
      dead_zone: { x: 96, y: 64, width: 48, height: 32 }
    });
    expect(isometricProject.assets).toMatchObject({
      bg_palettes: ["isometric_sandbox_sheet"],
      tile_assets: ["isometric_sandbox_sheet"]
    });
    expect(isometricProject.rooms[0]).toMatchObject({
      tileset: "isometric_sandbox_sheet",
      tileset_tile_width_pixels: 32,
      tileset_tile_height_pixels: 16,
      tileset_tile_offset_x_pixels: 0,
      tileset_tile_offset_y_pixels: 0
    });
    expect(isometricProject.rooms[0]).not.toHaveProperty("authored_background");
  });

  it("derives the initial isometric actor elevation from the authored height map", () => {
    const heightLevels = Array.from({ length: 64 }, () => 0);
    heightLevels[(4 * 8) + 3] = 2;
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-iso-height",
        name: "raised-market",
        width: 8,
        height: 8,
        heightLevels,
        sceneType: "isometric",
        runtime: {
          type: "isometric",
          config: { tileWidth: 32, tileHeight: 16, heightStep: 8 }
        }
      }],
      actors: [{
        id: "actor-player",
        name: "Player",
        roomName: "raised-market",
        x: 3,
        y: 4
      }],
      settings: {
        general: {
          gameTitle: "Isometric Height",
          startScene: "raised-market",
          startSceneType: "isometric",
          exportFolder: "build"
        },
        build: {
          romFileName: "isometric-height.gba",
          exportFormat: "gba_rom",
          engineBackend: "gbastudio_engine",
          enginePackPath: "/opt/GBAStudioEnginePack"
        },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: {
          developerMode: false,
          preserveTempFiles: false,
          exportReadableButanoProject: false
        }
      }
    }));

    expect(contract.isometric_project?.rooms[0]?.actors?.[0]?.tile).toEqual({
      x: 3,
      y: 4,
      z: 2
    });
  });

  it("exports the explicit tactical presentation without enabling it for other isometric rooms", () => {
    const tacticalCapabilities = [
      "tactical_surface",
      "tactical_grid_overlay",
      "tactical_hud",
      "tactical_units",
      "tactical_props",
      "tactical_feedback",
      "tactical_audio"
    ].map((id) => ({ id, enabled: true, required: true, settings: {} }));
    const animationNames = ["idle", "move", "attack", "hurt", "defeat"]
      .flatMap((state) => ["down", "up", "left", "right"].map((direction) => `${state}_${direction}`));
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        {
          id: "room-tactical",
          name: "arena_tatica",
          width: 12,
          height: 8,
          sceneType: "isometric",
          runtime: {
            type: "isometric",
            config: {
              gameplayMode: "tactical",
              tacticalCapabilities,
              tacticalPresentation: {
                schema: 1,
                assets: [
                  { id: "surface", path: "Assets/backgrounds/arena.png", consumer: "bg", required: true, status: "candidate" },
                  { id: "grid", path: "Assets/backgrounds/grid.png", consumer: "bg", required: true, status: "candidate" },
                  { id: "hud", path: "Assets/ui/hud.png", consumer: "ui", required: true, status: "candidate" },
                  { id: "nara", path: "Assets/sprites/nara.png", consumer: "obj", required: true, status: "candidate" },
                  { id: "sentinel", path: "Assets/sprites/sentinel.png", consumer: "obj", required: true, status: "candidate" },
                  { id: "props", path: "Assets/sprites/props.png", consumer: "obj", required: true, status: "candidate" },
                  { id: "feedback", path: "Assets/sprites/feedback.png", consumer: "obj", required: true, status: "candidate" }
                ],
                surfaceAsset: "arena.png",
                gridAsset: "grid.png",
                hudLayout: "hud.png",
                cursorAsset: "feedback.png#cursor",
                rangeAsset: "feedback.png#range",
                targetAsset: "feedback.png#target",
                units: [
                  {
                    actorId: "unit-nara",
                    sheet: "nara.png",
                    animations: Object.fromEntries(animationNames.map((name) => [name, `nara_${name}`]))
                  },
                  {
                    actorId: "unit-sentinel",
                    sheet: "sentinel.png",
                    animations: Object.fromEntries(animationNames.map((name) => [name, `sentinel_${name}`]))
                  }
                ],
                props: [
                  { id: "beacon", asset: "props.png#beacon", kind: "objective", tile: { x: 8, y: 3, z: 1 }, animated: true },
                  { id: "cover", asset: "props.png#cover", kind: "cover", tile: { x: 5, y: 5, z: 0 } }
                ],
                emotesAsset: "feedback.png#emotes",
                feedbackAsset: "feedback.png",
                audio: {
                  music: "farol_arena_tatica",
                  cues: {
                    cursor: "farol_sfx_tatica_cursor",
                    select: "farol_sfx_tatica_selecionar",
                    cancel: "farol_sfx_tatica_cancelar",
                    move: "farol_sfx_tatica_mover",
                    attack: "farol_sfx_tatica_ataque",
                    hit: "farol_sfx_tatica_impacto",
                    turn: "farol_sfx_tatica_turno",
                    victory: "farol_sfx_tatica_vitoria",
                    defeat: "farol_sfx_tatica_derrota"
                  }
                }
              }
            }
          }
        },
        { id: "room-adventure", name: "market", width: 8, height: 8, sceneType: "isometric" }
      ],
      assets: [
        ...["arena.png", "grid.png", "hud.png", "nara.png", "sentinel.png", "props.png", "feedback.png"].map((name) => ({ id: `asset-${name}`, name, kind: "Sprite" })),
        { id: "asset-background", name: "arena.png", kind: "Background" }
      ],
      audioItems: [
        {
          id: "music",
          name: "farol_arena_tatica",
          exportID: "farol_arena_tatica",
          kind: "Musica",
          format: "COMPOSED",
          patterns: [{
            id: "arena-intro",
            name: "Arena intro",
            steps: 4,
            channels: [{ id: "arena-intro-pulse1", name: "Pulse 1", type: "pulse1", notes: ["C-4", "---", "E-4", "---"] }]
          }]
        },
        ...["cursor", "selecionar", "cancelar", "mover", "ataque", "impacto", "turno", "vitoria", "derrota"].map((suffix) => ({
          id: `sfx-${suffix}`,
          name: `farol_sfx_tatica_${suffix}`,
          exportID: `farol_sfx_tatica_${suffix}`,
          kind: "SFX",
          format: "COMPOSED",
          patterns: [{
            id: `${suffix}-hit`,
            name: `${suffix} hit`,
            steps: 2,
            channels: [{ id: `${suffix}-hit-noise`, name: "Noise", type: "noise", notes: ["C-4", "---"] }]
          }]
        }))
      ],
      settings: {
        general: { gameTitle: "Tactical", startScene: "arena_tatica", startSceneType: "isometric", exportFolder: "build" },
        build: { romFileName: "tactical.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    const rooms = contract.isometric_project?.rooms ?? [];
    const tacticalRoom = rooms.find((room) => room.name === "arena_tatica") as Record<string, unknown> | undefined;
    const adventureRoom = rooms.find((room) => room.name === "market") as Record<string, unknown> | undefined;
    expect(tacticalRoom).toHaveProperty("tactical_presentation", expect.objectContaining({
      schema: 1,
      capabilities: tacticalCapabilities.map((capability) => capability.id),
      layers: {
        surface: "BG2",
        grid: "BG1",
        hud: "BG0",
        objects: "OBJ",
        collision: "scene_data"
      },
      units: expect.arrayContaining([
        expect.objectContaining({ actor_id: "unit-nara", sheet: "nara" })
      ]),
      props: expect.arrayContaining([
        expect.objectContaining({ id: "beacon", kind: "objective", asset: "props#beacon" })
      ]),
      audio: expect.objectContaining({
        music: { asset: "project_audio", index: 0 },
        cues: expect.objectContaining({
          cursor: { asset: "project_audio", index: 0 },
          defeat: { asset: "project_audio", index: 8 }
        })
      }),
      indices: expect.objectContaining({
        markers: { cursor: 0, range: 1, target: 2 },
        props: [{ id: "beacon", index: 0 }, { id: "cover", index: 1 }]
      })
    }));
    const tacticalPresentation = (tacticalRoom?.tactical_presentation ?? {}) as { assets?: Array<{ reference?: string }> };
    expect(tacticalPresentation.assets?.every((asset) => (
      typeof asset.reference === "string" && !asset.reference.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(asset.reference)
    ))).toBe(true);
    expect(contract.asset_pack?.capability_assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ scene: "arena_tatica", capability: "tactical_surface", references: ["arena"] }),
      expect.objectContaining({ scene: "arena_tatica", capability: "tactical_audio" })
    ]));
    expect(contract.asset_pack?.assets.map((asset) => asset.name)).toEqual(expect.arrayContaining([
      "arena",
      "grid",
      "hud",
      "nara",
      "sentinel",
      "props",
      "feedback"
    ]));
    expect(adventureRoom).not.toHaveProperty("tactical_presentation");
  });

  it("keeps a paged tactical surface out of the authored static background slot", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-coastal-arena",
        name: "arena_tatica",
        width: 12,
        height: 8,
        sceneType: "isometric",
        backgroundAssetName: "coastal.png",
        gbStudioUseBackgroundLayout: true,
        backgroundRenderMode: "tilemap",
        runtime: {
          type: "isometric",
          config: {
            worldMode: "static_composition",
            gameplayMode: "tactical",
            tacticalCapabilities: [{ id: "tactical_surface", enabled: true, required: true, settings: {} }],
            tacticalPresentation: {
              schema: 1,
              surfacePages: [{
                id: "coastal",
                asset: "coastal.png",
                bankGroup: "arena_tatica_coastal",
                world: { x: 0, y: 0, width: 240, height: 160 }
              }],
              surfaceResidency: {
                exclusiveBankGroups: ["arena_tatica_coastal"],
                maxResidentGroups: 1,
                prefetchMarginPixels: 0
              },
              assets: [{ id: "coastal", path: "coastal.png", consumer: "bg", required: true, status: "candidate" }],
              units: [],
              props: []
            }
          }
        }
      }, { name: "start", width: 20, height: 18, sceneType: "topdown" }],
      assets: [{ id: "coastal", name: "coastal.png", kind: "Background" }]
    }));
    const room = contract.isometric_project?.rooms[0];

    expect(room?.world_mode).toBe("scrollable_tiled_world");
    expect(room?.tactical_presentation?.surface_pages).toHaveLength(1);
    expect(room).not.toHaveProperty("authored_background");
  });

  it("blocks tactical export when an enabled binding is missing", () => {
    expect(() => buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-tactical-invalid",
        name: "arena_tatica",
        width: 12,
        height: 8,
        sceneType: "isometric",
        runtime: {
          type: "isometric",
          config: {
            gameplayMode: "tactical",
            tacticalCapabilities: [{ id: "tactical_surface", enabled: true, required: true, settings: {} }],
            tacticalPresentation: { schema: 1, units: [], props: [] }
          }
        }
      }],
      settings: {
        general: { gameTitle: "Tactical", startScene: "arena_tatica", startSceneType: "isometric", exportFolder: "build" },
        build: { romFileName: "tactical-invalid.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }))).toThrow(/surfaceAsset/);
  });

  it("exports point-and-click rooms through the native point_click project contract", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        {
          id: "room-pc",
          name: "office",
          width: 16,
          height: 16,
          sceneType: "pointAndClick",
          backgroundAssetName: "office.png",
          gbStudioUseBackgroundLayout: true,
          runtime: { type: "pointAndClick", config: { cursorSpeed: 4, hotspotPadding: 3 } }
        }
      ],
      assets: [{
        id: "asset-office",
        name: "office.png",
        kind: "Background",
        metadata: { source: "Assets/backgrounds/office.png", width: 128, height: 128 }
      }, {
        id: "asset-cursor",
        name: "cursor.png",
        kind: "Sprite",
        metadata: { source: "Assets/sprites/cursor.png", width: 32, height: 16, gbStudioResourceType: "sprite" }
      }],
      animations: [{
        id: "animation-cursor-idle",
        name: "idle",
        spriteSheet: "cursor.png",
        frameWidth: 16,
        frameHeight: 16,
        frameCount: 1,
        frames: [{ frameIndex: 0, tiles: [{ x: 0, y: 0, sliceX: 0, sliceY: 0, tileWidth: 8, tileHeight: 8 }] }]
      }, {
        id: "animation-cursor-hover",
        name: "hover",
        spriteSheet: "cursor.png",
        frameWidth: 16,
        frameHeight: 16,
        frameCount: 2,
        frames: [
          { frameIndex: 0, tiles: [{ x: 0, y: 1, sliceX: 16, sliceY: 0, tileWidth: 8, tileHeight: 8 }] },
          { frameIndex: 1, tiles: [{ x: 0, y: 0, sliceX: 24, sliceY: 0, tileWidth: 8, tileHeight: 8 }] }
        ]
      }],
      animationStates: [{
        id: "state-cursor",
        name: "default",
        spriteSheet: "cursor.png",
        animationType: "cursor",
        mirrorLeftFromRight: false,
        animationIDs: ["animation-cursor-idle", "animation-cursor-hover"]
      }],
      actors: [{
        id: "actor-player",
        name: "Player",
        roomName: "office",
        x: 4,
        y: 5,
        spriteSheet: "cursor.png",
        animationStateID: "state-cursor",
        animationName: "idle"
      }],
      triggers: [{
        id: "trigger-door",
        name: "Door",
        roomName: "office",
        x: 10,
        y: 4,
        width: 2,
        height: 3,
        eventBindings: { onInteract: "door_use" }
      }],
      events: [{ id: "event-door", name: "door_use", category: "Cena", steps: [{ command: "show_dialogue intro" }] }],
      dialogues: [{ id: "dialogue-intro", key: "intro", character: "Guide", text: "Hello" }],
      settings: {
        general: { gameTitle: "Scene Profiles", startScene: "office", startSceneType: "pointAndClick", exportFolder: "build" },
        pointAndClick: { cursorSpeed: 2.5, cursorImage: "cursor.png" },
        build: { romFileName: "scene_profiles.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.kind).toBe("point_click");
    expect(contract.runtime_contract.adapter_status).toBe("native");
    expect(contract.point_click_project?.cursor_speed).toBe(3);
    expect(contract.point_click_project).toMatchObject({
      backgrounds: [{ name: "office", layer: "bg1", tilemap: "office", backdrop_color: 0 }],
      cursor: {
        metasprite: { asset: "cursor", index: 0 },
        animations: expect.arrayContaining([
          expect.objectContaining({ name: "idle", asset: "cursor" }),
          expect.objectContaining({ name: "hover", asset: "cursor" })
        ])
      },
      assets: { bg_palettes: ["office"], obj_palettes: ["cursor"], tile_assets: ["office", "cursor"] },
      resource_banks: "asset_pack"
    });
    expect(contract.point_click_project?.scenes[0]).toMatchObject({
      name: "office",
      background: 0,
      resource_bank_group: "scene_office",
      cursor_speed: 4,
      hotspots: expect.arrayContaining([
        expect.objectContaining({
          name: "Door",
          area: { x: 77, y: 29, width: 22, height: 30 },
          on_click: [{ op: "show_dialogue", dialogue: 0 }]
        })
      ])
    });
  });

  it("exports point-and-click workshop scenes with ordered background layers and animated props", () => {
    const contract = buildEngineExportProjectContract(project({
      events: [{ id: "event-stabilizer", name: "stabilizer", category: "Cena", steps: [{ command: "set_variable var_stabilizer 1" }] }],
      scenas: [{
        id: "room-workshop",
        name: "workshop",
        width: 30,
        height: 20,
        sceneType: "pointAndClick",
        playerActorName: "Cursor",
        backgroundAssetName: "workshop-bench.png",
        gbStudioUseBackgroundLayout: true,
        tileLayers: [
          { mapping: "BG3", tileSourceAssetNames: ["workshop-backwall.png"] },
          { mapping: "BG2", tileSourceAssetNames: ["workshop-bench.png"] },
          { mapping: "BG1", tileSourceAssetNames: ["workshop-foreground.png"] }
        ],
        runtime: { type: "pointAndClick", config: { cursorSpeed: 3 } }
      }],
      assets: [
        { id: "asset-backwall", name: "workshop-backwall.png", kind: "Background", metadata: { source: "Assets/backgrounds/workshop-backwall.png", width: 240, height: 160 } },
        { id: "asset-bench", name: "workshop-bench.png", kind: "Background", metadata: { source: "Assets/backgrounds/workshop-bench.png", width: 240, height: 160 } },
        { id: "asset-foreground", name: "workshop-foreground.png", kind: "Background", metadata: { source: "Assets/backgrounds/workshop-foreground.png", width: 240, height: 160 } },
        { id: "asset-cursor", name: "workshop-cursor.png", kind: "Sprite", metadata: { source: "Assets/sprites/workshop-cursor.png", width: 16, height: 16, gbStudioResourceType: "sprite" } },
        { id: "asset-mechanic", name: "workshop-mechanic.png", kind: "Sprite", metadata: { source: "Assets/sprites/workshop-mechanic.png", width: 16, height: 16, gbStudioResourceType: "sprite" } }
      ],
      animations: [{
        id: "animation-cursor-idle",
        name: "idle",
        spriteSheet: "workshop-cursor.png",
        frameWidth: 16,
        frameHeight: 16,
        frameCount: 1,
        frames: [{ frameIndex: 0, tiles: [{ x: 0, y: 0, sliceX: 0, sliceY: 0, tileWidth: 8, tileHeight: 8 }] }]
      }, {
        id: "animation-mechanic-idle",
        name: "idle",
        spriteSheet: "workshop-mechanic.png",
        frameWidth: 16,
        frameHeight: 16,
        frameCount: 1,
        frames: [{ frameIndex: 0, tiles: [{ x: 0, y: 0, sliceX: 0, sliceY: 0, tileWidth: 8, tileHeight: 8 }] }]
      }],
      animationStates: [{
        id: "state-cursor",
        name: "cursor",
        spriteSheet: "workshop-cursor.png",
        animationType: "cursor",
        mirrorLeftFromRight: false,
        animationIDs: ["animation-cursor-idle"]
      }, {
        id: "state-mechanic",
        name: "mechanic",
        spriteSheet: "workshop-mechanic.png",
        animationType: "fixed",
        mirrorLeftFromRight: false,
        animationIDs: ["animation-mechanic-idle"]
      }],
      actors: [{
        id: "actor-cursor",
        name: "Cursor",
        roomName: "workshop",
        x: 2,
        y: 3,
        spriteSheet: "workshop-cursor.png",
        animationStateID: "state-cursor",
        animationName: "idle"
      }, {
        id: "actor-mechanic",
        name: "Mechanic",
        roomName: "workshop",
        x: 12,
        y: 9,
        spriteSheet: "workshop-mechanic.png",
        animationStateID: "state-mechanic",
        animationName: "idle",
        visibleVariable: "var_stabilizer",
        visibleValue: 1
      }],
      settings: {
        general: { gameTitle: "Layered Workshop", startScene: "workshop", startSceneType: "pointAndClick", startPlayer: "Cursor", exportFolder: "build" },
        pointAndClick: { cursorSpeed: 3, cursorImage: "workshop-cursor.png" },
        build: { romFileName: "layered_workshop.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.point_click_project).toMatchObject({
      backgrounds: [
        { name: "workshop_bg3", layer: "bg3", tilemap: "workshop_backwall", backdrop_color: 0 },
        { name: "workshop_bg2", layer: "bg2", tilemap: "workshop_bench", backdrop_color: 0 },
        { name: "workshop_bg1", layer: "bg1", tilemap: "workshop_foreground", backdrop_color: 0 }
      ],
      assets: {
        bg_palettes: expect.arrayContaining(["workshop_backwall", "workshop_bench", "workshop_foreground"]),
        obj_palettes: expect.arrayContaining(["workshop_cursor", "workshop_mechanic"]),
        tile_assets: expect.arrayContaining(["workshop_cursor", "workshop_mechanic"])
      }
    });
    expect(contract.point_click_project?.scenes[0]).toMatchObject({
      name: "workshop",
      backgrounds: [0, 1, 2],
      props: [{
        name: "Mechanic",
        metasprite: { asset: "workshop_mechanic", index: 0 },
        animation: "idle_down",
        animations: expect.arrayContaining([expect.objectContaining({ name: "idle_down", asset: "workshop_mechanic" })]),
        position: { x: 96, y: 72 },
        visible_variable: 0,
        visible_value: 1
      }]
    });
    expect(contract.point_click_project?.scenes[0]).not.toHaveProperty("background");
  });

  it("exports shmup rooms through the native shmup project contract", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        {
          id: "room-shmup",
          name: "wave_1",
          width: 255,
          height: 20,
          sceneType: "shmup",
          eventBindings: { onInit: "wave_boot", onClear: "wave_clear" },
          runtime: {
            type: "shmup",
            config: {
              playerSpeed: 4,
              fireCooldown: 6,
              scrollSpeed: 3,
              modules: [
                { id: "score", enabled: true, settings: { pointsPerEnemy: 100 } },
                { id: "waves", enabled: true, settings: { maxWaves: 4 } },
                { id: "shop", enabled: true, settings: {} }
              ]
            }
          }
        }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "wave_1", x: 7, y: 12 },
        {
          id: "actor-scout-a",
          name: "ScoutA",
          roomName: "wave_1",
          x: 30,
          y: 4,
          eventBindings: {
            onInteract: "scout_a_hit_player",
            onUpdate: "scout_a_update",
            onHit1: "scout_a_destroy"
          }
        },
        {
          id: "actor-scout-b",
          name: "Scout B",
          roomName: "wave_1",
          x: 100,
          y: 15,
          eventBindings: { onInit: "scout_b_spawn" }
        }
      ],
      events: [
        { id: "event-wave-boot", name: "wave_boot", category: "Cena", roomName: "wave_1", steps: [{ command: "attach_button a player_fire true" }] },
        {
          id: "event-player-fire",
          name: "player_fire",
          category: "Input",
          roomName: "wave_1",
          steps: [
            { command: "rate_limit 30 19" },
            { command: "launch_projectile Player right 3" },
            { command: "rate_limit_end" }
          ]
        },
        { id: "event-hit-player", name: "scout_a_hit_player", category: "Ator", roomName: "wave_1", steps: [{ command: "shake_screen 5 2" }] },
        { id: "event-update", name: "scout_a_update", category: "Ator", roomName: "wave_1", steps: [{ command: "launch_projectile ScoutA left 2" }] },
        { id: "event-destroy", name: "scout_a_destroy", category: "Ator", roomName: "wave_1", steps: [{ command: "shake_screen 10 3" }] },
        { id: "event-spawn", name: "scout_b_spawn", category: "Ator", roomName: "wave_1", steps: [{ command: "shake_screen 20 4" }] },
        { id: "event-wave-clear", name: "wave_clear", category: "Cena", roomName: "wave_1", steps: [{ command: "set_variable wave_complete 1" }] }
      ],
      settings: {
        general: { gameTitle: "Scene Profiles", startScene: "wave_1", startSceneType: "shmup", exportFolder: "build" },
        shmup: { playerSpeed: 2.2, fireRate: 10, scrollSpeed: 1 },
        build: { romFileName: "scene_profiles.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.kind).toBe("shmup");
    expect(contract.runtime_contract).toMatchObject({
      scene_type: "shmup",
      adapter: "shmup_project",
      adapter_status: "native",
      rooms: [{
        name: "wave_1",
        feature_modules: [
          { id: "score", enabled: true, settings: { pointsPerEnemy: 100 } },
          { id: "waves", enabled: true, settings: { maxWaves: 4 } }
        ]
      }]
    });
    expect(contract.shmup_project?.player.speed).toBe(2);
    expect(contract.shmup_project?.player.fire_cooldown).toBe(10);
    expect(contract.shmup_project?.projectile.velocity).toEqual({ x: 3, y: 0 });
    expect(contract.shmup_project?.waves[0]).toMatchObject({
      name: "wave_1",
      player_speed: 4,
      fire_cooldown: 6,
      on_start: [{ op: "attach_button_event", button: "a", index: 1, override: true }],
      on_clear: [{ op: "set_variable", variable: expect.any(Number), value: 1 }],
      enemies: [
        expect.objectContaining({
          name: "ScoutA",
          position: { x: 240, y: 32 },
          velocity: { x: -3, y: 0 },
          fire_interval: 24,
          on_hit_player: [{ op: "set_camera_shake", frames: 5, magnitude: 2 }],
          on_destroy: [{ op: "set_camera_shake", frames: 10, magnitude: 3 }]
        }),
        expect.objectContaining({
          name: "Scout B",
          position: { x: 800, y: 120 },
          velocity: { x: -3, y: 0 },
          fire_interval: 0
        })
      ]
    });
    expect(contract.shmup_project?.enemy_projectile).toMatchObject({
      velocity: { x: -2, y: 0 }
    });
    expect(contract.shmup_project?.waves[0]?.enemies[1]?.on_hit_player).toBeUndefined();
    expect(contract.shmup_project?.scripts.find((script) => script.name === "scout_a_update")?.script).toEqual([
      { op: "launch_projectile", actor: 1, direction: "left" }
    ]);
    expect(contract.shmup_project?.scripts.find((script) => script.name === "player_fire")?.script).toEqual([
      { op: "rate_limit", slot: 19, frames: 30, offset: 2 },
      { op: "launch_projectile", actor: 0, direction: "right" }
    ]);
  });

  it("exports visual-novel rooms through the native visual_novel project contract", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-vn", name: "chapter", width: 16, height: 16, sceneType: "visualNovel", runtime: { type: "visualNovel", config: { autoAdvance: true, nextSceneIndex: -1, backgroundIndex: 2, dialogueKey: "intro" } } }
      ],
      events: [{ id: "event-boot", name: "chapter_boot", category: "Cena", steps: [{ command: "show_dialogue intro" }] }],
      dialogues: [{ id: "dialogue-intro", key: "intro", character: "Narrator", text: "Hello VN", choices: ["Next"] }],
      settings: {
        general: { gameTitle: "Scene Profiles", startScene: "chapter", startSceneType: "visualNovel", exportFolder: "build" },
        build: { romFileName: "scene_profiles.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.kind).toBe("visual_novel");
    expect(contract.runtime_contract.adapter_status).toBe("native");
    expect(contract.visual_novel_project?.scenes[0]).toMatchObject({
      name: "chapter",
      auto_advance: true,
      next_scene: -1,
      background: -1,
      line: 0,
      choice_group: 0
    });
    expect(contract.visual_novel_project?.choice_groups?.length).toBe(1);
  });

  it("exports menu rooms through the native menu project contract", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-title", name: "title-screen.png", kind: "Tileset", sourcePath: "/tmp/title-screen.png" },
        { id: "asset-title-frame-1", name: "title-frame-01.png", kind: "Tileset", sourcePath: "/tmp/title-frame-01.png" },
        { id: "asset-title-frame-2", name: "title-frame-02.png", kind: "Tileset", sourcePath: "/tmp/title-frame-02.png" },
        { id: "asset-title-overlay", name: "title-overlay.png", kind: "Background", sourcePath: "/tmp/title-overlay.png" },
        { id: "asset-world", name: "unused-world.png", kind: "Tileset", sourcePath: "/tmp/unused-world.png" }
      ],
      scenas: [
        {
          id: "room-menu",
          name: "title",
          width: 30,
          height: 20,
          sceneType: "menu",
          backgroundAssetName: "title-screen.png",
          runtime: {
            type: "menu",
            config: {
              screenType: "title",
              menuProfile: "initial",
              title: "Menu export",
              backgroundAnimation: {
                frameAssetNames: ["title-screen.png", "title-frame-01.png", "title-frame-02.png"],
                frameDuration: 18,
                loop: true
              },
              titleOverlayAssetName: "title-overlay.png",
              titleFadeFrames: 24,
              allowSkip: true,
              items: [{
                id: "start",
                label: "> Start",
                action: "toggle_variable",
                variableIndex: 2,
                minValue: 0,
                maxValue: 1,
                checkedValue: 1,
                binding: { source: "variable", index: 2, format: "percent" },
                clickBox: { x: 72, y: 104, width: 96, height: 24 }
              }]
            }
          },
          eventBindings: { onInit: "menu_boot" }
        },
        {
          id: "room-world",
          name: "world",
          width: 30,
          height: 20,
          sceneType: "topdown",
          backgroundAssetName: "unused-world.png"
        }
      ],
      events: [{
        id: "event-boot",
        name: "menu_boot",
        category: "Cena",
        steps: [{ command: "choice_event menu_items 0 start_selected" }]
      }, {
        id: "event-start",
        name: "start_selected",
        category: "Cena",
        steps: [{ command: "show_dialogue start_feedback" }]
      }],
      dialogues: [{
        id: "dialogue-title",
        key: "title",
        character: "System",
        text: "Menu export"
      }, {
        id: "dialogue-items",
        key: "menu_items",
        character: "System",
        text: "Escolha",
        choices: ["> Start"]
      }, {
        id: "dialogue-start",
        key: "start_feedback",
        character: "System",
        text: "Start selected"
      }],
      settings: {
        general: { gameTitle: "Scene Profiles", startScene: "title", startSceneType: "menu", exportFolder: "build" },
        build: { romFileName: "scene_profiles.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.kind).toBe("mixed");
    expect(contract.runtime_contract.adapter_status).toBe("native");
    expect(contract.menu_project?.screens[0]).toMatchObject({
      name: "title",
      background: 0,
      background_animation: { frames: [0, 1, 2], frame_duration: 18, loop: true },
      title_overlay_background: 3,
      title_fade_frames: 24,
      screen_type: "title",
      menu_profile: "initial",
      allow_skip: true,
      items: expect.arrayContaining([
        expect.objectContaining({
          label: "> Start",
          action: "toggle_variable",
          toggle_variable: 2,
          checked_value: 1,
          click_box: { x: 72, y: 104, width: 96, height: 24 },
          binding: { source: "variable", index: 2, format: "percent" }
        })
      ])
    });
    expect(contract.menu_project).toMatchObject({
      menu_profiles: [{ id: "initial", label: "Menu inicial", entry_screen: 0, return_policy: "title", suspends_gameplay: false }],
      resource_banks: "asset_pack",
      screens: [expect.objectContaining({ resource_bank_group: "scene_title" })],
      backgrounds: [
        { name: "title_screen", layer: "bg1", tilemap: "title_screen", backdrop_color: 0 },
        { name: "title_frame_01", layer: "bg1", tilemap: "title_frame_01", backdrop_color: 0 },
        { name: "title_frame_02", layer: "bg1", tilemap: "title_frame_02", backdrop_color: 0 },
        { name: "title_overlay", layer: "bg0", tilemap: "title_overlay", backdrop_color: 0 }
      ],
      assets: {
        bg_palettes: ["title_screen", "title_frame_01", "title_frame_02", "title_overlay"],
        tile_assets: ["title_screen", "title_frame_01", "title_frame_02", "title_overlay"]
      }
    });
  });

  it("exports a title carousel with screen-specific actors and mirrored navigation", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-title", name: "title", width: 30, height: 20, sceneType: "menu",
        runtime: { type: "menu", config: { screenType: "title", role: "title", screens: [
          { id: "title", screenType: "title", items: [
            { id: "start", label: "PRESS START", action: "push_screen", targetScreenID: "title_options" }
          ] },
          { id: "title_options", screenType: "menu", carousel: true, items: [
            { id: "new-game", label: "Novo jogo", action: "select" },
            { id: "credits", label: "Créditos", action: "select" }
          ] }
        ] } }
      }],
      actors: [
        { id: "actor-start", name: "PRESS START", sceneName: "title", spriteSheet: "start.png", menuScreenIDs: ["title"] },
        { id: "actor-option", name: "Novo jogo", sceneName: "title", spriteSheet: "option.png", menuScreenIDs: ["title_options"], menuActorRole: "option", menuItemID: "new-game" },
        { id: "actor-left", name: "Seta esquerda", sceneName: "title", spriteSheet: "arrow.png", menuScreenIDs: ["title_options"], menuMirrorX: true }
      ],
      assets: ["start.png", "option.png", "arrow.png"].map((name) => ({ id: name, name, kind: "Sprite", metadata: { source: `Assets/sprites/${name}` } })),
      settings: { ...(project({}).settings as Record<string, unknown>), general: {
        gameTitle: "Title Carousel", startScene: "title", startSceneType: "menu", exportFolder: "build"
      } }
    }));
    const screens = contract.menu_project?.screens ?? [];
    expect(screens.map((screen) => screen.name)).toEqual(["title", "title_options"]);
    expect(screens[0].items[0]).toMatchObject({ action: "push_screen", target_screen: 1 });
    expect(screens[0].actors?.map((actor) => actor.name)).toEqual(["PRESS START"]);
    expect(screens[1]).toMatchObject({ carousel: true });
    expect(screens[1].actors).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Novo jogo", role: "option", menu_item_index: 0 }),
      expect.objectContaining({ name: "Seta esquerda", flip_horizontal: true })
    ]));
  });

  it("exports menu audio bindings for adjustable variables beyond the legacy range", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-settings",
        name: "settings",
        width: 30,
        height: 20,
        sceneType: "menu",
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            role: "settings",
            title: "Configurações",
            items: [{
              id: "master-volume",
              label: "Volume geral",
              action: "adjust_variable",
              variableIndex: 16,
              minValue: 0,
              maxValue: 100,
              step: 10,
              audioChannel: "all",
              clickBox: { x: 32, y: 32, width: 176, height: 18 }
            }]
          }
        }
      }],
      variables: Array.from({ length: 17 }, (_, index) => ({ name: `var_${index}` })),
      settings: {
        general: { gameTitle: "Settings", startScene: "settings", startSceneType: "menu", exportFolder: "build" },
        build: { romFileName: "settings.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.menu_project?.screens[0]?.items[0]).toMatchObject({
      action: "adjust_variable",
      adjust_variable: 16,
      min: 0,
      max: 100,
      step: 10,
      audio_channel: "all"
    });
  });

  it("applies menu audio bindings for sliders and mute toggles in the native runtime", async () => {
    const templatePath = path.resolve(process.cwd(), "../../packages/GBAStudioEngine/templates/exported_menu/main.cpp");
    const template = await readFile(templatePath, "utf8");

    expect(template).toContain("void apply_menu_audio_binding(const gbs::MenuItemData& item, int value)");
    expect(template).toContain("gbs::set_audio_channel_volume(channel, volume);");
    expect(template).toContain("gbs::set_audio_channel_muted(channel, value != item.checked_value);");
    expect(template).toContain("format_menu_item_label(item, visible_item_count);");
    expect(template).toContain("gbs::menu_item_binding_value(event_state, item)");
    expect(template).toContain("MenuItemBindingFormat::Count");
  });

  it("converts same-runtime menu scene events into target screen navigation", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        {
          id: "room-title",
          name: "title",
          width: 30,
          height: 20,
          sceneType: "menu",
          runtime: {
            type: "menu",
            config: {
              screenType: "title",
              role: "title",
              items: [{
                id: "start",
                label: "PRESS START",
                action: "select",
                eventName: "title_open_menu",
                clickBox: { x: 72, y: 112, width: 96, height: 24 }
              }]
            }
          }
        },
        {
          id: "room-initial",
          name: "initial",
          width: 30,
          height: 20,
          sceneType: "menu",
          runtime: {
            type: "menu",
            config: {
              screenType: "menu",
              role: "initial",
              items: [{
                id: "new-game",
                label: "Novo jogo",
                action: "select",
                clickBox: { x: 64, y: 64, width: 112, height: 18 }
              }]
            }
          }
        }
      ],
      events: [{
        id: "event-title-open-menu",
        name: "title_open_menu",
        category: "Cena",
        steps: [{ command: "change_scene initial" }]
      }],
      settings: {
        general: { gameTitle: "Menu navigation", startScene: "title", startSceneType: "menu", exportFolder: "build" },
        build: { romFileName: "menu-navigation.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    const startItem = contract.menu_project?.screens[0]?.items[0];
    expect(startItem).toMatchObject({
      label: "PRESS START",
      action: "select",
      target_screen: 1
    });
    expect(startItem).not.toHaveProperty("on_select");
  });

  it("exports authored pause HUD rows, name, language labels and individual save slots", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ name: "pause", sceneType: "menu", width: 30, height: 20,
        runtime: { type: "menu", config: { role: "start", screenType: "menu", hudListRows: 6,
          titleTextVariableName: "var_character_name", items: [
            { id: "load", label: "Slot 3", requiresSave: true, saveSlot: 2 },
            { id: "language", label: "Idioma", action: "adjust_variable", variableIndex: 15, minValue: 0, maxValue: 2, valueLabels: ["PT", "EN", "ES"] }
          ] } } }],
      settings: { ...(project({}).settings as Record<string, unknown>), general: { gameTitle: "Pause", startScene: "pause", startSceneType: "menu", exportFolder: "build" } }
    }));
    const screen = contract.menu_project?.screens[0];
    expect(screen).toMatchObject({ hud_list_rows: 6, title_text_variable: 0 });
    expect(screen?.items[0]).toMatchObject({ requires_save: true, save_slot: 2 });
    expect(screen?.items[1]).toMatchObject({ value_labels: ["PT", "EN", "ES"], adjust_variable: 15 });
  });

  it("exports the requested item focus for a menu screen shortcut", () => {
    const menu = (name: string, items: object[]) => ({
      id: `room-${name}`, name, width: 30, height: 20, sceneType: "menu",
      runtime: { type: "menu", config: { screenType: "menu", role: "initial", items } }
    });
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        menu("initial", [
          { id: "language", label: "Idioma", action: "push_screen", targetScreenID: "settings", targetItemID: "language" },
          { id: "settings", label: "Configurações", action: "push_screen", targetScreenID: "settings" }
        ]),
        menu("settings", [
          { id: "sound", label: "Som", action: "select" },
          { id: "language", label: "Idioma", action: "select" }
        ])
      ],
      settings: {
        general: { gameTitle: "Menu focus", startScene: "initial", startSceneType: "menu", exportFolder: "build" },
        build: { romFileName: "menu-focus.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));
    expect(contract.menu_project?.screens[0]?.items[0]).toMatchObject({ target_screen: 1, target_item: 1 });
    expect(contract.menu_project?.screens[0]?.items[1]).not.toHaveProperty("target_item");
  });

  it("exports the native GBA keyboard contract for the player-name scene", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-name",
        name: "name-input",
        width: 30,
        height: 20,
        sceneType: "menu",
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            role: "name_input",
            title: "Nome do jogador",
            textInput: {
              variableName: "player.name",
              maxLength: 8,
              x: 12,
              y: 6,
              width: 8,
              keyboard: {
                layout: "grid",
                x: 4,
                y: 8,
                width: 24,
                height: 7,
                allowLowercase: true,
                surface: "background"
              }
            },
            items: [{ id: "name", label: "Nome", eventName: "open_name" }]
          }
        }
      }],
      variables: [{ name: "player.name", kind: "variable", valueType: "text", maxLength: 8 }],
      settings: {
        general: { gameTitle: "Name Input", startScene: "name-input", startSceneType: "menu", exportFolder: "build" },
        build: { romFileName: "name-input.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.menu_project?.screens[0]?.text_input).toEqual({
      variable_index: 0,
      max_length: 8,
      x: 12,
      y: 6,
      width: 8,
      keyboard_layout: "grid",
      keyboard_x: 4,
      keyboard_y: 8,
      keyboard_width: 24,
      keyboard_height: 7,
      keyboard_allow_lowercase: true,
      keyboard_surface: "background"
    });
  });

  it("keeps the name-input keyboard in the native menu runtime", async () => {
    const templatePath = path.resolve(process.cwd(), "../../packages/GBAStudioEngine/templates/exported_menu/main.cpp");
    const menuHeaderPath = path.resolve(process.cwd(), "../../packages/GBAStudioEngine/engine/include/gbs/menu.hpp");
    const hardwareSourcePath = path.resolve(process.cwd(), "../../packages/GBAStudioEngine/engine/src/gbs_hw.c");
    const template = await readFile(templatePath, "utf8");
    const menuHeader = await readFile(menuHeaderPath, "utf8");
    const hardwareSource = await readFile(hardwareSourcePath, "utf8");

    expect(template).toContain("gbs::draw_text_input_keyboard");
    expect(template).toContain("menu_text_input_keyboard_grid");
    expect(template).not.toContain('const char default_name[] = "NARA";');
    expect(menuHeader).toContain("MenuTextInputKeyboardLayout::Grid");
    expect(menuHeader).toContain("MenuTextInputKeyboardSurface::Background");
    expect(hardwareSource).toContain('const char* control_labels[3] = { "BACK", lowercase ? "LOWR" : "UPPR", "DONE" };');
  });

  it("wires the approved Start Menu scene into topdown runtime export", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-town", name: "town", sceneType: "topdown", width: 20, height: 18 },
        {
          id: "room-title",
          name: "title",
          sceneType: "menu",
          width: 30,
          height: 20,
          runtime: { type: "menu", config: { screenType: "title", role: "title" } }
        },
        {
          id: "room-start-menu",
          name: "start_menu",
          sceneType: "menu",
          width: 30,
          height: 20,
          runtime: { type: "menu", config: { screenType: "menu", role: "start" } }
        }
      ],
      settings: {
        general: { gameTitle: "Start Menu Runtime", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "start-menu-runtime.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    const menuProject = contract.menu_project!;
    const startMenuScreen = menuProject.screens[menuProject.start_menu_screen!];
    const startMenuScript = contract.topdown_project!.scripts.find((entry) => entry.name === "__gbastudio_start_menu__");
    const startMenuScriptIndex = contract.topdown_project!.scripts.indexOf(startMenuScript!);

    expect(contract.kind).toBe("mixed");
    expect(menuProject.start_menu_screen).toBe(1);
    expect(menuProject.menu_profiles).toEqual([
      expect.objectContaining({ id: "initial", entry_screen: 0, return_policy: "title", suspends_gameplay: false }),
      expect.objectContaining({ id: "in_game", entry_screen: 1, return_policy: "resume", suspends_gameplay: true })
    ]);
    expect(startMenuScript?.script).toEqual([
      { op: "scene_stack_push", runtime: "topdown" },
      { op: "warp_runtime", runtime: "menu", room: 1, x: 0, y: 0 }
    ]);
    expect(contract.topdown_project!.rooms[0].on_enter).toEqual([
      { op: "attach_button_event", button: "start", index: startMenuScriptIndex, override: true }
    ]);
    expect(startMenuScreen?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Missões" }),
      expect.objectContaining({ label: "Mapa" }),
      expect.objectContaining({ label: "Salvar" }),
      expect.objectContaining({
        label: "Voltar",
        on_select: [{ op: "scene_stack_previous", runtime: "menu" }]
      })
    ]));
    expect(startMenuScreen?.on_back).toEqual([
      { op: "scene_stack_previous", runtime: "menu" }
    ]);
    expect(startMenuScreen).toMatchObject({
      menu_profile: "in_game",
      presentation_mode: "scene",
      entry_policy: "gameplay",
      return_policy: "resume",
      suspends_gameplay: true
    });
  });

  it("keeps the scene Start binding when topdown gameplay modules are enabled", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        {
          id: "room-town",
          name: "town",
          sceneType: "topdown",
          width: 20,
          height: 18,
          runtime: {
            type: "topdown",
            config: {
              modules: [{ id: "inventory", enabled: true, settings: {} }]
            }
          }
        },
        {
          id: "room-start-menu",
          name: "start_menu",
          sceneType: "menu",
          width: 30,
          height: 20,
          runtime: { type: "menu", config: { screenType: "menu", role: "start" } }
        }
      ],
      settings: {
        general: { gameTitle: "Start Menu Runtime", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "start-menu-runtime.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    const startMenuScript = contract.topdown_project!.scripts.find((entry) => entry.name === "__gbastudio_start_menu__");
    const startMenuScriptIndex = contract.topdown_project!.scripts.indexOf(startMenuScript!);

    expect(startMenuScript?.script).toEqual([
      { op: "scene_stack_push", runtime: "topdown" },
      { op: "warp_runtime", runtime: "menu", room: 0, x: 0, y: 0 }
    ]);
    expect(contract.topdown_project!.rooms[0].on_enter).toEqual([
      { op: "attach_button_event", button: "start", index: startMenuScriptIndex, override: true }
    ]);
  });

  it("routes Start to the authored menu from platformer, isometric and dungeon crawler runtimes", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-town", name: "town", sceneType: "topdown", width: 20, height: 18 },
        { id: "room-stage", name: "stage", sceneType: "platformer", width: 80, height: 18 },
        { id: "room-cave", name: "cave", sceneType: "isometric", width: 24, height: 20 },
        { id: "room-crypt", name: "crypt", sceneType: "dungeonCrawler", width: 16, height: 16 },
        {
          id: "room-title",
          name: "title",
          sceneType: "menu",
          width: 30,
          height: 20,
          runtime: { type: "menu", config: { screenType: "title", role: "title" } }
        },
        {
          id: "room-start-menu",
          name: "start_menu",
          sceneType: "menu",
          width: 30,
          height: 20,
          runtime: { type: "menu", config: { screenType: "menu", role: "start" } }
        }
      ],
      settings: {
        general: { gameTitle: "Multi Start Menu Runtime", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "multi-start-menu-runtime.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.kind).toBe("mixed");
    for (const [runtime, projectData] of [
      ["platformer", contract.platformer_project],
      ["isometric", contract.isometric_project],
      ["dungeon_crawler", contract.dungeon_crawler_project]
    ] as const) {
      const script = projectData?.scripts.find((entry) => entry.name === "__gbastudio_start_menu__");
      const scriptIndex = projectData?.scripts.indexOf(script!);
      expect(script?.script).toEqual([
        { op: "scene_stack_push", runtime },
        { op: "warp_runtime", runtime: "menu", room: 1, x: 0, y: 0 }
      ]);
      expect(projectData?.rooms.every((room) => room.on_enter?.some((command) => (
        command.op === "attach_button_event" &&
        command.button === "start" &&
        command.index === scriptIndex &&
        command.override === true
      )))).toBe(true);
    }
  });

  it("keeps Start available for the dungeon map overlay instead of hijacking it", () => {
    const data = project({
      scenas: [
        {
          id: "room-crypt",
          name: "crypt",
          sceneType: "dungeonCrawler",
          width: 16,
          height: 16,
          runtime: {
            type: "dungeonCrawler",
            config: {
              modules: [{ id: "map", enabled: true, settings: {} }]
            }
          }
        },
        {
          id: "room-start-menu",
          name: "start_menu",
          sceneType: "menu",
          width: 30,
          height: 20,
          runtime: { type: "menu", config: { screenType: "menu", role: "start" } }
        }
      ]
    });
    const generalSettings = data.settings as { general: { startScene: string; startSceneType: string } };
    generalSettings.general.startScene = "crypt";
    generalSettings.general.startSceneType = "dungeonCrawler";

    const contract = buildEngineExportProjectContract(data);

    expect(contract.dungeon_crawler_project?.rooms[0]?.on_enter).toEqual([
      expect.objectContaining({ op: "attach_button_event", button: "r", override: true })
    ]);
  });

  it("exports cutscene rooms through the native cutscene project contract", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        {
          id: "room-cut", name: "intro", width: 16, height: 16, sceneType: "cutscene",
          runtime: { type: "cutscene", config: {
            stepDurationFrames: 12, autoAdvance: false, nextSceneIndex: 1, backgroundIndex: 2,
            steps: [{
              id: "opening", dialogueKey: "line_a", eventName: "camera_pan", durationFrames: 90,
              autoAdvance: true, skippable: false, waitForDialogue: true, onSkipEventName: "skip_intro",
              targetSceneIndex: 1, branchVariable: 3, branchValue: 7,
              branchTargetSceneIndex: 1, branchTargetStepIndex: 0
            }]
          } },
          eventBindings: { onInit: "intro_boot" }
        },
        { id: "room-end", name: "ending", width: 16, height: 16, sceneType: "cutscene" }
      ],
      events: [{
        id: "event-boot",
        name: "intro_boot",
        category: "Cena",
        steps: [{ command: "show_dialogue line_a" }]
      }, {
        id: "event-camera", name: "camera_pan", category: "Cena", steps: [{ command: "wait 30" }]
      }, {
        id: "event-skip", name: "skip_intro", category: "Cena", steps: [{ command: "wait 1" }]
      }],
      dialogues: [{
        id: "dialogue-a",
        key: "line_a",
        character: "Narrator",
        text: "Cutscene export"
      }],
      settings: {
        general: { gameTitle: "Scene Profiles", startScene: "intro", startSceneType: "cutscene", exportFolder: "build" },
        build: { romFileName: "scene_profiles.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.kind).toBe("cutscene");
    expect(contract.runtime_contract.adapter_status).toBe("native");
    expect(contract.cutscene_project?.scenes[0]).toMatchObject({
      name: "intro",
      background: -1,
      next_scene: 1,
      on_enter: [{ op: "show_dialogue", dialogue: 0 }],
      steps: [{
        line: 0,
        duration_frames: 90,
        auto_advance: true,
        skippable: false,
        wait_for_dialogue: true,
        script: [{ op: "wait", frames: 30 }],
        on_skip: [{ op: "wait", frames: 1 }],
        target_scene: 1,
        branch: { variable: 3, value: 7, target_scene: 1, target_step: 0 }
      }]
    });
  });

  it("exports named tileset backgrounds for narrative scene selectors", () => {
    const base = project({
      assets: [
        { id: "asset-bg", name: "forest.png", kind: "Tileset", sourcePath: "/tmp/forest.png" },
        { id: "asset-unused", name: "unused-wide.png", kind: "Tileset", sourcePath: "/tmp/unused-wide.png" }
      ],
      scenas: [{
        id: "room-vn", name: "chapter", width: 16, height: 16, sceneType: "visualNovel",
        backgroundAssetName: "forest.png",
        runtime: { type: "visualNovel", config: { backgroundIndex: -1 } }
      }, {
        id: "room-cut", name: "opening", width: 16, height: 16, sceneType: "cutscene",
        backgroundAssetName: "forest.png",
        runtime: { type: "cutscene", config: { backgroundIndex: -1 } }
      }, {
        id: "room-wide", name: "wide-level", width: 80, height: 20, sceneType: "topdown",
        backgroundAssetName: "unused-wide.png"
      }],
      settings: {
        general: { gameTitle: "Narrative Background", startScene: "chapter", startSceneType: "visualNovel", exportFolder: "build" },
        build: { romFileName: "narrative.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });
    const contract = buildEngineExportProjectContract(base);
    expect(contract.visual_novel_project).toMatchObject({
      resource_banks: "asset_pack",
      backgrounds: [{ name: "forest", layer: "bg1", tilemap: "forest", backdrop_color: 0 }],
      scenes: [expect.objectContaining({ background: 0, resource_bank_group: "scene_chapter" })]
    });
    expect(contract.cutscene_project).toMatchObject({
      resource_banks: "asset_pack",
      backgrounds: [{ name: "forest", layer: "bg1", tilemap: "forest", backdrop_color: 0 }],
      scenes: [expect.objectContaining({ background: 0, resource_bank_group: "scene_opening" })]
    });
  });

  it("exports world-map rooms through the native world_map project contract", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-start", name: "start", width: 16, height: 16, sceneType: "worldMap" },
        { id: "room-forest", name: "forest", width: 16, height: 16, sceneType: "worldMap" }
      ],
      editorState: {
        scenaConnections: [{ from: "start", to: "forest", eventName: "go_forest" }]
      },
      events: [{
        id: "event-forest",
        name: "go_forest",
        category: "Cena",
        steps: [{ command: "show_dialogue forest_line" }]
      }],
      dialogues: [{
        id: "dialogue-forest",
        key: "forest_line",
        character: "System",
        text: "Forest selected"
      }],
      settings: {
        general: { gameTitle: "Scene Profiles", startScene: "start", startSceneType: "worldMap", exportFolder: "build" },
        build: { romFileName: "scene_profiles.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.kind).toBe("world_map");
    expect(contract.runtime_contract.adapter_status).toBe("native");
    expect(contract.world_map_project?.nodes[0]).toMatchObject({
      name: "start",
      connections: expect.arrayContaining(["forest"])
    });
  });

  it("keeps paged world-map atlases in ROM and exports full map coordinates and labels", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [{id:"route",name:"route.png",kind:"Background",metadata:{source:"Assets/backgrounds/route.png",kind:"paged_bg",colorMode:"8bpp-indexed",width:480,height:320}}],
      scenas: [{id:"map",name:"mapa_rota",sceneType:"worldMap",width:60,height:40,backgroundAssetName:"route.png",runtime:{type:"worldMap",config:{nodes:[{id:"farol",name:"Farol distante",x:424,y:244,connections:[]}]}}}],
      settings: {...project({}).settings as Record<string,unknown>, general:{gameTitle:"Route",startScene:"mapa_rota",startSceneType:"worldMap",exportFolder:"build"}}
    }));
    expect(contract.world_map_project?.backgrounds?.[0]).toMatchObject({tilemap:"route",source_tiles:"route"});
    expect(contract.world_map_project?.assets?.tile_assets).not.toContain("route");
    expect(contract.world_map_project?.assets?.bg_palettes).toContain("route");
    expect(contract.world_map_project?.nodes[0]).toMatchObject({name:"farol",label:"Farol distante",position:{x:424,y:244}});
    expect(contract.asset_pack?.assets.find(a=>a.name==="route")?.kind).toBe("paged_bg");
  });

  it("exports the authored world-map background and marker sprites instead of a procedural-only map", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-map", name: "coast-map.png", kind: "Background", metadata: { source: "Assets/backgrounds/coast-map.png", width: 256, height: 256 } },
        { id: "asset-cursor", name: "airship.png", kind: "Sprite", metadata: { source: "Assets/sprites/airship.png", width: 16, height: 16 } },
        { id: "asset-marker", name: "lighthouse.png", kind: "Sprite", metadata: { source: "Assets/sprites/lighthouse.png", width: 16, height: 16 } }
      ],
      scenas: [{
        id: "room-map",
        name: "coast",
        width: 32,
        height: 32,
        sceneType: "worldMap",
        backgroundAssetName: "coast-map.png",
        runtime: {
          type: "worldMap",
          config: {
            nodes: [{
              id: "harbor",
              name: "Harbor",
              x: 80,
              y: 96,
              connections: [],
              targetLevel: 0
            }]
          }
        }
      }],
      actors: [
        { id: "actor-cursor", name: "World Map Cursor", roomName: "coast", x: 10, y: 12, spriteSheet: "airship.png", animationName: "idle" },
        { id: "actor-marker", name: "World Map Marker", roomName: "coast", x: 8, y: 9, spriteSheet: "lighthouse.png", animationName: "idle" }
      ],
      animations: [
        { id: "cursor-idle", name: "idle", spriteSheet: "airship.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 6 },
        { id: "marker-idle", name: "idle", spriteSheet: "lighthouse.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 6 }
      ],
      settings: {
        general: { gameTitle: "World Map Visual", startScene: "coast", startSceneType: "worldMap", exportFolder: "build" },
        build: { romFileName: "world-map-visual.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.world_map_project).toMatchObject({
      background: 0,
      resource_banks: "asset_pack",
      assets: {
        bg_palettes: ["coast_map"],
        obj_palettes: ["airship", "lighthouse"],
        tile_assets: ["coast_map", "airship", "lighthouse"],
        sprite_assets: ["airship", "lighthouse"]
      },
      backgrounds: [{
        layer: "bg2",
        tilemap: "coast_map",
        backdrop_from_tilemap_palette: true
      }],
      cursor: { metasprite: { asset: "airship", index: 0 } },
      marker: { metasprite: { asset: "lighthouse", index: 0 } },
      nodes: [expect.objectContaining({ name: "harbor", resource_bank_group: "scene_coast" })]
    });
  });

  it("usa a apresentação da HUD vinculada à batalha para exportar suas barras", () => {
    const data = project({
      scenas: [{
        id: "room-battle",
        name: "arena",
        width: 16,
        height: 16,
        sceneType: "battleRpg",
        hudPresetId: "hud-battle",
        runtime: { type: "battleRpg", config: { showExperienceBar: true, showHealthBars: true } }
      }]
    });
    const baseSettings = data.settings as Record<string, unknown>;
    const baseGeneral = baseSettings.general as Record<string, unknown>;
    data.settings = {
      ...baseSettings,
      general: {
        ...baseGeneral,
        startScene: "arena",
        startSceneType: "battleRpg"
      },
      hudPresets: [{
        id: "hud-battle",
        name: "HUD de batalha",
        description: "HUD",
        backgroundImage: "",
        selectorImage: "",
        font: "",
        position: "Superior",
        width: 240,
        height: 24,
        mode: "standard",
        showExperienceBar: false,
        showHealthBars: false,
        components: []
      }]
    };

    const contract = buildEngineExportProjectContract(data);

    expect(contract.battle_rpg_project?.encounters[0]?.config).toMatchObject({
      show_experience_bar: false,
      show_health_bars: false
    });
  });

  it("exports battle-rpg profiles through the native runtime contract", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-battle", name: "arena", width: 16, height: 16, sceneType: "battleRpg", runtime: {
          type: "battleRpg",
          config: {
            maxPartySize: 3, maxEnemies: 2, turnDelayFrames: 18, escapeEnabled: false,
            experienceMultiplier: 1, typeEffectivenessEnabled: true, criticalHitEnabled: true,
            statusConditionsEnabled: true, abilitiesEnabled: true, showExperienceBar: true,
            showHealthBars: true, battleStyle: "single", weatherEffect: "rain",
            rewardGold: 75, rewardExperience: 50
          }
        } }
      ],
      settings: {
        general: { gameTitle: "Scene Profiles", startScene: "arena", startSceneType: "battleRpg", exportFolder: "build" },
        build: { romFileName: "scene_profiles.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.kind).toBe("battle_rpg");
    expect(contract.runtime_contract.adapter_status).toBe("native");
    expect(contract.project_data).toBe("battle_rpg_project_data.hpp");
    expect(contract.battle_rpg_project?.encounters[0]).toMatchObject({
      name: "arena",
      config: { max_party_size: 3, max_enemies: 2, turn_delay_frames: 18, escape_enabled: false,
        experience_multiplier: 1, type_effectiveness_enabled: true, critical_hit_enabled: true,
        status_conditions_enabled: true, abilities_enabled: true, show_experience_bar: true,
        show_health_bars: true, battle_style: "single", weather_effect: "rain" },
      party_count: 3,
      enemy_count: 2,
      party: expect.arrayContaining([expect.objectContaining({ name: "Party 1", unit: { max_hp: 24, attack: 7, defense: 2, speed: 5 } })]),
      enemies: expect.arrayContaining([expect.objectContaining({ name: "Enemy 1", unit: { max_hp: 12, attack: 4, defense: 1, speed: 3 } })]),
      rewards: { gold: 75, experience: 50 }
    });
  });

  it("exports room actors as named battle participants with authored abilities", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-battle", name: "arena", width: 16, height: 16, sceneType: "battleRpg" }],
      actors: [
        { id: "hero", name: "Hero", roomName: "arena", x: 1, y: 1, battle: { side: "party", maxHp: 40, attack: 12, defense: 5, speed: 8, abilities: ["attack", "magic", "heal", "defend"] } },
        { id: "slime", name: "Slime", roomName: "arena", x: 4, y: 2, battle: { side: "enemy", maxHp: 15, attack: 6, defense: 2, speed: 4, abilities: ["attack", "magic", "heal", "defend"] } }
      ],
      settings: {
        general: { gameTitle: "Battle", startScene: "arena", startSceneType: "battleRpg", exportFolder: "build" },
        build: { romFileName: "battle.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.battle_rpg_project?.encounters[0]).toMatchObject({
      party_count: 1,
      enemy_count: 1,
      party: [{ name: "Hero", unit: { max_hp: 40, attack: 12, defense: 5, speed: 8 }, abilities: [
        { kind: "attack", power: 0 },
        { kind: "magic", power: 12 },
        { kind: "heal", power: 10 },
        { kind: "defend", power: 0 }
      ] }],
      enemies: [{ name: "Slime", unit: { max_hp: 15, attack: 6, defense: 2, speed: 4 }, abilities: [
        { kind: "attack", power: 0 },
        { kind: "magic", power: 6 },
        { kind: "heal", power: 3 },
        { kind: "defend", power: 0 }
      ] }]
    });
  });

  it("exporta a escala visual do participante da batalha", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-battle", name: "arena", width: 16, height: 16, sceneType: "battleRpg" }],
      actors: [{
        id: "hero",
        name: "Hero",
        roomName: "arena",
        battle: { side: "party", maxHp: 40, attack: 12, defense: 5, speed: 8, spriteScale: 2, abilities: ["attack", "magic"] }
      }],
      settings: {
        general: { gameTitle: "Battle Scale", startScene: "arena", startSceneType: "battleRpg", exportFolder: "build" },
        build: { romFileName: "battle-scale.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.battle_rpg_project?.encounters[0]?.party[0]).toMatchObject({ sprite_scale: 2 });
  });

  it("exports an authored Battle RPG arena and participant metasprites", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-arena", name: "arena.png", kind: "Background", metadata: { source: "Assets/backgrounds/arena.png", width: 240, height: 160 } },
        { id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png", width: 32, height: 32 } },
        { id: "asset-enemy", name: "enemy.png", kind: "Sprite", metadata: { source: "Assets/sprites/enemy.png", width: 32, height: 32 } }
      ],
      scenas: [{
        id: "room-battle",
        name: "arena",
        width: 30,
        height: 20,
        sceneType: "battleRpg",
        backgroundAssetName: "arena.png",
        runtime: { type: "battleRpg", config: { maxPartySize: 1, maxEnemies: 1 } }
      }],
      actors: [
        {
          id: "hero",
          name: "Hero",
          roomName: "arena",
          x: 7,
          y: 13,
          spriteSheet: "hero.png",
          animationName: "idle",
          battle: { side: "party", maxHp: 40, attack: 12, defense: 5, speed: 8, abilities: ["attack"] }
        },
        {
          id: "enemy",
          name: "Enemy",
          roomName: "arena",
          x: 22,
          y: 8,
          spriteSheet: "enemy.png",
          animationName: "idle",
          battle: { side: "enemy", maxHp: 24, attack: 7, defense: 3, speed: 5, abilities: ["attack"] }
        }
      ],
      animations: [
        { id: "hero-idle", name: "idle", spriteSheet: "hero.png", frameWidth: 32, frameHeight: 32, frameCount: 1, fps: 6 },
        { id: "enemy-idle", name: "idle", spriteSheet: "enemy.png", frameWidth: 32, frameHeight: 32, frameCount: 1, fps: 6 }
      ],
      settings: {
        general: { gameTitle: "Battle Visual", startScene: "arena", startSceneType: "battleRpg", exportFolder: "build" },
        build: { romFileName: "battle-visual.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.battle_rpg_project).toMatchObject({
      resource_banks: "asset_pack",
      assets: {
        bg_palettes: ["arena"],
        obj_palettes: ["hero", "enemy"],
        tile_assets: ["arena", "hero", "enemy"],
        sprite_assets: ["hero", "enemy"]
      },
      backgrounds: [{
        layer: "bg2",
        tilemap: "arena",
        backdrop_from_tilemap_palette: true
      }],
      encounters: [{
        name: "arena",
        background: 0,
        resource_bank_group: "scene_arena",
        party: [expect.objectContaining({ name: "Hero", metasprite: { asset: "hero", index: 0 } })],
        enemies: [expect.objectContaining({ name: "Enemy", metasprite: { asset: "enemy", index: 0 } })]
      }]
    });
  });

  it("exports dungeon crawler rooms through the native runtime contract", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-dungeon", name: "crypt", width: 16, height: 16, sceneType: "dungeonCrawler",
        backgroundAssetName: "crypt.png",
        collisionTypes: Array.from({ length: 16 * 16 }, (_item, index) => index < 16 ? "solid" : "free"),
        runtime: {
          type: "dungeonCrawler",
          config: {
            stepDurationMs: 200,
            turnDurationMs: 100,
            allowBackstep: false,
            viewDistance: 7,
            playerStart: { x: 8, y: 12, direction: "up" }
          }
        },
        eventBindings: { onInit: "crypt_enter" }
      }],
      assets: [
        { id: "asset-crypt", name: "crypt.png", kind: "Background", metadata: { source: "Assets/backgrounds/crypt.png", width: 128, height: 128 } },
        { id: "asset-watcher", name: "watcher.png", kind: "Sprite", metadata: { source: "Assets/sprites/watcher.png" } },
        { id: "asset-sentinel", name: "sentinel.png", kind: "Sprite", metadata: { source: "Assets/sprites/sentinel.png", role: "dungeon-depth-actor" } }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "crypt", x: 8, y: 12, direction: "up" },
        { id: "actor-watcher", name: "Watcher", roomName: "crypt", x: 8, y: 6, spriteSheet: "watcher.png", animationName: "idle" },
        { id: "actor-sentinel", name: "Sentinel", roomName: "crypt", x: 7, y: 5, spriteSheet: "sentinel.png", animationName: "sentinel_far" }
      ],
      animations: [
        { id: "watcher-idle", name: "idle", spriteSheet: "watcher.png", frameWidth: 32, frameHeight: 32, frameCount: 1, fps: 6 },
        ...["far", "mid", "near"].map((variant, index) => ({
          id: `sentinel-${variant}`,
          name: `sentinel_${variant}`,
          spriteSheet: "sentinel.png",
          frameWidth: 64,
          frameHeight: 64,
          frameCount: 1,
          fps: 1,
          frames: [{ tiles: [{ x: 0, y: 0, sliceX: index * 64, sliceY: 0 }] }]
        }))
      ],
      spriteReferenceImages: [{ assetName: "sentinel.png", imageWidth: 192, imageHeight: 64 }],
      triggers: [{ id: "crypt-exit", name: "Exit", roomName: "crypt", x: 8, y: 1, width: 1, height: 1, eventBindings: { onEnter: "crypt_exit" } }],
      events: [
        { id: "crypt-enter", name: "crypt_enter", category: "Cena", steps: [{ command: "set_variable mode 1" }] },
        { id: "crypt-exit-event", name: "crypt_exit", category: "Trigger", steps: [{ command: "set_variable escaped 1" }] }
      ],
      settings: {
        general: { gameTitle: "Dungeon", startScene: "crypt", startSceneType: "dungeonCrawler", exportFolder: "build" },
        build: { romFileName: "dungeon.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));
    expect(contract.kind).toBe("dungeon_crawler");
    expect(contract.runtime_contract.adapter_status).toBe("native");
    expect(contract.project_data).toBe("dungeon_crawler_project_data.hpp");
    expect(contract.dungeon_crawler_project?.rooms[0]).toMatchObject({
      name: "crypt",
      width_tiles: 16,
      height_tiles: 16,
      config: { step_duration_frames: 12, turn_duration_frames: 6, allow_backstep: false, view_distance: 7 },
      player_start: { x: 8, y: 12, direction: "north" }
    });
    expect(contract.dungeon_crawler_project).toMatchObject({
      resource_banks: "asset_pack",
      assets: { bg_palettes: expect.any(Array), obj_palettes: expect.any(Array), tile_assets: expect.any(Array) },
      backgrounds: [{
        layer: "bg2",
        tilemap: expect.any(String),
        backdrop_from_tilemap_palette: true
      }]
    });
    expect(contract.dungeon_crawler_project?.rooms[0]).toMatchObject({
      background: 0,
      resource_bank_group: "scene_crypt",
      on_enter: [{ op: "set_variable", variable: expect.any(Number), value: 1 }],
      triggers: [{ area: { x: 8, y: 1, width: 1, height: 1 }, on_enter: [{ op: "set_variable", variable: expect.any(Number), value: 1 }] }],
      actors: [
        { name: "Watcher", position: { x: 8, y: 6 }, metasprite: { asset: expect.any(String), index: expect.any(Number) } },
        {
          name: "Sentinel",
          depth_metasprites: {
            far: { asset: expect.any(String), index: 0 },
            mid: { asset: expect.any(String), index: 1 },
            near: { asset: expect.any(String), index: 2 }
          }
        }
      ]
    });
  });

  it("escolhe uma célula livre quando o Dungeon Crawler ainda não tem player autoral", () => {
    const collisionTypes = Array.from({ length: 16 * 16 }, () => "solid");
    collisionTypes[(3 * 16) + 4] = "free";
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-dungeon",
        name: "crypt",
        width: 16,
        height: 16,
        sceneType: "dungeonCrawler",
        playerActorName: "",
        backgroundAssetName: "crypt.png",
        collisionTypes,
        runtime: { type: "dungeonCrawler", config: {} }
      }],
      assets: [{
        id: "asset-crypt",
        name: "crypt.png",
        kind: "Background",
        metadata: { source: "Assets/backgrounds/crypt.png", width: 128, height: 128 }
      }],
      settings: {
        general: { gameTitle: "Dungeon", startScene: "crypt", startSceneType: "dungeonCrawler", exportFolder: "build" },
        build: { romFileName: "dungeon.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.dungeon_crawler_project?.rooms[0]?.player_start).toEqual({
      x: 4,
      y: 3,
      direction: "north"
    });
  });

  it("exports racing rooms through the native runtime contract", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-race", name: "track", width: 32, height: 32, sceneType: "racing",
        playerActorName: "Canonical_racing_Actor",
        backgroundAssetName: "track.png",
        collisionTypes: Array.from({ length: 32 * 32 }, (_item, index) => index % 32 < 2 || index % 32 > 29 ? "solid" : "free"),
        runtime: {
          type: "racing",
          config: {
            maxSpeed: 6,
            acceleration: 10,
            brakePower: 14,
            steeringSpeed: 2.5,
            presentation: "pseudo3d",
            perspectiveCamera: { height: 40, distance: 72, focalLength: 110 },
            topdownTrack: {
              cameraDeadZoneX: 16,
              cameraDeadZoneY: 24,
              startHeading: 4,
              checkpoints: [
                { id: "start", x: 64, y: 224, width: 80, height: 12 },
                { id: "finish", x: 64, y: 40, width: 80, height: 12 }
              ]
            },
            pseudo3dVisuals: {
              horizonY: 48,
              panoramaBackgroundId: "track-sky.png",
              floorTilemapId: "track-floor.png",
              minimapAssetId: "track-minimap.png"
            }
          }
        },
        eventBindings: { onInit: "race_enter" }
      }],
      assets: [
        { id: "asset-track", name: "track.png", kind: "Background", metadata: { source: "Assets/backgrounds/track.png", width: 256, height: 256 } },
        { id: "asset-track-sky", name: "track-sky.png", kind: "Background", metadata: { source: "Assets/backgrounds/track-sky.png", width: 512, height: 256, colorMode: "4bpp" } },
        { id: "asset-track-floor", name: "track-floor.png", kind: "Background", metadata: { source: "Assets/backgrounds/track-floor.png", width: 512, height: 512, colorMode: "4bpp" } },
        { id: "asset-track-minimap", name: "track-minimap.png", kind: "Background", metadata: { source: "Assets/backgrounds/track-minimap.png", width: 256, height: 256, colorMode: "4bpp" } },
        { id: "asset-car", name: "car.png", kind: "Sprite", metadata: { source: "Assets/sprites/car.png" } }
      ],
      actors: [
        { id: "actor-player", name: "Canonical_racing_Actor", roomName: "track", x: 8, y: 28, spriteSheet: "car.png", animationName: "car_idle" },
        { id: "actor-rival", name: "Rival", roomName: "track", x: 6, y: 16, spriteSheet: "car.png", animationName: "car_drive" }
      ],
      animations: [
        { id: "car-idle", name: "car_idle", spriteSheet: "car.png", frameWidth: 16, frameHeight: 32, frameCount: 1, fps: 6, sourceFrames: [0] },
        { id: "car-drive", name: "car_drive", spriteSheet: "car.png", frameWidth: 16, frameHeight: 32, frameCount: 2, fps: 10, sourceFrames: [1, 2] }
      ],
      triggers: [{ id: "finish", name: "Finish", roomName: "track", x: 7, y: 2, width: 2, height: 1, eventBindings: { onEnter: "finish_enter" } }],
      events: [
        { id: "race-enter", name: "race_enter", category: "Cena", steps: [{ command: "set_variable mode 2" }] },
        { id: "finish-enter", name: "finish_enter", category: "Trigger", steps: [{ command: "set_variable lap 1" }] }
      ],
      settings: {
        general: { gameTitle: "Race", startScene: "track", startSceneType: "racing", exportFolder: "build" },
        build: { romFileName: "race.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));
    expect(contract.racing_project?.rooms[0]).toHaveProperty("perspective_camera", {height:40,distance:72,focal_length:110});
    expect(contract.racing_project?.player?.animations?.drive?.frame_indices).toHaveLength(2);
    expect(contract.racing_project?.backgrounds).toBeUndefined();
    expect(contract.kind).toBe("racing");
    expect(contract.runtime_contract.adapter_status).toBe("native");
    expect(contract.project_data).toBe("racing_project_data.hpp");
    expect(contract.racing_project?.rooms[0]).toMatchObject({
      name: "track",
      width_tiles: 32,
      height_tiles: 32,
      config: {
        max_speed_x256: 1536,
        acceleration_x256_per_second: 2560,
        brake_power_x256_per_second: 3584,
        steering_speed_x256: 640
      },
      player_start_pixels: { x: 68, y: 228 }
    });
    expect(contract.racing_project).toMatchObject({
      resource_banks: "asset_pack",
      assets: { bg_palettes: expect.any(Array), obj_palettes: expect.any(Array), tile_assets: expect.any(Array) },
      player: {
        idle_metasprite: { asset: expect.any(String), index: expect.any(Number) },
        drive_metasprite: { asset: expect.any(String), index: expect.any(Number) }
      },
      pseudo3d_visuals: [{
        horizon_y: 48,
        panorama: "track_sky",
        floor: "track_floor",
        minimap: "track_minimap"
      }]
    });
    expect(contract.racing_project?.assets).toMatchObject({
      bg_palettes: expect.arrayContaining(["track_sky", "track_floor", "track_minimap"]),
      tile_assets: expect.arrayContaining(["track_sky", "track_minimap"])
    });
    expect(contract.racing_project?.assets?.tile_assets).not.toContain("track_floor");
    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "track_floor",
        kind: "affine_bg",
        background_bpp: 8,
        bank_group: "scene_track",
        bank_groups: ["scene_track"]
      }),
      expect.objectContaining({
        name: "track_minimap",
        kind: "bg",
        bank_group: "scene_track",
        bank_groups: ["scene_track"]
      })
    ]));
    expect(contract.racing_project?.rooms[0]).toMatchObject({
      resource_bank_group: "scene_track",
      topdown_track: {
        camera_dead_zone: { x: 16, y: 24 },
        start_heading: 4,
        checkpoints: [
          { id: "start", x: 64, y: 224, width: 80, height: 12 },
          { id: "finish", x: 64, y: 40, width: 80, height: 12 }
        ]
      },
      on_enter: [{ op: "set_variable", variable: expect.any(Number), value: 2 }],
      triggers: [{ area: { x: 56, y: 16, width: 16, height: 8 }, on_enter: [{ op: "set_variable", variable: expect.any(Number), value: 1 }] }],
      actors: [{ name: "Rival", position_pixels: { x: 52, y: 132 }, metasprite: { asset: expect.any(String), index: expect.any(Number) } }]
    });
  });

  it("scopes dungeon crawler and racing visual assets to their own runtimes", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-dungeon", name: "crypt", width: 16, height: 16, sceneType: "dungeonCrawler", backgroundAssetName: "crypt.png" },
        { id: "room-racing", name: "track", width: 16, height: 32, sceneType: "racing", backgroundAssetName: "track.png" }
      ],
      assets: [
        { id: "asset-crypt", name: "crypt.png", kind: "Background", metadata: { source: "Assets/backgrounds/crypt.png" } },
        { id: "asset-track", name: "track.png", kind: "Background", metadata: { source: "Assets/backgrounds/track.png" } },
        { id: "asset-watcher", name: "watcher.png", kind: "Sprite", metadata: { source: "Assets/sprites/watcher.png" } },
        { id: "asset-car", name: "car.png", kind: "Sprite", metadata: { source: "Assets/sprites/car.png" } }
      ],
      actors: [
        { id: "actor-watcher", name: "Watcher", roomName: "crypt", x: 8, y: 6, spriteSheet: "watcher.png", animationName: "idle" },
        { id: "actor-player", name: "Player", roomName: "track", x: 8, y: 28, spriteSheet: "car.png", animationName: "idle" },
        { id: "actor-rival", name: "Rival", roomName: "track", x: 6, y: 16, spriteSheet: "car.png", animationName: "drive" }
      ],
      animations: [
        { id: "watcher-idle", name: "idle", spriteSheet: "watcher.png", frameWidth: 32, frameHeight: 32, frameCount: 1 },
        { id: "car-idle", name: "idle", spriteSheet: "car.png", frameWidth: 16, frameHeight: 32, frameCount: 1 },
        { id: "car-drive", name: "drive", spriteSheet: "car.png", frameWidth: 16, frameHeight: 32, frameCount: 1 }
      ],
      settings: {
        general: { gameTitle: "Advanced", startScene: "crypt", startSceneType: "dungeonCrawler", exportFolder: "build" },
        build: { romFileName: "advanced.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.kind).toBe("mixed");
    expect(contract.dungeon_crawler_project?.assets).toMatchObject({
      bg_palettes: ["crypt"],
      obj_palettes: ["watcher"],
      tile_assets: ["crypt", "watcher"],
      sprite_assets: ["watcher"]
    });
    expect(contract.racing_project?.assets).toMatchObject({
      bg_palettes: ["track"],
      obj_palettes: ["car"],
      tile_assets: ["track", "car"],
      sprite_assets: ["car"]
    });
  });

  it("omits an unbacked racing resource group", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-racing-empty",
        name: "circuito_final",
        width: 40,
        height: 30,
        sceneType: "racing",
        backgroundAssetName: ""
      }],
      settings: {
        general: { gameTitle: "Race", startScene: "circuito_final", startSceneType: "racing", exportFolder: "build" },
        build: { romFileName: "race.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.racing_project?.rooms[0]).not.toHaveProperty("resource_bank_group");
  });

  it("keeps affine pseudo-3D floors out of regular mixed-runtime tile asset tables", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-harbor", name: "harbor", width: 20, height: 18, sceneType: "topdown", backgroundAssetName: "harbor.png" },
        {
          id: "room-race", name: "track", width: 16, height: 32, sceneType: "racing", backgroundAssetName: "track-sky.png",
          runtime: {
            type: "racing",
            config: {
              presentation: "pseudo3d",
              pseudo3dVisuals: {
                horizonY: 48,
                panoramaBackgroundId: "track-sky.png",
                floorTilemapId: "track-floor.png",
                minimapAssetId: "track-minimap.png"
              }
            }
          }
        }
      ],
      assets: [
        { id: "asset-harbor", name: "harbor.png", kind: "Background", metadata: { source: "Assets/backgrounds/harbor.png" } },
        { id: "asset-track-sky", name: "track-sky.png", kind: "Background", metadata: { source: "Assets/backgrounds/track-sky.png", colorMode: "4bpp" } },
        { id: "asset-track-floor", name: "track-floor.png", kind: "Background", metadata: { source: "Assets/backgrounds/track-floor.png", colorMode: "4bpp" } },
        { id: "asset-track-minimap", name: "track-minimap.png", kind: "Background", metadata: { source: "Assets/backgrounds/track-minimap.png", colorMode: "4bpp" } }
      ],
      settings: {
        general: { gameTitle: "Mixed P3D", startScene: "harbor", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "mixed-p3d.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.kind).toBe("mixed");
    expect(contract.topdown_project?.assets?.tile_assets).not.toContain("track_floor");
    expect(contract.racing_project?.assets?.bg_palettes).toContain("track_floor");
    expect(contract.racing_project?.assets?.tile_assets).not.toContain("track_floor");
  });

  it("throws a clear contract error for call_event targets that do not exist", () => {
    expect(() => buildEngineExportProjectContract(project({
      events: [{ id: "event-room", name: "room_boot", category: "Cena", steps: [{ command: "call_event missing_event" }] }]
    }))).toThrow("Contrato de migracao invalido: events");
  });

  it("does not emit dispatcher commands into a standalone point-click export", () => {
    const data = project({
      scenas: [
        { name: "start", width: 30, height: 20, sceneType: "pointAndClick" },
        { name: "other", width: 30, height: 20, sceneType: "pointAndClick" }
      ],
      events: [{ id: "route", name: "route", roomName: "start", category: "Cena", steps: [{ command: "change_scene other" }] }]
    });
    (data.settings as any).general.startSceneType = "pointAndClick";
    const contract = buildEngineExportProjectContract(data);
    expect(contract.runtime_profile).toBe("point_click");
    const commands = contract.point_click_project!.scripts!.find(s => s.name === "route")!.script;
    expect(commands.some(c => c.op === "warp_runtime")).toBe(false);
  });

  it("uses persisted connection exit and entry areas for portal export", () => {
    const data = project({
      scenas: [
        { name: "field", width: 40, height: 24 },
        { name: "cave", width: 32, height: 20 }
      ],
      editorState: {
        scenaConnections: [{
          from: "field",
          to: "cave",
          eventName: "field_to_cave",
          exit: { x: 38, y: 22, width: 2, height: 1 },
          entry: { x: 1, y: 9, width: 2, height: 2 }
        }]
      },
      settings: {
        general: { gameTitle: "Export", startScene: "field", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "export.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    const contract = buildEngineExportProjectContract(data);
    const fieldRoom = contract.topdown_project?.rooms.find((room) => room.name === "field");

    expect(fieldRoom?.portals).toEqual([{
      area: { x: 304, y: 176, width: 16, height: 8 },
      target_room: 1,
      target_position: { x: 24, y: 80 },
      target_direction: "right"
    }]);
  });

  it.each([
    ["fade", "visual_effect", "visual_effect", "fade"],
    ["fade-color", "visual_effect", "visual_effect", "color_fade"],
    ["wipe", "visual_effect", "visual_effect", "mask"],
    ["mosaic", "visual_effect", "visual_effect", "mosaic"],
    ["slide", "visual_effect", "visual_effect", "push"],
    ["crossfade", "visual_effect", "visual_effect", "color_fade"]
  ] as const)("keeps the implicit topdown portal warp under the %s transition", (style, coverOp, revealOp, effect) => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { name: "field", width: 40, height: 24 },
        { name: "cave", width: 32, height: 20 }
      ],
      editorState: {
        scenaConnections: [{
          from: "field",
          to: "cave",
          transition: { style, durationFrames: 8, fadeOut: true, fadeIn: true }
        }]
      },
      settings: {
        general: { gameTitle: "Transition Export", startScene: "field", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "transition-export.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    const script = contract.topdown_project?.rooms[0]?.portals?.[0]?.script ?? [];
    expect(script[0]?.op).toBe(coverOp);
    expect(script).toContainEqual({ op: "warp", room: 1, x: 8, y: 80 });
    expect(script.at(-1)?.op).toBe(revealOp);
    if (effect) {
      expect(script[0]).toMatchObject({ effect });
      expect(script.at(-1)).toMatchObject({ effect });
    }
    expect(script).toHaveLength(4);
  });

  it("returns a structured error instead of throwing for invalid migration contracts", () => {
    const result = prepareEngineProjectExport({
      assets: [{ id: "", name: "bad.png", kind: "Sprite" }],
      scenas: [{ name: "start", width: 20, height: 18 }],
      events: [{ name: "bad", category: "Cena", command: "change_scene missing" }],
      settings: {}
    });

    expect(result.generated).toBeUndefined();
    expect(result.error).toBe("Contrato de migracao invalido: workspace, files, events, settings");
  });

  it("exports trigger on_enter and on_leave scripts from editor bindings", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-1", name: "start", width: 20, height: 18 }],
      triggers: [{
        id: "trigger-door",
        name: "Door",
        roomName: "start",
        x: 10,
        y: 6,
        width: 2,
        height: 2,
        eventName: "door_enter",
        onEnterEventName: "door_enter",
        onLeaveEventName: "door_leave"
      }],
      dialogues: [
        { key: "intro", text: "Ola" },
        { key: "bye", text: "Ate logo" }
      ],
      events: [
        { id: "event-enter", name: "door_enter", category: "Trigger", steps: [{ command: "show_dialogue intro" }] },
        { id: "event-leave", name: "door_leave", category: "Trigger", steps: [{ command: "show_dialogue bye" }] }
      ]
    }));

    const trigger = contract.topdown_project?.rooms[0]?.triggers?.[0];
    expect(trigger?.on_enter).toEqual([{ op: "show_dialogue", dialogue: 0 }]);
    expect(trigger?.on_leave).toEqual([{ op: "show_dialogue", dialogue: 1 }]);
  });

  it("builds semantic sprite asset pack refs for actors with imported sprite sheets", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "start", x: 5, y: 7, spriteSheet: "hero.png", animationName: "idle" }
      ],
      animations: [
        {
          id: "anim-idle",
          name: "idle",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 32,
          frameCount: 2,
          frames: [
            { frameIndex: 0, tiles: [{ sourceSheet: "hero.png", sliceX: 0, sliceY: 0, tileWidth: 8, tileHeight: 8, x: 0, y: 0 }] },
            { frameIndex: 1, tiles: [{ sourceSheet: "hero.png", sliceX: 16, sliceY: 0, tileWidth: 8, tileHeight: 8, x: 0, y: 0 }] }
          ]
        }
      ]
    }));

    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "obj",
        name: "hero",
        png: "assets/sprite/hero.png",
        sprite_width: 16,
        sprite_height: 32,
        header: "hero.hpp"
      })
    ]));
    expect(contract.topdown_project).toMatchObject({
      resource_banks: "asset_pack",
      assets: {
        bg_palettes: [],
        obj_palettes: ["hero"],
        tile_assets: ["hero"]
      },
      player: {
        metasprite: { asset: "hero", index: 0 },
        animation: "idle",
        animations: [{
          name: "idle",
          asset: "hero",
          frame_indices: [0, 1],
          durations: [6, 6],
          loops: true
        }],
        emit_animation_fallback: false
      }
    });
    expect(contract.requires.features).toContain("asset_export_semantic_actor_refs");
  });

  it("builds semantic tileset asset pack refs and room visual_tilemap remapping", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-tiles", name: "tiles_field.png", kind: "Tileset", metadata: { source: "Assets/tiles/tiles_field.png" } }
      ],
      scenas: [
        { id: "room-1", name: "start", width: 4, height: 4, backgroundAssetName: "tiles_field.png", tilemap: [1, 2, 0, 0, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
      ]
    }));

    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "bg",
        name: "tiles_field",
        png: "assets/image/tiles_field.png",
        header: "tiles_field.hpp"
      })
    ]));
    expect(contract.topdown_project).toMatchObject({
      resource_banks: "asset_pack",
      assets: {
        bg_palettes: ["tiles_field"],
        tile_assets: ["tiles_field"]
      },
      backgrounds: [{
        layer: "bg2",
        tilemap: "tiles_field",
        scroll: { x: 0, y: 0 },
        parallax: { x: 256, y: 256 }
      }],
      rooms: [{
        name: "start",
        visual_tilemap: "tiles_field",
        visual_tiles: [1, 2, 0, 0, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      }]
    });
    expect(contract.requires.features).toContain("asset_export_semantic_asset_refs");
  });
});

describe("resolveSmokeEngineExportRoot", () => {
  it("returns a non-empty smoke export root from the environment", () => {
    expect(resolveSmokeEngineExportRoot({ GBA_STUDIO_SMOKE_ENGINE_EXPORT_ROOT: " /tmp/export-root " })).toBe("/tmp/export-root");
  });

  it("ignores missing or blank smoke export roots", () => {
    expect(resolveSmokeEngineExportRoot({})).toBeNull();
    expect(resolveSmokeEngineExportRoot({ GBA_STUDIO_SMOKE_ENGINE_EXPORT_ROOT: "   " })).toBeNull();
  });
});

describe("backlog export slices", () => {
  it("exports settings.topdown.walkSpeed as topdown player.speed", () => {
    const base = {
      settings: {
        general: { gameTitle: "Speed", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "speed.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        topdown: { walkSpeed: 1 }
      },
      actors: [{ id: "actor-player", name: "Player", roomName: "start", x: 2, y: 2 }]
    };
    const slow = buildEngineExportProjectContract(project(base));
    const fast = buildEngineExportProjectContract(project({
      ...base,
      settings: {
        ...base.settings,
        topdown: { walkSpeed: 1.75 }
      }
    }));

    expect(slow.topdown_project?.player.speed).toBe(1);
    expect(fast.topdown_project?.player.speed).toBe(1.75);
    expect(fast.topdown_project?.player.speed).not.toBe(slow.topdown_project?.player.speed);
  });

  it("compiles set_actor_animation_frame into engine ops for ROM animation evidence", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-town", name: "town", width: 20, height: 18, playerActorName: "Player" }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "town", x: 5, y: 7 },
        { id: "actor-guide", name: "Guide", roomName: "town", x: 9, y: 4 }
      ],
      events: [{
        id: "event-anim",
        name: "anim_boot",
        category: "Cena",
        steps: [
          { command: "set_actor_animation Guide wave" },
          { command: "set_actor_animation_frame Guide 2" }
        ]
      }],
      settings: {
        general: { gameTitle: "Anim", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "anim.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      {
        name: "anim_boot",
        script: [
          { op: "set_actor_animation", actor: 0, animation: "wave" },
          { op: "set_actor_animation_frame", actor: 0, frame: 2 }
        ]
      }
    ]));
  });

  it("exports settings.topdown.interactButton as player.interact_button", () => {
    const contract = buildEngineExportProjectContract(project({
      settings: {
        general: { gameTitle: "Interact", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "interact.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        topdown: { interactButton: "B" }
      },
      actors: [{ id: "actor-player", name: "Player", roomName: "start", x: 2, y: 2 }]
    }));

    expect(contract.topdown_project?.player.interact_button).toBe("B");
  });

  it("exports settings.platformer.interactButton on platformer_project.interact_button", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-platformer", name: "stage_1", width: 20, height: 16, sceneType: "platformer" }],
      actors: [{ id: "actor-player", name: "Player", roomName: "stage_1", x: 2, y: 10 }],
      settings: {
        general: { gameTitle: "InteractP", startScene: "stage_1", startSceneType: "platformer", exportFolder: "build" },
        build: { romFileName: "interactp.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        platformer: { interactButton: "Start" }
      }
    }));

    expect(contract.platformer_project?.interact_button).toBe("Start");
  });

  it("exports settings.platformer jump and run buttons on platformer_project", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-platformer", name: "stage_1", width: 20, height: 16, sceneType: "platformer" }],
      actors: [{ id: "actor-player", name: "Player", roomName: "stage_1", x: 2, y: 10 }],
      settings: {
        general: { gameTitle: "ButtonsP", startScene: "stage_1", startSceneType: "platformer", exportFolder: "build" },
        build: { romFileName: "buttonsp.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        platformer: { jumpButton: "A", runButton: "Select" }
      }
    }));

    expect(contract.platformer_project?.jump_button).toBe("A");
    expect(contract.platformer_project?.run_button).toBe("Select");
  });

  it("exports settings.topdown.gridSize as player and npc size pixels", () => {
    const contract8 = buildEngineExportProjectContract(project({
      settings: {
        general: { gameTitle: "Grid8", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "grid8.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        topdown: { gridSize: "8 px" }
      },
      actors: [{ id: "actor-player", name: "Player", roomName: "start", x: 2, y: 2 }]
    }));
    const contract16 = buildEngineExportProjectContract(project({
      settings: {
        general: { gameTitle: "Grid16", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "grid16.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        topdown: { gridSize: "16 px" }
      },
      actors: [{ id: "actor-player", name: "Player", roomName: "start", x: 2, y: 2 }]
    }));

    expect(contract8.topdown_project?.player.size).toEqual({ x: 8, y: 8 });
    expect(contract16.topdown_project?.player.size).toEqual({ x: 16, y: 16 });
  });

  it("compiles tile, actor speed and save guard commands into engine ops", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-town", name: "town", width: 20, height: 18, playerActorName: "Player" }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "town", x: 5, y: 7 },
        { id: "actor-guide", name: "Guide", roomName: "town", x: 9, y: 4 }
      ],
      events: [{
        id: "event-lot3",
        name: "lot3_boot",
        category: "Cena",
        steps: [
          { command: "if_save_game" },
          { command: "load_game" },
          { command: "replace_tile 4 6 17 bg2" },
          { command: "set_actor_movement_speed Guide 80" },
          { command: "wait_actor_animation Guide" }
        ]
      }],
      settings: {
        general: { gameTitle: "Lot3", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "lot3.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      {
        name: "lot3_boot",
        script: [
          { op: "jump_if_save_exists", slot: 0, offset: 2 },
          { op: "jump", offset: 2 },
          { op: "load_game" },
          { op: "replace_tile", x: 4, y: 6, tile: 17, layer: "bg2", count: 1 },
          { op: "set_actor_speed", actor: 0, speed: 80 },
          { op: "wait_actor_animation", actor: 0 }
        ]
      }
    ]));
  });

  it("preserva nomes de atores com espacos nos comandos de evento", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-opening", name: "opening", width: 20, height: 18, playerActorName: "Player" }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "opening", x: 5, y: 7 },
        { id: "actor-airship", name: "Aeronave · Abertura", roomName: "opening", x: 9, y: 4 }
      ],
      events: [{
        id: "event-opening",
        name: "opening_boot",
        category: "Cena",
        steps: [
          { command: "wait_actor_animation Aeronave · Abertura" },
          { command: "move_actor Aeronave · Abertura 1 0" }
        ]
      }],
      settings: {
        general: { gameTitle: "Opening", startScene: "opening", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "opening.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      {
        name: "opening_boot",
        script: [
          { op: "wait_actor_animation", actor: 0 },
          { op: "move_actor", actor: 0, x: 8, y: 0 }
        ]
      }
    ]));
  });

  it("exports complete Link Cable host, join, transfer, close and timeout commands", () => {
    const baseSettings = project({}).settings as Record<string, Record<string, unknown>>;
    const contract = buildEngineExportProjectContract(project({
      variables: [{ name: "net.recebido" }],
      scenas: [{
        name: "start",
        sceneType: "topdown",
        width: 20,
        height: 18,
        runtime: {
          type: "topdown",
          config: {
            capabilities: [{ id: "link_multiplayer", enabled: true, settings: {} }]
          }
        }
      }],
      settings: {
        ...baseSettings,
        runtimeCapabilities: { link: { enabled: true } }
      },
      events: [
        { id: "event-connected", name: "conectado", category: "Multijogador", steps: [{ command: "set_variable net.recebido 1" }] },
        {
          id: "event-network",
          name: "network_boot",
          category: "Multijogador",
          steps: [
            { command: "multiplayer_host conectado 180" },
            { command: "multiplayer_join conectado 90" },
            { command: "multiplayer_transfer net.recebido 255 45" },
            { command: "multiplayer_close" }
          ]
        }
      ]
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([{
      name: "network_boot",
      script: [
        { op: "link_host", script: 0, timeout_frames: 180 },
        { op: "link_join", script: 0, timeout_frames: 90 },
        { op: "link_transfer", variable: 0, value: 255, timeout_frames: 45 },
        { op: "link_close" }
      ]
    }]));
  });

  it("exports rumble and 4-player multiplayer commands to native ops", () => {    const baseSettings = project({}).settings as Record<string, Record<string, unknown>>;
    const contract = buildEngineExportProjectContract(project({
      variables: [{ name: "net.var_player" }, { name: "net.var_count" }, { name: "net.var_data" }],
      scenas: [{
        name: "start",
        sceneType: "topdown",
        width: 20,
        height: 18,
        runtime: {
          type: "topdown",
          config: {
            capabilities: [{ id: "link_multiplayer", enabled: true, settings: {} }]
          }
        }
      }],
      settings: {
        ...baseSettings,
        runtimeCapabilities: { link: { enabled: true } }
      },
      events: [
        {
          id: "event-haptics",
          name: "haptics_boot",
          category: "Multijogador",
          steps: [
            { command: "rumble_on" },
            { command: "rumble_on_for 60" },
            { command: "rumble_off" },
            { command: "multiplayer4_open 4" },
            { command: "multiplayer4_set 1234" },
            { command: "multiplayer4_sync" },
            { command: "multiplayer4_read net.var_player net.var_count net.var_data" },
            { command: "multiplayer4_close" }
          ]
        }
      ]
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([{
      name: "haptics_boot",
      script: [
        { op: "rumble_on" },
        { op: "rumble_on_for", frames: 60 },
        { op: "rumble_off" },
        { op: "multiplayer_open", players: 4 },
        { op: "multiplayer_set_data", value: 1234 },
        { op: "multiplayer_sync" },
        { op: "multiplayer_read", var_player: 0, var_count: 1, var_base: 2 },
        { op: "multiplayer_close" }
      ]
    }]));
  });

  it("requires the universal link capability for 4-player multiplayer commands", () => {
    const build = () => buildEngineExportProjectContract(project({
      events: [
        {
          id: "event-mp4",
          name: "mp4_boot",
          category: "Multijogador",
          steps: [{ command: "multiplayer4_open 4" }]
        }
      ]
    }));

    expect(build).toThrow("Eventos multiplayer exigem a capability universal link habilitada no projeto.");
  });

  it("exports affine and bitmap composition settings to the runtime contract", () => {
    const baseSettings = project({}).settings as Record<string, Record<string, unknown>>;
    const affine = buildEngineExportProjectContract(project({
      scenas: [{ id: "iso", name: "iso", width: 8, height: 8, sceneType: "isometric" }],
      settings: {
        ...baseSettings,
        general: { gameTitle: "Affine", startScene: "iso", startSceneType: "isometric", exportFolder: "build" },
        backgrounds: { graphicsMode: "Mode 2 - Affine", affineLayer: "BG3", affineRotation: 90, affineScaleX: 1, affineScaleY: 2 }
      }
    }));
    const bitmap = buildEngineExportProjectContract(project({
      settings: { ...baseSettings, backgrounds: { graphicsMode: "Mode 5 - Bitmap", bitmapAsset: "panorama.png", bitmapPage: 1 } }
    }));

    expect(affine.isometric_project?.video).toMatchObject({
      display_mode: 2,
      affine: { layer: "BG3", pa: 0, pb: -128, pc: 256, pd: 0 }
    });
    expect(bitmap.topdown_project?.video).toEqual({
      display_mode: 5,
      affine: null,
      bitmap: { asset: "panorama_bitmap", page: 1, width: 160, height: 128, color_depth: 15 }
    });
  });

  it("rejects incomplete historical text commands without silently omitting them", () => {
    const result = prepareEngineProjectExport(project({
      events: [{
        id: "event-warn",
        name: "warn_boot",
        category: "Cena",
        steps: [{ command: "draw_text Texto nao exportavel" }]
      }],
      settings: {
        general: { gameTitle: "Warn", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "warn.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(result.error).toContain("X/Y");
    expect(result.generated).toBeUndefined();
  });

  it("surfaces projection warnings without blocking the export contract", () => {
    const contract = buildEngineExportProjectContract(project({
      actors: [{
        id: "actor-guide",
        name: "Guia",
        eventBindings: "invalid"
      }]
    }));

    expect(contract.export_warnings).toEqual([
      "Ator \"Guia\" possui campos que nao podem ser projetados com seguranca: eventBindings."
    ]);
  });

  it("compiles script lock, overlay and dialogue speed commands into engine ops", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-town", name: "town", width: 20, height: 18, playerActorName: "Player" }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "town", x: 5, y: 7 },
        { id: "actor-guide", name: "Guide", roomName: "town", x: 9, y: 4 }
      ],
      variables: [{ name: "story.dice" }],
      events: [
        {
          id: "event-boot",
          name: "room_boot",
          category: "Cena",
          steps: [
            { command: "random_variable story.dice 1 6" },
            { command: "lock_script room_boot" },
            { command: "overlay_line 12" },
            { command: "overlay_show 0 0 160 144" },
            { command: "overlay_move 0 144 144" },
            { command: "overlay_hide 18" },
            { command: "set_dialogue_text_speed 3" },
            { command: "set_language es" },
            { command: "set_actor_animation_frame Guide 2" }
          ]
        }
      ],
      settings: {
        general: { gameTitle: "Lot4", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "lot4.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      {
        name: "room_boot",
        script: [
          { op: "random_variable", variable: 0, min: 1, max: 6 },
          { op: "lock_script", index: 0 },
          { op: "overlay_line", line: 12 },
          { op: "overlay_show", x: 0, y: 0, width: 160, height: 144 },
          { op: "overlay_move", x: 0, y: 144, frames: 144 },
          { op: "overlay_hide", frames: 18 },
          { op: "set_dialogue_text_speed", frames: 3 },
          { op: "set_dialogue_language", locale: 3 },
          { op: "set_actor_animation_frame", actor: 0, frame: 2 }
        ]
      }
    ]));
  });

  it("compiles dialogue frame and text sfx commands into engine ops", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-confirm", name: "confirm.wav", kind: "Audio", metadata: { source: "Assets/audio/confirm.wav" } }
      ],
      audioItems: [
        { id: "audio-confirm", name: "confirm.wav", kind: "SFX", format: "WAV", exportID: "confirm", loops: false }
      ],
      events: [
        {
          id: "event-dialogue-ui",
          name: "dialogue_ui_boot",
          category: "Cena",
          steps: [
            { command: "set_dialogue_frame 2" },
            { command: "set_text_sfx confirm.wav" }
          ]
        }
      ],
      settings: {
        general: { gameTitle: "Dialogue UI", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "dialogue-ui.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      {
        name: "dialogue_ui_boot",
        script: [
          { op: "set_dialogue_frame", index: 2 },
          { op: "set_text_sfx", sfx: 0 }
        ]
      }
    ]));
  });

  it("prepends settings.uiDialogs boot ops to the start room on_enter script", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-blip", name: "text_blip.wav", kind: "Audio", metadata: { source: "Assets/audio/text_blip.wav" } }
      ],
      audioItems: [
        { id: "audio-blip", name: "text_blip.wav", kind: "SFX", format: "WAV", exportID: "text_blip", loops: false }
      ],
      scenas: [
        { id: "room-start", name: "start", width: 20, height: 18, eventBindings: { onInit: "room_boot" } },
        { id: "room-other", name: "other", width: 16, height: 16, eventBindings: { onInit: "room_boot" } }
      ],
      events: [
        { id: "event-boot", name: "room_boot", category: "Cena", steps: [{ command: "show_dialogue intro" }] }
      ],
      dialogues: [{ key: "intro", text: "Ola" }],
      settings: {
        general: { gameTitle: "Dialogue Boot", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "dialogue-boot.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        uiDialogs: { textSpeed: "Rapida", characterSound: "text_blip" }
      }
    }));

    const startRoom = contract.topdown_project?.rooms.find((room) => room.name === "start");
    const otherRoom = contract.topdown_project?.rooms.find((room) => room.name === "other");
    expect(startRoom?.on_enter).toEqual([
      { op: "set_dialogue_text_speed", frames: 1 },
      { op: "set_text_sfx", sfx: 0 },
      { op: "show_dialogue", dialogue: 0 }
    ]);
    expect(otherRoom?.on_enter).toEqual([
      { op: "show_dialogue", dialogue: 0 }
    ]);
  });

  it("exports settings.save as topdown_project.save for SRAM", () => {
    const contract = buildEngineExportProjectContract(project({
      settings: {
        general: { gameTitle: "Save", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "save.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 5, autoSave: false },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        topdown: { walkSpeed: 1 }
      },
      actors: [{ id: "actor-player", name: "Player", roomName: "start", x: 2, y: 2 }]
    }));

    expect(contract.topdown_project?.save).toEqual({
      enabled: true,
      autosave: false,
      signature: "GBUS",
      slot_count: 5,
      slot_capacity: 2048,
      offset: 0,
      version: 1,
      ui: {
        enabled: true,
        slotCount: 5,
        selectedSlot: 1,
        layout: "cards",
        confirmDelete: true,
        actions: { continue: "Continuar", load: "Carregar", delete: "Apagar" },
        metadata: { playerName: true, playTime: true, location: true }
      }
    });
  });

  it("compiles save, animation, hud and camera lot-2 commands into engine ops", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-town", name: "town", width: 20, height: 18, playerActorName: "Player" }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "town", x: 5, y: 7, animationName: "idle_down" },
        { id: "actor-guide", name: "Guide", roomName: "town", x: 9, y: 4 }
      ],
      variables: [{ name: "wallet.gold" }],
      events: [{
        id: "event-lot2",
        name: "lot2_boot",
        category: "Cena",
        steps: [
          { command: "save_game" },
          { command: "load_game 1" },
          { command: "set_actor_animation Player idle_down" },
          { command: "set_actor_animation Guide wave" },
          { command: "set_actor_direction Guide right" },
          { command: "camera_lock_player" },
          { command: "shake_screen 24 3" },
          { command: "set_camera_property zoom 175" },
          { command: "modify_stat hp -2" },
          { command: "show_stat_bar hp 8 8 64 horizontal" },
          { command: "show_hearts hp 4 4" },
          { command: "show_number_hud wallet.gold 200 8 3" }
        ]
      }],
      settings: {
        general: { gameTitle: "Lot2", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "lot2.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      {
        name: "lot2_boot",
        script: [
          { op: "save_game" },
          { op: "load_game", slot: 1 },
          { op: "set_player_animation", animation: "idle_down" },
          { op: "set_actor_animation", actor: 0, animation: "wave" },
          { op: "set_actor_direction", actor: 0, direction: "right" },
          { op: "lock_camera" },
          { op: "set_camera_shake", frames: 24, magnitude: 3 },
          { op: "set_camera_property", field: "zoom", value: 175 },
          { op: "modify_stat", stat: "hp", delta: -2 },
          { op: "show_stat_bar", stat: "hp", x: 8, width: 64 },
          { op: "show_hearts", stat: "hp", units_per_heart: 4, hearts: 4 },
          { op: "show_number_hud", variable: 0, x: 200, digits: 3 }
        ]
      }
    ]));
  });

  it("compiles fade and camera lot-1 commands into engine ops", () => {
    const contract = buildEngineExportProjectContract(project({
      events: [{
        id: "event-boot",
        name: "room_boot",
        category: "Cena",
        steps: [
          { command: "fade_out 20" },
          { command: "camera_follow_player" },
          { command: "camera_move 16 8" },
          { command: "camera_set_bounds -120 -80 120 80" },
          { command: "fade_in 15" }
        ]
      }],
      scenas: [{ id: "room-start", name: "start", width: 20, height: 18, eventBindings: { onInit: "room_boot" } }]
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      {
        name: "room_boot",
        script: [
          { op: "fade_out", frames: 20 },
          { op: "follow_camera" },
          { op: "move_camera", x: 16, y: 8 },
          { op: "set_camera_bounds_x", min: -120, max: 120 },
          { op: "set_camera_bounds_y", min: -80, max: 80 },
          { op: "fade_in", frames: 15 }
        ]
      }
    ]));
  });

  it("compiles visual effects with a normalized target, duration, and intensity", () => {
    const contract = buildEngineExportProjectContract(project({
      events: [{
        id: "event-boot",
        name: "room_boot",
        category: "Cena",
        steps: [
          { command: "visual_effect palette_flash bg0 18 70" },
          { command: "visual_effect mosaic obj 30 12" },
          { command: "visual_effect clear all 0 0" }
        ]
      }],
      scenas: [{ id: "room-start", name: "start", width: 20, height: 18, eventBindings: { onInit: "room_boot" } }]
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      {
        name: "room_boot",
        script: [
          { op: "visual_effect", effect: "palette_flash", layer: "bg0", frames: 18, intensity: 70 },
          { op: "visual_effect", effect: "mosaic", layer: "obj", frames: 30, intensity: 12 },
          { op: "visual_effect", effect: "clear", layer: "all", frames: 0, intensity: 0 }
        ]
      }
    ]));
  });

  it("compiles actor movement and visibility commands using room npc indices", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-town", name: "town", width: 20, height: 18, playerActorName: "Player" }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "town", x: 5, y: 7 },
        { id: "actor-guide", name: "Guide", roomName: "town", x: 9, y: 4 },
        { id: "actor-merchant", name: "Merchant", roomName: "town", x: 12, y: 6 }
      ],
      events: [{
        id: "event-guide",
        name: "guide_script",
        category: "Ator",
        steps: [
          { command: "move_actor Guide 1 0" },
          { command: "set_actor_position Merchant 10 6" },
          { command: "set_actor_visible Guide false" },
          { command: "wait 30" },
          { command: "stop_music" }
        ]
      }],
      settings: {
        general: { gameTitle: "Town", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "town.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.rooms[0]?.npcs?.map((npc) => npc.name)).toEqual(["Guide", "Merchant"]);
    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      {
        name: "guide_script",
        script: [
          { op: "move_actor", actor: 0, x: 8, y: 0 },
          { op: "set_actor_position", actor: 1, x: 80, y: 48 },
          { op: "set_actor_visible", actor: 0, value: 0 },
          { op: "wait", frames: 30 },
          { op: "stop_music" }
        ]
      }
    ]));
  });

  it("exports npc on_interact from eventBindings.onInteract when eventName is empty", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-town", name: "town", width: 20, height: 18, playerActorName: "Player" }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "town", x: 5, y: 7 },
        {
          id: "actor-guide",
          name: "Guide",
          roomName: "town",
          x: 9,
          y: 4,
          eventBindings: { onInteract: "npc_talk" }
        }
      ],
      events: [{
        id: "event-talk",
        name: "npc_talk",
        category: "Ator",
        steps: [{ command: "show_dialogue intro" }]
      }],
      dialogues: [{ key: "intro", text: "Ola" }],
      settings: {
        general: { gameTitle: "NPC Bind", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "npc-bind.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.rooms[0]?.npcs?.[0]).toEqual(expect.objectContaining({
      name: "Guide",
      on_interact: [{ op: "show_dialogue", dialogue: 0 }]
    }));
  });

  it("exports actor collision groups, masks and fixed-memory push metadata", () => {
    const topdown = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-start", name: "start", width: 20, height: 18, playerActorName: "Player" }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "start", x: 5, y: 7 },
        {
          id: "actor-crate",
          name: "Crate",
          roomName: "start",
          x: 9,
          y: 4,
          collisionGroup: 3,
          collisionMask: 0x0009,
          pushPriority: 12,
          pushable: true
        }
      ]
    }));
    const platformer = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-stage", name: "stage", width: 20, height: 18, sceneType: "platformer", playerActorName: "Player" }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "stage", x: 5, y: 7 },
        {
          id: "actor-crate",
          name: "Crate",
          roomName: "stage",
          x: 9,
          y: 4,
          collisionGroup: 3,
          collisionMask: 0x0009,
          pushPriority: 12,
          pushable: true
        }
      ],
      settings: {
        general: { gameTitle: "Push", startScene: "stage", startSceneType: "platformer", exportFolder: "build" },
        build: { romFileName: "push.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        platformer: { walkSpeed: 1.5, gravity: 0.5, maxFallSpeed: 4, coyoteTime: 4, jumpBuffer: 5, ladders: false }
      }
    }));

    expect(topdown.topdown_project?.rooms[0]?.npcs?.[0]).toEqual(expect.objectContaining({
      collision_group: 3,
      collision_mask: 0x0009,
      push_priority: 12,
      pushable: true
    }));
    expect(platformer.platformer_project?.rooms[0]?.npcs?.[0]).toEqual(expect.objectContaining({
      collision_group: 3,
      collision_mask: 0x0009,
      push_priority: 12,
      pushable: true
    }));
  });

  it("keeps actor onInit in the actor lifecycle slot across native actor runtimes", () => {
    const contractFor = (
      sceneType: "topdown" | "platformer" | "isometric",
      roomName: string,
      actorName: string
    ) => buildEngineExportProjectContract(project({
      scenas: [{
        id: `room-${roomName}`,
        name: roomName,
        width: sceneType === "isometric" ? 16 : 20,
        height: sceneType === "isometric" ? 16 : 18,
        sceneType,
        ...(sceneType === "isometric"
          ? { runtime: { type: "isometric", config: { tileWidth: 32, tileHeight: 16, heightStep: 8 } } }
          : { playerActorName: "Player" })
      }],
      actors: [
        ...(sceneType === "isometric"
          ? []
          : [{ id: "actor-player", name: "Player", roomName, x: 5, y: 7 }]),
        {
          id: `actor-${actorName}`,
          name: actorName,
          roomName,
          x: 9,
          y: 4,
          eventBindings: { onInit: "actor_init", onInteract: "actor_talk" }
        }
      ],
      events: [
        { id: "event-init", name: "actor_init", category: "Ator", steps: [{ command: `set_actor_active ${actorName} false` }] },
        { id: "event-talk", name: "actor_talk", category: "Ator", steps: [{ command: "show_dialogue intro" }] }
      ],
      dialogues: [{ key: "intro", text: "Ola" }],
      settings: {
        general: { gameTitle: "Actor Init", startScene: roomName, startSceneType: sceneType, exportFolder: "build" },
        build: { romFileName: "actor-init.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    const topdownRoom = contractFor("topdown", "town", "TopGuide").topdown_project?.rooms[0];
    expect(topdownRoom?.on_enter).toBeUndefined();
    expect(topdownRoom?.npcs?.[0]).toEqual(expect.objectContaining({
      on_start: [{ op: "set_actor_active", actor: 0, value: 0 }],
      on_interact: [{ op: "show_dialogue", dialogue: 0 }]
    }));

    const platformerRoom = contractFor("platformer", "stage", "PlatformGuide").platformer_project?.rooms[0];
    expect(platformerRoom?.on_enter).toBeUndefined();
    expect(platformerRoom?.npcs?.[0]).toEqual(expect.objectContaining({
      on_start: [{ op: "set_actor_active", actor: 0, value: 0 }],
      on_interact: [{ op: "show_dialogue", dialogue: 0 }]
    }));

    const isometricRoom = contractFor("isometric", "market", "IsoGuide").isometric_project?.rooms[0];
    expect(isometricRoom?.on_enter).toBeUndefined();
    expect(isometricRoom?.actors?.[0]).toEqual(expect.objectContaining({
      on_start: [{ op: "set_actor_active", actor: 0, value: 0 }],
      on_interact: [{ op: "show_dialogue", dialogue: 0 }]
    }));
  });

  it("exports npc on_update from eventBindings.onUpdate", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-town", name: "town", width: 20, height: 18 }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "town", x: 5, y: 7 },
        {
          id: "actor-patrol",
          name: "Patrol",
          roomName: "town",
          x: 9,
          y: 4,
          eventBindings: { onUpdate: "patrol_tick" }
        }
      ],
      variables: [{ name: "score" }],
      events: [{
        id: "event-patrol",
        name: "patrol_tick",
        category: "Ator",
        steps: [{ command: "add_variable score 1" }]
      }],
      settings: {
        general: { gameTitle: "OnUpdate", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "onupdate.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.rooms[0]?.npcs?.[0]).toEqual(expect.objectContaining({
      name: "Patrol",
      on_update: [{ op: "add_variable", variable: 0, amount: 1 }]
    }));
  });

  it("exports the contextual actor Ao acertar binding to the player-hit runtime hook", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-town", name: "town", width: 20, height: 18 }],
      actors: [{
        id: "actor-guide",
        name: "Guide",
        roomName: "town",
        x: 9,
        y: 4,
        collisionGroup: 1,
        eventBindings: { onHit: "guide_hit" }
      }],
      variables: [{ name: "score" }],
      events: [{
        id: "event-guide-hit",
        name: "guide_hit",
        category: "Ator",
        steps: [{ command: "add_variable score 1" }]
      }],
      settings: {
        general: { gameTitle: "Actor Hit", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "actor-hit.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.rooms[0]?.npcs?.[0]).toEqual(expect.objectContaining({
      on_hit_player: [{ op: "add_variable", variable: 0, amount: 1 }]
    }));
  });

  it("exports every top-down actor lifecycle and collision event in its own slot", () => {
    const bindingKeys = [
      "onInit",
      "onInteract",
      "onUpdate",
      "onHitActor",
      "onHitPlayer",
      "onHitGroup1",
      "onHitGroup2",
      "onHitGroup3",
      "onDefeated"
    ] as const;
    const events = bindingKeys.map((bindingKey, index) => ({
      id: `event-${bindingKey}`,
      name: bindingKey,
      category: "Ator",
      steps: [{ command: `set_variable score ${index + 1}` }]
    }));
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-town", name: "town", width: 20, height: 18, playerActorName: "Player" }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "town", x: 5, y: 7, eventBindings: { onInit: "onInit", onUpdate: "onUpdate" } },
        {
          id: "actor-guide",
          name: "Guide",
          roomName: "town",
          x: 9,
          y: 4,
          eventBindings: Object.fromEntries(bindingKeys.map((bindingKey) => [bindingKey, bindingKey]))
        }
      ],
      variables: [{ name: "score" }],
      events,
      settings: {
        general: { gameTitle: "Actor Events", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "actor-events.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    const player = contract.topdown_project?.player;
    const npc = contract.topdown_project?.rooms[0]?.npcs?.[0];
    expect(player).toEqual(expect.objectContaining({
      on_start: [{ op: "set_variable", variable: 0, value: 1 }],
      on_update: [{ op: "set_variable", variable: 0, value: 3 }]
    }));
    expect(npc).toEqual(expect.objectContaining({
      on_start: [{ op: "set_variable", variable: 0, value: 1 }],
      on_interact: [{ op: "set_variable", variable: 0, value: 2 }],
      on_update: [{ op: "set_variable", variable: 0, value: 3 }],
      on_hit_actor: [{ op: "set_variable", variable: 0, value: 4 }],
      on_hit_player: [{ op: "set_variable", variable: 0, value: 5 }],
      on_hit_group1: [{ op: "set_variable", variable: 0, value: 6 }],
      on_hit_group2: [{ op: "set_variable", variable: 0, value: 7 }],
      on_hit_group3: [{ op: "set_variable", variable: 0, value: 8 }],
      on_defeated: [{ op: "set_variable", variable: 0, value: 9 }]
    }));
  });

  it("compiles show_dialogue_speaker into show_dialogue export op", () => {
    const contract = buildEngineExportProjectContract(project({
      dialogues: [{ key: "intro", text: "Ola", character: "Narrador" }],
      events: [{
        id: "event-speaker",
        name: "speaker_boot",
        category: "Dialogo",
        steps: [{ command: "show_dialogue_speaker intro Narrador" }]
      }],
      settings: {
        general: { gameTitle: "Speaker", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "speaker.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      {
        name: "speaker_boot",
        script: [{ op: "show_dialogue", dialogue: 0 }]
      }
    ]));
  });

  it("compiles actor commands that target the reserved player slot", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-town", name: "town", width: 20, height: 18, playerActorName: "Player" }],
      actors: [{ id: "actor-player", name: "Player", roomName: "town", x: 5, y: 7 }],
      events: [{
        id: "event-player",
        name: "player_script",
        category: "Ator",
        steps: [
          { command: "set_actor_active Player false" },
          { command: "set_actor_position Player 10 6" },
          { command: "move_actor Player 1 -2" },
          { command: "set_actor_direction Player right" },
          { command: "set_actor_active Player true" }
        ]
      }],
      settings: {
        general: { gameTitle: "Bad", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "bad.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.scripts.find((script) => script.name === "player_script")?.script).toEqual([
      { op: "set_actor_active", actor: -1, value: 0 },
      { op: "set_actor_position", actor: -1, x: 80, y: 48 },
      { op: "move_actor", actor: -1, x: 8, y: -16 },
      { op: "set_actor_direction", actor: -1, direction: "right" },
      { op: "set_actor_active", actor: -1, value: 1 }
    ]);
  });

  it("compiles subpixel player speed and collision-aware actor push commands", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-town", name: "town", width: 20, height: 18, playerActorName: "Player" }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "town", x: 5, y: 7 },
        { id: "actor-rock", name: "Rock", roomName: "town", x: 8, y: 7 }
      ],
      events: [{
        id: "event-speed-push",
        name: "speed_push_script",
        category: "Ator",
        steps: [
          { command: "set_actor_movement_speed Player 50" },
          { command: "set_actor_active Rock true" },
          { command: "push_actor_away_from_player Rock 2" },
          { command: "push_actor_away_from_player Rock 100" }
        ]
      }],
      settings: {
        general: { gameTitle: "Speed Push", startScene: "town", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "speed-push.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.scripts.find((script) => script.name === "speed_push_script")?.script).toEqual([
      { op: "set_actor_speed", actor: -1, speed: 50 },
      { op: "set_actor_active", actor: 0, value: 1 },
      { op: "push_actor_away_from_player", actor: 0, distance: 2 },
      { op: "push_actor_away_from_player", actor: 0, distance: 100 }
    ]);
  });

  it("preserves editor tilemap ids in exported visual_tiles", () => {
    const tilemap = Array.from({ length: 20 * 18 }, (_item, index) => index % 7);
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-start",
        name: "start",
        width: 20,
        height: 18,
        tilemap
      }],
      settings: {
        general: { gameTitle: "Tiles", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "tiles.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.topdown_project?.rooms[0]?.visual_tiles).toEqual(tilemap);
    expect(contract.topdown_project?.rooms[0]?.tilemap_contract).toMatchObject({
      id: "gba-regular-metatile-2x2-v1",
      model: "regular_tiled",
      metatile_width: 2,
      metatile_height: 2,
      logical_layers: [
        { id: "base", hardware_mapping: "bg2", source: "visual_tiles" },
        { id: "top", hardware_mapping: "bg1", source: "foreground_tiles" }
      ]
    });
  });

  it("exports the background color depth for every streamed topdown room", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        {
          id: "asset-rich",
          name: "rich-background.png",
          kind: "Background",
          metadata: { source: "Assets/backgrounds/rich-background.png", colorMode: "4bpp" }
        },
        {
          id: "asset-banked",
          name: "banked-background.png",
          kind: "Background",
          metadata: { source: "Assets/backgrounds/banked-background.png", colorMode: "4bpp" }
        }
      ],
      scenas: [
        { id: "room-rich", name: "start", width: 20, height: 18, backgroundAssetName: "rich-background.png" },
        { id: "room-banked", name: "other", width: 20, height: 18, backgroundAssetName: "banked-background.png" }
      ]
    }));

    expect(contract.topdown_project?.rooms.map((room) => room.background_bits_per_pixel)).toEqual([4, 4]);
    expect(contract.topdown_project?.camera).toMatchObject({ zoom_x256: 256 });
  });

  it("exports dialogue_lines as speaker/portrait objects for platformer projects", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-platformer",
        name: "climb",
        width: 20,
        height: 18,
        sceneType: "platformer"
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "climb", x: 2, y: 12 }],
      dialogues: [{
        key: "intro",
        character: "Guia",
        portrait: "guide.png",
        text: "Pule para testar."
      }],
      settings: {
        general: { gameTitle: "Dialogue Objects", startScene: "climb", startSceneType: "platformer", exportFolder: "build" },
        build: { romFileName: "dialogue.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.platformer_project?.dialogue_lines).toEqual([
      { text: "Pule para testar.", speaker: "Guia", portrait: "guide.png", key: "intro" }
    ]);
  });

  it("blocks prepareEngineProjectExport when tilemap exceeds hardware limits", () => {
    const prepared = prepareEngineProjectExport(project({
      scenas: [{ name: "broken", width: 10, height: 10, tilemap: [2000] }]
    }));

    expect(prepared.error).toContain("Export bloqueado");
    expect(prepared.error).toContain("Tilemap:");
  });

  it("keeps wide sprite guidance non-blocking when metasprite export can decompose it", () => {
    const prepared = prepareEngineProjectExport(project({
      animations: [{
        name: "boss_wide",
        spriteSheet: "boss.png",
        frameWidth: 80,
        frameHeight: 16,
        frameCount: 1,
        colorMode: "4bpp"
      }]
    }));

    expect(prepared.error).toBeUndefined();
    expect(prepared.generated?.contract.export_notices).toEqual(expect.arrayContaining([
      expect.stringContaining("Frame largo: sera decomposto em multiplos OBJs do GBA.")
    ]));
    expect(prepared.generated?.contract.export_warnings ?? []).toEqual([]);
  });

  it("blocks prepareEngineProjectExport when sprite VRAM estimate exceeds 32 KB", () => {
    const prepared = prepareEngineProjectExport(project({
      animations: [{
        name: "boss_heavy",
        spriteSheet: "boss.png",
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 20,
        colorMode: "4bpp"
      }]
    }));

    expect(prepared.error).toContain("Export bloqueado");
    expect(prepared.error).toContain("Sprite VRAM:");
    expect(prepared.error).toContain("32 KB");
  });

  it("exports dialogue_ui layout and boot frame ops from settings.uiDialogs", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-start", name: "start", width: 20, height: 18, eventBindings: { onInit: "room_boot" } }
      ],
      events: [
        { id: "event-boot", name: "room_boot", category: "Cena", steps: [{ command: "show_dialogue intro" }] }
      ],
      dialogues: [{ key: "intro", text: "Ola" }],
      settings: {
        general: { gameTitle: "Dialogue UI", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "dialogue-ui.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        uiDialogs: { boxPosition: "Superior", boxWidth: 208, boxHeight: 32 }
      }
    }));

    expect(contract.topdown_project?.dialogue_ui).toEqual({
      frame_index: 1,
      wrap_columns: 26,
      wrap_lines: 2,
      box_width: 26,
      box_height: 4,
      hud_position: "Superior",
      hud_width: 240,
      hud_height: 24,
      hud_layouts: [{ id: "hud-default", mode: "standard", components: [] }]
    });
    expect(contract.topdown_project?.rooms[0]?.on_enter).toEqual([
      { op: "set_dialogue_frame", index: 1 },
      { op: "show_dialogue", dialogue: 0 }
    ]);
  });

  it("exports dialogue_ui asset metadata from settings.uiDialogs", () => {
    const contract = buildEngineExportProjectContract(project({
      settings: {
        general: { gameTitle: "Dialogue Assets", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "dialogue-assets.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        uiDialogs: {
          boxPosition: "Inferior",
          boxWidth: 208,
          boxHeight: 48,
          boxImage: "ui/dialogue_box.png",
          selectorImage: "ui/dialogue_cursor.png",
          font: "ui/dialogue_font.png",
          showPortrait: true,
          showCharacterName: false,
          portraitPosition: "Direita"
        }
      }
    }));

    expect(contract.topdown_project?.dialogue_ui).toEqual({
      frame_index: 0,
      wrap_columns: 26,
      wrap_lines: 4,
      box_width: 26,
      box_height: 6,
      hud_position: "Superior",
      hud_width: 240,
      hud_height: 24,
      hud_layouts: [{ id: "hud-default", mode: "standard", components: [] }],
      box_image: "ui/dialogue_box.png",
      selector_image: "ui/dialogue_cursor.png",
      font: "ui/dialogue_font.png",
      show_portrait: true,
      show_character_name: false,
      portrait_position: "Direita"
    });
    expect(contract.export_warnings).toContain(
      'Fonte custom "ui/dialogue_font.png" selecionada, mas nenhum asset do projeto com esse nome pode ser convertido para a ROM.'
    );
  });

  it("resolves dialogue_ui.box_image to a copied box_skin path when the asset exists", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-box", name: "dialogue_box.png", kind: "UI", metadata: { source: "Assets/ui/dialogue_box.png" } }
      ],
      settings: {
        general: { gameTitle: "Dialogue Box Skin", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "dialogue-box-skin.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        uiDialogs: { boxImage: "dialogue_box.png" }
      }
    }));

    expect(contract.topdown_project?.dialogue_ui?.box_image).toBe("dialogue_box.png");
    expect(contract.topdown_project?.dialogue_ui?.box_skin).toBe("assets/ui/dialogue_box.png");
  });

  it("resolves the active HUD preset background independently from the dialogue box", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-hud", name: "hud_sky.png", kind: "UI", metadata: { source: "Assets/ui/hud_sky.png" } }
      ],
      settings: {
        general: { gameTitle: "HUD Skin", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "hud-skin.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        hudPresetId: "hud-sky",
        hudPresets: [{
          id: "hud-sky",
          name: "HUD céu",
          backgroundImage: "hud_sky.png",
          position: "Superior",
          width: 240,
          height: 24
        }]
      }
    }));

    expect(contract.topdown_project?.dialogue_ui).toMatchObject({
      hud_image: "hud_sky.png",
      hud_skin: "assets/ui/hud_sky.png"
    });
    expect(contract.requires.features).toContain("hud_box_skin");
  });

  it.each(["hud-default", "@project"])("exports the built-in HUD definition for %s without persisted presets", (presetId) => {
    const data = project({
      scenas: [
        { id: "start", name: "start", sceneType: "topdown", width: 30, height: 20, hudPresetId: presetId },
        { id: "empty", name: "empty", sceneType: "topdown", width: 30, height: 20 }
      ]
    });
    const before = JSON.stringify(data);
    const ui = buildEngineExportProjectContract(data).topdown_project?.dialogue_ui;

    expect(ui?.hud_scene_bindings).toEqual([{ scene_name: "start", preset_id: "hud-default" }]);
    expect(ui?.hud_presets).toEqual([{
      id: "hud-default", hud_position: "Superior", hud_width: 240, hud_height: 24
    }]);
    expect(JSON.stringify(data)).toBe(before);
  });

  it("exports explicit project inheritance as a concrete HUD id and skips unbound scenes", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "start", name: "start", sceneType: "topdown", width: 30, height: 20, hudPresetId: "@project" },
        { id: "empty", name: "empty", sceneType: "topdown", width: 30, height: 20 },
        { id: "menu", name: "menu", sceneType: "menu", width: 30, height: 20, runtime: { type: "menu", config: { screenType: "menu", hudPresetId: "@project", items: [] } } }
      ],
      settings: { ...project({}).settings as Record<string, unknown>, hudPresetId: "local", hudPresets: [{ id: "local", name: "Local" }] }
    }));
    expect(contract.topdown_project?.dialogue_ui?.hud_scene_bindings).toEqual(expect.arrayContaining([{ scene_name: "start", preset_id: "local" }]));
    expect(JSON.stringify(contract.topdown_project?.dialogue_ui?.hud_scene_bindings)).not.toContain("empty");
    expect(contract.menu_project?.screens.find(screen => screen.name === "menu")?.hud_preset_id).toBe("local");
  });

  it("exports all HUD presets and the scene-specific preset binding", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [
        { id: "room-start", name: "start", width: 20, height: 18 },
        { id: "room-market", name: "market", width: 20, height: 18, hudPresetId: "hud-market" }
      ],
      assets: [
        { id: "asset-market-hud", name: "hud_market.png", kind: "UI", metadata: { source: "Assets/ui/hud_market.png" } },
        { id: "asset-market-font", name: "market_font.png", kind: "FONT", metadata: { source: "Assets/fonts/market_font.png" } }
      ],
      settings: {
        general: { gameTitle: "HUD por cena", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "hud-por-cena.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        hudPresetId: "hud-default",
        hudPresets: [
          {
            id: "hud-market",
            name: "HUD mercado",
            backgroundImage: "hud_market.png",
            font: "market_font.png",
            position: "Inferior",
            width: 208,
            height: 32
          }
        ]
      }
    }));

    expect(contract.topdown_project?.dialogue_ui?.hud_presets).toEqual([
      {
        id: "hud-default",
        hud_position: "Superior",
        hud_width: 240,
        hud_height: 24
      },
      {
        id: "hud-market",
        hud_image: "hud_market.png",
        hud_skin: "assets/ui/hud_market.png",
        font_image: "assets/font/market_font.png",
        hud_position: "Inferior",
        hud_width: 208,
        hud_height: 32
      }
    ]);
    expect(contract.topdown_project?.dialogue_ui?.hud_scene_bindings).toEqual([
      { scene_name: "market", preset_id: "hud-market" }
    ]);
    expect(contract.topdown_project?.dialogue_ui?.hud_layouts).toEqual([
      { id: "hud-default", mode: "standard", components: [] },
      { id: "hud-market", mode: "standard", components: [] }
    ]);
  });

  it("mantem o binding de HUD quando a tela de menu usa atores de opcao", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-initial",
        name: "initial",
        width: 30,
        height: 20,
        sceneType: "menu",
        hudPresetId: "hud-advanced",
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            role: "initial",
            title: "Menu Inicial",
            items: [{ id: "new-game", label: "Novo jogo" }]
          }
        }
      }],
      actors: [{
        id: "actor-new-game",
        name: "Novo jogo",
        sceneName: "initial",
        spriteSheet: "menu-option.png",
        menuSelectedSpriteSheet: "menu-option.png",
        menuActorRole: "option",
        menuItemID: "new-game",
        menuPositionPixels: { x: 42, y: 31 },
        x: 8,
        y: 8
      }],
      assets: [{
        id: "asset-menu-option",
        name: "menu-option.png",
        kind: "Sprite",
        metadata: { source: "Assets/sprites/menu-option.png" }
      }],
      settings: {
        general: { gameTitle: "Menu HUD", startScene: "initial", startSceneType: "menu", exportFolder: "build" },
        build: { romFileName: "menu-hud.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        hudPresetId: "hud-default",
        hudPresets: [{
          id: "hud-advanced",
          name: "HUD avançada",
          mode: "advanced",
          position: "Inferior",
          width: 240,
          height: 24,
          components: [{
            id: "selection",
            kind: "text",
            label: "Seleção",
            text: "",
            asset: "",
            x: 8,
            y: 136,
            width: 112,
            height: 8,
            zIndex: 1,
            visible: true
          }]
        }]
      }
    }));

    expect(contract.menu_project?.screens[0]?.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "option",
        menu_item_index: 0,
        position: { x: 42, y: 31 },
        selected_metasprite: expect.objectContaining({ asset: expect.any(String), index: expect.any(Number) })
      })
    ]));
    expect(contract.menu_project?.dialogue_ui?.hud_scene_bindings).toEqual([
      { scene_name: "initial", preset_id: "hud-advanced" }
    ]);
  });

  it("exporta o ator de retorno como decorativo no contrato atual do Engine Pack", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-menu",
        name: "menu",
        width: 30,
        height: 20,
        sceneType: "menu",
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            role: "mission_board",
            title: "Missões",
            items: [{ id: "back", label: "Voltar", action: "pop_screen" }]
          }
        }
      }],
      actors: [{
        id: "actor-back",
        name: "Voltar",
        sceneName: "menu",
        spriteSheet: "back.png",
        menuActorRole: "back",
        x: 8,
        y: 8
      }],
      assets: [{
        id: "asset-back",
        name: "back.png",
        kind: "Sprite",
        metadata: { source: "Assets/sprites/back.png" }
      }],
      settings: {
        general: { gameTitle: "Menu", startScene: "menu", startSceneType: "menu", exportFolder: "build" },
        build: { romFileName: "menu.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.menu_project?.screens[0]?.actors).toEqual([
      expect.objectContaining({ name: "Voltar", role: "decorative" })
    ]);
  });

  it("exporta eventos de ciclo de vida em atores visuais de menu", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-menu",
        name: "menu",
        width: 30,
        height: 20,
        sceneType: "menu",
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            role: "start",
            title: "Menu",
            items: [{ id: "new-game", label: "Novo jogo", action: "select" }]
          }
        }
      }],
      actors: [{
        id: "actor-new-game",
        name: "Novo jogo",
        sceneName: "menu",
        spriteSheet: "menu-option.png",
        menuActorRole: "option",
        menuItemID: "new-game",
        eventBindings: {
          onInit: "menu_actor_init",
          onInteract: "menu_actor_interact",
          onUpdate: "menu_actor_update"
        },
        x: 8,
        y: 8
      }],
      assets: [{
        id: "asset-menu-option",
        name: "menu-option.png",
        kind: "Sprite",
        metadata: { source: "Assets/sprites/menu-option.png" }
      }],
      events: [
        { id: "event-menu-init", name: "menu_actor_init", category: "Ator", steps: [{ command: "set_variable score 1" }] },
        { id: "event-menu-interact", name: "menu_actor_interact", category: "Ator", steps: [{ command: "set_variable score 2" }] },
        { id: "event-menu-update", name: "menu_actor_update", category: "Ator", steps: [{ command: "set_variable score 3" }] }
      ],
      variables: [{ name: "score" }],
      settings: {
        general: { gameTitle: "Menu Actor Events", startScene: "menu", startSceneType: "menu", exportFolder: "build" },
        build: { romFileName: "menu-actor-events.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.menu_project?.screens[0]?.actors?.[0]).toEqual(expect.objectContaining({
      on_init: [{ op: "set_variable", variable: 0, value: 1 }],
      on_interact: [{ op: "set_variable", variable: 0, value: 2 }],
      on_update: [{ op: "set_variable", variable: 0, value: 3 }]
    }));
  });

  it("exporta o binding de HUD declarado dentro de uma tela de menu", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-menu",
        name: "menu",
        width: 30,
        height: 20,
        sceneType: "menu",
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            role: "menu",
            screens: [{
              id: "settings",
              screenType: "menu",
              title: "Configurações",
              hudPresetId: "hud-settings",
              items: [{ id: "audio", label: "Áudio" }]
            }]
          }
        }
      }],
      settings: {
        general: { gameTitle: "Menu interno", startScene: "menu", startSceneType: "menu", exportFolder: "build" },
        build: { romFileName: "menu-interno.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        hudPresets: [{
          id: "hud-settings",
          name: "HUD Configurações",
          mode: "advanced",
          position: "Inferior",
          width: 240,
          height: 24,
          components: [{
            id: "selection",
            kind: "text",
            label: "Seleção",
            text: "",
            asset: "",
            x: 8,
            y: 136,
            width: 112,
            height: 8,
            zIndex: 1,
            visible: true
          }]
        }]
      }
    }));

    expect(contract.menu_project?.screens).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "settings", hud_preset_id: "hud-settings" })
    ]));
    expect(contract.menu_project?.dialogue_ui?.hud_scene_bindings).toEqual([
      { scene_name: "settings", preset_id: "hud-settings" }
    ]);
  });

  it("herda o HUD da sala para telas internas de menu no export nativo", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-menu",
        name: "menu",
        width: 30,
        height: 20,
        sceneType: "menu",
        hudPresetId: "hud-settings",
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            role: "initial",
            screens: [{
              id: "initial",
              screenType: "menu",
              title: "Menu Inicial",
              items: [{ id: "new-game", label: "Novo jogo" }]
            }]
          }
        }
      }],
      settings: {
        general: { gameTitle: "Menu HUD herdado", startScene: "menu", startSceneType: "menu", exportFolder: "build" },
        build: { romFileName: "menu-hud-herdado.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        hudPresets: [{
          id: "hud-settings",
          name: "HUD Configurações",
          mode: "advanced",
          position: "Superior",
          width: 240,
          height: 16,
          components: []
        }]
      }
    }));

    expect(contract.menu_project?.screens).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "initial", hud_preset_id: "hud-settings" })
    ]));
    expect(contract.menu_project?.dialogue_ui?.hud_scene_bindings).toEqual([
      { scene_name: "initial", preset_id: "hud-settings" }
    ]);
  });

  it("não exporta HUD quando uma tela de menu declara Sem HUD", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-menu",
        name: "menu",
        width: 30,
        height: 20,
        sceneType: "menu",
        hudPresetId: "hud-settings",
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            role: "save",
            hudMode: "none",
            items: [{ id: "slot-1", label: "Slot 1" }]
          }
        }
      }],
      settings: {
        general: { gameTitle: "Menu sem HUD", startScene: "menu", startSceneType: "menu", exportFolder: "build" },
        build: { romFileName: "menu-sem-hud.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        hudPresets: [{
          id: "hud-settings",
          name: "HUD Configurações",
          mode: "advanced",
          position: "Superior",
          width: 240,
          height: 16,
          components: []
        }]
      }
    }));

    const menuScreen = contract.menu_project?.screens?.find((screen) => screen.name === "menu");
    expect(menuScreen).toBeDefined();
    expect(menuScreen).not.toHaveProperty("hud_preset_id");
    expect(contract.menu_project?.dialogue_ui?.hud_scene_bindings ?? []).not.toContainEqual(
      expect.objectContaining({ scene_name: "menu" })
    );
  });

  it("permite compor HUD e atores de opcao no mesmo runtime de menu", async () => {
    const templatePath = path.resolve(process.cwd(), "../../packages/GBAStudioEngine/templates/exported_menu/main.cpp");
    const template = await readFile(templatePath, "utf8");
    const startScreen = template.slice(
      template.indexOf("void start_screen("),
      template.indexOf("void publish_menu_screen_telemetry()")
    );

    expect(startScreen).toContain("gbastudio_dialogue_ui::configure_for_scene(");
    expect(startScreen).not.toContain("!menu_screen_uses_actor_options(screen)");
    expect(template).toContain("draw_screen_actors();");
    expect(template).toContain("gbs::draw_hud(hud);");
  });

  it("exports an advanced HUD layout as normalized movable components", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [],
      settings: {
        general: { gameTitle: "HUD advanced", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "hud-advanced.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        hudPresetId: "hud-advanced",
        hudPresets: [{
          id: "hud-advanced",
          name: "HUD avançada",
          mode: "advanced",
          position: "Inferior",
          width: 240,
          height: 24,
          components: [{
            id: "status",
            kind: "text",
            label: "Status",
            text: "HP 03",
            asset: "",
            x: 8,
            y: 136,
            width: 64,
            height: 8,
            zIndex: 1,
            visible: true
          }]
        }]
      }
    }));

    expect(contract.topdown_project?.dialogue_ui?.hud_layouts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "hud-advanced",
        mode: "advanced",
        components: [expect.objectContaining({ id: "status", text: "HP 03", z_index: 1 })]
      })
    ]));
    expect(contract.topdown_project?.dialogue_ui?.hud_active_layout_id).toBe("hud-advanced");
  });

  it("inclui o asset OBJ de um icone da HUD avancada no pacote e normaliza a referencia", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [{
        id: "asset-hud-sigil",
        name: "hud-sigil.png",
        kind: "Sprite",
        metadata: { source: "Assets/sprites/hud-sigil.png" }
      }],
      settings: {
        general: { gameTitle: "HUD icon", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "hud-icon.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        hudPresetId: "hud-advanced",
        hudPresets: [{
          id: "hud-advanced",
          name: "HUD avancada",
          mode: "advanced",
          position: "Superior",
          width: 240,
          height: 24,
          components: [{
            id: "sigil",
            kind: "icon",
            label: "Nara",
            text: "",
            asset: "hud-sigil.png",
            x: 8,
            y: 8,
            width: 16,
            height: 16,
            zIndex: 1,
            visible: true
          }]
        }]
      }
    }));

    expect(contract.topdown_project?.dialogue_ui?.hud_layouts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "hud-advanced",
        components: [expect.objectContaining({ id: "sigil", asset: "hud_sigil" })]
      })
    ]));
    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hud_sigil", name: "hud_sigil", kind: "obj", sprite_width: 16, sprite_height: 16 })
    ]));
  });

  it("resolves dialogue_ui.selector_image to the staged 8x8 selector tile", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-box", name: "dialogue_box.png", kind: "UI", metadata: { source: "Assets/ui/dialogue_box.png" } },
        { id: "asset-selector", name: "dialogue_selector.png", kind: "UI", metadata: { source: "Assets/ui/dialogue_selector.png" } }
      ],
      settings: {
        general: { gameTitle: "Dialogue Selector", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "dialogue-selector.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        uiDialogs: { boxImage: "dialogue_box.png", selectorImage: "dialogue_selector.png" }
      }
    }));

    expect(contract.topdown_project?.dialogue_ui).toMatchObject({
      selector_image: "dialogue_selector.png",
      selector_skin: "assets/ui/dialogue_selector.png"
    });
    expect(contract.requires.features).toContain("dialogue_choice_selector");
  });

  it("resolves a custom dialogue font asset to the staged PNG consumed by assetc", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-font", name: "dialogue_font.png", kind: "Font", metadata: { source: "Assets/fonts/dialogue_font.png" } }
      ],
      settings: {
        general: { gameTitle: "Dialogue Font", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "dialogue-font.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        uiDialogs: { font: "dialogue_font.png" }
      }
    }));

    expect(contract.topdown_project?.dialogue_ui).toMatchObject({
      font: "dialogue_font.png",
      font_image: "assets/font/dialogue_font.png"
    });
    expect(contract.export_warnings ?? []).not.toContain(expect.stringContaining("engine ainda ignora fontes custom"));
  });

  it("does not resolve box_skin when boxImage does not reference an existing asset", () => {
    const contract = buildEngineExportProjectContract(project({
      settings: {
        general: { gameTitle: "Dialogue Box Skin Missing", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "dialogue-box-skin-missing.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
        uiDialogs: { boxImage: "does_not_exist.png" }
      }
    }));

    expect(contract.topdown_project?.dialogue_ui?.box_image).toBe("does_not_exist.png");
    expect(contract.topdown_project?.dialogue_ui?.box_skin).toBeUndefined();
    expect(contract.export_warnings).toContain(
      'Caixa de dialogo custom "does_not_exist.png" exportada em dialogue_ui.box_image, mas nenhum asset do projeto tem esse nome.'
    );
  });

  it("exports portrait_assets and asset_pack entries for dialogue portraits", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-guide", name: "guide.png", kind: "Sprite", metadata: { source: "Assets/portraits/guide.png" } }
      ],
      dialogues: [{
        key: "intro",
        text: "Ola",
        character: "Guia",
        portrait: "guide.png"
      }]
    }));

    expect(contract.topdown_project?.portrait_assets).toEqual([
      { name: "guide.png", metasprite: { asset: "guide", index: 0 } }
    ]);
    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "obj", name: "guide", sprite_width: 16, sprite_height: 16 })
    ]));
    expect(contract.requires.features).toContain("dialogue_portrait_assets");
  });

  it("inclui retratos usados por uma cutscene no grupo de recursos da cena", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-guide", name: "guide.png", kind: "Sprite", metadata: { source: "Assets/portraits/guide.png" } }
      ],
      scenas: [{
        id: "room-prologue",
        name: "prologue",
        sceneType: "cutscene",
        width: 30,
        height: 20,
        runtime: {
          type: "cutscene",
          config: {
            steps: [{ dialogueKey: "intro", backgroundAssetName: "prologue.png" }]
          }
        }
      }],
      settings: {
        general: { gameTitle: "Cutscene portraits", startScene: "prologue", startSceneType: "cutscene", exportFolder: "build" },
        build: { romFileName: "cutscene-portraits.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      },
      dialogues: [{
        key: "intro",
        text: "Ola",
        character: "Guia",
        portrait: "guide.png"
      }]
    }));

    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "guide",
        bank_group: "scene_prologue",
        bank_groups: expect.arrayContaining(["scene_prologue", "scene_prologue_step_0"])
      })
    ]));
  });

  it("exports emote_assets and asset_pack entries for dialogue emotes", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-smile", name: "Smile.png", kind: "Emote", metadata: { source: "Assets/emotes/Smile.png" } }
      ],
      dialogues: [{
        key: "intro",
        text: "Ola!",
        emote: "Smile.png"
      }]
    }));

    expect(contract.topdown_project?.emote_assets).toEqual([
      { name: "Smile.png", metasprite: { asset: "smile", index: 0 } }
    ]);
    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "obj", name: "smile", png: "assets/sprite/smile.png" })
    ]));
    expect(contract.requires.features).toContain("dialogue_emote_assets");
  });

  it("exports dynamic actor sprites and event emotes for the SHMUP runtime", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-drone", name: "drone.png", kind: "Sprite", metadata: { source: "Assets/sprites/drone.png" } },
        { id: "asset-explosion", name: "explosion.png", kind: "Sprite", metadata: { source: "Assets/sprites/explosion.png" } },
        { id: "asset-alert", name: "alert.png", kind: "Emote", metadata: { source: "Assets/emotes/alert.png" } }
      ],
      scenas: [{ id: "room-space", name: "space", sceneType: "shmup", width: 80, height: 18 }],
      actors: [{
        id: "actor-drone",
        name: "Drone",
        roomName: "space",
        x: 10,
        y: 6,
        spriteSheet: "drone.png",
        animationName: "idle",
        eventBindings: { onHit1: "drone_destroy" }
      }],
      animations: [
        { id: "animation-drone", name: "idle", spriteSheet: "drone.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 4 },
        { id: "animation-explosion", name: "idle", spriteSheet: "explosion.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 4 }
      ],
      events: [{
        id: "event-drone-destroy",
        name: "drone_destroy",
        category: "Ator",
        roomName: "space",
        steps: [
          { command: "set_actor_sprite Drone explosion.png" },
          { command: "show_actor_gesture Drone alert.png 60" },
          { command: "set_actor_animation_speed Drone 6" }
        ]
      }],
      settings: {
        general: { gameTitle: "SHMUP Visual Events", startScene: "space", startSceneType: "shmup", exportFolder: "build" },
        build: { romFileName: "shmup-visual-events.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.shmup_project?.actor_sprites).toEqual([
      { name: "explosion.png", metasprite: { asset: "explosion", index: 0 } }
    ]);
    expect(contract.shmup_project?.emote_assets).toEqual([
      { name: "alert.png", metasprite: { asset: "alert", index: 0 } }
    ]);
    expect(contract.shmup_project?.scripts).toEqual(expect.arrayContaining([{
      name: "drone_destroy",
      script: [
        { op: "set_actor_sprite", actor: 0, sprite: 0 },
        { op: "show_actor_gesture", actor: 0, index: 0, frames: 60 },
        { op: "set_actor_animation_speed", actor: 0, percent: 6 }
      ]
    }]));
    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "explosion", kind: "obj" }),
      expect.objectContaining({ name: "alert", kind: "obj" })
    ]));
  });

  it("compiles change_actor_sprite and change_player_sprite as set_actor_sprite ops", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-drone", name: "drone.png", kind: "Sprite", metadata: { source: "Assets/sprites/drone.png" } },
        { id: "asset-explosion", name: "explosion.png", kind: "Sprite", metadata: { source: "Assets/sprites/explosion.png" } },
        { id: "asset-player", name: "player-alt.png", kind: "Sprite", metadata: { source: "Assets/sprites/player-alt.png" } }
      ],
      scenas: [{ id: "room-space", name: "space", sceneType: "shmup", width: 80, height: 18 }],
      actors: [{
        id: "actor-player",
        name: "Player",
        roomName: "space",
        x: 12,
        y: 6,
        eventBindings: { onInteract: "player-action" },
        spriteSheet: "drone.png",
        animationName: "idle"
      }, {
        id: "actor-drone",
        name: "Drone",
        roomName: "space",
        x: 28,
        y: 6,
        eventBindings: { onInteract: "drone-action" },
        spriteSheet: "drone.png",
        animationName: "idle"
      }],
      animations: [
        { id: "animation-drone", name: "idle", spriteSheet: "drone.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 4 },
        { id: "animation-player", name: "idle", spriteSheet: "player-alt.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 4 }
      ],
      settings: {
        general: { gameTitle: "Swap actor sprite events", startScene: "space", startSceneType: "shmup", exportFolder: "build" },
        build: { romFileName: "shmup-actor-swap.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      },
      events: [
        {
          id: "player-action",
          name: "player-action",
          category: "Ator",
          roomName: "space",
          steps: [{ command: "change_player_sprite player-alt.png" }]
        },
        {
          id: "drone-action",
          name: "drone-action",
          category: "Ator",
          roomName: "space",
          steps: [{ command: "change_actor_sprite Drone explosion.png" }]
        }
      ]
    }));

    const playerScripts = contract.shmup_project?.scripts ?? [];
    const playerAction = playerScripts.find((script) => script.name === "player-action");
    const droneAction = playerScripts.find((script) => script.name === "drone-action");
    expect(playerAction?.script).toEqual([{ op: "set_actor_sprite", actor: -1, sprite: 0 }]);
    expect(droneAction?.script).toEqual([{ op: "set_actor_sprite", actor: 0, sprite: 1 }]);
  });

  it("exports directional top-down sprite variants referenced by player sprite events", () => {
    const spriteNames = ["player-male.png", "player-female.png"];
    const directions = ["down", "left", "up", "right"];
    const states = ["idle", "walk"];
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-port", name: "porto_lumen", width: 30, height: 20, sceneType: "topdown" }],
      assets: spriteNames.map((name) => ({
        id: name.replace(".png", ""),
        name,
        kind: "Sprite",
        metadata: { source: `Assets/sprites/${name}` }
      })),
      actors: [{
        id: "actor-player",
        name: "Player",
        roomName: "porto_lumen",
        x: 5,
        y: 7,
        spriteSheet: spriteNames[0],
        animationName: "idle_down"
      }],
      animations: spriteNames.flatMap((spriteSheet) => states.flatMap((state) => directions.map((direction) => ({
        id: `${spriteSheet}-${state}-${direction}`,
        name: `${state}_${direction}`,
        spriteSheet,
        frameWidth: 16,
        frameHeight: 32,
        frameCount: state === "walk" ? 2 : 1,
        fps: 8
      })))),
      settings: {
        general: { gameTitle: "Player sprite swap", startScene: "porto_lumen", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "player-sprite-swap.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      },
      events: [{
        id: "event-profile",
        name: "apply_profile",
        category: "Sistema",
        roomName: "porto_lumen",
        steps: [
          { command: "change_player_sprite player-male.png" },
          { command: "change_player_sprite player-female.png" }
        ]
      }]
    }));

    expect(contract.topdown_project?.actor_sprites).toHaveLength(2);
    expect(contract.topdown_project?.actor_sprites?.map((sprite) => sprite.name)).toEqual(spriteNames);
    expect(contract.topdown_project?.actor_sprites?.map((sprite) => sprite.metasprite.asset)).toEqual([
      "player_male",
      "player_female"
    ]);
    expect(contract.topdown_project?.actor_sprites?.map((sprite) => sprite.animations?.map((animation) => animation.name))).toEqual([
      ["idle_down", "idle_up", "idle_right", "walk_down", "walk_up", "walk_right", "idle_left", "walk_left"],
      ["idle_down", "idle_up", "idle_right", "walk_down", "walk_up", "walk_right", "idle_left", "walk_left"]
    ]);
  });

  it("compiles palette swap and restore commands for event scripts", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{ id: "room-space", name: "space", width: 20, height: 18, sceneType: "topdown" }],
      settings: {
        general: { gameTitle: "Palette commands", startScene: "space", startSceneType: "topdown", exportFolder: "build" },
        build: { romFileName: "topdown-palettes.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      },
      events: [{
        id: "palette-demo",
        name: "palette-demo",
        category: "Sistema",
        steps: [
          { command: "set_background_palette 2 10" },
          { command: "set_sprite_palette 3 15" },
          { command: "restore_colors" }
        ]
      }]
    }));

    const script = contract.topdown_project?.scripts.find((entry) => entry.name === "palette-demo");
    expect(script?.script).toEqual([
      { op: "set_background_palette", index: 2, frames: 10 },
      { op: "set_sprite_palette", index: 3, frames: 15 },
      { op: "set_background_palette", index: 0, frames: 0 },
      { op: "set_sprite_palette", index: 0, frames: 0 }
    ]);
  });

  it("exports player on_update from eventBindings.onUpdate", () => {
    const contract = buildEngineExportProjectContract(project({
      actors: [
        { id: "actor-player", name: "Player", roomName: "start", x: 2, y: 2, eventBindings: { onUpdate: "player_tick" } }
      ],
      events: [{
        id: "event-player-tick",
        name: "player_tick",
        category: "Ator",
        steps: [{ command: "add_variable score 1" }]
      }],
      variables: [{ name: "score" }]
    }));

    expect(contract.topdown_project?.player.on_update).toEqual([
      { op: "add_variable", variable: 0, amount: 1 }
    ]);
  });

  it("does not warn for conditions that compile natively to the ROM", () => {
    const contract = buildEngineExportProjectContract(project({
      events: [{
        id: "event-guard",
        name: "guard",
        category: "Controle",
        steps: [{ command: "if_variable_variable score story.target" }]
      }]
    }));

    expect(contract.export_warnings).toBeUndefined();
  });

  it("exports dialogue_lines with emote and per-line audio metadata", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-blip", name: "text_blip.wav", kind: "Audio", metadata: { source: "Assets/audio/text_blip.wav" } },
        { id: "asset-confirm", name: "confirm.wav", kind: "Audio", metadata: { source: "Assets/audio/confirm.wav" } }
      ],
      audioItems: [
        { id: "audio-blip", name: "text_blip.wav", kind: "SFX", format: "WAV", exportID: "text_blip", loops: false },
        { id: "audio-confirm", name: "confirm.wav", kind: "SFX", format: "WAV", exportID: "confirm", loops: false }
      ],
      dialogues: [{
        key: "intro",
        text: "Ola",
        character: "Guia",
        portrait: "guide.png",
        emote: "Smile.png",
        textSound: "text_blip.wav",
        confirmSound: "confirm.wav"
      }]
    }));

    expect(contract.topdown_project?.dialogue_lines).toEqual([{
      text: "Ola",
      speaker: "Guia",
      portrait: "guide.png",
      key: "intro",
      emote: "Smile.png",
      text_sound: "text_blip.wav",
      confirm_sound: "confirm.wav",
      confirm_pcm: 1
    }]);
    expect(contract.topdown_project?.assets?.pcm_assets).toEqual([
      { asset: "project_audio", index: 0 },
      { asset: "project_audio", index: 1 }
    ]);
  });

  it("exports the three localized dialogue variants with Portuguese as the initial ROM language", () => {
    const contract = buildEngineExportProjectContract(project({
      localization: {
        sourceLocale: "en",
        defaultLocale: "pt-BR",
        enabledLocales: ["pt-BR", "en", "es"]
      },
      dialogues: [{
        key: "welcome",
        text: "Welcome, {player}!",
        translations: {
          "pt-BR": "Bem-vindo, {player}!",
          es: "Bienvenido, {player}!"
        },
        choices: ["Continue"],
        choiceTranslations: { "pt-BR": ["Continuar"], es: ["Continuar"] }
      }]
    }));

    expect(contract.topdown_project?.dialogue_lines).toEqual([{
      text: "Welcome, {player}!",
      speaker: "",
      portrait: "",
      key: "welcome",
      source_locale: "en",
      default_locale: "pt-BR",
      translations: [
        { locale: "pt-BR", text: "Bem-vindo, {player}!" },
        { locale: "es", text: "Bienvenido, {player}!" }
      ]
    }]);
    expect(contract.topdown_project?.choice_groups).toEqual([{
      line: 0,
      choices: [{
        text: "Continue",
        value: 1,
        source_locale: "en",
        default_locale: "pt-BR",
        translations: [
          { locale: "pt-BR", text: "Continuar" },
          { locale: "es", text: "Continuar" }
        ]
      }]
    }]);
  });

  it("prepends per-line textSound as set_text_sfx before show_dialogue", () => {
    const contract = buildEngineExportProjectContract(project({
      assets: [
        { id: "asset-blip", name: "text_blip.wav", kind: "Audio", metadata: { source: "Assets/audio/text_blip.wav" } }
      ],
      audioItems: [
        { id: "audio-blip", name: "text_blip.wav", kind: "SFX", format: "WAV", exportID: "text_blip", loops: false }
      ],
      dialogues: [{ key: "intro", text: "Ola", textSound: "text_blip.wav" }],
      events: [{
        id: "event-talk",
        name: "talk",
        category: "Dialogo",
        steps: [{ command: "show_dialogue intro" }]
      }]
    }));

    const script = contract.topdown_project?.scripts.find((entry) => entry.name === "talk")?.script;
    expect(script).toEqual([
      { op: "set_text_sfx", sfx: 0 },
      { op: "show_dialogue", dialogue: 0 }
    ]);
  });

  it("preserves declared project variable indexes in isometric event scripts", () => {
    const contract = buildEngineExportProjectContract(project({
      scenas: [{
        id: "room-market",
        name: "market",
        width: 8,
        height: 8,
        sceneType: "isometric",
        runtime: { type: "isometric", config: { tileWidth: 32, tileHeight: 16 } }
      }],
      variables: [
        { name: "story.chapter" },
        { name: "audio.music" },
        { name: "market.shortcut" }
      ],
      triggers: [{
        id: "trigger-market-bridge",
        name: "Market bridge",
        roomName: "market",
        x: 3,
        y: 4,
        width: 1,
        height: 1,
        eventBindings: { onInteract: "open_market_bridge" }
      }],
      events: [{
        id: "event-market-bridge",
        name: "open_market_bridge",
        category: "Trigger",
        steps: [{ command: "set_variable market.shortcut 1" }]
      }],
      settings: {
        general: { gameTitle: "Isometric variables", startScene: "market", startSceneType: "isometric", exportFolder: "build" },
        build: { romFileName: "isometric-variables.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 1, autoSave: false },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    }));

    expect(contract.isometric_project?.rooms[0]?.tile_events).toEqual([{
      area: { x: 3, y: 4, width: 1, height: 1 },
      on_interact: [{ op: "set_variable", variable: 2, value: 1 }]
    }]);
  });
});
