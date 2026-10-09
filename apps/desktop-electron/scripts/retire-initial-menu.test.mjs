import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  validateEventBindingSchemaCoverage,
  validateRoomConnectionSchemaCoverage
} from "../../../packages/project-contract/src/index.js";
import { bootPreviewRuntimeAtRoom, dispatchPreviewRuntimeAction } from "../src/shared/previewRuntime.js";
import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";

import { retireInitialMenuScene } from "./retire-initial-menu.mjs";
import { promoteExemploGBAVerticeCampaign } from "./vertice-showcase-project.mjs";

const projectURL = new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url);

describe("título com opções em carrossel", () => {
  it("retira a cena de menu redundante e mantém as cinco rotas no título", () => {
    const project = retireInitialMenuScene(JSON.parse(readFileSync(projectURL, "utf8")));
    const title = project.scenas.find((scene) => scene.name === "titulo");
    const options = title.runtime.config.screens.find((screen) => screen.id === "title_options");

    expect(project.scenas.some((scene) => scene.name === "menu_inicial")).toBe(false);
    expect(project.rooms.map((scene) => scene.name)).toEqual(project.scenas.map((scene) => scene.name));
    expect(options.carousel).toBe(true);
    expect(project.events.find((event) => event.name === "titulo_abrir_menu")?.steps.map((step) => step.command))
      .toEqual(["play_sfx farol_sfx_cursor", "slider title_options"]);
    expect(options.items.map((item) => item.id)).toEqual([
      "new-game", "load-game", "language", "settings", "credits"
    ]);
    expect(options.items.find((item) => item.id === "language")?.targetItemID).toBe("language");
    expect(options.items.find((item) => item.id === "load-game")?.requiresSave).toBe(true);
    expect(options.items.find((item) => item.id === "new-game")?.eventName).toBe("titulo_novo_jogo");
    expect(project.events.find((event) => event.name === "titulo_novo_jogo")?.steps.map((step) => step.command))
      .toContain("remove_save_game 0");
    expect(project.actors.some((actor) => actor.roomName === "menu_inicial")).toBe(false);
    expect(project.actors.some((actor) => actor.id === "title-carousel-arrow-left" || actor.id === "title-carousel-arrow-right")).toBe(false);
    expect(project.actors.find((actor) => actor.id === "menu-escolha-genero-confirm")?.eventBindings?.onInteract)
      .toBeUndefined();
    expect(project.events.some((event) => event.roomName === "menu_inicial")).toBe(false);
    expect(project.editorState.scenaConnections.filter((connection) => connection.from === "titulo")
      .map((connection) => connection.to)).toEqual([
        "escolha_genero", "carregar_jogo", "configuracoes", "creditos"
      ]);
    expect(project.editorState.sceneExplorer.order).not.toContain("scene-menu_inicial");
    expect(title.campaign.nextScene).toBe("escolha_genero");
    expect(validateRoomConnectionSchemaCoverage(project)).toEqual([]);
    expect(validateEventBindingSchemaCoverage(project)).toEqual([]);
    expect(retireInitialMenuScene(project)).toEqual(project);
  });

  it("preserva o carrossel ao regenerar o projeto exemplo", () => {
    const template = JSON.parse(readFileSync(projectURL, "utf8"));
    const project = promoteExemploGBAVerticeCampaign(template);
    const title = project.scenas.find((scene) => scene.name === "titulo");

    expect(project.scenas).toHaveLength(30);
    expect(project.scenas.some((scene) => scene.name === "menu_inicial")).toBe(false);
    expect(title.runtime.config.screens.map((screen) => screen.id)).toEqual(["title", "title_options"]);
    expect(project.actors.filter((actor) => actor.roomName === "titulo")).toHaveLength(7);
    expect(validateRoomConnectionSchemaCoverage(project)).toEqual([]);
    expect(validateEventBindingSchemaCoverage(project)).toEqual([]);
  });

  it("abre as opções com Start e inicia um novo jogo a partir do título", () => {
    const project = JSON.parse(readFileSync(projectURL, "utf8"));
    let runtime = bootPreviewRuntimeAtRoom(project, "titulo");

    runtime = dispatchPreviewRuntimeAction(runtime, "start");
    expect(runtime.sceneMenu.screenID).toBe("title_options");
    runtime = dispatchPreviewRuntimeAction(runtime, "action");
    expect(runtime.currentRoom?.name).toBe("escolha_genero");
    expect(runtime.eventLog.map((entry) => entry.command)).toContain("remove_save_game 0");
  });

  it("exporta o título e o carrossel sem uma sala de menu separada", () => {
    const project = retireInitialMenuScene(JSON.parse(readFileSync(projectURL, "utf8")));
    const exported = buildEngineExportProjectContract(project);
    expect(exported.menu_project?.screens.map((screen) => screen.name).filter((name) =>
      ["title", "title_options", "menu_inicial"].includes(name)
    )).toEqual(["title", "title_options"]);
    const gender = exported.menu_project?.screens.find((screen) => screen.name === "escolha_genero");
    expect(gender?.items).toHaveLength(2);
    expect(gender?.items[0]).toMatchObject({ target_screen: 3, on_select: expect.arrayContaining([{op: "set_variable", variable: 17, value: 0}]) });
    expect(gender?.items[1]).toMatchObject({ target_screen: 3, on_select: expect.arrayContaining([{op: "set_variable", variable: 17, value: 1}]) });
    expect(gender?.actors?.filter(actor => actor.role === "cursor")).toEqual([
      expect.objectContaining({name: "Moldura de seleção", cursor_follows_option: true, cursor_offset_pixels: {x: 0, y: -1}})
    ]);
  });
});
