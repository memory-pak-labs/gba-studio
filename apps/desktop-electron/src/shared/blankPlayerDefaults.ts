import catalog from "../../default-assets/templates/blank/player-defaults.json" with { type: "json" };
import type { GBAProjectData } from "./projectFile.js";
import { normalizeSceneTypeId } from "./sceneTypes.js";

export const BLANK_PLAYER_DEFAULTS_PROFILE = "neutral-purple";

const families: Record<string, string> = {
  topdown: "topdown", platformer: "platformer", luta: "fighter", shmup: "shmup", pointAndClick: "point-click",
  racing: "racing-topdown", racingPerspective: "racing-rear",
  isometric: "isometric-adventure", isometricAdventure: "isometric-adventure", isometricTactical: "isometric-tactical"
};

export function usesBlankPlayerDefaults(data: GBAProjectData): boolean {
  const settings = data.settings as { sceneTypes?: { playerDefaultsProfile?: string } } | undefined;
  return settings?.sceneTypes?.playerDefaultsProfile === BLANK_PLAYER_DEFAULTS_PROFILE;
}

export function blankPlayerSpriteForRoom(room: Record<string, unknown>): string {
  const runtime = room.runtime as { config?: { gameplayMode?: string; presentation?: string } } | undefined;
  const sceneType = normalizeSceneTypeId(String(room.sceneType ?? "topdown"));
  const key = sceneType === "racing" && runtime?.config?.presentation === "pseudo3d" ? "racingPerspective"
    : sceneType === "isometric" && runtime?.config?.gameplayMode === "tactical" ? "isometricTactical" : sceneType;
  const family = families[key];
  return catalog.players.find(player => player.family === family)?.spriteSheet ?? "";
}

/** Build fresh project records from the approved, native preparation contract. */
export function blankPlayerContent(): {
  assets: Record<string, unknown>[];
  animations: Record<string, unknown>[];
  animationStates: Record<string, unknown>[];
  defaultPlayerSprites: Record<string, string>;
  defaultShmupExplosionSprite: string;
} {
  const assets: Record<string, unknown>[] = [];
  const animations: Record<string, unknown>[] = [];
  const animationStates: Record<string, unknown>[] = [];
  for (const player of [...catalog.players, ...catalog.effects]) {
    const { family, spriteSheet, frameWidth: width, frameHeight: height } = player;
    // Native offsets place the ship by its canvas and the cursor by its fingertip.
    // Cars use their canvas center; characters keep the Animator's foot anchor.
    // Pixel slices stay intact.
    const originX = "originX" in player ? Number(player.originX) : 0;
    const originY = "originY" in player ? Number(player.originY) : 0;
    const playerAnimations = player.animations.map(spec => ({
      id: `animation-neutral-${family}-${spec.name}`,
      name: spec.name, spriteSheet, state: spec.state, direction: spec.direction,
      fps: spec.fps, loops: spec.loops, frameCount: spec.sourceFrameIndexes.length,
      frameWidth: width, frameHeight: height, colorMode: "4bpp", originX, originY,
      ...("originSpace" in player ? { originSpace: player.originSpace } : {}),
      hitboxX: 0 - originX, hitboxY: -8 - originY, hitboxWidth: 16, hitboxHeight: 16,
      frames: spec.sourceFrameIndexes.map((sourceIndex, frameIndex) => ({
        frameIndex, sourceFrameIndex: sourceIndex, width, height, originX, originY,
        // Animator positions count y upward from the lower edge. The source
        // pack counts y downward; only metadata changes, never the pixels.
        tiles: player.parts.map(part => ({
          x: part.x - Math.floor(width / 2) + 8,
          y: height - part.y - part.height,
          sliceX: sourceIndex * width + part.x, sliceY: part.y,
          sourceSheet: spriteSheet, tileWidth: part.width, tileHeight: part.height,
          flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false
        }))
      }))
    }));
    assets.push({
      id: `asset-neutral-${family}`, name: spriteSheet, kind: "Sprite", systemImage: "figure.walk",
      metadata: {
        source: `Assets/sprites/${spriteSheet}`,
        bundledDefaultAsset: `template:blank/Assets/sprites/${spriteSheet}`,
        visualProfile: BLANK_PLAYER_DEFAULTS_PROFILE, colorMode: "4bpp", streamFrames: true,
        provenance: "Original OpenAI Imagegen artwork visually approved by the user.",
        license: "Project-owned", sourceSha256: player.sourceSha256
      }
    });
    animations.push(...playerAnimations);
    animationStates.push({
      id: `state-neutral-${family}`, name: family, spriteSheet,
      animationType: family === "point-click" ? "cursor" : family === "platformer" ? "platform_player"
        : ["fighter", "shmup", "shmup-explosion", "racing-rear"].includes(family) ? "fixed" : "four_direction_movement",
      mirrorLeftFromRight: family === "platformer" || family === "fighter",
      animationIDs: playerAnimations.map(animation => animation.id)
    });
  }
  return {
    assets, animations, animationStates,
    defaultShmupExplosionSprite: catalog.effects.find(effect => effect.family === "shmup-explosion")!.spriteSheet,
    defaultPlayerSprites: {
      ...Object.fromEntries(Object.entries(families).map(([sceneType, family]) => [
        sceneType, catalog.players.find(player => player.family === family)!.spriteSheet
      ]))
    }
  };
}
