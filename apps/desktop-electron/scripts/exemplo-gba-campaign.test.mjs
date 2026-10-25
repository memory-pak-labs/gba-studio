import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";
import { analyzeConditionalSceneFlow } from "../src/shared/conditionalFlowAnalyzer.js";
import {
  bootPreviewRuntimeAtRoom,
  createPreviewRuntime,
  dispatchPreviewRuntimeAction,
  previewRuntimeStartMenuItems,
  rebootPreviewRuntimePreservingSaves,
  runPreviewRuntimeEvent,
  tickPreviewRuntime
} from "../src/shared/previewRuntime.js";
import {
  VERTICE_CAMPAIGN_SCENES,
  VERTICE_PROGRESS_KEYS,
  VERTICE_SUPPORT_SCENES,
  VERTICE_START_SCENE
} from "./vertice-showcase-contract.mjs";
import { promoteExemploGBAVerticeCampaign } from "./vertice-showcase-project.mjs";
import { SHOWCASE_VARIABLES } from './showcase-systems.mjs';
import { LOST_SIGNAL_VARIABLES } from './lost-signal-mission.mjs';
import { FAROL_RELAY } from './farol-relay.mjs';

const templateURL = new URL(
  "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
  import.meta.url
);

let materializedCampaign;
function campaignProject() {
  materializedCampaign ??= promoteExemploGBAVerticeCampaign(JSON.parse(readFileSync(templateURL, "utf8")));
  return structuredClone(materializedCampaign);
}

function commands(project, eventName) {
  return project.events
    .find((event) => event.name === eventName)
    ?.steps.flatMap((step) => step.command.startsWith("call_procedure ") ? commands(project, step.command.split(" ")[1]) : [step.command]) ?? [];
}

