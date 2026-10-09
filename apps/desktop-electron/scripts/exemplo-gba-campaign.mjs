import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const FAROL_CAMPAIGN_SCENES = Object.freeze([
  {
    legacyName: "scene_logo",
    name: "farol_prologo",
    runtime: "cutscene",
    title: "Prólogo · A lente quebrada",
    objective: "Descobrir por que o Farol de Bruma perdeu seu sinal.",
    controls: "A avança a narrativa; o direcional permite examinar a cena.",
    success: "Examinar a lente quebrada e seguir para o título.",
    failureRecovery: "Cena narrativa sem condição de falha.",
    nextScene: "farol_titulo",
    transitionEvent: "farol_prologo_avancar",
    entry: { x: 21, y: 17 },
    exit: { x: 27, y: 14, width: 3, height: 5 }
  },
  {
    legacyName: "scene_title_screen",
    name: "farol_titulo",
    runtime: "menu",
    title: "A Jornada do Farol",
    objective: "Iniciar uma nova jornada ou continuar o último save.",
    controls: "Direcional seleciona; A confirma; B retorna.",
    success: "Iniciar ou continuar a jornada pelo menu principal.",
    failureRecovery: "Continuar sem save exibe uma orientação e mantém o menu ativo.",
    nextScene: "farol_enseada",
    transitionEvent: "farol_titulo_novo_jogo",
    entry: { x: 10, y: 13 },
    exit: { x: 13, y: 16, width: 4, height: 4 }
  },
  {
    legacyName: "scene_sample_town",
    name: "farol_enseada",
    runtime: "topdown",
    title: "Capítulo 1 · Enseada da Bruma",
    objective: "Encontrar as peças do aro da lente e seguir para as falésias.",
    controls: "Direcional move Lia; A examina objetos e personagens.",
    success: "Recolher as peças do aro e alcançar a saída sul.",
    failureRecovery: "A saída informa o objetivo pendente sem perder o progresso.",
    nextScene: "farol_falesias",
    transitionEvent: "farol_enseada_seguir_falesias",
    completionVariable: "var_lens_frame_found",
    entry: { x: 25, y: 18 },
    exit: { x: 18, y: 27, width: 5, height: 3 }
  },
  {
    legacyName: "scene_path_to_sample_town",
    name: "farol_falesias",
    runtime: "platformer",
    title: "Capítulo 2 · Falésias do Sinal",
    objective: "Desativar os drones de deriva e reativar o relé.",
    controls: "Direcional move; A pula e interage; B usa o impulso.",
    success: "Desativar os três drones e falar com Mara junto ao relé.",
    failureRecovery: "Checkpoints permitem retomar a travessia sem reiniciar o capítulo.",
    nextScene: "farol_oficina",
    transitionEvent: "farol_falesias_abrir_oficina",
    completionVariable: "var_relay_repaired",
    entry: { x: 4, y: 10 },
    exit: { x: 58, y: 9, width: 2, height: 8 }
  },
  {
    legacyName: "scene_player_s_house",
    name: "farol_oficina",
    runtime: "pointAndClick",
    title: "Capítulo 3 · Oficina de Mara",
    objective: "Montar o novo aro da lente e preparar o planador.",
    controls: "Direcional move o cursor; A examina; B cancela.",
    success: "Examinar o carrinho, montar o aro e sair pela porta da oficina.",
    failureRecovery: "A saída aponta o objeto ainda necessário.",
    nextScene: "farol_tempestade",
    transitionEvent: "farol_oficina_decolar",
    completionVariable: "var_relay_route_open",
    entry: { x: 8, y: 8 },
    exit: { x: 24, y: 8, width: 4, height: 7 }
  },
  {
    legacyName: "scene_space_battle",
    name: "farol_tempestade",
    runtime: "shmup",
    title: "Capítulo 4 · Travessia da Tempestade",
    objective: "Conduzir o planador pela tempestade e alcançar o relé.",
    controls: "Direcional pilota o planador; segure A para disparar.",
    success: "Atravessar a tempestade e alcançar o relé no extremo direito.",
    failureRecovery: "O runtime reinicia a tentativa mantendo o último save da oficina.",
    nextScene: "farol_guardiao_rele",
    transitionEvent: "farol_tempestade_alcancar_rele",
    completionVariable: "var_storm_cleared",
    entry: { x: 8, y: 10 },
    exit: { x: 58, y: 7, width: 2, height: 6 }
  },
  {
    legacyName: "scene_17",
    name: "farol_guardiao_rele",
    runtime: "battleRpg",
    title: "Capítulo 5 · Guardião do Relé",
    objective: "Vencer o autômato e recuperar o controle do sinal.",
    controls: "Direcional escolhe comandos; A confirma; B retorna.",
    success: "Vencer o Guardião e restaurar o transmissor do relé.",
    failureRecovery: "Derrota ou fuga reinicia o encontro após a orientação de Mara.",
    nextScene: "farol_memorias",
    transitionEvent: "farol_guardiao_vitoria",
    completionVariable: "var_automaton_repaired",
    entry: { x: 7, y: 14 },
    exit: { x: 13, y: 17, width: 4, height: 3 }
  },
  {
    legacyName: "scene_menu_page_1",
    name: "farol_memorias",
    runtime: "visualNovel",
    title: "Capítulo 6 · Memórias do Farol",
    objective: "Reconstruir com Mara a rota final até a torre.",
    controls: "A avança o texto; o direcional escolhe respostas.",
    success: "Confirmar com Mara a rota final até o pátio.",
    failureRecovery: "Cena narrativa sem condição de falha.",
    nextScene: "farol_mapa_costa",
    transitionEvent: "farol_memorias_avancar",
    completionVariable: "var_lighthouse_route_planned",
    entry: { x: 7, y: 15 },
    exit: { x: 25, y: 7, width: 4, height: 7 }
  },
  {
    legacyName: "scene_menu_page_2",
    name: "farol_mapa_costa",
    runtime: "worldMap",
    title: "Capítulo 7 · Mapa da Costa",
    objective: "Selecionar o Pátio do Farol como próximo destino.",
    controls: "Direcional muda o ponto selecionado; A confirma a viagem.",
    success: "Selecionar o Pátio do Farol no mapa da costa.",
    failureRecovery: "Os demais pontos podem ser consultados sem alterar o destino.",
    nextScene: "farol_patio",
    transitionEvent: "farol_mapa_selecionar_farol",
    completionVariable: "var_lighthouse_route_planned",
    entry: { x: 20, y: 15 },
    exit: { x: 18, y: 24, width: 4, height: 6 }
  },
  {
    legacyName: "scene_isometric",
    name: "farol_patio",
    runtime: "isometric",
    title: "Capítulo 8 · Pátio dos Espelhos",
    objective: "Alinhar os espelhos e liberar a galeria da lente.",
    controls: "Direcional move Lia; A interage; B alterna o alvo próximo.",
    success: "Alinhar o espelho leste e alcançar a passagem superior.",
    failureRecovery: "A passagem permanece fechada e explica o alinhamento pendente.",
    nextScene: "farol_subsolo",
    transitionEvent: "farol_patio_abrir_subsolo",
    completionVariable: "var_mirrors_aligned",
    entry: { x: 19, y: 18 },
    exit: { x: 31, y: 1, width: 5, height: 5 }
  },
  {
    legacyName: "scene_dungeon_crawler",
    name: "farol_subsolo",
    runtime: "dungeonCrawler",
    title: "Capítulo 9 · Galeria da Lente",
    objective: "Abrir a fechadura da lente e restaurar o mecanismo.",
    controls: "Esquerda e direita giram; cima avança; baixo recua; A interage.",
    success: "Abrir a fechadura central e levar a lente à saída.",
    failureRecovery: "A saída informa que a fechadura continua ativa.",
    nextScene: "farol_corrida_final",
    transitionEvent: "farol_subsolo_liberar_lente",
    completionVariable: "var_lens_unlocked",
    entry: { x: 15, y: 15 },
    exit: { x: 14, y: 3, width: 3, height: 3 }
  },
  {
    legacyName: "scene_racing",
    name: "farol_corrida_final",
    runtime: "racing",
    title: "Final · Corrida do Primeiro Facho",
    objective: "Levar a lente restaurada até o farol antes do anoitecer.",
    controls: "Cima ou A acelera; baixo ou B freia; esquerda e direita conduzem.",
    success: "Cruzar a chegada, reacender o farol e concluir a jornada.",
    failureRecovery: "A tentativa pode ser retomada a partir do save da galeria.",
    nextScene: "farol_titulo",
    transitionEvent: "farol_corrida_concluir",
    completionVariable: "var_lens_delivered",
    entry: { x: 12, y: 24 },
    exit: { x: 18, y: 24, width: 5, height: 4 }
  }
]);

