export const SPRITE_ANIMATION_TYPES = [
  "fixed",
  "fixed_movement",
  "horizontal",
  "horizontal_movement",
  "four_direction",
  "four_direction_movement",
  "directional_view",
  "platform_player",
  "cursor"
] as const;

export type SpriteAnimationType = typeof SPRITE_ANIMATION_TYPES[number];

export const SPRITE_ANIMATION_SLOT_ORDER = [
  "idle_down",
  "idle_right",
  "idle_up",
  "idle_left",
  "moving_down",
  "moving_right",
  "moving_up",
  "moving_left"
] as const;

export type SpriteAnimationSlot = typeof SPRITE_ANIMATION_SLOT_ORDER[number];
export type SpriteDirection = "down" | "right" | "up" | "left";
export type SpriteMotion = "idle" | "moving";
export type SpriteDirectionAdapter = "topdown" | "isometric" | "platformer" | "cursor";

export interface SpriteAnimationDescriptor {
  id: string;
  state?: string | null;
  direction?: string | null;
  name?: string;
  spriteSheet?: string;
}

export interface SpriteStateContract {
  id: string;
  name: string;
  spriteSheet: string;
  animationType: SpriteAnimationType;
  mirrorLeftFromRight: boolean;
  animationIDs: string[];
}

export interface SpriteActorAnimationStateReference {
  animationStateID?: string | null;
  spriteSheet?: string | null;
}

export interface NormalizedSpriteAnimationSlot {
  animationID: string | null;
  flipX: boolean;
}

export interface NormalizedSpriteStateSlots {
  slots: Record<SpriteAnimationSlot, NormalizedSpriteAnimationSlot>;
  missingSlots: SpriteAnimationSlot[];
}

const IDLE_STATE_NAMES = new Set(["idle", "stand", "standing", "default", "normal"]);
const MOVING_STATE_NAMES = new Set(["walk", "walking", "move", "moving", "run", "running", "hover"]);

function normalizedToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function motionForAnimation(animation: SpriteAnimationDescriptor): SpriteMotion {
  const state = normalizedToken(animation.state);
  if (MOVING_STATE_NAMES.has(state)) return "moving";
  if (IDLE_STATE_NAMES.has(state)) return "idle";

  const nameTokens = normalizedToken(animation.name).split("-");
  return nameTokens.some((token) => MOVING_STATE_NAMES.has(token)) ? "moving" : "idle";
}

export function normalizeSpriteDirection(
  direction: string | null | undefined,
  adapter: SpriteDirectionAdapter = "topdown"
): SpriteDirection {
  const value = normalizedToken(direction);
  if (adapter === "isometric") {
    if (value === "down-left" || value === "south-west" || value === "southwest") return "left";
    if (value === "down-right" || value === "south-east" || value === "southeast") return "right";
    if (value === "up-right" || value === "north-east" || value === "northeast") return "up";
    if (value === "up-left" || value === "north-west" || value === "northwest") return "down";
  }
  if (value === "right" || value === "east") return "right";
  if (value === "up" || value === "north") return "up";
  if (value === "left" || value === "west") return "left";
  return "down";
}

function directionForAnimation(
  animation: SpriteAnimationDescriptor,
  adapter: SpriteDirectionAdapter
): SpriteDirection {
  if (animation.direction) return normalizeSpriteDirection(animation.direction, adapter);
  const name = normalizedToken(animation.name);
  const knownDirections = ["down-left", "down-right", "up-left", "up-right", "down", "right", "up", "left"];
  return normalizeSpriteDirection(knownDirections.find((direction) => name.includes(direction)), adapter);
}

function emptySlots(): Record<SpriteAnimationSlot, NormalizedSpriteAnimationSlot> {
  return Object.fromEntries(SPRITE_ANIMATION_SLOT_ORDER.map((slot) => [
    slot,
    { animationID: null, flipX: false }
  ])) as Record<SpriteAnimationSlot, NormalizedSpriteAnimationSlot>;
}

function slotName(motion: SpriteMotion, direction: SpriteDirection): SpriteAnimationSlot {
  return `${motion}_${direction}` as SpriteAnimationSlot;
}

function assignSlot(
  slots: Record<SpriteAnimationSlot, NormalizedSpriteAnimationSlot>,
  slot: SpriteAnimationSlot,
  animation: SpriteAnimationDescriptor | undefined,
  flipX = false
): void {
  slots[slot] = { animationID: animation?.id ?? null, flipX: Boolean(animation) && flipX };
}