describe("campanha canônica O Último Farol", () => {
  it("organiza os quinze capítulos autorais como uma única campanha curta", () => {
    const project = campaignProject();

    expect(project.scenas.slice(0, 6).map((scene) => scene.name)).toEqual([
      "logo", "abertura", "titulo", "prologo", "porto_lumen", "mapa_rota"
    ]);
    expect(project.rooms.map((scene) => scene.name)).toEqual(project.scenas.map((scene) => scene.name));
    expect(project.settings.general).toMatchObject({
      gameTitle: "O Último Farol",
      startScene: "logo",
      startSceneType: "cutscene"
    });
    expect(project.scenas).toHaveLength(VERTICE_CAMPAIGN_SCENES.length + VERTICE_SUPPORT_SCENES.length + 2);
    expect(project.scenas.some((scene) => scene.sceneType === "custom")).toBe(false);

    for (const [chapter, definition] of VERTICE_CAMPAIGN_SCENES.entries()) {
      expect(project.scenas.find((scene) => scene.name === definition.name)).toMatchObject({
        name: definition.name,
        sceneType: definition.runtime,
        campaign: {
          chapter,
          title: definition.title,
          objective: definition.objective,
          nextScene: definition.name === "titulo" ? "escolha_genero" : definition.nextScene,
          completionVariable: definition.completionVariable ?? "",
          completedValue: definition.completedValue ?? 1
        }
      });
    }
  });

  // Each complete export has its own correctness check and the default timeout.
  it.each([
    ["canônico", () => JSON.parse(readFileSync(templateURL, "utf8"))],
    ["reconstruído", campaignProject]
  ])("exporta a habilidade especial de Nara como magic para permitir vencer o Guardião (%s)", (_name, projectFactory) => {
    const exported = buildEngineExportProjectContract(projectFactory());
    const encounter = exported.battle_rpg_project.encounters[0];
    expect(encounter.party[0].abilities).toEqual([
      { kind: "attack", power: 0 }, { kind: "magic", power: 12 }
    ]);
  });

  it("salva a célula da Usina somente depois de esconder o item coletado", () => {
    for (const project of [JSON.parse(readFileSync(templateURL, "utf8")), campaignProject()]) {
      const steps = commands(project, "usina_coletar_celula");
      const hideIndex = steps.indexOf("set_actor_visible usina-energy-cell-v2 false");
      const saveIndex = steps.indexOf("save_game 0");
      expect(hideIndex).toBeGreaterThan(-1);
      expect(saveIndex).toBeGreaterThan(hideIndex);
    }
  });

  it("declara flags de conclusão para as cenas point-and-click da campanha", () => {
    const project = campaignProject();
    const expected = [
      ["armazem_das_mares", "routeFlags.warehouseInspected", "var_warehouse_inspected"],
      ["observatorio_do_farol", "routeFlags.observatoryRead", "var_observatory_read"]
    ];

    for (const [sceneName, completionVariable, variableName] of expected) {
      expect(VERTICE_CAMPAIGN_SCENES.find((scene) => scene.name === sceneName)?.completionVariable)
        .toBe(completionVariable);
      expect(project.scenas.find((scene) => scene.name === sceneName)?.campaign.completionVariable)
        .toBe(completionVariable);
      expect(project.variables.some((variable) => variable.name === variableName)).toBe(true);
    }
  });

  it("parte do menu e mantém somente as transições da rota de Vértice", () => {
    const project = campaignProject();
    const flow = analyzeConditionalSceneFlow(project);

    expect(flow.startScene).toBe("logo");
    expect(flow.unreachableScenes).toEqual([]);
    expect(flow.invalidTransitions).toEqual([]);
    expect(flow.deadEnds).toEqual([]);
    expect(flow.reachableScenes).toHaveLength(VERTICE_CAMPAIGN_SCENES.length + VERTICE_SUPPORT_SCENES.length + 2);
    const sortTransitions = (transitions) => [...transitions].sort((left, right) => (
      left.from.localeCompare(right.from) || left.to.localeCompare(right.to)
    ));
    expect(sortTransitions(project.editorState.scenaConnections.map(({ from, to }) => ({ from, to })))).toEqual(sortTransitions([
      { from: "logo", to: "abertura" },
      { from: "abertura", to: "titulo" },
      { from: "titulo", to: "escolha_genero" },
      { from: "escolha_genero", to: "nome_jogador" },
      { from: "nome_jogador", to: "prologo" },
      { from: "titulo", to: "carregar_jogo" },
      { from: "titulo", to: "configuracoes" },
      { from: "titulo", to: "creditos" },
      { from: "arena_tatica", to: "mercado_suspenso" },
      { from: "porto_lumen", to: "farol_interior" },
      { from: "farol_interior", to: "porto_lumen" },
      {from:"farol_interior",to:"galeria_das_mares"},
      {from:"galeria_das_mares",to:"farol_interior"},
      ...VERTICE_CAMPAIGN_SCENES
        .filter(({ name }) => name !== "titulo" && name !== "mapa_rota")
        .map(({ name, nextScene }) => ({ from: name, to: nextScene })),
      ...["porto_lumen","penedos_vento","armazem_das_mares","observatorio_do_farol","mercado_suspenso","usina_submersa","conselho_guardia","circuito_final"].map(to => ({from:"mapa_rota",to})),
      { from: "mercado_suspenso", to: "arena_tatica" },
      {from:"circuito_final",to:"circuito_perspectiva"},
      {from:"circuito_perspectiva",to:"circuito_final"},
      {from:"galeria_das_mares",to:"sala_mare_vazante"},
      {from:"sala_mare_vazante",to:"galeria_das_mares"}
    ]));
    expect(project.events.every((event) => (
      project.scenas.some((scene) => scene.name === event.roomName)
    ))).toBe(true);

    for (const scene of VERTICE_CAMPAIGN_SCENES) {
      const pointClickExit = ["armazem_das_mares", "observatorio_do_farol"].includes(scene.name);
      const expectedTransition = scene.transitionEvent === "mapa_viajar_penedos"
        ? "change_scene penedos_vento 8 34 right"
        : pointClickExit
          ? "advance_campaign"
        : scene.completionVariable
          ? "advance_campaign"
          : expect.stringMatching(new RegExp(`^change_scene ${scene.nextScene} `));
      if (scene.name !== "titulo") {
        expect(commands(project, scene.transitionEvent)).toEqual(expect.arrayContaining([
          expectedTransition
        ]));
      }
    }
  });

  it("abre o carrossel de opções na Title Screen sem cena redundante", () => {
    const project = campaignProject();
    const title = project.scenas.find((scene) => scene.name === "titulo");
    const titleScreens = title.runtime.config.screens;
    const options = titleScreens.find((screen) => screen.id === "title_options");

    expect(titleScreens.map((screen) => screen.id)).toEqual(["title", "title_options"]);
    expect(titleScreens[0].items).toEqual([
      expect.objectContaining({ id: "start", label: "PRESS START", action: "push_screen", targetScreenID: "title_options", eventName: "titulo_abrir_menu" })
    ]);
    expect(options.carousel).toBe(true);
    expect(options.items.map(({ id, action, targetScreenID }) => ({
      id,
      action,
      targetScreenID
    }))).toEqual([
      { id: "new-game", action: "push_screen", targetScreenID: "escolha_genero" },
      { id: "load-game", action: "push_screen", targetScreenID: "carregar_jogo" },
      { id: "language", action: "push_screen", targetScreenID: "configuracoes" },
      { id: "settings", action: "push_screen", targetScreenID: "configuracoes" },
      { id: "credits", action: "push_screen", targetScreenID: "creditos" }
    ]);
    expect(options.items.map((item) => item.label)).toEqual([
      "Novo jogo",
      "Carregar jogo",
      "Idioma",
      "Configurações",
      "Créditos"
    ]);
    expect(options.items.find((item) => item.id === "new-game")).toMatchObject({
      action: "push_screen",
      targetScreenID: "escolha_genero",
      eventName: "titulo_novo_jogo"
    });
    expect(project.scenas.some((scene) => scene.name === "menu_inicial")).toBe(false);
    for (const [sceneName, fixedTitle] of [["creditos", "CRÉDITOS"], ["menu_start", "PAUSA"]]) {
      const scene = project.scenas.find((scene) => scene.name === sceneName);
      expect(scene.runtime.config.title).toBe("");
      expect(project.assets.find((asset) => asset.name === scene.backgroundAssetName)?.metadata)
        .toMatchObject({ titleBakedIntoBackground: true, fixedTitle, reviewStatus: "approved" });
    }
    expect(project.settings.uiDialogs.startMenuTitle).toBe("O Último Farol");
    expect(JSON.stringify(options)).not.toContain("Ir às falésias");
  });

  it("mantém seis entradas do Menu Start em linhas distintas da HUD", () => {
    const project = campaignProject();
    const items = project.scenas.find(scene => scene.name === "menu_start").runtime.config.items;
    expect(items.map(item => item.id)).toEqual(["missions", "inventory", "map", "save", "settings", "back"]);
    expect(items.map(item => item.clickBox.y)).toEqual([30,44,58,73,87,101]);
    const actors = project.actors.filter(actor => actor.roomName === "menu_start");
    expect(actors).toHaveLength(8);
    expect(actors.filter(actor => actor.menuActorRole === "option").map(actor => actor.menuItemID))
      .toEqual(items.map(item => item.id));
    expect(actors.filter(actor => actor.menuActorRole === "decorative").map(actor => ({
      variable: actor.menuVisibilityVariable,
      value: actor.menuVisibilityValue
    }))).toEqual([
      { variable: "var_character_gender", value: 0 },
      { variable: "var_character_gender", value: 1 }
    ]);
    expect(actors.filter(actor => actor.menuActorRole === "option").every(actor => actor.menuActorSelectedOnly)).toBe(true);
  });

  it("mantém a confirmação de Novo Jogo explícita no título", () => {
    const project = campaignProject();

    expect(commands(project, "titulo_novo_jogo")).toEqual(expect.arrayContaining([
      "remove_save_game 0",
      "set_variable var_character_gender 0",
      "set_variable var_chapter 0",
      "set_variable var_frame 0",
      "set_variable var_campaign_finished 0"
    ]));
    expect(commands(project, "escolha_genero_confirmar")).toEqual([
      "change_scene nome_jogador 21 17 right"
    ]);
    expect(commands(project, "escolha_genero_homem")).toEqual([
      "set_variable var_character_gender 0",
      "change_scene nome_jogador 21 17 right"
    ]);
    expect(commands(project, "escolha_genero_mulher")).toEqual([
      "set_variable var_character_gender 1",
      "change_scene nome_jogador 21 17 right"
    ]);
    const playerName = project.scenas.find((scene) => scene.name === "nome_jogador");
    expect(playerName.runtime.config.textInput).toMatchObject({
      variableName: "var_character_name",
      maxLength: 8
    });
    expect(commands(project, "nome_jogador_confirmar")).toEqual(expect.arrayContaining([
      "set_variable var_chapter 1",
      "change_scene prologo 21 17 right"
    ]));
    expect(commands(project, "nome_jogador_confirmar")).not.toContain("save_game 0");
    expect(commands(project, "prologo_ao_entrar")).toEqual([
      "call_event aplicar_perfil_jogador",
      "save_game 0"
    ]);
    expect(commands(project, "carregar_jogo_slot_1")).toEqual(expect.arrayContaining([
      "if_save_game 0",
      "load_game 0",
      "condition_end"
    ]));
    expect(project.events.some((event) => event.roomName === "menu_inicial")).toBe(false);
  });

  it("executa a inicialização de Novo Jogo antes de abrir a escolha de gênero", () => {
    const project = campaignProject();
    const title = bootPreviewRuntimeAtRoom(project, "titulo");
    const options = dispatchPreviewRuntimeAction(title, "start");

    expect(options.sceneMenu.screenID).toBe("title_options");
    expect(options.sceneMenu.selectedIndex).toBe(0);
    const gender = dispatchPreviewRuntimeAction(options, "action");

    expect(gender.currentRoom?.name).toBe("escolha_genero");
    expect(gender.sceneMenu.stack).toEqual(expect.arrayContaining([
      expect.stringContaining("scene-titulo")
    ]));
    expect(gender.variables.var_character_gender).toBe(0);
    expect(gender.variables.var_chapter).toBe(0);
    expect(gender.eventLog.map((entry) => entry.command)).toEqual(expect.arrayContaining([
      "remove_save_game 0",
      "set_variable var_character_gender 0",
      "set_variable var_chapter 0"
    ]));
  });

  it("encadeia os hotspots point-and-click entre Penedos e Mercado", () => {
    const project = campaignProject();

    expect(commands(project, "penedos_retornar_armazem")).toContain("advance_campaign");
    expect(commands(project, "armazem_das_mares_carta")).toContain("show_dialogue armazem_das_mares_carta");
    expect(commands(project, "observatorio_do_farol_telescopio")).toContain("show_dialogue observatorio_do_farol_telescopio");
    for (const name of ['armazem_das_mares_saida', 'observatorio_do_farol_saida']) {
      const steps = commands(project, name);
      expect(steps[0]).toBe('if_variable var_signal_trip 1');
      expect(steps.slice(-3)).toEqual(['else', 'advance_campaign', 'condition_end']);
    }
  });

  it("monta o fluxo jogável do Mercado Suspenso antes de liberar a usina", () => {
    const project = campaignProject();

    expect(commands(project, "mercado_ao_entrar")).toEqual([
      "if_variable porto_player_health 0", "set_variable porto_player_health 3", "condition_end",
      "play_music farol_falesias",
      "set_camera_property pan_y 0", "remove_button l", "remove_button r",
      "if_variable var_market_shortcut 1", "set_actor_position market-guard-v1 23 3",
      "else", "set_actor_position market-guard-v1 24 3", "condition_end"
    ]);
    expect(commands(project, "mercado_falar_mercador")).toEqual([
      "show_dialogue mercado_objetivo",
      "show_dialogue mercado_mercador"
    ]);
    expect(commands(project, "mercado_abrir_atalho")).toEqual([
      "if_variable var_market_shortcut 0",
      "set_variable var_market_shortcut 1",
      "set_actor_position market-guard-v1 23 3",
      "play_sfx farol_sfx_dialogo",
      "save_game 0",
      "show_dialogue mercado_ponte_organizada",
      "else",
      "show_dialogue mercado_ponte_ja_organizada",
      "condition_end"
    ]);
    expect(commands(project, "mercado_abrir_usina")).toEqual([
      "if_variable var_market_shortcut 1",
      "advance_campaign",
      "else",
      "show_dialogue mercado_saida_bloqueada",
      "condition_end"
    ]);
  });

  it("divide a Usina em exploração, combate e saída até a coleta da célula", () => {
    const project = campaignProject();

    expect(commands(project, "usina_ao_entrar")).toEqual([
      "play_music dungeon_tide",
      "call_event aplicar_perfil_jogador",
      "show_dialogue usina_objetivo",
      "if_variable var_usina_combat_cleared 1",
      "change_scene usina_saida 5 5 down",
      "condition_end"
    ]);
    expect(commands(project, "usina_abrir_combate")).toEqual([
      "if_variable var_usina_combat_cleared 0",
      "change_scene usina_combate 9 3 up",
      "else",
      "change_scene usina_saida 5 5 down",
      "condition_end"
    ]);
    expect(commands(project, "usina_combate_ao_entrar")).toEqual([
      "play_music dungeon_patrol",
      "call_event aplicar_perfil_jogador",
      "show_dialogue usina_combate_objetivo",
      "if_variable var_usina_combat_cleared 1",
      "change_scene usina_saida 5 5 down",
      "condition_end"
    ]);
    expect(commands(project, "usina_vencer_combate")).toEqual([
      "play_sfx dungeon_porta",
      "if_variable var_usina_combat_cleared 0",
      "set_variable var_usina_combat_cleared 1",
      "save_game 0",
      "change_scene usina_saida 5 5 down",
      "else",
      "change_scene usina_saida 5 5 down",
      "condition_end"
    ]);
    expect(commands(project, "usina_saida_ao_entrar")).toEqual([
      "play_music dungeon_tide",
      "call_event aplicar_perfil_jogador",
      "show_dialogue usina_saida_objetivo",
      "if_variable var_energy_cell 1",
      "set_actor_visible usina-energy-cell-v2 false",
      "condition_end"
    ]);
    expect(commands(project, "usina_coletar_celula")).toEqual([
      "play_sfx dungeon_celula",
      "if_variable var_energy_cell 0",
      "set_variable var_energy_cell 1",
      "add_item usina_cell 1",
      "set_actor_visible usina-energy-cell-v2 false",
      "save_game 0",
      "show_dialogue usina_celula_recuperada",
      "else",
      "show_dialogue usina_celula_ja_recuperada",
      "condition_end"
    ]);
    expect(commands(project, "usina_encontrar_guardia")).toEqual([
      "play_sfx dungeon_porta",
      "if_variable var_energy_cell 1",
      "advance_campaign",
      "else",
      "show_dialogue usina_saida_bloqueada",
      "condition_end"
    ]);

    const room = project.scenas.find((scene) => scene.name === "usina_submersa");
    const combatRoom = project.scenas.find((scene) => scene.name === "usina_combate");
    const exitRoom = project.scenas.find((scene) => scene.name === "usina_saida");
    const explorationActors = project.actors.filter((actor) => actor.roomName === "usina_submersa");
    const combatActors = project.actors.filter((actor) => actor.roomName === "usina_combate");
    const exitActors = project.actors.filter((actor) => actor.roomName === "usina_saida");
    const combatDoor = project.triggers.find((trigger) => trigger.id === "trigger-usina-combat-door");
    const combatExit = project.triggers.find((trigger) => trigger.id === "trigger-usina-combat-exit");
    const exit = project.triggers.find((trigger) => trigger.id === "trigger-usina-exit");

    expect(room).toMatchObject({
      width: 11,
      height: 11,
      cameraMode: "fixed_center",
      cameraZoom: 100,
      playerActorName: "",
      backgroundAssetName: "dungeon-approved-exploracao-background.png",
      runtime: { config: { playerStart: { x: 1, y: 9, direction: "up" } } },
      hudPresetId: "hud-usina-exploration-v3"
    });
    expect(combatRoom).toMatchObject({
      sceneType: "dungeonCrawler",
      runtime: {
        type: "dungeonCrawler",
        config: { profile: "usina-submersa-combat-v3", playerStart: { x: 9, y: 3, direction: "up" } }
      },
      hudPresetId: "hud-usina-combat-v3",
      backgroundAssetName: "dungeon-approved-combate-background.png"
    });
    expect(exitRoom).toMatchObject({
      sceneType: "dungeonCrawler",
      runtime: {
        type: "dungeonCrawler",
        config: { profile: "usina-submersa-exit-v3", playerStart: { x: 5, y: 5, direction: "down" } }
      },
      hudPresetId: "hud-usina-exit-v3",
      backgroundAssetName: "dungeon-approved-saida-background.png"
    });
    expect(room.collisionTypes.filter(c=>c==="free")).toHaveLength(51);
    expect(room.collisionTypes[9 * room.width + 1]).toBe("free");
    expect(room.collisionTypes[1 * room.width + 9]).toBe("free");
    expect(explorationActors).toEqual([]);
    expect(combatActors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "usina-sentinel-v2", x: 9, y: 2, width: 1, height: 1 })
    ]));
    expect(exitActors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "usina-energy-cell-v2", x: 5, y: 6 })
    ]));
    expect(combatDoor).toMatchObject({
      roomName: "usina_submersa",
      eventName: "usina_abrir_combate",
      eventBindings: { onEnter: "usina_abrir_combate" }
    });
    expect(combatExit).toMatchObject({
      roomName: "usina_combate",
      eventName: "usina_vencer_combate",
      eventBindings: { onEnter: "usina_vencer_combate" }
    });
    expect(exit).toMatchObject({
      roomName: "usina_saida",
      x: 9,
      y: 1,
      width: 1,
      height: 1,
      eventName: "usina_encontrar_guardia",
      eventBindings: { onEnter: "usina_encontrar_guardia" }
    });
  });

  it("ativa os módulos reutilizáveis das três cenas de gameplay", () => {
    const project = campaignProject();
    const porto = project.scenas.find((scene) => scene.name === "porto_lumen");
    const usina = project.scenas.find((scene) => scene.name === "usina_submersa");
    const usinaCombat = project.scenas.find((scene) => scene.name === "usina_combate");
    const usinaExit = project.scenas.find((scene) => scene.name === "usina_saida");
    const tempestade = project.scenas.find((scene) => scene.name === "tempestade");
    const exported = buildEngineExportProjectContract(project);

    expect(porto?.runtime?.config?.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "inventory", enabled: true }),
      expect.objectContaining({ id: "quests", enabled: true }),
      expect.objectContaining({ id: "shop", enabled: true })
    ]));
    expect(commands(project, "porto_ao_entrar")).toEqual(expect.arrayContaining([
      "call_event aplicar_perfil_jogador",
      "if_variable z_feature_quest_state 0",
      "set_variable z_feature_quest_state 1",
      "set_variable porto_player_health 3",
      "add_item currency_gold 3",
      "set_variable z_feature_shop_stock 0",
      "condition_end"
    ]));
    expect(commands(project, "porto_recuperar_estrutura")).toEqual(expect.arrayContaining([
      "add_item quest_fragment 1"
    ]));
    expect(usina?.runtime?.config?.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "movement", settings: { depthSprites: true } }),
      expect.objectContaining({ id: "compass", enabled: true }),
      expect.objectContaining({ id: "map", enabled: true })
    ]));
    expect(usinaCombat?.runtime?.config?.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "battle",
        enabled: true,
        settings: {
          enemyActor: "Sentinela da Usina",
          enemyName: "SENTINELA",
          maxHp: 3,
          playerDamage: 1,
          enemyDamage: 1,
          rewardItem: 3,
          rewardQuantity: 1
        }
      }),
      expect.objectContaining({ id: "movement", settings: { depthSprites: true } }),
      expect.objectContaining({ id: "compass", enabled: true })
    ]));
    expect(usinaExit?.runtime?.config?.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "inventory",
        enabled: true,
        settings: { item: 2, label: "CELULA", initialQuantity: 0, healAmount: 1 }
      }),
      expect.objectContaining({ id: "movement", settings: { depthSprites: true } }),
      expect.objectContaining({ id: "compass", enabled: true }),
      expect.objectContaining({ id: "map", enabled: true })
    ]));
    expect(tempestade?.runtime?.config?.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "score", enabled: true }),
      expect.objectContaining({ id: "waves", enabled: true })
    ]));
    expect(exported.topdown_project).toMatchObject({
      inventory_enabled: true,
      quests_enabled: true,
      shop_enabled: true,
      quests: [{ state_variable: 17, objective_item: 2, reward_item: 1 }],
      shop_items: [{ label: "FERRAMENTA", item: 6, currency_item: 0, price: 4, stock_variable: project.variables.findIndex(v => v.name === "var_tool_stock"), stock: 1 }]
    });
    expect(exported.topdown_project.rooms[0].on_enter).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: "attach_button_event", button: "start" })
    ]));
    expect(exported.shmup_project).toMatchObject({
      score_enabled: true,
      high_score_enabled: true,
      initial_score: 0,
      initial_lives: 3,
      waves_enabled: true,
      max_waves: 2,
      loop_waves: false
    });
    expect(exported.dungeon_crawler_project).toMatchObject({
      inventory_enabled: true,
      battle_enabled: true,
      compass_enabled: true,
      map_enabled: true,
      depth_sprites_enabled: true,
      inventory_items: [{ label: "CELULA", item: 2, initial_quantity: 0, heal_amount: 1 }],
      battle: {
        enemy_name: "SENTINELA",
        enemy_actor_index: 0,
        max_hp: 3,
        player_damage: 1,
        enemy_damage: 1,
        reward_item: 3,
        reward_quantity: 1
      }
    });
    expect(exported.dungeon_crawler_project.dialogue_ui?.hud_scene_bindings).toEqual(expect.arrayContaining([
      { scene_name: "usina_submersa", preset_id: "hud-usina-exploration-v3" },
      { scene_name: "usina_combate", preset_id: "hud-usina-combat-v3" },
      { scene_name: "usina_saida", preset_id: "hud-usina-exit-v3" }
    ]));
  });

  it("persiste uma única progressão compartilhada até a corrida final", () => {
    const project = campaignProject();
    let runtime = bootPreviewRuntimeAtRoom(project, "prologo");

    runtime = runPreviewRuntimeEvent(runtime, "titulo_novo_jogo");
    runtime = runPreviewRuntimeEvent(runtime, "prologo_partir");
    runtime = runPreviewRuntimeEvent(runtime, "porto_recuperar_estrutura");
    runtime = runPreviewRuntimeEvent(runtime, "porto_abrir_mapa");
    runtime = runPreviewRuntimeEvent(runtime, "mapa_escolher_penedos");
    runtime = runPreviewRuntimeEvent(runtime, "penedos_retornar_armazem");
    runtime = runPreviewRuntimeEvent(runtime, "armazem_das_mares_saida");
    runtime = runPreviewRuntimeEvent(runtime, "observatorio_do_farol_saida");
    runtime = runPreviewRuntimeEvent(runtime, "mercado_ao_entrar");
    runtime = runPreviewRuntimeEvent(runtime, "mercado_falar_mercador");
    runtime = runPreviewRuntimeEvent(runtime, "mercado_abrir_atalho");
    runtime = runPreviewRuntimeEvent(runtime, "mercado_abrir_usina");
    runtime = runPreviewRuntimeEvent(runtime, "usina_ao_entrar");
    runtime = runPreviewRuntimeEvent(runtime, "usina_abrir_combate");
    runtime = runPreviewRuntimeEvent(runtime, "usina_combate_ao_entrar");
    runtime = runPreviewRuntimeEvent(runtime, "usina_vencer_combate");
    runtime = runPreviewRuntimeEvent(runtime, "usina_saida_ao_entrar");
    runtime = runPreviewRuntimeEvent(runtime, "usina_coletar_celula");
    runtime = runPreviewRuntimeEvent(runtime, "usina_encontrar_guardia");
    runtime = runPreviewRuntimeEvent(runtime, "conselho_confirmar_alianca");
    runtime = runPreviewRuntimeEvent(runtime, "tempestade_alcancar_rele");
    runtime = runPreviewRuntimeEvent(runtime, "guardiao_vitoria");
    runtime = runPreviewRuntimeEvent(runtime, "arena_vencer_rival");
    runtime = runPreviewRuntimeEvent(runtime, "circuito_concluir");
    for(let i=0;i<20;i++)runtime=tickPreviewRuntime(runtime,100);

    expect(runtime.currentRoom?.name).toBe("titulo");
    expect(runtime.variables).toMatchObject({
      var_chapter: 2,
      var_frame: 1,
      var_energy_cell: 1,
      var_usina_combat_cleared: 1,
      var_grip: 1,
      var_shield: 1,
      var_boost: 1,
      var_guardian_bond: 1,
      var_active_route: 1,
      var_market_shortcut: 1,
      var_relay_cleared: 1,
      var_campaign_finished: 1
    });
    expect(runtime.saveSlots[0]).toMatchObject({
      roomName: "circuito_final",
      variables: expect.objectContaining({ var_campaign_finished: 1 })
    });
    expect(runtime.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);

    const rebooted = rebootPreviewRuntimePreservingSaves(runtime);
    const loaded = runPreviewRuntimeEvent(rebooted, "carregar_jogo_slot_1");

    expect(loaded.currentRoom?.name).toBe("circuito_final");
    expect(loaded.variables).toMatchObject({ var_campaign_finished: 1 });
    expect(loaded.player).toMatchObject({
      spriteSheet: "racing-approved-overhead-nara.png",
      animationName: "idle_up"
    });
  });

  it("abre a cena de Missões pelo Menu Start do Preview", () => {
    const project = campaignProject();
    let runtime = bootPreviewRuntimeAtRoom(project, "prologo");

    runtime = runPreviewRuntimeEvent(runtime, "titulo_novo_jogo");
    runtime = runPreviewRuntimeEvent(runtime, "prologo_partir");
    expect(runtime.currentRoom?.name).toBe("porto_lumen");

    runtime = dispatchPreviewRuntimeAction(runtime, "start");
    runtime = dispatchPreviewRuntimeAction(runtime, "action");

    expect(runtime.currentRoom?.name).toBe("missoes");
    expect(previewRuntimeStartMenuItems(runtime)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "next", label: "OBJETIVO", enabled: true }),
      { id: "back", label: "VOLTAR", enabled: true }
    ]));
  });

  it("usa o sprite aprovado de Porto Lumen para o player nos dois perfis", () => {
    const project = campaignProject();
    const approvedPlayer = project.assets.find((asset) => asset.name === "porto-nara-animations48.png");
    const playerAnimations = project.animations.filter((animation) => (
      animation.spriteSheet === "porto-nara-animations48.png"
    ));

    expect(approvedPlayer?.metadata).toMatchObject({
      frameWidth: 32,
      frameHeight: 48,
      reviewStatus: "approved"
    });
    expect(playerAnimations).toHaveLength(8);
    expect(commands(project, "aplicar_perfil_jogador")).toEqual([
      "if_scene porto_lumen",
      "call_event aplicar_perfil_jogador_base"
    ]);
    expect(commands(project, "aplicar_perfil_jogador_base")).toEqual([
      "change_player_sprite porto-nara-animations48.png",
      "set_actor_animation Player idle_down",
    ]);

    let runtime = bootPreviewRuntimeAtRoom(project, "porto_lumen");
    runtime = runPreviewRuntimeEvent(runtime, "escolha_genero_mulher");
    expect(runtime.currentRoom?.name).toBe("nome_jogador");
    runtime = { ...bootPreviewRuntimeAtRoom(project, "porto_lumen"), variables: runtime.variables };
    runtime = runPreviewRuntimeEvent(runtime, "aplicar_perfil_jogador");
    expect(runtime.player).toMatchObject({
      spriteSheet: "porto-nara-animations48.png",
      animationName: "idle_down"
    });
    expect(runtime.variables.var_character_gender).toBe(1);

    runtime = runPreviewRuntimeEvent(runtime, "escolha_genero_homem");
    expect(runtime.currentRoom?.name).toBe("nome_jogador");
    runtime = { ...bootPreviewRuntimeAtRoom(project, "porto_lumen"), variables: runtime.variables };
    runtime = runPreviewRuntimeEvent(runtime, "aplicar_perfil_jogador");
    expect(runtime.player).toMatchObject({
      spriteSheet: "porto-nara-animations48.png",
      animationName: "idle_down"
    });
    expect(runtime.variables.var_character_gender).toBe(0);
  });

  it("exporta todos os runtimes, incluindo luta, numa ROM mista", () => {
    const exported = buildEngineExportProjectContract(campaignProject());

    expect(exported.kind).toBe("mixed");
    expect(exported.runtime_dispatch).toMatchObject({ initial_runtime: "cutscene" });
    expect(exported.runtime_dispatch.runtimes).toEqual(expect.arrayContaining([
      "menu", "cutscene", "topdown", "world_map", "platformer", "point_click",
      "isometric", "dungeon_crawler", "visual_novel", "shmup", "battle_rpg", "luta", "racing"
    ]));
    expect(exported.luta_project?.stages).toHaveLength(1);
    expect(projectProgressVariableNames(campaignProject())).toEqual(new Set([
      "var_chapter",
      "var_frame",
      "var_character_gender",
      "var_character_name",
      "var_energy_cell",
      "var_usina_combat_cleared",
      "var_grip",
      "var_stabilizer",
      "var_shield",
      "var_boost",
      "var_guardian_bond",
      "var_active_route",
      "var_warehouse_inspected",
      "var_observatory_read",
      "var_market_shortcut",
      "var_relay_cleared",
      "var_campaign_finished",
      "var_language",
      "var_audio_master_volume",
      "var_audio_music_volume",
      "var_audio_sfx_volume",
      "var_audio_enabled",
      "var_audio_initialized",
      "var_rtc_hour",
      "var_rtc_minute",
      "porto_player_health", "var_penedos_farol", "penedos_player_health", "penedos_tokens",
      "penedos_defeated_crab", "penedos_defeated_moth", "penedos_defeated_crab_east", "penedos_defeated_moth_east",
      "z_feature_quest_state", "z_feature_shop_stock", "var_gallery_gate", "var_gallery_record", "var_telescope_alignment", "var_coast_usina", "var_coast_minute", "var_coast_evening", "var_coast_lift", "var_coast_clock_ready", "var_radio_heard", "var_epilogue_phase", "var_epilogue_tick", "var_arena_lesson", "var_tide_state",
      ...LOST_SIGNAL_VARIABLES, ...SHOWCASE_VARIABLES, FAROL_RELAY.variable
    ]));
    expect(VERTICE_PROGRESS_KEYS).toHaveLength(15);
  });

  it("exporta o prólogo como uma timeline de três quadros com backgrounds próprios", () => {
    const exported = buildEngineExportProjectContract(campaignProject());
    const prologue = exported.cutscene_project?.scenes.find((scene) => scene.name === "prologo");

    expect(prologue?.steps).toHaveLength(4);
    const storyboard = prologue?.steps.filter((step) => step.line >= 0);
    expect(storyboard).toHaveLength(3);
    expect(storyboard?.map((step) => step.line)).toEqual([
      expect.any(Number),
      expect.any(Number),
      expect.any(Number)
    ]);
    expect(storyboard?.map((step) => step.background)).toEqual([
      expect.any(Number),
      expect.any(Number),
      expect.any(Number)
    ]);
    expect(new Set(storyboard?.map((step) => step.background))).toHaveLength(3);
    expect(storyboard?.map((step) => step.resource_bank_group)).toEqual([
      "scene_prologo_step_0",
      "scene_prologo_step_1",
      "scene_prologo_step_2"
    ]);
    expect(prologue?.steps.at(-1)?.script).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: "warp_runtime", runtime: "topdown", room: 0 })
    ]));
  });
});

function projectProgressVariableNames(project) {
  return new Set(project.variables.map((variable) => variable.name));
}
