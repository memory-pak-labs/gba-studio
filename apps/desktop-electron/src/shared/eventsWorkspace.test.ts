import { describe, expect, it } from "vitest";
import {
  bindEventToTargetInProject,
  boundEventNameForTarget,
  connectEventGraphNodesInProject,
  createBoundEventForTargetInProject,
  createBoundEventsForTargetsInProject,
  createEventInProject,
  createEventWithGraphPositionInProject,
  deriveContextBindingSlotStates,
  deriveEventsWorkspacePresentation,
  deriveEventsWorkspaceValidationIssues,
  describeEventFlow,
  duplicateEventInProject,
  filterEventsCommandSuggestions,
  filterEventsWorkspaceGraphByScene,
  filterEventsWorkspaceGroups,
  menuStateForEventsCommandCategory,
  addEventStepInProject,
  prepareEventExport,
  removeEventFromProject,
  removeEventGraphEdgeInProject,
  removeEventTargetBindingInProject,
  removeEventStepInProject,
  retargetEventGraphEdgeInProject,
  suggestBoundEventName,
  relayoutEventsGraphInProject,
  rankEventsCommandSuggestionsForContext,
  renameEventInProject,
  updateEventGraphNodePositionInProject,
  updateEventFieldsInProject,
  updateEventStepInProject,
  insertEventStepsInProject,
  setEventUpdateFrequencyInProject
} from "./eventsWorkspace.js";
import type { EventsWorkspaceGraphNode } from "./eventsWorkspace/core.js";
import { estimateContextNodeHeight, graphNodeToRect, rectsOverlap } from "./eventsWorkspace/graphLayout.js";
import { createBlankProjectData } from "./newProject.js";
import type { GBAProjectData } from "./projectFile.js";

type EventTestProject = { events?: Array<Record<string, unknown>> };

function graphNodesOverlap(nodes: Array<Pick<EventsWorkspaceGraphNode, "x" | "y" | "nodeKind" | "contextBindingSlots">>): boolean {
  for (let index = 0; index < nodes.length; index += 1) {
    for (let other = index + 1; other < nodes.length; other += 1) {
      if (rectsOverlap(graphNodeToRect(nodes[index]!), graphNodeToRect(nodes[other]!))) {
        return true;
      }
    }
  }
  return false;
}

