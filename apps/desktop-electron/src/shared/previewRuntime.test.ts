import { describe, expect, it } from "vitest";

import {
  createPreviewRuntime,
  bootPreviewRuntimeAtRoom,
  dispatchPreviewRuntimeAction,
  PREVIEW_ACTOR_UPDATE_INTERVAL_MS,
  previewRuntimeSceneMenuItems,
  previewRuntimeStartMenuItems,
  previewRuntimeBattleMenuItems,
  previewRuntimeDungeonHud,
  rebootPreviewRuntimePreservingSaves,
  runPreviewRuntimeEvent,
  syncPreviewLutaVisualState,
  syncPreviewRuntimeProject,
  tickPreviewRuntime,
  previewPlayerMovementStepMs,
  previewRuntimeRtcAtFrame
} from "./previewRuntime.js";
import { buildProjectPluginRegistry, loadedPluginFromManifest } from "./gbaStudioPlugins.js";
import { buildFunctionalP0Project } from "./functionalP0Project.js";
import { buildFunctionalIsometricProject } from "./functionalIsometricProject.js";
import { createBlankProjectData } from "./newProject.js";
import { resolveAssetURL } from "./spriteAssetURL.js";
import { eventCommandCatalog } from "./eventCommandLibrary.js";
import {
  duplicateRoomEntitiesInProject,
  nudgeRoomEntitiesInProject,
  setRoomCollisionCellInProject
} from "./roomsWorkspace.js";

function buildFunctionalP0ProjectWithPortraitAsset() {
  const project = buildFunctionalP0Project();
  return {
    ...project,
    assets: [
      ...(Array.isArray(project.assets) ? project.assets : []),
      {
        id: "asset-portrait",
        name: "portrait.png",
        kind: "Sprite",
        metadata: { source: "Assets/portraits/portrait.png" }
      }
    ]
  };
}

function buildFunctionalP0ProjectWithLegacyDialogueFrameAsset() {
  const project = buildFunctionalP0ProjectWithPortraitAsset();
  return {
    ...project,
    assets: [
      ...(Array.isArray(project.assets) ? project.assets : []),
      {
        id: "asset-dialogue-box",
        name: "frame_dialogue.png",
        kind: "UI",
        metadata: { source: "Assets/ui/frame_dialogue.png" }
      }
    ]
  };
}

function resolveLegacyRuntimeCommand(template: string): string {
  const replacements: Record<string, string> = {
    actor: "Guide",
    animation: "idle",
    choiceDialogue: "intro",
    currentRoom: "room_1",
    dialogue: "intro",
    event: "script_child",
    music: "theme.mod",
    room: "room_2",
    sfx: "confirm.wav",
    sprite: "player.png",
    variable: "score",
    routeTable: "preview-routes"
  };
  return template.replace(/\{([a-zA-Z]+)\}/g, (_match, key: string) => replacements[key] ?? _match);
}