const SCENE_NAME_MAP = new Map(
  FAROL_CAMPAIGN_SCENES.map((scene) => [scene.legacyName, scene.name])
);

const LEGACY_GENERATED_EVENTS = new Set([
  "scene_logo_on_enter",
  "scene_logo_to_title",
  "scene_title_screen_on_enter",
  "scene_menu_page_1_on_enter",
  "scene_menu_page_2_on_enter",
  "scene_world_map_home",
  "scene_world_map_forest",
  "scene_world_map_castle",
  "scene_17_victory",
  "scene_17_defeat",
  "scene_17_escape",
  "scene_title_new_game",
  "scene_title_continue",
  "scene_menu_page_2_back",
  "grant_reward",
  "farol_memorias_escolha"
]);

const SCENE_INTRO_EVENTS = Object.freeze({
  farol_prologo: "farol_prologo_ao_entrar",
  farol_titulo: "farol_titulo_ao_entrar",
  farol_enseada: "farol_enseada_ao_entrar",
  farol_falesias: "farol_falesias_ao_entrar",
  farol_oficina: "farol_oficina_ao_entrar",
  farol_tempestade: "farol_tempestade_ao_entrar",
  farol_guardiao_rele: "farol_guardiao_ao_entrar",
  farol_memorias: "farol_memorias_ao_entrar",
  farol_mapa_costa: "farol_mapa_ao_entrar",
  farol_patio: "farol_patio_ao_entrar",
  farol_subsolo: "farol_subsolo_ao_entrar",
  farol_corrida_final: "farol_corrida_ao_entrar"
});

const SCENE_INTERACTION_EVENTS = Object.freeze({
  farol_prologo: "farol_prologo_examinar_lente",
  farol_titulo: "farol_titulo_confirmar",
  farol_enseada: "farol_enseada_coletar_lente",
  farol_oficina: "farol_oficina_montar_aro",
  farol_tempestade: "farol_tempestade_impacto",
  farol_guardiao_rele: "farol_guardiao_confirmar",
  farol_memorias: "farol_memorias_conversar",
  farol_mapa_costa: "farol_mapa_inspecionar",
  farol_patio: "farol_patio_alinhar_espelhos",
  farol_subsolo: "farol_subsolo_abrir_fechadura",
  farol_corrida_final: "farol_corrida_motor"
});

const FAROL_DIALOGUE_ORDER = Object.freeze([
  "gb_dialogue_16",
  "gb_dialogue_17",
  "gb_dialogue_18",
  "gb_dialogue_19",
  "gb_dialogue_20",
  "gb_dialogue_22",
  "gb_dialogue_52",
  "gb_dialogue_21",
  "canonical_cutscene_intro",
  "canonical_cutscene_interact",
  "canonical_topdown_interact",
  "canonical_point_and_click_interact",
  "canonical_visual_novel_intro",
  "canonical_visual_novel_interact",
  "canonical_isometric_interact",
  "farol_sem_save",
  "farol_enseada_objetivo",
  "farol_oficina_objetivo",
  "farol_guardiao_vencido",
  "farol_guardiao_derrota",
  "farol_mapa_farol",
  "farol_subsolo_lente",
  "farol_subsolo_objetivo",
  "farol_epilogo",
  "farol_epilogo_lia",
  "farol_epilogo_mara"
]);

const OBSOLETE_FAROL_DIALOGUES = new Set([
  "farol_enseada_tutorial",
  "farol_falesias_tutorial",
  "farol_oficina_tutorial",
  "farol_tempestade_tutorial",
  "farol_guardiao_tutorial",
  "farol_mapa_tutorial",
  "farol_patio_tutorial",
  "farol_subsolo_tutorial",
  "farol_corrida_tutorial"
]);

function replaceSceneNames(value) {
  if (Array.isArray(value)) return value.map(replaceSceneNames);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, replaceSceneNames(child)])
    );
  }
  if (typeof value !== "string") return value;
  if (SCENE_NAME_MAP.has(value)) return SCENE_NAME_MAP.get(value);
  let replaced = value;
  for (const [legacyName, sceneName] of SCENE_NAME_MAP) {
    replaced = replaced.replaceAll(legacyName, sceneName);
  }
  return replaced;
}

function event(id, name, roomName, commands, category = "Cena") {
  return {
    id,
    name,
    roomName,
    category,
    detail: "Campanha canônica A Jornada do Farol",
    command: "noop",
    steps: commands.map((command, index) => ({
      id: `${id}-step-${index + 1}`,
      command,
      isEnabled: true
    }))
  };
}

function dialogue(key, character, text, spanish, options = {}) {
  return {
    character,
    choiceTranslations: options.choiceTranslations ?? {},
    choices: options.choices ?? [],
    confirmSound: "farol_sfx_dialogo",
    emote: options.emote ?? "",
    key,
    portrait: options.portrait ?? "",
    text,
    textSound: "farol_sfx_texto",
    translations: {
      "pt-BR": text,
      es: spanish
    },
    translationStatus: {
      "pt-BR": "approved",
      es: "approved"
    }
  };
}

const FAROL_DIALOGUE_PORTRAITS = Object.freeze({
  Lia: "farol-lia-portrait-gba.png",
  Mara: "farol-mara-portrait-gba.png"
});

