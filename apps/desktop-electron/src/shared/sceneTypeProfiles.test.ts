import { describe, expect, it } from "vitest";

import {
  defaultSceneRuntime,
  normalizeIsometricSceneConfig,
  normalizeSceneRuntime,
  resolveSceneControlledEntityContract,
  resolveSceneRuntime,
  sceneTypeProfile
} from "./sceneTypeProfiles.js";
import {
  ISOMETRIC_GAMEPLAY_MODE_OPTIONS,
  ISOMETRIC_SCENE_PROFILE_OPTIONS
} from "./isometricProfiles.js";
import { resolveSceneRuntimeExport } from "./sceneRuntimeExport.js";
import { SCENE_TYPE_OPTIONS } from "./sceneTypes.js";
import {
  SCENE_CAPABILITY_REGISTRY,
  SCENE_FEATURE_MODULES,
  resolveDungeonCrawlerFeatureRuntime,
  resolveShmupFeatureRuntime,
  resolveSceneCapabilityManifest,
  resolveSceneFeatureModules,
  resolveTopdownFeatureRuntime,
  validateSceneBudget
} from "./sceneFeatureModules.js";

describe("scene type profiles", () => {
  it.each([
    ["topdown", "character", true],
    ["platformer", "character", true],
    ["isometric", "character", true],
    ["dungeonCrawler", "none", false],
    ["racing", "vehicle", true],
    ["pointAndClick", "cursor", true],
    ["shmup", "ship", true],
    ["visualNovel", "none", false],
    ["menu", "none", false],
    ["cutscene", "none", false],
    ["worldMap", "marker", false],
    ["battleRpg", "none", false],
    ["luta", "fighter", true],
    ["custom", "none", false]
  ])("exposes the canonical controlled entity contract for %s", (sceneType, role, required) => {
    expect(sceneTypeProfile(sceneType).controlledEntityContract).toMatchObject({
      sceneType,
      role,
      required
    });
  });

  it("uses the canonical runtime export kind for every visible scene type", () => {
    for (const { id } of SCENE_TYPE_OPTIONS) {
      expect(sceneTypeProfile(id).exportKind).toBe(resolveSceneRuntimeExport(id).kind);
    }
  });

  it("separa o modo isométrico de aventura do núcleo tático suportado", () => {
    expect(ISOMETRIC_GAMEPLAY_MODE_OPTIONS).toEqual([
      expect.objectContaining({ id: "adventure", supported: true }),
      expect.objectContaining({ id: "tactical", supported: true })
    ]);
    expect(normalizeIsometricSceneConfig({
      gameplayMode: "tactical",
      tactical: {
        enabled: true,
        activeTeam: "player",
        units: [
          { actorIndex: 0, team: "player", moveRange: 2, attackRange: 1, maxHp: 4, attackPower: 1 },
          { actorIndex: 1, team: "enemy", moveRange: 2, attackRange: 1, maxHp: 4, attackPower: 1 }
        ]
      }
    }).gameplayMode).toBe("tactical");
  });

  it("exposes reusable feature modules and GBA-safe budgets per scene profile", () => {
    expect(SCENE_FEATURE_MODULES).toEqual([
      "movement", "dialogue", "quests", "shop", "battle", "waves", "score", "inventory", "camera", "compass", "map"
    ]);
    expect(sceneTypeProfile("shmup").capabilities).toMatchObject({
      featureModules: ["movement", "score", "waves", "camera"],
      runtimeCapabilities: expect.arrayContaining([
        "shmup_score", "shmup_waves", "shmup_hud_bg0", "shmup_actor_obj", "shmup_collision_data"
      ]),
      assetRules: expect.arrayContaining(["affine_bg_8bpp_optional"]),
      preview: { mode: "play", overlays: expect.arrayContaining(["hud", "obstacles", "collision"]) }
    });
    expect(sceneTypeProfile("isometric").capabilities.runtimeCapabilities).toContain("isometric_tactical_core");
    expect(sceneTypeProfile("topdown").capabilities.featureModules).toEqual([
      "movement", "dialogue", "inventory", "quests", "shop", "camera"
    ]);
    expect(sceneTypeProfile("dungeonCrawler").capabilities.featureModules).toEqual([
      "movement", "dialogue", "inventory", "battle", "compass", "map", "camera"
    ]);
    expect(sceneTypeProfile("dungeonCrawler").capabilities.runtimeCapabilities).toEqual(expect.arrayContaining([
      "dungeon_compass", "dungeon_map"
    ]));
    expect(sceneTypeProfile("shmup").capabilities.budget.vramBytes).toBeGreaterThan(0);
  });

  it("normalizes profile defaults and rejects unknown or incompatible modules", () => {
    expect(resolveSceneFeatureModules("shmup").issues).toEqual([]);
    expect(resolveSceneFeatureModules("shmup").modules).toEqual([]);

    const result = resolveSceneFeatureModules("shmup", [
      { id: "waves", enabled: true, settings: { maxWaves: 4 } },
      { id: "shop", enabled: true, settings: {} },
      { id: "not-a-module", enabled: true, settings: {} }
    ]);
    expect(result.modules).toEqual([
      { id: "waves", enabled: true, settings: { maxWaves: 4 } }
    ]);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INCOMPATIBLE_MODULE", module: "shop" }),
      expect.objectContaining({ code: "UNKNOWN_MODULE", module: "not-a-module" })
    ]));
  });

  it("does not enable a feature module when enabled is omitted", () => {
    const resolution = resolveSceneFeatureModules("shmup", [
      { id: "score", settings: { pointsPerEnemy: 250 } }
    ]);

    expect(resolution.modules).toEqual([]);
    expect(resolution.issues).toEqual([
      expect.objectContaining({
        code: "INVALID_MODULE_CONFIG",
        module: "score",
        message: expect.stringContaining("enabled=true ou enabled=false explícito")
      })
    ]);
    expect(resolveSceneCapabilityManifest("shmup", [
      { id: "score", settings: { pointsPerEnemy: 250 } }
    ]).capabilities.find((capability) => capability.id === "score")).toMatchObject({
      status: { enabled: false }
    });
  });

  it("keeps one typed capability registry with explicit opt-in state and verification metadata", () => {
    const score = SCENE_CAPABILITY_REGISTRY.find((capability) => capability.id === "score");
    expect(score).toMatchObject({
      sceneProfiles: expect.arrayContaining(["shmup"]),
      available: true,
      required: false,
      verified: true,
      assets: expect.arrayContaining([expect.objectContaining({ kind: "actor_sprite", required: true })]),
      editorTools: expect.arrayContaining(["actor"]),
      budget: expect.objectContaining({ cpuWorkTicks: expect.any(Number), eventBytes: expect.any(Number) }),
      fallback: expect.any(String),
      verification: {
        tests: expect.arrayContaining([expect.stringContaining("sceneTypeProfiles")]),
        evidence: expect.arrayContaining([expect.any(String)])
      }
    });
    expect(Object.keys(score?.budget ?? {})).toEqual(expect.arrayContaining([
      "bgTiles", "objTiles", "oam", "paletteColors", "vramBytes", "eventBytes",
      "audioBytes", "dmaBytes", "vblankTicks", "cpuWorkTicks"
    ]));

    const absent = resolveSceneCapabilityManifest("shmup");
    expect(absent.issues).toEqual([]);
    expect(absent.capabilities.find((capability) => capability.id === "score")).toMatchObject({
      status: { available: true, enabled: false, required: false, verified: true }
    });

    const explicit = resolveSceneCapabilityManifest("shmup", [
      { id: "score", enabled: true, settings: { pointsPerEnemy: 250 } }
    ]);
    expect(explicit.capabilities.find((capability) => capability.id === "score")).toMatchObject({
      status: { available: true, enabled: true, required: false, verified: true },
      settings: { pointsPerEnemy: 250 }
    });
  });

  it("rejects budgets above the profile limit and reports missing authoring tools", () => {
    expect(validateSceneBudget("shmup", { oam: 9999 })).toEqual([
      expect.objectContaining({ code: "BUDGET_EXCEEDED", field: "oam" })
    ]);
    expect(resolveSceneFeatureModules("topdown", [
      { id: "quests", enabled: true, settings: { objective: "open" } }
    ], ["select", "paint"]).issues).toEqual([
      expect.objectContaining({ code: "MISSING_EDITOR_TOOL", field: "trigger" })
    ]);
  });

  it("resolves top-down quest and shop modules into native runtime semantics", () => {
    expect(resolveTopdownFeatureRuntime([
      { id: "inventory", enabled: true, settings: {} },
      { id: "quests", enabled: true, settings: { stateVariable: 4, objectiveItem: 2, rewardItem: 3 } },
      { id: "shop", enabled: true, settings: { label: "POTION", item: 5, currencyItem: 1, price: 7 } }
    ])).toEqual({
      inventoryEnabled: true,
      questsEnabled: true,
      shopEnabled: true,
      quest: {
        stateVariable: 4,
        activeValue: 1,
        completedValue: 2,
        objectiveItem: 2,
        objectiveQuantity: 1,
        rewardItem: 3,
        rewardQuantity: 1
      },
      shop: {
        label: "POTION",
        item: 5,
        currencyItem: 1,
        price: 7,
        stockVariable: -1,
        stock: 0
      }
    });
  });

  it("preserves event variable slots beyond the telemetry window for top-down modules", () => {
    expect(resolveTopdownFeatureRuntime([
      { id: "quests", enabled: true, settings: { stateVariable: 17 } },
      { id: "shop", enabled: true, settings: { stockVariable: 18 } }
    ])).toMatchObject({
      quest: expect.objectContaining({ stateVariable: 17 }),
      shop: expect.objectContaining({ stockVariable: 18 })
    });
  });

  it("keeps dungeon crawler inventory, battle, and depth rendering independently configurable", () => {
    expect(resolveDungeonCrawlerFeatureRuntime([
      {
        id: "inventory",
        enabled: false,
        settings: { item: 2, label: "CÉLULA", initialQuantity: 1, healAmount: 1 }
      },
      {
        id: "battle",
        enabled: true,
        settings: {
          enemyActor: "Sentinela da Usina",
          enemyName: "SENTINELA",
          maxHp: 3,
          playerDamage: 1,
          enemyDamage: 1,
          rewardItem: 3,
          rewardQuantity: 1
        }
      },
      { id: "compass", enabled: true, settings: {} },
      { id: "map", enabled: true, settings: {} },
      { id: "movement", enabled: true, settings: { depthSprites: false } }
    ])).toEqual({
      inventoryEnabled: false,
      battleEnabled: true,
      compassEnabled: true,
      mapEnabled: true,
      depthSpritesEnabled: false,
      inventory: {
        item: 2,
        label: "CÉLULA",
        initialQuantity: 1,
        healAmount: 1
      },
      battle: {
        enemyActor: "Sentinela da Usina",
        enemyName: "SENTINELA",
        maxHp: 3,
        playerDamage: 1,
        enemyDamage: 1,
        rewardItem: 3,
        rewardQuantity: 1
      }
    });
  });

  it.each([
    "menu",
    "visualNovel",
    "worldMap",
    "battleRpg",
    "luta",
    "pointAndClick",
    "shmup",
    "cutscene"
  ])("mantém colisão e gatilho disponíveis para autoria em %s", (sceneType) => {
    const profile = sceneTypeProfile(sceneType);
    expect(profile.editorTools).toEqual(expect.arrayContaining([
      "select", "paint", "collision", "actor", "trigger", "room"
    ]));
    expect(profile.collisionTypes).toEqual(expect.arrayContaining(["free", "solid", "event"]));
  });

  it("mantém atores, câmera, colisão e gatilhos de diálogo na cutscene", () => {
    expect(sceneTypeProfile("cutscene")).toMatchObject({
      editorTools: ["select", "paint", "collision", "actor", "trigger", "camera", "room"],
      collisionTypes: expect.arrayContaining(["solid", "event"])
    });
  });

  it("adds height only to isometric gameplay authoring", () => {
    expect(sceneTypeProfile("isometric").editorTools).toContain("height");
    expect(sceneTypeProfile("topdown").editorTools).not.toContain("height");
  });

  it("describes platformer authoring tools and engine collision effects", () => {
    expect(sceneTypeProfile("platformer")).toMatchObject({
      id: "platformer",
      exportKind: "platformer",
      editorTools: ["select", "paint", "collision", "actor", "trigger", "camera", "room"],
      collisionTypes: expect.arrayContaining(["solid", "down", "up", "damage", "ladder", "slope_up_right", "slope_up_left"])
    });
    expect(sceneTypeProfile("platformer").collisionTypes).not.toContain("water");
    expect(sceneTypeProfile("platformer").collisionTypes).not.toContain("event");
    expect(sceneTypeProfile("racing").collisionTypes).toEqual(expect.arrayContaining(["water", "damage"]));
  });

  it("creates and normalizes the discriminated platformer runtime config", () => {
    expect(defaultSceneRuntime("platformer")).toEqual({ type: "platformer", config: {} });

    expect(normalizeSceneRuntime("platformer", {
      type: "platformer",
      config: {
        gravity: 0.75,
        coyoteTime: 999,
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
        wallSlideSpeed: 999,
        dash: true,
        dashFrames: 999,
        glide: true
      }
    })).toEqual({
      type: "platformer",
      config: {
        gravity: 0.75,
        coyoteTime: 255,
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
        wallSlideSpeed: 32,
        dash: true,
        dashFrames: 255,
        glide: true
      }
    });
  });

  it("creates and normalizes the point-and-click room runtime config", () => {
    expect(defaultSceneRuntime("pointAndClick")).toEqual({ type: "pointAndClick", config: {} });

    expect(normalizeSceneRuntime("pointAndClick", {
      type: "pointAndClick",
      config: { cursorSpeed: 3.5, hotspotPadding: 999 }
    })).toEqual({
      type: "pointAndClick",
      config: { cursorSpeed: 3.5, hotspotPadding: 32 }
    });
  });

  it("creates and normalizes explicit menu scene screens and click boxes", () => {
    expect(defaultSceneRuntime("menu")).toEqual({ type: "menu", config: {} });

    expect(normalizeSceneRuntime("menu", {
      type: "menu",
      config: {
        screenType: "title",
        role: "title",
        title: "Title Screen",
        items: [{ id: "start", label: "Press Start", clickBox: { x: 88, y: 112, width: 64, height: 24 } }]
      }
    })).toEqual({
      type: "menu",
      config: {
        screenType: "title",
        role: "title",
        title: "Title Screen",
        autoAdvanceFrames: 0,
        allowSkip: true,
        menuProfile: "initial",
        entryPolicy: "title",
        returnPolicy: "title",
        suspendsGameplay: false,
        presentationMode: "scene",
        nextScreenID: "",
        titleOverlayAssetName: "",
        titleFadeFrames: 0,
        items: [expect.objectContaining({
          id: "start",
          label: "Press Start",
          clickBox: { x: 88, y: 112, width: 64, height: 24 }
        })]
      }
    });
  });

  it("creates and normalizes the shoot-em-up wave runtime config", () => {
    expect(defaultSceneRuntime("shmup")).toEqual({ type: "shmup", config: {} });

    expect(normalizeSceneRuntime("shmup", {
      type: "shmup",
      config: { playerSpeed: 3.5, fireCooldown: 0, scrollSpeed: 99 }
    })).toEqual({
      type: "shmup",
      config: { playerSpeed: 3.5, fireCooldown: 1, scrollSpeed: 16 }
    });
  });

  it("preserves an authored SHMUP wave plan with bounded overrides", () => {
    expect(normalizeSceneRuntime("shmup", {
      type: "shmup",
      config: {
        wavePlan: [
          { name: "entrada", startFrame: 0, scrollSpeed: 1 },
          { name: "nucleo", startFrame: 90, scrollSpeed: 2, playerSpeed: 3, fireCooldown: 6 }
        ]
      }
    })).toEqual({
      type: "shmup",
      config: {
        wavePlan: [
          { name: "entrada", startFrame: 0, scrollSpeed: 1 },
          { name: "nucleo", startFrame: 90, scrollSpeed: 2, playerSpeed: 3, fireCooldown: 6 }
        ]
      }
    });
  });

  it("persists only valid reusable modules in the scene runtime config", () => {
    expect(normalizeSceneRuntime("shmup", {
      type: "shmup",
      config: {
        modules: [
          { id: "score", enabled: true, settings: { pointsPerEnemy: 100 } },
          { id: "shop", enabled: true, settings: {} },
          { id: "waves", enabled: false, settings: { maxWaves: 5 } }
        ]
      }
    })).toEqual({
      type: "shmup",
      config: {
        modules: [
          { id: "score", enabled: true, settings: { pointsPerEnemy: 100 } },
          { id: "waves", enabled: false, settings: { maxWaves: 5 } }
        ]
      }
    });
    expect((resolveSceneRuntime("shmup", {
      type: "shmup",
      config: { modules: [{ id: "waves", enabled: true, settings: { maxWaves: 3 } }] }
    }).config as { modules?: unknown[] }).modules).toEqual([
      { id: "waves", enabled: true, settings: { maxWaves: 3 } }
    ]);
    expect((normalizeSceneRuntime("topdown", {
      type: "topdown",
      config: { modules: [{ id: "shop", enabled: true, settings: { currency: "gold" } }] }
    }).config as { modules?: unknown[] }).modules).toEqual([
      { id: "shop", enabled: true, settings: { currency: "gold" } }
    ]);
  });

  it("resolves SHMUP score and wave module settings into native runtime defaults", () => {
    expect(resolveShmupFeatureRuntime()).toEqual({
      scoreEnabled: false,
      highScoreEnabled: false,
      initialScore: 0,
      pointsPerEnemy: 100,
      initialLives: 3,
      wavesEnabled: false,
      maxWaves: 64,
      loopWaves: false
    });

    expect(resolveShmupFeatureRuntime([
      { id: "score", enabled: true, settings: { initialScore: 250, pointsPerEnemy: 250, initialLives: 5, persistHighScore: false } },
      { id: "waves", enabled: true, settings: { maxWaves: 3, loop: true } }
    ])).toEqual({
      scoreEnabled: true,
      highScoreEnabled: false,
      initialScore: 250,
      pointsPerEnemy: 250,
      initialLives: 5,
      wavesEnabled: true,
      maxWaves: 3,
      loopWaves: true
    });

    expect(resolveShmupFeatureRuntime([
      { id: "score", enabled: false, settings: { initialScore: 999999, pointsPerEnemy: 999999, initialLives: -1 } },
      { id: "waves", enabled: false, settings: { maxWaves: 0, loop: true } }
    ])).toEqual({
      scoreEnabled: false,
      highScoreEnabled: false,
      initialScore: 65535,
      pointsPerEnemy: 65535,
      initialLives: 0,
      wavesEnabled: false,
      maxWaves: 1,
      loopWaves: false
    });
  });

  it("creates, normalizes and resolves the isometric room grid", () => {
    expect(defaultSceneRuntime("isometric")).toEqual({ type: "isometric", config: {} });

    expect(normalizeSceneRuntime("isometric", {
      type: "isometric",
      config: { tileWidth: 23, tileHeight: 7, originX: -999, originY: 999, presentationZoom: 999 }
    })).toEqual({
      type: "isometric",
      config: {
        tileWidth: 24,
        tileHeight: 12,
        originX: -512,
        originY: 512,
        presentationZoom: 400
      }
    });

    expect(resolveSceneRuntime("isometric", {
      type: "isometric",
      config: { tileWidth: 32, originY: 24 }
    }, {
      isometric: { tileWidth: "16 px", tileHeight: "8 px" }
    })).toEqual({
      type: "isometric",
      config: {
        tileWidth: 32,
        tileHeight: 16,
        heightStep: 8,
        originX: 120,
        originY: 24,
        presentationZoom: 100,
        worldMode: "scrollable_tiled_world",
        gameplayMode: "adventure",
        profile: "diamond-2to1",
        projection: "diamond",
        movement: "free",
        heightMode: "levels"
      }
    });

    expect(normalizeSceneRuntime("isometric", {
      type: "isometric",
      config: { tileWidth: 16, tileHeight: 99 }
    })).toEqual({
      type: "isometric",
      config: { tileWidth: 16, tileHeight: 8 }
    });

    expect(normalizeSceneRuntime("isometric", {
      type: "isometric",
      config: { worldMode: "static_composition" }
    })).toEqual({
      type: "isometric",
      config: { worldMode: "static_composition" }
    });
  });

  it("keeps the runtime profile explicit and exposes unsupported profiles as disabled", () => {
    expect(ISOMETRIC_SCENE_PROFILE_OPTIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "diamond-2to1",
        movement: "free",
        projection: "diamond",
        supported: true
      }),
      expect.objectContaining({
        id: "staggered-free",
        supported: false
      })
    ]));
    expect(normalizeSceneRuntime("isometric", {
      type: "isometric",
      config: {
        heightMode: "flat",
        movement: "free",
        profile: "staggered-free",
        projection: "staggered"
      }
    })).toMatchObject({
      config: {
        heightMode: "levels",
        movement: "free",
        profile: "diamond-2to1",
        projection: "diamond"
      }
    });
  });

  it("persists the tactical opt-in and presentation without inventing assets", () => {
    expect(normalizeSceneRuntime("isometric", {
      type: "isometric",
      config: {
        gameplayMode: "tactical",
        tacticalCapabilities: [{ id: "tactical_units", enabled: true, settings: {} }],
        tacticalPresentation: {
          schema: 1,
          units: [{ actorId: "nara", sheet: "nara.png" }],
          props: []
        }
      }
    })).toMatchObject({
      type: "isometric",
      config: {
        gameplayMode: "tactical",
        tacticalCapabilities: [{ id: "tactical_units", enabled: true, settings: {} }],
        tacticalPresentation: {
          schema: 1,
          units: [{ actorId: "nara", sheet: "nara.png" }],
          props: []
        }
      }
    });
    expect(normalizeSceneRuntime("isometric", {
      type: "isometric",
      config: {}
    }).config).not.toHaveProperty("tacticalCapabilities");
    expect(normalizeSceneRuntime("isometric", {
      type: "isometric",
      config: {}
    }).config).not.toHaveProperty("tacticalPresentation");
  });

  it("resolves dungeon crawler defaults, project settings and sparse room overrides", () => {
    expect(normalizeSceneRuntime("dungeonCrawler", {
      type: "dungeonCrawler",
      config: { stepDurationMs: 10, turnDurationMs: 9999, allowBackstep: false, viewDistance: 99 }
    })).toEqual({
      type: "dungeonCrawler",
      config: { stepDurationMs: 40, turnDurationMs: 1000, allowBackstep: false, viewDistance: 12 }
    });
    expect(resolveSceneRuntime("dungeonCrawler", {
      type: "dungeonCrawler",
      config: { viewDistance: 7 }
    }, {
      dungeonCrawler: { stepDurationMs: 180, turnDurationMs: 120, allowBackstep: false, viewDistance: 5 }
    })).toEqual({
      type: "dungeonCrawler",
      config: { stepDurationMs: 180, turnDurationMs: 120, allowBackstep: false, viewDistance: 7 }
    });
    expect(normalizeSceneRuntime("dungeonCrawler", {
      type: "dungeonCrawler",
      config: { playerStart: { x: 14.4, y: 6.6, direction: "up" } }
    })).toMatchObject({
      config: { playerStart: { x: 14, y: 7, direction: "up" } }
    });
  });

  it("resolves racing defaults, project settings and sparse room overrides", () => {
    expect(normalizeSceneRuntime("racing", {
      type: "racing",
      config: {
        maxSpeed: 99, acceleration: -1, brakePower: 99, steeringSpeed: 0,
        presentation: "pseudo3d", lapsToWin: 99, checkpointsPerLap: 99,
        pickupsPerLap: 99, rivalSpeed: -1, roadCurve: 99, showMinimap: true,
        pseudo3dVisuals: {
          horizonY: 0,
          panoramaBackgroundId: "circuit-sky.png",
          floorTilemapId: "circuit-floor.png",
          minimapAssetId: "circuit-minimap.png"
        }
      }
    })).toEqual({
      type: "racing",
      config: {
        maxSpeed: 16,
        acceleration: 0,
        brakePower: 32,
        steeringSpeed: 0.125,
        presentation: "pseudo3d",
        lapsToWin: 9,
        checkpointsPerLap: 16,
        pickupsPerLap: 16,
        rivalSpeed: 0.125,
        roadCurve: 64,
        showMinimap: true,
        pseudo3dVisuals: {
          horizonY: 1,
          panoramaBackgroundId: "circuit-sky.png",
          floorTilemapId: "circuit-floor.png",
          minimapAssetId: "circuit-minimap.png"
        }
      }
    });
    expect(resolveSceneRuntime("racing", { type: "racing", config: { maxSpeed: 6 } }, {
      racing: {
        maxSpeed: 4, acceleration: 8, brakePower: 12, steeringSpeed: 2,
        presentation: "pseudo3d", lapsToWin: 2, checkpointsPerLap: 3,
        pickupsPerLap: 2, rivalSpeed: 3.5, roadCurve: 12, showMinimap: true
      }
    })).toEqual({
      type: "racing",
      config: {
        maxSpeed: 6,
        acceleration: 8,
        brakePower: 12,
        steeringSpeed: 2,
        presentation: "pseudo3d",
        lapsToWin: 2,
        checkpointsPerLap: 3,
        pickupsPerLap: 2,
        rivalSpeed: 3.5,
        roadCurve: 12,
        showMinimap: true
      }
    });
  });

  it("normalizes o circuito top-down com zona segura de câmera e checkpoints ordenados", () => {
    expect(normalizeSceneRuntime("racing", {
      type: "racing",
      config: {
        topdownTrack: {
          cameraDeadZoneX: -10,
          cameraDeadZoneY: 999,
          startHeading: 99,
          checkpoints: [
            { id: " start ", x: -10, y: 9999, width: 0, height: 999 },
            { id: "start", x: 12, y: 24, width: 16, height: 16 },
            { id: "finish", x: 80, y: 48, width: 32, height: 12 },
            { id: "", x: 20, y: 20, width: 8, height: 8 }
          ]
        }
      }
    })).toEqual({
      type: "racing",
      config: {
        topdownTrack: {
          cameraDeadZoneX: 0,
          cameraDeadZoneY: 80,
          startHeading: 15,
          checkpoints: [
            { id: "start", x: 0, y: 4095, width: 1, height: 256 },
            { id: "finish", x: 80, y: 48, width: 32, height: 12 }
          ]
        }
      }
    });
  });

  it("preserva a rota fechada dos rivais e a velocidade do circuito top-down", () => {
    const runtime = normalizeSceneRuntime("racing", {
      type: "racing",
      config: {
        presentation: "topdown",
        rivalSpeed: 105,
        topdownTrack: {
          pathPoints: [{ x: 180, y: 56 }, { x: 440, y: 160 }, { x: 40, y: 160 }],
          checkpoints: [{ id: "largada", x: 180, y: 56, width: 32, height: 16 }]
        }
      }
    });
    expect(runtime?.config).toMatchObject({
      rivalSpeed: 105,
      topdownTrack: {
        pathPoints: [{ x: 180, y: 56 }, { x: 440, y: 160 }, { x: 40, y: 160 }]
      }
    });
  });

  it("resolves battle RPG defaults, settings and sparse room overrides", () => {
    expect(normalizeSceneRuntime("battleRpg", {
      type: "battleRpg",
      config: {
        maxPartySize: 9, maxEnemies: 0, turnDelayFrames: 999, escapeEnabled: false,
        experienceMultiplier: 0.01, typeEffectivenessEnabled: "true", criticalHitEnabled: false, statusConditionsEnabled: "yes",
        abilitiesEnabled: false, showExperienceBar: "yes", showHealthBars: false,
        battleStyle: "double", weatherEffect: "lava",
        rewardGold: -1, rewardExperience: 999999
      }
    })).toEqual({
      type: "battleRpg",
      config: {
        maxPartySize: 6, maxEnemies: 1, turnDelayFrames: 255, escapeEnabled: false,
        experienceMultiplier: 0.1, typeEffectivenessEnabled: true, criticalHitEnabled: false, statusConditionsEnabled: true,
        abilitiesEnabled: false, showExperienceBar: true, showHealthBars: false,
        battleStyle: "double", weatherEffect: "none",
        rewardGold: 0, rewardExperience: 65535
      }
    });
    expect(resolveSceneRuntime("battleRpg", { type: "battleRpg", config: { maxEnemies: 6 } }, {
      battleRpg: {
        maxPartySize: 3, maxEnemies: 4, turnDelayFrames: 20, escapeEnabled: true,
        experienceMultiplier: 2, typeEffectivenessEnabled: false, criticalHitEnabled: false,
        statusConditionsEnabled: false, abilitiesEnabled: false, showExperienceBar: false,
        showHealthBars: false, battleStyle: "double", weatherEffect: "rain",
        rewardGold: 40, rewardExperience: 25
      }
    })).toEqual({
      type: "battleRpg",
      config: {
        maxPartySize: 3, maxEnemies: 6, turnDelayFrames: 20, escapeEnabled: true,
        experienceMultiplier: 2, typeEffectivenessEnabled: false, criticalHitEnabled: false,
        statusConditionsEnabled: false, abilitiesEnabled: false, showExperienceBar: false,
        showHealthBars: false, battleStyle: "double", weatherEffect: "rain",
        rewardGold: 40, rewardExperience: 25
      }
    });
    expect(resolveSceneRuntime("luta", { type: "luta", config: { roundTime: 999, defaultStyle: "omega" } }, {
      luta: { roundTime: 60, roundsToWin: 3, defaultStyle: "x-ism" }
    })).toEqual({
      type: "luta",
      config: {
        roundTime: 300,
        roundsToWin: 3,
        maxSuperGauge: 100,
        superGaugeGainOnHit: 8,
        superGaugeGainOnReceive: 4,
        guardPowerRecovery: 2,
        chipDamageEnabled: true,
        airBlockingEnabled: true,
        alphaCounterEnabled: true,
        throwEscapeWindow: 8,
        parryWindow: 4,
        hitstunDecay: 0.85,
        comboLimit: 60,
        vismCustomComboGauge: 100,
        defaultStyle: "a-ism",
        stageId: "stage_default",
        player1StartX: 80,
        player2StartX: 200
      }
    });
  });

  it("resolves world map node defaults, settings and sparse overrides", () => {
    expect(normalizeSceneRuntime("worldMap", {
      type: "worldMap",
      config: { navigable: true, unlocked: false, hideWhenLocked: true, requiredVariable: 99, requiredValue: 4, targetLevel: -99 }
    })).toEqual({
      type: "worldMap",
      config: { navigable: true, unlocked: false, hideWhenLocked: true, requiredVariable: 15, requiredValue: 4, targetLevel: -1 }
    });
    expect(resolveSceneRuntime("worldMap", { type: "worldMap", config: { targetLevel: 7 } }, {
      worldMap: { navigable: true, unlocked: true, hideWhenLocked: false, requiredVariable: -1, requiredValue: 0, targetLevel: -1 }
    })).toEqual({
      type: "worldMap",
      config: { navigable: true, unlocked: true, hideWhenLocked: false, requiredVariable: -1, requiredValue: 0, targetLevel: 7 }
    });

    expect(normalizeSceneRuntime("worldMap", {
      type: "worldMap",
      config: {
        nodes: [
          { id: " home ", name: " Casa ", x: -3, y: 999, connections: [" forest ", "forest", "home"] },
          { id: "forest", targetLevel: 2, unlocked: false, eventName: " open_forest " },
          { id: "forest", name: "Duplicado" },
          { name: "Sem ID" }
        ]
      }
    })).toMatchObject({
      type: "worldMap",
      config: {
        nodes: [
          expect.objectContaining({ id: "home", name: "Casa", x: 0, y: 999, connections: ["forest"] }),
          expect.objectContaining({ id: "forest", targetLevel: 2, unlocked: false, eventName: "open_forest" })
        ]
      }
    });
  });

  it("preserves world map coordinates beyond the GBA viewport", () => {
    expect(normalizeSceneRuntime("worldMap", { type: "worldMap", config: {
      nodes: [{ id: "farol", x: 424, y: 244 }]
    }})).toMatchObject({ config: { nodes: [expect.objectContaining({ x: 424, y: 244 })] } });
  });

  it("requires the World Map marker only when runtime navigation is enabled", () => {
    expect(resolveSceneControlledEntityContract("worldMap", {
      type: "worldMap",
      config: { navigable: true }
    })).toMatchObject({
      activation: "navigable",
      required: true,
      role: "marker"
    });
    expect(resolveSceneControlledEntityContract("worldMap", {
      type: "worldMap",
      config: { navigable: false }
    })).toMatchObject({
      activation: "navigable",
      required: false,
      role: "marker"
    });
  });

  it("resolves visual novel scene defaults, settings and sparse overrides", () => {
    expect(normalizeSceneRuntime("visualNovel", {
      type: "visualNovel", config: { autoAdvance: true, nextSceneIndex: 999, backgroundIndex: -99 }
    })).toEqual({ type: "visualNovel", config: { autoAdvance: true, nextSceneIndex: 255, backgroundIndex: -1 } });
    expect(resolveSceneRuntime("visualNovel", { type: "visualNovel", config: { nextSceneIndex: 3 } }, {
      visualNovel: { autoAdvance: false, nextSceneIndex: -1, backgroundIndex: 2 }
    })).toEqual({ type: "visualNovel", config: { autoAdvance: false, nextSceneIndex: 3, backgroundIndex: 2 } });
    expect(normalizeSceneRuntime("visualNovel", {
      type: "visualNovel",
      config: { dialogueKey: " chapter_intro " }
    })).toEqual({ type: "visualNovel", config: { dialogueKey: "chapter_intro" } });
  });

  it("resolves cutscene defaults, settings and sparse room overrides", () => {
    expect(resolveSceneRuntime("cutscene", {
      type: "cutscene",
      config: { stepDurationFrames: 999, autoAdvance: false, nextSceneIndex: -99, backgroundIndex: 999 }
    })).toEqual({
      type: "cutscene",
      config: { stepDurationFrames: 255, autoAdvance: false, nextSceneIndex: -1, backgroundIndex: 255 }
    });
    expect(resolveSceneRuntime("cutscene", { type: "cutscene", config: { nextSceneIndex: 4 } }, {
      cutscene: { stepDurationFrames: 12, autoAdvance: true, nextSceneIndex: -1, backgroundIndex: 2 }
    })).toEqual({
      type: "cutscene",
      config: { stepDurationFrames: 12, autoAdvance: true, nextSceneIndex: 4, backgroundIndex: 2 }
    });
  });

  it("normalizes an explicit cutscene timeline with safe limits", () => {
    expect(resolveSceneRuntime("cutscene", {
      type: "cutscene",
      config: {
        steps: [{
          id: " opening ",
          dialogueKey: " line_a ",
          eventName: " camera_pan ",
          durationFrames: 99999,
          autoAdvance: false,
          skippable: false,
          waitForDialogue: true,
          onSkipEventName: " skip_intro ",
          targetSceneIndex: 999,
          branchVariable: 99,
          branchValue: 99999,
          branchTargetSceneIndex: -99,
          branchTargetStepIndex: 999,
          backgroundAssetName: " prologue-frame-1 "
        }]
      }
    })).toEqual({
      type: "cutscene",
      config: {
        stepDurationFrames: 8,
        autoAdvance: true,
        nextSceneIndex: -1,
        backgroundIndex: -1,
        steps: [{
          id: "opening",
          dialogueKey: "line_a",
          eventName: "camera_pan",
          durationFrames: 65535,
          autoAdvance: false,
          skippable: false,
          waitForDialogue: true,
          onSkipEventName: "skip_intro",
          targetSceneIndex: 255,
          branchVariable: 15,
          branchValue: 32767,
          branchTargetSceneIndex: -1,
          branchTargetStepIndex: 255,
          backgroundAssetName: "prologue-frame-1"
        }]
      }
    });
  });

  it("resolves engine defaults, project settings and room overrides in order", () => {
    expect(resolveSceneRuntime("pointAndClick", {
      type: "pointAndClick",
      config: { hotspotPadding: 10 }
    }, {
      pointAndClick: { cursorSpeed: 1.5, hotspotPadding: 6 }
    })).toEqual({
      type: "pointAndClick",
      config: { cursorSpeed: 1.5, hotspotPadding: 10 }
    });

    expect(resolveSceneRuntime("shmup", { type: "shmup", config: {} }, {
      shmup: { playerSpeed: 3, fireRate: 12, scrollSpeed: 2 }
    })).toEqual({
      type: "shmup",
      config: { playerSpeed: 3, fireCooldown: 12, scrollSpeed: 2 }
    });
  });

  it("replaces a mismatched runtime with the selected scene profile", () => {
    expect(normalizeSceneRuntime("shmup", {
      type: "platformer",
      config: { gravity: 1 }
    })).toEqual({ type: "shmup", config: {} });
  });

  it("preserves advanced scene contracts while normalizing specialized profiles", () => {
    expect(normalizeSceneRuntime("platformer", {
      type: "platformer",
      config: {
        capabilities: [{ id: "link_multiplayer", enabled: true, settings: { transport: "link" } }],
        composition: { enabled: false },
        resources: { schema: 1, resources: [] }
      }
    })).toMatchObject({
      type: "platformer",
      config: {
        capabilities: [{ id: "link_multiplayer", enabled: true, settings: { transport: "link" } }],
        composition: { enabled: false, mode: "tilemap" },
        resources: { schema: 1, resources: [] }
      }
    });

    expect(normalizeSceneRuntime("menu", {
      type: "menu",
      config: {
        role: "title",
        capabilities: [{ id: "save_ui_profile", enabled: true, settings: { profileId: "portable" } }]
      }
    })).toMatchObject({
      type: "menu",
      config: {
        capabilities: [{ id: "save_ui_profile", enabled: true, settings: { profileId: "portable" } }]
      }
    });
  });
});