export function normalizeSpriteStateSlots(
  state: SpriteStateContract,
  animations: SpriteAnimationDescriptor[],
  adapter: SpriteDirectionAdapter = "topdown"
): NormalizedSpriteStateSlots {
  const allowedIDs = new Set(state.animationIDs);
  const authored = animations.filter((animation) => allowedIDs.has(animation.id));
  const slots = emptySlots();
  const find = (motion: SpriteMotion, direction?: SpriteDirection): SpriteAnimationDescriptor | undefined => (
    authored.find((animation) => (
      motionForAnimation(animation) === motion
      && (direction === undefined || directionForAnimation(animation, adapter) === direction)
    ))
  );
  const firstIdle = find("idle") ?? authored[0];
  const firstMoving = find("moving") ?? firstIdle;
  const hasMovingAnimations = authored.some((animation) => motionForAnimation(animation) === "moving");

  const assignAll = (motion: SpriteMotion, animation: SpriteAnimationDescriptor | undefined): void => {
    (["down", "right", "up", "left"] as const).forEach((direction) => {
      assignSlot(slots, slotName(motion, direction), animation);
    });
  };

  if (state.animationType === "fixed" || state.animationType === "cursor") {
    assignAll("idle", firstIdle);
    assignAll("moving", state.animationType === "cursor" ? firstMoving : firstIdle);
  } else if (state.animationType === "fixed_movement") {
    assignAll("idle", firstIdle);
    assignAll("moving", firstMoving);
  } else if (
    state.animationType === "horizontal"
    || state.animationType === "horizontal_movement"
    || state.animationType === "platform_player"
  ) {
    const hasMovement = state.animationType !== "horizontal";
    const idleRight = find("idle", "right") ?? firstIdle;
    const idleLeft = find("idle", "left");
    const movingRight = hasMovement ? find("moving", "right") ?? firstMoving : idleRight;
    const movingLeft = hasMovement ? find("moving", "left") : idleLeft;

    assignSlot(slots, "idle_down", idleRight);
    assignSlot(slots, "idle_right", idleRight);
    assignSlot(slots, "idle_up", idleRight);
    assignSlot(slots, "idle_left", idleLeft ?? idleRight, !idleLeft && state.mirrorLeftFromRight);
    assignSlot(slots, "moving_down", movingRight);
    assignSlot(slots, "moving_right", movingRight);
    assignSlot(slots, "moving_up", movingRight);
    assignSlot(slots, "moving_left", movingLeft ?? movingRight, !movingLeft && state.mirrorLeftFromRight);
  } else if (state.animationType === "four_direction") {
    for (const direction of ["down", "right", "up", "left"] as const) {
      const oppositeMirrorSource = direction === "left" && state.mirrorLeftFromRight
        ? find("idle", "right")
        : undefined;
      const idle = find("idle", direction) ?? oppositeMirrorSource;
      assignSlot(slots, slotName("idle", direction), idle, Boolean(oppositeMirrorSource && !find("idle", direction)));
      assignSlot(slots, slotName("moving", direction), idle);
    }
  } else if (state.animationType === "directional_view") {
    const hasMovement = hasMovingAnimations;
    for (const direction of ["down", "right", "up", "left"] as const) {
      const oppositeMirrorSource = direction === "left" && state.mirrorLeftFromRight
        ? find("idle", "right")
        : undefined;
      const idle = find("idle", direction) ?? oppositeMirrorSource;
      const moving = hasMovement ? (find("moving", direction) ?? idle) : idle;
      assignSlot(slots, slotName("idle", direction), idle, Boolean(oppositeMirrorSource && !find("idle", direction)));
      assignSlot(slots, slotName("moving", direction), moving, Boolean(hasMovement && oppositeMirrorSource && !find("moving", direction)));
    }
  } else {
    const hasMovement = state.animationType === "four_direction_movement";
    for (const direction of ["down", "right", "up", "left"] as const) {
      const oppositeMirrorSource = direction === "left" && state.mirrorLeftFromRight
        ? find("idle", "right")
        : undefined;
      const idle = find("idle", direction) ?? oppositeMirrorSource;
      const movingMirrorSource = direction === "left" && state.mirrorLeftFromRight
        ? find("moving", "right")
        : undefined;
      const moving = hasMovement
        ? find("moving", direction) ?? movingMirrorSource
        : idle;
      assignSlot(slots, slotName("idle", direction), idle, Boolean(oppositeMirrorSource && !find("idle", direction)));
      assignSlot(slots, slotName("moving", direction), moving, Boolean(hasMovement && movingMirrorSource && !find("moving", direction)));
    }
  }

  return {
    slots,
    missingSlots: SPRITE_ANIMATION_SLOT_ORDER.filter((slot) => slots[slot].animationID === null)
  };
}

export function resolveSpriteStateForActor(
  states: SpriteStateContract[],
  actor: SpriteActorAnimationStateReference
): SpriteStateContract | null {
  const explicitID = actor.animationStateID?.trim();
  const spriteSheet = actor.spriteSheet?.trim();
  if (explicitID) {
    const explicitState = states.find((state) => state.id === explicitID);
    if (explicitState && (!spriteSheet || explicitState.spriteSheet === spriteSheet)) {
      return explicitState;
    }
  }
  if (!spriteSheet) return null;
  return states.find((state) => state.spriteSheet === spriteSheet) ?? null;
}

export function isSpriteAnimationType(value: unknown): value is SpriteAnimationType {
  return typeof value === "string" && SPRITE_ANIMATION_TYPES.includes(value as SpriteAnimationType);
}
