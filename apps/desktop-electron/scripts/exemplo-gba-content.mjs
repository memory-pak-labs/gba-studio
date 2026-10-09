const legacyTopdownPlayerSprite = "player-topdown-4dir-16x32.png";
const topdownPlayerSprite = "player_topdown_4dir.png";
const topdownAnimationSourceFrames = Object.freeze({
  idle_down: [0],
  walk_down: [0, 3],
  idle_up: [1],
  walk_up: [1, 4],
  idle_right: [2],
  walk_right: [2, 5],
  idle_left: [2],
  walk_left: [2, 5]
});

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeAnimationGeometry(animation) {
  if (!animation || typeof animation !== "object") return animation;
  const frameWidth = Math.max(1, finiteNumber(animation.frameWidth, 16));
  const frameHeight = Math.max(1, finiteNumber(animation.frameHeight, 16));
  const defaultOriginX = Math.max(0, Math.floor(frameWidth / 2) - 8);
  const frames = Array.isArray(animation.frames) ? animation.frames.map((frame) => {
    if (!frame || typeof frame !== "object") return frame;
    const width = Math.max(1, finiteNumber(frame.width, frameWidth));
    const height = Math.max(1, finiteNumber(frame.height, frameHeight));
    const frameDefaultOriginX = Math.max(0, Math.floor(width / 2) - 8);
    const alreadyUsesGBStudioCoordinates = animation.originX === 0
      && animation.originY === 0
      && frame.originX === 0
      && frame.originY === 0;
    const tiles = Array.isArray(frame.tiles) ? frame.tiles.map((tile) => {
      if (!tile || typeof tile !== "object" || alreadyUsesGBStudioCoordinates) return tile;
      const tileHeight = Math.max(1, finiteNumber(tile.tileHeight, 8));
      return {
        ...tile,
        x: finiteNumber(tile.x, 0) - frameDefaultOriginX,
        y: height - finiteNumber(tile.y, 0) - tileHeight
      };
    }) : [];
    return { ...frame, originX: 0, originY: 0, tiles };
  }) : [];

  let hitboxX = finiteNumber(animation.hitboxX, 0);
  let hitboxY = finiteNumber(animation.hitboxY, -8);
  const hasExplicitHitboxY = Number.isFinite(animation.hitboxY);
  const hitboxWidth = Math.max(1, finiteNumber(animation.hitboxWidth, frameWidth));
  const hitboxHeight = Math.max(1, finiteNumber(animation.hitboxHeight, frameHeight));
  const wasPseudoFullFrame = hitboxX === -Math.floor(frameWidth / 2)
    && hitboxY === -frameHeight
    && hitboxWidth === frameWidth
    && hitboxHeight === frameHeight;
  if (
    frameWidth === 16
    && hitboxWidth === 16
    && hitboxHeight === 16
    && !hasExplicitHitboxY
  ) {
    hitboxX = 0;
    hitboxY = -8;
  } else if (wasPseudoFullFrame) {
    hitboxX = -defaultOriginX;
    hitboxY = 8 - frameHeight;
  }

  return {
    ...animation,
    frames,
    originX: 0,
    originY: 0,
    hitboxX,
    hitboxY,
    hitboxWidth,
    hitboxHeight
  };
}

function promoteTopdownPlayerAnimation(animation) {
  const sourceFrames = topdownAnimationSourceFrames[animation?.name];
  if (!sourceFrames) return normalizeAnimationGeometry(animation);
  const flipX = animation.direction === "left" || animation.name.endsWith("_left");
  const frames = sourceFrames.map((sourceFrameIndex, frameIndex) => ({
    id: `${animation.id}-frame-${frameIndex}`,
    frameIndex,
    width: 16,
    height: 16,
    originX: 0,
    originY: 0,
    sourceFrameIndex,
    tiles: [{
      id: `${animation.id}-frame-${frameIndex}-tile-0`,
      x: 0,
      y: 0,
      sliceX: sourceFrameIndex * 16,
      sliceY: 0,
      sourceSheet: topdownPlayerSprite,
      tileWidth: 16,
      tileHeight: 16,
      paletteIndex: 0,
      objPalette: "OBP0",
      priority: false,
      flipX,
      flipY: false
    }]
  }));

  return {
    ...animation,
    spriteSheet: topdownPlayerSprite,
    frameCount: frames.length,
    frameWidth: 16,
    frameHeight: 16,
    originX: 0,
    originY: 0,
    hitboxX: 0,
    hitboxY: -8,
    hitboxWidth: 16,
    hitboxHeight: 16,
    frames
  };
}

