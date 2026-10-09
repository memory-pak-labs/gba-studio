import { describe, expect, it } from "vitest";
import { dialogueEditorScene, dialogueSelectionScope } from "./dialogueSceneAuthoring.js";
import { deriveDialoguesForScene } from "./dialoguesWorkspace.js";

describe("dialogue editor navigation", () => {
  it("opens the requested linked scene when a dialogue is shared by multiple scenes", () => {
    const data = {
      scena: "porto",
      scenas: [
        { id: "room-porto", name: "porto", eventBindings: { onEnter: "intro" } },
        { id: "room-farol", name: "farol", eventBindings: { onEnter: "intro" } },
        { id: "room-unused", name: "unused" }
      ],
      dialogues: [{ key: "intro", text: "Olá" }],
      events: [{ id: "evt-intro", name: "intro", command: "show_dialogue intro" }]
    };
    expect(dialogueEditorScene(data, "intro", "room-farol")?.name).toBe("farol");
    expect(dialogueEditorScene(data, "intro", "room-unused")?.name).toBe("porto");
  });
  it("filters by actor identity and event chain while preserving missing references", () => {
    const scene = deriveDialoguesForScene({
      scenas: [{ id: "s", name: "porto", eventBindings: { onInit: "intro" } }],
      actors: [{ id: "a", name: "Guia", roomName: "porto", eventBindings: { onInteract: "talk" } }, { id: "b", name: "Guia", roomName: "porto" }],
      events: [{ name: "intro", command: "show_dialogue bound" }, { name: "talk", steps: [{ command: "show_dialogue greeting" }, { command: "show_dialogue missing" }] }],
      dialogues: [{ key: "bound", actorId: "a", text: "Uma fala na introdução" }, { key: "greeting", text: "Olá" }]
    }, { id: "s", name: "porto" });
    expect(dialogueSelectionScope(scene, [{ id: "a", kind: "actor" }]).dialogues.map(item => item.key)).toEqual(["bound", "greeting"]);
    expect(dialogueSelectionScope(scene, [{ id: "a", kind: "actor" }]).missing.map(item => item.key)).toEqual(["missing"]);
    expect(dialogueSelectionScope(scene, [{ id: "b", kind: "actor" }]).dialogues).toEqual([]);
    expect(dialogueSelectionScope(scene, []).dialogues).toHaveLength(2);
  });
  it("finds the source scene without a loaded Editor workspace and keeps unused speeches accessible", () => {
    const data = {
      scena: "porto",
      scenas: [
        { id: "room-porto", name: "porto", width: 30, height: 20 },
        { id: "room-farol", name: "farol", width: 30, height: 20, eventBindings: { onEnter: "farol_intro" } }
      ],
      dialogues: [{ key: "intro", text: "Olá" }, { key: "unused", text: "Rascunho" }],
      events: [{ id: "evt-intro", name: "farol_intro", command: "show_dialogue intro" }]
    };
    expect(dialogueEditorScene(data, "intro")?.name).toBe("farol");
    expect(dialogueEditorScene(data, "unused")?.name).toBe("porto");
    expect(dialogueEditorScene({}, "intro")).toBeNull();
  });
});
