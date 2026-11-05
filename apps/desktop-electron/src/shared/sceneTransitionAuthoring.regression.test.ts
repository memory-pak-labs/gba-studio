import { describe, expect, it } from "vitest";
import { validateGBAEntityEventProjection } from "../../../../packages/project-contract/src/entityEventValidation.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { parseEventInstruction } from "./eventExecutionContract.js";
import { auditProjectEventReferenceWarnings } from "./eventReferenceAudit.js";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";
import { createBlankProjectData } from "./newProject.js";
import { createPreviewRuntime, runPreviewRuntimeEvent } from "./previewRuntime.js";
import { createTriggerInProject, deriveRoomEventSceneLinks, updateRoomEventSceneLinkCommand } from "./roomsWorkspace.js";

const project = () => ({
  ...createBlankProjectData({ name: "Transição QA", includeStarterContent: false }),
  assets: [], assetGroups: [], animations: [], animationStates: [], spriteReferenceImages: [], audioItems: [], dialogues: [],
  scenas: [
    { id: "start", name: "Praça Inicial", sceneType: "topdown", width: 30, height: 20 },
    { id: "house", name: "Casa de Teste", sceneType: "topdown", width: 30, height: 20 }
  ],
  actors: [{ id: "player", name: "Player", roomName: "Praça Inicial", x: 3, y: 3 }],
  events: [{ id: "door", name: "door", category: "Cena", roomName: "Praça Inicial", steps: [
    { command: 'change_scene "Casa de Teste" 4 5 right' }
  ] }],
  triggers: [],
  settings: {
    general: { gameTitle: "QA", startScene: "Praça Inicial", startSceneType: "topdown", exportFolder: "build" },
    build: { romFileName: "qa.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
    preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
    audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
    save: { saveType: "sram", slots: 3, autoSave: true },
    debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
  }
});

describe("scene transition authoring and trigger projection", () => {
  it("accepts the empty optional eventName created by the trigger tool while still rejecting invalid types", () => {
    const created = createTriggerInProject(project(), { roomID: "start", x: 1, y: 2, width: 2, height: 2 });
    (created.triggers as Record<string, unknown>[])[0]!.eventBindings = { onEnter: "door" };
    expect(validateGBAEntityEventProjection(created)).toEqual([]);
    const invalid = structuredClone(created);
    (invalid.triggers as Record<string, unknown>[])[0]!.eventName = 42;
    expect(validateGBAEntityEventProjection(invalid)).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "triggers", invalidFields: expect.arrayContaining(["eventName"]) })
    ]));
    expect(() => buildEngineExportProjectContract(created)).not.toThrow();
  });

  it("keeps a scene with spaces as one operand throughout the editor, diagnostics, preview and export", () => {
    const data = project();
    const command = 'change_scene "Casa de Teste" 4 5 right';
    expect(parseEventInstruction(command).operands).toEqual(["Casa de Teste", "4", "5", "right"]);
    const presentation = deriveEventsWorkspacePresentation(data);
    const event = presentation.groups.flatMap(group => group.events).find(item => item.name === "door")!;
    expect(event.steps[0]!.commandParameters.map(parameter => parameter.value)).toEqual(["Casa de Teste", "4", "5", "right"]);
    expect(presentation.commandPalette.find(item => item.id === "command:scene.change")?.command).toBe('change_scene "Casa de Teste"');
    expect(auditProjectEventReferenceWarnings(data)).toEqual([]);
    const preview = runPreviewRuntimeEvent(createPreviewRuntime(data), "door");
    expect(preview.currentRoom?.name).toBe("Casa de Teste");
    expect(preview.player).toMatchObject({ x: 4, y: 5, direction: "right" });
    const exported = buildEngineExportProjectContract(data);
    expect(exported.topdown_project?.scripts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "door", script: expect.arrayContaining([
        expect.objectContaining({ op: "warp", room: 1, x: 32, y: 40 })
      ]) })
    ]));
  });

  it("preserves a quoted scene name when adjusting an arrival marker", () => {
    const data = project();
    const links = deriveRoomEventSceneLinks(data);
    expect(links).toEqual(expect.arrayContaining([expect.objectContaining({ from: "Praça Inicial", to: "Casa de Teste", x: 4, y: 5 })]));
    expect(updateRoomEventSceneLinkCommand('change_scene "Casa de Teste" 4 5 right', { x: 8, y: 9, direction: "up" }))
      .toBe('change_scene "Casa de Teste" 8 9 up');
  });

  it("gives arrival links distinct identities when a transition event is shared by two scenes", () => {
    const data = project();
    data.scenas.push({ id: "other", name: "Outro Lugar", sceneType: "topdown", width: 30, height: 20 });
    delete (data.events[0] as { roomName?: string }).roomName;
    const links = deriveRoomEventSceneLinks({ ...data, triggers: [
      { id: "first", roomName: "Praça Inicial", eventBindings: { onEnter: "door" } },
      { id: "second", roomName: "Outro Lugar", eventBindings: { onEnter: "door" } }
    ] });
    expect(links.map(link => link.from)).toEqual(["Praça Inicial", "Outro Lugar"]);
    expect(new Set(links.map(link => link.id)).size).toBe(2);
  });

  it("does not replay a plain visual-novel entry dialogue as automatic scene content", () => {
    const base = project();
    const data = {
      ...base,
      scenas: [{ id: "story", name: "História", sceneType: "visualNovel", width: 30, height: 20,
        eventBindings: { onInit: "story_start" }, runtime: { type: "visualNovel", config: {} } }],
      actors: [], triggers: [],
      dialogues: [{ id: "line", key: "intro", text: "Olá!", character: "Narrador" }],
      events: [{ id: "start", name: "story_start", category: "Cena", steps: [{ command: "show_dialogue intro" }] }],
      settings: { ...base.settings, general: { ...base.settings.general, startScene: "História", startSceneType: "visualNovel" } }
    };
    const scene = buildEngineExportProjectContract(data).visual_novel_project!.scenes[0]!;
    expect(scene.on_enter).toContainEqual({ op: "show_dialogue", dialogue: 0 });
    expect(scene.line).toBe(-1);
    expect(scene.choice_group).toBe(-1);
    const explicit = structuredClone(data);
    explicit.scenas[0]!.runtime.config = { dialogueKey: "intro" };
    expect(buildEngineExportProjectContract(explicit).visual_novel_project!.scenes[0]!.line).toBe(0);
    const withChoices = { ...data, dialogues: [{ ...data.dialogues[0]!, choices: ["Continuar"] }] };
    expect(buildEngineExportProjectContract(withChoices).visual_novel_project!.scenes[0]).toMatchObject({
      line: 0, choice_group: 0
    });
  });
});
