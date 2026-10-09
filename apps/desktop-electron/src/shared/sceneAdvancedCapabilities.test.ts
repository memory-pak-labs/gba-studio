import { describe, expect, it } from "vitest";

import {
  SCENE_ADVANCED_CAPABILITY_IDS,
  SCENE_ADVANCED_CAPABILITY_REGISTRY,
  resolveSceneAdvancedCapabilities,
  resolveSceneAffineObjPreview
} from "./sceneAdvancedCapabilities.js";
import { resolveSceneCapabilityManifest } from "./sceneFeatureModules.js";

describe("scene advanced capabilities", () => {
  it("keeps every advanced capability disabled when the scene has no configuration", () => {
    const resolution = resolveSceneAdvancedCapabilities("shmup");

    expect(resolution.capabilities).toEqual([]);
    expect(resolution.issues).toEqual([]);
    const advanced = resolveSceneCapabilityManifest("shmup").capabilities.filter((capability) => (
      SCENE_ADVANCED_CAPABILITY_IDS.some((id) => id === capability.id)
    ));
    expect(advanced.every((capability) => capability.status.enabled)).toBe(false);
  });

  it("requires explicit opt-in and exposes the complete typed contract", () => {
    const resolution = resolveSceneAdvancedCapabilities("shmup", [
      { id: "hblank_timeline", settings: { keyframeCount: 2 } },
      { id: "hblank_timeline", enabled: true, settings: { keyframeCount: 2 } }
    ], ["camera"]);

    expect(resolution.capabilities).toEqual([
      { id: "hblank_timeline", enabled: true, settings: { keyframeCount: 2 } }
    ]);
    expect(resolution.issues).toEqual([
      expect.objectContaining({ code: "INVALID_CAPABILITY_CONFIG", module: "hblank_timeline" })
    ]);

    const definition = SCENE_ADVANCED_CAPABILITY_REGISTRY.find((capability) => capability.id === "hblank_timeline");
    expect(definition).toMatchObject({
      available: true,
      required: false,
      verified: true,
      sceneProfiles: expect.arrayContaining(["shmup"]),
      assets: expect.arrayContaining([expect.objectContaining({ required: true })]),
      editorTools: ["camera"],
      budget: expect.objectContaining({ dmaBytes: expect.any(Number), vblankTicks: expect.any(Number) }),
      fallback: expect.any(String),
      verification: {
        tests: expect.arrayContaining([expect.any(String)]),
        evidence: expect.arrayContaining([expect.any(String)])
      }
    });
  });

  it("limits the Affine SHMUP capability to explicit opt-in", () => {
    const definition = SCENE_ADVANCED_CAPABILITY_REGISTRY.find((capability) => capability.id === "affine_background");
    expect(definition).toMatchObject({
      available: true,
      required: false,
      verified: true,
      sceneProfiles: ["shmup"],
      assets: [expect.objectContaining({ kind: "affine_bg", required: true })],
      editorTools: ["camera"],
      budget: expect.objectContaining({ bgTiles: expect.any(Number), vramBytes: expect.any(Number) }),
      fallback: expect.any(String)
    });
    expect(resolveSceneAdvancedCapabilities("shmup").capabilities).toEqual([]);
    expect(resolveSceneAdvancedCapabilities("topdown", [
      { id: "affine_background", enabled: true, settings: {} }
    ]).issues).toEqual([
      expect.objectContaining({ code: "INCOMPATIBLE_CAPABILITY", module: "affine_background" })
    ]);
    expect(resolveSceneAdvancedCapabilities("shmup", [
      { id: "affine_background", enabled: true, settings: {} }
    ], ["camera"]).capabilities).toEqual([
      { id: "affine_background", enabled: true, settings: {} }
    ]);
  });

  it("resolve a transformacao Affine OBJ somente para uma capability explicitamente habilitada", () => {
    expect(resolveSceneAffineObjPreview("topdown")).toBeNull();
    expect(resolveSceneAffineObjPreview("shmup", [
      { id: "affine_obj", enabled: true, settings: {} }
    ])).toBeNull();
    expect(resolveSceneAffineObjPreview("topdown", [
      {
        id: "affine_obj",
        enabled: true,
        settings: {
          doubleSize: true,
          matrixIndex: 3,
          scaleX: 1.5,
          scaleY: 0.75,
          rotationDegrees: 45
        }
      }
    ])).toEqual({
      doubleSize: true,
      matrixIndex: 3,
      scaleX: 1.5,
      scaleY: 0.75,
      rotationDegrees: 45
    });
  });

  it("rejeita configuracoes Affine OBJ fora do contrato fisico", () => {
    const resolution = resolveSceneAdvancedCapabilities("topdown", [
      {
        id: "affine_obj",
        enabled: true,
        settings: { matrixIndex: 32, scaleX: 0.25, scaleY: 4, rotationDegrees: 181 }
      }
    ], ["actor"]);

    expect(resolution.capabilities).toEqual([]);
    expect(resolution.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INVALID_CAPABILITY_SETTINGS", module: "affine_obj", field: "matrixIndex" }),
      expect.objectContaining({ code: "INVALID_CAPABILITY_SETTINGS", module: "affine_obj", field: "scaleX" }),
      expect.objectContaining({ code: "INVALID_CAPABILITY_SETTINGS", module: "affine_obj", field: "rotationDegrees" })
    ]));
  });

  it("rejects unknown, incompatible, invalid settings and missing editor tools", () => {
    const resolution = resolveSceneAdvancedCapabilities("topdown", [
      { id: "hblank_timeline", enabled: true, settings: {} },
      { id: "not-a-capability", enabled: true, settings: {} },
      { id: "metatiles", enabled: true, settings: { blockSize: 16 } }
    ], ["select"]);

    expect(resolution.capabilities).toEqual([]);
    expect(resolution.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INCOMPATIBLE_CAPABILITY", module: "hblank_timeline" }),
      expect.objectContaining({ code: "UNKNOWN_CAPABILITY", module: "not-a-capability" }),
      expect.objectContaining({ code: "INVALID_CAPABILITY_SETTINGS", module: "metatiles" }),
      expect.objectContaining({ code: "MISSING_EDITOR_TOOL", module: "metatiles", field: "paint" })
    ]));
  });

  it("preserves explicit disabled state and prevents required capabilities from being disabled", () => {
    const resolution = resolveSceneAdvancedCapabilities("topdown", [
      { id: "metatiles", enabled: false, required: true, settings: { blockSize: "2x2" } }
    ], ["paint"]);

    expect(resolution.capabilities).toEqual([
      { id: "metatiles", enabled: false, required: true, settings: { blockSize: "2x2" } }
    ]);
    expect(resolution.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REQUIRED_CAPABILITY_DISABLED", module: "metatiles" })
    ]));
  });
});
