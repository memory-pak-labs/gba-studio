export const EXEMPLO_GB_STUDIO_SCENE_TYPES = Object.freeze({
  logo: "cutscene",
  abertura: "cutscene",
  titulo: "menu",
  prologo: "cutscene",
  porto_lumen: "topdown",
  mapa_rota: "worldMap",
  penedos_vento: "platformer",
  armazem_das_mares: "pointAndClick",
  observatorio_do_farol: "pointAndClick",
  mercado_suspenso: "isometric",
  usina_submersa: "dungeonCrawler",
  usina_combate: "dungeonCrawler",
  usina_saida: "dungeonCrawler",
  conselho_guardia: "visualNovel",
  tempestade: "shmup",
  guardiao_rele: "battleRpg",
  arena_arrancada: "luta",
  circuito_final: "racing",
  escolha_genero: "menu",
  nome_jogador: "menu",
  carregar_jogo: "menu",
  configuracoes: "menu",
  creditos: "menu",
  missoes: "menu",
  inventario: "menu",
  mapa_menu: "menu",
  salvar: "menu",
  menu_start: "menu",
  arena_tatica: "isometric",
  farol_interior: "topdown"
});

const LEGACY_DIALOGUE_ASSET_NAMES = new Set([
  "dialogue-box-gba.png",
  "dialogue-box-gba-v3.png",
  "dialogue-selector-gba.png",
  "gba-variable-font.png"
]);

const EXEMPLO_MENU_SCENE_CONFIGS = Object.freeze({
  scene_title_screen: {
    screenType: "title",
    title: "Exemplo",
    autoAdvanceFrames: 0,
    allowSkip: true,
    nextScreenID: "",
    items: [],
    screens: [
      {
        id: "title",
        screenType: "title",
        title: "Exemplo",
        autoAdvanceFrames: 0,
        allowSkip: true,
        nextScreenID: "",
        onEnterEventName: "scene_title_screen_on_enter",
        items: [
          {
            id: "new-game",
            label: "Novo jogo",
            action: "select",
            targetScreenID: "scene_parallax_example",
            eventName: "scene_title_new_game",
            clickBox: { x: 64, y: 88, width: 112, height: 20 }
          },
          {
            id: "continue",
            label: "Continuar",
            action: "select",
            targetScreenID: "",
            eventName: "scene_title_continue",
            clickBox: { x: 64, y: 112, width: 112, height: 20 }
          },
          {
            id: "missions",
            label: "Missões",
            action: "push_screen",
            targetScreenID: "missions-1",
            eventName: "",
            clickBox: { x: 64, y: 136, width: 112, height: 20 }
          }
        ]
      },
      {
        id: "missions-1",
        screenType: "menu",
        title: "Missões 1/2",
        autoAdvanceFrames: 0,
        allowSkip: true,
        nextScreenID: "",
        onEnterEventName: "",
        items: [{
          id: "next-page",
          label: "Próxima página",
          action: "open_screen",
          targetScreenID: "missions-2",
          eventName: "",
          clickBox: { x: 64, y: 132, width: 112, height: 20 }
        }]
      },
      {
        id: "missions-2",
        screenType: "menu",
        title: "Missões 2/2",
        autoAdvanceFrames: 0,
        allowSkip: true,
        nextScreenID: "",
        onEnterEventName: "",
        items: [{
          id: "back",
          label: "Voltar ao jogo",
          action: "pop_screen",
          targetScreenID: "",
          eventName: "scene_menu_page_2_back",
          clickBox: { x: 64, y: 132, width: 112, height: 20 }
        }]
      }
    ]
  }
});

const EXEMPLO_PRESENTATION_RUNTIMES = Object.freeze({
  scene_logo: {
    type: "cutscene",
    config: {
      stepDurationFrames: 90,
      autoAdvance: true,
      nextSceneIndex: -1,
      backgroundIndex: -1,
      steps: [{
        id: "logo-intro",
        dialogueKey: "",
        eventName: "scene_logo_to_title",
        durationFrames: 90,
        autoAdvance: true,
        skippable: true,
        waitForDialogue: false,
        onSkipEventName: "scene_logo_to_title",
        targetSceneIndex: -1
      }]
    }
  },
  scene_menu_page_1: {
    type: "visualNovel",
    config: { autoAdvance: false, nextSceneIndex: -1, backgroundIndex: -1, dialogueKey: "gba_visual_novel_intro" }
  },
  scene_menu_page_2: {
    type: "worldMap",
    config: {
      unlocked: true,
      hideWhenLocked: false,
      requiredVariable: -1,
      requiredValue: 0,
      targetLevel: -1,
      nodes: [
        { id: "home", name: "Casa", x: 40, y: 112, connections: ["forest"], dialogueKey: "gba_world_home", eventName: "scene_world_map_home", targetLevel: 0 },
        { id: "forest", name: "Floresta", x: 112, y: 72, connections: ["home", "castle"], dialogueKey: "gba_world_forest", eventName: "scene_world_map_forest", targetLevel: 1 },
        { id: "castle", name: "Castelo", x: 184, y: 40, connections: ["forest"], dialogueKey: "gba_world_castle", eventName: "scene_world_map_castle", targetLevel: 2 }
      ]
    }
  },
  scene_17: {
    type: "battleRpg",
    config: {
      maxPartySize: 4,
      maxEnemies: 4,
      turnDelayFrames: 18,
      activeTimeBattle: false,
      escapeEnabled: true,
      rewardGold: 40,
      rewardExperience: 25
    }
  }
});