describe("Events workspace presentation", () => {
  it("creates independent event copies when a behavior is applied to an actor group", () => {
    const result = createBoundEventsForTargetsInProject({
      actors: [{ name: "Guide" }, { name: "Merchant" }],
      events: []
    }, {
      category: "Ator",
      eventIDs: ["event-guide", "event-merchant"],
      initialCommands: ["show_dialogue intro"],
      targets: [
        { targetKind: "actor", targetName: "Guide", bindingKey: "onInteract" },
        { targetKind: "actor", targetName: "Merchant", bindingKey: "onInteract" }
      ]
    });

    expect(result?.eventNames).toEqual(["guide_oninteract", "merchant_oninteract"]);
    expect(result?.data.actors).toEqual([
      { name: "Guide", eventBindings: { onInteract: "guide_oninteract" } },
      { name: "Merchant", eventBindings: { onInteract: "merchant_oninteract" } }
    ]);
    expect(result?.data.events).toEqual([
      expect.objectContaining({ id: "event-guide", name: "guide_oninteract", steps: [{ command: "show_dialogue intro", isEnabled: true }] }),
      expect.objectContaining({ id: "event-merchant", name: "merchant_oninteract", steps: [{ command: "show_dialogue intro", isEnabled: true }] })
    ]);
  });

  it("persists structured branch insertion and explicit update frequency", () => {
    const project = {
      events: [{
        id: "event-logic",
        name: "logic",
        category: "Controle",
        steps: [
          { command: "if_variable score 1", isEnabled: true },
          { command: "set_variable yes 1", isEnabled: true },
          { command: "condition_end", isEnabled: true }
        ]
      }]
    };

    const withElse = insertEventStepsInProject(project, "event-logic", {
      kind: "falseBranch",
      conditionIndex: 0
    }, ["set_variable no 1"]);
    expect((withElse.events as Array<{ steps?: unknown }> | undefined)?.[0]?.steps).toEqual([
      { command: "if_variable score 1", isEnabled: true },
      { command: "set_variable yes 1", isEnabled: true },
      { command: "else", isEnabled: true },
      { command: "set_variable no 1", isEnabled: true },
      { command: "condition_end", isEnabled: true }
    ]);

    const withFrequency = setEventUpdateFrequencyInProject(withElse, "event-logic", 30, 2);
    expect(((withFrequency.events as Array<{ steps?: Array<{ command: string }> }> | undefined)?.[0]?.steps ?? []).map((step) => step.command)).toEqual([
      "rate_limit 30 2",
      "if_variable score 1",
      "set_variable yes 1",
      "else",
      "set_variable no 1",
      "condition_end",
      "rate_limit_end"
    ]);
  });

  it("derives actor states from runtime capabilities and keeps the legacy event on interaction", () => {
    const slots = deriveContextBindingSlotStates(
      { eventName: "guide_talk", eventBindings: { onInit: "guide_spawn", onUpdate: "guide_tick" } },
      "actor",
      new Set(["guide_talk", "guide_spawn", "guide_tick"]),
      { sceneType: "topdown" }
    );

    expect(slots).toMatchObject([
      { bindingKey: "onInit", eventName: "guide_spawn" },
      { bindingKey: "onInteract", eventName: "guide_talk" },
      { bindingKey: "onUpdate", eventName: "guide_tick", requiresFrequency: true }
    ]);
  });

  it("derives actor lifecycle in every scene, including menu visual actors", () => {
    const battleSlots = deriveContextBindingSlotStates(
      { eventBindings: { onInit: "battle_spawn", onUpdate: "battle_tick" } },
      "actor",
      new Set(["battle_spawn", "battle_tick"]),
      { sceneType: "battleRpg" }
    );
    expect(battleSlots).toMatchObject([
      { bindingKey: "onInit", eventName: "battle_spawn" },
      { bindingKey: "onInteract", eventName: null },
      { bindingKey: "onUpdate", eventName: "battle_tick", requiresFrequency: true }
    ]);

    const menuSlots = deriveContextBindingSlotStates(
      {
        eventBindings: { onInit: "menu_actor_init", onUpdate: "menu_actor_tick" },
        menuActorRole: "option",
        menuItemID: "slot-1"
      },
      "actor",
      new Set(["menu_actor_init", "menu_actor_tick"]),
      { sceneType: "menu", runtimeType: "menu" }
    );
    expect(menuSlots).toMatchObject([
      { bindingKey: "onInit", eventName: "menu_actor_init" },
      { bindingKey: "onInteract", eventName: null },
      { bindingKey: "onUpdate", eventName: "menu_actor_tick", requiresFrequency: true }
    ]);
  });

  it("keeps the legacy trigger event on entering", () => {
    const slots = deriveContextBindingSlotStates(
      { eventName: "door_enter" },
      "trigger",
      new Set(["door_enter"])
    );

    expect(slots).toMatchObject([
      { bindingKey: "onEnter", eventName: "door_enter" },
      { bindingKey: "onLeave", eventName: null }
    ]);
  });

  it("keeps the normal native command palette limited to commands accepted by the ROM exporter", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "start" }],
      events: [{ id: "event-start", name: "start", category: "Cena", command: "noop" }]
    });
    const nativeSuggestions = presentation.commandPalette.filter((suggestion) => suggestion.id.startsWith("command:"));
    const nativeVerbs = nativeSuggestions.map((suggestion) => suggestion.command.split(/\s+/)[0]);

    expect(nativeVerbs).toContain("draw_text");
    expect(nativeVerbs).toContain("projectile_load_slot");
    expect(nativeSuggestions.every((suggestion) => (
      suggestion.runtimeStatus === "ok-rom" || suggestion.runtimeStatus === "preview-p0"
    ))).toBe(true);
  });

  it("derives the ROM-ready command palette from current project resources", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "overworld" }, { name: "shop" }],
      actors: [{ name: "Guide" }],
      dialogues: [{ key: "intro", choices: ["Sim", "Nao"] }],
      audioItems: [
        { name: "theme.mod", kind: "Musica" },
        { name: "confirm.wav", kind: "SFX" }
      ],
      events: [
        { id: "event-room", name: "room_boot", category: "Cena", command: "noop" },
        { id: "event-shop", name: "shop_open", category: "Ator", command: "noop" }
      ]
    });
    const commands = presentation.commandPalette.map((suggestion) => suggestion.command);
    const suggestionsByID = new Map(presentation.commandPalette.map((suggestion) => [suggestion.id, suggestion]));

    expect(new Set(presentation.commandPalette.map(item => item.id)).size).toBe(presentation.commandPalette.length);
    expect(presentation.commandPalette).toEqual(expect.arrayContaining([expect.objectContaining({ id: "command:scene.set_background" })]));
    expect(suggestionsByID.get("command:menu.slider")).toMatchObject({ command: "slider title_options", badge: "OK ROM" });
    expect(commands).toEqual(expect.arrayContaining([
      "show_dialogue intro",
      "show_choice intro",
      "play_music theme.mod",
      "play_sfx confirm.wav",
      "change_scene shop",
      "call_event room_boot",
      "move_actor Guide 1 0",
      "timer_attach 60 room_boot",
      "rumble_on",
      "rumble_on_for 60",
      "rumble_off",
      "multiplayer4_open 4",
      "multiplayer4_set 0",
      "multiplayer4_sync",
      "multiplayer4_close"
    ]));
    expect(suggestionsByID.get("command:dialogue.show")).toMatchObject({
      label: "Exibir diálogo",
      category: "Diálogo e menus",
      badge: "OK ROM",
      isFavorite: true
    });
    expect(suggestionsByID.get("command:scene.change")).toMatchObject({
      label: "Trocar cena",
      category: "Cena",
      badge: "OK ROM",
      isFavorite: true,
      isRecipe: false
    });
    expect(suggestionsByID.get("command:camera.follow_player")).toMatchObject({
      command: "camera_follow_player",
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:camera.move")).toMatchObject({
      command: "camera_move 16 0",
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:camera.bounds")).toMatchObject({
      command: "camera_set_bounds -120 -80 120 80",
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:camera.fade_in")).toMatchObject({
      command: "fade_in 30",
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:camera.fade_out")).toMatchObject({
      command: "fade_out 30",
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:screen.fade_in")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:actor.move")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:actor.set_position")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:actor.show")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:timer.wait")).toMatchObject({
      command: "wait 30",
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:save.save")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:save.load")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:actor.set_animation")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:actor.set_direction")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:camera.lock_player")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:camera.shake")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:hud.stat_bar")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:hud.hearts")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:hud.number")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:hud.stat_modify")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:scene.replace_tile")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:actor.wait_animation")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:save.if_saved")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:math.random_seed")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:misc.lock_script")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:screen.overlay_line")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:dialogue.text_speed")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("command:actor.animation_frame")).toMatchObject({
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(suggestionsByID.get("recipe:doorChangeScene")).toMatchObject({
      label: "Porta trocar de cena",
      command: "fade_out 20",
      badge: "Modelo de script",
      isRecipe: true
    });
    expect(suggestionsByID.get("recipe:dialogueChoiceBranch")?.steps?.map((step) => step.command)).toEqual([
      "show_choice intro",
      "choice_event intro 0 room_boot"
    ]);
    expect(suggestionsByID.get("recipe:battleEncounter")?.steps?.map((step) => step.command)).toEqual([
      "fade_out 15",
      "set_flag battle.active true",
      "change_scene shop 1 1",
      "fade_in 15"
    ]);
    expect(suggestionsByID.get("recipe:roomIntro")?.steps?.map((step) => step.command)).toEqual([
      "play_music theme.mod",
      "fade_in 20"
    ]);
    expect(filterEventsCommandSuggestions(presentation.commandPalette, { tab: "favorites", query: "" }).map((item) => item.command)).toEqual([
      "show_dialogue intro",
      "change_scene shop",
      "luta_start_match overworld", "luta_end_match player1"
    ]);
    expect(filterEventsCommandSuggestions(presentation.commandPalette, { tab: "recipes", query: "audio" }).map((item) => item.id)).toEqual([
      "recipe:triggerPlayMusic", "recipe:audioRoutinePattern"
    ]);
    expect(suggestionsByID.get("recipe:audioRoutinePattern")?.steps?.at(-1)?.command).toBe("run_audio_routine theme.mod");
  });

  it("ranks commands for the selected event context", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "overworld" }, { name: "shop" }],
      actors: [{ name: "Guide" }],
      dialogues: [{ key: "intro" }],
      audioItems: [{ name: "theme.mod", kind: "Musica" }],
      events: [{ id: "room", name: "room_boot", category: "Cena", command: "noop" }]
    });

    const ranked = rankEventsCommandSuggestionsForContext(presentation.commandPalette, {
      eventCategory: "Cena",
      bindingLabels: ["Cena overworld · Ao iniciar"]
    });

    expect(ranked.slice(0, 8).every((suggestion) => ["Cena", "Câmera", "Tela", "Audio", "Música e efeitos sonoros", "Cutscene FX"].includes(suggestion.category))).toBe(true);
    expect(ranked.findIndex((suggestion) => suggestion.id === "recipe:doorChangeScene"))
      .toBeLessThan(ranked.findIndex((suggestion) => suggestion.id === "command:inventory.add_item"));
  });

  it("describes the selected event flow in natural language", () => {
    const presentation = deriveEventsWorkspacePresentation({
      dialogues: [{ key: "intro" }],
      events: [{
        id: "intro-event",
        name: "intro",
        category: "Dialogo",
        steps: [
          { command: "show_dialogue intro", isEnabled: true },
          { command: "if_variable score 1", isEnabled: true },
          { command: "call_event reward", isEnabled: true }
        ]
      }, { id: "reward", name: "reward", category: "Controle", command: "noop" }]
    });
    const event = presentation.groups.flatMap((group) => group.events).find((item) => item.id === "intro-event")!;

    expect(describeEventFlow(event)).toBe(
      "Executa 3 passos: exibe o diálogo intro; verifica score; e quando a condição for verdadeira, chama o evento reward."
    );
  });

  it("derives command cards and editable parameters for the ROM-ready registry", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "overworld" }, { name: "shop" }],
      actors: [{ name: "Guide" }],
      dialogues: [{ key: "intro", choices: ["Sim", "Nao"] }],
      audioItems: [
        { name: "theme.mod", kind: "Musica" },
        { name: "confirm.wav", kind: "SFX" }
      ],
      variables: [{ name: "score" }],
      events: [
        {
          id: "event-room",
          name: "room_boot",
          category: "Cena",
          steps: [
            { command: "show_dialogue intro" },
            { command: "set_variable score 10" },
            { command: "draw_text Texto direto no jogo" }
          ]
        },
        { id: "event-shop", name: "shop_open", category: "Ator", command: "noop" }
      ]
    });
    const commandCards = presentation.commandPalette.filter((suggestion) => suggestion.id.startsWith("command:"));
    const dialogueCard = presentation.commandPalette.find((suggestion) => suggestion.id === "command:dialogue.show");
    const variableCard = presentation.commandPalette.find((suggestion) => suggestion.id === "command:variables.set_value");
    const roomEvent = presentation.groups.flatMap((group) => group.events).find((event) => event.id === "event-room");

    expect(commandCards).toHaveLength(presentation.commandPalette.filter(suggestion => suggestion.id.startsWith("command:")).length);
    expect(presentation.commandPalette.find((suggestion) => suggestion.id === "command:camera.property"))
      .toMatchObject({ command: "set_camera_property shake 0", badge: "OK ROM" });
    expect(presentation.commandPalette.find((suggestion) => suggestion.id === "command:data.lookup")).toMatchObject({
      command: "data_table_lookup table_id index target",
      badge: "OK ROM",
      runtimeStatus: "ok-rom"
    });
    expect(dialogueCard).toMatchObject({
      commandTemplate: "show_dialogue {dialogue}",
      runtimeStatus: "ok-rom",
      section: null,
      parameters: [
        {
          id: "dialogue",
          kind: "dialogue",
          label: "Diálogo",
          tokenIndex: 1,
          value: "intro",
          options: ["intro"],
          isKnownValue: true
        }
      ]
    });
    expect(variableCard).toMatchObject({
      commandTemplate: "set_variable {variable} 10",
      runtimeStatus: "ok-rom",
      parameters: [
        expect.objectContaining({
          id: "variable",
          kind: "variable",
          value: "score",
          options: ["score"],
          isKnownValue: true
        }),
        expect.objectContaining({
          id: "arg2",
          kind: "value",
          value: "10",
          options: []
        })
      ]
    });
    expect(roomEvent?.steps[0]).toMatchObject({
      commandTemplate: "show_dialogue {dialogue}",
      commandRuntimeStatus: "ok-rom",
      commandParameters: [
        expect.objectContaining({
          id: "dialogue",
          value: "intro",
          options: ["intro"],
          isKnownValue: true
        })
      ]
    });
    expect(roomEvent?.steps[1]).toMatchObject({
      commandTemplate: "set_variable {variable} 10",
      commandRuntimeStatus: "ok-rom",
      commandParameters: [
        expect.objectContaining({ id: "variable", value: "score", options: ["score"], isKnownValue: true }),
        expect.objectContaining({ id: "arg2", value: "10", kind: "value" })
      ]
    });
    expect(roomEvent?.steps[2].commandParameters.map((parameter) => parameter.value)).toEqual([
      "Texto",
      "direto",
      "no",
      "jogo"
    ]);
  });

  it("derives control-flow metadata for condition, dependent and choice steps", () => {
    const presentation = deriveEventsWorkspacePresentation({
      dialogues: [{ key: "intro", choices: ["Sim", "Nao"] }],
      variables: [{ name: "score" }],
      events: [
        {
          id: "event-branch",
          name: "branching",
          category: "Controle",
          steps: [
            { command: "if_variable score 10" },
            { command: "set_variable reward true" },
            { command: "if_flag story.progress true" },
            { command: "call_event story_event" },
            { command: "choice_event intro 1 leave_event" }
          ]
        },
        { id: "event-story", name: "story_event", category: "Controle", command: "noop" },
        { id: "event-leave", name: "leave_event", category: "Controle", command: "noop" }
      ]
    });
    const event = presentation.groups.flatMap((group) => group.events).find((item) => item.id === "event-branch");

    expect(event?.steps.map((step) => step.flow)).toEqual([
      {
        kind: "condition",
        label: "Condicao",
        detail: "Se if_variable score 10 for verdadeiro, executa o bloco ate \"else\"; senao pula para o ramo apos \"else\".",
        controlsNextStep: true,
        dependsOnStepIndex: null,
        targetEventName: null,
        choiceIndex: null,
        isBranchPoint: true
      },
      {
        kind: "condition-dependent",
        label: "Depende do passo 1",
        detail: "Executa somente quando if_variable score 10 for verdadeiro.",
        controlsNextStep: false,
        dependsOnStepIndex: 0,
        targetEventName: null,
        choiceIndex: null,
        isBranchPoint: false
      },
      {
        kind: "condition",
        label: "Condicao",
        detail: "Se if_flag story.progress true for verdadeiro, executa o bloco ate \"else\"; senao pula para o ramo apos \"else\".",
        controlsNextStep: true,
        dependsOnStepIndex: null,
        targetEventName: null,
        choiceIndex: null,
        isBranchPoint: true
      },
      {
        kind: "condition-dependent",
        label: "Depende do passo 3",
        detail: "Executa somente quando if_flag story.progress true for verdadeiro.",
        controlsNextStep: false,
        dependsOnStepIndex: 2,
        targetEventName: "story_event",
        choiceIndex: null,
        isBranchPoint: true
      },
      {
        kind: "choice",
        label: "Escolha 2",
        detail: "Quando intro escolher a opcao 2, chama leave_event.",
        controlsNextStep: false,
        dependsOnStepIndex: null,
        targetEventName: "leave_event",
        choiceIndex: 1,
        isBranchPoint: true
      }
    ]);
  });

  it("derives branch-aware graph edge metadata from event commands", () => {
    const presentation = deriveEventsWorkspacePresentation({
      dialogues: [{ key: "intro_choice", choices: ["Accept", "Leave"] }],
      events: [
        {
          id: "event-source",
          name: "source",
          category: "Controle",
          steps: [
            { command: "if_flag story.progress true" },
            { command: "call_event story_event" },
            { command: "choice_event intro_choice 1 leave_event" },
            { command: "call_event direct_event" }
          ]
        },
        { id: "event-story", name: "story_event", category: "Controle", command: "noop" },
        { id: "event-leave", name: "leave_event", category: "Controle", command: "noop" },
        { id: "event-direct", name: "direct_event", category: "Controle", command: "noop" }
      ]
    });

    expect(presentation.graphEdges).toEqual([
      expect.objectContaining({
        id: "event-source-story_event-call_event-1",
        flowKind: "condition-dependent",
        flowLabel: "Depende do passo 1",
        flowDetail: "Executa somente quando if_flag story.progress true for verdadeiro.",
        guardStepIndex: 0,
        guardCommand: "if_flag story.progress true",
        choiceIndex: null
      }),
      expect.objectContaining({
        id: "event-source-leave_event-choice_event-2",
        flowKind: "choice",
        flowLabel: "Escolha 2",
        flowDetail: "Quando intro_choice escolher a opcao 2, chama leave_event.",
        guardStepIndex: null,
        guardCommand: null,
        choiceIndex: 1
      }),
      expect.objectContaining({
        id: "event-source-direct_event-call_event-3",
        flowKind: "event-call",
        flowLabel: "Chama evento",
        flowDetail: "Chama direct_event.",
        guardStepIndex: null,
        guardCommand: null,
        choiceIndex: null
      })
    ]);
  });

  it("summarizes graph node flow roles from incoming and outgoing edges", () => {
    const presentation = deriveEventsWorkspacePresentation({
      dialogues: [{ key: "intro_choice", choices: ["Accept", "Leave"] }],
      events: [
        {
          id: "event-source",
          name: "source",
          category: "Controle",
          steps: [
            { command: "if_flag story.progress true" },
            { command: "call_event story_event" },
            { command: "choice_event intro_choice 1 leave_event" },
            { command: "call_event direct_event" }
          ]
        },
        { id: "event-story", name: "story_event", category: "Controle", command: "noop" },
        { id: "event-leave", name: "leave_event", category: "Controle", command: "noop" },
        { id: "event-direct", name: "direct_event", category: "Controle", command: "noop" },
        { id: "event-loose", name: "loose", category: "Controle", command: "noop" }
      ]
    });
    const nodesByName = new Map(presentation.graphNodes.map((node) => [node.eventName, node]));

    expect(nodesByName.get("source")).toMatchObject({
      incomingEdgeCount: 0,
      outgoingEdgeCount: 3,
      incomingFlowKinds: [],
      outgoingFlowKinds: ["condition-dependent", "choice", "event-call"],
      flowRole: "branch-source",
      flowLabels: ["Entrada", "Ramifica", "Escolhas", "Condicional"]
    });
    expect(nodesByName.get("story_event")).toMatchObject({
      incomingEdgeCount: 1,
      outgoingEdgeCount: 0,
      incomingFlowKinds: ["condition-dependent"],
      outgoingFlowKinds: [],
      flowRole: "branch-target",
      flowLabels: ["Alvo condicional"]
    });
    expect(nodesByName.get("leave_event")).toMatchObject({
      incomingEdgeCount: 1,
      outgoingEdgeCount: 0,
      incomingFlowKinds: ["choice"],
      outgoingFlowKinds: [],
      flowRole: "branch-target",
      flowLabels: ["Alvo de escolha"]
    });
    expect(nodesByName.get("direct_event")).toMatchObject({
      incomingEdgeCount: 1,
      outgoingEdgeCount: 0,
      incomingFlowKinds: ["event-call"],
      outgoingFlowKinds: [],
      flowRole: "linear",
      flowLabels: ["Linear"]
    });
    expect(nodesByName.get("loose")).toMatchObject({
      incomingEdgeCount: 0,
      outgoingEdgeCount: 0,
      flowRole: "isolated",
      flowLabels: ["Solto"]
    });
  });

  it("creates a graph connection as a call_event step and refuses duplicate targets", () => {
    const project: { events: Array<Record<string, unknown>> } = {
      events: [
        { id: "event-start", name: "start", category: "Controle", steps: [{ command: "noop" }] },
        { id: "event-door", name: "door_open", category: "Cena", steps: [{ command: "noop" }] }
      ]
    };

    const connected = connectEventGraphNodesInProject(project, {
      sourceEventID: "event-start",
      targetEventName: "door_open"
    }) as EventTestProject;
    expect(connected.events?.[0]).toMatchObject({
      steps: [
        { command: "noop", isEnabled: true },
        { command: "call_event door_open", isEnabled: true }
      ]
    });
    expect(deriveEventsWorkspacePresentation(connected).graphEdges).toEqual([
      {
        id: "event-start-door_open-call_event-1",
        sourceEventID: "event-start",
        stepIndex: 1,
        sourceEventName: "start",
        targetEventName: "door_open",
        commandVerb: "call_event",
        flowKind: "event-call",
        flowLabel: "Chama evento",
        flowDetail: "Chama door_open.",
        guardStepIndex: null,
        guardCommand: null,
        choiceIndex: null,
        isMissingTarget: false
      }
    ]);

    const duplicateAttempt = connectEventGraphNodesInProject(connected, {
      sourceEventID: "event-start",
      targetEventName: "door_open"
    });
    expect(duplicateAttempt).toBe(connected);
  });

  it("creates an event with a non-overlapping graph position", () => {
    const project = {
      editorState: {
        eventGraphNodePositions: {
          "event-start": { x: 24, y: 24 },
          "event-door": { x: 252, y: 24 }
        }
      },
      events: [
        { id: "event-start", name: "start", category: "Controle", steps: [{ command: "noop" }] },
        { id: "event-door", name: "door_open", category: "Cena", steps: [{ command: "noop" }] }
      ]
    };

    const next = createEventWithGraphPositionInProject(project, {
      category: "Custom",
      id: "event-new",
      name: "novo_evento"
    });

    expect(deriveEventsWorkspacePresentation(next).graphNodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y
    }))).toEqual([
      { id: "event-start", x: 24, y: 24 },
      { id: "event-door", x: 252, y: 24 },
      { id: "event-new", x: 504, y: 48 }
    ]);
  });

  it("retargets and removes only the referenced graph connection step", () => {
    const project: { events: Array<Record<string, unknown>> } = {
      events: [
        {
          id: "event-start",
          name: "start",
          category: "Controle",
          steps: [
            { command: "show_dialogue intro", isEnabled: true },
            { command: "call_event door_open", isEnabled: true },
            { command: "play_sfx click.wav", isEnabled: true }
          ]
        },
        { id: "event-door", name: "door_open", category: "Cena", steps: [{ command: "noop" }] },
        { id: "event-shop", name: "shop_open", category: "Cena", steps: [{ command: "noop" }] }
      ]
    };

    const retargeted = retargetEventGraphEdgeInProject(project, {
      sourceEventID: "event-start",
      stepIndex: 1,
      targetEventName: "shop_open"
    }) as EventTestProject;
    expect(retargeted.events?.[0]).toMatchObject({
      steps: [
        { command: "show_dialogue intro", isEnabled: true },
        { command: "call_event shop_open", isEnabled: true },
        { command: "play_sfx click.wav", isEnabled: true }
      ]
    });

    const removed = removeEventGraphEdgeInProject(retargeted, {
      sourceEventID: "event-start",
      stepIndex: 1
    }) as EventTestProject;
    expect(removed.events?.[0]).toMatchObject({
      steps: [
        { command: "show_dialogue intro", isEnabled: true },
        { command: "play_sfx click.wav", isEnabled: true }
      ]
    });
  });

  it("groups events, counts enabled steps and reports usage and missing resources", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [
        { name: "overworld", eventBindings: { onInit: "room_boot" } },
        { name: "shop" }
      ],
      actors: [{ name: "Guide", eventName: "npc_talk", eventBindings: { onInteract: "npc_talk" } }],
      triggers: [{ name: "Door", eventName: "door_enter" }],
      dialogues: [{ key: "intro" }],
      audioItems: [{ name: "theme.mod", kind: "Musica" }],
      events: [
        {
          id: "event-room",
          name: "room_boot",
          category: "Cena",
          detail: "Boot da sala",
          command: "play_music theme.mod",
          steps: [
            { id: "step-music", command: "play_music theme.mod", note: "Tema" },
            { id: "step-disabled", command: "show_dialogue missing", isEnabled: false }
          ]
        },
        {
          id: "event-npc",
          name: "npc_talk",
          category: "Ator",
          detail: "",
          command: "show_dialogue intro"
        },
        {
          id: "event-door",
          name: "door_enter",
          category: "Trigger",
          detail: "",
          command: "change_scene missing_room"
        },
        {
          id: "event-loose",
          name: "loose_event",
          category: "Custom",
          detail: "",
          command: "call_event missing_event"
        }
      ]
    });

    expect(presentation.summary).toEqual({
      eventCount: 4,
      stepCount: 5,
      enabledStepCount: 4,
      unlinkedEventCount: 1,
      missingReferenceCount: 2,
      graphEdgeCount: 1,
      categories: [
        { category: "Cena", count: 1 },
        { category: "Ator", count: 1 },
        { category: "Trigger", count: 1 },
        { category: "Custom", count: 1 }
      ]
    });
    expect(presentation.commandPalette.map((suggestion) => suggestion.command)).toEqual(expect.arrayContaining([
      "noop",
      "set_variable value 10",
      "add_variable value 1",
      "if_variable value 10",
      "show_dialogue intro",
      "show_choice intro",
      "play_music theme.mod",
      "play_sfx theme.mod",
      "change_scene shop",
      "call_event room_boot"
    ]));
    expect(presentation.groups.map((group) => group.title)).toEqual(["Cena", "Atores", "Triggers", "Custom"]);
    expect(presentation.groups[0].events[0]).toMatchObject({
      id: "event-room",
      name: "room_boot",
      category: "Cena",
      detail: "Boot da sala",
      primaryCommand: "play_music theme.mod",
      stepCount: 2,
      enabledStepCount: 1,
      referenceCount: 1,
      isUnlinked: false,
      commandVerbs: ["play_music"],
      bindingLabels: ["Cena: overworld · onInit"],
      missingReferences: []
    });
    expect(presentation.groups[0].events[0].steps).toMatchObject([
      { index: 0, command: "play_music theme.mod", isEnabled: true, missingReferences: [] },
      { index: 1, command: "show_dialogue missing", isEnabled: false, missingReferences: [] }
    ]);
    expect(presentation.groups[2].events[0].missingReferences).toEqual(["Cena não encontrada: missing_room"]);
    expect(presentation.groups[3].events[0]).toMatchObject({
      name: "loose_event",
      isUnlinked: true,
      bindingLabels: [],
      missingReferences: ["Evento nao encontrado: missing_event"]
    });
    expect(presentation.graphEdges).toEqual([
      {
        id: "event-loose-missing_event-call_event-0",
        sourceEventID: "event-loose",
        stepIndex: 0,
        sourceEventName: "loose_event",
        targetEventName: "missing_event",
        commandVerb: "call_event",
        flowKind: "event-call",
        flowLabel: "Chama evento",
        flowDetail: "Chama missing_event.",
        guardStepIndex: null,
        guardCommand: null,
        choiceIndex: null,
        isMissingTarget: true
      }
    ]);
  });

  it("reports sprite frame event bindings as first-class event usage targets", () => {
    const presentation = deriveEventsWorkspacePresentation({
      animations: [
        {
          id: "anim-idle",
          name: "hero_idle",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 32,
          frameCount: 2,
          frameEvents: [
            [{ type: "event", value: "hero_idle_frame_1" }],
            []
          ]
        }
      ],
      events: [
        {
          id: "event-frame",
          name: "hero_idle_frame_1",
          category: "Sprite",
          command: "show_dialogue intro"
        }
      ]
    });

    expect(presentation.bindingTargets).toEqual(expect.arrayContaining([
      {
        id: "spriteFrame:anim-idle:0",
        label: "Sprite hero_idle · Frame 1",
        targetKind: "spriteFrame",
        targetName: "hero_idle",
        bindingKey: "frame:0",
        currentEventName: "hero_idle_frame_1"
      }
    ]));
    expect(presentation.groups[0].events[0].bindingLabels).toContain("Sprite: hero_idle · Frame 1");
    expect(presentation.summary.unlinkedEventCount).toBe(0);
  });

  it("marks registry commands outside the ROM subset without advertising a retired preview", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "overworld" }],
      dialogues: [{ key: "intro" }],
      audioItems: [
        { name: "theme.mod", kind: "Musica" },
        { name: "confirm.wav", kind: "SFX" }
      ],
      events: [
        { id: "event-child", name: "child_event", category: "Custom", command: "noop" },
        {
          id: "event-p0",
          name: "room_boot",
          category: "Cena",
          steps: [
            { command: "show_dialogue intro" },
            { command: "show_choice intro" },
            { command: "play_music theme.mod" },
            { command: "play_sfx confirm.wav" },
            { command: "change_scene overworld" },
            { command: "call_event child_event" },
            { command: "set_variable score 1" }
          ]
        }
      ]
    });

    const event = presentation.groups.flatMap((group) => group.events).find((item) => item.name === "room_boot");
    expect(event?.steps.slice(0, 6).flatMap((step) => step.missingReferences)).toEqual([]);
    expect(event?.steps[6].missingReferences).toEqual([]);
    expect(event?.steps[0]).toMatchObject({
      command: "show_dialogue intro",
      commandVerb: "show_dialogue",
      commandLabel: "Exibir diálogo",
      commandCategory: "Diálogo e menus",
      commandBadge: "OK ROM",
      commandPaletteID: "command:dialogue.show",
      paletteSuggestions: expect.arrayContaining([
        expect.objectContaining({
          id: "command:dialogue.show",
          label: "Exibir diálogo",
          command: "show_dialogue intro",
          badge: "OK ROM"
        })
      ])
    });
    expect(event?.steps[6]).toMatchObject({
      command: "set_variable score 1",
      commandVerb: "set_variable",
      commandLabel: "Definir variável para valor",
      commandCategory: "Variáveis",
      commandBadge: "OK ROM",
      commandPaletteID: "command:variables.set_value",
      paletteSuggestions: expect.arrayContaining([
        expect.objectContaining({
          id: "command:variables.set_value",
          label: "Definir variável para valor",
          command: "set_variable value 10",
          badge: "OK ROM"
        })
      ])
    });
    expect(event?.missingReferences).toEqual([]);
  });

  it("warns when commands do not compile for ROM export", () => {
    const presentation = deriveEventsWorkspacePresentation({
      events: [{
        id: "event-preview-only",
        name: "preview_only",
        category: "Custom",
        steps: [{ command: "draw_text Hello" }]
      }]
    });

    const event = presentation.groups.flatMap((group) => group.events).find((item) => item.name === "preview_only");
    expect(event?.steps[0].missingReferences).toEqual([
      expect.stringContaining("X/Y")
    ]);
    expect(event?.steps[0].commandBadge).toBe("Parâmetros incompletos");
  });

  it("uses ROM export support and structural event references without false pending or unlinked events", () => {
    const presentation = deriveEventsWorkspacePresentation({
      actors: [{ id: "actor-player", name: "Player", roomName: "stage" }],
      events: [
        {
          id: "event-root",
          name: "root",
          category: "Cena",
          steps: [
            { command: "attach_platform_callback fallStart platform_callback" },
            { command: "switch_variable mode 0 switch_zero 1 switch_one else switch_else" },
            { command: "rate_limit 30 1" },
            { command: "launch_projectile Player right 3" },
            { command: "rate_limit_end" },
            { command: "scene_stack_push" },
            { command: "end_event" }
          ]
        },
        { id: "event-platform", name: "platform_callback", category: "Script", steps: [{ command: "set_platformer_state fall" }] },
        { id: "event-zero", name: "switch_zero", category: "Script", steps: [{ command: "show_actor_gesture Player sweat.png 60" }] },
        { id: "event-one", name: "switch_one", category: "Script", steps: [{ command: "push_actor_away_from_player Player 1" }] },
        { id: "event-else", name: "switch_else", category: "Script", steps: [{ command: "scene_stack_previous" }] }
      ]
    });

    expect(presentation.summary.missingReferenceCount).toBe(0);
    expect(presentation.summary.unlinkedEventCount).toBe(1);
    expect(presentation.graphEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceEventName: "root", targetEventName: "platform_callback" }),
      expect.objectContaining({ sourceEventName: "root", targetEventName: "switch_zero" }),
      expect.objectContaining({ sourceEventName: "root", targetEventName: "switch_one" }),
      expect.objectContaining({ sourceEventName: "root", targetEventName: "switch_else" })
    ]));
  });

  it("marks native flag, actor state and player commands as available in the ROM", () => {
    const commands = [
      "add_variable_flags story.flags 1",
      "set_variable_flags story.flags 6",
      "clear_variable_flags story.flags 2",
      "reset_variables_false",
      "set_actor_collision_enabled Guide false",
      "set_all_sprites_visible false",
      "set_actor_animation_speed Guide 125",
      "player_bounce 2 30"
    ];
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "start" }],
      actors: [{ id: "actor-guide", name: "Guide", roomName: "start" }],
      events: [{ id: "event-native-state", name: "native_state", category: "Controle", steps: commands.map((command) => ({ command })) }]
    });

    const event = presentation.groups.flatMap((group) => group.events).find((item) => item.name === "native_state");
    expect(event?.steps.map((step) => step.commandBadge)).toEqual(commands.map(() => "OK ROM"));
    expect(event?.steps.flatMap((step) => step.missingReferences)).toEqual([]);
  });

  it("marks native actor reads, player movement, input, seed and stat commands as available in the ROM", () => {
    const commands = [
      "set_actor_collision_box Guide 0 1 12 14",
      "set_player_speed_profile 110 175 a 3",
      "set_player_movement_state swimming water",
      "store_actor_position Guide actor.x actor.y",
      "store_actor_direction Guide actor.direction",
      "set_random_seed story.seed",
      "wait_button a",
      "set_stat hp 16 24"
    ];
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "start" }],
      actors: [{ id: "actor-guide", name: "Guide", roomName: "start" }],
      events: [{ id: "event-native-control", name: "native_control", category: "Controle", steps: commands.map((command) => ({ command })) }]
    });

    const event = presentation.groups.flatMap((group) => group.events).find((item) => item.name === "native_control");
    expect(event?.steps.map((step) => step.commandBadge)).toEqual(commands.map(() => "OK ROM"));
    expect(event?.steps.flatMap((step) => step.missingReferences)).toEqual([]);
  });

  it("marks native conditions and callback lifecycle commands as available in the ROM", () => {
    const commands = [
      "if_variable_variable score story.target",
      "if_engine_field player_x 40",
      "if_engine_field_variable player_y story.target",
      "if_button a",
      "if_actor_direction Guide down",
      "if_actor_at_position Guide 4 3",
      "if_actor_distance Guide player 2",
      "if_actor_relative Guide player right",
      "attach_button a on_action",
      "remove_button b",
      "timer_attach 60 on_tick",
      "timer_restart on_tick",
      "timer_remove on_tick"
    ];
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "start" }],
      actors: [{ id: "actor-guide", name: "Guide", roomName: "start" }],
      events: [
        { id: "event-action", name: "on_action", category: "Controle", command: "noop" },
        { id: "event-tick", name: "on_tick", category: "Controle", command: "noop" },
        { id: "event-native-flow", name: "native_flow", category: "Controle", steps: commands.map((command) => ({ command })) }
      ]
    });

    const event = presentation.groups.flatMap((group) => group.events).find((item) => item.name === "native_flow");
    expect(event?.steps.map((step) => step.commandBadge)).toEqual(commands.map(() => "OK ROM"));
    expect(event?.steps.flatMap((step) => step.missingReferences)).toEqual([]);
  });

  it("filters event groups by query and status without mutating the presentation", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "overworld", eventBindings: { onInit: "room_boot" } }],
      audioItems: [{ name: "theme.mod", kind: "Musica" }],
      events: [
        {
          id: "event-room",
          name: "room_boot",
          category: "Cena",
          detail: "Inicializacao",
          steps: [{ command: "play_music theme.mod" }]
        },
        {
          id: "event-loose",
          name: "loose_event",
          category: "Custom",
          detail: "Debug",
          steps: [{ command: "call_event missing_event" }]
        },
        {
          id: "event-dialogue",
          name: "npc_talk",
          category: "Ator",
          detail: "Dialogo guia",
          steps: [{ command: "show_dialogue intro" }]
        }
      ]
    });

    expect(filterEventsWorkspaceGroups(presentation.groups, { query: "music" }).flatMap((group) => group.events.map((event) => event.name))).toEqual(["room_boot"]);
    expect(filterEventsWorkspaceGroups(presentation.groups, { query: "debug" }).flatMap((group) => group.events.map((event) => event.name))).toEqual(["loose_event"]);
    expect(filterEventsWorkspaceGroups(presentation.groups, { status: "warnings" }).flatMap((group) => group.events.map((event) => event.name))).toEqual(["npc_talk", "loose_event"]);
    expect(filterEventsWorkspaceGroups(presentation.groups, { query: "missing_event", status: "unlinked" }).flatMap((group) => group.events.map((event) => event.name))).toEqual(["loose_event"]);
    expect(presentation.groups.flatMap((group) => group.events)).toHaveLength(3);
  });

  it("recognizes dialogue, audio, room and event command references", () => {
    const presentation = deriveEventsWorkspacePresentation({
      rooms: [{ name: "target" }],
      dialogues: [{ key: "intro_choice" }],
      audioItems: [{ name: "confirm.wav", kind: "SFX" }],
      events: [
        {
          name: "choice",
          category: "Dialogo",
          detail: "",
          command: "noop",
          steps: [
            { command: "show_choice intro_choice" },
            { command: "choice_event intro_choice 0 accept" },
            { command: "play_sfx confirm.wav" },
            { command: "change_scene target 1 2" }
          ]
        },
        { name: "accept", category: "Controle", detail: "", command: "noop" }
      ]
    });

    expect(presentation.summary.missingReferenceCount).toBe(0);
    expect(presentation.summary.graphEdgeCount).toBe(1);
    expect(presentation.groups.flatMap((group) => group.events).find((event) => event.name === "choice")).toMatchObject({
      stepCount: 4,
      commandVerbs: ["show_choice", "choice_event", "play_sfx", "change_scene"],
      missingReferences: []
    });
    expect(presentation.graphEdges).toEqual([
      {
        id: "event-1-accept-choice_event-1",
        sourceEventID: "event-1",
        stepIndex: 1,
        sourceEventName: "choice",
        targetEventName: "accept",
        commandVerb: "choice_event",
        flowKind: "choice",
        flowLabel: "Escolha 1",
        flowDetail: "Quando intro_choice escolher a opcao 1, chama accept.",
        guardStepIndex: null,
        guardCommand: null,
        choiceIndex: 0,
        isMissingTarget: false
      }
    ]);
  });

  it("ignores legacy single room fields when resolving room command references", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scena: { name: "legacy_room" },
      room: { name: "legacy_room_alias" },
      events: [{ name: "door_enter", category: "Cena", command: "change_scene legacy_room" }]
    });
    const event = presentation.groups.flatMap((group) => group.events).find((item) => item.name === "door_enter");
    const commands = presentation.commandPalette.map((suggestion) => suggestion.command);

    expect(event?.missingReferences).toEqual(["Cena não encontrada: legacy_room"]);
    expect(commands).toContain("change_scene room_name");
    expect(commands).not.toContain("change_scene legacy_room");
    expect(commands).not.toContain("change_scene legacy_room_alias");
  });

  it("reports contextual command issues for missing arguments and audio kind mismatches", () => {
    const presentation = deriveEventsWorkspacePresentation({
      audioItems: [
        { name: "confirm.wav", kind: "SFX" },
        { name: "theme.mod", kind: "Musica" }
      ],
      events: [
        {
          id: "event-broken",
          name: "broken",
          category: "Controle",
          command: "noop",
          steps: [
            { command: "show_dialogue" },
            { command: "change_scene" },
            { command: "call_event" },
            { command: "play_music confirm.wav" },
            { command: "play_sfx theme.mod" }
          ]
        }
      ]
    });

    expect(presentation.summary.missingReferenceCount).toBe(5);
    expect(presentation.groups[0].events[0].missingReferences).toEqual([
      "Comando incompleto: show_dialogue requer dialogo.",
      "Comando incompleto: change_scene requer cena.",
      "Comando incompleto: call_event requer evento.",
      "Audio incompativel para play_music: confirm.wav e SFX.",
      "Audio incompativel para play_sfx: theme.mod e Musica."
    ]);
    expect(presentation.groups[0].events[0].steps.map((step) => step.missingReferences)).toEqual([
      ["Comando incompleto: show_dialogue requer dialogo."],
      ["Comando incompleto: change_scene requer cena."],
      ["Comando incompleto: call_event requer evento."],
      ["Audio incompativel para play_music: confirm.wav e SFX."],
      ["Audio incompativel para play_sfx: theme.mod e Musica."]
    ]);
  });

  it("reports contextual choice_event issues for dialogue, choice index and target event", () => {
    const presentation = deriveEventsWorkspacePresentation({
      dialogues: [{ key: "intro_choice" }],
      events: [
        { id: "event-accept", name: "accept", category: "Controle", command: "noop" },
        {
          id: "event-choice",
          name: "choice",
          category: "Dialogo",
          command: "noop",
          steps: [
            { command: "choice_event missing_choice 0 accept" },
            { command: "choice_event intro_choice" },
            { command: "choice_event intro_choice two accept" },
            { command: "choice_event intro_choice 1 missing_event" }
          ]
        }
      ]
    });

    expect(presentation.summary.missingReferenceCount).toBe(5);
    expect(presentation.groups.flatMap((group) => group.events).find((event) => event.name === "choice")?.missingReferences).toEqual([
      "Dialogo nao encontrado: missing_choice",
      "Comando incompleto: choice_event requer evento.",
      "Comando incompleto: choice_event requer indice da escolha.",
      "Indice de escolha invalido em choice_event: two.",
      "Evento nao encontrado: missing_event"
    ]);
  });

  it("reports contextual attach_button and timer_attach argument issues", () => {
    const presentation = deriveEventsWorkspacePresentation({
      events: [
        { id: "event-target", name: "target", category: "Controle", command: "noop" },
        {
          id: "event-input",
          name: "input",
          category: "Controle",
          command: "noop",
          steps: [
            { command: "attach_button" },
            { command: "attach_button A missing_event" },
            { command: "timer_attach" },
            { command: "timer_attach timer1 missing_event" }
          ]
        }
      ]
    });

    const inputEvent = presentation.groups.flatMap((group) => group.events).find((event) => event.name === "input");
    expect(presentation.summary.missingReferenceCount).toBe(5);
    expect(inputEvent?.missingReferences).toEqual([
      "Comando incompleto: attach_button requer botao.",
      "Comando incompleto: attach_button requer evento.",
      "Evento nao encontrado: missing_event",
      "Comando incompleto: timer_attach requer timer.",
      "Comando incompleto: timer_attach requer evento."
    ]);
  });

  it("reports rumble and 4-player multiplayer argument issues without flagging ROM support", () => {
    const presentation = deriveEventsWorkspacePresentation({
      events: [
        {
          id: "event-haptics",
          name: "haptics",
          category: "Multijogador",
          command: "noop",
          steps: [
            { command: "rumble_on_for" },
            { command: "rumble_on_for zero" },
            { command: "multiplayer4_open" },
            { command: "multiplayer4_open 5" },
            { command: "multiplayer4_set" },
            { command: "multiplayer4_read net.var_player" }
          ]
        }
      ]
    });

    const haptics = presentation.groups.flatMap((group) => group.events).find((event) => event.name === "haptics");
    expect(haptics?.missingReferences).toEqual([
      "Comando incompleto: rumble_on_for requer quadros.",
      "Quadros invalidos em rumble_on_for: zero.",
      "Comando incompleto: multiplayer4_open requer jogadores (2-4).",
      "Jogadores invalidos em multiplayer4_open: 5.",
      "Comando incompleto: multiplayer4_set requer valor.",
      "Comando incompleto: multiplayer4_read requer variaveis de jogador, contagem e base."
    ]);
  });

  it("derives quick binding targets for rooms, actors and triggers", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "overworld", eventBindings: { onInit: "room_boot" } }],
      actors: [{ name: "Guide", eventBindings: { onInteract: "npc_talk" } }],
      triggers: [{ name: "Door", eventBindings: { onEnter: "door_enter" } }],
      events: [
        { id: "event-room", name: "room_boot", category: "Cena", command: "noop" },
        { id: "event-npc", name: "npc_talk", category: "Ator", command: "noop" },
        { id: "event-door", name: "door_enter", category: "Trigger", command: "noop" }
      ]
    });

    expect(presentation.bindingTargets).toEqual(expect.arrayContaining([
      {
        id: "room:overworld:onInit",
        label: "Cena overworld · onInit",
        targetKind: "room",
        targetName: "overworld",
        bindingKey: "onInit",
        currentEventName: "room_boot"
      },
      {
        id: "actor:Guide:onInteract",
        label: "Ator Guide · onInteract",
        targetKind: "actor",
        targetName: "Guide",
        bindingKey: "onInteract",
        currentEventName: "npc_talk"
      },
      {
        id: "trigger:Door:onEnter",
        label: "Trigger Door · onEnter",
        targetKind: "trigger",
        targetName: "Door",
        bindingKey: "onEnter",
        currentEventName: "door_enter"
      },
      {
        id: "trigger:Door:onLeave",
        label: "Trigger Door · onLeave",
        targetKind: "trigger",
        targetName: "Door",
        bindingKey: "onLeave",
        currentEventName: null
      }
    ]));
    expect(presentation.bindingTargets.filter((target) => target.targetKind === "actor" && target.targetName === "Guide")).toHaveLength(3);
    expect(presentation.bindingTargets.filter((target) => target.targetKind === "trigger" && target.targetName === "Door")).toHaveLength(3);
  });

  it("derives canonical context binding slots for rooms and actors", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [
        { name: "room_1", eventBindings: { onInit: "room_boot" } },
        {
          name: "arena",
          sceneType: "battleRpg",
          runtime: { type: "battleRpg" },
          eventBindings: { onHitGroup2: "battle_hit" }
        }
      ],
      actors: [{ name: "Player", eventName: "player_start" }],
      events: [
        { id: "event-room", name: "room_boot", category: "Cena", command: "noop" },
        { id: "event-battle-hit", name: "battle_hit", category: "Cena", command: "noop" }
      ]
    });

    const roomNode = presentation.graphNodes.find((node) => node.targetName === "room_1");
    const battleNode = presentation.graphNodes.find((node) => node.targetName === "arena");
    const playerNode = presentation.graphNodes.find((node) => node.targetName === "Player");
    expect(roomNode?.contextBindingSlots.map((slot) => slot.bindingKey)).toEqual(["onInit", "onHitPlayer", "onExit", "onInteract"]);
    expect(roomNode?.pendingBindingCount).toBe(5);
    expect(battleNode?.contextBindingSlots.map((slot) => slot.bindingKey)).toEqual(["onInit", "onVictory", "onDefeat", "onEscape"]);
    expect(battleNode?.contextBindingSlots.some((slot) => slot.bindingKey === "onHitPlayer")).toBe(false);
    expect(battleNode?.pendingBindingCount).toBe(4);
    expect(presentation.bindingTargets.map((target) => target.id)).not.toContain("room:arena:onHitGroup3");
    expect(presentation.bindingTargets.map((target) => target.id)).not.toContain("room:arena:onHitGroup2");
    expect(playerNode?.contextBindingSlots.find((slot) => slot.bindingKey === "onInteract")?.eventName).toBe("player_start");
    expect(playerNode?.contextBindingSlots.find((slot) => slot.bindingKey === "onUpdate")?.requiresFrequency).toBe(true);
    expect(playerNode?.pendingBindingCount).toBe(2);
  });

  it("materializa o Player como contexto visual com estados próprios no grafo", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "stage", playerActorName: "Player", eventBindings: {} }],
      actors: [{
        name: "Player",
        roomName: "stage",
        eventBindings: { onInit: "player_boot", onUpdate: "player_tick" }
      }],
      events: [
        { id: "event-player-boot", name: "player_boot", category: "Player", command: "noop" },
        { id: "event-player-tick", name: "player_tick", category: "Player", command: "noop" }
      ]
    });

    const playerNode = presentation.graphNodes.find((node) => node.targetName === "Player");
    expect(playerNode?.contextRole).toBe("player");
    expect(playerNode?.contextBindingSlots.map((slot) => slot.bindingKey)).toEqual(["onInit", "onUpdate"]);
    expect(playerNode?.boundEventNames).toEqual(["player_boot", "player_tick"]);
    expect(playerNode?.contextSubtitle).toContain("Player");
    expect(presentation.bindingTargets.filter((target) => target.targetKind === "actor" && target.targetName === "Player"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ bindingKey: "onInit" }),
        expect.objectContaining({ bindingKey: "onUpdate" })
      ]));
  });

  it("derives readable binding labels from rooms actors triggers and scene connections", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "overworld", eventBindings: { onInit: "room_boot" } }],
      actors: [{ name: "Guide", eventName: "npc_talk", eventBindings: { onInteract: "npc_talk" } }],
      triggers: [{ name: "Door", eventName: "door_enter", onEnterEventName: "door_enter", eventBindings: { onLeave: "door_leave" } }],
      editorState: { scenaConnections: [{ from: "overworld", to: "shop", eventName: "room_boot" }] },
      events: [
        { id: "event-room", name: "room_boot", category: "Cena", command: "noop" },
        { id: "event-npc", name: "npc_talk", category: "Ator", command: "noop" },
        { id: "event-door", name: "door_enter", category: "Trigger", command: "noop" },
        { id: "event-leave", name: "door_leave", category: "Trigger", command: "noop" }
      ]
    });

    const events = presentation.groups.flatMap((group) => group.events);
    expect(events.find((event) => event.name === "room_boot")?.bindingLabels).toEqual([
      "Cena: overworld · onInit",
      "Conexao: overworld -> shop · eventName"
    ]);
    expect(events.find((event) => event.name === "npc_talk")?.bindingLabels).toEqual([
      "Ator: Guide · eventName",
      "Ator: Guide · onInteract"
    ]);
    expect(events.find((event) => event.name === "door_enter")?.bindingLabels).toEqual([
      "Trigger: Door · eventName",
      "Trigger: Door · onEnterEventName"
    ]);
    expect(events.find((event) => event.name === "door_leave")?.bindingLabels).toEqual([
      "Trigger: Door · onLeave"
    ]);
  });

  it("binds events to quick targets through eventBindings without mutating the source project", () => {
    const project = {
      scenas: [{ name: "overworld", eventBindings: { onExit: "leave_room" } }],
      actors: [{ name: "Guide" }],
      triggers: [{ name: "Door", eventBindings: { onLeave: "leave_room" } }],
      events: [
        { id: "event-room", name: "room_boot", category: "Cena", command: "noop" },
        { id: "event-npc", name: "npc_talk", category: "Ator", command: "noop" },
        { id: "event-door", name: "door_enter", category: "Trigger", command: "noop" }
      ]
    };

    const withRoomBinding = bindEventToTargetInProject(project, "event-room", {
      targetKind: "room",
      targetName: "overworld",
      bindingKey: "onInit"
    });
    const withActorBinding = bindEventToTargetInProject(withRoomBinding, "event-npc", {
      targetKind: "actor",
      targetName: "Guide",
      bindingKey: "onInteract"
    });
    const withTriggerBinding = bindEventToTargetInProject(withActorBinding, "event-door", {
      targetKind: "trigger",
      targetName: "Door",
      bindingKey: "onEnter"
    });

    expect(withTriggerBinding.scenas).toEqual([
      { name: "overworld", eventBindings: { onExit: "leave_room", onInit: "room_boot" } }
    ]);
    expect(withTriggerBinding.actors).toEqual([
      { name: "Guide", eventBindings: { onInteract: "npc_talk" } }
    ]);
    expect(withTriggerBinding.triggers).toEqual([
      { name: "Door", eventBindings: { onLeave: "leave_room", onEnter: "door_enter" } }
    ]);
    expect(project.scenas).toEqual([{ name: "overworld", eventBindings: { onExit: "leave_room" } }]);
    expect(project.actors).toEqual([{ name: "Guide" }]);
    expect(bindEventToTargetInProject(project, "missing", { targetKind: "room", targetName: "overworld", bindingKey: "onInit" })).toBe(project);
    expect(bindEventToTargetInProject(project, "event-room", { targetKind: "room", targetName: "missing", bindingKey: "onInit" })).toBe(project);
    expect(bindEventToTargetInProject(project, "event-room", { targetKind: "actor", targetName: "Guide", bindingKey: "" })).toBe(project);
  });

  it("removes quick target bindings while preserving unrelated bindings", () => {
    const project = {
      scenas: [{ name: "overworld", eventBindings: { onInit: "room_boot", onExit: "leave_room" } }],
      actors: [{ name: "Guide", eventBindings: { onInteract: "npc_talk", onLook: "npc_look" } }],
      triggers: [{ name: "Door", eventBindings: { onEnter: "door_enter", onLeave: "door_leave" } }],
      events: [
        { id: "event-room", name: "room_boot", category: "Cena", command: "noop" },
        { id: "event-npc", name: "npc_talk", category: "Ator", command: "noop" },
        { id: "event-door", name: "door_enter", category: "Trigger", command: "noop" }
      ]
    };

    const withoutRoomBinding = removeEventTargetBindingInProject(project, {
      targetKind: "room",
      targetName: "overworld",
      bindingKey: "onInit"
    });
    const withoutActorBinding = removeEventTargetBindingInProject(withoutRoomBinding, {
      targetKind: "actor",
      targetName: "Guide",
      bindingKey: "onInteract"
    });
    const withoutTriggerBinding = removeEventTargetBindingInProject(withoutActorBinding, {
      targetKind: "trigger",
      targetName: "Door",
      bindingKey: "onEnter"
    });

    expect(withoutTriggerBinding.scenas).toEqual([{ name: "overworld", eventBindings: { onExit: "leave_room" } }]);
    expect(withoutTriggerBinding.actors).toEqual([{ name: "Guide", eventBindings: { onLook: "npc_look" } }]);
    expect(withoutTriggerBinding.triggers).toEqual([{ name: "Door", eventBindings: { onLeave: "door_leave" } }]);
    expect(project.scenas).toEqual([{ name: "overworld", eventBindings: { onInit: "room_boot", onExit: "leave_room" } }]);
    expect(removeEventTargetBindingInProject(project, { targetKind: "room", targetName: "missing", bindingKey: "onInit" })).toBe(project);
    expect(removeEventTargetBindingInProject(project, { targetKind: "room", targetName: "overworld", bindingKey: "missing" })).toBe(project);
    expect(removeEventTargetBindingInProject(project, { targetKind: "room", targetName: "overworld", bindingKey: "" })).toBe(project);
  });

  it("derives graph node positions from saved editor state with deterministic fallback", () => {
    const presentation = deriveEventsWorkspacePresentation({
      editorState: {
        eventGraphNodePositions: {
          "event-choice": { x: 210, y: 90 }
        }
      },
      events: [
        { id: "event-room", name: "room_boot", category: "Cena", command: "call_event choice" },
        { id: "event-choice", name: "choice", category: "Dialogo", command: "noop" },
        { id: "event-loose", name: "loose", category: "Custom", command: "call_event missing" }
      ]
    });

    expect(presentation.graphNodes).toEqual([
      {
        id: "event-room",
        nodeKind: "event",
        contextKind: null,
        eventName: "room_boot",
        targetName: null,
        sceneName: null,
        category: "Cena",
        x: 536,
        y: 48,
        isUnlinked: true,
        missingReferenceCount: 0,
        bindingKeys: [],
        boundEventNames: [],
        contextBindingSlots: [],
        contextSubtitle: null,
        pendingBindingCount: 0,
        incomingEdgeCount: 0,
        outgoingEdgeCount: 1,
        incomingFlowKinds: [],
        outgoingFlowKinds: ["event-call"],
        flowRole: "entry",
        flowLabels: ["Entrada"]
      },
      {
        id: "event-choice",
        nodeKind: "event",
        contextKind: null,
        eventName: "choice",
        targetName: null,
        sceneName: null,
        category: "Dialogo",
        x: 210,
        y: 90,
        isUnlinked: false,
        missingReferenceCount: 0,
        bindingKeys: [],
        boundEventNames: [],
        contextBindingSlots: [],
        contextSubtitle: null,
        pendingBindingCount: 0,
        incomingEdgeCount: 1,
        outgoingEdgeCount: 0,
        incomingFlowKinds: ["event-call"],
        outgoingFlowKinds: [],
        flowRole: "linear",
        flowLabels: ["Linear"]
      },
      {
        id: "event-loose",
        nodeKind: "event",
        contextKind: null,
        eventName: "loose",
        targetName: null,
        sceneName: null,
        category: "Custom",
        x: 764,
        y: 48,
        isUnlinked: true,
        missingReferenceCount: 1,
        bindingKeys: [],
        boundEventNames: [],
        contextBindingSlots: [],
        contextSubtitle: null,
        pendingBindingCount: 0,
        incomingEdgeCount: 0,
        outgoingEdgeCount: 1,
        incomingFlowKinds: [],
        outgoingFlowKinds: ["event-call"],
        flowRole: "entry",
        flowLabels: ["Entrada"]
      }
    ]);
  });

  it("derives room context cards and binding edges separately from event command edges", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [
        { name: "overworld", eventBindings: { onInit: "room_boot", onExit: "missing_event" } },
        { name: "shop" }
      ],
      events: [
        { id: "event-room", name: "room_boot", category: "Cena", command: "call_event npc_talk" },
        { id: "event-npc", name: "npc_talk", category: "Ator", command: "noop" }
      ]
    });

    expect(presentation.graphNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "context-room-overworld",
        nodeKind: "context",
        contextKind: "room",
        eventName: "Cena: overworld",
        targetName: "overworld",
        sceneName: "overworld",
        category: "Cena",
        bindingKeys: ["onInit", "onExit"],
        boundEventNames: ["room_boot", "missing_event"],
        missingReferenceCount: 1,
        pendingBindingCount: 4,
        flowLabels: ["Cena", "4 pendentes"]
      }),
      expect.objectContaining({
        id: "context-room-shop",
        nodeKind: "context",
        contextKind: "room",
        eventName: "Cena: shop",
        targetName: "shop",
        sceneName: "shop",
        category: "Cena",
        bindingKeys: [],
        boundEventNames: [],
        missingReferenceCount: 0,
        pendingBindingCount: 6,
        flowLabels: ["Cena", "6 pendentes"]
      }),
      expect.objectContaining({
        id: "event-room",
        nodeKind: "event",
        eventName: "room_boot",
        incomingEdgeCount: 1
      })
    ]));
    expect(presentation.graphBindingEdges).toEqual(expect.arrayContaining([
      {
        id: "context-room-overworld-onInit-room_boot",
        sourceNodeID: "context-room-overworld",
        sourceLabel: "Cena: overworld",
        targetEventName: "room_boot",
        targetEventID: "event-room",
        targetNodeID: "event-room",
        targetKind: "room",
        targetName: "overworld",
        bindingKey: "onInit",
        label: "onInit",
        isMissingTarget: false
      },
    ]));
    expect(presentation.graphEdges.map((edge) => edge.id)).toEqual(["event-room-npc_talk-call_event-0"]);
  });

  it("derives actor and trigger context cards with binding edges", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "room_1" }],
      actors: [{
        name: "Player",
        roomName: "room_1",
        eventBindings: { onInteract: "player_talk" }
      }],
      triggers: [{
        name: "Door",
        roomName: "room_1",
        onEnterEventName: "door_open",
        eventBindings: { onEnter: "door_enter" }
      }],
      events: [
        { id: "event-player", name: "player_talk", category: "Ator", command: "noop" },
        { id: "event-door-open", name: "door_open", category: "Trigger", command: "noop" },
        { id: "event-door-enter", name: "door_enter", category: "Trigger", command: "noop" },
        { id: "event-other", name: "other_room", category: "Cena", command: "noop" }
      ]
    });

    expect(presentation.graphNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "context-actor-player",
        nodeKind: "context",
        contextKind: "actor",
        eventName: "Ator: Player",
        targetName: "Player",
        sceneName: "room_1",
        category: "Ator",
        bindingKeys: ["onInteract"],
        boundEventNames: ["player_talk"],
        pendingBindingCount: 2
      }),
      expect.objectContaining({
        id: "context-trigger-door",
        nodeKind: "context",
        contextKind: "trigger",
        eventName: "Trigger: Door",
        targetName: "Door",
        sceneName: "room_1",
        category: "Trigger",
        bindingKeys: ["onEnter"],
        boundEventNames: ["door_enter"],
        pendingBindingCount: 1
      })
    ]));
    expect(presentation.graphBindingEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceNodeID: "context-actor-player",
        targetEventName: "player_talk",
        targetKind: "actor",
        bindingKey: "onInteract"
      }),
      expect.objectContaining({
        sourceNodeID: "context-trigger-door",
        targetEventName: "door_enter",
        targetKind: "trigger",
        bindingKey: "onEnter"
      })
    ]));
  });

  it("filters graph nodes and edges by active scene", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [
        { name: "room_1", eventBindings: { onInit: "room_1_boot" } },
        { name: "room_2", eventBindings: { onInit: "room_2_boot" } }
      ],
      actors: [{
        name: "Player",
        roomName: "room_1",
        eventBindings: { onInteract: "player_talk" }
      }],
      events: [
        { id: "event-room-1", name: "room_1_boot", category: "Cena", command: "call_event player_talk" },
        { id: "event-room-2", name: "room_2_boot", category: "Cena", command: "noop" },
        { id: "event-player", name: "player_talk", category: "Ator", command: "noop" }
      ]
    });

    const filtered = filterEventsWorkspaceGraphByScene(presentation, "room_1");
    expect(filtered.graphNodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      "context-room-room_1",
      "context-actor-player",
      "event-room-1",
      "event-player"
    ]));
    expect(filtered.graphNodes.some((node) => node.id === "context-room-room_2")).toBe(false);
    expect(filtered.graphNodes.some((node) => node.id === "event-room-2")).toBe(false);
    expect(filtered.graphEdges.map((edge) => edge.id)).toEqual(["event-room-1-player_talk-call_event-0"]);
  });

  it("derives validation issues for unlinked events and missing references", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "room_1", eventBindings: { onInit: "missing_boot" } }],
      events: [
        { id: "event-loose", name: "loose", category: "Custom", command: "noop" },
        { id: "event-broken", name: "broken", category: "Controle", command: "call_event missing_target" }
      ]
    });

    const issues = deriveEventsWorkspaceValidationIssues(presentation);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "warning",
        message: expect.stringContaining("loose")
      }),
      expect.objectContaining({
        severity: "error",
        message: expect.stringContaining("missing_boot")
      }),
      expect.objectContaining({
        severity: "error",
        message: expect.stringContaining("missing_target")
      })
    ]));
  });

  it("derives visual graph connect targets without self links or existing links", () => {
    const presentation = deriveEventsWorkspacePresentation({
      events: [
        { id: "event-a", name: "a", category: "Controle", command: "call_event b" },
        { id: "event-b", name: "b", category: "Controle", command: "noop" },
        { id: "event-c", name: "c", category: "Controle", command: "noop" }
      ]
    });

    expect(presentation.graphConnectTargetsBySource).toEqual({
      "event-a": [{ eventID: "event-c", eventName: "c", category: "Controle" }],
      "event-b": [
        { eventID: "event-a", eventName: "a", category: "Controle" },
        { eventID: "event-c", eventName: "c", category: "Controle" }
      ],
      "event-c": [
        { eventID: "event-a", eventName: "a", category: "Controle" },
        { eventID: "event-b", eventName: "b", category: "Controle" }
      ]
    });
  });

  it("updates event graph node positions without changing events", () => {
    const project = {
      events: [{ id: "event-room", name: "room_boot", category: "Cena", command: "noop" }],
      editorState: {
        selectedWorkspace: "events"
      }
    };

    const next = updateEventGraphNodePositionInProject(project, "event-room", { x: 345.8, y: -10 });

    expect(next.events).toEqual(project.events);
    expect(next.editorState).toEqual({
      selectedWorkspace: "events",
      eventGraphNodePositions: {
        "event-room": { x: 346, y: 0 }
      }
    });
    expect(project.editorState).toEqual({ selectedWorkspace: "events" });
    expect(updateEventGraphNodePositionInProject(project, "event-room", { x: Number.NaN, y: 20 })).toBe(project);
    expect(updateEventGraphNodePositionInProject(project, "", { x: 10, y: 20 })).toBe(project);
  });

  it("retargets visual graph edges while preserving command arguments", () => {
    const project = {
      events: [
        { id: "event-old", name: "old_target", category: "Controle", command: "noop" },
        { id: "event-new", name: "new_target", category: "Controle", command: "noop" },
        { id: "event-command", name: "command_source", category: "Controle", command: "call_event old_target" },
        {
          id: "event-steps",
          name: "step_source",
          category: "Controle",
          command: "noop",
          steps: [
            { id: "step-choice", command: "choice_event intro 0 old_target", note: "keep" },
            { id: "step-button", command: "attach_button A old_target" },
            { id: "step-timer", command: "timer_attach timer1 old_target" },
            { id: "step-lock", command: "lock_script old_target" }
          ]
        }
      ]
    };

    const withCommandRetarget = retargetEventGraphEdgeInProject(project, {
      sourceEventID: "event-command",
      stepIndex: 0,
      targetEventName: "new_target"
    });
    const withChoiceRetarget = retargetEventGraphEdgeInProject(withCommandRetarget, {
      sourceEventID: "event-steps",
      stepIndex: 0,
      targetEventName: "new_target"
    });
    const withButtonRetarget = retargetEventGraphEdgeInProject(withChoiceRetarget, {
      sourceEventID: "event-steps",
      stepIndex: 1,
      targetEventName: "new_target"
    });
    const withTimerRetarget = retargetEventGraphEdgeInProject(withButtonRetarget, {
      sourceEventID: "event-steps",
      stepIndex: 2,
      targetEventName: "new_target"
    });
    const withLockRetarget = retargetEventGraphEdgeInProject(withTimerRetarget, {
      sourceEventID: "event-steps",
      stepIndex: 3,
      targetEventName: "new_target"
    });

    expect(withLockRetarget.events).toEqual([
      { id: "event-old", name: "old_target", category: "Controle", command: "noop" },
      { id: "event-new", name: "new_target", category: "Controle", command: "noop" },
      { id: "event-command", name: "command_source", category: "Controle", command: "call_event new_target" },
      {
        id: "event-steps",
        name: "step_source",
        category: "Controle",
        command: "noop",
        steps: [
          { id: "step-choice", command: "choice_event intro 0 new_target", note: "keep" },
          { id: "step-button", command: "attach_button A new_target" },
          { id: "step-timer", command: "timer_attach timer1 new_target" },
          { id: "step-lock", command: "lock_script new_target" }
        ]
      }
    ]);
    expect(project.events[2].command).toBe("call_event old_target");
    expect(retargetEventGraphEdgeInProject(project, {
      sourceEventID: "event-command",
      stepIndex: 0,
      targetEventName: "missing"
    })).toBe(project);
    expect(retargetEventGraphEdgeInProject(project, {
      sourceEventID: "event-old",
      stepIndex: 0,
      targetEventName: "new_target"
    })).toBe(project);
  });

  it("creates visual graph links by appending call_event steps without dropping primary commands", () => {
    const project = {
      events: [
        { id: "event-source", name: "source", category: "Controle", command: "show_dialogue intro", detail: "keep" },
        {
          id: "event-script",
          name: "script",
          category: "Controle",
          command: "noop",
          steps: [{ id: "step-a", command: "play_sfx confirm.wav", isEnabled: false, note: "keep" }]
        },
        { id: "event-target", name: "target", category: "Controle", command: "noop" }
      ]
    };

    const withImplicitStep = connectEventGraphNodesInProject(project, {
      sourceEventID: "event-source",
      targetEventName: "target"
    });
    const withExplicitStep = connectEventGraphNodesInProject(withImplicitStep, {
      sourceEventID: "event-script",
      targetEventName: "target"
    });

    expect(withExplicitStep.events).toEqual([
      {
        id: "event-source",
        name: "source",
        category: "Controle",
        command: "show_dialogue intro",
        detail: "keep",
        steps: [
          { command: "show_dialogue intro", isEnabled: true },
          { command: "call_event target", isEnabled: true }
        ]
      },
      {
        id: "event-script",
        name: "script",
        category: "Controle",
        command: "noop",
        steps: [
          { id: "step-a", command: "play_sfx confirm.wav", isEnabled: false, note: "keep" },
          { command: "call_event target", isEnabled: true }
        ]
      },
      { id: "event-target", name: "target", category: "Controle", command: "noop" }
    ]);
    expect(project.events[0]).toEqual({ id: "event-source", name: "source", category: "Controle", command: "show_dialogue intro", detail: "keep" });
    expect(connectEventGraphNodesInProject(project, {
      sourceEventID: "missing",
      targetEventName: "target"
    })).toBe(project);
    expect(connectEventGraphNodesInProject(project, {
      sourceEventID: "event-source",
      targetEventName: "missing"
    })).toBe(project);
  });

  it("removes visual graph links by deleting the referenced step", () => {
    const project = {
      events: [
        {
          id: "event-source",
          name: "source",
          category: "Controle",
          command: "noop",
          steps: [
            { id: "step-a", command: "play_sfx confirm.wav", isEnabled: false, note: "keep" },
            { id: "step-b", command: "call_event target", isEnabled: true },
            { id: "step-c", command: "show_dialogue intro", isEnabled: true }
          ]
        },
        { id: "event-target", name: "target", category: "Controle", command: "noop" }
      ]
    };

    const next = removeEventGraphEdgeInProject(project, {
      sourceEventID: "event-source",
      stepIndex: 1
    });

    expect(next.events).toEqual([
      {
        id: "event-source",
        name: "source",
        category: "Controle",
        command: "noop",
        steps: [
          { id: "step-a", command: "play_sfx confirm.wav", isEnabled: false, note: "keep" },
          { id: "step-c", command: "show_dialogue intro", isEnabled: true }
        ]
      },
      { id: "event-target", name: "target", category: "Controle", command: "noop" }
    ]);
    expect(project.events[0].steps).toHaveLength(3);
    expect(removeEventGraphEdgeInProject(project, {
      sourceEventID: "event-source",
      stepIndex: 0
    })).toBe(project);
    expect(removeEventGraphEdgeInProject(project, {
      sourceEventID: "missing",
      stepIndex: 1
    })).toBe(project);
  });

  it("falls back to safe command suggestions when resources are absent", () => {
    const presentation = deriveEventsWorkspacePresentation({ events: [] });
    const suggestionsByID = new Map(presentation.commandPalette.map((suggestion) => [suggestion.id, suggestion]));

    expect(new Set(presentation.commandPalette.map(item => item.id)).size).toBe(presentation.commandPalette.length);
    expect(presentation.commandPalette).toEqual(expect.arrayContaining([expect.objectContaining({ id: "command:scene.set_background" })]));
    expect(suggestionsByID.get("Controle:noop")).toMatchObject({
      command: "noop",
      badge: "OK ROM",
      steps: null
    });
    expect(suggestionsByID.get("command:dialogue.show")).toMatchObject({
      command: "show_dialogue intro_001",
      targetName: "intro_001",
      badge: "OK ROM",
      isRecipe: false
    });
    expect(suggestionsByID.get("command:scene.change")).toMatchObject({
      command: "change_scene room_name",
      targetName: "room_name",
      badge: "OK ROM",
      isRecipe: false
    });
    expect(suggestionsByID.get("recipe:doorChangeScene")).toMatchObject({
      command: "fade_out 20",
      badge: "Modelo de script",
      isRecipe: true
    });
    expect(suggestionsByID.has("recipe:padlockFourDigits")).toBe(true);
  });

  it("filters command suggestions for the add block menu by tab and query", () => {
    const presentation = deriveEventsWorkspacePresentation({
      scenas: [{ name: "overworld" }],
      dialogues: [{ key: "intro" }],
      audioItems: [{ name: "confirm.wav", kind: "SFX" }],
      events: [{ name: "room_boot", category: "Cena", command: "noop" }]
    });

    expect(filterEventsCommandSuggestions(presentation.commandPalette, { tab: "favorites" }).map((suggestion) => suggestion.command)).toEqual([
      "show_dialogue intro",
      "change_scene overworld",
      "luta_start_match overworld", "luta_end_match player1"
    ]);
    expect(filterEventsCommandSuggestions(presentation.commandPalette, { query: "variavel" }).map((suggestion) => suggestion.command)).toEqual(expect.arrayContaining([
      "set_variable value 10",
      "add_variable value 1",
      "if_variable value 10"
    ]));
    expect(filterEventsCommandSuggestions(presentation.commandPalette, { query: "confirm" }).map((suggestion) => suggestion.command)).toEqual(expect.arrayContaining([
      "play_music confirm.wav",
      "play_sfx confirm.wav",
      "set_text_sfx confirm.wav"
    ]));
    expect(filterEventsCommandSuggestions(presentation.commandPalette, { query: "trocar", tab: "recipes" }).map((suggestion) => suggestion.id)).toContain("recipe:doorChangeScene");
    expect(filterEventsCommandSuggestions(presentation.commandPalette, { tab: "recipes" }).some((suggestion) => suggestion.id === "command:variables.set_value")).toBe(false);
    expect(presentation.commandPalette.find((suggestion) => suggestion.command === "show_dialogue intro")).toMatchObject({
      badge: "OK ROM",
      isFavorite: true,
      isRecipe: false
    });
    expect(presentation.commandPalette.find((suggestion) => suggestion.command === "set_variable value 10")).toMatchObject({
      badge: "OK ROM",
      isFavorite: false,
      isRecipe: false
    });
  });

  it("resets the add block menu to all commands when choosing a category", () => {
    expect(menuStateForEventsCommandCategory("Cena")).toEqual({ query: "Cena", tab: "all" });
    expect(menuStateForEventsCommandCategory("  Audio  ")).toEqual({ query: "Audio", tab: "all" });
  });

  it("keeps presentation resilient for partial event data", () => {
    const presentation = deriveEventsWorkspacePresentation({
      events: [{ name: "", category: "", detail: "", command: "" }]
    });

    expect(presentation.summary).toEqual({
      eventCount: 1,
      stepCount: 1,
      enabledStepCount: 1,
      unlinkedEventCount: 1,
      missingReferenceCount: 0,
      graphEdgeCount: 0,
      categories: [{ category: "Custom", count: 1 }]
    });
    expect(presentation.groups[0].events[0]).toMatchObject({
      id: "event-1",
      name: "Evento sem nome",
      category: "Custom",
      primaryCommand: "noop",
      commandVerbs: ["noop"],
      isUnlinked: true
    });
  });

  it("creates and binds an event for a context slot when adding the first block", () => {
    const project = createBlankProjectData({ name: "Blank", exportFolder: "build/blank" });

    const result = createBoundEventForTargetInProject(project, {
      eventID: "event-player-init",
      targetKind: "actor",
      targetName: "Player",
      bindingKey: "onInit",
      category: "Ator"
    });

    expect(result?.created).toBe(true);
    expect(result?.eventID).toBe("event-player-init");
    expect(suggestBoundEventName("Player", "onInit")).toBe("player_oninit");
    expect(boundEventNameForTarget(result!.data, {
      targetKind: "actor",
      targetName: "Player",
      bindingKey: "onInit"
    })).toBe("player_oninit");
    expect(result!.data.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "event-player-init",
        name: "player_oninit",
        category: "Ator"
      })
    ]));
  });

  it("reuses an existing bound event for a context slot", () => {
    const project = {
      actors: [{ name: "Player", eventBindings: { onInit: "player_start" } }],
      events: [{ id: "event-player", name: "player_start", category: "Ator", command: "noop" }]
    };

    const result = createBoundEventForTargetInProject(project, {
      eventID: "event-player-new",
      targetKind: "actor",
      targetName: "Player",
      bindingKey: "onInit"
    });

    expect(result).toEqual({
      created: false,
      data: project,
      eventID: "event-player"
    });
  });

  it("creates an event with safe defaults without discarding unrelated fields", () => {
    const project = {
      events: [{ id: "event-room", name: "room_boot", category: "Cena", command: "noop" }],
      editorState: { selectedWorkspace: "events" }
    };

    const next = createEventInProject(project, {
      id: "event-shop",
      name: "shop_intro",
      category: "Dialogo"
    });

    expect(next.events).toEqual([
      { id: "event-room", name: "room_boot", category: "Cena", command: "noop" },
      {
        id: "event-shop",
        name: "shop_intro",
        category: "Dialogo",
        detail: "",
        command: "noop",
        steps: [{ command: "noop", isEnabled: true }]
      }
    ]);
    expect(next.editorState).toEqual({ selectedWorkspace: "events" });
    expect(project.events).toHaveLength(1);
  });

  it("renames an event and updates bindings and commands that reference it", () => {
    const project = {
      scenas: [{ name: "overworld", eventBindings: { onInit: "room_boot" } }],
      actors: [{ name: "Player", eventName: "room_boot", eventBindings: { onInteract: "room_boot" } }],
      triggers: [{ name: "Door", eventName: "room_boot", onEnterEventName: "room_boot", onLeaveEventName: "other_event" }],
      editorState: { scenaConnections: [{ from: "overworld", to: "shop", eventName: "room_boot" }] },
      events: [
        { id: "event-room", name: "room_boot", category: "Cena", command: "noop" },
        {
          id: "event-caller",
          name: "caller",
          category: "Controle",
          command: "call_event room_boot",
          steps: [
            { command: "choice_event intro 0 room_boot" },
            { command: "attach_button A room_boot" },
            { command: "timer_attach timer1 room_boot" }
          ]
        }
      ]
    };

    const next = renameEventInProject(project, "event-room", "room_start");

    expect(next.scenas).toEqual([{ name: "overworld", eventBindings: { onInit: "room_start" } }]);
    expect(next.actors).toEqual([{ name: "Player", eventName: "room_start", eventBindings: { onInteract: "room_start" } }]);
    expect(next.triggers).toEqual([{ name: "Door", eventName: "room_start", onEnterEventName: "room_start", onLeaveEventName: "other_event" }]);
    expect(next.editorState).toEqual({ scenaConnections: [{ from: "overworld", to: "shop", eventName: "room_start" }] });
    expect(next.events).toEqual([
      { id: "event-room", name: "room_start", category: "Cena", command: "noop" },
      {
        id: "event-caller",
        name: "caller",
        category: "Controle",
        command: "call_event room_start",
        steps: [
          { command: "choice_event intro 0 room_start" },
          { command: "attach_button A room_start" },
          { command: "timer_attach timer1 room_start" }
        ]
      }
    ]);
  });

  it("duplicates an event with a new id and name while preserving steps", () => {
    const project = {
      events: [
        {
          id: "event-room",
          name: "room_boot",
          category: "Cena",
          detail: "Boot",
          command: "play_music theme.mod",
          steps: [{ command: "play_music theme.mod" }]
        }
      ]
    };

    const next = duplicateEventInProject(project, {
      sourceEventID: "event-room",
      newEventID: "event-room-copy",
      newName: "room_boot_copy"
    });

    expect(next.events).toEqual([
      {
        id: "event-room",
        name: "room_boot",
        category: "Cena",
        detail: "Boot",
        command: "play_music theme.mod",
        steps: [{ command: "play_music theme.mod" }]
      },
      {
        id: "event-room-copy",
        name: "room_boot_copy",
        category: "Cena",
        detail: "Boot",
        command: "play_music theme.mod",
        steps: [{ command: "play_music theme.mod" }]
      }
    ]);
    expect(project.events).toHaveLength(1);
  });

  it("prepares a stable selected-event export file", () => {
    const project = {
      scenas: [{ name: "overworld", eventBindings: { onInit: "room_boot" } }],
      actors: [{ name: "Guide", eventBindings: { onInteract: "npc_talk" } }],
      dialogues: [{ key: "intro" }],
      audioItems: [{ name: "theme.mod", kind: "Musica" }],
      events: [
        {
          id: "event-room",
          name: "room_boot",
          category: "Cena",
          detail: "Boot",
          command: "play_music theme.mod",
          steps: [
            { id: "step-music", command: "play_music theme.mod" },
            { id: "step-dialogue", command: "show_dialogue intro" },
            { id: "step-call", command: "call_event npc_talk" }
          ]
        },
        {
          id: "event-npc",
          name: "npc_talk",
          category: "Ator",
          command: "show_dialogue intro"
        }
      ]
    };

    const prepared = prepareEventExport(project, "event-room");

    expect(prepared?.fileName).toBe("room_boot.event.json");
    expect(JSON.parse(prepared?.contents ?? "{}")).toEqual({
      kind: "gbastudio.event",
      version: 1,
      event: {
        id: "event-room",
        name: "room_boot",
        category: "Cena",
        detail: "Boot",
        primaryCommand: "play_music theme.mod",
        steps: [
          { index: 0, command: "play_music theme.mod", isEnabled: true, missingReferences: [] },
          { index: 1, command: "show_dialogue intro", isEnabled: true, missingReferences: [] },
          { index: 2, command: "call_event npc_talk", isEnabled: true, missingReferences: [] }
        ],
        bindingLabels: ["Cena: overworld · onInit"],
        missingReferences: [],
        commandVerbs: ["play_music", "show_dialogue", "call_event"],
        graphEdges: [
          {
            id: "event-room-npc_talk-call_event-2",
            sourceEventID: "event-room",
            stepIndex: 2,
            sourceEventName: "room_boot",
            targetEventName: "npc_talk",
            commandVerb: "call_event",
            flowKind: "event-call",
            flowLabel: "Chama evento",
            flowDetail: "Chama npc_talk.",
            guardStepIndex: null,
            guardCommand: null,
            choiceIndex: null,
            isMissingTarget: false
          }
        ]
      }
    });
    expect(prepareEventExport(project, "missing")).toBeNull();
  });

  it("removes an event and clears direct bindings that pointed to it", () => {
    const project = {
      scenas: [{ name: "overworld", eventBindings: { onInit: "room_boot", onExit: "other_event" } }],
      actors: [{ name: "Player", eventName: "room_boot", eventBindings: { onInteract: "room_boot" } }],
      triggers: [{ name: "Door", eventName: "room_boot", onEnterEventName: "room_boot", onLeaveEventName: "other_event" }],
      editorState: {
        scenaConnections: [
          { from: "overworld", to: "shop", eventName: "room_boot" },
          { from: "shop", to: "overworld", eventName: "other_event" }
        ]
      },
      events: [
        { id: "event-room", name: "room_boot", category: "Cena", command: "noop" },
        { id: "event-other", name: "other_event", category: "Cena", command: "noop" }
      ]
    };

    const next = removeEventFromProject(project, "event-room");

    expect(next.events).toEqual([{ id: "event-other", name: "other_event", category: "Cena", command: "noop" }]);
    expect(next.scenas).toEqual([{ name: "overworld", eventBindings: { onExit: "other_event" } }]);
    expect(next.actors).toEqual([{ name: "Player", eventBindings: {} }]);
    expect(next.triggers).toEqual([{ name: "Door", onLeaveEventName: "other_event" }]);
    expect(next.editorState).toEqual({
      scenaConnections: [{ from: "shop", to: "overworld", eventName: "other_event" }]
    });
  });

  it("updates editable event fields while preserving unrelated event data", () => {
    const project = {
      events: [
        {
          id: "event-room",
          name: "room_boot",
          category: "Cena",
          detail: "Old detail",
          command: "noop",
          customFlag: true
        }
      ]
    };

    const next = updateEventFieldsInProject(project, "event-room", {
      category: "Controle",
      detail: "New detail",
      command: "play_music theme.mod"
    });

    expect(next.events).toEqual([
      {
        id: "event-room",
        name: "room_boot",
        category: "Controle",
        detail: "New detail",
        command: "play_music theme.mod",
        customFlag: true
      }
    ]);
    expect(project.events[0].command).toBe("noop");
  });

  it("adds, updates and removes event steps without dropping step metadata", () => {
    const project = {
      events: [
        {
          id: "event-room",
          name: "room_boot",
          category: "Cena",
          command: "noop",
          steps: [{ id: "step-a", command: "noop", isEnabled: true, note: "keep" }]
        }
      ]
    };

    const withNewStep = addEventStepInProject(project, "event-room", "show_dialogue intro");
    const withUpdatedStep = updateEventStepInProject(withNewStep, "event-room", 0, {
      command: "play_music theme.mod",
      isEnabled: false
    });
    const withRemovedStep = removeEventStepInProject(withUpdatedStep, "event-room", 1);

    expect(withRemovedStep.events).toEqual([
      {
        id: "event-room",
        name: "room_boot",
        category: "Cena",
        command: "noop",
        steps: [{ id: "step-a", command: "play_music theme.mod", isEnabled: false, note: "keep" }]
      }
    ]);
    expect(project.events[0].steps).toEqual([{ id: "step-a", command: "noop", isEnabled: true, note: "keep" }]);
  });
  it("edits procedure definitions and exposes ready-to-use calls in the palette", () => {
    const project: GBAProjectData = {
      events: [{ id: "procedure-award", name: "award", category: "Custom", steps: [{ command: "noop", isEnabled: true }] }]
    };
    const next = updateEventFieldsInProject(project, "procedure-award", {
      eventKind: "procedure",
      procedure: {
        parameters: [
          { name: "target", type: "variable", defaultValue: "score" },
          { name: "amount", type: "number", defaultValue: "5" }
        ],
        locals: [{ name: "calls", type: "number", initialValue: "0" }]
      }
    });
    const presentation = deriveEventsWorkspacePresentation(next);
    const procedure = presentation.groups.flatMap((group) => group.events).find((event) => event.name === "award");
    const call = presentation.commandPalette.find((suggestion) => suggestion.id === "procedure:award");

    expect(procedure).toMatchObject({
      eventKind: "procedure",
      procedure: {
        parameters: [
          { name: "target", type: "variable", defaultValue: "score" },
          { name: "amount", type: "number", defaultValue: "5" }
        ],
        locals: [{ name: "calls", type: "number", initialValue: "0" }]
      }
    });
    expect(call).toMatchObject({
      command: "call_procedure award score 5",
      commandTemplate: "call_procedure award {variable} {value}",
      runtimeStatus: "ok-rom"
    });
  });
});

