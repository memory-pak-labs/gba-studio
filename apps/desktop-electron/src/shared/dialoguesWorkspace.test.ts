import { describe, expect, it } from "vitest";
import {
  connectDialogueToStartEventInProject,
  createDialogueInProject,
  deriveDialogueExportSummary,
  deriveDialogueCharacterSound,
  deriveDialogueCharacterProfiles,
  deriveDialoguesEditorContext,
  deriveDialoguesForScene,
  deriveDialoguesWorkspacePresentation,
  deriveDialoguesWorkspaceFilterChips,
  deriveDialoguesWorkspaceValidationIssues,
  duplicateDialogueInProject,
  filterDialoguesWorkspaceDialogues,
  normalizeDialogueInProject,
  prepareDialogueExport,
  removeDialogueFromProject,
  updateDialogueInProject,
  updateDialoguesUiInProject
} from "./dialoguesWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";

const projectData = {
  localization: {
    sourceLocale: "pt-BR",
    defaultLocale: "en",
    enabledLocales: ["pt-BR", "en"]
  },
  assets: [
    { name: "ana_portrait.png", kind: "Portrait" },
    { name: "dialogue_box.png", kind: "UI" },
    { name: "selector.png", kind: "UI" },
    { name: "Smile.png", kind: "Emote" },
    { name: "text_blip.wav", kind: "SFX" },
    { name: "confirm.wav", kind: "SFX" }
  ],
  dialogues: [
    {
      key: "intro_001",
      character: "Ana",
      portrait: "ana_portrait.png",
      emote: "Smile.png",
      textSound: "text_blip.wav",
      confirmSound: "confirm.wav",
      text: "Ola, viajante!",
      translation: "Hello, traveler!",
      translationLanguageCode: "en",
      choices: ["Vamos explorar", "Abrir inventario"],
      choiceTranslations: ["Let's explore", "Open inventory"]
    },
    {
      key: "npc_shop",
      character: "Mercador",
      portrait: "shopkeeper.png",
      emote: "missing_emote.png",
      textSound: "missing_text.wav",
      confirmSound: "missing_confirm.wav",
      text: "Tenho itens raros.",
      choices: ["Comprar", "Sair"]
    }
  ],
  events: [
    {
      id: "evt-1",
      name: "room_boot",
      category: "Cena",
      command: "show_dialogue intro_001"
    },
    {
      id: "evt-2",
      name: "npc_shop_event",
      category: "Dialogo",
      steps: [
        { command: "show_choice npc_shop", isEnabled: true },
        { command: "choice_event npc_shop 1 shop_exit", isEnabled: true }
      ]
    }
  ],
  settings: {
    uiDialogs: {
      font: "GBA padrao",
      textSpeed: "Normal",
      selectorImage: "selector.png",
      boxImage: "dialogue_box.png",
      boxPosition: "Inferior",
      boxWidth: 224,
      boxHeight: 48,
      showPortrait: true,
      portraitPosition: "Esquerda",
      showCharacterName: true,
      nameLabelMode: "inline"
    }
  }
} satisfies GBAProjectData;

