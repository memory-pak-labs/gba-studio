import { describe, expect, it } from "vitest";

import { resolveSceneCapabilityManifest } from "./sceneFeatureModules.js";
import {
  ISO_TACTICAL_ANIMATION_STATES,
  ISO_TACTICAL_AUDIO_CUES,
  ISO_TACTICAL_CAPABILITY_IDS,
  ISO_TACTICAL_DIRECTIONS,
  SCENE_TACTICAL_CAPABILITY_IDS,
  normalizeIsometricTacticalPresentation,
  resolveIsometricTacticalCapabilities,
  validateIsometricTacticalAudioCatalog,
  validateIsometricTacticalPresentation
} from "./isometricTacticalPresentation.js";

const fullPresentation = {
  schema: 1,
  surfaceAsset: "tactical-arena-bg-v1.png",
  surfacePages: [
    { id: "north-west", asset: "tactical-arena-r0c0.png", bankGroup: "arena-r0c0", world: { x: 0, y: 0, width: 240, height: 160 } },
    { id: "north-east", asset: "tactical-arena-r0c1.png", bankGroup: "arena-r0c1", world: { x: 240, y: 0, width: 240, height: 160 } }
  ],
  surfaceResidency: {
    exclusiveBankGroups: ["arena-r0c0", "arena-r0c1"],
    maxResidentGroups: 1,
    prefetchMarginPixels: 32
  },
  gridAsset: "tactical-grid-v1.png",
  hudLayout: "tactical-hud-v1",
  cursorAsset: "tactical-cursor-v1.png",
  rangeAsset: "tactical-range-v1.png",
  targetAsset: "tactical-target-v1.png",
  units: [
    {
      actorId: "tactical-nara",
      sheet: "tactical-nara-v2.png",
      animations: Object.fromEntries(ISO_TACTICAL_ANIMATION_STATES.flatMap((state) => (
        ISO_TACTICAL_DIRECTIONS.map((direction) => [`${state}_${direction}`, `${state}_${direction}`])
      )))
    },
    {
      actorId: "tactical-sentinel",
      sheet: "tactical-sentinel-v2.png",
      animations: Object.fromEntries(ISO_TACTICAL_ANIMATION_STATES.flatMap((state) => (
        ISO_TACTICAL_DIRECTIONS.map((direction) => [`${state}_${direction}`, `${state}_${direction}`])
      )))
    }
  ],
  props: [
    { id: "beacon", asset: "tactical-beacon-v1.png", kind: "objective" },
    { id: "cover", asset: "tactical-cover-v1.png", kind: "cover" }
  ],
  emotesAsset: "tactical-emotes-v1.png",
  feedbackAsset: "tactical-feedback-v1.png",
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
};

const tacticalAudioItems = [
  {
    id: "music",
    name: "farol_arena_tatica",
    exportID: "farol_arena_tatica",
    kind: "Musica",
    format: "COMPOSED",
    patterns: [{
      id: "arena-intro",
      steps: 4,
      channels: [{ type: "pulse1", notes: ["C-4", "---", "E-4", "---"] }]
    }]
  },
  ...ISO_TACTICAL_AUDIO_CUES.map((cue) => ({
    id: `sfx-${cue}`,
    name: fullPresentation.audio.cues[cue],
    exportID: fullPresentation.audio.cues[cue],
    kind: "SFX",
    format: "COMPOSED",
    patterns: [{
      id: `${cue}-hit`,
      steps: 2,
      channels: [{ type: "noise", notes: ["C-4", "---"] }]
    }]
  }))
];

