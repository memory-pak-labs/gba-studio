import { normalizeSceneTypeId } from "./sceneTypes.js";

export interface DefaultSceneActorPreset {
  animationName: string;
  animationStateID: string;
  sceneType: string;
  spriteSheet: string;
}

const DEFAULT_SCENE_ACTOR_PRESETS: Record<string, DefaultSceneActorPreset> = {
  topdown: {
    sceneType: "topdown",
    spriteSheet: "player_topdown_4dir.png",
    animationStateID: "state-player-default",
    animationName: "idle_down"
  },
  platformer: {
    sceneType: "platformer",
    spriteSheet: "player_platformer.png",
    animationStateID: "state-player-platformer",
    animationName: "idle_right"
  },
  pointAndClick: {
    sceneType: "pointAndClick",
    spriteSheet: "actor_point_click.png",
    animationStateID: "state-player-point-click",
    animationName: "point_click_actor_idle"
  },
  shmup: {
    sceneType: "shmup",
    spriteSheet: "player_shmup.png",
    animationStateID: "state-player-shmup",
    animationName: "idle"
  },
  isometric: {
    sceneType: "isometric",
    spriteSheet: "actor_isometric.png",
    animationStateID: "state-player-isometric",
    animationName: "idle_down_left"
  },
  racing: {
    sceneType: "racing",
    spriteSheet: "nara-racer.png",
    animationStateID: "state-player-racing",
    animationName: "idle"
  },
  luta: {
    sceneType: "luta",
    spriteSheet: "nara-fighter.png",
    animationStateID: "state-player-luta",
    animationName: "idle"
  }
};

export function defaultSceneActorPreset(sceneType: string | null | undefined): DefaultSceneActorPreset | null {
  const normalized = normalizeSceneTypeId(sceneType, "topdown");
  return DEFAULT_SCENE_ACTOR_PRESETS[normalized] ?? null;
}

export function defaultPlayerSpriteForSceneType(sceneType: string | null | undefined): string {
  return defaultSceneActorPreset(sceneType)?.spriteSheet ?? "";
}

export function defaultSceneActorPosition(
  sceneType: string | null | undefined,
  width: number,
  height: number
): { x: number; y: number } {
  const normalized = normalizeSceneTypeId(sceneType, "topdown");
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));

  if (normalized === "platformer") {
    return { x: 2, y: Math.max(2, safeHeight - 4) };
  }
  if (normalized === "shmup") {
    return { x: Math.min(7, safeWidth - 2), y: Math.max(2, Math.floor(safeHeight / 2)) };
  }
  if (normalized === "racing") {
    return { x: Math.max(1, Math.floor(safeWidth / 2) - 1), y: Math.max(2, safeHeight - 4) };
  }
  if (normalized === "luta") {
    return { x: 2, y: Math.max(2, safeHeight - 4) };
  }
  return { x: 2, y: 2 };
}

export function defaultSceneActorForRoom(options: {
  roomID: string;
  roomName: string;
  sceneType: string | null | undefined;
  width: number;
  height: number;
}): Record<string, unknown> | null {
  const preset = defaultSceneActorPreset(options.sceneType);
  if (!preset) return null;

  const position = defaultSceneActorPosition(options.sceneType, options.width, options.height);
  const roomIDPart = options.roomID
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "scene";

  return {
    id: `actor-player-${roomIDPart}`,
    name: "Player",
    roomName: options.roomName,
    spriteSheet: preset.spriteSheet,
    animationStateID: preset.animationStateID,
    animationName: preset.animationName,
    x: position.x,
    y: position.y,
    eventBindings: {}
  };
}