export function mergeImportedExemploEvents(importedEvents, promotedEvents) {
  const promotedCommandsByID = new Map();
  const collectPromotedCommands = (value) => {
    if (Array.isArray(value)) {
      value.forEach(collectPromotedCommands);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (typeof value.id === "string" && typeof value.command === "string") {
      promotedCommandsByID.set(value.id, value.command);
    }
    Object.values(value).forEach(collectPromotedCommands);
  };
  collectPromotedCommands(promotedEvents);

  const mergeValue = (value) => {
    if (Array.isArray(value)) return value.map(mergeValue);
    if (!value || typeof value !== "object") return value;
    const merged = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, mergeValue(child)])
    );
    if (typeof value.id === "string" && promotedCommandsByID.has(value.id)) {
      merged.command = promotedCommandsByID.get(value.id);
    }
    return merged;
  };
  return mergeValue(Array.isArray(importedEvents) ? importedEvents : []);
}

export function promoteExemploGBAContent(data) {
  const promoted = structuredClone(data);
  promoted.scenas = Array.isArray(promoted.scenas)
    ? promoted.scenas.map((scene) => ({
        ...scene,
        playerActorName: scene?.playerActorName ?? "Player"
      }))
    : [];
  promoted.animations = Array.isArray(promoted.animations)
    ? promoted.animations.map((animation) => (
        animation?.spriteSheet === legacyTopdownPlayerSprite
          || animation?.spriteSheet === topdownPlayerSprite
            ? promoteTopdownPlayerAnimation(animation)
            : normalizeAnimationGeometry(animation)
      ))
    : [];
  promoted.animationStates = Array.isArray(promoted.animationStates)
    ? promoted.animationStates.map((state) => (
        state?.spriteSheet === legacyTopdownPlayerSprite
          ? { ...state, spriteSheet: topdownPlayerSprite }
          : state
      ))
    : [];
  promoted.assets = Array.isArray(promoted.assets)
    ? promoted.assets.map((asset) => (
        asset?.name === legacyTopdownPlayerSprite || asset?.name === topdownPlayerSprite
          ? {
              ...asset,
              id: "asset-player-topdown-4dir-png",
              name: topdownPlayerSprite,
              metadata: {
                ...asset.metadata,
                source: `Assets/sprites/${topdownPlayerSprite}`,
                bundledDefaultAsset: `template:exemplo-gba/Assets/sprites/${topdownPlayerSprite}`,
                generatedBy: "gba-sprite-prep/production/first-wave",
                placeholder: false,
                provenance: "Kenney RPG Urban Pack; normalized for GBA Studio",
                license: "CC0-1.0"
              }
            }
          : asset
      ))
    : [];
  if (promoted.settings?.topdown?.playerSprite === legacyTopdownPlayerSprite) {
    promoted.settings.topdown.playerSprite = topdownPlayerSprite;
  }
  const animationsByID = new Map(promoted.animations.map((animation) => [animation?.id, animation]));
  const statesByID = new Map(promoted.animationStates.map((state) => [state?.id, state]));
  promoted.actors = Array.isArray(promoted.actors)
    ? promoted.actors.map((actor) => {
        const spriteSheet = actor?.spriteSheet === legacyTopdownPlayerSprite
          ? topdownPlayerSprite
          : actor?.spriteSheet;
        const updatedActor = spriteSheet === actor?.spriteSheet ? actor : { ...actor, spriteSheet };
        const matchingAnimations = promoted.animations.filter((animation) => animation?.spriteSheet === spriteSheet);
        if (matchingAnimations.some((animation) => animation?.name === updatedActor?.animationName)) return updatedActor;
        const state = statesByID.get(updatedActor?.animationStateID);
        const stateAnimation = Array.isArray(state?.animationIDs)
          ? state.animationIDs.map((id) => animationsByID.get(id)).find((animation) => animation?.spriteSheet === spriteSheet)
          : undefined;
        const resolvedAnimation = stateAnimation ?? matchingAnimations[0];
        return resolvedAnimation?.name
          ? { ...updatedActor, animationName: resolvedAnimation.name }
          : updatedActor;
      })
    : [];
  return promoted;
}