const FAROL_DIALOGUE_PORTRAIT_ASSETS = Object.freeze([
  Object.freeze({
    id: "farol-dialogue-portrait-lia",
    kind: "Portrait",
    name: FAROL_DIALOGUE_PORTRAITS.Lia,
    systemImage: "person.crop.square",
    metadata: Object.freeze({
      source: `Assets/portraits/${FAROL_DIALOGUE_PORTRAITS.Lia}`,
      provenance: "OpenAI ImageGen portrait compactado pelo gba-sprite-prep para RGB555",
      generatedBy: "farol-dialogue-portraits-v1",
      role: "dialoguePortrait",
      profile: "portrait",
      colorMode: "4bpp",
      visualProfile: "cohesive-lighthouse-adventure-v2"
    })
  }),
  Object.freeze({
    id: "farol-dialogue-portrait-mara",
    kind: "Portrait",
    name: FAROL_DIALOGUE_PORTRAITS.Mara,
    systemImage: "person.crop.square",
    metadata: Object.freeze({
      source: `Assets/portraits/${FAROL_DIALOGUE_PORTRAITS.Mara}`,
      provenance: "OpenAI ImageGen portrait compactado pelo gba-sprite-prep para RGB555",
      generatedBy: "farol-dialogue-portraits-v1",
      role: "dialoguePortrait",
      profile: "portrait",
      colorMode: "4bpp",
      visualProfile: "cohesive-lighthouse-adventure-v2"
    })
  })
]);

const FAROL_DATA_PLUGIN_ASSET = Object.freeze({
  id: "farol-gameplay-data-plugin",
  kind: "Data",
  name: "farol-gameplay-data-plugin.json",
  systemImage: "tablecells",
  metadata: Object.freeze({
    source: "plugins/farol-data/plugin.json",
    bundledDefaultAsset: "template:exemplo-gba/plugins/farol-data/plugin.json",
    role: "gameplayDataTable",
    profile: "dataTablePack",
    reusableLibraryAsset: true,
    provenance: "Tabela autoral canônica do projeto A Jornada do Farol"
  })
});

const FAROL_DATA_VARIABLES = Object.freeze([
  ["farol-variable-guardiao-hp", "var_guardiao_hp", "HP do Guardião"],
  ["farol-variable-guardiao-ataque", "var_guardiao_ataque", "Ataque do Guardião"],
  ["farol-variable-guardiao-defesa", "var_guardiao_defesa", "Defesa do Guardião"],
  ["farol-variable-guardiao-velocidade", "var_guardiao_velocidade", "Velocidade do Guardião"],
  ["farol-variable-guardiao-recompensa-ouro", "var_guardiao_recompensa_ouro", "Ouro do Guardião"],
  ["farol-variable-guardiao-recompensa-xp", "var_guardiao_recompensa_xp", "Experiência do Guardião"]
].map(([id, name, displayName]) => Object.freeze({
  id,
  gbStudioVariableID: id,
  name,
  displayName,
  initialValue: 0
})));

function campaignDialogues() {
  return [
    dialogue(
      "canonical_visual_novel_intro",
      "Lia",
      "O relé voltou a funcionar. Lia e Mara traçam a última rota até o farol.",
      "El relé vuelve a funcionar. Lia y Mara trazan la última ruta hasta el faro.",
      {
        portrait: FAROL_DIALOGUE_PORTRAITS.Lia,
        emote: "emote-surprise-gba.png",
        choices: ["Traçar a rota final"],
        choiceTranslations: {
          "pt-BR": ["Traçar a rota final"],
          es: ["Trazar la ruta final"]
        }
      }
    ),
    dialogue(
      "farol_sem_save",
      "Mara",
      "Ainda não existe uma jornada salva. Escolha Iniciar jornada.",
      "Todavía no existe una partida guardada. Elige Iniciar viaje.",
      { portrait: FAROL_DIALOGUE_PORTRAITS.Mara, emote: "emote-question-gba.png" }
    ),
    dialogue(
      "farol_enseada_objetivo",
      "Lia",
      "Antes de seguir, preciso recolher as peças do aro junto à fonte.",
      "Antes de seguir, debo recoger las piezas del aro junto a la fuente.",
      { portrait: FAROL_DIALOGUE_PORTRAITS.Lia, emote: "emote-surprise-gba.png" }
    ),
    dialogue(
      "farol_oficina_objetivo",
      "Mara",
      "Examine o carrinho da lente para montarmos o novo aro.",
      "Examina el carro de la lente para montar el nuevo aro.",
      { portrait: FAROL_DIALOGUE_PORTRAITS.Mara, emote: "emote-repair-gba.png" }
    ),
    dialogue(
      "farol_guardiao_vencido",
      "Lia",
      "O autômato voltou ao nosso controle. O relé está transmitindo outra vez.",
      "El autómata volvió a nuestro control. El relé transmite otra vez.",
      { portrait: FAROL_DIALOGUE_PORTRAITS.Lia, emote: "emote-success-gba.png" }
    ),
    dialogue(
      "farol_guardiao_derrota",
      "Mara",
      "O relé ainda responde. Reorganize os comandos e tente novamente.",
      "El relé aún responde. Reorganiza los comandos e inténtalo de nuevo.",
      { portrait: FAROL_DIALOGUE_PORTRAITS.Mara, emote: "emote-worry-gba.png" }
    ),
    dialogue(
      "farol_mapa_farol",
      "Mara",
      "O Pátio do Farol está acessível. É lá que alinharemos os espelhos.",
      "El Patio del Faro está accesible. Allí alinearemos los espejos.",
      { portrait: FAROL_DIALOGUE_PORTRAITS.Mara, emote: "emote-signal-gba.png" }
    ),
    dialogue(
      "farol_subsolo_lente",
      "Lia",
      "A fechadura cedeu. A lente está pronta para voltar à torre.",
      "La cerradura cedió. La lente está lista para volver a la torre.",
      { portrait: FAROL_DIALOGUE_PORTRAITS.Lia, emote: "emote-success-gba.png" }
    ),
    dialogue(
      "farol_subsolo_objetivo",
      "Lia",
      "A lente continua presa. Preciso abrir a fechadura no centro da galeria.",
      "La lente sigue atrapada. Debo abrir la cerradura en el centro de la galería.",
      { portrait: FAROL_DIALOGUE_PORTRAITS.Lia, emote: "emote-danger-gba.png" }
    ),
    dialogue(
      "farol_epilogo",
      "Narrador",
      "O primeiro facho atravessa a bruma. A costa volta a enxergar seu caminho.",
      "El primer haz atraviesa la bruma. La costa vuelve a encontrar su camino.",
      { portrait: "", emote: "emote-success-gba.png" }
    ),
    dialogue(
      "farol_epilogo_lia",
      "Lia",
      "Cada porto responde ao novo sinal. A lente voltou para casa.",
      "Cada puerto responde a la nueva señal. La lente volvió a casa.",
      { portrait: FAROL_DIALOGUE_PORTRAITS.Lia, emote: "emote-success-gba.png" }
    ),
    dialogue(
      "farol_epilogo_mara",
      "Mara",
      "Quando a próxima bruma chegar, o farol estará pronto.",
      "Cuando llegue la próxima bruma, el faro estará listo.",
      { portrait: FAROL_DIALOGUE_PORTRAITS.Mara, emote: "emote-success-gba.png" }
    )
  ];
}

