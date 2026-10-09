import { describe, expect, it } from "vitest";

import { SCENE_TYPE_OPTIONS } from "./sceneTypes.js";
import {
  SCENE_PREFLIGHT_PROFILE_IDS,
  buildScenePreflightReport,
  scenePreflightProfile,
  validateScenePreflightReport
} from "./scenePreflight.js";

describe("scene preflight contract", () => {
  it("declares a complete profile for every editor scene type and the extended rule profiles", () => {
    const profileIDs = new Set(SCENE_PREFLIGHT_PROFILE_IDS);
    for (const option of SCENE_TYPE_OPTIONS) {
      const profile = scenePreflightProfile(option.id);
      expect(profileIDs.has(profile.id)).toBe(true);
      expect(profile.perspective.projection).toBeTruthy();
      expect(profile.camera.mode).toBeTruthy();
      expect(profile.layers.length).toBeGreaterThan(0);
      expect(profile.editorTools.length).toBeGreaterThan(0);
      expect(profile.assets.length).toBeGreaterThan(0);
      expect(profile.verification.tests.length).toBeGreaterThan(0);
      expect(profile.verification.evidence.length).toBeGreaterThan(0);
      expect(profile.budget).toMatchObject({
        bgTiles: expect.any(Number),
        objTiles: expect.any(Number),
        oam: expect.any(Number),
        vramBytes: expect.any(Number),
        eventBytes: expect.any(Number),
        audioBytes: expect.any(Number),
        dmaBytes: expect.any(Number),
        vblankTicks: expect.any(Number),
        cpuWorkTicks: expect.any(Number)
      });
    }

    expect(scenePreflightProfile("custom", "puzzle").id).toBe("puzzle");
    expect(scenePreflightProfile("custom", "bossBattle").id).toBe("bossBattle");
    expect(scenePreflightProfile("custom", "tacticalGrid").id).toBe("tacticalGrid");
    expect(scenePreflightProfile("custom", "hybrid").id).toBe("hybrid");
  });

  it("builds a read-only report for every editor scene type without creating assets", () => {
    for (const option of SCENE_TYPE_OPTIONS) {
      const data = {
        scenas: [{ id: `scene-${option.id}`, name: `Scene ${option.id}`, sceneType: option.id, width: 30, height: 20 }],
        assets: []
      };
      const report = buildScenePreflightReport(data, `Scene ${option.id}`);

      expect(report.profileId).toBe(scenePreflightProfile(option.id).id);
      expect(report.sceneType).toBe(option.id);
      expect(validateScenePreflightReport(report)).toEqual([]);
      expect(data.assets).toEqual([]);
    }
  });

  it("reads declarative runtime layers for nodes, HUD and dialogue", () => {
    const worldMap = buildScenePreflightReport({
      scenas: [{
        name: "World",
        sceneType: "worldMap",
        runtime: {
          type: "worldMap",
          config: {
            navigable: true,
            nodes: [{ id: "home", name: "Casa", x: 40, y: 80 }],
            hudPresetId: "hud-map"
          }
        }
      }]
    }, "World");
    expect(worldMap.layers.find((layer) => layer.role === "nodes")).toMatchObject({ present: true });
    expect(worldMap.layers.find((layer) => layer.role === "hud")).toMatchObject({ present: true });

    const visualNovel = buildScenePreflightReport({
      scenas: [{
        name: "Chapter",
        sceneType: "visualNovel",
        runtime: { type: "visualNovel", config: { dialogueKey: "intro" } }
      }],
      dialogues: [{ key: "intro", sceneName: "Chapter", text: "Olá" }]
    }, "Chapter");
    expect(visualNovel.layers.find((layer) => layer.role === "dialogue")).toMatchObject({ present: true });
    expect(visualNovel.hud).toMatchObject({ present: true });
  });

  it("checks dialogue portraits instead of world actors in a visual novel", () => {
    const data = {
      scenas: [{
        name: "Council", sceneType: "visualNovel", backgroundAssetName: "council.png",
        eventBindings: { onInit: "council_enter" },
        runtime: { type: "visualNovel", config: { dialogueKey: "guardian" } }
      }],
      actors: [],
      events: [{ name: "council_enter", steps: [{ command: "show_dialogue nara" }] }],
      dialogues: [
        { key: "guardian", portrait: "guardian.png", text: "Accept?" },
        { key: "nara", portrait: "nara.png", text: "We arrived." }
      ],
      assets: [
        { name: "council.png", kind: "Background" },
        { name: "guardian.png", kind: "Sprite" },
        { name: "nara.png", kind: "Sprite" }
      ]
    };
    const ready = buildScenePreflightReport(data, "Council");
    expect(ready.assets.find((asset) => asset.id === "dialogue-portraits")).toMatchObject({ present: true });
    expect(ready.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REQUIRED_ASSET_MISSING", field: "assets.actor-sprites" })
    ]));

    const missing = buildScenePreflightReport({
      ...data,
      assets: data.assets.filter((asset) => asset.name !== "nara.png")
    }, "Council");
    expect(missing.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REQUIRED_ASSET_MISSING", field: "assets.dialogue-portraits" })
    ]));
  });

  it("exposes the native viewport and resident BG window for a streamed shmup map", () => {
    const report = buildScenePreflightReport({
      settings: { backgrounds: { defaultMapSize: "32x32" } },
      scenas: [{ name: "Wide", sceneType: "shmup", width: 60, height: 40 }]
    }, "Wide");

    expect(report.hardware).toMatchObject({
      viewport: { widthPixels: 240, heightPixels: 160, widthTiles: 30, heightTiles: 20 },
      effectiveMapSize: { id: "32x32", screenblocks: 1 },
      sceneType: "shmup"
    });
    expect(report.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "BACKGROUND_MAP_SIZE_EXPANDED", severity: "warning" })
    ]));
  });

  it("recognizes a menu runtime screen as an authored BG0 interface without a separate HUD reference", () => {
    const report = buildScenePreflightReport({
      scenas: [{
        name: "Main menu",
        sceneType: "menu",
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            title: "Main menu",
            items: [{ id: "start", label: "Start", action: "select" }]
          }
        }
      }]
    }, "Main menu");

    expect(report.layers.find((layer) => layer.role === "hud")).toMatchObject({ present: true });
    expect(report.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REQUIRED_LAYER_MISSING", field: "layers.hud" })
    ]));
  });

  it("resolves a HUD declared by the runtime asset", () => {
    const report = buildScenePreflightReport({
      scenas: [{
        name: "Fight",
        sceneType: "luta",
        runtime: { type: "luta", config: { hudAssetName: "fight-hud.png" } }
      }],
      assets: [{ name: "fight-hud.png", kind: "background" }]
    }, "Fight");

    expect(report.hud).toMatchObject({ present: true, presetId: "fight-hud.png" });
    expect(report.layers.find((layer) => layer.role === "hud")).toMatchObject({ present: true });
    expect(report.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REQUIRED_LAYER_MISSING", field: "layers.hud" })
    ]));
  });

  it("treats the point-and-click cursor actor as an OBJ HUD", () => {
    const report = buildScenePreflightReport({
      scenas: [{
        name: "Workshop",
        sceneType: "pointAndClick",
        playerActorName: "Cursor",
        backgroundAssetName: "workshop.png",
        runtime: { type: "pointAndClick", config: {} }
      }],
      actors: [{ name: "Cursor", roomName: "Workshop", spriteSheet: "cursor.png" }],
      assets: [
        { name: "workshop.png", kind: "background" },
        { name: "cursor.png", kind: "sprite" },
        { name: "font.png", kind: "font" }
      ]
    }, "Workshop");

    expect(report.layers.find((layer) => layer.role === "hud")).toMatchObject({
      hardwareLayer: "OBJ",
      present: true
    });
    expect(report.hud).toMatchObject({ present: true });
    expect(report.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REQUIRED_LAYER_MISSING", field: "layers.hud" })
    ]));
  });

  it("keeps the visual BG1 platform layer optional when collision covers the segment", () => {
    const report = buildScenePreflightReport({
      scenas: [{
        name: "Cliff",
        sceneType: "platformer",
        width: 2,
        height: 2,
        playerActorName: "Hero",
        backgroundAssetName: "cliff-bg.png",
        tileLayers: [{ mapping: "BG2", tilemap: [1, 2, 3, 4] }],
        collisionTypes: ["free", "solid", "solid", "free"],
        runtime: { type: "platformer", config: {} }
      }],
      actors: [{ name: "Hero", roomName: "Cliff", spriteSheet: "hero.png" }],
      assets: [
        { name: "cliff-bg.png", kind: "background" },
        { name: "hero.png", kind: "sprite" },
        { name: "music.mod", kind: "music" }
      ],
      audioItems: [{ name: "music.mod", kind: "music" }]
    }, "Cliff");

    expect(report.collision).toMatchObject({ declared: true, expectedCellCount: 4 });
    expect(report.layers.find((layer) => layer.role === "obstacles")).toMatchObject({
      hardwareLayer: "BG1",
      required: false,
      present: false
    });
    expect(report.obstacles.present).toBe(true);
    expect(report.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REQUIRED_LAYER_MISSING", field: "layers.obstacles" })
    ]));
  });

  it("uses the dedicated name-input profile for the portrait, keyboard and side-control subpage", () => {
    const report = buildScenePreflightReport({
      scenas: [{
        name: "Player name",
        sceneType: "menu",
        backgroundAssetName: "name-input.png",
        runtime: {
          type: "menu",
          config: {
            role: "name_input",
            screenType: "menu",
            textInput: {
              variableName: "player.name",
              maxLength: 8,
              keyboard: {
                layout: "grid",
                controlLayout: "side",
                controlsX: 25,
                controlsWidth: 5,
                controlsY: 8,
                controlsHeight: 6
              }
            }
          }
        }
      }],
      actors: [
        { name: "Male portrait", roomName: "Player name", menuVisibilityVariable: "player.gender", menuVisibilityValue: 0 },
        { name: "Female portrait", roomName: "Player name", menuVisibilityVariable: "player.gender", menuVisibilityValue: 1 }
      ],
      assets: [
        { name: "name-input.png", kind: "background" },
        { name: "portrait.png", kind: "sprite" },
        { name: "font.png", kind: "font" },
        { name: "music.mod", kind: "music" }
      ],
      audioItems: [{ name: "music.mod", kind: "music" }]
    }, "Player name");

    expect(report.profileId).toBe("menuNameInput");
    expect(report.hud.elements).toEqual(["character-card", "name-field", "keyboard", "side-controls"]);
    expect(report.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "NAME_INPUT_SIDE_CONTROLS_MISSING" }),
      expect.objectContaining({ code: "NAME_INPUT_PORTRAITS_MISSING" })
    ]));
  });

  it("uses the dedicated gender-selection profile and requires both character actors", () => {
    const report = buildScenePreflightReport({
      scenas: [{
        name: "Gender selection",
        sceneType: "menu",
        backgroundAssetName: "gender-selection.png",
        runtime: {
          type: "menu",
          config: {
            role: "gender_select",
            screenType: "menu",
            items: [
              { id: "male", label: "Homem", action: "select" },
              { id: "female", label: "Mulher", action: "select" },
              { id: "confirm", label: "Confirmar", action: "select" }
            ]
          }
        }
      }],
      actors: [
        { name: "PERSONAGEM HOMEM", roomName: "Gender selection", menuItemID: "male", spriteSheet: "player-male.png" },
        { name: "PERSONAGEM MULHER", roomName: "Gender selection", menuItemID: "female", spriteSheet: "player-female.png" },
        { name: "Seta", roomName: "Gender selection", menuActorRole: "cursor", spriteSheet: "cursor.png" }
      ],
      assets: [
        { name: "gender-selection.png", kind: "background" },
        { name: "font.png", kind: "font" },
        { name: "music.mod", kind: "music" }
      ],
      audioItems: [{ name: "music.mod", kind: "music" }]
    }, "Gender selection");

    expect(report.profileId).toBe("menuGenderSelect");
    expect(report.hud.elements).toEqual(["title", "character-options", "labels", "cursor", "confirm"]);
    expect(report.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "GENDER_SELECTION_ITEMS_MISSING" }),
      expect.objectContaining({ code: "GENDER_SELECTION_ACTORS_MISSING" })
    ]));
  });

  it("avisa quando a escolha de gênero não possui os dois sprites de personagem", () => {
    const report = buildScenePreflightReport({
      scenas: [{
        name: "Incomplete gender selection",
        sceneType: "menu",
        backgroundAssetName: "gender-selection.png",
        runtime: { type: "menu", config: { role: "gender_select", items: [{ id: "male" }, { id: "female" }, { id: "confirm" }] } }
      }],
      actors: [
        { name: "HOMEM", roomName: "Incomplete gender selection", menuItemID: "male", spriteSheet: "menu-male.png" },
        { name: "MULHER", roomName: "Incomplete gender selection", menuItemID: "female", spriteSheet: "menu-female.png" }
      ],
      assets: [{ name: "gender-selection.png", kind: "background" }, { name: "font.png", kind: "font" }]
    }, "Incomplete gender selection");

    expect(report.profileId).toBe("menuGenderSelect");
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "GENDER_SELECTION_ACTORS_MISSING", severity: "warning" })
    ]));
  });

  it("warns when an affine scene binds a HUD preset that shares BG0 screenblocks", () => {
    const conflict = buildScenePreflightReport({
      scenas: [{
        name: "Affine",
        sceneType: "topdown",
        hudPresetId: "hud-test",
        runtime: {
          type: "topdown",
          config: {
            affine: { enabled: true, assetId: "affine.png", layer: "BG2" }
          }
        }
      }]
    }, "Affine");

    expect(conflict.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "AFFINE_HUD_CONFLICT", severity: "warning" })
    ]));

    const clean = buildScenePreflightReport({
      scenas: [{
        name: "Affine",
        sceneType: "topdown",
        runtime: {
          type: "topdown",
          config: {
            affine: { enabled: true, assetId: "affine.png", layer: "BG2" }
          }
        }
      }]
    }, "Affine");

    expect(clean.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "AFFINE_HUD_CONFLICT" })
    ]));
  });

  it("seleciona perfis dedicados para cada subpágina do menu in-game", () => {
    const roles = [
      ["start", "menuStart"],
      ["mission_board", "menuMissions"],
      ["inventory", "menuInventory"],
      ["map", "menuMap"],
      ["profile", "menuProfile"],
      ["save", "menuSave"]
    ] as const;
    for (const [role, profileID] of roles) {
      const report = buildScenePreflightReport({
        scenas: [{
          name: `In-game ${role}`,
          sceneType: "menu",
          backgroundAssetName: "menu-bg.png",
          runtime: {
            type: "menu",
            config: {
              role,
              screenType: "menu",
              menuProfile: "in_game",
              entryPolicy: "gameplay",
              returnPolicy: "resume",
              suspendsGameplay: true,
              items: [{ id: "back", label: "Voltar" }],
              ...(role === "map" ? { nodes: [{ id: "porto", name: "Porto" }] } : {})
            }
          }
        }],
        actors: [],
        assets: [{ name: "menu-bg.png", kind: "background" }, { name: "font.png", kind: "font" }]
      }, `In-game ${role}`);
      expect(report.profileId).toBe(profileID);
      expect(report.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "IN_GAME_MENU_ACTOR_ROLE_MISSING", severity: "warning" })
      ]));
    }
  });

  it("exige o contrato mínimo do Menu Start, incluindo Voltar e ciclo de retomada", () => {
    const report = buildScenePreflightReport({
      scenas: [{
        name: "Start scene",
        sceneType: "menu",
        backgroundAssetName: "menu-start-v2.png",
        runtime: {
          type: "menu",
          config: {
            role: "start",
            screenType: "menu",
            menuProfile: "in_game",
            entryPolicy: "gameplay",
            returnPolicy: "resume",
            suspendsGameplay: true,
            items: ["missions", "inventory", "map", "profile", "save", "back"].map((id) => ({ id, label: id }))
          }
        }
      }],
      actors: [{ name: "Cursor", roomName: "Start scene", menuActorRole: "cursor", spriteSheet: "cursor.png" }],
      assets: [{ name: "menu-start-v2.png", kind: "background" }, { name: "font.png", kind: "font" }]
    }, "Start scene");
    expect(report.profileId).toBe("menuStart");
    expect(report.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "IN_GAME_MENU_LIFECYCLE_INCOMPLETE" }),
      expect.objectContaining({ code: "IN_GAME_MENU_ITEM_MISSING", field: "items" })
    ]));
  });

  it("marks missing required HUD and assets for review instead of complete", () => {    const report = buildScenePreflightReport({
      scenas: [{ name: "Fight", sceneType: "luta", width: 30, height: 20 }],
      assets: []
    }, "Fight");

    expect(report.checklist.find((item) => item.id === "hud")).toMatchObject({ state: "review" });
    expect(report.checklist.find((item) => item.id === "assets")).toMatchObject({ state: "review" });
    expect(report.obstacles).toMatchObject({ present: false });
  });

  it("derives the same report shape without enabling omitted capabilities", () => {
    const report = buildScenePreflightReport({
      scenas: [{
        id: "arena",
        name: "Arena",
        sceneType: "luta",
        width: 40,
        height: 20,
        tilemap: [1, 2, 3],
        collisionTypes: ["solid", "free", "free"],
        playerActorName: "Hero",
        backgroundAssetName: "arena.png",
        runtime: { type: "luta", config: {} }
      }],
      actors: [
        { id: "hero", name: "Hero", roomName: "Arena", spriteSheet: "hero.png" },
        { id: "rival", name: "Rival", roomName: "Arena", spriteSheet: "rival.png" }
      ],
      triggers: [{ id: "round", name: "Round", roomName: "Arena", eventName: "round_start" }],
      events: [{ id: "event", name: "round_start", roomName: "Arena", commands: ["start_round"] }],
      assets: [
        { id: "background", name: "arena.png", kind: "background" },
        { id: "hero", name: "hero.png", kind: "sprite" },
        { id: "rival", name: "rival.png", kind: "sprite" }
      ],
      audioItems: [{ id: "music", name: "arena.ogg", kind: "music" }]
    });

    expect(report).toMatchObject({
      schema: 1,
      sceneName: "Arena",
      sceneType: "luta",
      profileId: "luta",
      perspective: { projection: "orthographic", orientation: "side" },
      player: { required: true, present: true, actorName: "Hero" },
      actors: { count: 2 },
      collision: {
        independentOfArt: true,
        expectedCellCount: 800,
        actualCellCount: 3,
        declared: false
      },
      enabledCapabilities: []
    });
    expect(report.layers.some((layer) => layer.hardwareLayer === "OBJ" && layer.role === "actors")).toBe(true);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "COLLISION_META_GRID_INCOMPLETE", severity: "warning" })
    ]));
  });

  it("keeps structural fixtures visibly separate from production preflight", () => {
    const report = buildScenePreflightReport({
      fixture: {
        schema: 1,
        registry: "gba-studio-complete-structural-fixture",
        mode: "structural",
        productionReady: false
      },
      scenas: [{ name: "Fixture", sceneType: "menu" }]
    }, "Fixture");

    expect(report.fixture).toEqual({
      registry: "gba-studio-complete-structural-fixture",
      mode: "structural",
      productionReady: false
    });
    expect(validateScenePreflightReport(report)).toEqual([]);
  });

  it("marks explicit malformed preflight data as blocked and validates the public report", () => {
    const report = buildScenePreflightReport({
      scenas: [{
        name: "Custom",
        sceneType: "custom",
        preflight: { profileId: "puzzle" },
        runtime: { type: "custom", config: { modules: [{ id: "movement", enabled: true, settings: {} }] } }
      }]
    });
    expect(report.profileId).toBe("puzzle");
    expect(report.status).toBe("review");
    expect(validateScenePreflightReport(report)).toEqual([]);

    const invalid = { ...report, profileId: "not-a-profile" };
    expect(validateScenePreflightReport(invalid)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "UNKNOWN_PROFILE", severity: "error" })
    ]));

    const incomplete = { ...report } as Record<string, unknown>;
    delete incomplete.requiredEditorTools;
    expect(validateScenePreflightReport(incomplete)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INVALID_EDITOR_TOOLS", field: "requiredEditorTools" })
    ]));

    expect(validateScenePreflightReport({ ...report, profileId: "puzzle", sceneType: "luta" })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INCOMPATIBLE_PROFILE", severity: "error" })
    ]));

    const incompatibleReport = buildScenePreflightReport({
      scenas: [{ name: "Wrong profile", sceneType: "luta", preflight: { profileId: "puzzle" } }]
    }, "Wrong profile");
    expect(incompatibleReport).toMatchObject({ status: "blocked" });
    expect(incompatibleReport.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INCOMPATIBLE_PROFILE", severity: "error" })
    ]));
  });

  it("infers the tacticalGrid profile for an isometric tactical scene without enabling capabilities", () => {
    const report = buildScenePreflightReport({
      scenas: [{
        name: "Tactical arena",
        sceneType: "isometric",
        width: 12,
        height: 8,
        runtime: { type: "isometric", config: { gameplayMode: "tactical" } }
      }]
    }, "Tactical arena");

    expect(report.profileId).toBe("tacticalGrid");
    expect(report.enabledCapabilities).toEqual([]);
    expect(report.layers.map((layer) => layer.hardwareLayer)).toEqual([
      "BG2", "BG1", "OBJ", "BG0", "scene_data"
    ]);
  });

  it("reports a tactical capability asset separately from generic scene assets", () => {
    const report = buildScenePreflightReport({
      scenas: [{
        name: "Tactical assets",
        sceneType: "isometric",
        width: 12,
        height: 8,
        collisionTypes: Array.from({ length: 96 }, () => "free"),
        runtime: {
          type: "isometric",
          config: {
            gameplayMode: "tactical",
            tacticalCapabilities: [{ id: "tactical_units", enabled: true, required: true, settings: {} }],
            tacticalPresentation: { schema: 1, units: [] }
          }
        }
      }]
    }, "Tactical assets");

    expect(report.profileId).toBe("tacticalGrid");
    expect(report.enabledCapabilities).toContain("tactical_units");
    expect(report.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "tactical-tactical_units", state: "missing", required: true })
    ]));
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REQUIRED_ASSET_MISSING", field: "assets.tactical-tactical_units" })
    ]));
  });

  it("resolves a paged tactical surface as the BG2 asset requirement", () => {
    const pages = ["surface-r0c0.png", "surface-r0c1.png", "surface-r1c0.png", "surface-r1c1.png"];
    const report = buildScenePreflightReport({
      scenas: [{
        name: "Paged tactical arena",
        sceneType: "isometric",
        width: 30,
        height: 20,
        runtime: {
          type: "isometric",
          config: {
            gameplayMode: "tactical",
            tacticalCapabilities: [{ id: "tactical_surface", enabled: true, required: true, settings: {} }],
            tacticalPresentation: {
              schema: 1,
              surfacePages: pages.map((asset, index) => ({
                id: `page-${index}`,
                asset,
                bankGroup: `arena-page-${index}`,
                world: { x: index % 2 * 240, y: Math.floor(index / 2) * 160, width: 240, height: 160 }
              })),
              surfaceResidency: {
                exclusiveBankGroups: ["arena-page-0", "arena-page-1", "arena-page-2", "arena-page-3"],
                maxResidentGroups: 1,
                prefetchMarginPixels: 32
              },
              units: [],
              props: []
            }
          }
        }
      }],
      assets: pages.map((name) => ({ id: name, name, kind: "background" }))
    }, "Paged tactical arena");

    expect(report.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "tactical-tactical_surface", state: "present", present: true })
    ]));
    expect(report.layers.find((layer) => layer.id === "surface")).toMatchObject({ present: true });
    expect(report.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REQUIRED_ASSET_MISSING", field: "assets.tactical-tactical_surface" })
    ]));
  });
});
