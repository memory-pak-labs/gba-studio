import { describe, expect, it } from "vitest";

import {
  addMenuSceneItem,
  deriveMenuSceneEditorPreview,
  moveMenuSceneItem,
  normalizeMenuSceneConfig,
  removeMenuSceneItem,
  updateMenuSceneItem
} from "./menuScene.js";

describe("menu scene contract", () => {
  it("preserves bounded detail text and a per-screen RGB555 ink color", () => {
    const config = normalizeMenuSceneConfig({ hudTextColor: 3171, items: [{id:'cell', detailLines:['Energia do', 'farol', 'Usina', 'ignored']}] });
    expect(config.hudTextColor).toBe(3171);
    expect(config.items[0].detailLines).toEqual(['Energia do', 'farol', 'Usina']);
    expect(normalizeMenuSceneConfig({items:[{}]})).not.toHaveProperty('hudTextColor');
  });
  it("preserves a focused destination item only for screen navigation", () => {
    const config = normalizeMenuSceneConfig({
      screenType: "menu",
      items: [
        { id: "language", action: "push_screen", targetScreenID: "settings", targetItemID: " language " },
        { id: "settings", action: "open_screen", targetScreenID: "settings", targetItemID: "" },
        { id: "noop", action: "select", targetItemID: "language" }
      ]
    });
    expect(config.items[0].targetItemID).toBe("language");
    expect(config.items[1]).not.toHaveProperty("targetItemID");
    expect(config.items[2]).not.toHaveProperty("targetItemID");
  });

  it("derives the editor preview from the same menu state defaults", () => {
    const preview = deriveMenuSceneEditorPreview({
      screenType: "menu",
      role: "name_input",
      title: "Nome do jogador",
      textInput: {
        variableName: "player.name",
        maxLength: 6,
        x: 10,
        y: 5,
        width: 8,
        keyboard: {
          layout: "grid",
          x: 4,
          y: 8,
          width: 22,
          height: 6,
          allowLowercase: false
        }
      },
      items: [
        { id: "name", label: "Nome", enabled: false },
        { id: "done", label: "Confirmar", enabled: true }
      ]
    });

    expect(preview).toMatchObject({
      screenType: "menu",
      role: "name_input",
      title: "Nome do jogador",
      selectedItemID: "name",
      items: [
        { id: "name", selected: true, enabled: false },
        { id: "done", selected: false, enabled: true }
      ],
      textInput: {
        variableName: "player.name",
        maxLength: 6,
        slots: ["_", "_", "_", "_", "_", "_"],
        cursorIndex: 0,
        keyboard: {
          letterRows: [
            ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
            ["K", "L", "M", "N", "O", "P", "Q", "R", "S", "T"],
            ["U", "V", "W", "X", "Y", "Z", "", "", "", ""]
          ],
          controls: [
            { id: "backspace", label: "BACK", enabled: true },
            { id: "case", label: "UPPR", enabled: false },
            { id: "done", label: "DONE", enabled: true }
          ]
        }
      }
    });
  });

  it("normalizes logo, title and custom menu screen fields", () => {
    expect(normalizeMenuSceneConfig({
      screenType: "logo",
      title: "  Studio  ",
      autoAdvanceFrames: 99999,
      allowSkip: false,
      nextScreenID: "  title  ",
      titleOverlayAssetName: "  farol-title.png  ",
      titleFadeFrames: 99999,
      items: []
    })).toEqual({
      screenType: "logo",
      role: "logo",
      title: "Studio",
      autoAdvanceFrames: 3600,
      allowSkip: false,
      nextScreenID: "title",
      titleOverlayAssetName: "farol-title.png",
      titleFadeFrames: 3600,
      menuProfile: "initial",
      presentationMode: "scene",
      entryPolicy: "title",
      returnPolicy: "title",
      suspendsGameplay: false,
      items: []
    });

    expect(normalizeMenuSceneConfig({
      screenType: "menu",
      role: "initial",
      hudPresetId: "  hud-menu-advanced  "
    })).toMatchObject({
      hudPresetId: "hud-menu-advanced"
    });

    expect(normalizeMenuSceneConfig({
      screenType: "menu",
      role: "save",
      hudMode: "none",
      hudPresetId: "hud-menu-advanced"
    })).toMatchObject({
      hudMode: "none"
    });
    expect(normalizeMenuSceneConfig({
      screenType: "menu",
      role: "save",
      hudMode: "none",
      hudPresetId: "hud-menu-advanced"
    })).not.toHaveProperty("hudPresetId");

    expect(normalizeMenuSceneConfig({
      screenType: "title",
      title: "Title Screen",
      titleOverlayAssetName: "title-logo.png",
      titleFadeFrames: -3,
      items: [{
        id: " start ",
        label: " Press Start ",
        dialogueKey: " title_press_start ",
        action: "push_screen",
        targetScreenID: " options ",
        enabled: true,
        clickBox: { x: -5, y: 140, width: 999, height: 0 }
      }]
    })).toMatchObject({
      screenType: "title",
      role: "title",
      title: "Title Screen",
      titleOverlayAssetName: "title-logo.png",
      titleFadeFrames: 0,
      items: [{
        id: "start",
        label: "Press Start",
        action: "push_screen",
        targetScreenID: "options",
        dialogueKey: "title_press_start",
        enabled: true,
        clickBox: { x: 0, y: 140, width: 240, height: 1 }
      }]
    });
  });

  it("normalizes a bounded background animation for title screens", () => {
    expect(normalizeMenuSceneConfig({
      screenType: "title",
      backgroundAnimation: {
        frameAssetNames: [
          " title-frame-00.png ",
          "title-frame-01.png",
          "title-frame-01.png",
          "title-frame-02.png"
        ],
        frameDuration: 0,
        loop: false
      }
    })).toMatchObject({
      backgroundAnimation: {
        frameAssetNames: ["title-frame-00.png", "title-frame-01.png", "title-frame-02.png"],
        frameDuration: 1,
        loop: false
      }
    });
  });

  it("preserves HUD bindings on embedded menu screens", () => {
    expect(normalizeMenuSceneConfig({
      screenType: "menu",
      screens: [{
        id: "settings",
        screenType: "menu",
        title: "Configurações",
        hudPresetId: "hud-settings",
        items: []
      }]
    }).screens).toEqual([
      expect.objectContaining({ id: "settings", hudPresetId: "hud-settings" })
    ]);
  });

  it("preserves the carousel presentation on an embedded title menu", () => {
    const config = normalizeMenuSceneConfig({
      screenType: "title",
      screens: [
        { id: "title", screenType: "title", items: [{ id: "start", label: "PRESS START", action: "push_screen", targetScreenID: "title_options" }] },
        { id: "title_options", screenType: "menu", carousel: true, items: [{ id: "new-game", label: "Novo jogo" }] }
      ]
    });
    expect(config.screens?.[1]).toMatchObject({ id: "title_options", carousel: true });
  });

  it("provides the approved Start Menu actions without changing the screen runtime type", () => {
    const config = normalizeMenuSceneConfig({
      screenType: "menu",
      role: "start",
      title: "Menu Start"
    });

    expect(config).toMatchObject({
      screenType: "menu",
      role: "start",
      title: "Menu Start"
    });
    expect(config.items.map((item) => ({ id: item.id, label: item.label, action: item.action }))).toEqual([
      { id: "missions", label: "Missões", action: "select" },
      { id: "inventory", label: "Inventário", action: "select" },
      { id: "map", label: "Mapa", action: "select" },
      { id: "profile", label: "Perfil/equipe", action: "select" },
      { id: "save", label: "Salvar", action: "select" },
      { id: "back", label: "Voltar", action: "select" }
    ]);
    expect(config.items.map((item) => item.clickBox)).toEqual([
      { x: 64, y: 48, width: 120, height: 18 },
      { x: 64, y: 68, width: 120, height: 18 },
      { x: 64, y: 88, width: 120, height: 18 },
      { x: 64, y: 108, width: 120, height: 18 },
      { x: 64, y: 128, width: 120, height: 18 },
      { x: 64, y: 148, width: 120, height: 12 }
    ]);
  });

  it("preserves dedicated gender and player-name roles", () => {
    const gender = normalizeMenuSceneConfig({
      screenType: "menu",
      role: "gender_select",
      title: "Escolha o gênero",
      items: [{ id: "male", label: "Homem" }]
    });
    expect(gender).toMatchObject({
      screenType: "menu",
      role: "gender_select",
      items: [{ id: "male", label: "Homem" }]
    });
    expect(gender).not.toHaveProperty("textInput");

    expect(normalizeMenuSceneConfig({
      screenType: "menu",
      role: "name_input",
      title: "Nome do jogador",
      textInput: { variableName: "var_character_name", maxLength: 8, x: 12, y: 6, width: 8 }
    })).toMatchObject({
      screenType: "menu",
      role: "name_input",
      textInput: { variableName: "var_character_name", maxLength: 8, x: 12, y: 6, width: 8 }
    });
  });

  it("normalizes the native GBA name-input keyboard without copying the GB Studio asset", () => {
    expect(normalizeMenuSceneConfig({
      screenType: "menu",
      role: "name_input",
      textInput: {
        variableName: "var_player_name",
        maxLength: 8,
        x: 12,
        y: 6,
        width: 8,
        keyboard: {
          layout: "grid",
          x: 4,
          y: 8,
          width: 24,
          height: 7,
          allowLowercase: true
        }
      }
    }).textInput).toEqual({
      variableName: "var_player_name",
      maxLength: 8,
      x: 12,
      y: 6,
      width: 8,
      keyboard: {
        layout: "grid",
        x: 4,
        y: 8,
        width: 24,
        height: 7,
        allowLowercase: true
      }
    });

    expect(normalizeMenuSceneConfig({
      screenType: "menu",
      role: "name_input",
      textInput: { variableName: "var_player_name" }
    }).textInput?.keyboard).toEqual({
      layout: "grid",
      x: 4,
      y: 8,
      width: 22,
      height: 6,
      allowLowercase: true
    });
  });

  it("preserves the side controls reserved by the dedicated name-input layout", () => {
    expect(normalizeMenuSceneConfig({
      screenType: "menu",
      role: "name_input",
      textInput: {
        variableName: "var_player_name",
        keyboard: {
          layout: "grid",
          x: 1,
          y: 8,
          width: 24,
          height: 6,
          allowLowercase: true,
          controlLayout: "side",
          controlsX: 25,
          controlsY: 8,
          controlsWidth: 5,
          controlsHeight: 6
        }
      }
    }).textInput?.keyboard).toEqual({
      layout: "grid",
      x: 1,
      y: 8,
      width: 24,
      height: 6,
      allowLowercase: true,
      controlLayout: "side",
      controlsX: 25,
      controlsY: 8,
      controlsWidth: 5,
      controlsHeight: 6
    });
  });

  it("derives one modal surface for the name field and the side keyboard", () => {
    const preview = deriveMenuSceneEditorPreview({
      screenType: "menu",
      role: "name_input",
      title: "Nome do jogador",
      textInput: {
        variableName: "var_player_name",
        maxLength: 8,
        x: 12,
        y: 6,
        width: 8,
        keyboard: {
          layout: "grid",
          x: 3,
          y: 11,
          width: 22,
          height: 6,
          allowLowercase: true,
          controlLayout: "side",
          controlsX: 25,
          controlsY: 11,
          controlsWidth: 6,
          controlsHeight: 6
        }
      }
    });

    expect(preview.textInput).toMatchObject({
      surface: { x: 10, y: 4, width: 12, height: 4 },
      keyboard: {
        letterRows: [
          ["A", "B", "C", "D", "E", "F", "G", "H"],
          ["I", "J", "K", "L", "M", "N", "O", "P"],
          ["Q", "R", "S", "T", "U", "V", "W", "X"],
          ["Y", "Z", "", "", "", "", "", ""]
        ]
      }
    });
  });

  it("preserves the static-keycap surface mode for authored name-input backgrounds", () => {
    expect(normalizeMenuSceneConfig({
      screenType: "menu",
      role: "name_input",
      textInput: {
        variableName: "var_player_name",
        keyboard: {
          layout: "grid",
          x: 3,
          y: 11,
          width: 22,
          height: 6,
          allowLowercase: true,
          surface: "background",
          controlLayout: "side",
          controlsX: 25,
          controlsY: 11,
          controlsWidth: 5,
          controlsHeight: 6
        }
      }
    }).textInput?.keyboard).toMatchObject({
      layout: "grid",
      x: 3,
      y: 11,
      width: 22,
      height: 6,
      allowLowercase: true,
      surface: "background",
      controlLayout: "side",
      controlsX: 25,
      controlsY: 11,
      controlsWidth: 5,
      controlsHeight: 6
    });
  });

  it("normalizes checkbox bindings and numeric ranges", () => {
    expect(normalizeMenuSceneConfig({
      screenType: "menu",
      items: [{
        id: "music",
        label: "Music",
        action: "toggle_variable",
        variableIndex: 99,
        minValue: 4,
        maxValue: -2,
        step: 0,
        checkedValue: 9,
        clickBox: { x: 12, y: 24, width: 80, height: 16 }
      }]
    }).items[0]).toMatchObject({
      variableIndex: 63,
      minValue: -2,
      maxValue: 4,
      step: 1,
      checkedValue: 4,
      clickBox: { x: 12, y: 24, width: 80, height: 16 }
    });
    expect(normalizeMenuSceneConfig({
      screenType: "menu",
      items: [{ id: "edge", label: "Edge", clickBox: { x: 220, y: 150, width: 50, height: 40 } }]
    }).items[0].clickBox).toEqual({ x: 220, y: 150, width: 20, height: 10 });
  });

  it("normalizes multiple internal screens without turning them into project scenes", () => {
    const config = normalizeMenuSceneConfig({
      screenType: "title",
      title: "Fallback",
      screens: [{
        id: " title ",
        screenType: "title",
        title: " Principal ",
        titleOverlayAssetName: " title-overlay.png ",
        titleFadeFrames: 45,
        onEnterEventName: " title_enter ",
        onBackEventName: " title_back ",
        items: [{ id: "missions", label: "Missões", action: "push_screen", targetScreenID: "missions-1" }]
      }, {
        id: "missions-1",
        screenType: "menu",
        title: "Missões 1/2",
        items: [{ id: "next", label: "Próxima", action: "open_screen", targetScreenID: "missions-2" }]
      }, {
        id: "missions-2",
        screenType: "menu",
        title: "Missões 2/2",
        items: [{ id: "back", label: "Voltar", action: "pop_screen" }]
      }, {
        id: "missions-2",
        screenType: "menu",
        title: "Duplicada"
      }]
    });

    expect(config.screens).toHaveLength(3);
    expect(config.screens?.map((screen) => screen.id)).toEqual(["title", "missions-1", "missions-2"]);
    expect(config.screens?.[0]).toMatchObject({
      title: "Principal",
      titleOverlayAssetName: "title-overlay.png",
      titleFadeFrames: 45,
      onEnterEventName: "title_enter",
      onBackEventName: "title_back",
      items: [{ action: "push_screen", targetScreenID: "missions-1" }]
    });
  });

  it("preserva o callback de voltar para menus que entram por troca de cena", () => {
    expect(normalizeMenuSceneConfig({
      screenType: "menu",
      role: "initial",
      onBackEventName: "  return_to_title  "
    })).toMatchObject({
      role: "initial",
      onBackEventName: "return_to_title"
    });
  });

  it("separa o ciclo de vida inicial do menu durante o jogo e normaliza bindings", () => {
    const initial = normalizeMenuSceneConfig({ screenType: "menu", role: "initial" });
    const inGame = normalizeMenuSceneConfig({
      screenType: "menu",
      role: "start",
      items: [{ id: "inventory", label: "Inventário", binding: { source: "inventory", index: 99, format: "count" } }],
      screens: [{ id: "start", screenType: "menu", title: "Start", items: [] }]
    });

    expect(initial).toMatchObject({ menuProfile: "initial", entryPolicy: "title", returnPolicy: "title", suspendsGameplay: false });
    expect(inGame).toMatchObject({ menuProfile: "in_game", entryPolicy: "gameplay", returnPolicy: "resume", suspendsGameplay: true });
    expect(inGame.items[0]?.binding).toEqual({ source: "inventory", index: 15, format: "count" });
    expect(inGame.screens?.[0]).toMatchObject({ menuProfile: "in_game", entryPolicy: "gameplay", returnPolicy: "resume", suspendsGameplay: true });
    expect(inGame.presentationMode).toBe("scene");
  });

  it("permite manter o HUD legado ou abrir a cena nativa por configuração", () => {
    expect(normalizeMenuSceneConfig({ screenType: "menu", role: "start", presentationMode: "hud" }).presentationMode).toBe("hud");
    expect(normalizeMenuSceneConfig({ screenType: "menu", role: "start", presentationMode: "both" }).presentationMode).toBe("both");
  });

  it("aceita bindings de estado com formato explícito", () => {
    const config = normalizeMenuSceneConfig({
      screenType: "menu",
      items: [{ id: "energy", label: "Energia", binding: { source: "variable", index: 4, format: "percent" } }]
    });
    expect(config.items[0]?.binding).toEqual({ source: "variable", index: 4, format: "percent" });
  });

  it("adds, edits, reorders and removes menu items without mutating the source", () => {
    const source = normalizeMenuSceneConfig({ screenType: "menu", items: [] });
    const added = addMenuSceneItem(source, { id: "start", label: "Start" });
    const withOptions = addMenuSceneItem(added, { id: "options", label: "Options" });
    const updated = updateMenuSceneItem(withOptions, "options", {
      action: "push_screen",
      targetScreenID: "options-page"
    });
    const reordered = moveMenuSceneItem(updated, "options", -1);
    const removed = removeMenuSceneItem(reordered, "start");

    expect(source.items).toEqual([]);
    expect(reordered.items.map((item) => item.id)).toEqual(["options", "start"]);
    expect(reordered.items[0]).toMatchObject({ action: "push_screen", targetScreenID: "options-page" });
    expect(removed.items.map((item) => item.id)).toEqual(["options"]);
  });
});