function campaignEvents(sourceEvents) {
  const platformIntro = sourceEvents.find((candidate) => (
    candidate?.name === "farol_falesias_ao_entrar"
    || candidate?.name === "farol_falesias_on_enter"
    || candidate?.name === "scene_path_to_sample_town_on_enter"
  ));
  const platformIntroCommands = Array.isArray(platformIntro?.steps)
    ? platformIntro.steps
      .map((step) => step?.command)
      .filter((command) => (
        typeof command === "string"
        && ![...OBSOLETE_FAROL_DIALOGUES].some((key) => command === `show_dialogue ${key}`)
      ))
    : ["play_music farol_falesias", "set_variable var_signal_energy 4"];
  return [
    event("farol-event-prologo-enter", "farol_prologo_ao_entrar", "farol_prologo", [
      "play_music farol_tema_principal"
    ]),
    event("farol-event-prologo-interact", "farol_prologo_examinar_lente", "farol_prologo", [
      "play_sfx farol_sfx_sinal",
      "show_dialogue canonical_cutscene_interact"
    ], "Ator"),
    event("farol-event-prologo-next", "farol_prologo_avancar", "farol_prologo", [
      "play_sfx farol_sfx_confirmar",
      "change_scene farol_titulo 10 13 right"
    ]),
    event("farol-event-title-enter", "farol_titulo_ao_entrar", "farol_titulo", [
      "play_music farol_tema_principal"
    ]),
    event("farol-event-title-show", "farol_titulo_exibir", "farol_titulo", [
      "play_sfx farol_sfx_cursor"
    ]),
    event("farol-event-title-confirm", "farol_titulo_confirmar", "farol_titulo", [
      "play_sfx farol_sfx_cursor"
    ], "Ator"),
    event("farol-event-title-new", "farol_titulo_novo_jogo", "farol_titulo", [
      "remove_save_game 0",
      "set_variable var_lens_frame_found 0",
      "set_variable var_relay_repaired 0",
      "set_variable var_relay_route_open 0",
      "set_variable var_storm_cleared 0",
      "set_variable var_automaton_repaired 0",
      "set_variable var_lighthouse_route_planned 0",
      "set_variable var_mirrors_aligned 0",
      "set_variable var_lens_unlocked 0",
      "set_variable var_lens_delivered 0",
      "seed_random",
      "play_sfx farol_sfx_confirmar",
      "change_scene farol_enseada 25 18 down"
    ]),
    event("farol-event-title-continue", "farol_titulo_continuar", "farol_titulo", [
      "if_save_game 0",
      "load_game 0",
      "else",
      "show_dialogue farol_sem_save",
      "condition_end"
    ]),
    event("farol-event-enseada-enter", "farol_enseada_ao_entrar", "farol_enseada", [
      "play_music farol_enseada"
    ]),
    event("farol-event-enseada-parts", "farol_enseada_coletar_lente", "farol_enseada", [
      "play_sfx farol_sfx_item",
      "show_dialogue canonical_topdown_interact",
      "set_variable var_lens_frame_found 1",
      "save_game 0"
    ], "Ator"),
    event("farol-event-enseada-exit", "farol_enseada_seguir_falesias", "farol_enseada", [
      "if_variable var_lens_frame_found 1",
      "play_sfx farol_sfx_confirmar",
      "change_scene farol_falesias 4 10 right",
      "else",
      "show_dialogue farol_enseada_objetivo",
      "condition_end"
    ]),
    event("farol-event-falesias-enter", "farol_falesias_ao_entrar", "farol_falesias", platformIntroCommands),
    event("farol-event-falesias-exit", "farol_falesias_abrir_oficina", "farol_falesias", [
      "if_variable var_relay_repaired 1",
      "play_sfx farol_sfx_porta",
      "change_scene farol_oficina 8 8 right",
      "else",
      "show_dialogue gb_dialogue_16",
      "condition_end"
    ]),
    event("farol-event-oficina-enter", "farol_oficina_ao_entrar", "farol_oficina", [
      "play_music farol_enseada"
    ]),
    event("farol-event-oficina-build", "farol_oficina_montar_aro", "farol_oficina", [
      "play_sfx farol_sfx_item",
      "show_dialogue canonical_point_and_click_interact",
      "set_variable var_relay_route_open 1",
      "save_game 0"
    ], "Ator"),
    event("farol-event-oficina-exit", "farol_oficina_decolar", "farol_oficina", [
      "if_variable var_relay_route_open 1",
      "play_sfx farol_sfx_porta",
      "change_scene farol_tempestade 8 10 right",
      "else",
      "show_dialogue farol_oficina_objetivo",
      "condition_end"
    ]),
    event("farol-event-tempestade-enter", "farol_tempestade_ao_entrar", "farol_tempestade", [
      "play_music farol_tempestade",
      "play_sfx farol_sfx_alarme"
    ]),
    event("farol-event-tempestade-hit", "farol_tempestade_impacto", "farol_tempestade", [
      "play_sfx farol_sfx_impacto"
    ], "Ator"),
    event("farol-event-tempestade-exit", "farol_tempestade_alcancar_rele", "farol_tempestade", [
      "set_variable var_storm_cleared 1",
      "save_game 0",
      "play_sfx farol_sfx_confirmar",
      "change_scene farol_guardiao_rele 7 14 right"
    ]),
    event("farol-event-guardiao-enter", "farol_guardiao_ao_entrar", "farol_guardiao_rele", [
      "data_table_lookup guardiao_rele 0 var_guardiao_hp var_guardiao_ataque var_guardiao_defesa var_guardiao_velocidade var_guardiao_recompensa_ouro var_guardiao_recompensa_xp",
      "play_music farol_tempestade"
    ]),
    event("farol-event-guardiao-confirm", "farol_guardiao_confirmar", "farol_guardiao_rele", [
      "play_sfx farol_sfx_confirmar"
    ], "Ator"),
    event("farol-event-guardiao-victory", "farol_guardiao_vitoria", "farol_guardiao_rele", [
      "set_variable var_automaton_repaired 1",
      "show_dialogue farol_guardiao_vencido",
      "save_game 0",
      "play_sfx farol_sfx_vitoria",
      "change_scene farol_memorias 7 15 right"
    ]),
    event("farol-event-guardiao-defeat", "farol_guardiao_derrota", "farol_guardiao_rele", [
      "show_dialogue farol_guardiao_derrota",
      "change_scene farol_guardiao_rele 7 14 down"
    ]),
    event("farol-event-guardiao-escape", "farol_guardiao_fuga", "farol_guardiao_rele", [
      "show_dialogue farol_guardiao_derrota",
      "change_scene farol_guardiao_rele 7 14 down"
    ]),
    event("farol-event-memorias-enter", "farol_memorias_ao_entrar", "farol_memorias", [
      "play_music farol_memorias",
      "choice_event canonical_visual_novel_intro 0 farol_memorias_avancar"
    ]),
    event("farol-event-memorias-next", "farol_memorias_avancar", "farol_memorias", [
      "set_variable var_lighthouse_route_planned 1",
      "save_game 0",
      "change_scene farol_mapa_costa 20 15 right"
    ]),
    event("farol-event-memorias-talk", "farol_memorias_conversar", "farol_memorias", [
      "play_sfx farol_sfx_dialogo",
      "show_dialogue canonical_visual_novel_interact"
    ], "Ator"),
    event("farol-event-mapa-enter", "farol_mapa_ao_entrar", "farol_mapa_costa", [
      "play_music farol_memorias",
      "play_sfx farol_sfx_sinal"
    ]),
    event("farol-event-mapa-inspect", "farol_mapa_inspecionar", "farol_mapa_costa", [
      "play_sfx farol_sfx_sinal",
      "show_dialogue farol_mapa_farol"
    ], "Ator"),
    event("farol-event-mapa-select", "farol_mapa_selecionar_farol", "farol_mapa_costa", [
      "show_dialogue farol_mapa_farol",
      "save_game 0",
      "change_scene farol_patio 19 18 right"
    ]),
    event("farol-event-mapa-enseada", "farol_mapa_rever_enseada", "farol_mapa_costa", [
      "show_dialogue canonical_topdown_interact"
    ]),
    event("farol-event-mapa-falesias", "farol_mapa_rever_falesias", "farol_mapa_costa", [
      "show_dialogue gb_dialogue_18"
    ]),
    event("farol-event-mapa-oficina", "farol_mapa_rever_oficina", "farol_mapa_costa", [
      "show_dialogue canonical_point_and_click_interact"
    ]),
    event("farol-event-patio-enter", "farol_patio_ao_entrar", "farol_patio", [
      "play_music farol_falesias"
    ]),
    event("farol-event-patio-align", "farol_patio_alinhar_espelhos", "farol_patio", [
      "play_sfx farol_sfx_confirmar",
      "show_dialogue canonical_isometric_interact",
      "set_variable var_mirrors_aligned 1",
      "save_game 0"
    ], "Ator"),
    event("farol-event-patio-exit", "farol_patio_abrir_subsolo", "farol_patio", [
      "if_variable var_mirrors_aligned 1",
      "play_sfx farol_sfx_porta",
      "change_scene farol_subsolo 15 15 right",
      "else",
      "show_dialogue canonical_isometric_interact",
      "condition_end"
    ]),
    event("farol-event-subsolo-enter", "farol_subsolo_ao_entrar", "farol_subsolo", [
      "play_music farol_subsolo"
    ]),
    event("farol-event-subsolo-lock", "farol_subsolo_abrir_fechadura", "farol_subsolo", [
      "play_sfx farol_sfx_porta",
      "set_variable var_lens_unlocked 1",
      "show_dialogue farol_subsolo_lente",
      "save_game 0"
    ], "Ator"),
    event("farol-event-subsolo-exit", "farol_subsolo_liberar_lente", "farol_subsolo", [
      "if_variable var_lens_unlocked 1",
      "play_sfx farol_sfx_confirmar",
      "change_scene farol_corrida_final 12 24 right",
      "else",
      "show_dialogue farol_subsolo_objetivo",
      "condition_end"
    ]),
    event("farol-event-race-enter", "farol_corrida_ao_entrar", "farol_corrida_final", [
      "play_music farol_corrida_final",
      "play_sfx farol_sfx_motor"
    ]),
    event("farol-event-race-motor", "farol_corrida_motor", "farol_corrida_final", [
      "play_sfx farol_sfx_motor"
    ], "Ator"),
    event("farol-event-race-finish", "farol_corrida_concluir", "farol_corrida_final", [
      "set_variable var_lens_delivered 1",
      "save_game 0",
      "play_sfx farol_sfx_vitoria",
      "show_dialogue farol_epilogo",
      "show_dialogue farol_epilogo_lia",
      "show_dialogue farol_epilogo_mara",
      "fade_audio_volume pcm_music 0 60",
      "fade_out 45",
      "wait 45",
      "stop_music",
      "change_scene farol_titulo 10 13 down"
    ])
  ];
}

