import { describe, expect, it } from "vitest";
import { createAuthoredDialogue, nextDialogueKey } from "./dialogueAuthoring.js";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";

const data = { dialogues: [{ key: "fala_1", text: "Original" }], events: [{ id: "event-1", name: "entrar", steps: [{ command: "show_dialogue", isEnabled: true }] }] } as GBAProjectData;
describe("contextual dialogue authoring", () => {
  it("creates and links one immutable project update", () => {
    const target = { eventID: "event-1", stepIndex: 0, command: "show_dialogue", tokenIndex: 1 };
    const next = createAuthoredDialogue(data, { key: nextDialogueKey(data), character: "Guia", text: "Bem-vindo!" }, target);
    expect(next.dialogues).toHaveLength(2);
    expect((next.events as Array<Record<string, unknown>>)[0].steps).toEqual([{ command: "show_dialogue fala_2", isEnabled: true }]);
    expect(data.dialogues).toHaveLength(1);
    expect((data.events as Array<Record<string, unknown>>)[0].steps).toEqual([{ command: "show_dialogue", isEnabled: true }]);
  });
  it("rejects duplicate/invalid keys and a stale event without leaving an orphan", () => {
    expect(() => createAuthoredDialogue(data, { key: "fala_1", text: "Outra" })).toThrow(/existe/);
    expect(() => createAuthoredDialogue(data, { key: "duas palavras", text: "Outra" })).toThrow(/espaços/);
    expect(() => createAuthoredDialogue(data, { key: "fala_2", text: "Outra" }, { eventID: "event-1", stepIndex: 0, command: "show_dialogue alterado", tokenIndex: 1 })).toThrow(/mudou/);
    expect(data.dialogues).toHaveLength(1);
  });
  it("does not invent intro_001 for an empty dialogue catalogue", () => {
    const presentation = deriveEventsWorkspacePresentation({ dialogues: [], events: [] } as GBAProjectData);
    const suggestions = presentation.commandPalette.filter(item => item.id === "command:dialogue.show");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].command.trim()).toBe("show_dialogue");
  });
  it("keeps a choice event pending when the catalogue has only speeches without choices", () => {
    const presentation = deriveEventsWorkspacePresentation(data);
    expect(presentation.commandPalette.find(item => item.id === "command:dialogue.choice")?.command).toBe("show_choice");
    expect(() => createAuthoredDialogue(data, { key: "nova", text: "Texto sem opções" }, {
      eventID: "event-1", stepIndex: 0, command: "show_dialogue", tokenIndex: 1, requiresChoices: true
    })).toThrow(/pelo menos uma escolha/);
    expect(data.dialogues).toHaveLength(1);
  });
});