const EXEMPLO_MENU_EVENT_COMMANDS = Object.freeze({
  scene_logo_on_enter: ["noop"],
  scene_logo_to_title: ["wait 90", "change_scene scene_title_screen"],
  scene_title_screen_on_enter: ["play_music gba_intro"],
  scene_menu_page_1_on_enter: ["play_music gba_underground_pause"],
  scene_menu_page_2_on_enter: ["noop"],
  scene_world_map_home: ["show_dialogue gba_world_home"],
  scene_world_map_forest: ["show_dialogue gba_world_forest"],
  scene_world_map_castle: ["show_dialogue gba_world_castle"],
  scene_17_victory: ["call_procedure grant_reward battle.reward 40", "show_dialogue gb_dialogue_11"],
  scene_17_defeat: ["show_dialogue gb_dialogue_37"],
  scene_17_escape: ["show_dialogue gb_dialogue_59"],
  scene_title_new_game: ["seed_random", "end_event"],
  scene_title_continue: [
    "if_save_game 0",
    "load_game 0",
    "else",
    "show_dialogue gb_dialogue_4",
    "condition_end"
  ],
  scene_menu_page_2_back: ["scene_stack_previous", "end_event"]
});

const EXEMPLO_PRESENTATION_DIALOGUES = Object.freeze([
  { id: "dialogue-gba-visual-novel-intro", key: "gba_visual_novel_intro", character: "Narrator", text: "The journey continues. Choose your next destination." },
  { id: "dialogue-gba-world-home", key: "gba_world_home", character: "Map", text: "Home — a safe place to rest." },
  { id: "dialogue-gba-world-forest", key: "gba_world_forest", character: "Map", text: "Forest — dangers and secrets await." },
  { id: "dialogue-gba-world-castle", key: "gba_world_castle", character: "Map", text: "Castle — the final destination on this route." }
]);

const EXEMPLO_BATTLE_ACTORS = Object.freeze({
  DJ: { side: "party", maxHp: 40, attack: 12, defense: 5, speed: 8, abilities: ["attack", "magic", "heal"] },
  Keyboard: { side: "party", maxHp: 28, attack: 9, defense: 3, speed: 7, abilities: ["magic", "heal", "defend"] },
  actor_21: { side: "enemy", maxHp: 15, attack: 6, defense: 2, speed: 4, abilities: ["attack"] },
  actor_22: { side: "enemy", maxHp: 12, attack: 7, defense: 1, speed: 9, abilities: ["attack", "defend"] },
  actor_23: { side: "enemy", maxHp: 18, attack: 5, defense: 4, speed: 3, abilities: ["attack", "defend"] },
  actor_24: { side: "enemy", maxHp: 14, attack: 8, defense: 2, speed: 6, abilities: ["attack", "magic"] }
});

function cloneMenuConfig(config) {
  return {
    ...config,
    items: config.items.map((item) => ({
      ...item,
      clickBox: { ...item.clickBox }
    }))
  };
}