describe("isometric tactical presentation contract", () => {
  it("exposes one typed registry with all tactical capabilities disabled by default", () => {
    expect(SCENE_TACTICAL_CAPABILITY_IDS).toEqual([
      "tactical_surface",
      "tactical_grid_overlay",
      "tactical_hud",
      "tactical_units",
      "tactical_props",
      "tactical_feedback",
      "tactical_audio"
    ]);
    expect(ISO_TACTICAL_CAPABILITY_IDS).toEqual(SCENE_TACTICAL_CAPABILITY_IDS);
    expect(ISO_TACTICAL_DIRECTIONS).toEqual(["down", "up", "left", "right"]);
    expect(ISO_TACTICAL_ANIMATION_STATES).toEqual(["idle", "move", "attack", "hurt", "defeat"]);

    const manifest = resolveSceneCapabilityManifest("isometric");
    const tactical = manifest.capabilities.filter((capability) => (
      SCENE_TACTICAL_CAPABILITY_IDS.includes(capability.id as typeof SCENE_TACTICAL_CAPABILITY_IDS[number])
    ));
    expect(tactical).toHaveLength(SCENE_TACTICAL_CAPABILITY_IDS.length);
    expect(tactical.every((capability) => capability.status.enabled === false)).toBe(true);
    expect(tactical.every((capability) => capability.status.required === false)).toBe(true);
  });

  it("requires explicit opt-in, editor tools and compatible scene profile", () => {
    const resolution = resolveIsometricTacticalCapabilities("isometric", [
      { id: "tactical_units", enabled: true, required: true, settings: {} },
      { id: "tactical_hud", enabled: true, settings: {} }
    ], ["actor"]);

    expect(resolution.capabilities).toEqual([
      { id: "tactical_units", enabled: true, required: true, settings: {} },
      { id: "tactical_hud", enabled: true, settings: {} }
    ]);
    expect(resolution.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MISSING_EDITOR_TOOL", module: "tactical_hud", field: "room" })
    ]));

    expect(resolveIsometricTacticalCapabilities("topdown", [
      { id: "tactical_units", enabled: true, settings: {} }
    ]).issues).toEqual([
      expect.objectContaining({ code: "INCOMPATIBLE_CAPABILITY", module: "tactical_units" })
    ]);
  });

  it("rejects omitted enabled, duplicate and required-disabled declarations", () => {
    const resolution = resolveIsometricTacticalCapabilities("isometric", [
      { id: "tactical_units", settings: {} },
      { id: "tactical_units", enabled: true, settings: {} },
      { id: "tactical_hud", enabled: false, required: true, settings: {} },
      { id: "not-tactical", enabled: true, settings: {} }
    ]);

    expect(resolution.capabilities).toEqual([
      { id: "tactical_units", enabled: true, settings: {} },
      { id: "tactical_hud", enabled: false, required: true, settings: {} }
    ]);
    expect(resolution.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INVALID_CAPABILITY_CONFIG", module: "tactical_units" }),
      expect.objectContaining({ code: "REQUIRED_CAPABILITY_DISABLED", module: "tactical_hud" }),
      expect.objectContaining({ code: "UNKNOWN_CAPABILITY", module: "not-tactical" })
    ]));
  });

  it("normalizes the complete presentation without inventing absent bindings", () => {
    const normalized = normalizeIsometricTacticalPresentation(fullPresentation);
    expect(normalized).toMatchObject({
      schema: 1,
      surfaceAsset: "tactical-arena-bg-v1.png",
      surfacePages: [
        expect.objectContaining({ id: "north-west", bankGroup: "arena-r0c0", world: { x: 0, y: 0, width: 240, height: 160 } }),
        expect.objectContaining({ id: "north-east", bankGroup: "arena-r0c1", world: { x: 240, y: 0, width: 240, height: 160 } })
      ],
      surfaceResidency: {
        exclusiveBankGroups: ["arena-r0c0", "arena-r0c1"],
        maxResidentGroups: 1,
        prefetchMarginPixels: 32
      },
      units: expect.arrayContaining([
        expect.objectContaining({ actorId: "tactical-nara", sheet: "tactical-nara-v2.png" })
      ])
    });
    expect(Object.keys(normalized.units[0]?.animations ?? {})).toHaveLength(20);
    expect(normalizeIsometricTacticalPresentation({ schema: 1 }).surfaceAsset).toBeUndefined();
  });

  it("reports only the required presentation bindings for enabled capabilities", () => {
    expect(validateIsometricTacticalPresentation({ schema: 1 }, ["tactical_surface"])).toEqual([
      expect.objectContaining({ code: "MISSING_CAPABILITY_ASSET", module: "tactical_surface" })
    ]);
    expect(validateIsometricTacticalPresentation(fullPresentation, [
      ...SCENE_TACTICAL_CAPABILITY_IDS
    ])).toEqual([]);
  });

  it("rejects an implicit or inconsistent surface residency contract", () => {
    const issues = validateIsometricTacticalPresentation({
      schema: 1,
      surfacePages: [
        { id: "a", asset: "a.png", bankGroup: "arena-a", world: { x: 0, y: 0, width: 240, height: 160 } },
        { id: "b", asset: "b.png", bankGroup: "arena-b", world: { x: 240, y: 0, width: 240, height: 160 } }
      ],
      surfaceResidency: {
        exclusiveBankGroups: ["arena-a"],
        maxResidentGroups: 2,
        prefetchMarginPixels: -1
      },
      units: [],
      props: []
    }, ["tactical_surface"]);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INVALID_TACTICAL_PRESENTATION", field: "surfaceResidency.exclusiveBankGroups" }),
      expect.objectContaining({ code: "INVALID_TACTICAL_PRESENTATION", field: "surfaceResidency.maxResidentGroups" }),
      expect.objectContaining({ code: "INVALID_TACTICAL_PRESENTATION", field: "surfaceResidency.prefetchMarginPixels" })
    ]));
  });

  it("requires every tactical unit animation state and direction", () => {
    const issues = validateIsometricTacticalPresentation({
      schema: 1,
      units: [{ actorId: "nara", sheet: "nara" }],
      props: []
    }, ["tactical_units"]);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MISSING_CAPABILITY_ASSET", module: "tactical_units", field: "animations" })
    ]));
    expect(issues.filter((issue) => issue.module === "tactical_units")).toHaveLength(1);
  });

  it("requires composed tracker audio with a matching kind for music and cues", () => {
    expect(validateIsometricTacticalAudioCatalog(tacticalAudioItems, fullPresentation, ["tactical_audio"])).toEqual([]);

    const pcmMusic = tacticalAudioItems.map((audio) => (
      audio.id === "music" ? { ...audio, format: "WAV" } : audio
    ));
    expect(validateIsometricTacticalAudioCatalog(pcmMusic, fullPresentation, ["tactical_audio"])).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "INVALID_TACTICAL_PRESENTATION",
        module: "tactical_audio",
        field: "audio.music"
      })
    ]));

    const wrongCueKind = tacticalAudioItems.map((audio) => (
      audio.id === "sfx-attack" ? { ...audio, kind: "Musica" } : audio
    ));
    expect(validateIsometricTacticalAudioCatalog(wrongCueKind, fullPresentation, ["tactical_audio"])).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "INVALID_TACTICAL_PRESENTATION",
        module: "tactical_audio",
        field: "audio.cues.attack"
      })
    ]));

    expect(validateIsometricTacticalAudioCatalog(
      tacticalAudioItems.filter((audio) => audio.id !== "sfx-hit"),
      fullPresentation,
      ["tactical_audio"]
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "MISSING_CAPABILITY_ASSET",
        module: "tactical_audio",
        field: "audio.cues.hit"
      })
    ]));
  });
});