function menuRuntime(runtime) {
  const config = runtime?.config && typeof runtime.config === "object" ? runtime.config : {};
  return {
    type: "menu",
    config: {
      ...config,
      screenType: "title",
      title: "A Jornada do Farol",
      autoAdvanceFrames: 0,
      allowSkip: true,
      nextScreenID: "",
      items: [],
      screens: [
        {
          id: "title",
          screenType: "title",
          title: "A Jornada do Farol",
          titleOverlayAssetName: "title-logo-overlay-gba.png",
          titleFadeFrames: 45,
          autoAdvanceFrames: 0,
          allowSkip: true,
          nextScreenID: "",
          onEnterEventName: "farol_titulo_exibir",
          items: [
            {
              id: "new-game",
              label: "Iniciar jornada",
              action: "select",
              targetScreenID: "",
              eventName: "farol_titulo_novo_jogo",
              clickBox: { x: 64, y: 68, width: 120, height: 18 }
            },
            {
              id: "continue",
              label: "Continuar",
              action: "select",
              targetScreenID: "",
              eventName: "farol_titulo_continuar",
              clickBox: { x: 64, y: 88, width: 120, height: 18 }
            },
            {
              id: "controls",
              label: "Como jogar",
              action: "push_screen",
              targetScreenID: "controls",
              eventName: "",
              clickBox: { x: 64, y: 108, width: 120, height: 18 }
            },
            {
              id: "credits",
              label: "Créditos",
              action: "push_screen",
              targetScreenID: "credits",
              eventName: "",
              clickBox: { x: 64, y: 128, width: 120, height: 18 }
            }
          ]
        },
        {
          id: "controls",
          screenType: "menu",
          title: "Como jogar",
          autoAdvanceFrames: 0,
          allowSkip: true,
          nextScreenID: "",
          onEnterEventName: "",
          items: [
            {
              id: "controls-move",
              label: "Mover · Direcional",
              action: "select",
              targetScreenID: "",
              eventName: "",
              enabled: true,
              clickBox: { x: 48, y: 48, width: 160, height: 16 }
            },
            {
              id: "controls-action",
              label: "A · Confirmar / agir",
              action: "select",
              targetScreenID: "",
              eventName: "",
              enabled: true,
              clickBox: { x: 48, y: 68, width: 160, height: 16 }
            },
            {
              id: "controls-back",
              label: "B · Voltar / frear",
              action: "select",
              targetScreenID: "",
              eventName: "",
              enabled: true,
              clickBox: { x: 48, y: 88, width: 160, height: 16 }
            },
            {
              id: "controls-start",
              label: "Start · Pausar",
              action: "select",
              targetScreenID: "",
              eventName: "",
              enabled: true,
              clickBox: { x: 48, y: 108, width: 160, height: 16 }
            },
            {
              id: "controls-close",
              label: "Voltar ao título",
              action: "pop_screen",
              targetScreenID: "",
              eventName: "",
              clickBox: { x: 64, y: 132, width: 120, height: 18 }
            }
          ]
        },
        {
          id: "credits",
          screenType: "menu",
          title: "Créditos · A Jornada do Farol",
          autoAdvanceFrames: 0,
          allowSkip: true,
          nextScreenID: "",
          onEnterEventName: "",
          items: [
            {
              id: "credits-project",
              label: "Projeto · Matheus Melo",
              action: "select",
              targetScreenID: "",
              eventName: "",
              enabled: true,
              clickBox: { x: 48, y: 48, width: 160, height: 16 }
            },
            {
              id: "credits-engine",
              label: "Engine · GBA Studio",
              action: "select",
              targetScreenID: "",
              eventName: "",
              enabled: true,
              clickBox: { x: 48, y: 68, width: 160, height: 16 }
            },
            {
              id: "credits-tech",
              label: "Tecnologia · Butano",
              action: "select",
              targetScreenID: "",
              eventName: "",
              enabled: true,
              clickBox: { x: 48, y: 88, width: 160, height: 16 }
            },
            {
              id: "credits-assist",
              label: "Apoio criativo · OpenAI",
              action: "select",
              targetScreenID: "",
              eventName: "",
              enabled: true,
              clickBox: { x: 48, y: 108, width: 160, height: 16 }
            },
            {
              id: "credits-back",
              label: "Voltar ao título",
              action: "pop_screen",
              targetScreenID: "",
              eventName: "",
              clickBox: { x: 64, y: 132, width: 120, height: 18 }
            }
          ]
        }
      ],
      titleOverlayAssetName: "title-logo-overlay-gba.png",
      titleFadeFrames: 45
    }
  };
}