function promoteMenuEvents(events) {
  const source = Array.isArray(events) ? events : [];
  const promoted = source.map((event) => {
    const commands = EXEMPLO_MENU_EVENT_COMMANDS[event?.name];
    if (!commands) return event;
    return {
      ...event,
      category: "Cena",
      command: "noop",
      steps: commands.map((command, index) => ({
        id: `menu-${event.name}-${index + 1}`,
        command,
        isEnabled: true
      }))
    };
  });
  const existingNames = new Set(promoted.map((event) => event?.name));
  for (const [name, commands] of Object.entries(EXEMPLO_MENU_EVENT_COMMANDS)) {
    if (existingNames.has(name)) continue;
    promoted.push({
      id: `event-${name}`,
      name,
      category: "Cena",
      detail: "Fluxo nativo das cenas Menu do projeto completo",
      command: "noop",
      steps: commands.map((command, index) => ({
        id: `menu-${name}-${index + 1}`,
        command,
        isEnabled: true
      }))
    });
  }
  const procedureIndex = promoted.findIndex((event) => event?.name === "grant_reward");
  const rewardProcedure = {
    id: "procedure-grant-reward",
    name: "grant_reward",
    category: "Procedure",
    detail: "Procedure canônica com parâmetro por referência, número e variável local",
    eventKind: "procedure",
    procedure: {
      parameters: [
        { name: "target", type: "variable", defaultValue: "battle.reward" },
        { name: "amount", type: "number", defaultValue: "40" }
      ],
      locals: [{ name: "applied", type: "boolean", initialValue: "false" }]
    },
    command: "noop",
    steps: [
      { id: "procedure-grant-reward-1", command: "add_variable $target $amount", isEnabled: true },
      { id: "procedure-grant-reward-2", command: "set_variable $applied true", isEnabled: true }
    ]
  };
  if (procedureIndex >= 0) promoted[procedureIndex] = rewardProcedure;
  else promoted.push(rewardProcedure);
  return promoted;
}

export function promoteExemploGBStudioSceneTypes(project) {
  const scenes = Array.isArray(project.scenas) ? project.scenas : [];
  const promotedScenes = scenes.map((scene) => {
    const sceneType = EXEMPLO_GB_STUDIO_SCENE_TYPES[scene?.name];
    return sceneType ? { ...scene, sceneType } : scene;
  });
  const settings = project?.settings && typeof project.settings === "object" ? project.settings : {};
  const general = settings.general && typeof settings.general === "object" ? settings.general : {};
  const uiDialogs = settings.uiDialogs && typeof settings.uiDialogs === "object" ? settings.uiDialogs : {};
  const sceneTypes = settings.sceneTypes && typeof settings.sceneTypes === "object" ? settings.sceneTypes : {};
  const enabled = sceneTypes.enabled && typeof sceneTypes.enabled === "object" ? sceneTypes.enabled : {};
  const sourceAssets = (Array.isArray(project?.assets) ? project.assets : [])
    .filter((asset) => !LEGACY_DIALOGUE_ASSET_NAMES.has(asset?.name));
  const sourceAssetNames = new Set(sourceAssets.map((asset) => asset?.name));
  const dialogueBoxImage = [uiDialogs.boxImage, "frame-lumen-v2.png", "frame-narrativa-v2.png"]
    .find((name) => typeof name === "string" && sourceAssetNames.has(name)) ?? "";
  const uiAssets = [
    {
      id: "asset-dialogue-selector-gba-v4",
      name: "dialogue-selector-gba-v4.png",
      kind: "UI",
      metadata: {
        source: "Assets/ui/dialogue-selector-gba-v4.png",
        provenance: "Seletor fornecido pelo usuário, variante alpha-t80 normalizada para célula 8x8 4 BPP",
        license: "User-provided",
        gbaRole: "dialogue-choice-selector",
        width: 8,
        height: 8,
        colorCount: 8
      }
    },
    {
      id: "asset-gba-dialogue-font-v3",
      name: "gba-dialogue-font-v3.png",
      kind: "FONT",
      metadata: {
        source: "Assets/fonts/gba-dialogue-font-v3.png",
        provenance: "Exemplo GBA dialogue v3 binary high-contrast atlas",
        license: "Project-owned",
        gbaRole: "dialogue-font",
        glyphWidth: 8,
        glyphHeight: 8,
        variableWidth: true,
        width: 128,
        height: 112,
        colorCount: 2
      }
    }
  ];
  const existingAssetNames = new Set(sourceAssets.map((asset) => asset?.name));
  return {
    ...project,
    assets: [...sourceAssets, ...uiAssets.filter((asset) => !existingAssetNames.has(asset.name))],
    settings: {
      ...settings,
      general: { ...general, startSceneType: "cutscene" },
      uiDialogs: {
        ...uiDialogs,
        boxImage: dialogueBoxImage,
        selectorImage: "dialogue-selector-gba-v4.png",
        font: "gba-dialogue-font-v3.png"
      },
      sceneTypes: { ...sceneTypes, enabled: {
        ...enabled,
        menu: true,
        cutscene: true,
        visualNovel: true,
        worldMap: true,
        battleRpg: true,
        luta: true
      } }
    },
    scenas: promotedScenes,
    rooms: structuredClone(promotedScenes)
  };
}
