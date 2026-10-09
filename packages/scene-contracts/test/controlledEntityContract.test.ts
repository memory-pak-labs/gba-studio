import { describe, expect, it } from "vitest";

import { controlledEntityContracts, resolveControlledEntityContract } from "../src/index.js";
import * as sceneContracts from "../src/index.js";

describe("controlled entity contracts", () => {
  it("resolves the Top Down controlled character contract", () => {
    expect(resolveControlledEntityContract("topdown")).toMatchObject({
      sceneType: "topdown",
      required: true,
      role: "character",
      visualCanvas: { width: 16, height: 32 },
      compactVariant: { width: 16, height: 16 },
      collision: { width: 16, height: 16 },
      anchor: "bottom-center",
      directionModel: {
        mode: "cardinal-4",
        generated: ["down", "right", "up"],
        mirrored: { left: "right" }
      },
      gbaAssetPreset: "player-topdown",
      animations: {
        idle: {
          technicalState: "idle",
          required: true,
          defaultFrames: 2,
          allowedFrames: [1, 4],
          fps: 6,
          loop: true
        },
        walk: {
          technicalState: "walk",
          required: true,
          defaultFrames: 4,
          allowedFrames: [2, 8],
          fps: 10,
          loop: true
        }
      }
    });
  });

  it.each([
    ["topdown", "character", true],
    ["platformer", "character", true],
    ["isometric", "character", true],
    ["dungeonCrawler", "none", false],
    ["racing", "vehicle", true],
    ["shmup", "ship", true],
    ["pointAndClick", "cursor", true],
    ["worldMap", "marker", false],
    ["battleRpg", "none", false],
    ["visualNovel", "none", false],
    ["cutscene", "none", false],
    ["menu", "none", false],
    ["luta", "fighter", true],
    ["custom", "none", false]
  ])("resolves the %s contract with role %s", (sceneType, role, required) => {
    expect(resolveControlledEntityContract(sceneType)).toMatchObject({ sceneType, role, required });
  });

  it("keeps scenes without a controlled entity free of asset requirements", () => {
    for (const sceneType of ["dungeonCrawler", "battleRpg", "visualNovel", "cutscene", "menu", "custom"]) {
      const contract = resolveControlledEntityContract(sceneType);

      expect(contract).toMatchObject({ required: false, role: "none" });
      expect(contract.visualCanvas).toBeUndefined();
      expect(contract.collision).toBeUndefined();
      expect(contract.animations).toBeUndefined();
    }
  });

  it("uses only V1 technical states for semantic scene animations", () => {
    const allowedTechnicalStates = ["idle", "walk", "jump", "fall", "attack", "hurt"];

    for (const sceneType of ["topdown", "platformer", "isometric", "racing", "shmup", "pointAndClick", "worldMap", "luta"]) {
      const animations = Object.values(resolveControlledEntityContract(sceneType).animations ?? {});

      expect(animations.length).toBeGreaterThan(0);
      for (const animation of animations) {
        expect(allowedTechnicalStates).toContain(animation.technicalState);
        expect(animation.allowedFrames[0]).toBeLessThanOrEqual(animation.allowedFrames[1]);
        expect(animation.fps).toBeGreaterThan(0);
      }
    }

    expect(resolveControlledEntityContract("racing").animations?.drive.technicalState).toBe("walk");
    expect(resolveControlledEntityContract("shmup").animations?.fly.technicalState).toBe("walk");
    expect(resolveControlledEntityContract("pointAndClick").animations).toMatchObject({
      pointer: { technicalState: "idle" },
      hover: { technicalState: "walk" },
      click: { technicalState: "attack" }
    });
  });

  it("only requires a World Map marker when the map is navigable", () => {
    expect(resolveControlledEntityContract("worldMap")).toMatchObject({
      activation: "navigable",
      required: false,
      role: "marker"
    });
    expect(resolveControlledEntityContract("worldMap", { worldMapNavigable: true })).toMatchObject({
      activation: "navigable",
      required: true,
      role: "marker"
    });
  });

  it("keeps Custom neutral without an explicit override", () => {
    expect(resolveControlledEntityContract("custom")).toEqual({
      sceneType: "custom",
      required: false,
      role: "none",
      activation: "explicit-override"
    });
  });

  it("reports NEEDS_CONTRACT_OVERRIDE when a Custom entity is requested without enough data", () => {
    const resolveGeneration = (sceneContracts as {
      resolveControlledEntityGeneration?: (sceneType: string, options: Record<string, unknown>) => unknown;
    }).resolveControlledEntityGeneration;

    expect(resolveGeneration?.("custom", { requestControlledEntity: true })).toEqual({
      status: "NEEDS_CONTRACT_OVERRIDE",
      missingFields: [
        "required",
        "role",
        "visualCanvas",
        "collision",
        "anchor",
        "directionModel",
        "animations",
        "gbaAssetPreset"
      ]
    });
  });

  it("uses a complete Custom override only when it is explicitly supplied", () => {
    const resolveGeneration = (sceneContracts as {
      resolveControlledEntityGeneration?: (sceneType: string, options: Record<string, unknown>) => unknown;
    }).resolveControlledEntityGeneration;

    expect(resolveGeneration?.("custom", {
      requestControlledEntity: true,
      customOverride: {
        required: true,
        role: "character",
        visualCanvas: { width: 32, height: 32 },
        collision: { width: 16, height: 16 },
        anchor: "bottom-center",
        directionModel: { mode: "horizontal", generated: ["right"] },
        animations: {
          idle: { technicalState: "idle", required: true, defaultFrames: 2, allowedFrames: [1, 4], fps: 6, loop: true }
        },
        gbaAssetPreset: "player-platformer"
      }
    })).toMatchObject({
      status: "READY",
      contract: {
        sceneType: "custom",
        role: "character",
        gbaAssetPreset: "player-platformer"
      }
    });
  });

  it("validates the complete contract registry", () => {
    const validateContracts = (sceneContracts as {
      validateControlledEntityContracts?: (contracts: object) => unknown;
    }).validateControlledEntityContracts;

    expect(validateContracts?.(controlledEntityContracts)).toEqual([]);
  });

  it("reports invalid required fields, animation ranges, FPS and mirror sources", () => {
    const validateContracts = (sceneContracts as {
      validateControlledEntityContracts?: (contracts: object) => Array<{ sceneType: string; field: string; code: string }>;
    }).validateControlledEntityContracts;
    const topdown = controlledEntityContracts.topdown;
    const invalidContracts = {
      ...controlledEntityContracts,
      topdown: {
        ...topdown,
        visualCanvas: undefined,
        directionModel: {
          ...topdown.directionModel!,
          mirrored: { left: "up-left" }
        },
        animations: {
          ...topdown.animations!,
          idle: {
            ...topdown.animations!.idle,
            allowedFrames: [4, 1] as const,
            fps: 0
          }
        }
      }
    };
    const issues = validateContracts?.(invalidContracts) ?? [];

    expect(issues).toEqual(expect.arrayContaining([
      { sceneType: "topdown", field: "visualCanvas", code: "REQUIRED_ENTITY_FIELD_MISSING" },
      { sceneType: "topdown", field: "animations.idle.allowedFrames", code: "INVALID_ALLOWED_FRAMES" },
      { sceneType: "topdown", field: "animations.idle.fps", code: "INVALID_FPS" },
      { sceneType: "topdown", field: "directionModel.mirrored.left", code: "MIRROR_SOURCE_NOT_GENERATED" }
    ]));
  });
});
