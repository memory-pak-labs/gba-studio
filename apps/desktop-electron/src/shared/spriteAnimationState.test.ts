import { describe, expect, it } from "vitest";

import {
  normalizeSpriteDirection,
  normalizeSpriteStateSlots,
  resolveSpriteStateForActor,
  SPRITE_ANIMATION_SLOT_ORDER,
  type SpriteAnimationDescriptor,
  type SpriteStateContract
} from "./spriteAnimationState.js";

function animation(id: string, state: string, direction: string): SpriteAnimationDescriptor {
  return { id, state, direction };
}

const fourDirectionAnimations = [
  animation("idle-down", "idle", "down"),
  animation("idle-right", "idle", "right"),
  animation("idle-up", "idle", "up"),
  animation("idle-left", "idle", "left"),
  animation("walk-down", "walk", "down"),
  animation("walk-right", "walk", "right"),
  animation("walk-up", "walk", "up"),
  animation("walk-left", "walk", "left")
];

function spriteState(
  animationType: SpriteStateContract["animationType"],
  animationIDs = fourDirectionAnimations.map((entry) => entry.id),
  mirrorLeftFromRight = false
): SpriteStateContract {
  return {
    id: "state-default",
    name: "default",
    spriteSheet: "hero.png",
    animationType,
    mirrorLeftFromRight,
    animationIDs
  };
}

describe("SpriteState directional normalization", () => {
  it("normaliza quatro direcoes sem movimento reutilizando as poses paradas", () => {
    const result = normalizeSpriteStateSlots(
      spriteState("four_direction", fourDirectionAnimations.slice(0, 4).map((entry) => entry.id)),
      fourDirectionAnimations
    );

    expect(SPRITE_ANIMATION_SLOT_ORDER).toEqual([
      "idle_down", "idle_right", "idle_up", "idle_left",
      "moving_down", "moving_right", "moving_up", "moving_left"
    ]);
    expect(result.slots.idle_down).toEqual({ animationID: "idle-down", flipX: false });
    expect(result.slots.moving_down).toEqual({ animationID: "idle-down", flipX: false });
    expect(result.slots.moving_left).toEqual({ animationID: "idle-left", flipX: false });
    expect(result.missingSlots).toEqual([]);
  });

  it("normaliza quatro direcoes com movimento para oito animacoes distintas", () => {
    const result = normalizeSpriteStateSlots(spriteState("four_direction_movement"), fourDirectionAnimations);

    expect(SPRITE_ANIMATION_SLOT_ORDER.map((slot) => result.slots[slot].animationID)).toEqual([
      "idle-down", "idle-right", "idle-up", "idle-left",
      "walk-down", "walk-right", "walk-up", "walk-left"
    ]);
  });

  it("reutiliza direita espelhada quando a esquerda nao foi autorada", () => {
    const authored = fourDirectionAnimations.filter((entry) => !entry.id.endsWith("left"));
    const result = normalizeSpriteStateSlots(
      spriteState("four_direction_movement", authored.map((entry) => entry.id), true),
      authored
    );

    expect(result.slots.idle_left).toEqual({ animationID: "idle-right", flipX: true });
    expect(result.slots.moving_left).toEqual({ animationID: "walk-right", flipX: true });
  });

  it.each([
    ["fixed", ["idle-down", "idle-down"]],
    ["fixed_movement", ["idle-down", "walk-down"]],
    ["horizontal", ["idle-right", "idle-right"]],
    ["horizontal_movement", ["idle-right", "walk-right"]],
    ["platform_player", ["idle-right", "walk-right"]],
    ["cursor", ["idle-down", "walk-down"]],
    ["directional_view", ["idle-down", "walk-down"]],
    ["four_direction", ["idle-down", "idle-down"]]
  ] as const)("expande o perfil %s para os slots direcionais", (animationType, expected) => {
    const result = normalizeSpriteStateSlots(spriteState(animationType), fourDirectionAnimations);

    expect(result.slots.idle_down.animationID).toBe(expected[0]);
    expect(result.slots.moving_down.animationID).toBe(expected[1]);
    expect(result.missingSlots).toEqual([]);
  });

  it("directional_view reutiliza poses paradas para movimento quando nao houver animacao de movimento", () => {
    const authored = fourDirectionAnimations.filter((animation) => animation.state !== "walk");
    const result = normalizeSpriteStateSlots(
      spriteState("directional_view", authored.map((entry) => entry.id)),
      fourDirectionAnimations
    );

    expect(result.slots.idle_down).toEqual({ animationID: "idle-down", flipX: false });
    expect(result.slots.moving_down).toEqual({ animationID: "idle-down", flipX: false });
    expect(result.slots.moving_left).toEqual({ animationID: "idle-left", flipX: false });
    expect(result.missingSlots).toEqual([]);
  });

  it("aplica adaptadores de direcao para top-down, isometrico, plataforma e cursor", () => {
    expect(normalizeSpriteDirection("up", "topdown")).toBe("up");
    expect(normalizeSpriteDirection("down-left", "isometric")).toBe("left");
    expect(normalizeSpriteDirection("down-right", "isometric")).toBe("right");
    expect(normalizeSpriteDirection("up-right", "isometric")).toBe("up");
    expect(normalizeSpriteDirection("up-left", "isometric")).toBe("down");
    expect(normalizeSpriteDirection("left", "platformer")).toBe("left");
    expect(normalizeSpriteDirection("hover", "cursor")).toBe("down");
  });

  it("resolve o conjunto explicitamente referenciado pelo ator", () => {
    const states = [
      spriteState("four_direction"),
      { ...spriteState("four_direction_movement"), id: "state-combat", name: "combat" }
    ];

    expect(resolveSpriteStateForActor(states, {
      animationStateID: "state-combat",
      spriteSheet: "hero.png"
    })?.id).toBe("state-combat");
    expect(resolveSpriteStateForActor(states, { spriteSheet: "hero.png" })?.id).toBe("state-default");
    expect(resolveSpriteStateForActor(states, {
      animationStateID: "state-combat",
      spriteSheet: "enemy.png"
    })).toBeNull();
  });
});