function presentationRuntime(scene) {
  if (scene.name === "farol_prologo") {
    return {
      type: "cutscene",
      config: {
        stepDurationFrames: 150,
        autoAdvance: false,
        nextSceneIndex: -1,
        backgroundIndex: -1,
        steps: [{
          id: "farol-prologo-step",
          dialogueKey: "canonical_cutscene_intro",
          durationFrames: 150,
          autoAdvance: false,
          skippable: true,
          waitForDialogue: false,
          onSkipEventName: "farol_prologo_avancar",
          targetSceneIndex: -1
        }]
      }
    };
  }
  if (scene.name === "farol_titulo") return menuRuntime(scene.runtime);
  if (scene.name === "farol_guardiao_rele") {
    return {
      ...scene.runtime,
      type: "battleRpg",
      config: {
        ...(scene.runtime?.config ?? {}),
        escapeEnabled: false
      }
    };
  }
  if (scene.name === "farol_memorias") {
    return {
      type: "visualNovel",
      config: {
        ...(scene.runtime?.config ?? {}),
        autoAdvance: false,
        nextSceneIndex: -1,
        backgroundIndex: -1,
        dialogueKey: "canonical_visual_novel_intro"
      }
    };
  }
  if (scene.name === "farol_mapa_costa") {
    return {
      type: "worldMap",
      config: {
        unlocked: true,
        hideWhenLocked: false,
        requiredVariable: -1,
        requiredValue: 0,
        targetLevel: -1,
        nodes: [
          {
            id: "farol",
            name: "Pátio do Farol",
            x: 184,
            y: 56,
            connections: ["falesias", "oficina"],
            dialogueKey: "farol_mapa_farol",
            eventName: "farol_mapa_selecionar_farol",
            targetLevel: 0
          },
          {
            id: "falesias",
            name: "Falésias do Sinal",
            x: 72,
            y: 104,
            connections: ["farol", "enseada"],
            dialogueKey: "gb_dialogue_18", // gitleaks:allow -- dialogue content identifier, not a credential.
            eventName: "farol_mapa_rever_falesias",
            targetLevel: 1
          },
          {
            id: "enseada",
            name: "Enseada da Bruma",
            x: 72,
            y: 184,
            connections: ["falesias", "oficina"],
            dialogueKey: "canonical_topdown_interact",
            eventName: "farol_mapa_rever_enseada",
            targetLevel: 2
          },
          {
            id: "oficina",
            name: "Oficina de Mara",
            x: 176,
            y: 168,
            connections: ["enseada", "farol"],
            dialogueKey: "canonical_point_and_click_interact",
            eventName: "farol_mapa_rever_oficina",
            targetLevel: 3
          }
        ]
      }
    };
  }
  return scene.runtime;
}

function replaceTriggerBindings(triggers) {
  const campaignByName = new Map(FAROL_CAMPAIGN_SCENES.map((scene) => [scene.name, scene]));
  return triggers.map((trigger) => {
    const scene = campaignByName.get(trigger?.roomName);
    if (!scene) return trigger;
    const isArea = String(trigger.name).endsWith("_area");
    const isExit = String(trigger.name).endsWith("_exit");
    let name = trigger.name;
    let eventName = trigger.eventName;
    if (isArea && SCENE_INTERACTION_EVENTS[scene.name]) {
      name = `${scene.name}_objetivo`;
      eventName = SCENE_INTERACTION_EVENTS[scene.name];
    } else if (isExit) {
      name = `${scene.name}_saida`;
      eventName = scene.transitionEvent;
    } else if (scene.name === "farol_falesias" && trigger.name === "trigger_35") {
      name = "farol_falesias_saida_oficina";
      eventName = scene.transitionEvent;
    } else if (scene.name === "farol_falesias" && trigger.name === "trigger_34") {
      name = "farol_falesias_retorno_enseada";
    } else if (scene.name === "farol_falesias" && trigger.name === "trigger_30") {
      name = "farol_falesias_zona_ressalto";
    } else if (scene.name === "farol_falesias" && trigger.name === "trigger_31") {
      name = "farol_falesias_alerta_drones";
    } else if (scene.name === "farol_falesias" && trigger.name === "trigger_32") {
      name = "farol_falesias_corrente_de_ar";
    } else if (scene.name === "farol_falesias" && trigger.name === "trigger_33") {
      name = "farol_falesias_checkpoint_rele";
    }
    return eventName === trigger.eventName && name === trigger.name ? trigger : {
      ...trigger,
      name,
      eventName,
      onEnterEventName: eventName,
      eventBindings: { ...(trigger.eventBindings ?? {}), onEnter: eventName }
    };
  });
}

function replaceActorBindings(actors) {
  return actors.map((actor) => {
    const interactionEvent = SCENE_INTERACTION_EVENTS[actor?.roomName];
    const hasInteraction = Boolean(
      actor?.eventName
      || actor?.scriptName
      || actor?.eventBindings?.onInteract
    );
    if (!interactionEvent || !hasInteraction) return actor;
    return {
      ...actor,
      eventName: interactionEvent,
      scriptName: interactionEvent,
      eventBindings: { ...(actor.eventBindings ?? {}), onInteract: interactionEvent }
    };
  });
}

function campaignConnections(sourceConnections) {
  const byEdge = new Map(
    (Array.isArray(sourceConnections) ? sourceConnections : []).map((connection) => [
      `${connection?.from}->${connection?.to}`,
      connection
    ])
  );
  return FAROL_CAMPAIGN_SCENES.map((scene) => {
    const next = FAROL_CAMPAIGN_SCENES.find((candidate) => candidate.name === scene.nextScene);
    const source = byEdge.get(`${scene.name}->${scene.nextScene}`);
    return {
      ...(source ?? {}),
      from: scene.name,
      to: scene.nextScene,
      eventName: scene.transitionEvent,
      exit: { ...scene.exit },
      entry: { x: next?.entry.x ?? 0, y: next?.entry.y ?? 0, width: 1, height: 1 }
    };
  });
}

function replayRunsForPlatformer() {
  const runs = [];
  for (let index = 0; index < 12; index += 1) {
    runs.push({ frame: { held: ["RIGHT"], pressed: [] }, frames: 42 });
    runs.push({ frame: { held: ["RIGHT", "A"], pressed: ["A"] }, frames: 1 });
    runs.push({ frame: { held: ["RIGHT"], pressed: [] }, frames: 12 });
  }
  return runs;
}

function replayRunsForBattle() {
  const runs = [];
  for (let index = 0; index < 48; index += 1) {
    runs.push({ frame: { held: ["A"], pressed: ["A"] }, frames: 1 });
    runs.push({ frame: { held: [], pressed: [] }, frames: 8 });
  }
  return runs;
}

