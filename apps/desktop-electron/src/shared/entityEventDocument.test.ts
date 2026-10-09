import { describe, expect, it } from "vitest";

import {
  normalizeGBAEntityDocument,
  normalizeGBAEventDocument
} from "../../../../packages/project-contract/src/entityEventDocument.js";

describe("shared entity and event documents", () => {
  it("normalizes actor identity, scene placement, bounds and bindings", () => {
    expect(normalizeGBAEntityDocument({
      id: "actor-hero",
      name: "Herói",
      room: "porto",
      position: { x: 12, y: 9 },
      size: { width: 2, height: 3 },
      spriteSheet: "hero.png",
      animationName: "idle_down",
      animationStateID: "hero-state",
      eventBindings: { onInteract: "talk_to_hero", onEnter: "ignored" }
    }, "actor")).toEqual({
      schema: "gba-entity/v1",
      kind: "actor",
      id: "actor-hero",
      name: "Herói",
      sceneName: "porto",
      position: { x: 12, y: 9 },
      bounds: { x: 12, y: 9, width: 2, height: 3 },
      eventName: null,
      eventBindings: { onInteract: "talk_to_hero", onEnter: "ignored" },
      spriteSheet: "hero.png",
      animationName: "idle_down",
      animationStateID: "hero-state"
    });
  });

  it("normalizes triggers and supplies a stable fallback event step", () => {
    expect(normalizeGBAEntityDocument({
      name: "Saída",
      sceneName: "porto",
      x: 22,
      y: 35,
      width: 3,
      height: 3,
      eventName: "open_map",
      eventBindings: { onEnter: "open_map", onLeave: "" }
    }, "trigger", 4)).toMatchObject({
      schema: "gba-entity/v1",
      kind: "trigger",
      id: "trigger-5",
      name: "Saída",
      sceneName: "porto",
      position: { x: 22, y: 35 },
      bounds: { x: 22, y: 35, width: 3, height: 3 },
      eventName: "open_map",
      eventBindings: { onEnter: "open_map" },
      spriteSheet: null,
      animationName: null,
      animationStateID: null
    });
  });

  it("normalizes multi-step events without discarding command-only events", () => {
    expect(normalizeGBAEventDocument({
      id: "event-start",
      name: "start_game",
      room: "title",
      category: "Cena",
      detail: "Inicia a campanha",
      steps: [
        { command: "play_music title_theme", isEnabled: false },
        { command: "change_scene porto" }
      ],
      eventKind: "procedure"
    })).toEqual({
      schema: "gba-event/v1",
      id: "event-start",
      name: "start_game",
      sceneName: "title",
      category: "Cena",
      detail: "Inicia a campanha",
      primaryCommand: "change_scene porto",
      steps: [
        { id: "event-start-step-1", command: "play_music title_theme", isEnabled: false },
        { id: "event-start-step-2", command: "change_scene porto", isEnabled: true }
      ],
      eventKind: "procedure"
    });

    expect(normalizeGBAEventDocument({ name: "noop_event", command: "noop" }, 2).steps).toEqual([
      { id: "event-3-step-1", command: "noop", isEnabled: true }
    ]);
  });
});
