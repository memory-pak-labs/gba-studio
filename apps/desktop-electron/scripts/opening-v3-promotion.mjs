// Approved visual replacement for the opening's V2 art. Timing, motions,
// events and transition remain authored by opening-v2-promotion.mjs.
export const OPENING_V3_FILES = Object.freeze([
  { folder: "sprites", name: "opening-v3-guardia-idle-48x64.png", sha256: "af2c80534f985b4a171294a41b6a6e716be0ff14b2aa2954be35a2d94c2ae380" },
  { folder: "sprites", name: "opening-v3-guardia-turn-48x64.png", sha256: "13efa145c3c95504b59a82cc2eb436ce751c471ffd2efcef1a15a93022a1c60d" },
  { folder: "sprites", name: "opening-v3-guardia-signal-48x64.png", sha256: "8738d0df9bb0942a19103fceb028329684a922a49634c4515adb18881c447ca1" },
  { folder: "sprites", name: "opening-v3-menino-24x32.png", sha256: "13fab53838304ce82b4632161f227cc7b9a973077ec6727458ad9ba2c0a388dc" },
  { folder: "sprites", name: "opening-v3-gaivota-24x16.png", sha256: "b4346c395cfaa50e479d4782e69c7232f079e4e5d27b322262c22b2898235e0c" }
]);

const POSE_KEYS = ["guardia-idle", "guardia-turn", "guardia-signal", "menino", "gaivota"];
const spriteByKey = new Map(POSE_KEYS.map((key, index) => [key, OPENING_V3_FILES[index]]));

function v3Id(id) {
  return typeof id === "string" ? id.replace(/^opening-v2-/, "opening-v3-") : id;
}

function poseKey(id) {
  return POSE_KEYS.find((key) => id === `opening-v2-actor-${key}` || id === `opening-v3-actor-${key}`);
}

function uniqueOpeningRecords(records) {
  const seen = new Set();
  return records.filter((record) => {
    if (!/^opening-v3-/.test(record.id ?? "")) return true;
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

function openingAssets() {
  const sprites = POSE_KEYS.map((key) => {
    const file = spriteByKey.get(key);
    return {
      id: `opening-v3-${key}`, kind: "Sprite", name: file.name, systemImage: "person",
      metadata: {
        source: `Assets/sprites/${file.name}`,
        provenance: "tools/gba-sprite-prep/production/exemplo-gba-opening-v3-actors-candidate/SOURCES.md",
        generatedBy: "opening-v3-nearest-shared-rgb555-12-colors-alpha128",
        role: "opening-actor", sceneRoles: ["opening-actor"], profile: "free", colorMode: "4bpp",
        storageFormat: "indexed-4bpp", transparentIndex: 0, preparedSha256: file.sha256,
        assetcStatus: "safe", reviewStatus: "attention", visualStatus: "attention", candidateStatus: "canonical-integrated"
      }
    };
  });
  return sprites;
}

export function promoteApprovedOpeningV3(project) {
  const originalScene = project.rooms?.find((room) => room.name === "abertura");
  if (!originalScene || originalScene.runtime?.type !== "cutscene") {
    throw new Error("Cena abertura ausente ou sem runtime cutscene");
  }
  const steps = originalScene.runtime.config?.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("A abertura precisa ter ao menos um quadro");
  }
  const scene = {
    ...originalScene,
    runtime: {
      ...originalScene.runtime,
      config: {
        ...originalScene.runtime.config,
        steps: steps.map((step) => ({
          ...step,
          id: v3Id(step.id)
        }))
      }
    }
  };
  const assets = (project.assets ?? [])
    .filter((asset) => !/^opening-v[23]-/.test(asset.id ?? "") || asset.kind === "Background")
    .concat(openingAssets());
  const actors = (project.actors ?? []).map((actor) => {
    const key = actor.roomName === "abertura" ? poseKey(actor.id) : undefined;
    return key ? {
      ...actor,
      id: `opening-v3-actor-${key}`,
      spriteSheet: spriteByKey.get(key).name,
      animationStateID: v3Id(actor.animationStateID)
    } : actor;
  });
  const animations = uniqueOpeningRecords((project.animations ?? []).map((animation) => {
    const key = POSE_KEYS.find((pose) =>
      animation.id === `opening-v2-animation-${pose}` || animation.id === `opening-v3-animation-${pose}`);
    return key ? {
      ...animation,
      id: `opening-v3-animation-${key}`,
      spriteSheet: spriteByKey.get(key).name,
      frames: animation.frames.map((frame) => ({ ...frame, id: v3Id(frame.id) }))
    } : animation;
  }));
  const animationStates = uniqueOpeningRecords((project.animationStates ?? []).map((state) => {
    const key = POSE_KEYS.find((pose) =>
      state.id === `opening-v2-state-${pose}` || state.id === `opening-v3-state-${pose}`);
    return key ? {
      ...state,
      id: `opening-v3-state-${key}`,
      spriteSheet: spriteByKey.get(key).name,
      animationIDs: state.animationIDs.map(v3Id)
    } : state;
  }));
  return {
    ...project,
    assets,
    actors,
    animations,
    animationStates,
    rooms: project.rooms.map((room) => room.name === "abertura" ? scene : room),
    scenas: project.scenas.map((room) => room.name === "abertura" ? structuredClone(scene) : room)
  };
}