describe("dialogues workspace", () => {
  it("counts dialogue keys referenced directly by a scene runtime", () => {
    const presentation = deriveDialoguesWorkspacePresentation({
      dialogues: [{ key: "scene_line", character: "Narrador", text: "Cena." }],
      scenas: [{
        id: "scene-vn",
        name: "Visual Novel",
        runtime: { config: { dialogueKey: "scene_line" } }
      }]
    });

    expect(presentation.dialogues[0]).toMatchObject({
      referencedByEvents: ["Cena: Visual Novel"],
      usages: [{
        command: "show_dialogue scene_line",
        eventID: "scene-vn",
        eventName: "Cena: Visual Novel",
        stepIndex: null,
        verb: "scene_dialogue"
      }]
    });
    expect(deriveDialoguesWorkspaceValidationIssues(presentation)).not.toContainEqual(
      expect.objectContaining({ dialogueKey: "scene_line", kind: "unused" })
    );
  });

  it("counts dialogue keys referenced by cutscene runtime steps", () => {
    const presentation = deriveDialoguesWorkspacePresentation({
      dialogues: [{ key: "cutscene_line", character: "Lia", text: "A lente ainda responde." }],
      scenas: [{
        id: "scene-cutscene",
        name: "Prólogo",
        runtime: {
          type: "cutscene",
          config: {
            steps: [{
              id: "cutscene-step-1",
              dialogueKey: "cutscene_line",
              durationFrames: 120
            }]
          }
        }
      }]
    });

    expect(presentation.dialogues[0]).toMatchObject({
      referencedByEvents: ["Cena: Prólogo · passo 1"],
      usages: [{
        command: "show_dialogue cutscene_line",
        eventID: "scene-cutscene",
        eventName: "Cena: Prólogo · passo 1",
        stepIndex: 0,
        verb: "scene_dialogue"
      }]
    });
    expect(deriveDialoguesWorkspaceValidationIssues(presentation)).not.toContainEqual(
      expect.objectContaining({ dialogueKey: "cutscene_line", kind: "unused" })
    );
  });

  it("derives dialogue editor data, references and right-side panels from project data", () => {
    const presentation = deriveDialoguesWorkspacePresentation(projectData);

    expect(presentation.summary).toEqual({
      dialogueCount: 2,
      characterCount: 2,
      choiceCount: 4,
      referencedDialogueCount: 2,
      missingPortraitCount: 1,
      translationCompletion: "50%"
    });
    expect(presentation.characters).toEqual([
      { name: "Ana", dialogueCount: 1 },
      { name: "Mercador", dialogueCount: 1 }
    ]);
    expect(presentation.dialogues[0]).toMatchObject({
      key: "intro_001",
      character: "Ana",
      emote: "Smile.png",
      textSound: "text_blip.wav",
      confirmSound: "confirm.wav",
      textLength: 14,
      translation: "Hello, traveler!",
      translationLanguageCode: "en",
      choices: [
        { id: "choice-1", label: "Vamos explorar", translation: "Let's explore" },
        { id: "choice-2", label: "Abrir inventario", translation: "Open inventory" }
      ],
      referencedByEvents: ["room_boot"],
      usages: [
        {
          command: "show_dialogue intro_001",
          eventID: "evt-1",
          eventName: "room_boot",
          stepIndex: null,
          verb: "show_dialogue"
        }
      ],
      warnings: []
    });
    expect(presentation.dialogues[1].referencedByEvents).toEqual(["npc_shop_event"]);
    expect(presentation.dialogues[1].usages).toEqual([
      {
        command: "show_choice npc_shop",
        eventID: "evt-2",
        eventName: "npc_shop_event",
        stepIndex: 0,
        verb: "show_choice"
      },
      {
        choiceIndex: 1,
        command: "choice_event npc_shop 1 shop_exit",
        eventID: "evt-2",
        eventName: "npc_shop_event",
        stepIndex: 1,
        targetEventName: "shop_exit",
        verb: "choice_event"
      }
    ]);
    expect(presentation.dialogues[1].warnings).toEqual([
      "Retrato nao encontrado",
      "Emote nao encontrado",
      "Som de texto nao encontrado",
      "Som de confirmar nao encontrado"
    ]);
    expect(presentation.fontPanel).toEqual({
      font: "GBA padrao",
      status: "GBA OK",
      textSpeed: "Normal"
    });
    expect(presentation.boxPanel).toEqual({
      selectorImage: "selector.png",
      boxImage: "dialogue_box.png",
      boxPosition: "Inferior",
      boxSize: "224 x 48"
    });
    expect(presentation.chromePanel).toEqual({
      showPortrait: true,
      portraitPosition: "Esquerda",
      portraitLayout: "inline",
      showCharacterName: true,
      nameLabelMode: "inline"
    });
    expect(presentation.interfacePanel.characterSound).toBe("text_blip.wav");
    expect(presentation.preview).toEqual({
      speaker: "Ana",
      portrait: "ana_portrait.png",
      portraitSlot: "",
      emote: "Smile.png",
      text: "Ola, viajante!",
      choices: ["Vamos explorar", "Abrir inventario"]
    });
  });

  it("filters dialogues and derives rail filter chips with counts", () => {
    const presentation = deriveDialoguesWorkspacePresentation({
      assets: [{ name: "ana_portrait.png", kind: "Portrait" }],
      dialogues: [
        {
          key: "intro_001",
          character: "Ana",
          portrait: "ana_portrait.png",
          text: "Ola, viajante!",
          choices: ["Vamos explorar", "Abrir inventario"]
        },
        {
          key: "npc_shop",
          character: "Mercador",
          portrait: "shopkeeper.png",
          text: "Tenho itens raros.",
          choices: ["Comprar", "Sair"]
        },
        {
          key: "ending",
          character: "Ana",
          text: "Ate a proxima.",
          choices: []
        }
      ],
      events: [
        { name: "room_boot", command: "show_dialogue intro_001" },
        { name: "npc_shop_event", command: "show_choice npc_shop" }
      ]
    } satisfies GBAProjectData);

    expect(filterDialoguesWorkspaceDialogues(presentation.dialogues, { query: "mercador" }).map((dialogue) => dialogue.key)).toEqual(["npc_shop"]);
    expect(filterDialoguesWorkspaceDialogues(presentation.dialogues, { status: "used" }).map((dialogue) => dialogue.key)).toEqual(["intro_001", "npc_shop"]);
    expect(filterDialoguesWorkspaceDialogues(presentation.dialogues, { status: "unused" }).map((dialogue) => dialogue.key)).toEqual(["ending"]);
    expect(filterDialoguesWorkspaceDialogues(presentation.dialogues, { status: "warning" }).map((dialogue) => dialogue.key)).toEqual(["npc_shop"]);
    expect(filterDialoguesWorkspaceDialogues(presentation.dialogues, { status: "choices" }).map((dialogue) => dialogue.key)).toEqual(["intro_001", "npc_shop"]);
    expect(filterDialoguesWorkspaceDialogues(presentation.dialogues, { character: "Ana" }).map((dialogue) => dialogue.key)).toEqual(["intro_001", "ending"]);
    expect(filterDialoguesWorkspaceDialogues(presentation.dialogues, { character: "Mercador", status: "choices" }).map((dialogue) => dialogue.key)).toEqual(["npc_shop"]);
    expect(filterDialoguesWorkspaceDialogues(presentation.dialogues, { character: "Ana", status: "unused" }).map((dialogue) => dialogue.key)).toEqual(["ending"]);

    expect(deriveDialoguesWorkspaceFilterChips(presentation, "warning")).toEqual([
      { id: "dialogue-status-all", label: "Todas", value: "all", count: 3, isActive: false },
      { id: "dialogue-status-used", label: "Usadas", value: "used", count: 2, isActive: false },
      { id: "dialogue-status-unused", label: "Sem uso", value: "unused", count: 1, isActive: false },
      { id: "dialogue-status-warning", label: "Avisos", value: "warning", count: 1, isActive: true },
      { id: "dialogue-status-choices", label: "Escolhas", value: "choices", count: 2, isActive: false }
    ]);
  });

  it("derives reusable character profiles from the most common dialogue defaults", () => {
    const presentation = deriveDialoguesWorkspacePresentation({
      dialogues: [
        { key: "a", character: "Ana", portrait: "ana.png", emote: "smile.png", textSound: "ana.wav", confirmSound: "ok.wav", text: "A" },
        { key: "b", character: "Ana", portrait: "ana.png", emote: "smile.png", textSound: "ana.wav", confirmSound: "ok.wav", text: "B" },
        { key: "c", character: "Ana", portrait: "alt.png", emote: "sad.png", textSound: "alt.wav", text: "C" },
        { key: "d", character: "Narrador", text: "D" }
      ]
    });

    expect(deriveDialogueCharacterProfiles(presentation.dialogues)).toEqual([
      { name: "Ana", dialogueCount: 3, portrait: "ana.png", emote: "smile.png", textSound: "ana.wav", confirmSound: "ok.wav" },
      { name: "Narrador", dialogueCount: 1, portrait: "", emote: "", textSound: "", confirmSound: "" }
    ]);
  });

  it("derives the character sound from an available dialogue reference instead of a stale default", () => {
    const data = {
      assets: [
        { name: "farol_sfx_texto", kind: "SFX" },
        { name: "farol_sfx_dialogo", kind: "SFX" }
      ],
      dialogues: [
        { key: "intro", character: "Nara", textSound: "farol_sfx_texto", text: "Olá." },
        { key: "reply", character: "Nara", textSound: "farol_sfx_texto", text: "Vamos." }
      ],
      settings: { uiDialogs: {} }
    } satisfies GBAProjectData;

    expect(deriveDialogueCharacterSound(data)).toBe("farol_sfx_texto");
    expect(deriveDialoguesWorkspacePresentation(data).interfacePanel.characterSound).toBe("farol_sfx_texto");

    const explicitMissing = deriveDialogueCharacterSound({
      ...data,
      settings: { uiDialogs: { characterSound: "text_blip" } }
    });
    expect(explicitMissing).toBe("text_blip");
  });

  it("updates, creates and removes dialogues while preserving unrelated project data", () => {
    const updated = updateDialogueInProject(projectData, "intro_001", {
      actorId: "actor-lia",
      character: "Lia",
      portrait: "lia_portrait.png",
      emote: "Question.png",
      textSound: "text_alt.wav",
      confirmSound: "confirm_alt.wav",
      text: "Vamos testar a cena inicial?",
      translation: "Shall we test the first scene?",
      translationLanguageCode: "en",
      choiceTranslations: ["Yes", "Later"],
      choices: ["Sim", "Depois"]
    });

    expect(updated).not.toBe(projectData);
    expect(updated.assets).toEqual(projectData.assets);
    expect(Array.isArray(updated.dialogues)).toBe(true);
    const updatedDialogues = updated.dialogues as Array<Record<string, unknown>>;
    expect(updatedDialogues[0]).toMatchObject({
      key: "intro_001",
      actorId: "actor-lia",
      character: "Lia",
      portrait: "lia_portrait.png",
      emote: "Question.png",
      textSound: "text_alt.wav",
      confirmSound: "confirm_alt.wav",
      text: "Vamos testar a cena inicial?",
      translations: { en: "Shall we test the first scene?" },
      choiceTranslations: { en: ["Yes", "Later"] },
      choices: ["Sim", "Depois"]
    });

    const unbound = updateDialogueInProject(updated, "intro_001", { actorId: "" });
    const unboundDialogues = unbound.dialogues as Array<Record<string, unknown>>;
    expect(unboundDialogues[0]).not.toHaveProperty("actorId");

    const created = createDialogueInProject(updated, {
      key: "ending",
      character: "Ana",
      text: "Ate a proxima.",
      choices: ["OK"]
    });
    expect(Array.isArray(created.dialogues)).toBe(true);
    const createdDialogues = created.dialogues as Array<Record<string, unknown>>;
    expect(createdDialogues).toHaveLength(3);
    expect(createdDialogues[2]).toMatchObject({
      key: "ending",
      character: "Ana",
      text: "Ate a proxima.",
      choices: ["OK"]
    });

    const removed = removeDialogueFromProject(created, "npc_shop");
    expect(Array.isArray(removed.dialogues)).toBe(true);
    const removedDialogues = removed.dialogues as Array<Record<string, unknown>>;
    expect(removedDialogues.map((dialogue) => dialogue.key)).toEqual(["intro_001", "ending"]);
  });

  it("updates dialogue UI settings while preserving dialogue content and unrelated settings", () => {
    const updated = updateDialoguesUiInProject(projectData, {
      font: "GBA compacta",
      textSpeed: "Rapida",
      characterSound: "text_blip.wav",
      boxImage: "ui/frame_dialogue.png",
      selectorImage: "ui/selector_arrow.png",
      boxWidth: 240,
      boxHeight: 56,
      boxPosition: "Superior",
      fontColor: "#F8E7B5",
      showPortrait: false,
      portraitPosition: "Direita",
      portraitLayout: "fixed_slots",
      showCharacterName: false,
      nameLabelMode: "inline",
      choiceStyle: "Janela",
      autoAdvance: true,
      advanceButton: "A",
      cancelButton: "B",
      startMenuTitle: "Vértice",
      startMenuShowInventory: true,
      startMenuShowMap: true
    });

    expect(updated).not.toBe(projectData);
    expect(updated.dialogues).toEqual(projectData.dialogues);
    expect(updated.settings).toMatchObject({
      uiDialogs: {
        font: "GBA compacta",
        textSpeed: "Rapida",
        characterSound: "text_blip.wav",
        selectorImage: "ui/selector_arrow.png",
        boxImage: "ui/frame_dialogue.png",
        boxPosition: "Superior",
        boxWidth: 240,
        boxHeight: 56,
        fontColor: "#F8E7B5",
        showPortrait: false,
        portraitPosition: "Direita",
        portraitLayout: "fixed_slots",
        showCharacterName: false,
        nameLabelMode: "inline",
        choiceStyle: "Janela",
        autoAdvance: true,
        advanceButton: "A",
        cancelButton: "B",
        startMenuTitle: "Vértice",
        startMenuShowInventory: true,
        startMenuShowMap: true
      }
    });
  });

  it("duplicates a dialogue into a unique key while preserving the original", () => {
    const duplicated = duplicateDialogueInProject(projectData, {
      sourceKey: "intro_001",
      newKey: "intro_001_copy"
    });

    expect(duplicated).not.toBe(projectData);
    expect(duplicated.assets).toEqual(projectData.assets);
    expect(Array.isArray(duplicated.dialogues)).toBe(true);
    const duplicatedDialogues = duplicated.dialogues as Array<Record<string, unknown>>;
    expect(duplicatedDialogues).toHaveLength(3);
    expect(duplicatedDialogues[0]).toMatchObject({
      key: "intro_001",
      character: "Ana",
      text: "Ola, viajante!",
      choices: ["Vamos explorar", "Abrir inventario"]
    });
    expect(duplicatedDialogues[2]).toMatchObject({
      key: "intro_001_copy",
      character: "Ana",
      portrait: "ana_portrait.png",
      emote: "Smile.png",
      textSound: "text_blip.wav",
      confirmSound: "confirm.wav",
      text: "Ola, viajante!",
      choices: ["Vamos explorar", "Abrir inventario"]
    });

    const duplicateKey = duplicateDialogueInProject(projectData, {
      sourceKey: "intro_001",
      newKey: "npc_shop"
    });

    expect(duplicateKey).toBe(projectData);
  });

  it("normalizes dialogue text and choices while preserving unrelated fields", () => {
    const messyProject = {
      ...projectData,
      dialogues: [
        {
          key: "intro_001",
          character: "Ana",
          portrait: "ana_portrait.png",
          text: "  Ola,   viajante!  \n\n  Vamos    testar   a cena inicial? ",
          choices: ["  Sim   agora  ", "", "  Depois   talvez  "],
          translations: { en: "Hello, traveler!" }
        }
      ]
    } satisfies GBAProjectData;

    const normalized = normalizeDialogueInProject(messyProject, "intro_001");

    expect(normalized).not.toBe(messyProject);
    expect(normalized.assets).toEqual(projectData.assets);
    expect(Array.isArray(normalized.dialogues)).toBe(true);
    const normalizedDialogues = normalized.dialogues as Array<Record<string, unknown>>;
    expect(normalizedDialogues[0]).toMatchObject({
      key: "intro_001",
      character: "Ana",
      portrait: "ana_portrait.png",
      text: "Ola, viajante!\nVamos testar a cena inicial?",
      choices: ["Sim agora", "Depois talvez"],
      translations: { en: "Hello, traveler!" }
    });

    expect(normalizeDialogueInProject(normalized, "intro_001")).toBe(normalized);
  });

  it("prepares a stable selected-dialogue export file", () => {
    const prepared = prepareDialogueExport(projectData, "intro_001");

    expect(prepared).toEqual({
      fileName: "intro_001.dialogue.json",
      contents: JSON.stringify(
        {
          kind: "gbastudio.dialogue",
          version: 1,
          dialogue: {
            key: "intro_001",
            character: "Ana",
            portrait: "ana_portrait.png",
            portraitSlot: "",
            emote: "Smile.png",
            textSound: "text_blip.wav",
            confirmSound: "confirm.wav",
      text: "Ola, viajante!",
      translation: "Hello, traveler!",
      translationLanguageCode: "en",
      choiceTranslations: ["Let's explore", "Open inventory"],
      choices: ["Vamos explorar", "Abrir inventario"],
      referencedByEvents: ["room_boot"]
          }
        },
        null,
        2
      )
    });

    expect(prepareDialogueExport(projectData, "missing")).toBeNull();
  });

  it("connects a dialogue to the start room event without duplicating commands", () => {
    const project = {
      scenas: [
        {
          id: "room-1",
          name: "room_1",
          eventBindings: {}
        }
      ],
      dialogues: [
        {
          key: "intro",
          character: "Ana",
          portrait: "",
          text: "Bem-vindo.",
          choices: []
        }
      ],
      events: []
    } satisfies GBAProjectData;

    const connected = connectDialogueToStartEventInProject(project, "intro");
    const connectedRooms = connected.scenas as Array<Record<string, unknown>>;
    const connectedEvents = connected.events as Array<Record<string, unknown>>;

    expect(connected).not.toBe(project);
    expect(connectedRooms[0]).toMatchObject({
      eventBindings: { onInit: "room_1_intro_dialogue" }
    });
    expect(connectedEvents).toEqual([
      expect.objectContaining({
        name: "room_1_intro_dialogue",
        category: "Dialogo",
        steps: [expect.objectContaining({ command: "show_dialogue intro" })]
      })
    ]);

    const repeated = connectDialogueToStartEventInProject(connected, "intro");
    expect(repeated).toBe(connected);
  });

  it("adds a choice command to an existing start event when the dialogue has choices", () => {
    const project = {
      settings: { general: { startScene: "room_1" } },
      scenas: [
        {
          id: "room-1",
          name: "room_1",
          eventBindings: { onInit: "room_boot" }
        }
      ],
      dialogues: [
        {
          key: "intro",
          character: "Ana",
          portrait: "",
          text: "Escolha uma rota.",
          choices: ["Sim", "Nao"]
        }
      ],
      events: [
        {
          id: "event-room-boot",
          name: "room_boot",
          category: "Cena",
          steps: [{ command: "play_music theme.mod" }]
        }
      ]
    } satisfies GBAProjectData;

    const connected = connectDialogueToStartEventInProject(project, "intro");
    const connectedEvents = connected.events as Array<Record<string, unknown>>;
    expect(connectedEvents[0]).toMatchObject({
      steps: [
        { command: "play_music theme.mod" },
        expect.objectContaining({ command: "show_choice intro" })
      ]
    });
  });

  it("warns about unsupported glyphs in source, translations and choices", () => {
    const presentation = deriveDialoguesWorkspacePresentation(projectData);
    const dialogue = presentation.dialogues[0];
    dialogue.text = "Olá 🙂";
    dialogue.translations.es = "¡Sí! ★";
    dialogue.choices[0].label = "🧭";
    dialogue.choices[0].translations.es = "🧭";
    const issues = deriveDialoguesWorkspaceValidationIssues(presentation).filter(issue => issue.id.startsWith("font-"));
    expect(issues).toHaveLength(4);
    expect(new Set(issues.map(issue => issue.id)).size).toBe(4);
    expect(issues.every(issue => issue.severity === "warning" && issue.message.includes("?"))).toBe(true);
  });

  it("derives editor context, validation issues and export summary for dialogues", () => {
    const presentation = deriveDialoguesWorkspacePresentation(projectData);
    const dialogue = presentation.dialogues[0];

    expect(deriveDialoguesEditorContext(dialogue)).toMatchObject({
      dialogueKey: "intro_001",
      character: "Ana",
      choiceCount: 2,
      usageCount: 1,
      translationLabel: "Traduzido",
      runtimeCommand: "show_choice intro_001"
    });

    const issues = deriveDialoguesWorkspaceValidationIssues(presentation);
    expect(issues.some((issue) => issue.dialogueKey === "npc_shop" && issue.severity === "error")).toBe(true);
    expect(issues.some((issue) => issue.id === "unused-ending")).toBe(false);

    expect(deriveDialogueExportSummary(dialogue)).toMatchObject({
      fileName: "intro_001.dialogue.json",
      character: "Ana",
      runtimeCommand: "show_choice intro_001",
      ready: true
    });
  });

  it("resolves only the dialogues reachable from a selected scene", () => {
    const project = {
      scenas: [{
        id: "scene-harbor",
        name: "harbor",
        eventBindings: { onInit: "harbor_init" },
        runtime: {
          type: "cutscene",
          config: {
            dialogueKey: "scene_intro",
            steps: [{ dialogueKey: "scene_step" }]
          }
        }
      }, {
        id: "scene-other",
        name: "other",
        eventBindings: { onInit: "other_init" }
      }],
      actors: [{
        id: "actor-guide",
        name: "Guia",
        roomName: "harbor",
        eventBindings: { onInteract: "guide_talk" }
      }],
      triggers: [{
        id: "trigger-gate",
        name: "Portão",
        roomName: "harbor",
        eventName: "gate_talk"
      }],
      dialogues: [
        { key: "scene_intro", character: "Narrador", text: "Entrada." },
        { key: "scene_step", character: "Narrador", text: "Passo." },
        { key: "harbor_event_line", character: "Narrador", text: "Evento." },
        { key: "guide_line", actorId: "actor-guide", character: "Guia", text: "Olá." },
        { key: "nested_line", character: "Guia", text: "Detalhe." },
        { key: "gate_line", character: "Guarda", text: "Pare." },
        { key: "other_line", character: "Outro", text: "Fora da cena." }
      ],
      events: [
        {
          id: "event-harbor-init",
          name: "harbor_init",
          roomName: "harbor",
          steps: [{ command: "show_dialogue harbor_event_line" }]
        },
        {
          id: "event-guide",
          name: "guide_talk",
          roomName: "harbor",
          steps: [{ command: "show_dialogue guide_line" }, { command: "call_event guide_nested" }]
        },
        {
          id: "event-guide-nested",
          name: "guide_nested",
          roomName: "harbor",
          steps: [{ command: "show_dialogue nested_line" }]
        },
        {
          id: "event-gate",
          name: "gate_talk",
          roomName: "harbor",
          steps: [{ command: "show_dialogue gate_line" }]
        },
        {
          id: "event-other",
          name: "other_init",
          roomName: "other",
          steps: [{ command: "show_dialogue other_line" }]
        }
      ]
    } satisfies GBAProjectData;

    const resolved = deriveDialoguesForScene(project, { id: "scene-harbor", name: "harbor" });

    expect(resolved.sceneName).toBe("harbor");
    expect(resolved.actors).toEqual([{ id: "actor-guide", name: "Guia", roomName: "harbor" }]);
    expect(resolved.dialogues.map((dialogue) => dialogue.key)).toEqual([
      "scene_intro",
      "scene_step",
      "harbor_event_line",
      "guide_line",
      "nested_line",
      "gate_line"
    ]);
    expect(resolved.dialogues.find((dialogue) => dialogue.key === "guide_line")?.sceneUsages).toEqual([
      expect.objectContaining({ sourceKind: "actor", sourceName: "Guia", viaEventName: "guide_talk" })
    ]);
    expect(resolved.dialogues.find((dialogue) => dialogue.key === "nested_line")?.sceneUsages).toEqual([
      expect.objectContaining({ sourceKind: "actor", sourceName: "Guia", viaEventName: "guide_nested" })
    ]);
    expect(resolved.dialogues.find((dialogue) => dialogue.key === "guide_line")).toEqual(expect.objectContaining({
      actorId: "actor-guide",
      actorName: "Guia",
      actorBindingStatus: "resolved"
    }));
    expect(resolved.dialogues.some((dialogue) => dialogue.key === "other_line")).toBe(false);
  });

  it("sinaliza binding de ator ausente sem quebrar o diálogo", () => {
    const resolved = deriveDialoguesForScene({
      scenas: [{ id: "scene-actors", name: "actors", eventBindings: { onInit: "actors_init" } }],
      actors: [{ id: "actor-guide", name: "Guia", roomName: "actors" }],
      dialogues: [{ key: "missing_actor_line", actorId: "actor-removed", character: "Guia", text: "Olá." }],
      events: [{ id: "event-actors", name: "actors_init", steps: [{ command: "show_dialogue missing_actor_line" }] }]
    }, { id: "scene-actors", name: "actors" });

    expect(resolved.dialogues[0]).toEqual(expect.objectContaining({
      actorId: "actor-removed",
      actorName: "",
      actorBindingStatus: "missing",
      warnings: expect.arrayContaining(["Ator vinculado não encontrado: actor-removed"])
    }));
  });

  it("preserva referencias de dialogo ausentes para o inspector sinalizar", () => {
    const resolved = deriveDialoguesForScene({
      scenas: [{
        id: "scene-missing",
        name: "missing",
        runtime: { config: { dialogueKey: "missing_dialogue" } }
      }],
      dialogues: []
    }, { id: "scene-missing", name: "missing" });

    expect(resolved.dialogues).toEqual([]);
    expect(resolved.missing).toEqual([
      expect.objectContaining({ key: "missing_dialogue" })
    ]);
  });

  it("validates only missing translations from the three enabled project languages", () => {
    const complete = deriveDialoguesWorkspacePresentation({
      localization: {
        sourceLocale: "en",
        defaultLocale: "pt-BR",
        enabledLocales: ["pt-BR", "en", "es"]
      },
      dialogues: [{
        key: "localized",
        text: "Continue",
        translations: { "pt-BR": "Continuar", es: "Continuar" },
        choices: ["New Game"],
        choiceTranslations: { "pt-BR": ["Novo jogo"], es: ["Nueva partida"] }
      }],
      events: [{ id: "start", name: "start", command: "show_choice localized" }]
    });

    expect(deriveDialoguesWorkspaceValidationIssues(complete)).toEqual([
      expect.objectContaining({ id: "dialogues-ok", severity: "info" })
    ]);
    expect(complete.summary.translationCompletion).toBe("100%");

    const missingSpanish = deriveDialoguesWorkspacePresentation({
      localization: {
        sourceLocale: "en",
        defaultLocale: "pt-BR",
        enabledLocales: ["pt-BR", "en", "es"]
      },
      dialogues: [{
        key: "localized",
        text: "Continue",
        translations: { "pt-BR": "Continuar" },
        choices: ["New Game"],
        choiceTranslations: { "pt-BR": ["Novo jogo"] }
      }],
      events: [{ id: "start", name: "start", command: "show_choice localized" }]
    });

    expect(deriveDialoguesWorkspaceValidationIssues(missingSpanish)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "translation-localized-es" }),
      expect.objectContaining({ id: "choice-translation-localized-es-0" })
    ]));
  });

  it("keeps subsequent translation edits in the previously selected project locale", () => {
    const data = {
      localization: { sourceLocale: "en", defaultLocale: "pt-BR", enabledLocales: ["pt-BR", "en", "es"] },
      dialogues: [{ key: "intro", text: "Original", translations: { "pt-BR": "Português" }, choices: ["Go"] }]
    };
    const selected = updateDialogueInProject(data, "intro", { translationLanguageCode: "es" });
    const updated = updateDialogueInProject(selected, "intro", { translation: "Español", choiceTranslations: ["Ir"], translationStatus: "approved" });
    expect(updated.dialogues).toEqual([expect.objectContaining({ text: "Original", translations: { "pt-BR": "Português", es: "Español" }, choiceTranslations: { es: ["Ir"] }, translationStatus: { es: "approved" } })]);
  });

  it("writes the selected locale into multilingual translation maps", () => {
    const updated = updateDialogueInProject({
      localization: {
        sourceLocale: "en",
        defaultLocale: "pt-BR",
        enabledLocales: ["pt-BR", "en", "es"]
      },
      dialogues: [{
        key: "welcome",
        text: "Welcome",
        translations: { "pt-BR": "Bem-vindo" },
        choices: ["Continue"],
        choiceTranslations: { "pt-BR": ["Continuar"] }
      }]
    }, "welcome", {
      translationLanguageCode: "es",
      translation: "Bienvenido",
      translationStatus: "draft-ai",
      choiceTranslations: ["Continuar"]
    });

    expect(updated.dialogues).toEqual([expect.objectContaining({
      translations: { "pt-BR": "Bem-vindo", es: "Bienvenido" },
      choiceTranslations: { "pt-BR": ["Continuar"], es: ["Continuar"] },
      translationStatus: { es: "draft-ai" }
    })]);
  });
});
