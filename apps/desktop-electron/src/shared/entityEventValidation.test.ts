import { describe, expect, it } from "vitest";

import { validateGBAEntityEventProjection } from "../../../../packages/project-contract/src/entityEventValidation.js";

describe("entity and event projection validation", () => {
  it("accepts the shared aliases used by the authoring format", () => {
    expect(validateGBAEntityEventProjection({
      scenas: [
        { name: "porto", width: 20, height: 18 },
        { name: "mercado", width: 20, height: 18 }
      ],
      actors: [{
        id: "actor-guide",
        name: "Guia",
        room: "porto",
        position: { x: 4, y: 5 },
        size: { width: 1, height: 2 },
        eventBindings: { onInteract: "talk" }
      }],
      triggers: [{
        id: "trigger-exit",
        name: "Saída",
        sceneName: "porto",
        x: 18,
        y: 15,
        width: 2,
        height: 2,
        eventName: "leave"
      }],
      events: [
        { id: "event-talk", name: "talk", category: "Ator", detail: "", command: "noop" },
        { id: "event-leave", name: "leave", category: "Cena", steps: [{ command: "noop" }] }
      ]
    })).toEqual([]);
  });

  it("reports fields that the projection would discard or make ambiguous", () => {
    const issues = validateGBAEntityEventProjection({
      scenas: [
        { name: "porto", width: 20, height: 18 },
        { name: "mercado", width: 20, height: 18 }
      ],
      actors: [{
        id: "actor-guide",
        name: "Guia",
        room: "missing",
        position: { x: "invalid", y: 3 },
        eventBindings: "invalid",
        spriteSheet: 42
      }, {
        id: "actor-guide",
        name: "Guia duplicado",
        roomName: "porto",
        x: 2,
        y: 2
      }],
      events: [{
        id: "event-boot",
        name: "boot",
        category: "Cena",
        detail: 42,
        eventKind: "legacy",
        steps: [{ command: "", isEnabled: "yes" }]
      }, {
        id: "event-other",
        name: "boot",
        category: "Cena",
        command: "noop"
      }]
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "actors", itemName: "Guia", invalidFields: expect.arrayContaining(["sceneName", "position.x", "eventBindings", "spriteSheet"]) }),
      expect.objectContaining({ source: "actors", itemName: "Guia duplicado", invalidFields: expect.arrayContaining(["id"]) }),
      expect.objectContaining({ source: "events", itemName: "boot", invalidFields: expect.arrayContaining(["name", "detail", "eventKind", "steps[0].command", "steps[0].isEnabled"]) })
    ]));
  });
});