describe("Preview Runtime", () => {
  it("compartilha o manifesto universal de capacidades com o Preview", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ name: "start", width: 30, height: 20 }],
      settings: {
        general: { startScene: "start" },
        backgrounds: { graphicsMode: "Mode 2 - Affine" },
        runtimeCapabilities: {
          rtc: { enabled: true },
          link: { enabled: true },
          affine: { enabled: true }
        }
      }
    });

    expect(runtime.runtimeCapabilities.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "save", enabled: true }),
      expect.objectContaining({ id: "rtc", enabled: true }),
      expect.objectContaining({ id: "link", enabled: true }),
      expect.objectContaining({ id: "affine", enabled: true })
    ]));
  });

  it("usa um relogio falso deterministico no preview e avanca com os frames", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ name: "start", width: 30, height: 20 }],
      settings: {
        general: { startScene: "start" },
        runtimeCapabilities: { rtc: { enabled: true } }
      }
    });

    expect(runtime.rtc).toMatchObject({
      provider: "fake",
      timestampFrames: 0,
      year: 2000,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0
    });
    expect(previewRuntimeRtcAtFrame(60)).toMatchObject({
      timestampFrames: 60,
      second: 1
    });
    expect(tickPreviewRuntime(runtime, 1000).rtc).toMatchObject({
      timestampFrames: 60,
      second: 1
    });

    const disabled = createPreviewRuntime({ scenas: [{ name: "start", width: 30, height: 20 }] });
    expect(disabled.rtc).toBeNull();
  });

  it("consome o relogio falso em comandos de evento", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room", name: "room", width: 10, height: 8 }],
      variables: [{ name: "clock.hour" }, { name: "is.saturday" }],
      events: [{
        id: "rtc-event",
        name: "rtc",
        steps: [
          { command: "read_rtc hour clock.hour" },
          { command: "if_rtc weekday 6" },
          { command: "set_variable is.saturday 1" }
        ]
      }],
      settings: {
        general: { startScene: "room" },
        runtimeCapabilities: { rtc: { enabled: true } }
      }
    });

    const saturday = runPreviewRuntimeEvent(runtime, "rtc");
    expect(saturday.variables).toMatchObject({ "clock.hour": 0 });
    expect(saturday.variables).toMatchObject({ "clock.hour": 0, "is.saturday": 1 });
  });

  it("exposes the shared scene document fields to Play", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-porto",
        name: "porto",
        sceneType: "topdown",
        width: 24,
        height: 16,
        background: "porto.png",
        backgroundRenderMode: "tilemap",
        hudPresetId: "hud-map-corners",
        music: "porto_theme.mod",
        eventBindings: { onInit: "porto_boot" },
        collisions: ["solid"]
      }],
      events: [{ name: "porto_boot", command: "noop" }],
      settings: { general: { startScene: "porto" } }
    });

    expect(runtime.currentRoom).toMatchObject({
      id: "room-porto",
      name: "porto",
      sceneType: "topdown",
      width: 24,
      height: 16,
      backgroundAssetName: "porto.png",
      backgroundRenderMode: "tilemap",
      hudPresetId: "hud-map-corners",
      music: "porto_theme.mod",
      eventBindings: { onInit: "porto_boot" }
    });
    expect(runtime.currentRoom?.collisionCells[0]).toBe(true);
  });

  it("executa menus de cena no preview com telas, sliders, toggle e mixer de audio", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        {
          id: "audio",
          name: "audio",
          sceneType: "menu",
          width: 30,
          height: 20,
          runtime: {
            type: "menu",
            config: {
              screenType: "menu",
              role: "settings",
              title: "Áudio",
              items: [
                { id: "master", label: "Volume geral", action: "adjust_variable", variableIndex: 0, minValue: 0, maxValue: 100, step: 10, audioChannel: "all" },
                { id: "music", label: "Música", action: "adjust_variable", variableIndex: 1, minValue: 0, maxValue: 100, step: 10, audioChannel: "music" },
                { id: "enabled", label: "Som ligado", action: "toggle_variable", variableIndex: 2, minValue: 0, maxValue: 1, checkedValue: 1, audioChannel: "all" },
                { id: "controls", label: "Controles", action: "push_screen", targetScreenID: "controls" }
              ]
            }
          }
        },
        {
          id: "controls",
          name: "controls",
          sceneType: "menu",
          width: 30,
          height: 20,
          runtime: {
            type: "menu",
            config: {
              screenType: "menu",
              role: "settings",
              title: "Controles",
              items: [{ id: "back", label: "Voltar", action: "pop_screen" }]
            }
          }
        }
      ],
      variables: [
        { id: "var-master", name: "master" },
        { id: "var-music", name: "music" },
        { id: "var-enabled", name: "enabled" }
      ],
      settings: { general: { startScene: "audio" } }
    });

    expect(runtime.sceneMenu).toMatchObject({ visible: true, selectedIndex: 0, stack: [] });
    expect(runtime.variables).toEqual({});

    const louder = dispatchPreviewRuntimeAction(runtime, "right");
    expect(louder.variables.master).toBe(10);
    expect(louder.audioMix.volumes.music).toBe(2);
    expect(louder.audioMix.volumes.sfx).toBe(2);

    const muted = dispatchPreviewRuntimeAction(dispatchPreviewRuntimeAction(louder, "down"), "down");
    const toggled = dispatchPreviewRuntimeAction(muted, "action");
    expect(toggled.variables.enabled).toBe(1);
    expect(toggled.audioMix.muted.music).toBe(false);

    const controlsSelection = dispatchPreviewRuntimeAction(toggled, "down");
    const controls = dispatchPreviewRuntimeAction(controlsSelection, "action");
    expect(controls.currentRoom?.name).toBe("controls");
    expect(controls.sceneMenu.stack).toEqual(["audio"]);

    const back = dispatchPreviewRuntimeAction(controls, "action");
    expect(back.currentRoom?.name).toBe("audio");
    expect(back.sceneMenu.stack).toEqual([]);
  });

  it("navega pelas telas embutidas no Play preservando HUD, pilha e eventos", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "menu-room",
        name: "menu-room",
        sceneType: "menu",
        width: 30,
        height: 20,
        hudPresetId: "hud-room",
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            role: "initial",
            items: [{ id: "ignored", label: "Ignorado", action: "select" }],
            screens: [
              {
                id: "root",
                screenType: "menu",
                title: "Raiz",
                hudPresetId: "hud-root",
                items: [{ id: "settings", label: "Configurações", action: "push_screen", targetScreenID: "settings" }],
                onEnterEventName: "menu_root_enter"
              },
              {
                id: "settings",
                screenType: "menu",
                title: "Configurações",
                hudPresetId: "hud-settings",
                items: [{ id: "back", label: "Voltar", action: "pop_screen" }],
                onEnterEventName: "menu_settings_enter",
                onBackEventName: "menu_settings_back"
              }
            ]
          }
        }
      }],
      events: [
        { name: "menu_root_enter", steps: [{ command: "add_variable menu.root 1" }] },
        { name: "menu_settings_enter", steps: [{ command: "set_variable menu.settings 1" }] },
        { name: "menu_settings_back", steps: [{ command: "set_variable menu.back 1" }] }
      ],
      variables: [{ name: "menu.root" }, { name: "menu.settings" }, { name: "menu.back" }],
      settings: { general: { startScene: "menu-room" } }
    });

    expect(runtime.sceneMenu).toMatchObject({ visible: true, screenID: "root", hudPresetId: "hud-root", stack: [] });
    expect(previewRuntimeSceneMenuItems(runtime).map((item) => item.label)).toEqual(["Configurações"]);
    expect(runtime.variables["menu.root"]).toBe(1);

    const settings = dispatchPreviewRuntimeAction(runtime, "action");
    expect(settings.sceneMenu).toMatchObject({ screenID: "settings", hudPresetId: "hud-settings" });
    expect(settings.sceneMenu.stack).toHaveLength(1);
    expect(settings.variables["menu.settings"]).toBe(1);

    const root = dispatchPreviewRuntimeAction(settings, "back");
    expect(root.sceneMenu).toMatchObject({ screenID: "root", hudPresetId: "hud-root", stack: [] });
    expect(root.variables["menu.root"]).toBe(2);
    expect(root.variables["menu.back"]).toBeUndefined();
  });

  it("usa Start para confirmar a opção selecionada dentro de uma tela de menu", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "menu-room",
        name: "menu-room",
        sceneType: "menu",
        width: 30,
        height: 20,
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            role: "gender_select",
            items: [{ id: "male", label: "Homem", action: "select", eventName: "choose-male" }]
          }
        }
      }],
      events: [{ name: "choose-male", steps: [{ command: "set_variable player.gender 1" }] }],
      variables: [{ name: "player.gender" }],
      settings: { general: { startScene: "menu-room" } }
    });

    const confirmed = dispatchPreviewRuntimeAction(runtime, "start");

    expect(confirmed.startMenu.visible).toBe(false);
    expect(confirmed.sceneMenu.visible).toBe(true);
    expect(confirmed.variables["player.gender"]).toBe(1);
  });

  it("avança Logo embutida por frames ou skip permitido usando nextScreenID", () => {
    const project = {
      scenas: [{
        id: "startup",
        name: "startup",
        sceneType: "menu",
        width: 30,
        height: 20,
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            role: "initial",
            screens: [
              {
                id: "logo",
                screenType: "logo",
                title: "Logo",
                autoAdvanceFrames: 2,
                allowSkip: true,
                nextScreenID: "title",
                items: []
              },
              {
                id: "title",
                screenType: "title",
                title: "Title",
                items: [{ id: "start", label: "Começar", action: "select" }]
              }
            ]
          }
        }
      }],
      settings: { general: { startScene: "startup" } }
    };
    const frameMs = 1000 / 60;
    const runtime = createPreviewRuntime(project);

    expect(runtime.sceneMenu).toMatchObject({ screenID: "logo", elapsedFrames: 0 });
    const oneFrame = tickPreviewRuntime(runtime, frameMs);
    expect(oneFrame.sceneMenu).toMatchObject({ screenID: "logo", elapsedFrames: 1 });
    const advanced = tickPreviewRuntime(oneFrame, frameMs);
    expect(advanced.sceneMenu).toMatchObject({ screenID: "title", elapsedFrames: 0 });

    const skipped = dispatchPreviewRuntimeAction(createPreviewRuntime(project), "action");
    expect(skipped.sceneMenu).toMatchObject({ screenID: "title", elapsedFrames: 0 });
  });

  it("resolves explicit project inheritance and leaves unbound scenes without a HUD", () => {
    const project = { scenas: [{ id: "start", name: "start", sceneType: "topdown", width: 30, height: 20, hudPresetId: "@project" }], settings: { general: { startScene: "start" }, hudPresetId: "local", hudPresets: [{ id: "local", name: "Local" }] } };
    expect(createPreviewRuntime(project).currentRoom?.hudPresetId).toBe("local");
    expect(createPreviewRuntime({ ...project, scenas: [{ ...project.scenas[0], hudPresetId: undefined }] }).currentRoom?.hudPresetId).toBeNull();
  });

  it("usa no Play o HUD declarado pela tela de menu antes do HUD da sala", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "title",
        name: "title",
        sceneType: "menu",
        width: 30,
        height: 20,
        hudPresetId: "hud-room",
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            role: "settings",
            hudPresetId: "hud-title",
            items: []
          }
        }
      }],
      settings: { general: { startScene: "title" } }
    });

    expect(runtime.currentRoom?.hudPresetId).toBe("hud-title");
  });

  it("edita o nome no Preview sem preencher um nome visual artificial e mantém gênero/nome no save", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "name-room",
        name: "name_room",
        sceneType: "menu",
        width: 30,
        height: 20,
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            role: "name_input",
            title: "Nome do jogador",
            textInput: {
              variableName: "player.name",
              maxLength: 4,
              x: 10,
              y: 5,
              width: 4,
              keyboard: { layout: "grid", x: 4, y: 8, width: 22, height: 6, allowLowercase: true }
            },
            items: [{ id: "name", label: "Nome", action: "select", eventName: "open-name" }]
          }
        }
      }],
      events: [{
        name: "open-name",
        steps: [{ command: "open_text_input player.name 4 latin_upper" }]
      }, {
        name: "set-profile",
        steps: [
          { command: "set_variable player.gender 1" },
          { command: "save_game 0" }
        ]
      }],
      settings: { general: { startScene: "name_room" } }
    });

    expect(runtime.textInput).toMatchObject({ active: false, value: "" });

    const opened = dispatchPreviewRuntimeAction(runtime, "action");
    expect(opened.textInput).toMatchObject({
      active: true,
      variableName: "player.name",
      value: "",
      cursorIndex: 0,
      keyboardIndex: 0
    });

    const selectedA = dispatchPreviewRuntimeAction(opened, "action");
    expect(selectedA.textInput.value).toBe("A");
    expect(selectedA.variables["player.name"]).toBe("A");

    const movedToB = dispatchPreviewRuntimeAction(selectedA, "right");
    const selectedB = dispatchPreviewRuntimeAction(movedToB, "action");
    expect(selectedB.textInput.value).toBe("AB");

    let done = selectedB;
    for (let index = 0; index < 6; index += 1) done = dispatchPreviewRuntimeAction(done, "right");
    for (let index = 0; index < 3; index += 1) done = dispatchPreviewRuntimeAction(done, "down");
    done = dispatchPreviewRuntimeAction(done, "right");
    expect(done.textInput.keyboardIndex).toBe(28);
    done = dispatchPreviewRuntimeAction(done, "action");
    expect(done.textInput.active).toBe(false);
    expect(done.variables["player.name"]).toBe("AB");

    const saved = runPreviewRuntimeEvent({
      ...done,
      variables: { ...done.variables, "player.gender": 1 }
    }, "set-profile");
    expect(saved.saveSlots[0]?.variables).toMatchObject({ "player.name": "AB", "player.gender": 1 });
  });

  it("mantém o controle de maiúsculas desabilitado quando o contrato não permite minúsculas", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "name-room",
        name: "name_room",
        sceneType: "menu",
        width: 30,
        height: 20,
        runtime: {
          type: "menu",
          config: {
            screenType: "menu",
            role: "name_input",
            textInput: {
              variableName: "player.name",
              maxLength: 4,
              keyboard: { layout: "grid", allowLowercase: false }
            },
            items: [{ id: "name", label: "Nome", action: "select", eventName: "open-name" }]
          }
        }
      }],
      events: [{
        name: "open-name",
        steps: [{ command: "open_text_input player.name 4 latin_upper" }]
      }],
      settings: { general: { startScene: "name_room" } }
    });

    const opened = dispatchPreviewRuntimeAction(runtime, "action");
    const selectedCaseControl = dispatchPreviewRuntimeAction({
      ...opened,
      textInput: { ...opened.textInput, keyboardIndex: 27 }
    }, "action");

    expect(selectedCaseControl.textInput.lowercase).toBe(false);
  });

  it("runs a selected event directly and exposes its path and variables", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room",
        name: "room",
        width: 10,
        height: 8,
        runtime: {
          type: "topdown",
          config: { capabilities: [{ id: "link_multiplayer", enabled: true, settings: { transport: "local" } }] }
        }
      }],
      variables: [{ name: "score" }, { name: "reward" }],
      events: [
        { id: "selected", name: "selected", steps: [{ command: "set_variable score 7" }, { command: "call_event child" }] },
        { id: "child", name: "child", steps: [{ command: "set_variable reward 1" }] }
      ]
    });

    const result = runPreviewRuntimeEvent(runtime, "selected");

    expect(result.variables).toMatchObject({ score: 7, reward: 1 });
    expect(result.executionTrace.map((item) => item.eventName)).toEqual(["selected", "selected", "child"]);
  });

  it("uses a scene route table in Play and applies its destination spawn", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        { id: "room-start", name: "start", width: 10, height: 8 },
        { id: "room-porto", name: "porto", width: 10, height: 8 },
        { id: "room-penedos", name: "penedos", width: 10, height: 8 }
      ],
      actors: [
        { id: "player-start", name: "Player", roomName: "start", x: 1, y: 1 },
        { id: "player-porto", name: "Player", roomName: "porto", x: 2, y: 2 },
        { id: "player-penedos", name: "Player", roomName: "penedos", x: 3, y: 3 }
      ],
      events: [{
        name: "choose_route",
        steps: [
          { command: "set_variable route 1" },
          { command: "change_scene_by_variable map-routes" }
        ]
      }],
      sceneRouteTables: [{
        id: "map-routes",
        variable: "route",
        routes: [{ value: 1, scene: "penedos", x: 4, y: 5, direction: "right", fadeFrames: 8 }]
      }],
      settings: { general: { startScene: "start" } }
    });

    const result = runPreviewRuntimeEvent(runtime, "choose_route");

    expect(result.currentRoom?.name).toBe("penedos");
    expect(result.player).toMatchObject({ x: 4, y: 5, direction: "right" });
    expect(result.camera.fade).toEqual({ mode: "out", frames: 8 });
  });

  it("applies the explicit position and direction from change_scene in Play", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        { id: "room-start", name: "start", width: 10, height: 8 },
        { id: "room-shop", name: "shop", width: 10, height: 8 }
      ],
      actors: [
        { id: "player-start", name: "Player", roomName: "start", x: 1, y: 1, direction: "down" },
        { id: "player-shop", name: "Player", roomName: "shop", x: 2, y: 2, direction: "down" }
      ],
      events: [{
        name: "open_shop",
        steps: [{ command: "change_scene shop 4 5 right" }]
      }],
      settings: { general: { startScene: "start" } }
    });

    const result = runPreviewRuntimeEvent(runtime, "open_shop");

    expect(result.currentRoom?.name).toBe("shop");
    expect(result.player).toMatchObject({ x: 4, y: 5, direction: "right" });
  });

  it("applies the transition configured on a scene connection when Play changes rooms", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        { id: "room-start", name: "start", width: 10, height: 8 },
        { id: "room-shop", name: "shop", width: 10, height: 8 }
      ],
      events: [{
        name: "open_shop",
        steps: [{ command: "change_scene shop" }]
      }],
      editorState: {
        scenaConnections: [{
          from: "start",
          to: "shop",
          transition: { style: "fade", durationFrames: 12, fadeOut: true, fadeIn: true }
        }]
      },
      settings: { general: { startScene: "start" } }
    });

    const result = runPreviewRuntimeEvent(runtime, "open_shop");

    expect(result.currentRoom?.name).toBe("shop");
    expect(result.camera.fade).toEqual({ mode: "out", frames: 12 });
    expect(result.sceneTransition).toMatchObject({
      style: "fade",
      phase: "reveal",
      elapsedFrames: 0,
      progress: 0,
      sourceRoomName: "start",
      targetRoomName: "shop"
    });
    expect(tickPreviewRuntime(result, 1000 / 60).sceneTransition).toMatchObject({
      elapsedFrames: 1,
      progress: expect.closeTo(1 / 12)
    });
    const settled = tickPreviewRuntime(result, 1000);
    expect(settled.sceneTransition).toBeNull();
    expect(settled.camera.fade).toBeNull();
  });

  it("inherits the project transition default when a connection has no override", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        { id: "room-start", name: "start", width: 10, height: 8 },
        { id: "room-shop", name: "shop", width: 10, height: 8 }
      ],
      events: [{ name: "open_shop", steps: [{ command: "change_scene shop" }] }],
      editorState: { scenaConnections: [{ from: "start", to: "shop" }] },
      settings: {
        general: { startScene: "start" },
        transitions: { style: "wipe", durationFrames: 9, fadeOut: true, fadeIn: false }
      }
    });

    expect(runPreviewRuntimeEvent(runtime, "open_shop").sceneTransition).toMatchObject({
      style: "wipe",
      durationFrames: 9
    });
  });

  it("keeps the compositor metadata for all non-fade connection styles", () => {
    for (const style of ["fade-color", "wipe", "mosaic", "slide", "crossfade"] as const) {
      const runtime = createPreviewRuntime({
        scenas: [
          { id: "room-start", name: "start", width: 10, height: 8 },
          { id: "room-shop", name: "shop", width: 10, height: 8 }
        ],
        events: [{ name: "open_shop", steps: [{ command: "change_scene shop" }] }],
        editorState: {
          scenaConnections: [{ from: "start", to: "shop", transition: { style, durationFrames: 6, fadeOut: true, fadeIn: true } }]
        },
        settings: { general: { startScene: "start" } }
      });

      const result = runPreviewRuntimeEvent(runtime, "open_shop");
      expect(result.currentRoom?.name).toBe("shop");
      expect(result.sceneTransition).toMatchObject({ style, targetRoomName: "shop" });
      expect(tickPreviewRuntime(result, 100).sceneTransition).toBeNull();
    }
  });

  it("simulates Link Cable state, callback, transfer and close in the debugger", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room",
        name: "room",
        width: 10,
        height: 8,
        runtime: {
          type: "topdown",
          config: { capabilities: [{ id: "link_multiplayer", enabled: true, settings: { transport: "local" } }] }
        }
      }],
      variables: [{ name: "net.recebido" }, { name: "net.conectado" }],
      settings: { runtimeCapabilities: { link: { enabled: true } } },
      events: [
        { id: "connected", name: "conectado", steps: [{ command: "set_variable net.conectado 1" }] },
        { id: "network", name: "network", steps: [
          { command: "multiplayer_host conectado 120" },
          { command: "multiplayer_transfer net.recebido 42 30" }
        ] },
        { id: "close", name: "close", steps: [{ command: "multiplayer_close" }] }
      ]
    });

    const connected = runPreviewRuntimeEvent(runtime, "network");
    expect(connected.linkCable).toMatchObject({ role: "host", status: "connected", lastSent: 42, lastReceived: 42, transferOk: true });
    expect(connected.variables).toMatchObject({ "net.conectado": 1, "net.recebido": 42 });
    expect(connected.debug.lines).toContain("Link host connected");

    const closed = runPreviewRuntimeEvent(connected, "close");
    expect(closed.linkCable).toMatchObject({ role: "none", status: "closed" });
  });

  it("simulates rumble and 4-player multiplayer sync/read in the debugger", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room",
        name: "room",
        width: 10,
        height: 8,
        runtime: {
          type: "topdown",
          config: { capabilities: [{ id: "link_multiplayer", enabled: true, settings: { transport: "local" } }] }
        }
      }],
      variables: [{ name: "net.var_player" }, { name: "net.var_count" }, { name: "net.var_data" }],
      settings: { runtimeCapabilities: { link: { enabled: true } } },
      events: [
        { id: "haptics", name: "haptics", steps: [
          { command: "rumble_on_for 10" },
          { command: "multiplayer4_open 4" },
          { command: "multiplayer4_set 77" },
          { command: "multiplayer4_sync" },
          { command: "multiplayer4_read net.var_player net.var_count net.var_data" }
        ] },
        { id: "silence", name: "silence", steps: [
          { command: "rumble_off" },
          { command: "multiplayer4_close" }
        ] }
      ]
    });

    const synced = runPreviewRuntimeEvent(runtime, "haptics");
    expect(synced.linkCable?.rumble).toMatchObject({ active: true });
    expect(synced.linkCable?.mp4).toMatchObject({ open: true, players: 4, local: 77, syncOk: true });
    expect(synced.variables).toMatchObject({ "net.var_player": 0, "net.var_count": 4, "net.var_data": 77 });

    const silent = runPreviewRuntimeEvent(synced, "silence");
    expect(silent.linkCable?.rumble).toMatchObject({ active: false });
    expect(silent.linkCable?.mp4).toMatchObject({ open: false });
  });

  it("não executa Link Cable no Preview sem opt-in da cena", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room", name: "room", width: 10, height: 8 }],
      events: [{ id: "network", name: "network", steps: [{ command: "multiplayer_host connected 120" }] }]
    });

    const result = runPreviewRuntimeEvent(runtime, "network");
    expect(result.linkCable).toMatchObject({ role: "none", status: "closed" });
    expect(result.eventLog.at(-1)).toMatchObject({
      result: "skipped",
      detail: expect.stringContaining("link_multiplayer")
    });
  });

  it("traces the legacy catalog while reporting missing consumers and resources explicitly", () => {
    const commands = eventCommandCatalog
      .map((definition) => resolveLegacyRuntimeCommand(definition.commandTemplate))
      .filter((command) => {
        const verb = command.split(/\s+/)[0] ?? "";
        return verb !== "repeat_expression" && verb !== "switch_variable" && verb !== "advance_campaign" && verb !== "slider" && verb !== "set_background";
      })
      .sort((left, right) => {
        if (left.startsWith("stop_event")) return 1;
        if (right.startsWith("stop_event")) return -1;
        return 0;
      });
    let runtime = createPreviewRuntime({
      assets: [
        { name: "theme.mod", kind: "Audio", metadata: { source: "Assets/audio/theme.mod" } },
        { name: "confirm.wav", kind: "SFX", metadata: { source: "Assets/audio/confirm.wav" } },
        { name: "player.png", kind: "Sprite", metadata: { source: "Assets/sprites/player.png" } }
      ],
      scenas: [
        { id: "room-1", name: "room_1", width: 12, height: 8, eventBindings: { onInit: "all_commands" } },
        { id: "room-2", name: "room_2", width: 12, height: 8 }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2, spriteSheet: "player.png", animationName: "idle" },
        { id: "actor-guide", name: "Guide", roomName: "room_1", x: 4, y: 2, spriteSheet: "player.png", animationName: "idle" }
      ],
      animations: [{ id: "animation-idle", name: "idle", spriteSheet: "player.png", frameWidth: 16, frameHeight: 16 }],
      dialogues: [{ key: "intro", character: "Ana", text: "Oi", choices: ["Sim", "Nao"], textSound: "confirm.wav", confirmSound: "confirm.wav" }],
      variables: [{ name: "score" }],
      sceneRouteTables: [{
        id: "preview-routes",
        variable: "score",
        routes: [{ value: 0, scene: "room_2", x: 1, y: 1, direction: "down", fadeFrames: 0 }]
      }],
      events: [
        { id: "event-all", name: "all_commands", steps: commands.map((command) => ({ command })) },
        { id: "event-child", name: "script_child", steps: [{ command: "noop" }] }
      ],
      settings: { general: { startScene: "room_1" } }
    });
    // Interactive commands yield. Exercise cancellation before inspecting the
    // remainder of the catalog, instead of treating the modal as a no-op.
    for (let frame = 0; frame < 4000 && runtime.eventLog.filter(item => item.eventName === "all_commands").length < commands.length; ++frame) {
      if (runtime.nativeEvents.modal) runtime = dispatchPreviewRuntimeAction(runtime, "back");
      else if (runtime.activeDialogue) runtime = dispatchPreviewRuntimeAction(runtime, "action");
      runtime = tickPreviewRuntime(runtime, 1000 / 60);
    }
    const bootResults = runtime.eventLog.filter((item) => item.eventName === "all_commands");

    expect(bootResults.map((item) => item.command)).toEqual(commands);
    const unavailableVerbs = new Set([
      "launch_projectile_slot", "cancel_actor_movement", "actor_effects", "set_actor_animation_state", "open_shop", "push_actor",
      "luta_start_match", "luta_end_match", "luta_set_super_gauge", "luta_add_super_gauge", "luta_set_guard_power",
      "luta_set_ism_style", "luta_trigger_super", "luta_enable_alpha_counter", "luta_set_round_timer", "luta_set_rounds_to_win",
      "gbvm_script", "printer",
      // The carried player makes this catalog branch reachable after a topdown warp.
      "attach_platform_callback", "set_platform_state", "remove_platform_callback", "run_audio_routine"
    ]);
    expect(bootResults.filter(item => item.result === "unsupported").map(item => item.command.split(/\s+/)[0])).toEqual(
      commands.map(command => command.split(/\s+/)[0]).filter(verb => unavailableVerbs.has(verb!))
    );
    // In this sequential catalog fixture the false RTC condition skips equipment; isolated review tests cover its reachable case.
    expect(bootResults.find(item => item.command.startsWith("open_equip_menu "))?.result).toBe("skipped");
    expect(runtime.diagnostics.map((diagnostic) => diagnostic.message).filter((message) => message.includes("Comando nao suportado"))).toEqual([]);
  });

  it("executes deep preview state for variables, flags, actor, camera, HUD and inventory commands", () => {
    const runtime = createPreviewRuntime({
      assets: [{ name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } }],
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot" } }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2, spriteSheet: "hero.png", animationName: "idle" },
        { id: "actor-guide", name: "Guide", roomName: "room_1", x: 4, y: 4, spriteSheet: "hero.png", animationName: "idle" }
      ],
      animations: [
        { id: "anim-idle", name: "idle", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16 },
        { id: "anim-walk", name: "walk", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16 }
      ],
      events: [
        {
          name: "boot",
          steps: [
            { command: "set_variable score 10" },
            { command: "add_variable score 5" },
            { command: "multiply_variable score 2" },
            { command: "set_flag story.progress true" },
            { command: "add_variable_flags story.flags 1" },
            { command: "set_actor_position Guide 6 7" },
            { command: "move_actor_relative Guide 1 -2" },
            { command: "set_actor_direction Guide left" },
            { command: "set_actor_animation Guide walk" },
            { command: "set_actor_visible Guide false" },
            { command: "camera_set_position 20 30" },
            { command: "camera_move -5 10" },
            { command: "camera_set_bounds -10 -20 100 120" },
            { command: "shake_screen 12" },
            { command: "fade_out 20" },
            { command: "set_stat hp 12 16" },
            { command: "modify_stat hp -2" },
            { command: "show_hearts hp 4 4" },
            { command: "show_number_hud score 10 8 3" },
            { command: "modify_wallet wallet.gold 25 999" },
            { command: "add_item potion 2" },
            { command: "has_item potion 1" },
            { command: "set_equipped_item 0 sword" }
          ]
        }
      ],
      settings: { general: { startScene: "room_1" } }
    });
    const guide = runtime.actors.find((actor) => actor.name === "Guide");

    expect(runtime.variables.score).toBe(30);
    expect(runtime.variables["story.flags"]).toBe(1);
    expect(runtime.flags["story.progress"]).toBe(true);
    expect(guide).toMatchObject({
      x: 7,
      y: 5,
      direction: "left",
      animationName: "walk",
      visible: false
    });
    expect(runtime.camera).toMatchObject({
      x: 15,
      y: 40,
      bounds: { minX: -10, minY: -20, maxX: 100, maxY: 120 },
      shakeFrames: 12,
      fade: { mode: "out", frames: 20 }
    });
    expect(runtime.stats.hp).toEqual({ value: 10, max: 16 });
    expect(runtime.hud.hearts).toEqual({ stat: "hp", x: 4, y: 4 });
    expect(runtime.hud.numbers.score).toEqual({ variable: "score", x: 10, y: 8, digits: 3 });
    expect(runtime.wallet["wallet.gold"]).toEqual({ value: 25, max: 999 });
    expect(runtime.inventory.potion).toBe(2);
    expect(runtime.equippedItems["0"]).toBe("sword");
    expect(runtime.eventLog.at(-1)).toMatchObject({
      command: "set_equipped_item 0 sword",
      result: "script"
    });
    expect(runtime.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([]);
    expect(runtime.debug.lines).toEqual(expect.arrayContaining([
      "Variables 2",
      "Flags 1",
      "Inventory 1",
      "HUD 2",
      "Camera 15,40"
    ]));
  });

  it("applies and expires visual effects using the same frame duration as the ROM contract", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-1",
        name: "room_1",
        width: 16,
        height: 12,
        playerActorName: "Player",
        eventBindings: { onInit: "boot" }
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [{
        name: "boot",
        steps: [{ command: "visual_effect palette_flash bg0 18 70" }]
      }],
      settings: { general: { startScene: "room_1" }, topdown: { walkSpeed: 4 } }
    });

    expect(runtime.visualEffect).toEqual({
      effect: "palette_flash",
      layer: "bg0",
      durationFrames: 18,
      remainingFrames: 18,
      intensity: 70,
      elapsedMs: 0
    });

    const halfway = tickPreviewRuntime(runtime, 150, "right");
    expect(halfway.player).toMatchObject({ x: 3, y: 2 });
    expect(halfway.visualEffect).toMatchObject({ remainingFrames: 9 });
    expect(tickPreviewRuntime(halfway, 150).visualEffect).toBeNull();
  });

  it("evaluates variable and flag conditions while tracing skipped commands", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot" } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [
        {
          name: "boot",
          steps: [
            { command: "set_variable score 5" },
            { command: "if_variable score 5" },
            { command: "set_variable branch.true 1" },
            { command: "if_variable score 9" },
            { command: "set_variable branch.false 1" },
            { command: "set_flag story.progress true" },
            { command: "if_flag story.progress true" },
            { command: "set_variable flag.true 1" },
            { command: "if_flag story.locked true" },
            { command: "set_variable flag.false 1" }
          ]
        }
      ],
      settings: { general: { startScene: "room_1" } }
    });

    expect(runtime.variables["branch.true"]).toBe(1);
    expect(runtime.variables["flag.true"]).toBe(1);
    expect(runtime.variables["branch.false"]).toBeUndefined();
    expect(runtime.variables["flag.false"]).toBeUndefined();
    expect(runtime.eventLog.map((item) => `${item.command}:${item.result}:${item.detail ?? ""}`)).toContain(
      "set_variable branch.false 1:skipped:Condicao falsa em if_variable score 9."
    );
    expect(runtime.executionTrace.map((item) => `${item.status}:${item.command}:${item.detail ?? ""}`)).toEqual(expect.arrayContaining([
      "executed:if_variable score 5:true",
      "skipped:set_variable branch.false 1:Condicao falsa em if_variable score 9.",
      "executed:if_flag story.progress true:true",
      "skipped:set_variable flag.false 1:Condicao falsa em if_flag story.locked true."
    ]));
    expect(runtime.debug.lines).toContain("Trace 10");
  });

  it("executes if/else branches in preview without call_event hacks", () => {
    const trueBranch = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot" } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [
        {
          name: "boot",
          steps: [
            { command: "set_variable score 10" },
            { command: "if_variable score 10" },
            { command: "set_variable route 1" },
            { command: "else" },
            { command: "set_variable route 2" }
          ]
        }
      ],
      settings: { general: { startScene: "room_1" } }
    });

    expect(trueBranch.variables.route).toBe(1);

    const falseBranch = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot_false" } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [
        {
          name: "boot_false",
          steps: [
            { command: "set_variable score 0" },
            { command: "if_variable score 10" },
            { command: "set_variable route 1" },
            { command: "else" },
            { command: "set_variable route 2" }
          ]
        }
      ],
      settings: { general: { startScene: "room_1" } }
    });

    expect(falseBranch.variables.route).toBe(2);
    expect(falseBranch.executionTrace.map((item) => `${item.status}:${item.command}`)).toEqual(expect.arrayContaining([
      "skipped:set_variable route 1",
      "executed:set_variable route 2"
    ]));
  });

  it("executes nested structured conditions with their own else and end markers", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot" } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [{
        name: "boot",
        steps: [
          { command: "set_variable score 1" },
          { command: "if_variable score 1" },
          { command: "set_variable outer 1" },
          { command: "if_variable lives 1" },
          { command: "set_variable inner_true 1" },
          { command: "else" },
          { command: "set_variable inner_false 1" },
          { command: "condition_end" },
          { command: "else" },
          { command: "set_variable outer_false 1" },
          { command: "condition_end" }
        ]
      }],
      settings: { general: { startScene: "room_1" } }
    });

    expect(runtime.variables).toMatchObject({ outer: 1, inner_false: 1 });
    expect(runtime.variables.inner_true).toBeUndefined();
    expect(runtime.variables.outer_false).toBeUndefined();
  });

  it("runs rate-limited actor updates only on the configured preview frame", () => {
    const project = {
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12 }],
      actors: [{
        id: "actor-guide",
        name: "Guide",
        roomName: "room_1",
        x: 2,
        y: 2,
        eventBindings: { onUpdate: "guide_tick" }
      }],
      events: [{
        name: "guide_tick",
        steps: [
          { command: "rate_limit 30 2" },
          { command: "add_variable tick 1" },
          { command: "rate_limit_end" }
        ]
      }],
      settings: { general: { startScene: "room_1" } }
    };
    let runtime = createPreviewRuntime(project);

    runtime = tickPreviewRuntime(runtime, 29 * (1000 / 60));
    expect(runtime.variables.tick).toBeUndefined();

    runtime = tickPreviewRuntime(runtime, 1000 / 60);
    expect(runtime.variables.tick).toBe(1);
  });

  it("dispatches switch_variable to the matching case event in preview", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot" } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [
        {
          name: "boot",
          steps: [
            { command: "set_variable route 1" },
            { command: "switch_variable route 0 route_zero 1 route_one" }
          ]
        },
        { name: "route_zero", steps: [{ command: "set_variable picked 0" }] },
        { name: "route_one", steps: [{ command: "set_variable picked 1" }] }
      ],
      settings: { general: { startScene: "room_1" } }
    });

    expect(runtime.variables.picked).toBe(1);
    expect(runtime.variables.route).toBe(1);
  });

  it("runs repeat_expression until the condition fails or max iterations is reached", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot" } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [
        {
          name: "boot",
          steps: [
            { command: "set_variable counter 0" },
            { command: "repeat_expression counter lt 3 tick 5" }
          ]
        },
        {
          name: "tick",
          steps: [{ command: "add_variable counter 1" }]
        }
      ],
      settings: { general: { startScene: "room_1" } }
    });

    expect(runtime.variables.counter).toBe(3);
    expect(runtime.eventLog.filter((item) => item.command.startsWith("repeat_expression")).map((item) => item.result)).toContain("script");
  });

  it("stops the current event when stop_event is reached", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot" } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [
        {
          name: "boot",
          steps: [
            { command: "set_variable reached 1" },
            { command: "stop_event" },
            { command: "set_variable reached 2" }
          ]
        }
      ],
      settings: { general: { startScene: "room_1" } }
    });

    expect(runtime.variables.reached).toBe(1);
    expect(runtime.eventLog.some((item) => item.command === "stop_event" && item.result === "script")).toBe(true);
    expect(runtime.variables["reached"]).toBe(1);
  });

  it("uses has_item as a branch condition backed by runtime inventory", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot" } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [
        {
          name: "boot",
          steps: [
            { command: "add_item chest_key 1" },
            { command: "has_item chest_key 1" },
            { command: "set_variable chest.open true" },
            { command: "has_item chest_key 2" },
            { command: "set_variable chest.bonus true" }
          ]
        }
      ],
      settings: { general: { startScene: "room_1" } }
    });

    expect(runtime.inventory.chest_key).toBe(1);
    expect(runtime.variables["chest.open"]).toBe(true);
    expect(runtime.variables["chest.bonus"]).toBeUndefined();
    expect(runtime.executionTrace.map((item) => `${item.status}:${item.command}:${item.detail ?? ""}`)).toEqual(expect.arrayContaining([
      "executed:has_item chest_key 1:true",
      "skipped:set_variable chest.bonus true:Condicao falsa em has_item chest_key 2."
    ]));
  });

  it("persists inventory and wallet across save_game and load_game in preview", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot" } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [{
        name: "boot",
        steps: [
          { command: "add_item potion 2" },
          { command: "modify_wallet wallet.gold 25 999" },
          { command: "save_game 0" },
          { command: "add_item potion 5" },
          { command: "modify_wallet wallet.gold 10 999" },
          { command: "load_game 0" }
        ]
      }],
      settings: { general: { startScene: "room_1" } }
    });

    expect(runtime.inventory.potion).toBe(2);
    expect(runtime.wallet["wallet.gold"]).toEqual({ value: 25, max: 999 });
    expect(runtime.saveSlots[0]).toMatchObject({
      inventory: { potion: 2 },
      wallet: { "wallet.gold": { value: 25, max: 999 } }
    });
    expect(runtime.saveSlots[0]).toMatchObject({
      schema: 4,
      sequence: 1,
      timestampFrames: 0,
      title: "room_1"
    });
  });

  it("respeita a capability universal e o limite de slots no preview", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot" } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [{
        name: "boot",
        steps: [
          { command: "save_game 0" },
          { command: "save_game 1" },
          { command: "load_game 1" },
          { command: "remove_save_game 1" }
        ]
      }],
      settings: {
        general: { startScene: "room_1" },
        save: { saveType: "sram", slots: 1, manualSave: true, autoSave: false }
      }
    });

    expect(runtime.saveSlots[0]).toBeDefined();
    expect(runtime.saveSlots[1]).toBeUndefined();
    expect(runtime.executionTrace.map((item) => `${item.status}:${item.command}`)).toEqual(expect.arrayContaining([
      "skipped:save_game 1",
      "skipped:load_game 1",
      "skipped:remove_save_game 1"
    ]));

    const disabled = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot" } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [{ name: "boot", steps: [{ command: "save_game 0" }] }],
      settings: {
        general: { startScene: "room_1" },
        save: { saveType: "none", manualSave: false, autoSave: false }
      }
    });
    expect(disabled.runtimeCapabilities.capabilities.find((item) => item.id === "save")?.enabled).toBe(false);
    expect(disabled.saveSlots).toEqual({});
  });

  it("switches the dialogue language and restores it from save_game", () => {
    let runtime = createPreviewRuntime({
      localization: { sourceLocale: "en", defaultLocale: "pt-BR", enabledLocales: ["pt-BR", "en", "es"] },
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12 }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      dialogues: [{ key: "hello", text: "Hello", translations: { "pt-BR": "Ola", es: "Hola" } }],
      events: [
        { name: "spanish", steps: [{ command: "set_language es" }, { command: "save_game 0" }] },
        { name: "english", steps: [{ command: "set_language en" }] },
        { name: "restore", steps: [{ command: "load_game 0" }, { command: "show_dialogue hello" }] }
      ],
      settings: { general: { startScene: "room_1" } }
    });

    runtime = runPreviewRuntimeEvent(runtime, "spanish");
    runtime = runPreviewRuntimeEvent(runtime, "english");
    runtime = runPreviewRuntimeEvent(runtime, "restore");
    expect(runtime.dialogueLocale).toBe("es");
    expect(runtime.activeDialogue?.text).toBe("Hola");
  });

  it("applies audio bus mute, volume, fades and PCM playback options in preview", () => {
    let runtime = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "mix" } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [{
        name: "mix",
        steps: [
          { command: "mute_audio_channel music true" },
          { command: "set_audio_volume sfx 80" },
          { command: "fade_audio_volume pcm_music 25 2" },
          { command: "play_sfx confirm.wav 60 12" }
        ]
      }],
      audioItems: [{ name: "confirm.wav", kind: "SFX", format: "WAV" }],
      settings: { general: { startScene: "room_1" } }
    });

    expect(runtime.audioMix.muted.music).toBe(true);
    expect(runtime.audioMix.volumes.sfx).toBe(12);
    expect(runtime.audioMix.fades.pcm_music).toMatchObject({ target: 4, remainingFrames: 2 });
    expect(runtime.audioMix.lastPcmSfx).toEqual({ volume: 9, priority: 12 });
    runtime = tickPreviewRuntime(runtime, 1000 / 60);
    expect(runtime.audioMix.volumes.pcm_music).toBe(10);
    runtime = tickPreviewRuntime(runtime, 1000 / 60);
    expect(runtime.audioMix.volumes.pcm_music).toBe(4);
    expect(runtime.audioMix.fades.pcm_music).toBeNull();
  });

  it("restores inventory and variables after simulated reboot via load_game", () => {
    const rooms = [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot_save" } }];
    const actors = [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }];
    const saved = createPreviewRuntime({
      scenas: rooms,
      actors,
      events: [{
        name: "boot_save",
        steps: [
          { command: "add_item potion 2" },
          { command: "modify_wallet wallet.gold 25 999" },
          { command: "set_variable quest.done true" },
          { command: "save_game 0" },
          { command: "add_item potion 5" },
          { command: "set_variable quest.done false" }
        ]
      }],
      settings: { general: { startScene: "room_1" } }
    });

    expect(saved.inventory.potion).toBe(7);
    expect(saved.variables["quest.done"]).toBe(false);

    const rebooted = rebootPreviewRuntimePreservingSaves({
      ...saved,
      project: {
        scenas: [{ ...rooms[0], eventBindings: { onInit: "boot_load" } }],
        actors,
        events: [{
          name: "boot_load",
          steps: [{ command: "load_game 0" }]
        }],
        settings: { general: { startScene: "room_1" } }
      }
    });

    expect(rebooted.inventory.potion).toBe(2);
    expect(rebooted.wallet["wallet.gold"]).toEqual({ value: 25, max: 999 });
    expect(rebooted.variables["quest.done"]).toBe(true);
    expect(rebooted.saveSlots[0]).toMatchObject({
      inventory: { potion: 2 },
      wallet: { "wallet.gold": { value: 25, max: 999 } },
      variables: { "quest.done": true }
    });
  });

  it("restores runtime, room, player and camera from a universal preview save", () => {
    const project = {
      scenas: [
        { id: "room-town", name: "town", sceneType: "topdown", width: 16, height: 12 },
        { id: "room-cave", name: "cave", sceneType: "isometric", width: 20, height: 14 }
      ],
      actors: [
        { id: "player-town", name: "Player", roomName: "town", x: 2, y: 3 },
        { id: "player-cave", name: "Player", roomName: "cave", x: 7, y: 8 }
      ],
      events: [
        { name: "save_now", steps: [{ command: "save_game 0" }] },
        { name: "go_cave", steps: [{ command: "change_scene cave" }] },
        { name: "load_now", steps: [{ command: "load_game 0" }] }
      ],
      settings: { general: { startScene: "town" } }
    };
    let runtime = createPreviewRuntime(project);
    runtime = {
      ...runtime,
      player: runtime.player ? { ...runtime.player, x: 41, y: 57 } : null,
      camera: { ...runtime.camera, x: 13, y: 29, followPlayer: false }
    };
    runtime = runPreviewRuntimeEvent(runtime, "save_now");
    runtime = runPreviewRuntimeEvent(runtime, "go_cave");
    runtime = {
      ...runtime,
      camera: { ...runtime.camera, x: 99, y: 101 }
    };
    runtime = runPreviewRuntimeEvent(runtime, "load_now");

    expect(runtime.currentRoom?.name).toBe("town");
    expect(runtime.runtimeProfile.sceneType).toBe("topdown");
    expect(runtime.player).toMatchObject({ x: 41, y: 57 });
    expect(runtime.camera).toMatchObject({ x: 13, y: 29, followPlayer: false });
    expect(runtime.saveSlots[0]).toMatchObject({
      runtime: "topdown",
      roomName: "town",
      player: { x: 41, y: 57 },
      camera: { x: 13, y: 29 }
    });
  });

  it("clears save slots with remove_save_game and gates with if_save_game", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot" } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [{
        name: "boot",
        steps: [
          { command: "add_item potion 1" },
          { command: "save_game 1" },
          { command: "if_save_game 1" },
          { command: "set_variable save.present true" },
          { command: "remove_save_game 1" },
          { command: "if_save_game 1" },
          { command: "set_variable save.after_remove true" }
        ]
      }],
      settings: { general: { startScene: "room_1" } }
    });

    expect(runtime.variables["save.present"]).toBe(true);
    expect(runtime.variables["save.after_remove"]).toBeUndefined();
    expect(runtime.saveSlots[1]).toBeUndefined();
    expect(runtime.executionTrace.map((item) => `${item.status}:${item.command}:${item.detail ?? ""}`)).toEqual(expect.arrayContaining([
      "executed:if_save_game 1:true",
      "skipped:set_variable save.after_remove true:Condicao falsa em if_save_game 1."
    ]));
  });

  it("dispatches the selected choice event and records the execution trace", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 16, height: 12, eventBindings: { onInit: "boot" } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      dialogues: [{ key: "shop_dialogue", character: "Merchant", text: "Comprar?", choices: ["Comprar", "Sair"] }],
      events: [
        {
          name: "boot",
          steps: [
            { command: "show_choice shop_dialogue" },
            { command: "choice_event shop_dialogue 0 buy_event" },
            { command: "choice_event shop_dialogue 1 leave_event" }
          ]
        },
        { name: "buy_event", steps: [{ command: "set_variable selected buy" }] },
        { name: "leave_event", steps: [{ command: "set_variable selected leave" }] }
      ],
      settings: { general: { startScene: "room_1" } }
    });

    const selectedLeave = dispatchPreviewRuntimeAction(dispatchPreviewRuntimeAction(runtime, "down"), "action");

    expect(selectedLeave.activeDialogue).toBeNull();
    expect(selectedLeave.variables.selected).toBe("leave");
    expect(selectedLeave.choiceEvents).toContainEqual({
      dialogueKey: "shop_dialogue",
      choiceIndex: 1,
      eventName: "leave_event"
    });
    expect(selectedLeave.executionTrace.map((item) => `${item.status}:${item.eventName}:${item.command}:${item.detail ?? ""}`)).toEqual(expect.arrayContaining([
      "executed:boot:choice_event shop_dialogue 1 leave_event:shop_dialogue[1] -> leave_event",
      "executed:shop_dialogue:choice 1:leave_event",
      "executed:leave_event:set_variable selected leave:selected leave"
    ]));
  });

  it("exposes the active room scene type as a runtime profile", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        { id: "room-platformer", name: "vertical_climb", width: 20, height: 18, sceneType: "platformer" }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "vertical_climb", x: 3, y: 14 }],
      settings: { general: { startScene: "vertical_climb" } }
    });

    expect(runtime.currentRoom).toMatchObject({
      name: "vertical_climb",
      sceneType: "platformer",
      sceneTypeLabel: "Plataforma"
    });
    expect(runtime.runtimeProfile).toEqual({
      sceneType: "platformer",
      label: "Plataforma",
      movement: "side_scroll",
      projection: "orthographic",
      exportStatus: "native",
      capabilities: ["tile_collision", "actor_interaction", "trigger_overlap", "gravity_preview", "affine_background_preview"],
      preflightProfileId: "platformer",
      preflightLayerIds: ["background", "obstacles", "collision", "actors"]
    });
    expect(runtime.debug.lines).toContain("Scene type Plataforma");
    expect(runtime.debug.lines).toContain("Runtime profile platformer");
  });

  it("applies the explicit scene composition to the preview render profile", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-shmup",
        name: "arena",
        width: 30,
        height: 20,
        sceneType: "shmup",
        runtime: {
          type: "shmup",
          config: {
            composition: {
              enabled: true,
              mode: "bitmap4",
              layers: [],
              effects: {}
            }
          }
        }
      }],
      settings: { general: { startScene: "arena" } }
    });

    expect(runtime.currentRoom?.composition).toMatchObject({ enabled: true, mode: "bitmap4" });
    expect(runtime.currentRoom?.renderLayers.videoMode).toBe(4);
    expect(runtime.currentRoom?.renderLayers.videoModeLabel).toContain("Modo 4");
  });

  it("exposes the SHMUP planes and keeps Affine disabled without explicit opt-in", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-shmup",
        name: "horizontal",
        width: 90,
        height: 20,
        sceneType: "shmup",
        runtime: {
          type: "shmup",
          config: {
            composition: {
              enabled: true,
              mode: "affine",
              layers: [{
                id: "background",
                kind: "affine_bg",
                role: "decorative",
                layer: "BG2",
                enabled: true,
                assetId: "day-bg.png"
              }]
            }
          }
        }
      }],
      settings: { general: { startScene: "horizontal" } }
    });

    expect(runtime.currentRoom?.shmupComposition).toMatchObject({
      profile: "shmup",
      viewport: { widthPixels: 240, heightPixels: 160 },
      world: { widthPixels: 720, heightPixels: 160, widthTiles: 90, heightTiles: 20 },
      video: { mode: "mode1", affine: null },
      planes: {
        hud: { layer: "BG0", fixed: true },
        actors: { layer: "OBJ", playerSizePixels: { x: 32, y: 32 } },
        obstacles: { visualLayer: "BG1", collisionSource: "scene_data", collisionEnabled: true }
      }
    });
    expect(runtime.currentRoom?.shmupCompositionIssues).toEqual([
      "Background Affine no SHMUP exige a capability affine_background habilitada explicitamente."
    ]);
  });

  it("exposes the explicit SHMUP planes and affine world contract to Play", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-shmup-affine",
        name: "day_shmup",
        width: 90,
        height: 20,
        sceneType: "shmup",
        runtime: {
          type: "shmup",
          config: {
            capabilities: [{ id: "affine_background", enabled: true, settings: {} }],
            composition: {
              enabled: true,
              mode: "affine",
              layers: [{
                id: "day-background",
                kind: "affine_bg",
                role: "decorative",
                layer: "BG2",
                enabled: true,
                assetId: "day-shmup-bg.png"
              }],
              effects: {}
            }
          }
        }
      }],
      settings: { general: { startScene: "day_shmup" } }
    });

    expect(runtime.currentRoom?.shmupComposition).toMatchObject({
      profile: "shmup",
      viewport: { widthPixels: 240, heightPixels: 160 },
      world: { widthPixels: 720, heightPixels: 160, widthTiles: 90, heightTiles: 20 },
      video: { mode: "mode1", affine: { assetId: "day-shmup-bg.png", bpp: 8 } },
      planes: {
        hud: { layer: "BG0", fixed: true },
        actors: { layer: "OBJ", playerSizePixels: { x: 32, y: 32 } },
        obstacles: { visualLayer: "BG1", collisionSource: "scene_data", collisionEnabled: true }
      }
    });
    expect(runtime.currentRoom?.shmupCompositionIssues).toEqual([]);
  });

  it("syncs the runtime profile when the current room scene type changes", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        { id: "room-overworld", name: "overworld", width: 20, height: 18, sceneType: "topdown" }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "overworld", x: 4, y: 5 }],
      settings: { general: { startScene: "overworld" } }
    });

    const synced = syncPreviewRuntimeProject(runtime, {
      ...runtime.project,
      scenas: [
        { id: "room-overworld", name: "overworld", width: 20, height: 18, sceneType: "isometric" }
      ]
    });

    expect(synced.currentRoom).toMatchObject({
      name: "overworld",
      sceneType: "isometric",
      sceneTypeLabel: "Isométrico"
    });
    expect(synced.runtimeProfile).toMatchObject({
      sceneType: "isometric",
      movement: "eight_way_diagonal",
      projection: "isometric",
      exportStatus: "native"
    });
    expect(synced.debug.lines).toContain("Runtime profile isometric");
  });

  it("resolves the isometric grid from project settings and room overrides", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-iso",
        name: "market",
        width: 8,
        height: 8,
        sceneType: "isometric",
        runtime: { type: "isometric", config: { tileWidth: 32, originY: 24 } }
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "market", x: 2, y: 2 }],
      settings: {
        general: { startScene: "market" },
        isometric: { tileWidth: "16 px", tileHeight: "8 px" }
      }
    });

    expect(runtime.currentRoom?.runtime).toEqual({
      type: "isometric",
      config: {
        tileWidth: 32,
        tileHeight: 16,
        heightStep: 8,
        originX: 120,
        originY: 24,
        presentationZoom: 100,
        gameplayMode: "adventure",
        profile: "diamond-2to1",
        projection: "diamond",
        movement: "free",
        heightMode: "levels",
        worldMode: "scrollable_tiled_world"
      }
    });
  });

  it("executa o núcleo tático em uma cena isométrica separada no Preview", () => {
    let runtime = createPreviewRuntime({
      scenas: [{
        id: "room-tactical",
        name: "arena_tatica",
        width: 12,
        height: 8,
        heightLevels: Array.from({ length: 96 }, (_, index) => index === 38 ? 1 : 0),
        sceneType: "isometric",
        runtime: {
          type: "isometric",
          config: {
            gameplayMode: "tactical",
            tactical: {
              enabled: true,
              activeTeam: "player",
              units: [
                { actorIndex: 0, team: "player", moveRange: 3, attackRange: 2, maxHp: 5, attackPower: 2 },
                { actorIndex: 1, team: "enemy", moveRange: 2, attackRange: 2, maxHp: 4, attackPower: 1 }
              ]
            },
            tacticalPresentation: {
              surfacePages: [
                { id: "r0c0", asset: "page-00.png", bankGroup: "page-00", world: { x: 0, y: 0, width: 240, height: 160 } },
                { id: "r0c1", asset: "page-01.png", bankGroup: "page-01", world: { x: 240, y: 0, width: 240, height: 160 } },
                { id: "r1c0", asset: "page-10.png", bankGroup: "page-10", world: { x: 0, y: 160, width: 240, height: 160 } },
                { id: "r1c1", asset: "page-11.png", bankGroup: "page-11", world: { x: 240, y: 160, width: 240, height: 160 } }
              ],
              units: [],
              props: []
            }
          }
        }
      }],
      actors: [
        { id: "actor-tactical-player", name: "Player", roomName: "arena_tatica", x: 2, y: 2, z: 0 },
        { id: "actor-tactical-enemy", name: "Sentinela", roomName: "arena_tatica", x: 4, y: 2, z: 0 }
      ],
      settings: { general: { startScene: "arena_tatica" } }
    });

    expect(runtime.isometricTactical).toMatchObject({
      enabled: true,
      phase: "select",
      activeTeam: "player",
      activeUnitIndex: 0,
      cursor: { x: 2, y: 2, z: 0 }
    });
    expect(runtime.camera).toMatchObject({
      bounds: { minX: 0, minY: 0, maxX: 480, maxY: 320 },
      x: 0,
      y: 0
    });

    runtime = dispatchPreviewRuntimeAction(runtime, "left");
    expect(runtime.isometricTactical.cursor).toEqual({ x: 2, y: 3, z: 1 });
    runtime = dispatchPreviewRuntimeAction(runtime, "right");
    expect(runtime.isometricTactical.cursor).toEqual({ x: 3, y: 3, z: 0 });
    runtime = dispatchPreviewRuntimeAction(runtime, "up");
    expect(runtime.isometricTactical.cursor).toEqual({ x: 3, y: 2, z: 0 });
    runtime = dispatchPreviewRuntimeAction(runtime, "down");
    expect(runtime.isometricTactical.cursor).toEqual({ x: 2, y: 2, z: 0 });

    runtime = dispatchPreviewRuntimeAction(runtime, "action");
    expect(runtime.isometricTactical.phase).toBe("target");
    runtime = dispatchPreviewRuntimeAction(runtime, "right");
    runtime = dispatchPreviewRuntimeAction(runtime, "right");
    runtime = dispatchPreviewRuntimeAction(runtime, "action");
    expect(runtime.actors.find((actor) => actor.id === "actor-tactical-enemy")?.visible).toBe(true);
    expect(runtime.isometricTactical.turnNumber).toBe(2);
    expect(runtime.debug.lines).toContain("Tactical turn 2 enemy:select");
  });

  it("consome a apresentação tática opt-in e mantém assets, camadas e eventos separados", () => {
    let runtime = createPreviewRuntime({
      scenas: [{
        id: "room-tactical-presentation",
        name: "arena_apresentacao",
        width: 12,
        height: 8,
        sceneType: "isometric",
        runtime: {
          type: "isometric",
          config: {
            gameplayMode: "tactical",
            tacticalCapabilities: [
              { id: "tactical_units", enabled: true, settings: {} },
              { id: "tactical_feedback", enabled: true, settings: {} },
              { id: "tactical_audio", enabled: true, settings: {} }
            ],
            tacticalPresentation: {
              schema: 1,
              units: [{ actorId: "actor-tactical-player", sheet: "nara-tactical.png" }],
              props: [],
              cursorAsset: "cursor-tactical.png",
              rangeAsset: "range-tactical.png",
              targetAsset: "target-tactical.png",
              emotesAsset: "emotes-tactical.png",
              feedbackAsset: "feedback-tactical.png",
              audio: {
                music: "farol_arena_tatica",
                cues: {
                  cursor: "tactical_cursor",
                  select: "tactical_select",
                  cancel: "tactical_cancel",
                  move: "tactical_move",
                  attack: "tactical_attack",
                  hit: "tactical_hit",
                  turn: "tactical_turn",
                  victory: "tactical_victory",
                  defeat: "tactical_defeat"
                }
              }
            },
            tactical: {
              enabled: true,
              activeTeam: "player",
              units: [
                { actorIndex: 0, team: "player", moveRange: 3, attackRange: 2, maxHp: 5, attackPower: 2 },
                { actorIndex: 1, team: "enemy", moveRange: 2, attackRange: 2, maxHp: 4, attackPower: 1 }
              ]
            }
          }
        }
      }],
      actors: [
        { id: "actor-tactical-player", name: "Player", roomName: "arena_apresentacao", x: 2, y: 2, z: 0 },
        { id: "actor-tactical-enemy", name: "Sentinela", roomName: "arena_apresentacao", x: 4, y: 2, z: 0 }
      ],
      assets: [
        ...[
          ["nara-tactical.png", "Sprite"],
          ["cursor-tactical.png", "Sprite"],
          ["range-tactical.png", "Sprite"],
          ["target-tactical.png", "Sprite"],
          ["emotes-tactical.png", "Sprite"],
          ["feedback-tactical.png", "Sprite"]
        ].map(([name, kind]) => ({ name, kind, metadata: { source: `Assets/${name}` } })),
        { name: "farol_arena_tatica", kind: "Música" },
        ...[
          "tactical_cursor", "tactical_select", "tactical_cancel", "tactical_move",
          "tactical_attack", "tactical_hit", "tactical_turn", "tactical_victory", "tactical_defeat"
        ].map((name) => ({ name, kind: "SFX" }))
      ],
      settings: { general: { startScene: "arena_apresentacao" } }
    });

    expect(runtime.isometricTacticalPresentation).toMatchObject({
      capabilities: ["tactical_units", "tactical_feedback", "tactical_audio"],
      layers: { surface: null, grid: null, hud: null, objects: "OBJ", collision: "scene_data" },
      units: [{ actorIndex: 0, sheet: "nara-tactical.png", asset: { name: "nara-tactical.png" } }],
      feedback: {
        cursor: { name: "cursor-tactical.png" },
        range: { name: "range-tactical.png" },
        target: { name: "target-tactical.png" }
      },
      audio: { music: "farol_arena_tatica", cues: { select: "tactical_select" } }
    });
    expect(runtime.runtimeProfile.capabilities).toEqual(expect.arrayContaining([
      "isometric_runtime.tactical_unit_states",
      "isometric_runtime.tactical_feedback",
      "isometric_runtime.tactical_audio_cues"
    ]));

    runtime = dispatchPreviewRuntimeAction(runtime, "action");
    expect(runtime.isometricTactical.lastVisualEvents).toEqual([
      { kind: "select", tile: { x: 2, y: 2, z: 0 }, actorIndex: 0 }
    ]);
    expect(runtime.isometricTactical.lastAudioCues).toEqual(["select"]);
    expect(runtime.activeSfx).toBe("tactical_select");
  });

  it("normalizes a four-direction isometric set and keeps its matching idle pose", () => {
    const runtime = createPreviewRuntime(buildFunctionalIsometricProject());

    const walking = tickPreviewRuntime(runtime, 200, "right");
    expect(walking.player).toMatchObject({
      x: 2.75,
      y: 2,
      z: 0,
      direction: "down-right",
      animationName: "idle_down_right"
    });

    const idle = tickPreviewRuntime(walking, 0, null);
    expect(idle.player).toMatchObject({
      direction: "down-right",
      animationName: "idle_down_right"
    });
  });

  it("returns an isometric player to idle when collision blocks movement", () => {
    const project = setRoomCollisionCellInProject(
      buildFunctionalIsometricProject(),
      "room-market",
      (2 * 30) + 3,
      true
    );
    const runtime = createPreviewRuntime(project);

    const blocked = tickPreviewRuntime(runtime, 400, "right");

    expect(blocked.player).toMatchObject({
      y: 2,
      direction: "down-right",
      animationName: "idle_down_right"
    });
    expect(blocked.player?.x).toBeCloseTo(2.9375);
  });

  it("marks point-and-click and shmup rooms as native export profiles", () => {
    const pointClick = createPreviewRuntime({
      scenas: [
        { id: "room-pc", name: "office", width: 20, height: 16, sceneType: "pointAndClick" }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "office", x: 7, y: 5 }],
      settings: { general: { startScene: "office" } }
    });
    const shmup = createPreviewRuntime({
      scenas: [
        { id: "room-shmup", name: "wave_1", width: 30, height: 20, sceneType: "shmup" }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "wave_1", x: 7, y: 12 }],
      settings: { general: { startScene: "wave_1" } }
    });

    expect(pointClick.runtimeProfile).toMatchObject({
      sceneType: "pointAndClick",
      movement: "pointer",
      exportStatus: "native"
    });
    expect(shmup.runtimeProfile).toMatchObject({
      sceneType: "shmup",
      exportStatus: "native"
    });
    expect(pointClick.debug.lines).toContain("Runtime profile pointAndClick");
    expect(shmup.debug.lines).toContain("Runtime profile shmup");
  });

  it("plays a complete cursor click even away from hotspots and returns to its fixed idle", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room", name: "room", width: 30, height: 20, sceneType: "pointAndClick" }],
      actors: [{ id: "player", name: "Player", roomName: "room", x: 3, y: 3, spriteSheet: "hand.png", animationStateID: "hand", animationName: "idle" }],
      animations: [
        { id: "idle", name: "idle", state: "idle", spriteSheet: "hand.png", fps: 1, frames: [{}] },
        { id: "click", name: "click", state: "attack", spriteSheet: "hand.png", fps: 12, loops: false, frames: [{}, {}, {}, {}] }
      ],
      animationStates: [{ id: "hand", name: "Hand", spriteSheet: "hand.png", animationType: "cursor", animationIDs: ["idle", "click"] }]
    });
    const clicked = dispatchPreviewRuntimeAction(runtime, "action");
    expect(clicked.player?.animationName).toBe("click");
    expect(clicked.playerAnimationFrameIndex).toBe(0);
    const advanced = tickPreviewRuntime(clicked, 90, "right");
    expect(advanced.player?.animationName).toBe("click");
    expect(advanced.playerAnimationFrameIndex).toBe(1);
    const finished = tickPreviewRuntime(advanced, 250);
    expect(finished.player?.animationName).toBe("idle");
    expect(finished.playerAnimationFrameIndex).toBe(0);
    expect(tickPreviewRuntime(finished, 3000).playerAnimationFrameIndex).toBe(0);
  });

  it("moves a point-and-click cursor without firing a hotspot until action is pressed", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-pc",
        name: "office",
        width: 12,
        height: 8,
        sceneType: "pointAndClick",
        runtime: { type: "pointAndClick", config: { cursorSpeed: 4, hotspotPadding: 2 } }
      }],
      actors: [{
        id: "actor-player",
        name: "Player",
        roomName: "office",
        x: 3,
        y: 3,
        spriteSheet: "cursor.png",
        animationStateID: "state-cursor",
        animationName: "idle"
      }],
      animations: [
        { id: "animation-cursor-idle", name: "idle", state: "idle", spriteSheet: "cursor.png", frames: [{}] },
        { id: "animation-cursor-hover", name: "hover", state: "hover", spriteSheet: "cursor.png", frames: [{}] }
      ],
      animationStates: [{
        id: "state-cursor",
        name: "Cursor point-and-click",
        spriteSheet: "cursor.png",
        animationType: "cursor",
        mirrorLeftFromRight: false,
        animationIDs: ["animation-cursor-idle", "animation-cursor-hover"]
      }],
      triggers: [{
        id: "trigger-door",
        name: "Door",
        roomName: "office",
        x: 4,
        y: 3,
        width: 1,
        height: 1,
        eventBindings: { onInteract: "door_use" }
      }],
      events: [{ id: "event-door", name: "door_use", steps: [{ command: "show_dialogue intro" }] }],
      dialogues: [{ id: "dialogue-intro", key: "intro", text: "Door selected" }]
    });

    const beforeThreshold = tickPreviewRuntime(runtime, previewPlayerMovementStepMs(4) - 1, "right");
    expect(beforeThreshold.player).toMatchObject({ x: 3, y: 3 });

    const hovered = tickPreviewRuntime(runtime, previewPlayerMovementStepMs(4), "right");
    expect(hovered.player).toMatchObject({ x: 4, y: 3 });
    expect(hovered.player?.animationName).toBe("hover");
    expect(hovered.overlappingTriggerIDs).toEqual(["trigger-door"]);
    expect(hovered.activeDialogue).toBeNull();

    const activated = dispatchPreviewRuntimeAction(hovered, "action");
    expect(activated.activeDialogue).toMatchObject({ key: "intro", text: "Door selected" });
  });

  it("uses the current shmup room playerSpeed for held movement", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-shmup",
        name: "wave_1",
        width: 20,
        height: 18,
        sceneType: "shmup",
        runtime: { type: "shmup", config: { playerSpeed: 4, fireCooldown: 6, scrollSpeed: 2 } }
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "wave_1", x: 3, y: 3 }]
    });

    expect(tickPreviewRuntime(runtime, previewPlayerMovementStepMs(4) - 1, "right").player).toMatchObject({ x: 3, y: 3 });
    expect(tickPreviewRuntime(runtime, previewPlayerMovementStepMs(4), "right").player).toMatchObject({ x: 4, y: 3 });
  });

  it("boots the technical P0 fixture and runs dialogue, actor action and trigger events in-app", () => {
    const runtime = createPreviewRuntime(buildFunctionalP0ProjectWithPortraitAsset());

    expect(runtime.ready).toBe(true);
    expect(runtime.currentRoom?.name).toBe("cena_1");
    expect(runtime.player).toMatchObject({
      name: "Player",
      x: 15,
      y: 10,
      spriteSheet: "player_topdown_4dir.png",
      animationName: "idle_down",
      spriteAsset: {
        name: "player_topdown_4dir.png",
        kind: "Sprite",
        source: "Assets/sprites/player_topdown_4dir.png"
      },
      animationFrame: {
        animationID: "animation-player-idle-down",
        animationName: "idle_down",
        frameHeight: 16,
        frameIndex: 0,
        frameWidth: 16,
        sourceSheets: ["player_topdown_4dir.png"],
        spriteSheet: "player_topdown_4dir.png",
        tileCount: 1
      }
    });
    expect(runtime.activeDialogue).toMatchObject({
      key: "intro_001",
      mode: "dialogue",
      character: "Ana",
      portrait: "portrait.png",
      portraitAsset: {
        name: "portrait.png",
        kind: "Portrait",
        source: "Assets/portraits/portrait.png"
      },
      textSound: "confirm.wav",
      textSoundAsset: {
        name: "confirm.wav",
        kind: "SFX",
        source: "Assets/audio/confirm.wav"
      },
      confirmSound: "confirm.wav",
      text: "ROM OK. TESTE A CENA.",
      choices: ["Sim", "Abrir editor"],
      selectedChoiceIndex: 0
    });
    expect(runtime.activeSfx).toBe("confirm.wav");
    expect(runtime.eventLog.at(-1)).toMatchObject({
      eventName: "boot_dialogue",
      command: "show_dialogue intro_001",
      result: "dialogue"
    });
    expect(runtime.eventLog.map((item) => item.command)).toEqual([
      "play_music intro_theme.mod",
      "play_sfx confirm.wav",
      "call_event boot_dialogue",
      "show_dialogue intro_001"
    ]);
    expect(runtime.debug.lines).toContain("Room cena_1");
    expect(runtime.debug.lines).toContain("Player tile 15,10");
    expect(runtime.debug.lines).toContain("Music intro_theme.mod");
    expect(runtime.debug.lines).toContain("SFX confirm.wav");

    const closedBootDialogue = dispatchPreviewRuntimeAction(runtime, "action");
    expect(closedBootDialogue.activeDialogue).toBeNull();

    const actorDialogue = dispatchPreviewRuntimeAction(closedBootDialogue, "action");
    expect(actorDialogue.activeDialogue).toMatchObject({
      key: "intro_001",
      mode: "choice",
      choices: ["Sim", "Abrir editor"],
      selectedChoiceIndex: 0
    });
    expect(actorDialogue.eventLog.at(-1)).toMatchObject({
      eventName: "player_start",
      command: "show_choice intro_001",
      result: "dialogue"
    });

    const secondChoice = dispatchPreviewRuntimeAction(actorDialogue, "down");
    expect(secondChoice.activeDialogue).toMatchObject({
      selectedChoiceIndex: 1
    });

    let moved = dispatchPreviewRuntimeAction(secondChoice, "action");
    expect(moved.activeSfx).toBe("confirm.wav");
    for (let index = 0; index < 13; index += 1) {
      moved = dispatchPreviewRuntimeAction(moved, "right");
    }

    expect(moved.currentRoom?.name).toBe("room_2");
    expect(moved.eventLog.at(-1)).toMatchObject({
      eventName: "door_to_room_2",
      command: "change_scene room_2",
      result: "room"
    });
    expect(moved.debug.lines).toContain("Room room_2");
    expect(moved.debug.lines).toContain("Events 5");
  });

  it("updates the debug overlay immediately for audio-only events", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        {
          name: "room_1",
          width: 20,
          height: 18,
          eventBindings: { onInit: "audio_boot" }
        }
      ],
      actors: [{ id: "player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      audioItems: [
        { name: "intro_theme.mod", kind: "Musica" },
        { name: "confirm.wav", kind: "SFX" }
      ],
      events: [
        {
          name: "audio_boot",
          category: "Audio",
          steps: [
            { command: "play_music intro_theme.mod" },
            { command: "play_sfx confirm.wav" }
          ]
        }
      ],
      settings: { general: { startScene: "room_1" } }
    });

    expect(runtime.debug.lines).toContain("Music intro_theme.mod");
    expect(runtime.debug.lines).toContain("SFX confirm.wav");
    expect(runtime.eventLog.map((item) => item.command)).toEqual([
      "play_music intro_theme.mod",
      "play_sfx confirm.wav"
    ]);
  });

  it("carries dialogue portrait and UI settings into the runtime preview contract", () => {
    const runtime = createPreviewRuntime({
      ...buildFunctionalP0ProjectWithLegacyDialogueFrameAsset(),
      settings: {
        uiDialogs: {
          boxImage: "frame_dialogue.png",
          boxPosition: "Superior",
          boxWidth: 192,
          boxHeight: 64,
          font: "GBA compacta",
          selectorImage: "frame_dialogue.png",
          showPortrait: true,
          portraitPosition: "Direita",
          showCharacterName: false,
          textSpeed: "Rapida"
        }
      }
    });

    expect(runtime.dialogueUi).toEqual({
      boxAsset: {
        bundledDefaultAsset: null,
        kind: "UI",
        name: "frame_dialogue.png",
        source: "Assets/ui/frame_dialogue.png"
      },
      boxImage: "frame_dialogue.png",
      boxPosition: "Superior",
      boxWidth: 192,
      boxHeight: 64,
      font: "GBA compacta",
      selectorAsset: {
        bundledDefaultAsset: null,
        kind: "UI",
        name: "frame_dialogue.png",
        source: "Assets/ui/frame_dialogue.png"
      },
      selectorImage: "frame_dialogue.png",
      showPortrait: true,
      portraitPosition: "Direita",
      showCharacterName: false,
      nameLabelMode: "inline",
      textSpeed: "Rapida"
    });
    expect(runtime.activeDialogue).toMatchObject({
      key: "intro_001",
      portrait: "portrait.png",
      portraitAsset: {
        source: "Assets/portraits/portrait.png"
      },
      character: "Ana"
    });
  });

  it("carries optional dialogue emotes and text/confirm sounds into runtime actions", () => {
    const runtime = createPreviewRuntime({
      assets: [
        { name: "portrait.png", kind: "Sprite", metadata: { source: "Assets/portraits/portrait.png" } },
        { name: "Smile.png", kind: "Emote", metadata: { source: "Assets/emotes/Smile.png" } },
        { name: "text_blip.wav", kind: "SFX", metadata: { source: "Assets/sfx/text_blip.wav" } },
        { name: "confirm.wav", kind: "SFX", metadata: { source: "Assets/sfx/confirm.wav" } }
      ],
      scenas: [
        { name: "room_1", width: 10, height: 8, eventBindings: { onInit: "boot" } }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      dialogues: [
        {
          key: "intro",
          character: "Ana",
          portrait: "portrait.png",
          emote: "Smile.png",
          textSound: "text_blip.wav",
          confirmSound: "confirm.wav",
          text: "Oi",
          choices: ["Sim", "Nao"]
        }
      ],
      events: [{ name: "boot", steps: [{ command: "show_choice intro" }] }],
      settings: { general: { startScene: "room_1" } }
    });

    expect(runtime.activeDialogue).toMatchObject({
      key: "intro",
      mode: "choice",
      emote: "Smile.png",
      emoteAsset: { source: "Assets/emotes/Smile.png" },
      textSound: "text_blip.wav",
      textSoundAsset: { source: "Assets/sfx/text_blip.wav" },
      confirmSound: "confirm.wav",
      confirmSoundAsset: { source: "Assets/sfx/confirm.wav" },
      selectedChoiceIndex: 0
    });
    expect(runtime.activeSfx).toBe("text_blip.wav");

    const movedSelection = dispatchPreviewRuntimeAction(runtime, "down");
    expect(movedSelection.activeDialogue?.selectedChoiceIndex).toBe(1);

    const closed = dispatchPreviewRuntimeAction(movedSelection, "action");
    expect(closed.activeDialogue).toBeNull();
    expect(closed.activeSfx).toBe("confirm.wav");
  });

  it("keeps missing sprite and portrait assets explicit in the runtime contract", () => {
    const runtime = createPreviewRuntime({
      ...buildFunctionalP0Project(),
      assets: [],
      dialogues: [
        {
          key: "intro_001",
          character: "Ana",
          portrait: "missing_portrait.png",
          text: "Sem asset",
          choices: []
        }
      ]
    });

    expect(runtime.player).toMatchObject({
      spriteSheet: "player_topdown_4dir.png",
      spriteAsset: null
    });
    expect(runtime.activeDialogue).toMatchObject({
      portrait: "missing_portrait.png",
      portraitAsset: null
    });
  });

  it("carries bundled default sprite metadata for blank projects", () => {
    const runtime = createPreviewRuntime(createBlankProjectData({ name: "Blank" }));
    const spriteAsset = runtime.player?.spriteAsset;

    expect(spriteAsset).toMatchObject({ kind: "Sprite" });
    expect(spriteAsset?.bundledDefaultAsset).toBeTruthy();
    expect(spriteAsset?.name).toBe(runtime.player?.spriteSheet);
    const resolvedAssetURL = resolveAssetURL(
      undefined,
      spriteAsset?.source ?? null,
      spriteAsset?.bundledDefaultAsset
    );
    expect(resolvedAssetURL).toContain("/default-assets/templates/exemplo-gba/Assets/sprites/");
    expect(runtime.actors.some((actor) => actor.spriteAsset?.bundledDefaultAsset === spriteAsset?.bundledDefaultAsset)).toBe(true);
  });

  it("carries metasprite source region into the actor runtime frame", () => {
    const runtime = createPreviewRuntime({
      name: "Sprite Region",
      assets: [
        { id: "asset-player", name: "actor_animated.png", kind: "Sprite", metadata: { source: "Assets/sprites/actor_animated.png" } }
      ],
      scenas: [{ id: "room-1", name: "room_1", width: 20, height: 18, playerActorName: "Player" }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 4, y: 6, spriteSheet: "actor_animated.png", animationName: "idle_down" }],
      animations: [
        {
          id: "anim-idle",
          name: "idle_down",
          spriteSheet: "actor_animated.png",
          frameWidth: 16,
          frameHeight: 16,
          fps: 6,
          frames: [
            {
              frameIndex: 0,
              width: 16,
              height: 16,
              originX: 8,
              originY: 16,
              tiles: [
                {
                  tileIndex: 0,
                  x: 0,
                  y: 0,
                  sourceSheet: "actor_animated.png",
                  sliceX: 32,
                  sliceY: 16,
                  tileWidth: 16,
                  tileHeight: 16
                }
              ]
            }
          ]
        }
      ]
    });

    expect(runtime.player?.animationFrame).toMatchObject({
      animationID: "anim-idle",
      animationName: "idle_down",
      frameHeight: 16,
      frameWidth: 16,
      heightTiles: 2,
      layer: "OBJ",
      originX: 8,
      originY: 16,
      sourceHeight: 16,
      sourceSheets: ["actor_animated.png"],
      sourceWidth: 16,
      sourceX: 32,
      sourceY: 16,
      spriteSheet: "actor_animated.png",
      tileCount: 1,
      widthTiles: 2
    });
  });

  it("exposes BG2 tilemap and OBJ actors for GBA layer rendering", () => {
    const runtime = createPreviewRuntime({
      assets: [
        { id: "asset-bg", name: "tiles.png", kind: "Tileset", metadata: { source: "Assets/tiles/tiles.png", tileWidth: 16, tileHeight: 16 } },
        { id: "asset-player", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } }
      ],
      scenas: [
        {
          id: "room-1",
          name: "room_1",
          width: 3,
          height: 2,
          backgroundAssetName: "tiles.png",
          tilemap: [1, 2, 3, 4, 5, 6],
          playerActorName: "Player"
        }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 1, y: 1, spriteSheet: "hero.png", animationName: "idle" }],
      animations: [{ id: "anim-idle", name: "idle", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 32 }]
    });

    expect(runtime.currentRoom?.bg2).toMatchObject({
      layer: "BG2",
      assetName: "tiles.png",
      source: "Assets/tiles/tiles.png",
      tileCells: [1, 2, 3, 4, 5, 6],
      tileWidth: 16,
      tileHeight: 16
    });
    expect(runtime.currentRoom?.renderLayers.videoMode).toBe(0);
    expect(runtime.currentRoom?.renderLayers.obj.maxSprites).toBe(128);
    expect(runtime.player?.renderLayer).toBe("OBJ");
    expect(runtime.player?.animationFrame).toMatchObject({
      layer: "OBJ",
      widthTiles: 2,
      heightTiles: 4
    });
  });

  it("blocks movement on collision tiles and toggles the debug overlay in-app", () => {
    const project = setRoomCollisionCellInProject(
      buildFunctionalP0Project(),
      "room-1",
      (10 * 32) + 16,
      true
    );
    const runtime = dispatchPreviewRuntimeAction(createPreviewRuntime(project), "action");

    const blocked = dispatchPreviewRuntimeAction(runtime, "right");
    expect(blocked.player).toMatchObject({ x: 15, y: 10 });
    expect(blocked.debug.lines).toContain("Player tile 15,10");

    const moved = dispatchPreviewRuntimeAction(blocked, "left");
    expect(moved.player).toMatchObject({ x: 14, y: 10 });
    expect(moved.debug.lines).toContain("Player tile 14,10");

    const hiddenDebug = dispatchPreviewRuntimeAction(moved, "debug");
    expect(hiddenDebug.debug.visible).toBe(false);
    const visibleDebug = dispatchPreviewRuntimeAction(hiddenDebug, "debug");
    expect(visibleDebug.debug.visible).toBe(true);
  });

  it("reflects canvas entity edits in runtime actors and trigger overlays", () => {
    const moved = nudgeRoomEntitiesInProject(buildFunctionalP0Project(), {
      deltaX: -3,
      deltaY: 1,
      roomID: "room-1",
      selectedKeys: ["trigger:trigger-door"]
    });
    const duplicated = duplicateRoomEntitiesInProject(moved, {
      idForCopy: (kind, sourceID, copyIndex) => `${kind}-${sourceID}-copy-${copyIndex}`,
      roomID: "room-1",
      selectedKeys: ["trigger:trigger-door"]
    });

    const runtime = createPreviewRuntime(duplicated);

    expect(runtime.actors).toEqual([
      expect.objectContaining({
        id: "actor-player",
        name: "Player",
        roomName: "cena_1",
        x: 15,
        y: 10,
        spriteSheet: "player_topdown_4dir.png",
        animationName: "idle_down",
        animationFrame: expect.objectContaining({
          animationName: "idle_down",
          frameHeight: 16,
          frameWidth: 16,
          tileCount: 1
        })
      }),
      expect.objectContaining({
        id: "actor-guide",
        name: "Guide",
        roomName: "cena_1",
        x: 18,
        y: 13,
        spriteSheet: "player_topdown_4dir.png",
        animationName: "idle_right"
      })
    ]);
    expect(runtime.triggers).toEqual([
      expect.objectContaining({
        id: "trigger-door",
        name: "Door to room 2",
        roomName: "cena_1",
        x: 25,
        y: 11,
        width: 2,
        height: 2,
        eventName: "door_to_room_2"
      }),
      expect.objectContaining({
        id: "trigger-trigger-door-copy-1",
        name: "Door to room 2 copy",
        roomName: "cena_1",
        x: 26,
        y: 12,
        width: 2,
        height: 2,
        eventName: "door_to_room_2"
      })
    ]);
    expect(runtime.debug.lines).toContain("Actors 2");
    expect(runtime.debug.lines).toContain("Triggers 2");
  });

  it("runs audio SFX and nested call_event commands from the events workspace subset", () => {
    const project = {
      ...buildFunctionalP0Project(),
      audioItems: [
        { id: "audio-theme", name: "intro_theme.mod", kind: "Musica" },
        { id: "audio-confirm", name: "confirm.wav", kind: "SFX" }
      ],
      events: [
        { id: "event-room-boot", name: "room_boot", category: "Cena", steps: [{ command: "call_event nested_boot" }] },
        {
          id: "event-nested-boot",
          name: "nested_boot",
          category: "Controle",
          steps: [
            { command: "play_sfx confirm.wav" },
            { command: "show_dialogue intro_001" }
          ]
        },
        { id: "event-loop", name: "loop", category: "Controle", steps: [{ command: "call_event loop" }] }
      ]
    };

    const runtime = createPreviewRuntime(project);

    expect(runtime.activeSfx).toBe("confirm.wav");
    expect(runtime.activeDialogue?.key).toBe("intro_001");
    expect(runtime.eventLog.map((item) => `${item.eventName}:${item.command}:${item.result}`)).toEqual([
      "room_boot:call_event nested_boot:event",
      "nested_boot:play_sfx confirm.wav:audio",
      "nested_boot:show_dialogue intro_001:dialogue"
    ]);
    expect(runtime.debug.lines).toContain("SFX confirm.wav");

    const looped = dispatchPreviewRuntimeAction({
      ...runtime,
      activeDialogue: null,
      project: {
        ...runtime.project,
        actors: [
          {
            id: "actor-player",
            name: "Player",
            roomName: "cena_1",
            x: 15,
            y: 10,
            eventName: "loop",
            eventBindings: { onInteract: "loop" }
          }
        ]
      }
    }, "action");

    expect(looped.eventLog.at(-1)).toMatchObject({
      eventName: "loop",
      command: "call_event loop",
      result: "unsupported",
      detail: "Chamada recursiva bloqueada."
    });
  });

  it("handles runtime palette and sprite swap commands as script steps", () => {
    const runtime = createPreviewRuntime({
      assets: [
        { id: "asset-player", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } },
        { id: "asset-player-alt", name: "hero_alt.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero_alt.png" } },
        { id: "asset-drone", name: "drone.png", kind: "Sprite", metadata: { source: "Assets/sprites/drone.png" } }
      ],
      animations: [
        { id: "anim-hero", name: "walk", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 4 },
        { id: "anim-hero-alt", name: "walk", spriteSheet: "hero_alt.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 4 },
        { id: "anim-drone", name: "idle", spriteSheet: "drone.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 4 }
      ],
      scenas: [
        { id: "room-1", name: "cena_1", width: 10, height: 8, eventBindings: { onInit: "boot" } }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "cena_1", x: 2, y: 2, spriteSheet: "hero.png", animationName: "walk" },
        { id: "actor-drone", name: "Drone", roomName: "cena_1", x: 4, y: 2, spriteSheet: "drone.png", animationName: "idle" }
      ],
      events: [{
        id: "event-boot",
        name: "boot",
        steps: [
          { command: "change_player_sprite hero_alt.png" },
          { command: "change_actor_sprite Drone hero_alt.png" },
          { command: "set_background_palette 2 10" },
          { command: "set_sprite_palette 3 20" },
          { command: "restore_colors" }
        ]
      }],
      settings: { general: { startScene: "cena_1", startSceneType: "topdown" } }
    });

    expect(runtime.eventLog).toEqual([
      { eventName: "boot", command: "change_player_sprite hero_alt.png", result: "script", detail: expect.any(String) },
      { eventName: "boot", command: "change_actor_sprite Drone hero_alt.png", result: "script", detail: expect.any(String) },
      { eventName: "boot", command: "set_background_palette 2 10", result: "script", detail: expect.any(String) },
      { eventName: "boot", command: "set_sprite_palette 3 20", result: "script", detail: expect.any(String) },
      { eventName: "boot", command: "restore_colors", result: "script", detail: expect.any(String) }
    ]);
    expect(runtime.eventLog.every((entry) => entry.result !== "unsupported")).toBe(true);
  });

  it("resolves room boot events and call_event targets by id as well as name", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        {
          id: "room-start",
          name: "start",
          width: 10,
          height: 8,
          eventBindings: { onInit: "event-room-boot" }
        }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "start", x: 2, y: 2 }],
      dialogues: [{ key: "intro", character: "Ana", text: "Oi", choices: [] }],
      events: [
        {
          id: "event-room-boot",
          name: "room_boot",
          steps: [{ command: "call_event event-nested-dialogue" }]
        },
        {
          id: "event-nested-dialogue",
          name: "nested_dialogue",
          steps: [
            { command: "show_dialogue intro" },
            { command: "call_event event-nested-dialogue" }
          ]
        }
      ],
      settings: { general: { startScene: "start" } }
    });

    expect(runtime.activeDialogue?.key).toBe("intro");
    expect(runtime.eventLog.map((item) => `${item.eventName}:${item.command}:${item.result}`)).toEqual([
      "room_boot:call_event event-nested-dialogue:event",
      "nested_dialogue:show_dialogue intro:dialogue",
      "nested_dialogue:call_event event-nested-dialogue:unsupported"
    ]);
    expect(runtime.eventLog.at(-1)?.detail).toBe("Chamada recursiva bloqueada.");
  });

  it("syncs content-only project edits into the open preview without rebooting player state", () => {
    const runtime = dispatchPreviewRuntimeAction(
      dispatchPreviewRuntimeAction(createPreviewRuntime(buildFunctionalP0ProjectWithPortraitAsset()), "action"),
      "left"
    );
    const actorDialogue = dispatchPreviewRuntimeAction(runtime, "action");
    const selectedDialogue = dispatchPreviewRuntimeAction(actorDialogue, "down");
    const nextProject = {
      ...selectedDialogue.project,
      assets: [
        ...(Array.isArray(selectedDialogue.project.assets) ? selectedDialogue.project.assets.filter((asset) => asset.name !== "confirm.wav") : []),
        {
          id: "asset-confirm-updated",
          name: "confirm.wav",
          kind: "SFX",
          metadata: { source: "Assets/audio/confirm-updated.wav" }
        },
        {
          id: "asset-live-blip",
          name: "live_blip.wav",
          kind: "SFX",
          metadata: { source: "Assets/audio/live_blip.wav" }
        }
      ],
      dialogues: [
        {
          key: "intro_001",
          character: "Ana",
          portrait: "portrait.png",
          textSound: "live_blip.wav",
          confirmSound: "confirm.wav",
          text: "Texto editado ao vivo.",
          choices: ["Sim", "Abrir editor", "Voltar"]
        }
      ]
    };

    const synced = syncPreviewRuntimeProject(selectedDialogue, nextProject);

    expect(synced.currentRoom?.name).toBe("cena_1");
    expect(synced.player).toMatchObject({ x: 14, y: 10 });
    expect(synced.eventLog).toEqual(selectedDialogue.eventLog);
    expect(synced.activeDialogue).toMatchObject({
      key: "intro_001",
      text: "Texto editado ao vivo.",
      choices: ["Sim", "Abrir editor", "Voltar"],
      selectedChoiceIndex: 1,
      textSoundAsset: {
        source: "Assets/audio/live_blip.wav"
      }
    });
    expect(synced.activeSfx).toBe("live_blip.wav");
    expect(synced.activeSfxAsset).toMatchObject({
      name: "live_blip.wav",
      source: "Assets/audio/live_blip.wav"
    });
  });

  it("reboots the open preview when runtime event structure changes", () => {
    const runtime = dispatchPreviewRuntimeAction(createPreviewRuntime(buildFunctionalP0Project()), "action");
    const nextProject = {
      ...runtime.project,
      audioItems: [
        ...(Array.isArray(runtime.project.audioItems) ? runtime.project.audioItems : []),
        { id: "audio-battle", name: "battle.mod", kind: "Musica" }
      ],
      assets: [
        ...(Array.isArray(runtime.project.assets) ? runtime.project.assets : []),
        { id: "asset-battle", name: "battle.mod", kind: "Audio", metadata: { source: "Assets/audio/battle.mod" } }
      ],
      events: [
        {
          id: "event-room-boot",
          name: "room_boot",
          category: "Cena",
          steps: [
            { command: "play_music battle.mod" },
            { command: "show_dialogue intro_001" }
          ]
        }
      ]
    };

    const synced = syncPreviewRuntimeProject(runtime, nextProject);

    expect(synced.player).toMatchObject({ x: 15, y: 10 });
    expect(synced.activeMusic).toBe("battle.mod");
    expect(synced.activeMusicAsset).toMatchObject({
      source: "Assets/audio/battle.mod"
    });
    expect(synced.eventLog.map((item) => item.command)).toEqual([
      "play_music battle.mod",
      "show_dialogue intro_001"
    ]);
  });

  it("exposes audio asset refs and unsupported runtime references as diagnostics", () => {
    const runtime = createPreviewRuntime({
      assets: [
        { name: "theme.mod", kind: "Audio", metadata: { source: "Assets/audio/theme.mod" } }
      ],
      scenas: [
        { name: "room_1", width: 10, height: 8, eventBindings: { onInit: "boot" } }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 2, y: 2 }],
      events: [
        {
          name: "boot",
          steps: [
            { command: "play_music theme.mod" },
            { command: "show_dialogue missing_dialogue" },
            { command: "change_scene missing_room" }
          ]
        }
      ],
      settings: { general: { startScene: "room_1" } }
    });

    expect(runtime.activeMusicAsset).toEqual({
      bundledDefaultAsset: null,
      name: "theme.mod",
      kind: "Audio",
      source: "Assets/audio/theme.mod"
    });
    expect(runtime.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "Dialogo nao encontrado: missing_dialogue.",
      "Room nao encontrada: missing_room."
    ]);
    expect(runtime.debug.lines).toContain("Diagnostics 2");
  });

  it("advances player animation frames on tickPreviewRuntime", () => {
    const runtime = createPreviewRuntime({
      assets: [{ id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } }],
      scenas: [{ id: "room-1", name: "room_1", width: 4, height: 4, playerActorName: "Player" }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 1, y: 1, spriteSheet: "hero.png", animationName: "walk" }],
      animations: [{
        id: "anim-walk",
        name: "walk",
        spriteSheet: "hero.png",
        frameWidth: 16,
        frameHeight: 16,
        fps: 10,
        frames: [
          {
            frameIndex: 0,
            width: 16,
            height: 16,
            tiles: [{ sourceSheet: "hero.png", sliceX: 0, sliceY: 0, tileWidth: 16, tileHeight: 16 }]
          },
          {
            frameIndex: 1,
            width: 16,
            height: 16,
            tiles: [{ sourceSheet: "hero.png", sliceX: 16, sliceY: 0, tileWidth: 16, tileHeight: 16 }]
          }
        ]
      }]
    });

    expect(runtime.player?.animationFrame?.sourceX).toBe(0);
    expect(runtime.playerAnimationFrameIndex).toBe(0);

    const ticked = tickPreviewRuntime(runtime, 150);
    expect(ticked.playerAnimationFrameIndex).toBe(1);
    expect(ticked.player?.animationFrame?.sourceX).toBe(16);
  });

  it("mantem estados visuais explicitos de luta no Preview sem habilitar animacoes ausentes", () => {
    const combatAnimation = (
      id: string,
      name: string,
      sourceXs: number[],
      loops = true
    ) => ({
      id,
      name,
      spriteSheet: "arena-fighter.png",
      frameWidth: 32,
      frameHeight: 64,
      fps: 10,
      loops,
      frames: sourceXs.map((sourceX, frameIndex) => ({
        id: `${id}-frame-${frameIndex}`,
        frameIndex,
        width: 32,
        height: 64,
        tiles: [{
          sourceSheet: "arena-fighter.png",
          sliceX: sourceX,
          sliceY: 0,
          tileWidth: 32,
          tileHeight: 64
        }]
      }))
    });
    const runtime = createPreviewRuntime({
      assets: [{ id: "asset-fighter", name: "arena-fighter.png", kind: "Sprite", metadata: { source: "Assets/arena-fighter.png" } }],
      scenas: [{
        id: "arena",
        name: "arena_arrancada",
        sceneType: "luta",
        width: 30,
        height: 20,
        playerActorName: "Nara"
      }],
      actors: [{
        id: "nara",
        name: "Nara",
        roomName: "arena_arrancada",
        x: 3,
        y: 6,
        spriteSheet: "arena-fighter.png",
        animationName: "nara-base",
        lutaAnimations: {
          fallback: "static_metasprite",
          idle: "nara-idle",
          attack: "nara-attack",
          special: "nara-special",
          guard: "nara-guard",
          hurt: "nara-hurt"
        },
        battle: { side: "player1" }
      }, {
        id: "rival",
        name: "Rival",
        roomName: "arena_arrancada",
        x: 12,
        y: 6,
        spriteSheet: "arena-fighter.png",
        animationName: "rival-base",
        battle: { side: "player2" }
      }],
      animations: [
        combatAnimation("nara-base-id", "nara-base", [0]),
        combatAnimation("nara-idle-id", "nara-idle", [32]),
        combatAnimation("nara-attack-id", "nara-attack", [64, 96], false),
        combatAnimation("nara-special-id", "nara-special", [128, 160], false),
        combatAnimation("nara-guard-id", "nara-guard", [192]),
        combatAnimation("nara-hurt-id", "nara-hurt", [224], false),
        combatAnimation("rival-base-id", "rival-base", [256])
      ],
      settings: { general: { startScene: "arena_arrancada" } }
    });

    const nara = () => runtime.actors.find((actor) => actor.id === "nara");
    const rival = () => runtime.actors.find((actor) => actor.id === "rival");
    expect(runtime.lutaVisualStates.nara).toMatchObject({
      state: "idle",
      animationName: "nara-idle",
      fallback: "none"
    });
    expect(nara()?.animationName).toBe("nara-idle");
    expect(runtime.lutaVisualStates.rival).toMatchObject({
      state: "idle",
      animationName: null,
      fallback: "static_metasprite"
    });
    expect(rival()?.animationName).toBe("rival-base");

    const attack = dispatchPreviewRuntimeAction(runtime, "action");
    expect(attack.lutaVisualStates.nara).toMatchObject({ state: "attack", animationName: "nara-attack" });
    expect(attack.player?.animationName).toBe("nara-attack");
    const attackContact = tickPreviewRuntime(attack, 100);
    expect(attackContact.lutaVisualStates.nara).toMatchObject({ state: "attack", frameIndex: 1 });
    expect(attackContact.player?.animationFrame?.sourceX).toBe(96);
    const attackFinished = tickPreviewRuntime(attackContact, 100);
    expect(attackFinished.lutaVisualStates.nara).toMatchObject({ state: "idle", animationName: "nara-idle" });
    expect(attackFinished.player?.animationFrame?.sourceX).toBe(32);

    const special = dispatchPreviewRuntimeAction(attackFinished, "back");
    expect(special.lutaVisualStates.nara).toMatchObject({ state: "special", animationName: "nara-special" });
    const alphaCounter = dispatchPreviewRuntimeAction(special, "select");
    expect(alphaCounter.lutaVisualStates.nara).toMatchObject({ state: "special", animationName: "nara-special" });

    const guarding = tickPreviewRuntime(attackFinished, 1000 / 60, "down");
    expect(guarding.lutaVisualStates.nara).toMatchObject({ state: "guard", animationName: "nara-guard", guarding: true });
    expect(guarding.player?.animationName).toBe("nara-guard");
    const released = tickPreviewRuntime(guarding, 1000 / 60);
    expect(released.lutaVisualStates.nara).toMatchObject({ state: "idle", animationName: "nara-idle", guarding: false });

    const hurt = syncPreviewLutaVisualState(runtime, "nara", { hitstunFrames: 2, guarding: true });
    expect(hurt.lutaVisualStates.nara).toMatchObject({ state: "hurt", animationName: "nara-hurt", hitstunFrames: 2 });
    const hurtStillActive = tickPreviewRuntime(hurt, 1000 / 60, "down");
    expect(hurtStillActive.lutaVisualStates.nara?.state).toBe("hurt");
    const hurtFinished = tickPreviewRuntime(hurtStillActive, 1000 / 60);
    expect(hurtFinished.lutaVisualStates.nara).toMatchObject({ state: "idle", animationName: "nara-idle", hitstunFrames: 0 });
  });

  it("moves the player while a direction key stays held", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 8, height: 8, playerActorName: "Player" }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 3, y: 3, spriteSheet: "hero.png", animationName: "idle" }],
      animations: [{ id: "anim-idle", name: "idle", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, fps: 1 }]
    });

    const moved = tickPreviewRuntime(runtime, previewPlayerMovementStepMs(1), "right");
    expect(moved.player).toMatchObject({ x: 4, y: 3 });
  });

  it("uses settings.topdown.walkSpeed for held-movement step timing", () => {
    const runtime = createPreviewRuntime({
      settings: {
        topdown: { walkSpeed: 2 }
      },
      scenas: [{ id: "room-1", name: "room_1", width: 8, height: 8, playerActorName: "Player" }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 3, y: 3 }]
    });

    expect(tickPreviewRuntime(runtime, previewPlayerMovementStepMs(2) - 1, "right").player).toMatchObject({ x: 3, y: 3 });
    expect(tickPreviewRuntime(runtime, previewPlayerMovementStepMs(2), "right").player).toMatchObject({ x: 4, y: 3 });
  });

  it("uses dungeon crawler relative steps and 90 degree turns", () => {
    const runtime = createPreviewRuntime({
      settings: { dungeonCrawler: { stepDurationMs: 180, turnDurationMs: 120, allowBackstep: true } },
      scenas: [{
        id: "room-dungeon",
        name: "crypt",
        sceneType: "dungeonCrawler",
        width: 8,
        height: 8,
        playerActorName: "Player",
        runtime: { type: "dungeonCrawler", config: {} }
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "crypt", x: 3, y: 3, direction: "up" }]
    });

    const turned = tickPreviewRuntime(runtime, 120, "right");
    expect(turned.player).toMatchObject({ x: 3, y: 3, direction: "right" });
    const advanced = tickPreviewRuntime({ ...turned, movementElapsedMs: 0 }, 180, "up");
    expect(advanced.player).toMatchObject({ x: 4, y: 3, direction: "right" });
    const backed = tickPreviewRuntime({ ...advanced, movementElapsedMs: 0 }, 180, "down");
    expect(backed.player).toMatchObject({ x: 3, y: 3, direction: "right" });
  });

  it("uses an authored dungeon start without promoting the first NPC to player", () => {
    const runtime = createPreviewRuntime({
      settings: { general: { startScene: "crypt" } },
      scenas: [{
        id: "room-dungeon",
        name: "crypt",
        sceneType: "dungeonCrawler",
        width: 8,
        height: 8,
        playerActorName: "",
        runtime: {
          type: "dungeonCrawler",
          config: {
            playerStart: { x: 1, y: 1, direction: "right" },
            modules: [{
              id: "battle",
              enabled: true,
              settings: { enemyActor: "Sentinela", enemyName: "SENTINELA", maxHp: 3 }
            }]
          }
        }
      }],
      actors: [{ id: "actor-enemy", name: "Sentinela", roomName: "crypt", x: 2, y: 1 }]
    });

    expect(runtime.player).toMatchObject({ id: "dungeon-player-crypt", x: 1, y: 1, direction: "right" });
    expect(runtime.actors).toEqual([expect.objectContaining({ id: "actor-enemy", x: 2, y: 1 })]);
    expect(dispatchPreviewRuntimeAction(runtime, "action").dungeonInteraction.mode).toBe("battle");
  });

  it("reproduz inventário, mapa, bússola e batalha do Dungeon Crawler no Preview", () => {
    const runtime = createPreviewRuntime({
      settings: { general: { startScene: "dungeon" } },
      scenas: [{
        id: "room-dungeon",
        name: "dungeon",
        sceneType: "dungeonCrawler",
        width: 8,
        height: 6,
        playerActorName: "Player",
        runtime: {
          type: "dungeonCrawler",
          config: {
            stepDurationMs: 180,
            turnDurationMs: 120,
            allowBackstep: true,
            viewDistance: 5,
            modules: [
              { id: "movement", enabled: true, settings: {} },
              { id: "inventory", enabled: true, settings: { item: 2, label: "CÉLULA", initialQuantity: 1, healAmount: 1 } },
              { id: "battle", enabled: true, settings: {
                enemyActor: "Sentinela",
                enemyName: "SENTINELA",
                maxHp: 3,
                playerDamage: 1,
                enemyDamage: 1,
                rewardItem: 3,
                rewardQuantity: 1
              } },
              { id: "compass", enabled: true, settings: {} },
              { id: "map", enabled: true, settings: {} }
            ]
          }
        }
      }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "dungeon", x: 1, y: 1, direction: "right" },
        { id: "actor-enemy", name: "Sentinela", roomName: "dungeon", x: 2, y: 1 }
      ]
    });

    expect(runtime.inventory["2"]).toBe(1);
    expect(runtime.dungeonInteraction).toMatchObject({ mode: "none", explorationPlayerHp: 3, compassLabel: "E HP 03" });
    expect(runtime.dungeonHud).toMatchObject({ visible: false, panel: "map" });

    const map = dispatchPreviewRuntimeAction(runtime, "start");
    expect(map.dungeonInteraction).toMatchObject({ mode: "map", mapScrollX: 0, mapScrollY: 0 });
    expect(map.dungeonHud).toMatchObject({ visible: true, panel: "map" });
    const closedMap = dispatchPreviewRuntimeAction(map, "back");
    const inventory = dispatchPreviewRuntimeAction(closedMap, "select");
    expect(inventory.dungeonInteraction).toMatchObject({ mode: "inventory", selectedIndex: 0 });
    expect(inventory.dungeonHud).toMatchObject({ visible: true, panel: "items" });

    const usedItem = dispatchPreviewRuntimeAction(inventory, "action");
    expect(usedItem.inventory["2"]).toBe(0);
    expect(usedItem.dungeonInteraction).toMatchObject({ mode: "notice", notice: "CÉLULA USADA." });
    const readyForBattle = dispatchPreviewRuntimeAction(usedItem, "action");

    const battle = dispatchPreviewRuntimeAction(readyForBattle, "action");
    expect(battle.dungeonInteraction).toMatchObject({ mode: "battle", enemyHp: 3, playerHp: 3 });
    const firstAttack = dispatchPreviewRuntimeAction(battle, "action");
    expect(firstAttack.dungeonInteraction).toMatchObject({ mode: "notice", notice: "CONTRA-ATAQUE.", enemyHp: 2, playerHp: 2 });
    const secondTurn = dispatchPreviewRuntimeAction(firstAttack, "action");
    const secondAttack = dispatchPreviewRuntimeAction(secondTurn, "action");
    const thirdTurn = dispatchPreviewRuntimeAction(secondAttack, "action");
    const victory = dispatchPreviewRuntimeAction(thirdTurn, "action");
    expect(victory.inventory["3"]).toBe(1);
    expect(victory.dungeonInteraction).toMatchObject({ mode: "notice", notice: "VITÓRIA.", enemyHp: 0, enemyDefeated: true });
    expect(previewRuntimeDungeonHud(victory)).toMatchObject({ visible: true, panel: "map", compassLabel: "E HP 01" });
  });

  it("accelerates, brakes and steers a racing preview", () => {
    const runtime = createPreviewRuntime({
      settings: { racing: { maxSpeed: 4, acceleration: 8, brakePower: 12, steeringSpeed: 2 } },
      scenas: [{ id: "room-race", name: "track", sceneType: "racing", width: 8, height: 8, playerActorName: "Player", runtime: { type: "racing", config: {} } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "track", x: 3, y: 4 }]
    });
    const accelerated = tickPreviewRuntime(runtime, 250, "up");
    expect(accelerated.vehicleSpeed).toBe(2);
    const steered = tickPreviewRuntime({ ...accelerated, movementElapsedMs: 0 }, 500, "right");
    expect(steered.player).toMatchObject({ x: 4, y: 3 });
    const braked = tickPreviewRuntime({ ...steered, movementElapsedMs: 0 }, 250, "down");
    expect(braked.vehicleSpeed).toBe(0);
  });

  it("navigates the battle command menu with dialogue-like confirmation and back", () => {
    const runtime = createPreviewRuntime({
      settings: { battleRpg: { maxEnemies: 3, escapeEnabled: true } },
      scenas: [{ id: "room-battle", name: "arena", sceneType: "battleRpg", width: 8, height: 8, playerActorName: "Player", runtime: { type: "battleRpg", config: {} } }],
      actors: [
        {
          id: "actor-player",
          name: "Player",
          roomName: "arena",
          x: 3,
          y: 4,
          battle: { side: "party", maxHp: 40, attack: 8, defense: 4, speed: 5, abilities: ["attack", "magic"] }
        },
        {
          id: "actor-enemy",
          name: "Sentinel",
          roomName: "arena",
          x: 5,
          y: 4,
          battle: { side: "enemy", maxHp: 40, attack: 8, defense: 4, speed: 5, abilities: ["attack"] }
        }
      ]
    });
    expect(runtime.battleMenu).toMatchObject({ visible: true, page: "root", selectedIndex: 0 });

    const moves = dispatchPreviewRuntimeAction(runtime, "action");
    expect(moves.battleMenu).toMatchObject({ visible: true, page: "moves", selectedIndex: 0 });
    expect(previewRuntimeBattleMenuItems(runtime)).toEqual(["ATACAR", "EQUIPE", "ITENS", "FUGIR"]);
    expect(previewRuntimeBattleMenuItems(moves)).toEqual(["ATAQUE", "TÉCNICA"]);
    const secondMove = dispatchPreviewRuntimeAction(moves, "down");
    expect(secondMove.battleMenu?.selectedIndex).toBe(1);
    const root = dispatchPreviewRuntimeAction(secondMove, "back");
    expect(root.battleMenu).toMatchObject({ visible: true, page: "root", selectedIndex: 0 });

    const team = dispatchPreviewRuntimeAction(dispatchPreviewRuntimeAction(root, "right"), "action");
    expect(team.battleMenu).toMatchObject({ visible: true, page: "party", selectedIndex: 0 });
    const afterTeamBack = dispatchPreviewRuntimeAction(team, "back");
    expect(afterTeamBack.battleMenu).toMatchObject({ visible: true, page: "root", selectedIndex: 1 });

    const items = dispatchPreviewRuntimeAction(
      dispatchPreviewRuntimeAction(dispatchPreviewRuntimeAction(afterTeamBack, "left"), "down"),
      "action"
    );
    expect(items.battleMenu).toMatchObject({ visible: true, page: "items", selectedIndex: 0 });
    expect(dispatchPreviewRuntimeAction(items, "back").battleMenu).toMatchObject({ page: "root", selectedIndex: 2 });

    const escape = dispatchPreviewRuntimeAction(afterTeamBack, "down");
    const escaped = dispatchPreviewRuntimeAction(escape, "action");
    expect(escaped.battleEscaped).toBe(true);
    expect(escaped.battleMenu?.visible).toBe(false);
  });

  it("keeps back as cancellation and reports blocked escape inside the dialogue-like menu", () => {
    const runtime = createPreviewRuntime({
      settings: { battleRpg: { escapeEnabled: false } },
      scenas: [{ id: "room-battle", name: "relay", sceneType: "battleRpg", width: 8, height: 8, playerActorName: "Player", runtime: { type: "battleRpg", config: {} } }],
      actors: [{ id: "actor-player", name: "Player", roomName: "relay", x: 3, y: 4, battle: { side: "party", maxHp: 40, attack: 8, defense: 4, speed: 5, abilities: ["attack"] } }]
    });

    const escape = dispatchPreviewRuntimeAction(
      dispatchPreviewRuntimeAction(runtime, "down"),
      "right"
    );
    const blocked = dispatchPreviewRuntimeAction(escape, "action");
    expect(blocked.battleEscaped).toBe(false);
    expect(blocked.battleMenu).toMatchObject({ visible: true, page: "root", selectedIndex: 3, notice: "Não há rota de fuga!" });
    expect(dispatchPreviewRuntimeAction(blocked, "back").battleMenu).toMatchObject({ page: "root", selectedIndex: 3 });
  });

  it("opens a target submenu before confirming a move against multiple enemies", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-battle", name: "relay", sceneType: "battleRpg", width: 8, height: 8, playerActorName: "Player", runtime: { type: "battleRpg", config: {} } }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "relay", x: 3, y: 4, battle: { side: "party", maxHp: 40, attack: 8, defense: 4, speed: 5, abilities: ["attack"] } },
        { id: "actor-first-enemy", name: "Sentinel A", roomName: "relay", x: 5, y: 4, battle: { side: "enemy", maxHp: 40, attack: 8, defense: 4, speed: 5, abilities: ["attack"] } },
        { id: "actor-second-enemy", name: "Sentinel B", roomName: "relay", x: 6, y: 4, battle: { side: "enemy", maxHp: 40, attack: 8, defense: 4, speed: 5, abilities: ["attack"] } }
      ]
    });

    const moves = dispatchPreviewRuntimeAction(runtime, "action");
    const targets = dispatchPreviewRuntimeAction(moves, "action");
    expect(targets.battleMenu).toMatchObject({ visible: true, page: "targets", selectedIndex: 0 });
    const selectedTarget = dispatchPreviewRuntimeAction(targets, "down");
    expect(selectedTarget.battleMenu?.selectedIndex).toBe(1);
    const confirmed = dispatchPreviewRuntimeAction(selectedTarget, "action");
    expect(confirmed.battleTurnIndex).toBe(1);
    expect(confirmed.battleMenu).toMatchObject({ page: "notice", notice: "Player usou ATAQUE." });
  });

  it("applies battle damage, waits for the enemy turn and returns to commands", () => {
    const runtime = createPreviewRuntime({
      settings: { battleRpg: { turnDelayFrames: 18, escapeEnabled: false } },
      scenas: [{ id: "room-battle", name: "relay", sceneType: "battleRpg", width: 8, height: 8, runtime: { type: "battleRpg", config: {} } }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "relay", x: 3, y: 4, battle: { side: "party", maxHp: 40, attack: 12, defense: 5, speed: 5, abilities: ["attack"] } },
        { id: "actor-enemy", name: "Sentinel", roomName: "relay", x: 5, y: 4, battle: { side: "enemy", maxHp: 15, attack: 6, defense: 2, speed: 5, abilities: ["attack"] } }
      ]
    });

    const moves = dispatchPreviewRuntimeAction(runtime, "action");
    const attackNotice = dispatchPreviewRuntimeAction(moves, "action");
    expect(attackNotice.battleEnemyHp).toEqual([5]);
    expect(attackNotice.battleTurnPending).toBe(true);
    expect(attackNotice.battleOutcome).toBe("inProgress");
    expect(attackNotice.battleMenu).toMatchObject({ page: "notice", notice: "Player usou ATAQUE." });

    const afterEnemyTurn = dispatchPreviewRuntimeAction(attackNotice, "action");
    expect(afterEnemyTurn.battlePartyHp).toEqual([39]);
    expect(afterEnemyTurn.battleTurnPending).toBe(false);
    expect(afterEnemyTurn.battleTurnIndex).toBe(1);
    expect(afterEnemyTurn.battleMenu).toMatchObject({ page: "root", selectedIndex: 0 });
  });

  it("shows a victory notice and closes battle commands when the last enemy falls", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-battle", name: "relay", sceneType: "battleRpg", width: 8, height: 8, runtime: { type: "battleRpg", config: {} } }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "relay", x: 3, y: 4, battle: { side: "party", maxHp: 40, attack: 12, defense: 5, speed: 5, abilities: ["attack"] } },
        { id: "actor-enemy", name: "Sentinel", roomName: "relay", x: 5, y: 4, battle: { side: "enemy", maxHp: 8, attack: 6, defense: 2, speed: 5, abilities: ["attack"] } }
      ]
    });

    const victory = dispatchPreviewRuntimeAction(
      dispatchPreviewRuntimeAction(runtime, "action"),
      "action"
    );
    expect(victory.battleEnemyHp).toEqual([0]);
    expect(victory.battleOutcome).toBe("victory");
    expect(victory.battleTurnPending).toBe(false);
    expect(victory.battleMenu).toMatchObject({ page: "notice", notice: "Vitória!" });
  });

  it("navigates world map nodes while skipping hidden locked rooms", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        { id: "node-start", name: "start", sceneType: "worldMap", width: 8, height: 8, runtime: { type: "worldMap", config: {} } },
        { id: "node-hidden", name: "hidden", sceneType: "worldMap", width: 8, height: 8, runtime: { type: "worldMap", config: { unlocked: false, hideWhenLocked: true } } },
        { id: "node-forest", name: "forest", sceneType: "worldMap", width: 8, height: 8, runtime: { type: "worldMap", config: {} } }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "start", x: 3, y: 4 }],
      settings: { general: { startScene: "start" }, worldMap: { unlocked: true, hideWhenLocked: false } }
    });
    const selected = dispatchPreviewRuntimeAction(runtime, "right");
    expect(selected.currentRoom?.name).toBe("forest");
  });

  it("advances a visual novel scene with the action button", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        { id: "scene-1", name: "chapter_1", sceneType: "visualNovel", width: 8, height: 8, runtime: { type: "visualNovel", config: { nextSceneIndex: 1 } } },
        { id: "scene-2", name: "chapter_2", sceneType: "visualNovel", width: 8, height: 8, runtime: { type: "visualNovel", config: {} } }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "chapter_1", x: 3, y: 4 }],
      settings: { general: { startScene: "chapter_1" } }
    });
    expect(dispatchPreviewRuntimeAction(runtime, "action").currentRoom?.name).toBe("chapter_2");
  });

  it("resolves narrative next-scene indexes within rooms of the same type", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        { id: "room-top", name: "overworld", sceneType: "topdown", width: 8, height: 8 },
        { id: "vn-1", name: "chapter_1", sceneType: "visualNovel", width: 8, height: 8, runtime: { type: "visualNovel", config: { nextSceneIndex: 1 } } },
        { id: "room-platform", name: "stage", sceneType: "platformer", width: 8, height: 8 },
        { id: "vn-2", name: "chapter_2", sceneType: "visualNovel", width: 8, height: 8, runtime: { type: "visualNovel", config: {} } }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "chapter_1", x: 3, y: 4 }],
      settings: { general: { startScene: "chapter_1" } }
    });
    expect(dispatchPreviewRuntimeAction(runtime, "action").currentRoom?.name).toBe("chapter_2");
  });

  it("advances a cutscene with the action button", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        { id: "cut-1", name: "intro", sceneType: "cutscene", width: 8, height: 8, runtime: { type: "cutscene", config: { nextSceneIndex: 1 } } },
        { id: "cut-2", name: "arrival", sceneType: "cutscene", width: 8, height: 8, runtime: { type: "cutscene", config: {} } }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "intro", x: 3, y: 4 }],
      settings: { general: { startScene: "intro" } }
    });
    expect(dispatchPreviewRuntimeAction(runtime, "action").currentRoom?.name).toBe("arrival");
  });

  it("uses the current platformer room walkSpeed for held-movement step timing", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-1",
        name: "room_1",
        sceneType: "platformer",
        width: 8,
        height: 8,
        playerActorName: "Player",
        runtime: {
          type: "platformer",
          config: { walkSpeed: 4 }
        }
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 3, y: 3 }]
    });

    expect(runtime.currentRoom?.runtime).toMatchObject({
      type: "platformer",
      config: { walkSpeed: 4 }
    });
    expect(tickPreviewRuntime(runtime, previewPlayerMovementStepMs(4) - 1, "right").player).toMatchObject({ x: 3, y: 3 });
    expect(tickPreviewRuntime(runtime, previewPlayerMovementStepMs(4), "right").player).toMatchObject({ x: 4, y: 3 });
  });

  it("runs the Platformer Plus Preview physics when the scene opts into the shared contract", () => {
    const width = 40;
    const height = 12;
    const collisionTypes = Array.from({ length: width * height }, () => "free");
    for (let x = 0; x < width; x += 1) collisionTypes[8 * width + x] = "solid";
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-platform-plus",
        name: "platform_plus",
        sceneType: "platformer",
        width,
        height,
        collisionTypes,
        playerActorName: "Player",
        runtime: {
          type: "platformer",
          config: {
            walkSpeed: 2,
            acceleration: 1,
            friction: 0.5,
            gravity: 0.375,
            maxFallSpeed: 6,
            jumpSpeed: 5.5,
            jumpMinHeight: 1.25,
            jumpFrames: 8,
            jumpReduction: 0.75,
            coyoteTime: 3,
            jumpBuffer: 4,
            airControl: true,
            changeDirectionInAir: true,
            dropThrough: "down_jump_hold",
            cameraFollow: 15,
            cameraDeadzoneX: 24,
            dash: true,
            dashStyle: "both",
            dashMomentum: "horizontal",
            dashThrough: "actors",
            dashRechargeFrames: 45,
            dashSpeed: 6.5,
            dashFrames: 8
          }
        }
      }],
      actors: [{
        id: "actor-player",
        name: "Player",
        roomName: "platform_plus",
        x: 30,
        y: 7,
        spriteSheet: "hero-platform.png",
        animationName: "run_right"
      }],
      animations: [{
        id: "hero-platform-run-right",
        name: "run_right",
        spriteSheet: "hero-platform.png",
        frameWidth: 16,
        frameHeight: 24,
        hitboxX: 2,
        hitboxY: -8,
        hitboxWidth: 12,
        hitboxHeight: 16,
        frames: []
      }],
      settings: { general: { startScene: "platform_plus" } }
    });

    expect(runtime.currentRoom?.platformerPreviewEnabled).toBe(true);
    expect(runtime.runtimeProfile.capabilities).toEqual(expect.arrayContaining([
      "platformer_plus_preview",
      "variable_jump_preview",
      "drop_through_preview",
      "dash_preview",
      "camera_deadzone_preview"
    ]));
    const settled = tickPreviewRuntime(runtime, 1000 / 60, "right");
    expect(settled.platformerPhysics?.onGround).toBe(true);
    expect(settled.platformerPhysics).toMatchObject({
      width: 12,
      height: 16,
      collisionOffsetX: 2,
      collisionOffsetY: -8
    });
    expect(settled.player?.x).toBeGreaterThan(30);
    expect(settled.camera.x).toBeGreaterThan(0);

    const jumpRequested = dispatchPreviewRuntimeAction(settled, "action");
    const jumping = tickPreviewRuntime(jumpRequested, 1000 / 60, null, ["action"]);
    expect(jumping.platformerPhysics?.onGround).toBe(false);
    expect(jumping.platformerPhysics?.velocityY).toBeLessThan(0);

    const dashRequested = dispatchPreviewRuntimeAction(jumping, "back");
    const dashing = tickPreviewRuntime(dashRequested, 1000 / 60, "right");
    expect(dashing.platformerPhysics?.dashing).toBe(true);
    expect(dashing.platformerPhysics?.velocityX).toBe(6.5);
  });

  it("runs trigger onLeave when the player exits the overlap area", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 10, height: 10, playerActorName: "Player" }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 1, y: 2 }],
      triggers: [{
        id: "trigger-door",
        name: "Door",
        roomName: "room_1",
        x: 2,
        y: 2,
        width: 1,
        height: 1,
        eventBindings: {
          onEnter: "door_enter",
          onLeave: "door_leave"
        }
      }],
      events: [
        { id: "event-enter", name: "door_enter", category: "Trigger", steps: [{ command: "set_variable entered 1" }] },
        { id: "event-leave", name: "door_leave", category: "Trigger", steps: [{ command: "set_variable left 1" }] }
      ],
      variables: [{ name: "entered" }, { name: "left" }]
    });

    const entered = dispatchPreviewRuntimeAction(runtime, "right");
    expect(entered.player).toMatchObject({ x: 2, y: 2 });
    expect(entered.overlappingTriggerIDs).toEqual(["trigger-door"]);
    expect(entered.variables.entered).toBe(1);

    const left = dispatchPreviewRuntimeAction(entered, "right");
    expect(left.player).toMatchObject({ x: 3, y: 2 });
    expect(left.overlappingTriggerIDs).toEqual([]);
    expect(left.variables.left).toBe(1);
    expect(left.eventLog.map((entry) => entry.eventName)).toEqual(expect.arrayContaining(["door_enter", "door_leave"]));
  });

  it("applies persisted camera zones when the player enters their scene-grid area", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-camera",
        name: "camera_lab",
        width: 10,
        height: 10,
        playerActorName: "Player",
        cameraZones: [{
          id: "camera-zone-entry",
          name: "Entrada",
          area: { x: 2, y: 2, width: 2, height: 1 },
          bounds: { x: 8, y: 16, width: 96, height: 64 },
          offset: { x: 4, y: 7 },
          lockX: true,
          lockY: true
        }]
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "camera_lab", x: 1, y: 2 }]
    });

    expect(runtime.activeCameraZoneID).toBeNull();

    const entered = dispatchPreviewRuntimeAction(runtime, "right");
    expect(entered.activeCameraZoneID).toBe("camera-zone-entry");
    expect(entered.camera).toMatchObject({
      x: 8,
      y: 16,
      bounds: { minX: 8, minY: 16, maxX: 104, maxY: 80 }
    });
  });

  it("follows an isometric player using the shared projected pixel coordinate", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-camera-iso",
        name: "camera_iso",
        width: 10,
        height: 10,
        sceneType: "isometric",
        playerActorName: "Player",
        cameraZones: [{
          id: "camera-zone-iso",
          name: "Mapa",
          area: { x: 2, y: 1, width: 1, height: 1 },
          bounds: { x: 0, y: 0, width: 512, height: 256 },
          offset: { x: 0, y: 0 },
          lockX: false,
          lockY: false
        }]
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "camera_iso", x: 1, y: 1 }]
    });

    const entered = dispatchPreviewRuntimeAction(runtime, "right");

    expect(entered.activeCameraZoneID).toBe("camera-zone-iso");
    expect(entered.camera).toMatchObject({ x: 40, y: 0 });
  });

  it("boots an isometric room with the same player framing used after movement", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-camera-iso-boot",
        name: "camera_iso_boot",
        width: 10,
        height: 10,
        sceneType: "isometric",
        playerActorName: "Player",
        cameraZones: [{
          id: "camera-zone-iso-boot",
          name: "Mapa",
          area: { x: 2, y: 1, width: 1, height: 1 },
          bounds: { x: 0, y: 0, width: 512, height: 256 },
          offset: { x: 0, y: 0 },
          lockX: false,
          lockY: false
        }]
      }],
      actors: [{ id: "actor-player-iso-boot", name: "Player", roomName: "camera_iso_boot", x: 2, y: 1 }]
    });

    expect(runtime.activeCameraZoneID).toBe("camera-zone-iso-boot");
    expect(runtime.camera).toMatchObject({ x: 40, y: 0 });
  });

  it("boots preview at a specific room without using the global start scene", () => {
    const runtime = bootPreviewRuntimeAtRoom({
      scenas: [
        { id: "room-start", name: "start", width: 8, height: 8, playerActorName: "Player", eventBindings: { onInit: "boot_start" } },
        { id: "room-alt", name: "vault", width: 8, height: 8, playerActorName: "Player", eventBindings: { onInit: "boot_vault" } }
      ],
      actors: [
        { id: "actor-player-start", name: "Player", roomName: "start", x: 1, y: 1 },
        { id: "actor-player-vault", name: "Player", roomName: "vault", x: 4, y: 4 }
      ],
      events: [
        { id: "event-start", name: "boot_start", category: "Cena", steps: [{ command: "set_variable route 1" }] },
        { id: "event-vault", name: "boot_vault", category: "Cena", steps: [{ command: "set_variable route 2" }] }
      ],
      variables: [{ name: "route" }],
      settings: {
        general: { startScene: "start" }
      }
    }, "vault");

    expect(runtime.currentRoom?.name).toBe("vault");
    expect(runtime.player).toMatchObject({ x: 4, y: 4 });
    expect(runtime.variables.route).toBe(2);
  });

  it("runs actor onUpdate bindings on preview ticks", () => {
    const runtime = createPreviewRuntime({
      scenas: [{ id: "room-1", name: "room_1", width: 6, height: 6, playerActorName: "Player" }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "room_1", x: 1, y: 1 },
        {
          id: "actor-patrol",
          name: "Patrol",
          roomName: "room_1",
          x: 3,
          y: 2,
          eventBindings: { onUpdate: "patrol_tick" }
        }
      ],
      events: [{
        id: "event-patrol",
        name: "patrol_tick",
        category: "Ator",
        steps: [{ command: "add_variable patrol.count 1" }]
      }],
      variables: [{ name: "patrol.count" }]
    });

    const beforeTick = tickPreviewRuntime(runtime, PREVIEW_ACTOR_UPDATE_INTERVAL_MS - 1);
    expect(beforeTick.variables["patrol.count"]).toBeUndefined();

    const afterTick = tickPreviewRuntime(beforeTick, 1);
    expect(afterTick.variables["patrol.count"]).toBe(1);
    expect(afterTick.eventLog.map((entry) => entry.eventName)).toContain("patrol_tick");
  });

  it("abre o menu Start, navega até Salvar e persiste o estado do preview", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        { id: "room-1", name: "room_1", width: 8, height: 8, playerActorName: "Player" },
        { id: "room-2", name: "room_2", width: 8, height: 8 }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 3, y: 3 }],
      settings: {
        general: { defaultLanguage: "pt-BR", startScene: "room_1" },
        save: { manualSave: true }
      }
    });

    const opened = dispatchPreviewRuntimeAction(runtime, "start");
    expect(opened.startMenu).toMatchObject({ visible: true, page: "root", selectedIndex: 0 });

    let saveSelection = opened;
    for (let index = 0; index < 4; index += 1) saveSelection = dispatchPreviewRuntimeAction(saveSelection, "down");
    const saved = dispatchPreviewRuntimeAction(saveSelection, "action");
    expect(saved.saveSlots[1]).toMatchObject({ inventory: {}, variables: {} });
    expect(saved.startMenu).toMatchObject({ visible: true, page: "root", notice: "Jogo salvo no slot 1." });

    const closed = dispatchPreviewRuntimeAction(saved, "back");
    expect(closed.startMenu.visible).toBe(false);
  });

  it("expõe o fluxo completo do Menu Start/Pausa sem depender de flags globais", () => {
    const runtime = createPreviewRuntime({
      scenas: [
        { id: "room-1", name: "room_1", width: 8, height: 8, playerActorName: "Player", eventBindings: { onInit: "boot" } },
        { id: "room-2", name: "room_2", width: 8, height: 8 }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 3, y: 3 }],
      events: [{ id: "event-boot", name: "boot", category: "Cena", steps: [{ command: "add_item potion 2" }] }],
      settings: { uiDialogs: { startMenuShowInventory: false, startMenuShowMap: false } }
    });

    const opened = dispatchPreviewRuntimeAction(runtime, "start");
    expect(previewRuntimeStartMenuItems(opened).map((item) => item.label)).toEqual([
      "Missões",
      "Inventário",
      "Mapa",
      "Perfil/equipe",
      "Salvar",
      "Configurações",
      "Voltar"
    ]);
  });

  it("exibe o resumo da campanha da cena no Menu Start", () => {
    const project = {
      scenas: [
        {
          id: "room-port",
          name: "port",
          displayName: "Jogo · Porto de Lúmen",
          sceneType: "topdown",
          width: 16,
          height: 12,
          playerActorName: "Player",
          eventBindings: { onInit: "boot" },
          campaign: {
            chapter: 2,
            title: "Capítulo 1 · Porto de Lúmen",
            objective: "Encontrar a estrutura da aeronave e falar com a mecânica.",
            nextScene: "route",
            completionVariable: "farolParts.frame",
            success: "Recuperar a estrutura e abrir a rota das falésias.",
            failureRecovery: "A saída mostra o objetivo pendente sem remover o progresso."
          }
        },
        {
          id: "room-route",
          name: "route",
          displayName: "Capítulo 1 · Rota dos Faróis",
          sceneType: "world_map",
          width: 16,
          height: 12
        }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "port", x: 3, y: 3 }],
      variables: [{ name: "var-frame", displayName: "farolParts.frame" }],
      events: [{ id: "event-boot", name: "boot", steps: [{ command: "set_variable var-frame 0" }] }],
      settings: { general: { startScene: "port" } }
    };

    const runtime = dispatchPreviewRuntimeAction(createPreviewRuntime(project), "start");
    const missions = dispatchPreviewRuntimeAction(runtime, "action");

    expect(previewRuntimeStartMenuItems(missions)).toEqual([
      { id: "campaign-title", label: "Capítulo", detail: "Capítulo 1 · Porto de Lúmen", enabled: false },
      { id: "campaign-objective", label: "Objetivo", detail: "Encontrar a estrutura da aeronave e falar com a mecânica.", enabled: false },
      { id: "campaign-status", label: "Estado", detail: "Em andamento", enabled: false },
      { id: "campaign-next", label: "Próximo destino", detail: "Capítulo 1 · Rota dos Faróis", enabled: false },
      { id: "back", label: "Voltar" }
    ]);
  });

  it("marca a missão da cena como concluída pela variável de progresso", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-port",
        name: "port",
        displayName: "Porto de Lúmen",
        sceneType: "topdown",
        width: 16,
        height: 12,
        playerActorName: "Player",
        eventBindings: { onInit: "boot" },
        campaign: {
          chapter: 2,
          title: "Capítulo 1 · Porto de Lúmen",
          objective: "Encontrar a estrutura.",
          nextScene: "route",
          completionVariable: "farolParts.frame",
          success: "Rota aberta.",
          failureRecovery: "Tente novamente."
        }
      }, {
        id: "room-route",
        name: "route",
        displayName: "Rota dos Faróis",
        sceneType: "world_map",
        width: 16,
        height: 12
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "port", x: 3, y: 3 }],
      variables: [{ name: "var-frame", displayName: "farolParts.frame" }],
      events: [{ id: "event-boot", name: "boot", steps: [{ command: "set_variable var-frame 1" }] }],
      settings: { general: { startScene: "port" } }
    });

    const opened = dispatchPreviewRuntimeAction(runtime, "start");
    const missions = dispatchPreviewRuntimeAction(opened, "action");

    expect(previewRuntimeStartMenuItems(missions)).toContainEqual({
      id: "campaign-status",
      label: "Estado",
      detail: "Concluída",
      enabled: false
    });
  });

  it("avança a campanha no Preview ao executar o comando explícito", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-port",
        name: "port",
        displayName: "Porto de Lúmen",
        sceneType: "topdown",
        width: 16,
        height: 12,
        playerActorName: "Player",
        campaign: {
          chapter: 2,
          title: "Capítulo 1 · Porto de Lúmen",
          objective: "Encontrar a estrutura.",
          nextScene: "route",
          completionVariable: "story.progress",
          completedValue: 2,
          controls: "A confirma.",
          success: "Rota aberta.",
          failureRecovery: "Tente novamente.",
          tutorialDialogue: null
        }
      }, {
        id: "room-route",
        name: "route",
        displayName: "Rota dos Faróis",
        sceneType: "world_map",
        width: 16,
        height: 12
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "port", x: 3, y: 3 }],
      variables: [{ name: "progress", displayName: "story.progress", initialValue: 0 }],
      events: [{ id: "event-finish", name: "finish", roomName: "port", steps: [{ command: "advance_campaign" }] }],
      settings: { general: { startScene: "port" } }
    });

    const advanced = runPreviewRuntimeEvent(runtime, "finish");

    expect(advanced.currentRoom?.name).toBe("route");
    expect(advanced.variables.progress).toBe(2);
    expect(advanced.eventLog.at(-1)).toMatchObject({
      command: "advance_campaign",
      result: "room",
      detail: "route"
    });
    expect(advanced.eventLog.some((entry) => entry.detail === "Rota aberta.")).toBe(true);
  });

  it("usa a entrada da conexão ao posicionar o jogador após avançar a campanha", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-port",
        name: "port",
        sceneType: "topdown",
        width: 16,
        height: 12,
        playerActorName: "Player",
        campaign: {
          chapter: 2,
          title: "Capítulo 1 · Porto de Lúmen",
          objective: "Encontrar a estrutura.",
          nextScene: "route",
          completionVariable: "story.progress",
          completedValue: 2,
          controls: "A confirma.",
          success: "Rota aberta.",
          failureRecovery: "Tente novamente.",
          tutorialDialogue: null
        }
      }, {
        id: "room-route",
        name: "route",
        sceneType: "topdown",
        width: 16,
        height: 12,
        playerActorName: "Player"
      }],
      actors: [
        { id: "actor-port-player", name: "Player", roomName: "port", x: 3, y: 3 },
        { id: "actor-route-player", name: "Player", roomName: "route", x: 8, y: 6 }
      ],
      variables: [{ name: "progress", displayName: "story.progress", initialValue: 0 }],
      events: [{ id: "event-finish", name: "finish", roomName: "port", steps: [{ command: "advance_campaign" }] }],
      editorState: {
        scenaConnections: [{
          from: "port",
          to: "route",
          entry: { x: 0, y: 4, width: 1, height: 1 }
        }]
      },
      settings: { general: { startScene: "port" } }
    });

    const advanced = runPreviewRuntimeEvent(runtime, "finish");

    expect(advanced.currentRoom?.name).toBe("route");
    expect(advanced.player).toMatchObject({ x: 1, y: 4, direction: "right" });
  });

  it("mantém a cena e registra diagnóstico quando a campanha não possui destino válido", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-port",
        name: "port",
        sceneType: "topdown",
        width: 16,
        height: 12,
        campaign: {
          chapter: 2,
          title: "Capítulo 1",
          objective: "Encontrar a estrutura.",
          nextScene: "missing",
          completionVariable: "progress",
          completedValue: 1,
          controls: "A confirma.",
          success: "Rota aberta.",
          failureRecovery: "A saída permanece bloqueada.",
          tutorialDialogue: null
        }
      }],
      variables: [{ name: "progress", initialValue: 0 }],
      events: [{ id: "event-finish", name: "finish", roomName: "port", steps: [{ command: "advance_campaign" }] }],
      settings: { general: { startScene: "port" } }
    });

    const blocked = runPreviewRuntimeEvent(runtime, "finish");

    expect(blocked.currentRoom?.name).toBe("port");
    expect(blocked.variables.progress).toBeUndefined();
    expect(blocked.diagnostics.at(-1)?.message).toContain("sala missing não encontrada");
    expect(blocked.eventLog.at(-1)).toMatchObject({
      result: "unsupported",
      detail: "Sala de campanha não encontrada: missing."
    });
  });

  it("reproduz quests e loja topdown configuradas no Preview", () => {
    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-port",
        name: "port",
        sceneType: "topdown",
        width: 16,
        height: 12,
        playerActorName: "Player",
        eventBindings: { onInit: "boot" },
        runtime: {
          type: "topdown",
          config: {
            modules: [
              { id: "movement", enabled: true, settings: {} },
              { id: "inventory", enabled: true, settings: {} },
              {
                id: "quests",
                enabled: true,
                settings: {
                  stateVariable: 0,
                  activeValue: 1,
                  completedValue: 2,
                  objectiveItem: 2,
                  objectiveQuantity: 1,
                  rewardItem: 1,
                  rewardQuantity: 1
                }
              },
              {
                id: "shop",
                enabled: true,
                settings: {
                  label: "KIT REPARO",
                  item: 3,
                  currencyItem: 0,
                  price: 1,
                  stockVariable: 1,
                  stock: 1
                }
              }
            ]
          }
        }
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "port", x: 3, y: 3 }],
      variables: [{ name: "quest.state" }, { name: "shop.stock" }],
      events: [{
        id: "event-boot",
        name: "boot",
        steps: [
          { command: "set_variable quest.state 1" },
          { command: "set_variable shop.stock 0" },
          { command: "add_item 2 1" },
          { command: "add_item 0 2" }
        ]
      }],
      settings: { general: { startScene: "port" } }
    });

    const beforeCompletion = tickPreviewRuntime(runtime, 1000);
    expect(beforeCompletion.variables["quest.state"]).toBe(2);
    expect(beforeCompletion.inventory["2"]).toBe(0);
    expect(beforeCompletion.inventory["1"]).toBe(1);

    const opened = dispatchPreviewRuntimeAction(beforeCompletion, "start");
    expect(previewRuntimeStartMenuItems(opened).map((item) => item.label)).toContain("Loja");

    let shop = opened;
    shop = dispatchPreviewRuntimeAction(shop, "down");
    shop = dispatchPreviewRuntimeAction(shop, "down");
    shop = dispatchPreviewRuntimeAction(shop, "action");
    expect(shop.startMenu.page).toBe("shop");
    expect(previewRuntimeStartMenuItems(shop)).toMatchObject([
      { label: "KIT REPARO", detail: "1/1 · $1", enabled: true },
      { label: "Voltar" }
    ]);

    const purchased = dispatchPreviewRuntimeAction(shop, "action");
    expect(purchased.inventory["0"]).toBe(1);
    expect(purchased.inventory["3"]).toBe(1);
    expect(purchased.variables["shop.stock"]).toBe(1);
    expect(purchased.startMenu.notice).toBe("Compra realizada: KIT REPARO.");
    expect(previewRuntimeStartMenuItems(purchased)[0]).toMatchObject({ enabled: false, detail: "0/1 · $1" });
  });

  it("executa verbo de plugin reescrito no preview runtime", () => {
    const plugin = loadedPluginFromManifest({
      id: "acme/custom-events",
      type: "eventCommandPack",
      version: "1.0.0",
      gbaStudioVersion: ">=0.1.0",
      name: "Custom Events",
      author: "Acme",
      description: "Eventos customizados.",
      commands: [
        {
          id: "custom_wait",
          title: "Espera customizada",
          category: "Plugin",
          commandTemplate: "acme_wait {value}",
          export: {
            op: "wait",
            opcode: "Wait",
            arg0Token: 1
          }
        }
      ]
    }, "/tmp/acme/custom-events", "/tmp/acme/custom-events/plugin.json");

    if (!plugin) throw new Error("plugin ausente");

    const runtime = createPreviewRuntime({
      scenas: [{
        id: "room-1",
        name: "room_1",
        width: 4,
        height: 4,
        playerActorName: "Player",
        onInitEventName: "boot"
      }],
      actors: [{ id: "actor-player", name: "Player", roomName: "room_1", x: 1, y: 1 }],
      events: [{
        id: "event-boot",
        name: "boot",
        category: "Cena",
        steps: [{ command: "acme_wait 12" }]
      }]
    }, { pluginRegistry: buildProjectPluginRegistry([plugin]) });

    expect(runtime.eventLog.some((entry) => entry.command === "wait 12" && entry.result === "script")).toBe(true);
  });
});