describe("Events graph layout", () => {
  it("blank project context cards do not overlap", () => {
    const presentation = deriveEventsWorkspacePresentation(createBlankProjectData({
      name: "Blank",
      exportFolder: "build/blank"
    }));
    const room = presentation.graphNodes.find((node) => node.targetName === "cena_1");
    const player = presentation.graphNodes.find((node) => node.targetName === "Player");
    expect(room).toBeDefined();
    expect(player).toBeDefined();
    expect(rectsOverlap(graphNodeToRect(room!), graphNodeToRect(player!))).toBe(false);
    expect(player!.y).toBeGreaterThanOrEqual(room!.y + estimateContextNodeHeight(room!) + 32 - 1);
  });

  it("createEventWithGraphPosition avoids context rects", () => {
    const project = createBlankProjectData({ name: "Blank", exportFolder: "build/blank" });
    const next = createEventWithGraphPositionInProject(project, {
      id: "event-new",
      name: "novo_evento",
      category: "Custom"
    });
    const presentation = deriveEventsWorkspacePresentation(next);
    expect(graphNodesOverlap(presentation.graphNodes)).toBe(false);
  });

  it("bound event prefers placement beside actor", () => {
    const project = createBlankProjectData({ name: "Blank", exportFolder: "build/blank" });
    const result = createBoundEventForTargetInProject(project, {
      eventID: "event-player-init",
      targetKind: "actor",
      targetName: "Player",
      bindingKey: "onInit",
      category: "Ator"
    });
    const presentation = deriveEventsWorkspacePresentation(result!.data);
    const playerNode = presentation.graphNodes.find((node) => node.targetName === "Player");
    const eventNode = presentation.graphNodes.find((node) => node.id === "event-player-init");
    expect(playerNode).toBeDefined();
    expect(eventNode).toBeDefined();
    expect(eventNode!.x).toBeGreaterThan(playerNode!.x);
    expect(graphNodesOverlap(presentation.graphNodes)).toBe(false);
  });

  it("relayoutEventsGraphInProject separates stacked nodes", () => {
    const project = {
      scenas: [{ name: "room_1" }],
      actors: [{ name: "Player", roomName: "room_1" }],
      events: [
        { id: "event-a", name: "event_a", category: "Custom", command: "noop" },
        { id: "event-b", name: "event_b", category: "Custom", command: "noop" }
      ],
      editorState: {
        eventGraphNodePositions: {
          "context-room-room_1": { x: 24, y: 24 },
          "context-actor-player": { x: 24, y: 24 },
          "event-a": { x: 24, y: 24 },
          "event-b": { x: 24, y: 24 }
        }
      }
    };

    const next = relayoutEventsGraphInProject(project);
    const presentation = deriveEventsWorkspacePresentation(next);
    expect(graphNodesOverlap(presentation.graphNodes)).toBe(false);
  });
});