function buildCampaignReplay() {
  const idle = (frames) => ({ frame: { held: [], pressed: [] }, frames });
  const hold = (key, frames) => ({ frame: { held: [key], pressed: [] }, frames });
  const press = (key) => ({ frame: { held: [key], pressed: [key] }, frames: 1 });
  const initialVariables = {
    var_lens_frame_found: 0,
    var_relay_repaired: 0,
    var_relay_route_open: 0,
    var_storm_cleared: 0,
    var_automaton_repaired: 0,
    var_lighthouse_route_planned: 0,
    var_mirrors_aligned: 0,
    var_lens_unlocked: 0,
    var_lens_delivered: 0
  };
  const segments = [
    { room: "farol_prologo", runs: [idle(165), press("A"), idle(25)] },
    { room: "farol_titulo", runs: [idle(25), press("A"), idle(45)] },
    { room: "farol_enseada", runs: [hold("RIGHT", 48), press("A"), idle(30), hold("LEFT", 96), hold("DOWN", 160), idle(45)] },
    { room: "farol_falesias", runs: [...replayRunsForPlatformer(), idle(45)] },
    { room: "farol_oficina", runs: [hold("RIGHT", 72), hold("DOWN", 40), press("A"), idle(40), hold("RIGHT", 72), hold("UP", 40), press("A"), idle(45)] },
    { room: "farol_tempestade", runs: [hold("RIGHT", 50), ...replayRunsForPlatformer(), idle(45)] },
    { room: "farol_guardiao_rele", runs: [...replayRunsForBattle(), idle(90)] },
    { room: "farol_memorias", runs: [press("A"), idle(30), press("A"), idle(75)] },
    { room: "farol_mapa_costa", runs: [press("A"), idle(90)] },
    { room: "farol_patio", runs: [hold("RIGHT", 160), hold("UP", 96), press("A"), idle(45), hold("UP", 280), hold("RIGHT", 80), idle(45)] },
    { room: "farol_subsolo", runs: [hold("UP", 180), press("A"), idle(45), hold("UP", 100), idle(45)] },
    { room: "farol_corrida_final", runs: [hold("RIGHT", 260), idle(30), press("A"), idle(120)] }
  ];
  const checkpoints = {};
  const runs = [];
  let frameCount = 0;
  for (const [index, segment] of segments.entries()) {
    const variables = { ...initialVariables };
    for (const completedScene of FAROL_CAMPAIGN_SCENES.slice(0, index)) {
      if (completedScene.completionVariable) {
        variables[completedScene.completionVariable] = 1;
      }
    }
    checkpoints[frameCount] = {
      room: segment.room,
      variables,
      inventory: {}
    };
    runs.push(...segment.runs);
    frameCount += segment.runs.reduce((total, run) => total + run.frames, 0);
  }
  checkpoints[frameCount] = {
    room: "farol_titulo",
    variables: Object.fromEntries(
      Object.keys(initialVariables).map((variable) => [variable, 1])
    ),
    inventory: {}
  };
  return {
    schema: 1,
    id: "farol-campanha-completa",
    seed: 0xFA12026,
    initialSaveSlot: null,
    initialVariables,
    initialInventory: {},
    runs,
    checkpoints,
    frameCount
  };
}

function buildDungeonRacingReplay() {
  const idle = (frames) => ({ frame: { held: [], pressed: [] }, frames });
  const hold = (key, frames) => ({ frame: { held: [key], pressed: [] }, frames });
  const press = (key) => ({ frame: { held: [key], pressed: [key] }, frames: 1 });
  const pulses = (key, count, settleFrames) => Array.from(
    { length: count },
    () => [press(key), idle(settleFrames)]
  ).flat();
  const runs = [
    idle(45),
    ...pulses("UP", 6, 14),
    idle(18),
    press("A"),
    idle(24),
    ...pulses("UP", 4, 14),
    idle(45),
    hold("RIGHT", 24),
    idle(18),
    press("A"),
    idle(18),
    press("A"),
    idle(18),
    press("A"),
    idle(200)
  ];
  return {
    schema: 1,
    id: "farol-dungeon-racing-continue",
    seed: 0xD0A7ACE,
    initialSaveSlot: null,
    initialVariables: {},
    initialInventory: {},
    runs,
    checkpoints: {
      0: { room: "farol_subsolo", variables: {}, inventory: {} }
    },
    frameCount: runs.reduce((total, run) => total + run.frames, 0)
  };
}

function normalizeDroneEventActorReferences(events) {
  return events.map((candidate) => {
    const match = String(candidate?.name ?? "").match(/^drone_deriva_([123])_on_(interact|update)$/);
    if (!match) return candidate;
    const actorName = `Drone_Deriva_${match[1]}`;
    const disabledVariable = `var_drone_${match[1]}_disabled`;
    return {
      ...candidate,
      steps: (Array.isArray(candidate.steps) ? candidate.steps : []).map((step) => ({
        ...step,
        command: String(step?.command ?? "")
          .replace(/\bDrone_Deriva_[123]\b/g, actorName)
          .replace(/\bvar_drone_[123]_disabled\b/g, disabledVariable)
      }))
    };
  });
}

function fitAnimationTilesToCanvas(animations) {
  return animations.map((animation) => ({
    ...animation,
    frames: (Array.isArray(animation?.frames) ? animation.frames : []).map((frame) => {
      const width = Number(frame?.width ?? animation?.frameWidth ?? 0);
      const height = Number(frame?.height ?? animation?.frameHeight ?? 0);
      const originX = Number(frame?.originX ?? animation?.originX ?? 0);
      const originY = Number(frame?.originY ?? animation?.originY ?? 0);
      const defaultOriginX = Math.max(0, Math.floor(width / 2) - 8);
      return {
        ...frame,
        tiles: (Array.isArray(frame?.tiles) ? frame.tiles : []).map((tile) => {
          const tileWidth = Number(tile?.tileWidth ?? 8);
          const tileHeight = Number(tile?.tileHeight ?? 8);
          const x = Number(tile?.x ?? 0);
          const y = Number(tile?.y ?? 0);
          const left = defaultOriginX + originX + x;
          const top = height - originY - y - tileHeight;
          const fittedLeft = Math.min(Math.max(0, width - tileWidth), Math.max(0, left));
          const fittedTop = Math.min(Math.max(0, height - tileHeight), Math.max(0, top));
          return {
            ...tile,
            x: x + fittedLeft - left,
            y: y - (fittedTop - top)
          };
        })
      };
    })
  }));
}

export function promoteExemploGBAFarolCampaign(data) {
  const renamed = replaceSceneNames(structuredClone(data));
  const campaignByName = new Map(FAROL_CAMPAIGN_SCENES.map((scene) => [scene.name, scene]));
  const sourceScenes = Array.isArray(renamed.scenas) ? renamed.scenas : [];
  const sceneByName = new Map(sourceScenes.map((scene) => [scene?.name, scene]));
  const scenes = FAROL_CAMPAIGN_SCENES.map((definition, chapter) => {
    const source = sceneByName.get(definition.name);
    if (!source) throw new Error(`Cena obrigatória do Farol ausente: ${definition.name}.`);
    return {
      ...source,
      name: definition.name,
      sceneType: definition.runtime,
      displayName: definition.title,
      campaign: {
        chapter,
        title: definition.title,
        objective: definition.objective,
        nextScene: definition.nextScene,
        completionVariable: definition.completionVariable ?? "",
        controls: definition.controls,
        success: definition.success,
        failureRecovery: definition.failureRecovery,
        tutorialDialogue: definition.tutorialDialogue ?? ""
      },
      eventBindings: {
        ...(source.eventBindings ?? {}),
        onInit: SCENE_INTRO_EVENTS[definition.name]
      },
      onEnterEventName: SCENE_INTRO_EVENTS[definition.name],
      runtime: presentationRuntime({ ...source, name: definition.name })
    };
  });

  const sourceEvents = Array.isArray(renamed.events) ? renamed.events : [];
  const retainedEvents = sourceEvents.filter((candidate) => {
    const name = String(candidate?.name ?? "");
    if (name.startsWith("canonical_")) return false;
    if (LEGACY_GENERATED_EVENTS.has(name)) return false;
    if (
      name === "scene_path_to_sample_town_on_enter"
      || name === "farol_falesias_on_enter"
      || name === "farol_falesias_ao_entrar"
    ) return false;
    if (name === "trigger_35_on_enter") return false;
    return true;
  });
  const promotedEvents = campaignEvents(sourceEvents);
  const eventNames = new Set(promotedEvents.map((candidate) => candidate.name));
  const events = [
    ...retainedEvents.filter((candidate) => !eventNames.has(candidate?.name)),
    ...promotedEvents
  ];

  const sourceDialogues = (Array.isArray(renamed.dialogues) ? renamed.dialogues : [])
    .filter((candidate) => !OBSOLETE_FAROL_DIALOGUES.has(candidate?.key));
  const promotedDialogues = campaignDialogues();
  const sourceDialogueKeys = new Set(sourceDialogues.map((candidate) => candidate?.key));
  const promotedDialogueByKey = new Map(
    promotedDialogues.map((candidate) => [candidate.key, candidate])
  );
  const dialogueOrderByKey = new Map(FAROL_DIALOGUE_ORDER.map((key, index) => [key, index]));
  const dialogues = [
    ...sourceDialogues.map((candidate) => (
      promotedDialogueByKey.get(candidate?.key) ?? candidate
    )),
    ...promotedDialogues.filter((candidate) => !sourceDialogueKeys.has(candidate.key))
  ]
    .map((candidate) => ({
      ...candidate,
      portrait: FAROL_DIALOGUE_PORTRAITS[candidate?.character] ?? ""
    }))
    .sort((left, right) => (
      (dialogueOrderByKey.get(left?.key) ?? Number.MAX_SAFE_INTEGER)
      - (dialogueOrderByKey.get(right?.key) ?? Number.MAX_SAFE_INTEGER)
    ));

  const settings = renamed.settings && typeof renamed.settings === "object" ? renamed.settings : {};
  const general = settings.general && typeof settings.general === "object" ? settings.general : {};
  const save = settings.save && typeof settings.save === "object" ? settings.save : {};
  const uiDialogs = settings.uiDialogs && typeof settings.uiDialogs === "object"
    ? settings.uiDialogs
    : {};
  const advancedTools = renamed.advancedTools && typeof renamed.advancedTools === "object"
    ? renamed.advancedTools
    : {};
  const inputReplays = Array.isArray(advancedTools.inputReplays) ? advancedTools.inputReplays : [];
  const campaignReplay = buildCampaignReplay();
  const dungeonRacingReplay = buildDungeonRacingReplay();
  const editorState = renamed.editorState && typeof renamed.editorState === "object"
    ? renamed.editorState
    : {};
  const sourceAssets = Array.isArray(renamed.assets) ? renamed.assets : [];
  const campaignAssetIDs = new Set([
    ...FAROL_DIALOGUE_PORTRAIT_ASSETS.map((asset) => asset.id),
    FAROL_DATA_PLUGIN_ASSET.id
  ]);
  const sourceVariables = Array.isArray(renamed.variables) ? renamed.variables : [];
  const campaignVariableNames = new Set(FAROL_DATA_VARIABLES.map((variable) => variable.name));

  const project = {
    ...renamed,
    actors: replaceActorBindings(Array.isArray(renamed.actors) ? renamed.actors : []),
    animations: fitAnimationTilesToCanvas(Array.isArray(renamed.animations) ? renamed.animations : []),
    assets: [
      ...sourceAssets.filter((asset) => !campaignAssetIDs.has(asset?.id)),
      ...FAROL_DIALOGUE_PORTRAIT_ASSETS.map((asset) => structuredClone(asset)),
      structuredClone(FAROL_DATA_PLUGIN_ASSET)
    ],
    advancedTools: {
      ...advancedTools,
      inputReplays: [
        ...inputReplays.filter((replay) => ![
          "canonical-route",
          campaignReplay.id,
          dungeonRacingReplay.id
        ].includes(replay?.id)),
        campaignReplay,
        dungeonRacingReplay
      ]
    },
    dialogues,
    editorState: {
      ...editorState,
      scenaConnections: campaignConnections(editorState.scenaConnections)
    },
    events: normalizeDroneEventActorReferences(events),
    rooms: structuredClone(scenes),
    scenas: scenes,
    settings: {
      ...settings,
      general: {
        ...general,
        gameTitle: "A Jornada do Farol",
        startPlayer: scenes[0]?.playerActorName ?? general.startPlayer,
        startScene: "farol_prologo",
        startSceneType: "cutscene",
        version: "1.0.0"
      },
      save: {
        ...save,
        autoSave: true,
        manualSave: false,
        slots: 1
      },
      uiDialogs: {
        ...uiDialogs,
        startMenuTitle: "Jornada",
        startMenuShowInventory: false,
        startMenuShowMap: false
      }
    },
    triggers: replaceTriggerBindings(Array.isArray(renamed.triggers) ? renamed.triggers : []),
    variables: [
      ...sourceVariables.filter((variable) => !campaignVariableNames.has(variable?.name)),
      ...FAROL_DATA_VARIABLES.map((variable) => structuredClone(variable))
    ]
  };

  const battle = project.scenas.find((scene) => scene.name === "farol_guardiao_rele");
  if (battle) {
    battle.eventBindings = {
      ...(battle.eventBindings ?? {}),
      onInit: "farol_guardiao_ao_entrar",
      onVictory: "farol_guardiao_vitoria",
      onDefeat: "farol_guardiao_derrota",
      onEscape: "farol_guardiao_fuga"
    };
  }
  project.rooms = structuredClone(project.scenas);

  for (const scene of project.scenas) {
    if (!campaignByName.has(scene.name)) {
      throw new Error(`Cena fora da campanha Farol: ${scene.name}.`);
    }
  }
  return project;
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invokedPath) {
  const projectPaths = process.argv.slice(2);
  if (projectPaths.length === 0) {
    throw new Error("Uso: node exemplo-gba-campaign.mjs <projeto.gba-project> [...]");
  }
  for (const projectPath of projectPaths) {
    const project = JSON.parse(await readFile(projectPath, "utf8"));
    await writeFile(
      projectPath,
      `${JSON.stringify(promoteExemploGBAFarolCampaign(project), null, 2)}\n`,
      "utf8"
    );
  }
}
