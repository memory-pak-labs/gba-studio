import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { promoteApprovedCharacterSelection } from "./exemplo-character-selection.mjs";
import { fitProjectSpriteFrames } from "./lib/sprite-canvas-audit.mjs";
import { fileURLToPath } from "node:url";

const canonicalExampleProject = JSON.parse(readFileSync(
  new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url),
  "utf8"
));
const CANONICAL_EXAMPLE_ASSET_NAMES = new Set(
  (Array.isArray(canonicalExampleProject.assets) ? canonicalExampleProject.assets : [])
    .map((asset) => asset?.name)
    .filter((name) => typeof name === "string")
);

import { promoteExemploGBAFarolCampaign } from "./exemplo-gba-campaign.mjs";
import { promoteMarketAdventure } from "./market-adventure-promotion.mjs";
import { promoteApprovedCouncilDialogueV5 } from "./council-dialogue-v5.mjs";
import { preserveReferencedSceneEvents } from "./lib/preserve-scene-events.mjs";
import { promoteApprovedUsinaV3 } from "./usina-v3-promotion.mjs";
import { promotePlatformerViewport } from "./promote-platformer-viewport.mjs";
import { promoteApprovedOpeningV2 } from "./opening-v2-promotion.mjs";
import { promoteApprovedOpeningV3 } from "./opening-v3-promotion.mjs";
import { promoteApprovedOpeningV4 } from "./opening-v4-promotion.mjs";
import { promoteNeutralMenus } from "./neutral-menus-promotion.mjs";
import { refineInGameMenus } from "./in-game-menu-project.mjs";
import { refineRouteMap } from "./route-map-project.mjs";
import { correctIsometricScenes } from "./isometric-scene-corrections.mjs";
import { retireInitialMenuScene } from "./retire-initial-menu.mjs";
import { applyExampleSceneTransitions } from "./exemplo-scene-transitions.mjs";
const finalizeApprovedMenusAndRoute = project => {
  const finalized = promotePlatformerViewport(retireInitialMenuScene(promoteApprovedCouncilDialogueV5(promoteMarketAdventure(correctIsometricScenes(refineRouteMap(refineInGameMenus(project), {removeLab:true}))))));
  return applyExampleSceneTransitions(promoteNeutralMenus({
    ...finalized,
    editorState: {
      ...finalized.editorState,
      // Promotions can replace logical grids with larger authored surfaces.
      sceneMapPositions: verticeCanvasPositions(finalized.scenas, finalized.editorState?.sceneMapPositions)
    },
    assets: finalized.assets.filter((asset) => CANONICAL_EXAMPLE_ASSET_NAMES.has(asset.name)),
    animations: finalized.animations.filter((animation) => CANONICAL_EXAMPLE_ASSET_NAMES.has(animation.spriteSheet)),
    animationStates: finalized.animationStates.filter((state) => CANONICAL_EXAMPLE_ASSET_NAMES.has(state.spriteSheet))
  }));
};
import { promoteApprovedCircuitLoopV2 } from "./circuit-loop-v2-promotion.mjs";
import {
  VERTICE_CAMPAIGN_SCENES,
  VERTICE_ENTRY_SCENE,
  VERTICE_GAME_SCENE,
  VERTICE_INITIAL_MENU_SCENE,
  VERTICE_OPENING_SCENE,
  VERTICE_SCENE_PACKAGES,
  VERTICE_START_SCENE,
  VERTICE_TITLE_SCENE,
  VERTICE_SUPPORT_SCENES
} from "./vertice-showcase-contract.mjs";
import {
  VERTICE_LUTA_BACKGROUND_PALETTE_PLAN,
  VERTICE_LUTA_PLAYER_OBJECT_PALETTE,
  VERTICE_LUTA_RIVAL_OBJECT_PALETTE
} from "./vertice-luta-palette-plan.mjs";
import {
  POINT_CLICK_SCENE_NAMES,
  POINT_CLICK_SCENE_SPECS,
  promotePointClickSceneCandidates
} from "./point-click-scenes.mjs";

const VERTICE_SOURCE_SCENES = Object.freeze({
  titulo: "farol_titulo",
  prologo: "farol_prologo",
  porto_lumen: "farol_enseada",
  mapa_rota: "farol_mapa_costa",
  penedos_vento: "farol_falesias",
  armazem_das_mares: "farol_oficina",
  observatorio_do_farol: "farol_oficina",
  mercado_suspenso: "farol_patio",
  usina_submersa: "farol_subsolo",
  usina_combate: "farol_subsolo",
  usina_saida: "farol_subsolo",
  conselho_guardia: "farol_memorias",
  tempestade: "farol_tempestade",
  guardiao_rele: "farol_guardiao_rele",
  arena_arrancada: "farol_guardiao_rele",
  circuito_final: "farol_corrida_final"
});

const VERTICE_PROGRESS_VARIABLES = Object.freeze({
  chapter: "var_chapter",
  "farolParts.frame": "var_frame",
  "farolParts.energyCell": "var_energy_cell",
  "usina.combatCleared": "var_usina_combat_cleared",
  "vehicleModules.grip": "var_grip",
  "vehicleModules.stabilizer": "var_stabilizer",
  "vehicleModules.shield": "var_shield",
  "vehicleModules.boost": "var_boost",
  "bond.guardian": "var_guardian_bond",
  "routeFlags.activeRoute": "var_active_route",
  "routeFlags.warehouseInspected": "var_warehouse_inspected",
  "routeFlags.observatoryRead": "var_observatory_read",
  "routeFlags.marketShortcut": "var_market_shortcut",
  "routeFlags.relayCleared": "var_relay_cleared",
  campaignFinished: "var_campaign_finished"
});

const VERTICE_SCENE_ROUTE_TABLES = Object.freeze([
  {
    id: "map-routes",
    name: "Rotas do mapa",
    variable: VERTICE_PROGRESS_VARIABLES["routeFlags.activeRoute"],
    routes: [
      { value: 0, scene: "porto_lumen", x: 20, y: 15, direction: "down", fadeFrames: 0 },
      { value: 1, scene: "penedos_vento", x: 6, y: 13, direction: "right", fadeFrames: 8 }
    ],
    fallback: { scene: "porto_lumen", x: 20, y: 15, direction: "down", fadeFrames: 0 }
  }
]);

const VERTICE_INTERFACE_VARIABLES = Object.freeze({
  language: "var_language",
  characterName: "var_character_name",
  characterGender: "var_character_gender",
  audioMasterVolume: "var_audio_master_volume",
  audioMusicVolume: "var_audio_music_volume",
  audioSfxVolume: "var_audio_sfx_volume",
  audioEnabled: "var_audio_enabled",
  audioInitialized: "var_audio_initialized",
  rtcHour: "var_rtc_hour",
  rtcMinute: "var_rtc_minute"
});

const VERTICE_INTERFACE_VARIABLE_INDEX = Object.freeze({
  language: Object.keys(VERTICE_PROGRESS_VARIABLES).length,
  characterName: Object.keys(VERTICE_PROGRESS_VARIABLES).length + 1,
  characterGender: Object.keys(VERTICE_PROGRESS_VARIABLES).length + 2,
  audioMasterVolume: Object.keys(VERTICE_PROGRESS_VARIABLES).length + 3,
  audioMusicVolume: Object.keys(VERTICE_PROGRESS_VARIABLES).length + 4,
  audioSfxVolume: Object.keys(VERTICE_PROGRESS_VARIABLES).length + 5,
  audioEnabled: Object.keys(VERTICE_PROGRESS_VARIABLES).length + 6,
  audioInitialized: Object.keys(VERTICE_PROGRESS_VARIABLES).length + 7,
  rtcHour: Object.keys(VERTICE_PROGRESS_VARIABLES).length + 8,
  rtcMinute: Object.keys(VERTICE_PROGRESS_VARIABLES).length + 9
});

const VERTICE_INTRO_EVENTS = Object.freeze({
  logo: "logo_ao_entrar",
  abertura: "abertura_ao_entrar",
  [VERTICE_INITIAL_MENU_SCENE]: "menu_inicial_ao_entrar",
  escolha_genero: "escolha_genero_ao_entrar",
  nome_jogador: "nome_jogador_ao_entrar",
  carregar_jogo: "carregar_jogo_ao_entrar",
  configuracoes: "configuracoes_ao_entrar",
  creditos: "creditos_ao_entrar",
  missoes: "missoes_ao_entrar",
  inventario: "inventario_ao_entrar",
  mapa_menu: "mapa_menu_ao_entrar",
  perfil_equipe: "perfil_equipe_ao_entrar",
  salvar: "salvar_ao_entrar",
  menu_start: "menu_start_ao_entrar",
  titulo: "titulo_ao_entrar",
  prologo: "prologo_ao_entrar",
  porto_lumen: "porto_ao_entrar",
  mapa_rota: "mapa_ao_entrar",
  penedos_vento: "penedos_ao_entrar",
  armazem_das_mares: "armazem_das_mares_ao_entrar",
  observatorio_do_farol: "observatorio_do_farol_ao_entrar",
  mercado_suspenso: "mercado_ao_entrar",
  usina_submersa: "usina_ao_entrar",
  usina_combate: "usina_combate_ao_entrar",
  usina_saida: "usina_saida_ao_entrar",
  conselho_guardia: "conselho_ao_entrar",
  tempestade: "tempestade_ao_entrar",
  guardiao_rele: "guardiao_ao_entrar",
  arena_arrancada: "arena_ao_entrar",
  circuito_final: "circuito_ao_entrar",
  arena_tatica: "arena_tatica_ao_entrar",
  farol_interior: "farol_interior_ao_entrar",
  affine_lab: "affine_lab_ao_entrar"
});

const VERTICE_INTERACTION_EVENTS = Object.freeze({
  porto_lumen: "porto_recuperar_estrutura",
  penedos_vento: "penedos_recolher_aderencia",
  mercado_suspenso: "mercado_abrir_atalho",
  usina_submersa: "usina_coletar_celula",
  conselho_guardia: "conselho_confirmar_alianca",
  tempestade: "tempestade_concluir",
  guardiao_rele: "guardiao_vitoria",
  arena_arrancada: "arena_vencer_rival",
  circuito_final: "circuito_concluir",
  farol_interior: "farol_falar_guardiao"
});

const VERTICE_MUSIC_BY_SCENE = Object.freeze({
  logo: "farol_tema_principal",
  abertura: "farol_tema_principal",
  escolha_genero: "farol_tema_principal",
  nome_jogador: "farol_tema_principal",
  carregar_jogo: "farol_tema_principal",
  configuracoes: "farol_tema_principal",
  creditos: "farol_tema_principal",
  missoes: "farol_tema_principal",
  inventario: "farol_tema_principal",
  mapa_menu: "farol_tema_principal",
  perfil_equipe: "farol_tema_principal",
  salvar: "farol_tema_principal",
  titulo: "farol_tema_principal",
  menu_start: "farol_tema_principal",
  prologo: "farol_tema_principal",
  porto_lumen: "farol_enseada",
  mapa_rota: "farol_memorias",
  penedos_vento: "farol_falesias",
  armazem_das_mares: "farol_enseada",
  observatorio_do_farol: "farol_memorias",
  mercado_suspenso: "farol_falesias",
  usina_submersa: "farol_subsolo",
  usina_combate: "farol_subsolo",
  usina_saida: "farol_subsolo",
  conselho_guardia: "farol_memorias",
  tempestade: "farol_tempestade",
  guardiao_rele: "farol_tempestade",
  arena_arrancada: "farol_corrida_final",
  circuito_final: "farol_corrida_final",
  arena_tatica: "farol_falesias",
  farol_interior: "farol_memorias",
  affine_lab: "farol_falesias"
});

const VERTICE_NARRATIVE_BACKGROUND_BY_SCENE = Object.freeze({
  titulo: "title-day-centered-240x160-4bpp.png",
  menu_inicial: "menu-inicial-v3-gba.png",
  escolha_genero: "gender-selection-gba.png",
  nome_jogador: "name-input-bg-gba.png",
  missoes: "menu-inicial-v3-gba.png",
  inventario: "menu-inicial-v3-gba.png",
  mapa_menu: "menu-inicial-v3-gba.png",
  salvar: "menu-inicial-v3-gba.png",
  menu_start: "menu-inicial-v3-gba.png",
  creditos: "menu-inicial-v3-gba.png",
  prologo: "prologue-frame-1-gba.png",
  conselho_guardia: "council-v5-background.png",
  tempestade: "porto-lume-shmup-wide-v3.png"
});

const VERTICE_INITIAL_MENU_SHARED_BACKGROUND = "menu-inicial-v3-gba.png";
const VERTICE_TITLE_BACKGROUND = "title-day-centered-240x160-4bpp.png";
const VERTICE_INITIAL_MENU_PAGE_SCENES = new Set([
  "creditos"
]);

const VERTICE_SFX = Object.freeze([
  "farol_sfx_cursor",
  "farol_sfx_confirmar",
  "farol_sfx_salto",
  "farol_sfx_impacto",
  "farol_sfx_item",
  "farol_sfx_sinal",
  "farol_sfx_porta",
  "farol_sfx_motor",
  "farol_sfx_alarme",
  "farol_sfx_vitoria"
]);

const VERTICE_SCENE_HUD_PRESET_BY_SCENE = Object.freeze({
  configuracoes: "hud-menu-settings",
  salvar: "hud-menu-controls-topbar",
  menu_start: "hud-menu-controls-topbar",
  missoes: "hud-menu-controls-topbar",
  inventario: "hud-menu-controls-topbar",
  mapa_menu: "hud-menu-map-controls",
  perfil_equipe: "hud-menu-controls-topbar",
  penedos_vento: "hud-penedos-platformer",
  usina_submersa: "hud-usina-lateral",
  usina_combate: "hud-usina-lateral",
  usina_saida: "hud-usina-lateral",
  tempestade: "hud-tempestade-score",
  guardiao_rele: "hud-guardiao-rele",
  circuito_final: "hud-corrida-topdown"
});

function verticeHudComponent(id, kind, label, text, x, y, width, height, zIndex = 1) {
  return {
    id,
    kind,
    label,
    text,
    asset: "",
    x,
    y,
    width,
    height,
    zIndex,
    visible: true
  };
}

function verticeHudCornerComponent(id, kind, label, text, anchor, offsetX, offsetY, width, height, zIndex = 1) {
  const right = anchor === "top-right" || anchor === "bottom-right";
  const bottom = anchor === "bottom-left" || anchor === "bottom-right";
  return {
    ...verticeHudComponent(
      id,
      kind,
      label,
      text,
      right ? 240 - width - offsetX : offsetX,
      bottom ? 160 - height - offsetY : offsetY,
      width,
      height,
      zIndex
    ),
    anchor,
    anchorOffsetX: offsetX,
    anchorOffsetY: offsetY
  };
}

function verticeSceneHudPreset(id, name, description, components, height = 24) {
  return {
    id,
    name,
    description,
    backgroundImage: "",
    selectorImage: "",
    font: "",
    position: "Superior",
    width: 240,
    height,
    mode: "advanced",
    components: [
      verticeHudComponent(`${id}-frame`, "frame", "Moldura", "", 0, 0, 240, height, 0),
      ...components
    ]
  };
}

function verticeMenuControlsHudComponents() {
  return [
    verticeHudComponent("hud-menu-controls-dpad", "text", "Movimento", "D MOVER", 0, 8, 56, 8),
    verticeHudComponent("hud-menu-controls-action", "text", "Confirmar", "A OK", 64, 8, 32, 8),
    verticeHudComponent("hud-menu-controls-back", "text", "Voltar", "B VOLTAR", 104, 8, 64, 8),
    verticeHudComponent("hud-menu-controls-start", "text", "Start", "START OK", 176, 8, 64, 8)
  ];
}

function verticeMenuControlsHudPreset() {
  return verticeSceneHudPreset(
    "hud-menu-controls-topbar",
    "HUD Menus · Controles GBA",
    "Barra superior compartilhada para navegação, confirmação e retorno das telas de menu.",
    verticeMenuControlsHudComponents()
  );
}

function verticeMenuSettingsHudPreset() {
  return {
    id: "hud-menu-settings",
    name: "HUD Configurações · Caixa de diálogo",
    description: "Composição única para idioma, áudio, controles e relógio RTC, usando a mesma moldura 9-slice das caixas de diálogo.",
    backgroundImage: "",
    selectorImage: "",
    font: "",
    position: "Superior",
    width: 240,
    height: 160,
    mode: "advanced",
    components: [
      verticeHudComponent("hud-menu-settings-shell", "frame", "Configurações", "", 8, 8, 224, 144, 0),
      verticeHudComponent("hud-menu-settings-title", "text", "Título", "CONFIGURAÇÕES", 24, 16, 192, 8, 1),
      verticeHudComponent("hud-menu-settings-options-frame", "frame", "Opções", "", 16, 32, 208, 88, 0),
      verticeHudComponent("hud-menu-settings-option-1", "text", "Geral [!!!!!!!!!!]", "", 24, 40, 192, 8, 1),
      verticeHudComponent("hud-menu-settings-option-2", "text", "Musica [!!!!!!!!!!]", "", 24, 56, 192, 8, 1),
      verticeHudComponent("hud-menu-settings-option-3", "text", "Efeitos [!!!!!!!!!!]", "", 24, 72, 192, 8, 1),
      verticeHudComponent("hud-menu-settings-option-4", "text", "Som ligado [ON]", "", 24, 88, 192, 8, 1),
      verticeHudComponent("hud-menu-settings-footer-frame", "frame", "Comandos", "", 16, 128, 208, 24, 0),
      verticeHudComponent("hud-menu-settings-footer", "text", "Comandos", "D MOVER   A OK   B VOLTAR", 24, 140, 192, 8, 1)
    ]
  };
}

function verticeMenuMapControlsHudPreset() {
  return {
    id: "hud-menu-map-controls",
    name: "HUD Menu · Mapa e Controles",
    description: "Barra de controles no topo com orientação do mapa preservada nos painéis inferiores.",
    backgroundImage: "",
    selectorImage: "",
    font: "",
    position: "Superior",
    width: 240,
    height: 160,
    mode: "advanced",
    components: [
      verticeHudComponent("hud-menu-map-controls-topbar-frame", "frame", "Barra de controles", "", 0, 0, 240, 24, 0),
      ...verticeMenuControlsHudComponents(),
      verticeHudCornerComponent("hud-menu-map-controls-top-left-frame", "frame", "Área", "", "top-left", 8, 24, 80, 24, 0),
      verticeHudCornerComponent("hud-menu-map-controls-top-left-text", "text", "Área", "MAPA", "top-left", 16, 32, 64, 8),
      verticeHudCornerComponent("hud-menu-map-controls-top-right-frame", "frame", "Rota", "", "top-right", 8, 24, 80, 24, 0),
      verticeHudCornerComponent("hud-menu-map-controls-top-right-text", "text", "Rota", "ROTA", "top-right", 24, 32, 48, 8),
      verticeHudCornerComponent("hud-menu-map-controls-bottom-left-frame", "frame", "Destino", "", "bottom-left", 8, 8, 96, 24, 0),
      verticeHudCornerComponent("hud-menu-map-controls-bottom-left-text", "text", "Destino", "", "bottom-left", 16, 16, 80, 8)
    ]
  };
}

const VERTICE_EXAMPLE_HUD_PRESETS = Object.freeze([
  verticeMenuControlsHudPreset(),
  verticeMenuSettingsHudPreset(),
  verticeMenuMapControlsHudPreset(),
  {
    id: "hud-map-corners",
    name: "HUD Mapa · Quatro cantos",
    description: "Composição reutilizável para orientação, destino e comandos do mapa.",
    backgroundImage: "",
    selectorImage: "",
    font: "",
    position: "Superior",
    width: 240,
    height: 160,
    mode: "advanced",
    components: [
      verticeHudCornerComponent("hud-map-corners-top-left-frame", "frame", "Área", "", "top-left", 8, 8, 80, 24, 0),
      verticeHudCornerComponent("hud-map-corners-top-left-text", "text", "Área", "MAPA", "top-left", 16, 16, 64, 8),
      verticeHudCornerComponent("hud-map-corners-top-right-frame", "frame", "Rota", "", "top-right", 8, 8, 80, 24, 0),
      verticeHudCornerComponent("hud-map-corners-top-right-text", "text", "Rota", "ROTA", "top-right", 24, 16, 48, 8),
      verticeHudCornerComponent("hud-map-corners-bottom-left-frame", "frame", "Destino", "", "bottom-left", 8, 8, 96, 24, 0),
      verticeHudCornerComponent("hud-map-corners-bottom-left-text", "text", "Destino", "", "bottom-left", 16, 16, 80, 8),
      verticeHudCornerComponent("hud-map-corners-bottom-right-frame", "frame", "Comandos", "", "bottom-right", 8, 8, 136, 24, 0),
      verticeHudCornerComponent("hud-map-corners-bottom-right-text", "text", "Comandos", "A OK B VOL", "bottom-right", 16, 16, 120, 8)
    ]
  },
  {
    id: "hud-penedos-platformer",
    name: "HUD Penedos · Plataforma",
    description: "Duas áreas superiores para vida e itens durante a fase de plataforma.",
    backgroundImage: "",
    selectorImage: "",
    font: "",
    position: "Superior",
    width: 240,
    height: 160,
    mode: "advanced",
    components: [
      verticeHudCornerComponent("hud-penedos-platformer-top-left-frame", "frame", "Vida", "", "top-left", 8, 8, 96, 24, 0),
      verticeHudCornerComponent("hud-penedos-platformer-top-left-text", "text", "Vida", "VIDA 03", "top-left", 16, 16, 80, 8),
      verticeHudCornerComponent("hud-penedos-platformer-top-right-frame", "frame", "Itens", "", "top-right", 8, 8, 96, 24, 0),
      verticeHudCornerComponent("hud-penedos-platformer-top-right-text", "text", "Itens", "ITENS 00", "top-right", 16, 16, 80, 8)
    ]
  },
  {
    id: "hud-corrida-topdown",
    name: "HUD Corrida · Circuito da Ilha",
    description: "Leitura compacta de volta, posição, velocidade e barra de aceleração para o viewport 240×160.",
    backgroundImage: "",
    selectorImage: "",
    font: "",
    position: "Superior",
    width: 240,
    height: 160,
    mode: "advanced",
    components: [
      verticeHudCornerComponent("hud-corrida-topdown-lap-frame", "frame", "Volta", "", "top-left", 8, 8, 72, 16, 1),
      verticeHudCornerComponent("hud-corrida-topdown-lap-text", "text", "Volta", "", "top-left", 16, 12, 56, 8, 2),
      verticeHudCornerComponent("hud-corrida-topdown-position-frame", "frame", "Posição", "", "top-right", 8, 8, 48, 16, 1),
      verticeHudCornerComponent("hud-corrida-topdown-position-text", "text", "Posição", "", "top-right", 16, 12, 32, 8, 2),
      verticeHudCornerComponent("hud-corrida-topdown-speed-frame", "frame", "Velocidade", "", "bottom-left", 8, 8, 72, 16, 1),
      verticeHudCornerComponent("hud-corrida-topdown-speed-text", "text", "Velocidade", "", "bottom-left", 16, 12, 56, 8, 2),
      verticeHudComponent("hud-corrida-topdown-speed-bar", "bar", "Aceleração", "", 88, 140, 64, 8, 1)
    ]
  },
  verticeSceneHudPreset(
    "hud-usina-exploracao",
    "HUD Usina · Exploração",
    "Barra de orientação para a primeira cena do Dungeon Crawler.",
    [
      verticeHudComponent("hud-usina-exploracao-area", "text", "Área", "USINA", 8, 8, 64, 8),
      verticeHudComponent("hud-usina-exploracao-map", "text", "Mapa", "MAPA", 88, 8, 48, 8),
      verticeHudComponent("hud-usina-exploracao-door", "text", "Porta", "PORTA", 168, 8, 64, 8)
    ]
  ),
  verticeSceneHudPreset(
    "hud-usina-combate",
    "HUD Usina · Combate",
    "Barra de confronto para a sala da Sentinela.",
    [
      verticeHudComponent("hud-usina-combate-enemy", "text", "Inimigo", "SENTINELA", 8, 8, 88, 8),
      verticeHudComponent("hud-usina-combate-hp", "bar", "HP", "", 112, 8, 56, 8),
      verticeHudComponent("hud-usina-combate-action", "text", "Ação", "A: ATACAR", 176, 8, 56, 8)
    ]
  ),
  verticeSceneHudPreset(
    "hud-usina-saida",
    "HUD Usina · Saída",
    "Barra de objetivo para a recuperação da célula de energia.",
    [
      verticeHudComponent("hud-usina-saida-item", "text", "Item", "CÉLULA", 8, 8, 72, 8),
      verticeHudComponent("hud-usina-saida-count", "text", "Quantidade", "QTD 00", 96, 8, 64, 8),
      verticeHudComponent("hud-usina-saida-exit", "text", "Saída", "SAÍDA", 176, 8, 56, 8)
    ]
  ),
  {
    id: "hud-usina-lateral",
    name: "HUD Usina · Lateral",
    description: "Painel lateral recolhível para minimapa, vida, item e quantidade do Dungeon Crawler.",
    backgroundImage: "",
    selectorImage: "",
    font: "",
    position: "Superior",
    width: 240,
    height: 160,
    mode: "advanced",
    components: [
      verticeHudComponent("hud-usina-lateral-panel", "frame", "Painel lateral", "", 176, 0, 64, 112, 0),
      verticeHudComponent("hud-usina-lateral-map-frame", "frame", "Minimapa", "", 184, 8, 48, 40, 0),
      verticeHudComponent("hud-usina-lateral-status-frame", "frame", "Status", "", 184, 56, 48, 24, 0),
      verticeHudComponent("hud-usina-lateral-controls-frame", "frame", "Controles", "", 184, 88, 48, 16, 0),
      verticeHudComponent("hud-usina-lateral-map-row-1", "text", "Mapa 1", "", 184, 8, 48, 8),
      verticeHudComponent("hud-usina-lateral-map-row-2", "text", "Mapa 2", "", 184, 16, 48, 8),
      verticeHudComponent("hud-usina-lateral-map-row-3", "text", "Mapa 3", "", 184, 24, 48, 8),
      verticeHudComponent("hud-usina-lateral-map-row-4", "text", "Mapa 4", "", 184, 32, 48, 8),
      verticeHudComponent("hud-usina-lateral-map-row-5", "text", "Mapa 5", "", 184, 40, 48, 8),
      verticeHudComponent("hud-usina-lateral-hp", "text", "Vida", "", 184, 56, 48, 8),
      verticeHudComponent("hud-usina-lateral-item", "text", "Item", "", 184, 64, 48, 8),
      verticeHudComponent("hud-usina-lateral-count", "text", "Quantidade", "", 184, 72, 48, 8)
    ]
  },
  verticeSceneHudPreset(
    "hud-tempestade-score",
    "HUD Tempestade · Pontuação",
    "HUD de score, vidas e onda para o exemplo SHMUP.",
    [
      verticeHudComponent("hud-tempestade-score-value", "text", "Score", "", 8, 8, 104, 8),
      verticeHudComponent("hud-tempestade-score-lives", "text", "Vidas", "", 120, 8, 64, 8),
      verticeHudComponent("hud-tempestade-score-wave", "text", "Onda", "", 184, 8, 48, 8)
    ]
  ),
  verticeSceneHudPreset(
    "hud-guardiao-rele",
    "HUD Guardião · Batalha RPG",
    "HUD de alvo, vida e recompensa para a batalha por turnos.",
    [
      verticeHudComponent("hud-guardiao-rele-target", "text", "Alvo", "GUARDIÃO", 8, 8, 88, 8),
      verticeHudComponent("hud-guardiao-rele-hp", "bar", "HP", "", 112, 8, 56, 8),
      verticeHudComponent("hud-guardiao-rele-command", "text", "Comando", "A: OK", 184, 8, 48, 8)
    ]
  )
]);

function mergeVerticeHudPresets(settings) {
  const current = Array.isArray(settings?.hudPresets)
    ? settings.hudPresets.filter((preset) => preset && typeof preset === "object")
    : [];
  const ownedIDs = new Set(VERTICE_EXAMPLE_HUD_PRESETS.map((preset) => preset.id));
  return {
    ...(settings && typeof settings === "object" ? settings : {}),
    hudPresets: [
      ...current.filter((preset) => !ownedIDs.has(preset.id)),
      ...VERTICE_EXAMPLE_HUD_PRESETS.map((preset) => structuredClone(preset))
    ]
  };
}

const VERTICE_UNUSED_LEGACY_ASSETS = new Set([
  "gba-studio-logo-gba.png",
  "title-screen-bg3-gba.png",
  "title-logo-overlay-gba.png",
  "title-logo-fade-gba.png",
  "farol-lia-portrait-gba.png",
  "farol-mara-portrait-gba.png",
  "canonical-cutscene-bg3-gba.png",
  "canonical-cutscene-actor-gba.png",
  "canonical-cutscene-prop-gba.png",
  "canonical-menu-actor-gba.png",
  "canonical-menu-prop-gba.png",
  "canonical-topdown-bg2-gba.png",
  "canonical-topdown-actor-gba.png",
  "canonical-topdown-prop-gba.png",
  "canonical-world-map-bg2-gba.png",
  "canonical-world-map-actor-gba.png",
  "canonical-world-map-prop-gba.png",
  "canonical-racing-actor-gba.png",
  "canonical-racing-prop-gba.png",
  "canonical-racing-bg2-gba.png",
  "platformer-advanced-v6-bg3-gba.png",
  "platformer-advanced-v6-bg2-terrain-gba.png",
  "platformer-advanced-v6-bg1-details-gba.png",
  "cliffs-gba.png",
  "canonical-point-and-click-bg3-gba.png",
  "canonical-isometric-bg2-gba.png",
  "canonical-dungeon-crawler-bg3-gba.png",
  "plant-gba.png"
  ,"canonical-shmup-bg3-gba.png"
  ,"canonical-battle-rpg-bg3-gba.png"
  ,"canonical-visual-novel-bg3-gba.png"
  ,"circuit-floor.png"
  ,"circuit-minimap.png"
]);

const VERTICE_NON_COLLISION_RUNTIME_TYPES = new Set([
  "cutscene",
  "menu",
  "pointAndClick",
  "visualNovel",
  "shmup",
  "battleRpg",
  "luta"
]);

const TITLE_LOGO_RUNTIME_SEGMENTS = Object.freeze([
  { id: "left-top-left", side: "left", x: 4, y: 3, width: 64, height: 32 },
  { id: "left-top-right", side: "left", x: 12, y: 3, width: 24, height: 32 },
  { id: "left-middle-left", side: "left", x: 4, y: 7, width: 64, height: 32 },
  { id: "left-middle-right", side: "left", x: 12, y: 7, width: 24, height: 32 },
  { id: "left-bottom-left", side: "left", x: 4, y: 11, width: 64, height: 8 },
  { id: "left-bottom-right", side: "left", x: 12, y: 11, width: 24, height: 8 },
  { id: "right-top-left", side: "right", x: 15, y: 3, width: 64, height: 32 },
  { id: "right-top-right", side: "right", x: 23, y: 3, width: 24, height: 32 },
  { id: "right-middle-left", side: "right", x: 15, y: 7, width: 64, height: 32 },
  { id: "right-middle-right", side: "right", x: 23, y: 7, width: 24, height: 32 },
  { id: "right-bottom-left", side: "right", x: 15, y: 11, width: 64, height: 8 },
  { id: "right-bottom-right", side: "right", x: 23, y: 11, width: 24, height: 8 }
]);

const VERTICE_STARTUP_LOGO_FRAMES = Object.freeze([
  { id: "startup-logo-frame-00", name: "gba-studio-startup-canvas-frame-00-gba.png", durationFrames: 18 },
  { id: "startup-logo-frame-01", name: "gba-studio-startup-canvas-frame-01-gba.png", durationFrames: 12 },
  { id: "startup-logo-frame-02", name: "gba-studio-startup-canvas-frame-02-gba.png", durationFrames: 12 },
  { id: "startup-logo-frame-03", name: "gba-studio-startup-canvas-frame-03-gba.png", durationFrames: 18 },
  { id: "startup-logo-hold", name: "gba-studio-startup-canvas-frame-03-gba.png", durationFrames: 60 }
]);

const VERTICE_APPROVED_TACTICAL_SPRITE_SHEETS = new Set([
  "tactical-nara-v5.png",
  "tactical-sentinel-v5.png",
  "tactical-nara-v2.png",
  "tactical-sentinel-v2.png",
  "tactical-props-v1.png",
  "tactical-feedback-v1.png",
  "tactical-props-resident-v1.png",
  "tactical-feedback-resident-v1.png",
  "tactical-nara-v3.png",
  "tactical-sentinel-v3.png",
  "tactical-feedback-v3.png",
  "tactical-cursor-diamond-32x16-v1.png",
  "tactical-range-diamond-32x16-v1.png",
  "tactical-target-diamond-32x16-v1.png"
].filter((assetName) => CANONICAL_EXAMPLE_ASSET_NAMES.has(assetName)));

const VERTICE_ACTIVE_ART_SCENES = new Set([
  "logo",
  "abertura",
  "titulo",
  "menu_inicial",
  "prologo",
  "porto_lumen",
  "farol_interior",
  "mapa_rota",
  "penedos_vento",
  "armazem_das_mares",
  "observatorio_do_farol",
  "usina_submersa",
  "usina_combate",
  "usina_saida",
  "conselho_guardia",
  "tempestade",
  "guardiao_rele",
  "escolha_genero",
  "nome_jogador",
  "carregar_jogo",
  "salvar",
  "menu_start",
  "missoes",
  "inventario",
  "mapa_menu",
  "perfil_equipe",
  "configuracoes",
  "creditos",
  "circuito_final"
]);

const VERTICE_ACTIVE_ACTOR_SCENES = new Set([
  "abertura",
  "titulo",
  "menu_inicial",
  "porto_lumen",
  "farol_interior",
  "mapa_rota",
  "penedos_vento",
  "armazem_das_mares",
  "observatorio_do_farol",
  "mercado_suspenso",
  "usina_submersa",
  "usina_combate",
  "usina_saida",
  "conselho_guardia",
  "tempestade",
  "guardiao_rele",
  "arena_arrancada",
  "circuito_final",
  "arena_tatica",
  "escolha_genero",
  "nome_jogador",
  "carregar_jogo",
  "salvar",
  "menu_start",
  "missoes",
  "inventario",
  "mapa_menu",
  "perfil_equipe",
  "configuracoes",
  "creditos"
]);

const VERTICE_TITLE_SCREEN_ACTOR_IDS = new Set([
  "title-logo-v2",
  "title-press-start",
]);

const VERTICE_INITIAL_MENU_ACTOR_IDS = new Set([
  "menu-new-game",
  "menu-load-game",
  "menu-language",
  "menu-settings",
  "menu-credits",
  "menu-cursor"
]);

const VERTICE_ACTIVE_SPRITE_SHEETS = new Set([
  "airship.png",
  "title-emblem.png",
  "title-logo.png",
  ...TITLE_LOGO_RUNTIME_SEGMENTS.map((segment) => `title-logo-emblem-${segment.id}.png`),
  "press-start.png",
  "press-start-actor-88x32.png",
  "menu-inicial-new-game.png",
  "title-logo-actor-96x64.png",
  "title-logo-actor-128x88.png",
  "menu-gender-title.png",
  "menu-player-name-title.png",
  "menu-entry-cursor.png",
  "menu-inicial-load-game.png",
  "menu-inicial-language.png",
  "menu-inicial-settings.png",
  "menu-inicial-credits.png",
  "menu-inicial-cursor.png",
  "menu-start-title.png",
  "menu-in-game-icons-v2.png",
  "menu-back-v3.png",
  "menu-start-cursor-lighthouse-16x32-4bpp.png",
  "menu-back.png",
  "menu-missoes.png",
  "menu-inventario.png",
  "menu-mapa.png",
  "mapa-detail-current.png",
  "mapa-detail-penedos.png",
  "menu-salvar.png",
  "menu-configuracoes.png",
  "menu-tactical.png",
  "missoes-active.png",
  "missoes-next.png",
  "inventario-modules.png",
  "inventario-empty.png",
  "menu-name-label.png",
  "menu-male.png",
  "menu-female.png",
  "menu-confirm.png",
  "menu-entry-back.png",
  "menu-slot-1.png",
  "menu-save-slot-1-left-focus.png",
  "menu-save-slot-1-right-focus.png",
  "menu-save-slot-1-bottom-left-focus.png",
  "menu-save-slot-1-bottom-right-focus.png",
  "menu-save-slot-2-left-focus.png",
  "menu-save-slot-2-right-focus.png",
  "menu-save-slot-2-bottom-left-focus.png",
  "menu-save-slot-2-bottom-right-focus.png",
  "menu-save-slot-3-left-focus.png",
  "menu-save-slot-3-right-focus.png",
  "menu-save-slot-3-bottom-left-focus.png",
  "menu-save-slot-3-bottom-right-focus.png",
  "menu-portuguese.png",
  "menu-spanish.png",
  "menu-english.png",
  "menu-audio.png",
  "menu-controls.png",
  "menu-project.png",
  "menu-engine.png",
  "opening-airship.png",
  "nara-penedos-platformer-64x64.png",
  "penedos-enemies-32x32.png",
  "nara-topdown.png",
  "player-pilot-32x32.png",
  "npc-captain-pilot-32x32.png",
  "traveler-pilot-32x32.png",
  "mechanic-pilot-32x32.png",
  "cartographer-pilot-32x32.png",
  "fisherchild-pilot-32x32.png",
  "lighthousekeeper-pilot-32x32.png",
  "player-male.png",
  "player-female.png",
  "gender-player-male-32x64.png",
  "gender-player-female-32x64.png",
  "nara-mercado-isometric-v2.png",
  "market-trader-v2-idle.png",
  "farm-player-female.png",
  "farm-player-male.png",
  ...VERTICE_APPROVED_TACTICAL_SPRITE_SHEETS,
  "mechanic.png",
  "route-beacon.png",
  "usina-sentinel-v2.png",
  "usina-energy-cell-v2.png",
  "nara-portrait.png",
  "guardian-portrait.png",
  "dialogue-sigil.png",
  "tempestade-v3-player.png",
  "tempestade-v3-drone-horizontal.png",
  "tempestade-v3-drone-vertical.png",
  "tempestade-v3-boss-lighthouse.png",
  "storm-shot.png",
  "storm-bolt.png",
  "battle-rpg-scene-party-mechanic-alpha128-v2.png",
  "battle-rpg-scene-enemy-large-robot-alpha128-v2.png",
  "nara-fighter.png",
  "rival-fighter.png",
  "nara-racer.png",
  "rival-racer.png",
  "point-click-cursor.png",
  "point-click-lia-scroll.png",
  "point-click-dock-mechanic.png",
  "point-click-keeper-lantern.png",
  "point-click-chart-compass.png",
  "point-click-brass-lantern.png",
  "point-click-red-chest.png",
  "point-click-storm-lamp.png",
  "point-click-tide-gauge.png",
  "farm-player-female.png",
  "farm-player-male.png",
  ...VERTICE_APPROVED_TACTICAL_SPRITE_SHEETS
].filter((assetName) => CANONICAL_EXAMPLE_ASSET_NAMES.has(assetName)));

const VERTICE_APPROVED_TOPDOWN_SPRITE_SHEETS = new Set([
  "player-pilot-32x32.png",
  "npc-captain-pilot-32x32.png",
  "traveler-pilot-32x32.png",
  "mechanic-pilot-32x32.png",
  "cartographer-pilot-32x32.png",
  "fisherchild-pilot-32x32.png",
  "lighthousekeeper-pilot-32x32.png"
].filter((assetName) => CANONICAL_EXAMPLE_ASSET_NAMES.has(assetName)));

const VERTICE_SHOWCASE_ID = "o-ultimo-farol";
const VERTICE_SUPPORT_ACCESS_BY_NAME = new Map([
  ["logo", "boot"],
  ["abertura", "boot"],
  ["menu_inicial", "title"],
  ["escolha_genero", "new-game"],
  ["nome_jogador", "new-game"],
  ["carregar_jogo", "title"],
  ["configuracoes", "settings"],
  ["creditos", "title"],
  ["missoes", "menu-start"],
  ["inventario", "menu-start"],
  ["mapa_menu", "menu-start"],
  ["perfil_equipe", "menu-start"],
  ["salvar", "menu-start"],
  ["menu_start", "menu-start"],
  ["farol_interior", "port-lume"]
]);

export function verticeShowcaseSceneClassification(scene) {
  const name = scene?.name;
  const supportDefinition = VERTICE_SUPPORT_SCENES.find((definition) => definition.name === name);
  const role = scene?.role ?? supportDefinition?.role;
  if (name === "arena_tatica" || role === "tactical") {
    const access = scene?.showcase?.access === "market-guard" ? "market-guard" : "menu-start";
    return { id: VERTICE_SHOWCASE_ID, lane: "showcase", access, playable: true, retained: true };
  }
  if (name === "affine_lab" || role === "affine_demo") {
    return { id: VERTICE_SHOWCASE_ID, lane: "showcase", access: "editor-run", playable: true, retained: true };
  }
  if (VERTICE_CAMPAIGN_SCENES.some((definition) => definition.name === name)) {
    return { id: VERTICE_SHOWCASE_ID, lane: "campaign", access: "campaign", playable: true, retained: true };
  }
  if (supportDefinition) {
    return {
      id: VERTICE_SHOWCASE_ID,
      lane: "support",
      access: VERTICE_SUPPORT_ACCESS_BY_NAME.get(name) ?? "menu",
      playable: true,
      retained: true
    };
  }
  return { id: VERTICE_SHOWCASE_ID, lane: "other", access: "unassigned", playable: false, retained: false };
}

const VERTICE_REPLACED_NARRATIVE_ANIMATION_IDS = new Set([
  "mechanic-animation",
  "port-cargo-animation",
  "port-skiff-animation"
]);

const VERTICE_IN_GAME_MENU_ASSETS = Object.freeze([
  ...[
    ["start", "menu-start-v3-hi-detail-gba.png", "Tela principal do Menu Start", "start-menu-bg", "menu-start-v3-hi-detail-gba", "fe0e1092f5ad033a6d093b4a68451356d0323358d02de19a11ec5bcdaaef3d62", 0.19084967320261437],
    ["missions", "missoes-v3-hi-detail-gba.png", "Quadro de missões", "missions-bg", "missoes-v3-hi-detail-gba", "5b75010c1e21136ee532797744263ced28745aeb59c8da4ecadf056defbb03e1", 0.15163398692810456],
    ["inventory", "inventario-v3-hi-detail-gba.png", "Inventário de itens", "inventory-bg", "inventario-v3-hi-detail-gba", "22aea9f9e82c71ad4a5e710cfac7e0479a523c5494def0f8b85da05d91fd9d4a", 0.16470588235294117],
    ["map", "mapa-menu-v3-hi-detail-gba.png", "Mapa do mundo", "map-bg", "mapa-menu-v3-hi-detail-gba", "19ee2cf7d0c5c198d4ef1f92d84179ac77f1967318083aa6acb48b77b14abf4c", 0.2235294117647059],
    ["profile", "perfil-equipe-v3-hi-detail-gba.png", "Perfil e equipe", "profile-bg", "perfil-equipe-v3-hi-detail-gba", "10ca354c95c6ede66b49e297e20ad440bb8146615c4ba99d7470d3f73e6159c3", 0.20130718954248356],
    ["save", "save-game-v3-hi-detail-gba.png", "Salvar jogo", "save-game-bg", "save-game-v3-hi-detail-gba", "2fabf8286c81c04ce0b73b2771b8c131378de2c01718d430b3971c6b3f1d25bb", 0.1660130718954249]
  ].map(([id, name, label, role, generatedBy, preparedSha256, maxSourcePixelErrorRatio]) => ({
    id: `${id}-v3-hi-detail-background`,
    kind: "Background",
    name,
    systemImage: id === "map" ? "map" : id === "profile" ? "person.2" : "rectangle.inset.filled",
    metadata: {
      source: `Assets/backgrounds/${name}`,
      sourceCandidate: `tools/gba-sprite-prep/production/exemplo-gba-in-game-menu-v1-hi-detail-approved/prepared-gba/backgrounds/${name}`,
      preparedSha256,
      provenance: `Background hi-detail aprovado pelo usuário para a cena ${label}; composição sem textos gravados para preservar atores dinâmicos`,
      generatedBy,
      role,
      sceneRoles: [role],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_hi_detail_menu",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "hi-detail-source-preserving-assetc-4bpp-16-banks",
      backgroundTileOptimizer: { enabled: true, tileBudget: 600, maxSourcePixelErrorRatio, maxFramebufferMismatchRatio: 0 },
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "approved"
    }
  })),
  {
    id: "menu-start-pause-v2-background",
    kind: "Background",
    name: "menu-start-pause-v2-240x160-4bpp.png",
    systemImage: "rectangle.inset.filled",
    metadata: {
      source: "Assets/backgrounds/menu-start-pause-v2-240x160-4bpp.png",
      sourceCandidate: "tools/gba-sprite-prep/production/exemplo-gba-in-game-menu-v3-reset-candidate/backgrounds/menu-start-pause-v2-240x160-4bpp.png",
      preparedSha256: "2dd529de35bba21029cdc301c20ccbecdef64edca500787964e3a526bdd1c170",
      provenance: "Composição nativa aprovada para o reset do Menu Start · Pausa; BG neutro, moldura, cabeçalho e sete linhas estáticas, com textos e cursor preservados como atores dinâmicos",
      generatedBy: "exemplo-gba-in-game-menu-v3-menu-start-pause-background",
      role: "start-menu-pause-bg",
      sceneRoles: ["start-menu-pause-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_hi_detail_menu",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "native-240x160-source-preserving-composition-assetc-4bpp-16-banks",
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "candidate",
      visualStatus: "candidate",
      sourcePreserving: true
    }
  },
  {
    id: "menu-missions-v2-background",
    kind: "Background",
    name: "missions-v2-240x160-4bpp.png",
    systemImage: "list.bullet.rectangle",
    metadata: {
      source: "Assets/backgrounds/missions-v2-240x160-4bpp.png",
      sourceCandidate: "tools/gba-sprite-prep/production/exemplo-gba-in-game-menu-v3-reset-candidate/backgrounds/missions-v2-240x160-4bpp.png",
      preparedSha256: "7ba93e40bc62447e30443e404791ce5c70873261f0e17502cb81ed0d711e34ec",
      provenance: "Composição nativa do quadro de missões; fundo neutro, cabeçalho, cartões e painel de detalhe preservados como BG, com textos, foco e estados mantidos como atores dinâmicos",
      generatedBy: "exemplo-gba-in-game-menu-v3-missions-background",
      role: "missions-bg",
      sceneRoles: ["missions-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_hi_detail_menu",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "native-240x160-source-preserving-composition-assetc-4bpp-16-banks",
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "candidate",
      visualStatus: "candidate",
      sourcePreserving: true
    }
  },
  {
    id: "menu-inventory-v2-background",
    kind: "Background",
    name: "inventory-v2-240x160-4bpp.png",
    systemImage: "shippingbox",
    metadata: {
      source: "Assets/backgrounds/inventory-v2-240x160-4bpp.png",
      sourceCandidate: "tools/gba-sprite-prep/production/exemplo-gba-in-game-menu-v3-reset-candidate/backgrounds/inventory-v2-240x160-4bpp.png",
      preparedSha256: "250ecf68e1eeab7c1ffc74c82f1ac52d79fef6678bba8489b7b7a852bd05f5ec",
      provenance: "Composição nativa do Inventário; moldura, grade de itens, painel de detalhe e retorno preservados como BG, com textos e estados mantidos como atores dinâmicos",
      generatedBy: "exemplo-gba-in-game-menu-v3-inventory-background",
      role: "inventory-bg",
      sceneRoles: ["inventory-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_hi_detail_menu",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "native-240x160-source-preserving-composition-assetc-4bpp-16-banks",
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "candidate",
      visualStatus: "candidate",
      sourcePreserving: true
    }
  },
  {
    id: "menu-map-v2-background",
    kind: "Background",
    name: "map-v2-240x160-4bpp.png",
    systemImage: "map",
    metadata: {
      source: "Assets/backgrounds/map-v2-240x160-4bpp.png",
      sourceCandidate: "tools/gba-sprite-prep/production/exemplo-gba-in-game-menu-v3-reset-candidate/backgrounds/map-v2-240x160-4bpp.png",
      preparedSha256: "93b0ef7d9a63360ffa4dd12a5ab27a655918849be3f398cd1288410bef302042",
      provenance: "Composição nativa do Mapa; painel, rotas, setas, detalhe e marcador preservados como BG, com textos e lógica mantidos no runtime",
      generatedBy: "exemplo-gba-in-game-menu-v3-map-background",
      role: "map-bg",
      sceneRoles: ["map-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_hi_detail_menu",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "native-240x160-source-preserving-composition-assetc-4bpp-16-banks",
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "candidate",
      visualStatus: "candidate",
      sourcePreserving: true
    }
  },
  {
    id: "menu-save-v2-background",
    kind: "Background",
    name: "save-v2-240x160-4bpp.png",
    systemImage: "externaldrive",
    metadata: {
      source: "Assets/backgrounds/save-v2-240x160-4bpp.png",
      sourceCandidate: "tools/gba-sprite-prep/production/exemplo-gba-in-game-menu-v3-reset-candidate/backgrounds/save-v2-240x160-4bpp.png",
      preparedSha256: "414c1e601913f43170c4d255168e8bac388aabb2e9c4a0c79d9b586ef54f5568",
      provenance: "Composição nativa de Salvar; cabeçalho, três slots, painel de confirmação e retorno preservados como BG, com rótulos, dados e lógica no runtime",
      generatedBy: "exemplo-gba-in-game-menu-v3-save-background",
      role: "save-bg",
      sceneRoles: ["save-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_hi_detail_menu",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "native-240x160-source-preserving-composition-assetc-4bpp-16-banks",
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "candidate",
      visualStatus: "candidate",
      sourcePreserving: true
    }
  },
  {
    id: "menu-settings-v2-background",
    kind: "Background",
    name: "settings-v2-240x160-4bpp.png",
    systemImage: "gearshape",
    metadata: {
      source: "Assets/backgrounds/settings-v2-240x160-4bpp.png",
      sourceCandidate: "tools/gba-sprite-prep/production/exemplo-gba-in-game-menu-v3-reset-candidate/backgrounds/settings-v2-240x160-4bpp.png",
      preparedSha256: "cbd60304a9bba2229f645ba40cc999030561ac07023e4fe49e86e1f362e96ca8",
      provenance: "Composição nativa de Configurações; moldura, cabeçalho, quatro linhas, estados visuais e retorno preservados como BG, com rótulos, foco lógico e navegação no runtime",
      generatedBy: "exemplo-gba-in-game-menu-v3-settings-background",
      role: "settings-bg",
      sceneRoles: ["settings-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_hi_detail_menu",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "native-240x160-source-preserving-composition-assetc-4bpp-16-banks",
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "candidate",
      visualStatus: "candidate",
      sourcePreserving: true
    }
  },
  {
    id: "menu-audio-v2-background",
    kind: "Background",
    name: "audio-v2-240x160-4bpp.png",
    systemImage: "speaker.wave.2",
    metadata: {
      source: "Assets/backgrounds/audio-v2-240x160-4bpp.png",
      sourceCandidate: "tools/gba-sprite-prep/production/exemplo-gba-in-game-menu-v3-reset-candidate/backgrounds/audio-v2-240x160-4bpp.png",
      preparedSha256: "e7d17dac575fdba1e25c909524b43ea4ca28b57afa8b1fa63ca249fa15afb5bb",
      provenance: "Composição nativa de Áudio; moldura, cabeçalho, três linhas, medidores/toggles e retorno preservados como BG, com valores e foco no runtime",
      generatedBy: "exemplo-gba-in-game-menu-v3-audio-background",
      role: "audio-bg",
      sceneRoles: ["audio-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_hi_detail_menu",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "native-240x160-source-preserving-composition-assetc-4bpp-16-banks",
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "candidate",
      visualStatus: "candidate",
      sourcePreserving: true
    }
  },
  {
    id: "menu-controls-v2-background",
    kind: "Background",
    name: "controls-v2-240x160-4bpp.png",
    systemImage: "gamecontroller",
    metadata: {
      source: "Assets/backgrounds/controls-v2-240x160-4bpp.png",
      sourceCandidate: "tools/gba-sprite-prep/production/exemplo-gba-in-game-menu-v3-reset-candidate/backgrounds/controls-v2-240x160-4bpp.png",
      preparedSha256: "01c09782de9875b3872f23f15244335baa400e66e7ebe52b9e95101756dc416c",
      provenance: "Composição nativa de Controles; moldura, cabeçalho, vínculos, diagrama do controle e retorno preservados como BG, com rótulos, foco e navegação no runtime",
      generatedBy: "exemplo-gba-in-game-menu-v3-controls-background",
      role: "controls-bg",
      sceneRoles: ["controls-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_hi_detail_menu",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "native-240x160-source-preserving-composition-assetc-4bpp-16-banks",
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "candidate",
      visualStatus: "candidate",
      sourcePreserving: true
    }
  },
  ...[
    ["icons", "menu-in-game-icons-v2.png", "Atlas de ícones do Menu Start e Inventário", "menu-icon-atlas", "d7ced71064a46318a29810ad1dd0f3aaf1cc4495c8fa4d8b3b62e0493d715746", 128, 64, 8, 32, 32, 14, "square.grid.2x2"],
    ["nara-portrait", "nara-portrait-v3.png", "Retrato de Nara", "profile-portrait", "0344c22cfd522c24af2b6ed5f52847e6d2b8840f9af7b5d6c3b2d0a9280c10f8", 48, 48, 1, 48, 48, 15, "person.crop.square"],
    ["guardian-portrait", "guardian-portrait-v3.png", "Retrato da Guardiã", "profile-portrait", "b292085167ea02903f5b09b478793bd6c315c5d23a30e3eb2a1369e0e589b60a", 48, 48, 1, 48, 48, 14, "person.crop.square"],
    ["back", "menu-back-v3.png", "Seta de retorno das telas do Menu Start", "menu-back", "a50f806dd6bddcd9e30ba02182a14e1655a0724259a6db6101241659f1f7d870", 16, 16, 1, 16, 16, 4, "arrow.left"]
  ].map(([id, name, label, role, preparedSha256, width, height, frameCount, frameWidth, frameHeight, visibleColors, systemImage]) => ({
    id: `${id}-actor-v3`,
    kind: "Sprite",
    name,
    systemImage,
    metadata: {
      source: `Assets/sprites/${name}`,
      sourceCandidate: `tools/gba-sprite-prep/production/exemplo-gba-in-game-menu-v2-actor-detail-approved/packed/${name.replace(".png", "")}/${name}`,
      preparedSha256,
      provenance: `Ator hi-detail aprovado pelo usuário para ${label}; pacote mantido em resolução nativa e sem reamostragem adicional`,
      generatedBy: "exemplo-gba-in-game-menu-v2-actor-detail",
      role,
      sceneRoles: role === "profile-portrait" ? ["profile-portrait"] : role === "menu-back" ? ["menu-start-back", "menu-page-back"] : ["menu-start-icon", "inventory-icon"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_hi_detail_menu_actor",
      storageFormat: "rgba-hard-pixel",
      transparentIndex: 0,
      preparedBy: "exemplo-gba-in-game-menu-v2-actor-detail",
      width,
      height,
      frameWidth,
      frameHeight,
      frameCount,
      visibleColors,
      alphaMode: "binary",
      reviewStatus: "approved",
      visualStatus: "approved"
    }
  })),
  {
    id: "menu-start-cursor-lighthouse",
    kind: "Sprite",
    name: "menu-start-cursor-lighthouse-16x32-4bpp.png",
    systemImage: "light.beacon.max",
    metadata: {
      source: "Assets/sprites/menu-start-cursor-lighthouse-16x32-4bpp.png",
      sourceCandidate: "tools/gba-sprite-prep/production/exemplo-gba-in-game-menu-v3-reset-candidate/shared/animated/menu-start-cursor-lighthouse-16x32-4bpp.png",
      preparedSha256: "30b0cc5281845d1cf003532f5de04e99aa40aefd1ce2fbe1d5f42f90de312b8c",
      provenance: "Cursor de foco do Menu Start · Pausa, com dois frames 16×16 empacotados sem reamostragem da fonte nativa",
      generatedBy: "exemplo-gba-in-game-menu-v3-menu-start-pause-cursor",
      role: "menu-start-cursor",
      sceneRoles: ["menu-start-cursor"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_hi_detail_menu_actor",
      storageFormat: "indexed-4bpp",
      transparentIndex: 0,
      preparedBy: "gba-sprite-pack",
      width: 32,
      height: 16,
      frameWidth: 16,
      frameHeight: 16,
      frameCount: 2,
      visibleColors: 15,
      alphaMode: "binary",
      reviewStatus: "candidate",
      visualStatus: "candidate"
    }
  }
]);

const VERTICE_NARRATIVE_ASSETS = Object.freeze([
  ...VERTICE_STARTUP_LOGO_FRAMES
    .filter((frame, index, frames) => frames.findIndex((candidate) => candidate.name === frame.name) === index)
    .map((frame, index) => ({
      id: `gba-studio-startup-canvas-frame-${String(index).padStart(2, "0")}-background`,
      kind: "Background",
      name: frame.name,
      systemImage: "rectangle.inset.filled",
      metadata: {
        source: `Assets/backgrounds/${frame.name}`,
        provenance: "Startup Screen GBA STUDIO v3 aprovada, derivada da arte de canvas com brilho horizontal contínuo",
        generatedBy: "exemplo-gba-startup-logo-v3",
        role: "startup-logo-bg",
        sceneRoles: ["startup-logo-bg", "logo-bg"],
        profile: "menu-logo",
        colorMode: "4bpp",
        visualProfile: "gba_neutral_cohesive_pixel_art_official_brand_adaptation",
        width: 240,
        height: 160,
        backgroundPaletteBankBudget: 16,
        assetcStatus: "safe",
        assetcReviewed: true,
        reviewStatus: "approved",
        animationFrame: index
      }
    })),
  {
    id: "title-logo-actor-96x64", kind: "Sprite", name: "title-logo-actor-96x64.png", systemImage: "textformat",
    metadata: {
      source: "Assets/sprites/title-logo-actor-96x64.png",
      provenance: "Recorte OBJ do wordmark O ÚLTIMO FAROL usado como decoração do Menu Inicial",
      generatedBy: "exemplo-gba-title-screen-v4-approved-assets",
      role: "initial-menu-logo",
      sceneRoles: ["initial-menu-logo"],
      profile: "ui",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_approved_generated_logo",
      storageFormat: "indexed-4bpp",
      transparentIndex: 0,
      frameWidth: 96,
      frameHeight: 64,
      frameCount: 1,
      visibleColors: 15,
      reviewStatus: "candidate"
    }
  },
  {
    id: "title-logo-actor-128x88", kind: "Sprite", name: "title-logo-actor-128x88.png", systemImage: "textformat",
    metadata: {
      source: "Assets/sprites/title-logo-actor-128x88.png",
      provenance: "Logo maior fornecido na candidata V2 aprovada para a cena título",
      generatedBy: "cena-titulo-v2-candidate",
      role: "title-logo",
      sceneRoles: ["title-logo", "title-screen"],
      profile: "ui",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium",
      storageFormat: "indexed-4bpp",
      transparentIndex: 0,
      frameWidth: 128,
      frameHeight: 88,
      frameCount: 1,
      visibleColors: 15,
      hardwareObjectsPerFrame: 10,
      technicalStatus: "attention",
      reviewStatus: "approved",
      visualStatus: "approved",
      candidateStatus: "canonical-integrated",
      approvalScope: "Cena titulo V2 aprovada e promovida em 2026-09-24; Editor, Play e ROM emulado verificados; hardware fisico pendente"
    }
  },
  {
    id: "gba-studio-logo-official-background", kind: "Background", name: "gba-studio-logo-official-gba.png", systemImage: "rectangle.inset.filled",
    metadata: {
      source: "Assets/backgrounds/gba-studio-logo-official-gba.png",
      provenance: "Logo oficial fornecida pelo usuário, adaptada deterministicamente ao canvas GBA",
      generatedBy: "gba-studio-official-logo-adaptation-v1",
      role: "logo-bg",
      sceneRoles: ["logo-bg"],
      profile: "menu-logo",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_official_brand_adaptation",
      backgroundPaletteBankBudget: 16
    }
  },
  {
    id: "title-background", kind: "Background", name: "title-gba.png", systemImage: "sparkles",
    metadata: {
      source: "Assets/backgrounds/title-gba.png",
      provenance: "Background diurno aprovado da Title Screen, com nuvens preparadas para animação em três quadros",
      generatedBy: "exemplo-gba-title-background-day-v1",
      role: "title-bg",
      sceneRoles: ["title-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      backgroundPaletteBankBudget: 16,
      backgroundTileOptimizer: {
        enabled: true,
        tileBudget: 501,
        maxSourcePixelErrorRatio: 0.2810677083333333,
        maxFramebufferMismatchRatio: 0
      }
    }
  },
  {
    id: "title-background-frame-01", kind: "Background", name: "title-gba-frame-01.png", systemImage: "sparkles",
    metadata: {
      source: "Assets/backgrounds/title-gba-frame-01.png",
      provenance: "Frame derivado deterministicamente do background diurno aprovado da Title Screen",
      generatedBy: "exemplo-gba-title-background-day-v1",
      role: "title-bg-animation",
      sceneRoles: ["title-bg", "title-bg-animation"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      backgroundPaletteBankBudget: 16,
      backgroundPaletteReferenceAssetName: "title-gba.png",
      backgroundTileOptimizer: { enabled: true, tileBudget: 600, maxFramebufferMismatchRatio: 0 }
    }
  },
  {
    id: "title-background-frame-02", kind: "Background", name: "title-gba-frame-02.png", systemImage: "sparkles",
    metadata: {
      source: "Assets/backgrounds/title-gba-frame-02.png",
      provenance: "Frame derivado deterministicamente do background diurno aprovado da Title Screen",
      generatedBy: "exemplo-gba-title-background-day-v1",
      role: "title-bg-animation",
      sceneRoles: ["title-bg", "title-bg-animation"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      backgroundPaletteBankBudget: 16,
      backgroundPaletteReferenceAssetName: "title-gba.png",
      backgroundTileOptimizer: { enabled: true, tileBudget: 600, maxFramebufferMismatchRatio: 0 }
    }
  },
  {
    id: "initial-menu-background", kind: "Background", name: "menu-inicial-gba.png", systemImage: "list.bullet.rectangle",
    metadata: {
      source: "Assets/backgrounds/menu-inicial-gba.png",
      provenance: "Background original de revisão para o Menu Inicial, com composição de detalhe médio-baixo e área central livre para texto",
      generatedBy: "initial-menu-background-v2",
      role: "initial-menu-bg",
      sceneRoles: ["initial-menu-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      backgroundPaletteBankBudget: 1,
      width: 240,
      height: 160
    }
  },
  {
    id: "opening-background", kind: "Background", name: "opening-gba.png", systemImage: "sunrise",
    metadata: {
      source: "Assets/backgrounds/opening-gba.png",
      provenance: "Amanhecer dos faróis de Vértice, background independente da cena Abertura",
      generatedBy: "opening-background-v2",
      role: "opening-bg",
      sceneRoles: ["opening-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      backgroundPaletteBankBudget: 8
    }
  },
  {
    id: "initial-menu-background-v3", kind: "Background", name: "menu-inicial-v3-gba.png", systemImage: "list.bullet.rectangle",
    metadata: {
      source: "Assets/backgrounds/menu-inicial-v3-gba.png",
      provenance: "Background neutro candidato do reset do Menu Inicial, preparado a partir do pacote anexado com área para os atores e moldura pixel-art",
      generatedBy: "exemplo-gba-menu-inicial-v3-reset-candidate",
      role: "initial-menu-bg",
      sceneRoles: ["initial-menu-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_candidate",
      paletteBankCount: 16,
      backgroundPaletteBankBudget: 16,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "box-1536x1024-to-240x160-assetc-4bpp-16-banks",
      sourceSha256: "5537dd97a4156fb23615fdce6eb8ca7f7b4811f0bb614a18094e68100f645519",
      preparedSha256: "2ec9ad340c314a4bbaa5d98b440c2851f1f1294a2ae90d471d121e27b79e65ae",
      backgroundTileOptimizer: { enabled: true, tileBudget: 600, maxSourcePixelErrorRatio: 0, maxFramebufferMismatchRatio: 0 },
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "candidate"
    }
  },
  {
    id: "name-input-background-v1", kind: "Background", name: "name-input-bg-gba.png", systemImage: "rectangle.inset.filled",
    metadata: {
      source: "Assets/backgrounds/name-input-bg-gba.png",
      provenance: "Background neutro candidato do reset da entrada do nome, preparado a partir do pacote anexado com área para atores e controles dinâmicos",
      generatedBy: "exemplo-gba-menu-inicial-v3-reset-candidate",
      role: "name-input-bg",
      sceneRoles: ["name-input-bg"],
      profile: "menuNameInput",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_candidate",
      paletteBankCount: 16,
      backgroundPaletteBankBudget: 16,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "box-1536x1024-to-240x160-assetc-4bpp-16-banks",
      sourceSha256: "5537dd97a4156fb23615fdce6eb8ca7f7b4811f0bb614a18094e68100f645519",
      preparedSha256: "2ec9ad340c314a4bbaa5d98b440c2851f1f1294a2ae90d471d121e27b79e65ae",
      backgroundTileOptimizer: { enabled: true, tileBudget: 600, maxSourcePixelErrorRatio: 0, maxFramebufferMismatchRatio: 0 },
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "candidate"
    }
  },
  {
    id: "gender-selection-background-v1", kind: "Background", name: "gender-selection-gba.png", systemImage: "rectangle.inset.filled",
    metadata: {
      source: "Assets/backgrounds/gender-selection-gba.png",
      provenance: "Background neutro candidato do reset da escolha de personagem, preparado a partir do pacote anexado com área para dois atores e opções de menu",
      generatedBy: "exemplo-gba-menu-inicial-v3-reset-candidate",
      role: "gender-selection-bg",
      sceneRoles: ["gender-selection-bg"],
      profile: "menuGenderSelect",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_candidate",
      paletteBankCount: 16,
      backgroundPaletteBankBudget: 16,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "box-1536x1024-to-240x160-assetc-4bpp-16-banks",
      sourceSha256: "5537dd97a4156fb23615fdce6eb8ca7f7b4811f0bb614a18094e68100f645519",
      preparedSha256: "2ec9ad340c314a4bbaa5d98b440c2851f1f1294a2ae90d471d121e27b79e65ae",
      backgroundTileOptimizer: { enabled: true, tileBudget: 600, maxSourcePixelErrorRatio: 0, maxFramebufferMismatchRatio: 0 },
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "candidate"
    }
  },
  {
    id: "name-input-keyboard-background-v1", kind: "Background", name: "name-input-keyboard-gba.png", systemImage: "rectangle.inset.filled",
    metadata: {
      source: "Assets/backgrounds/name-input-keyboard-gba.png",
      provenance: "Variante candidata da entrada do nome com cartão e keycaps extraídos da composição anexada, preservando letras e foco como elementos dinâmicos do runtime",
      generatedBy: "menu-inicial-name-input-keyboard-alignment-v1",
      role: "name-input-bg",
      sceneRoles: ["name-input-bg"],
      profile: "menuNameInput",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_candidate",
      paletteBankCount: 16,
      backgroundPaletteBankBudget: 16,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "composition-regions-1536x1024-to-240x160-assetc-4bpp-16-banks",
      preparedSha256: "10c0a90ca012c7d59b8118a94bc6558fcc2d790d5c7a48dcbdb7300107603b76",
      backgroundTileOptimizer: { enabled: true, tileBudget: 600 },
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "candidate",
      visualStatus: "candidate"
    }
  },
  {
    id: "new-game-background", kind: "Background", name: "new-game-gba.png", systemImage: "rectangle.inset.filled",
    metadata: {
      source: "Assets/backgrounds/new-game-gba.png",
      provenance: "Composição aprovada do Novo Jogo sobre o background do Menu Inicial, com caixa fixa para campos dinâmicos",
      generatedBy: "new-game-background-v1",
      role: "new-game-bg",
      sceneRoles: ["new-game-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_fixed_panel",
      backgroundPaletteBankBudget: 16,
      width: 240,
      height: 160,
      sourcePipeline: "native-240x160-hard-pixel-panel-assetc-4bpp"
    }
  },
  {
    id: "load-game-background", kind: "Background", name: "load-game-gba.png", systemImage: "rectangle.inset.filled",
    metadata: {
      source: "Assets/backgrounds/load-game-gba.png",
      provenance: "Composição aprovada de Carregar Jogo sobre o background do Menu Inicial, com slot selecionado e caixa fixa para atores dinâmicos",
      generatedBy: "load-game-background-v1",
      role: "load-game-bg",
      sceneRoles: ["load-game-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_fixed_panel",
      backgroundPaletteBankBudget: 16,
      width: 240,
      height: 160,
      sourcePipeline: "native-240x160-hard-pixel-panel-assetc-4bpp"
    }
  },
  {
    id: "save-game-background", kind: "Background", name: "save-game-gba.png", systemImage: "externaldrive",
    metadata: {
      source: "Assets/backgrounds/save-game-gba.png",
      provenance: "Composição aprovada de Salvar sobre o painel de Carregar Jogo, com slot único e caixa fixa para atores dinâmicos",
      generatedBy: "save-game-background-v1",
      role: "save-game-bg",
      sceneRoles: ["save-game-bg"],
      reusableLibraryAsset: true,
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_fixed_panel",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 1,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "native-240x160-hard-pixel-panel-assetc-4bpp",
      assetcStatus: "safe",
      reviewStatus: "approved"
    }
  },
  {
    id: "start-menu-background", kind: "Background", name: "menu-start-gba.png", systemImage: "rectangle.inset.filled",
    metadata: {
      source: "Assets/backgrounds/menu-start-gba.png",
      provenance: "Composição aprovada do Menu Start sobre o background do Menu Inicial, com painel opaco fixo para a pausa e atores OBJ dinâmicos",
      generatedBy: "menu-start-background-v1",
      role: "start-menu-bg",
      sceneRoles: ["start-menu-bg"],
      reusableLibraryAsset: true,
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_fixed_panel",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 1,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "native-240x160-hard-pixel-panel-assetc-4bpp",
      assetcStatus: "safe",
      reviewStatus: "approved"
    }
  },
  {
    id: "missions-background", kind: "Background", name: "missoes-gba.png", systemImage: "list.bullet.rectangle",
    metadata: {
      source: "Assets/backgrounds/missoes-gba.png",
      provenance: "Composição determinística da cena Missões sobre o background aprovado do Menu Start, com slots fixos e área inferior para detalhe dinâmico",
      generatedBy: "missoes-background-v1",
      role: "missions-bg",
      sceneRoles: ["missions-bg"],
      reusableLibraryAsset: true,
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_fixed_panel",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 1,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "approved-menu-start-base-native-240x160-hard-pixel-slots-assetc-4bpp",
      assetcStatus: "safe",
      reviewStatus: "approved"
    }
  },
  {
    id: "inventory-background", kind: "Background", name: "inventario-gba.png", systemImage: "shippingbox",
    metadata: {
      source: "Assets/backgrounds/inventario-gba.png",
      provenance: "Composição determinística da cena Inventário sobre o background aprovado do Menu Start, com dois slots fixos e divisor para opções de itens",
      generatedBy: "inventario-background-v1",
      role: "inventory-bg",
      sceneRoles: ["inventory-bg"],
      reusableLibraryAsset: true,
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_fixed_panel",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 1,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "approved-menu-start-base-native-240x160-hard-pixel-slots-assetc-4bpp",
      assetcStatus: "safe",
      reviewStatus: "approved"
    }
  },
  {
    id: "map-hybrid-background", kind: "Background", name: "mapa-hibrido-gba.png", systemImage: "map",
    metadata: {
      source: "Assets/backgrounds/mapa-hibrido-gba.png",
      provenance: "Background híbrido aprovado da tela de mapa: visão geral das três ilhas, nós de rota e espaço contextual para consulta sem deslocamento",
      generatedBy: "mapa-hibrido-background-v1",
      role: "map-hybrid-bg",
      sceneRoles: ["map-hybrid-bg"],
      reusableLibraryAsset: true,
      profile: "worldMap",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_world_map_controlled",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "imagegen-source-center-crop-6x-nearest-assetc-4bpp",
      backgroundTileOptimizer: {
        enabled: true,
        tileBudget: 439,
        maxSourcePixelErrorRatio: 0.13005208333333335
      },
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "approved"
    }
  },
  {
    id: "profile-background", kind: "Background", name: "perfil-equipe-gba.png", systemImage: "person.2",
    metadata: {
      source: "Assets/backgrounds/perfil-equipe-gba.png",
      provenance: "Composição determinística aprovada da cena Perfil/Equipe sobre o background do Menu Start, com duas fichas 32×32 e divisor para detalhe nativo",
      generatedBy: "perfil-equipe-background-v1",
      role: "profile-bg",
      sceneRoles: ["profile-bg"],
      reusableLibraryAsset: true,
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_fixed_panel",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 1,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "approved-menu-start-base-native-240x160-hard-pixel-profile-cards-assetc-4bpp",
      assetcStatus: "safe",
      reviewStatus: "approved"
    }
  },
  {
    id: "language-background", kind: "Background", name: "idioma-gba.png", systemImage: "character.book.closed",
    metadata: {
      source: "Assets/backgrounds/idioma-gba.png",
      provenance: "Composição determinística aprovada da cena Idioma sobre o background do Menu Start, com moldura fixa para três opções e retorno",
      generatedBy: "idioma-background-v1",
      role: "language-bg",
      sceneRoles: ["language-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_fixed_panel",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 1,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "approved-menu-start-base-native-240x160-hard-pixel-language-frame-assetc-4bpp",
      assetcStatus: "safe",
      reviewStatus: "approved"
    }
  },
  {
    id: "settings-background", kind: "Background", name: "configuracoes-gba.png", systemImage: "gearshape",
    metadata: {
      source: "Assets/backgrounds/configuracoes-gba.png",
      provenance: "Composição determinística aprovada da cena Configurações sobre o background do Menu Start, com moldura fixa para três opções e retorno",
      generatedBy: "configuracoes-background-v1",
      role: "settings-bg",
      sceneRoles: ["settings-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_fixed_panel",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 1,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "approved-menu-start-base-native-240x160-hard-pixel-settings-frame-assetc-4bpp",
      assetcStatus: "safe",
      reviewStatus: "approved"
    }
  },
  {
    id: "credits-background", kind: "Background", name: "creditos-gba.png", systemImage: "info.circle",
    metadata: {
      source: "Assets/backgrounds/creditos-gba.png",
      provenance: "Composição determinística aprovada da cena Créditos sobre o background do Menu Start, com moldura fixa para duas informações e retorno",
      generatedBy: "creditos-background-v1",
      role: "credits-bg",
      sceneRoles: ["credits-bg"],
      profile: "menu",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_fixed_panel",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 1,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "approved-menu-start-base-native-240x160-hard-pixel-credits-frame-assetc-4bpp",
      assetcStatus: "safe",
      reviewStatus: "approved"
    }
  },
  {
    id: "prologue-background", kind: "Background", name: "prologue-gba.png", systemImage: "cloud.bolt",
    metadata: {
      source: "Assets/backgrounds/prologue-gba.png",
      provenance: "Plataforma de lançamento aprovada de Vértice",
      generatedBy: "prologue-background-v3",
      role: "prologue-port",
      sceneRoles: ["prologue-port", "prologue-storm"],
      profile: "cutscene",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      backgroundPaletteBankBudget: 16,
      reusableLibraryAsset: true,
      reviewStatus: "archived-candidate"
    }
  },
  ...[
    ["1", "cais em preparação ao amanhecer", "prologue-frame-1", "cloud.sun"],
    ["2", "cais sob a tempestade", "prologue-frame-2", "cloud.bolt"],
    ["3", "partida de Nara", "prologue-frame-3", "airplane.departure"]
  ].map(([frame, label, role, systemImage]) => ({
    id: `prologue-frame-${frame}-background`,
    kind: "Background",
    name: `prologue-frame-${frame}-gba.png`,
    systemImage,
    metadata: {
      source: `Assets/backgrounds/prologue-frame-${frame}-gba.png`,
      provenance: `Storyboard do Prólogo de Vértice v3, composição de cutscene aprovada e preparada em lote: ${label}`,
      generatedBy: "exemplo-gba-prologo-storyboard-v3",
      role,
      sceneRoles: [role, "prologue-storyboard"],
      profile: "cutscene",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      /* BG palette banks 14 and 15 are reserved by the HUD and dialogue skins at runtime. */
      backgroundPaletteBankBudget: 14,
      paletteBankCount: 14,
      width: 240,
      height: 160,
      tileCount: 600,
      sourcePipeline: "area-average-240x160-rgb555-assetc-4bpp-14-banks",
      backgroundTileOptimizer: { enabled: true, tileBudget: 1024, maxSourcePixelErrorRatio: frame === "1" ? 0.48010416666666667 : frame === "2" ? 0.3729166666666667 : 0.38859375 },
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "approved"
    }
  })),
  {
    id: "port-background", kind: "Background", name: "port-lumen-gba.png", systemImage: "ferry",
    metadata: { source: "Assets/backgrounds/port-lumen-gba.png", provenance: "Composição aprovada do Porto de Lúmen v8, preservada em 1536×1024 e reduzida deterministicamente por NEAREST para mapa top-down ortogonal 480×320; preparação em 4 BPP com exportação efetiva restrita aos bancos 0–13 para preservar as reservas de HUD e diálogo", generatedBy: "port-lumen-background-v8", role: "port-tiles", sceneRoles: ["port-tiles"], profile: "topdown", colorMode: "4bpp", paletteBankCount: 14, backgroundPaletteBankBudget: 14, width: 480, height: 320, tileCount: 2400, sourcePipeline: "nearest-1536x1024-to-480x320-assetc-4bpp-16-banks", sourceSha256: "27fbe857adf9eab41ece880588daba33b26ba45b58d3ef26dc1b016cba7f7bec", preparedSha256: "b5030c14933321462fde49ced6ebb59a920cc7c7b7016d633ebc3bdab4e40fc1", backgroundTileOptimizer: { enabled: true, tileBudget: 895, maxSourcePixelErrorRatio: 0.3711 }, assetcStatus: "attention", assetcReviewed: true, visualProfile: "gba_neutral_cohesive_pixel_art_medium_large_map", reviewStatus: "approved" }
  },
  {
    id: "route-background", kind: "Background", name: "route-map-gba.png", systemImage: "map",
    metadata: { source: "Assets/backgrounds/route-map-gba.png", provenance: "Mapa marítimo original de Vértice aprovado pelo usuário; a composição v6 é mantida como fonte visual e a exportação é restrita aos bancos 0–13 para preservar as reservas de HUD e diálogo", generatedBy: "route-map-background-v6", role: "route-map", sceneRoles: ["route-map", "route-islands"], profile: "worldMap", colorMode: "4bpp", visualProfile: "gba_neutral_cohesive_pixel_art_medium_world_map_controlled", paletteBankCount: 14, backgroundPaletteBankBudget: 14, width: 320, height: 240, tileCount: 1200, sourceSha256: "c3185664f4da54e11b80b03d77f247ffa22c3775bd120763c8d650ec808288f5", backgroundTileOptimizer: { enabled: true, tileBudget: 895, maxSourcePixelErrorRatio: 0.0120833333 }, reviewStatus: "approved" }
  },
  {
    id: "title-emblem", kind: "Sprite", name: "title-emblem.png", systemImage: "seal",
    metadata: { source: "Assets/sprites/title-emblem.png", provenance: "Sprite autoral de emblema para o menu Vértice", generatedBy: "narrative-asset-library-v1", role: "title-logo", sceneRoles: ["title-logo"], profile: "ui", colorMode: "4bpp", visualProfile: "diesel-fantasy-v1" }
  },
  {
    id: "title-logo-top", kind: "Sprite", name: "title-logo-top.png", systemImage: "textformat",
    metadata: {
      source: "Assets/sprites/title-logo-top.png",
      provenance: "Linha principal do wordmark Vértice gerado para a Title Screen, recortada da fonte aprovada e preparada em canvas OBJ 64x24",
      generatedBy: "exemplo-gba-title-screen-v1",
      role: "title-wordmark",
      sceneRoles: ["title-logo", "title-wordmark"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium",
      storageFormat: "indexed-4bpp",
      transparentIndex: 0,
      preparedBy: "gba-sprite-prep-free-64x24",
      frameWidth: 64,
      frameHeight: 24,
      frameCount: 1,
      visibleColors: 10,
      hardwareObjectsPerFrame: 4
    }
  },
  {
    id: "title-logo-bottom", kind: "Sprite", name: "title-logo-bottom.png", systemImage: "textformat",
    metadata: {
      source: "Assets/sprites/title-logo-bottom.png",
      provenance: "Subtítulo do wordmark Vértice gerado para a Title Screen, recortado da fonte aprovada e preparado em canvas OBJ 96x16",
      generatedBy: "exemplo-gba-title-screen-v1",
      role: "title-wordmark",
      sceneRoles: ["title-logo", "title-wordmark"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium",
      storageFormat: "indexed-4bpp",
      transparentIndex: 0,
      preparedBy: "gba-sprite-prep-free-96x16",
      frameWidth: 96,
      frameHeight: 16,
      frameCount: 1,
      visibleColors: 11,
      hardwareObjectsPerFrame: 3
    }
  },
  {
    id: "title-logo", kind: "Sprite", name: "title-logo.png", systemImage: "textformat",
    metadata: {
      source: "Assets/sprites/title-logo.png",
      provenance: "Wordmark completo aprovado da Title Screen, composto deterministicamente sem reamostragem a partir das duas fatias OBJ aprovadas",
      generatedBy: "exemplo-gba-title-screen-v3",
      role: "title-wordmark",
      sceneRoles: ["title-logo", "title-wordmark"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium",
      storageFormat: "indexed-4bpp",
      transparentIndex: 0,
      preparedBy: "exemplo-gba-title-screen-v3",
      frameWidth: 96,
      frameHeight: 32,
      frameCount: 1,
      visibleColors: 11,
      hardwareObjectsPerFrame: 2
    }
  },
  ...TITLE_LOGO_RUNTIME_SEGMENTS.map((segment) => ({
    id: `title-logo-emblem-${segment.id}`,
    kind: "Sprite",
    name: `title-logo-emblem-${segment.id}.png`,
    systemImage: "textformat",
    metadata: {
      source: `Assets/sprites/title-logo-emblem-${segment.id}.png`,
      provenance: "Recorte nativo do wordmark O ÚLTIMO FAROL aprovado pelo usuário, preparado a partir do PNG gerado anexado com matte removido e paleta OBJ 4 BPP",
      generatedBy: "exemplo-gba-title-screen-v4-approved-assets",
      role: "title-logo",
      sceneRoles: ["title-logo", "title-wordmark"],
      profile: "ui",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_approved_generated_logo",
      storageFormat: "indexed-4bpp",
      transparentIndex: 0,
      reserveObjTransparentColor: true,
      frameWidth: segment.width,
      frameHeight: segment.height,
      frameCount: 1,
      visibleColors: 15,
      hardwareObjectsPerFrame: segment.width === 64 && segment.height === 32 ? 1 : 2
    }
  })),
  {
    id: "press-start", kind: "Sprite", name: "press-start.png", systemImage: "play.rectangle",
    metadata: {
      source: "Assets/sprites/press-start.png",
      provenance: "PNG gerado de PRESS START aprovado pelo usuário, com matte quadriculado removido, preparo 4 BPP e canvas nativo 128x32",
      generatedBy: "exemplo-gba-title-screen-v4-approved-assets",
      role: "title-start-prompt",
      sceneRoles: ["title-start-prompt"],
      profile: "ui",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_approved_generated_logo",
      storageFormat: "indexed-4bpp",
      transparentIndex: 0,
      preparedBy: "gba-sprite-stage-candidate-4bpp-aspect-preserving",
      frameWidth: 128,
      frameHeight: 32,
      frameCount: 1,
      visibleColors: 15,
      hardwareObjectsPerFrame: 4
    }
  },
  ...[
    ["new-game", "menu-inicial-new-game.png", "NOVO JOGO", 64, 24],
    ["load-game", "menu-inicial-load-game.png", "CARREGAR JOGO", 64, 24],
    ["language", "menu-inicial-language.png", "IDIOMA", 64, 24],
    ["settings", "menu-inicial-settings.png", "CONFIGURAÇÕES", 64, 32],
    ["credits", "menu-inicial-credits.png", "CRÉDITOS", 64, 24]
  ].map(([id, name, text, frameWidth, frameHeight]) => ({
    id: `menu-${id}`,
    kind: "Sprite",
    name,
    systemImage: "textformat",
    metadata: {
      source: `Assets/sprites/${name}`,
      provenance: `Ator textual aprovado do Menu Inicial: ${text}, renderizado em bitmap binário com fonte condensada`,
      generatedBy: "exemplo-gba-menu-inicial-v3-reset-candidate",
      role: "initial-menu-option",
      sceneRoles: ["initial-menu-option"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium",
      storageFormat: "indexed-4bpp",
      transparentIndex: 0,
      preparedBy: "exemplo-gba-menu-inicial-v3-reset-candidate",
      frameWidth,
      frameHeight,
      frameCount: 1,
      visibleColors: 2
    }
  })),
  {
    id: "menu-cursor", kind: "Sprite", name: "menu-inicial-cursor.png", systemImage: "arrow.right",
    metadata: {
      source: "Assets/sprites/menu-inicial-cursor.png",
      provenance: "Seta de seleção aprovada do Menu Inicial, derivada da referência do usuário e preparada em canvas OBJ 16×16",
      generatedBy: "exemplo-gba-menu-inicial-v3-reset-candidate",
      role: "initial-menu-cursor",
      sceneRoles: ["initial-menu-cursor"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium",
      storageFormat: "indexed-4bpp",
      transparentIndex: 0,
      preparedBy: "exemplo-gba-menu-inicial-v3-reset-candidate",
      frameWidth: 16,
      frameHeight: 16,
      frameCount: 1,
      visibleColors: 4
    }
  },
  ...[
    ["gender-title", "menu-gender-title.png", "ESCOLHA SEU PERSONAGEM", 64, 32],
    ["player-name-title", "menu-player-name-title.png", "NOME DO JOGADOR", 64, 32]
  ].map(([id, name, text, frameWidth, frameHeight]) => ({
    id: `menu-${id}`,
    kind: "Sprite",
    name,
    systemImage: "textformat",
    metadata: {
      source: `Assets/sprites/${name}`,
      provenance: `Título textual dedicado da etapa de entrada do jogador: ${text}`,
      generatedBy: "exemplo-gba-menu-inicial-v3-reset-candidate",
      role: "menu-entry-title",
      sceneRoles: ["gender-selection-title", "player-name-title"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium",
      storageFormat: "rgba-hard-pixel",
      transparentIndex: 0,
      preparedBy: "exemplo-gba-menu-inicial-v3-reset-candidate",
      frameWidth,
      frameHeight,
      frameCount: 1,
      visibleColors: 2
    }
  })),
  {
    id: "menu-entry-cursor", kind: "Sprite", name: "menu-entry-cursor.png", systemImage: "arrow.right",
    metadata: {
      source: "Assets/sprites/menu-entry-cursor.png",
      provenance: "Seta de seleção dedicada ao campo de entrada e à escolha de gênero, com silhueta OBJ 16×16",
      generatedBy: "menu-entry-actors-v1",
      role: "menu-entry-cursor",
      sceneRoles: ["gender-selection-cursor", "player-name-cursor"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium",
      storageFormat: "rgba-hard-pixel",
      transparentIndex: 0,
      preparedBy: "menu-entry-actors-v1",
      frameWidth: 16,
      frameHeight: 16,
      frameCount: 1,
      visibleColors: 3
    }
  },
  ...[
    ["title", "menu-start-title.png", "MENU START", 88],
    ["missions", "menu-missoes.png", "MISSÕES", 64],
    ["inventory", "menu-inventario.png", "INVENTÁRIO", 88],
    ["map", "menu-mapa.png", "MAPA", 40],
    ["profile", "menu-perfil-equipe.png", "PERFIL/EQUIPE", 112],
    ["save", "menu-salvar.png", "SALVAR", 56],
    ["settings", "menu-configuracoes.png", "CONFIGURAÇÕES", 112],
    ["tactical", "menu-tactical.png", "ARENA TÁTICA", 104]
  ].map(([id, name, text, frameWidth]) => ({
    id: `menu-start-${id}`,
    kind: "Sprite",
    name,
    systemImage: "textformat",
    metadata: {
      source: `Assets/sprites/${name}`,
      provenance: `Ator textual independente do Menu Start: ${text}`,
      generatedBy: "menu-start-actors-v1",
      role: id === "title" ? "start-menu-title" : "start-menu-option",
      sceneRoles: [id === "title" ? "start-menu-title" : "start-menu-option"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium",
      storageFormat: "indexed-4bpp",
      transparentIndex: 0,
      preparedBy: "menu-start-actors-v1",
      frameWidth,
      frameHeight: 16,
      frameCount: 1,
      visibleColors: 2
    }
  })),
  ...[
    ["missions-active", "missoes-active.png", "ROTA DOS FARÓIS · ATIVA"],
    ["missions-next", "missoes-next.png", "PRÓXIMO PASSO · PORTO DE LÚMEN"]
  ].map(([id, name, text]) => ({
    id: `menu-${id}`,
    kind: "Sprite",
    name,
    systemImage: "textformat",
    metadata: {
      source: `Assets/sprites/${name}`,
      provenance: `Ator OBJ textual da cena Missões, composto em duas linhas para a grade GBA: ${text}`,
      generatedBy: "missoes-actors-v1",
      role: "missions-option",
      sceneRoles: ["missions-option"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_fixed_panel",
      storageFormat: "rgba-hard-pixel",
      transparentIndex: 0,
      preparedBy: "missoes-actors-v1",
      frameWidth: 128,
      frameHeight: 32,
      frameCount: 1,
      visibleColors: 2,
      visualStatus: "approved"
    }
  })),
  ...[
    ["inventory-modules", "inventario-modules.png", "MÓDULOS DA AERONAVE", "active-option"],
    ["inventory-empty", "inventario-empty.png", "NENHUM ITEM CONSUMÍVEL", "disabled-option"]
  ].map(([id, name, text, role]) => ({
    id: `menu-${id}`,
    kind: "Sprite",
    name,
    systemImage: "shippingbox",
    metadata: {
      source: `Assets/sprites/${name}`,
      provenance: `Ator OBJ textual da cena Inventário, composto em duas linhas para a grade GBA: ${text}`,
      generatedBy: "inventario-actors-v1",
      role: `inventory-${role}`,
      sceneRoles: ["inventory-option"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_fixed_panel",
      storageFormat: "rgba-hard-pixel",
      transparentIndex: 0,
      preparedBy: "inventario-actors-v1",
      frameWidth: 128,
      frameHeight: 32,
      frameCount: 1,
      visibleColors: 2,
      visualStatus: "approved",
      enabled: role === "active-option"
    }
  })),
  ...[
    ["map-detail-current", "mapa-detail-current.png", "PORTO DE LÚMEN", "map-hybrid-detail-current"],
    ["map-detail-penedos", "mapa-detail-penedos.png", "PENEDOS DO VENTO", "map-hybrid-detail-reusable"]
  ].map(([id, name, text, role]) => ({
    id: `menu-${id}`,
    kind: "Sprite",
    name,
    isReusableLibraryAsset: true,
    systemImage: "map",
    metadata: {
      source: `Assets/sprites/${name}`,
      reusableLibraryAsset: true,
      provenance: `Ator OBJ textual contextual do Mapa Híbrido, preparado em duas linhas para a caixa fixa de detalhes: ${text}`,
      generatedBy: "mapa-hibrido-actors-v1",
      role,
      sceneRoles: ["map-hybrid-detail"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_world_map_controlled",
      storageFormat: "rgba-hard-pixel",
      transparentIndex: 0,
      preparedBy: "mapa-hibrido-actors-v1",
      frameWidth: 208,
      frameHeight: 32,
      frameCount: 1,
      visibleColors: 3,
      visualStatus: "approved"
    }
  })),
  ...[
    ["profile-nara", "profile-nara.png", "NARA · ATIVA"],
    ["profile-guardian", "profile-guardian.png", "GUARDIÃ · PEND"]
  ].map(([id, name, text]) => ({
    id: `menu-${id}`,
    kind: "Sprite",
    name,
    systemImage: "person.crop.square",
    metadata: {
      source: `Assets/sprites/${name}`,
      provenance: `Ator OBJ textual da cena Perfil/Equipe, preparado em canvas 112×16 para a ficha: ${text}`,
      generatedBy: "perfil-equipe-actors-v1",
      role: "profile-option",
      sceneRoles: ["profile-option"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_fixed_panel",
      storageFormat: "indexed-4bpp",
      transparentIndex: 0,
      preparedBy: "perfil-equipe-actors-v1",
      frameWidth: 112,
      frameHeight: 16,
      frameCount: 1,
      visibleColors: 2,
      visualStatus: "approved"
    }
  })),
  ...[
    ["name-label", "menu-name-label.png", "NOME", 64, 32],
    ["male", "menu-male.png", "HOMEM", 64, 24],
    ["female", "menu-female.png", "MULHER", 64, 24],
    ["confirm", "menu-confirm.png", "CONFIRMAR", 64, 32],
    ["entry-back", "menu-entry-back.png", "VOLTAR", 64, 24],
    ["back", "menu-back.png", "VOLTAR", 56, 16],
    ["slot-1", "menu-slot-1.png", "SLOT 1", 56, 16],
    ["portuguese", "menu-portuguese.png", "PORTUGUES", 80, 16],
    ["spanish", "menu-spanish.png", "ESPANOL", 64, 16],
    ["english", "menu-english.png", "ENGLISH", 64, 16],
    ["audio", "menu-audio.png", "AUDIO", 48, 16],
    ["controls", "menu-controls.png", "CONTROLES", 80, 16],
    ["project", "menu-project.png", "GBA STUDIO", 88, 16],
    ["engine", "menu-engine.png", "ENGINE", 56, 16]
  ].map(([id, name, text, frameWidth, frameHeight]) => ({
    id: `menu-${id}`,
    kind: "Sprite",
    name,
    systemImage: "textformat",
    metadata: {
      source: `Assets/sprites/${name}`,
      provenance: `Ator textual independente de tela ligada ao Menu Inicial: ${text}`,
      generatedBy: id === "entry-back"
        ? "exemplo-gba-menu-inicial-v3-reset-candidate"
        : "exemplo-gba-menu-inicial-v3",
      role: "menu-linked-label",
      sceneRoles: ["menu-linked-label"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium",
      storageFormat: "indexed-4bpp",
      transparentIndex: 0,
      preparedBy: id === "entry-back"
        ? "exemplo-gba-menu-inicial-v3-reset-candidate"
        : "exemplo-gba-menu-inicial-v3",
      frameWidth,
      frameHeight,
      frameCount: 1,
      visibleColors: 2
    }
  })),
  ...[
    ["slot-1-left-focus", "menu-save-slot-1-left-focus.png", "SLOT 1", 128],
    ["slot-1-right-focus", "menu-save-slot-1-right-focus.png", "SLOT 1", 32],
    ["slot-1-bottom-left-focus", "menu-save-slot-1-bottom-left-focus.png", "SLOT 1", 128, 8],
    ["slot-1-bottom-right-focus", "menu-save-slot-1-bottom-right-focus.png", "SLOT 1", 32, 8],
    ["slot-2-left-focus", "menu-save-slot-2-left-focus.png", "SLOT 2", 128],
    ["slot-2-right-focus", "menu-save-slot-2-right-focus.png", "SLOT 2", 32],
    ["slot-2-bottom-left-focus", "menu-save-slot-2-bottom-left-focus.png", "SLOT 2", 128, 8],
    ["slot-2-bottom-right-focus", "menu-save-slot-2-bottom-right-focus.png", "SLOT 2", 32, 8],
    ["slot-3-left-focus", "menu-save-slot-3-left-focus.png", "SLOT 3", 128],
    ["slot-3-right-focus", "menu-save-slot-3-right-focus.png", "SLOT 3", 32],
    ["slot-3-bottom-left-focus", "menu-save-slot-3-bottom-left-focus.png", "SLOT 3", 128, 8],
    ["slot-3-bottom-right-focus", "menu-save-slot-3-bottom-right-focus.png", "SLOT 3", 32, 8]
  ].map(([id, name, text, frameWidth, frameHeight = 32]) => ({
    id: `menu-${id}`,
    kind: "Sprite",
    name,
    systemImage: "selection.pin.in.out",
    metadata: {
      source: `Assets/sprites/${name}`,
      provenance: `Parte ${id.includes("left") ? "esquerda" : "direita"} do cartão de salvamento ${text}, recortada da composição aprovada com estados normal e selecionado`,
      generatedBy: "save-slot-cards-v2",
      role: "save-slot-focus-part",
      sceneRoles: ["save-slot"],
      profile: "free",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_fixed_panel",
      storageFormat: "rgba-hard-pixel",
      transparentIndex: 0,
      preparedBy: "save-slot-cards-v2",
      frameWidth,
      frameHeight,
      frameCount: 2,
      visibleColors: 16,
      visualStatus: "approved",
      reviewStatus: "approved",
      assetcStatus: "attention",
      assetcReviewed: true,
      approvalNote: "Aprovado visualmente pelo usuário em 2026-09-17; quantização 4bpp permanece em attention até a validação de ROM."
    }
  })),
  {
    id: "airship", kind: "Sprite", name: "airship.png", systemImage: "airplane",
    metadata: { source: "Assets/sprites/airship.png", provenance: "Sprite autoral de aeronave Vértice", generatedBy: "narrative-asset-library-v1", role: "title-vehicle", sceneRoles: ["title-vehicle", "airship-cutscene", "route-airship"], profile: "worldMap", colorMode: "4bpp", visualProfile: "diesel-fantasy-v1" }
  },
  {
    id: "opening-airship", kind: "Sprite", name: "opening-airship.png", systemImage: "airplane",
    metadata: { source: "Assets/sprites/opening-airship.png", provenance: "Aeronave medium aprovada para a cutscene Abertura de Vértice", generatedBy: "opening-airship-candidate-v11", role: "opening-actor", sceneRoles: ["opening-actor", "airship-cutscene"], profile: "free", colorMode: "4bpp", visualProfile: "gba_neutral_cohesive_pixel_art_medium", storageFormat: "indexed-4bpp", transparentIndex: 0, preparedBy: "sprite-library-4bpp-v1" }
  },
  {
    id: "nara-topdown", kind: "Sprite", name: "nara-topdown.png", systemImage: "figure.walk",
    metadata: { source: "Assets/sprites/nara-topdown.png", sourceSha256: "d60684b930e4b210e1c6a07962e4ca2993b0c7ea8bd2f3fd1a83f6faf4c7875c", preparedSha256: "d60684b930e4b210e1c6a07962e4ca2993b0c7ea8bd2f3fd1a83f6faf4c7875c", provenance: "Fonte aprovada pelo usuário em 2026-09-11 no lote porto-player-scale-v3-32x64; preparo determinístico nearest-neighbor em canvas nativo 32×64 com seis poses lógicas e nove quadros físicos contíguos", license: "Project-owned", generatedBy: "porto-player-scale-v3-32x64", role: "nara-topdown", sceneRoles: ["nara-cutscene", "nara-topdown"], profile: "free", frameWidth: 32, frameHeight: 64, frameCount: 9, logicalSourceFrameCount: 6, visibleColors: 14, hardwareObjectsPerFrame: 1, colorMode: "4bpp", visualProfile: "gba_neutral_cohesive_pixel_art_medium", storageFormat: "rgba-4bpp-compatible", transparentIndex: 0, preparedBy: "porto-player-scale-v3-32x64", reviewStatus: "approved" }
  },
  {
    id: "player-male", kind: "Sprite", name: "player-male.png", systemImage: "figure.walk",
    metadata: {
      source: "Assets/sprites/player-male.png",
      sourceSha256: "bed82e13276119758f67db64253516bd9214be30e30887cc1aedb8d33bbf7e8b",
      preparedSha256: "bed82e13276119758f67db64253516bd9214be30e30887cc1aedb8d33bbf7e8b",
      provenance: "Fonte preservada em porto-player-scale-v1/source; preparo pelo gba-sprite-pack em canvas nativo 16×32 para respeitar a escala das portas do Porto, com nove células de animação",
      license: "Project-owned",
      generatedBy: "porto-player-scale-v4-16x32-context",
      role: "player-profile-male",
      sceneRoles: ["gender-selection", "player-profile", "topdown-player"],
      profile: "free",
      frameWidth: 16,
      frameHeight: 32,
      frameCount: 9,
      logicalSourceFrameCount: 6,
      visibleColors: 15,
      hardwareObjectsPerFrame: 1,
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium",
      storageFormat: "rgba-4bpp-compatible",
      preparedBy: "porto-player-scale-v4-16x32-context"
    }
  },
  {
    id: "player-female", kind: "Sprite", name: "player-female.png", systemImage: "figure.walk",
    metadata: {
      source: "Assets/sprites/player-female.png",
      sourceSha256: "2e1dcd7a0aa938f2e8828d4f4c813e33786b681502247585f3dc4c88daeaf916",
      preparedSha256: "2e1dcd7a0aa938f2e8828d4f4c813e33786b681502247585f3dc4c88daeaf916",
      provenance: "Fonte preservada em porto-player-scale-v1/source; preparo pelo gba-sprite-pack em canvas nativo 16×32 para respeitar a escala das portas do Porto, com nove células de animação",
      license: "Project-owned",
      generatedBy: "porto-player-scale-v4-16x32-context",
      role: "player-profile-female",
      sceneRoles: ["gender-selection", "player-profile", "topdown-player"],
      profile: "free",
      frameWidth: 16,
      frameHeight: 32,
      frameCount: 9,
      logicalSourceFrameCount: 6,
      visibleColors: 15,
      hardwareObjectsPerFrame: 1,
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium",
      storageFormat: "rgba-4bpp-compatible",
      preparedBy: "porto-player-scale-v4-16x32-context"
    }
  },
  {
    id: "gender-player-male-32x64", kind: "Sprite", name: "gender-player-male-32x64.png", systemImage: "figure.walk",
    metadata: {
      source: "Assets/sprites/gender-player-male-32x64.png",
      sourceSha256: "a1950a0897e1cfc1b6e955cb39bdb6dc1cdc9eb7bac6702438f632fed4ae5a5f",
      preparedSha256: "09d0f98b003dd9ed40b0af1ae200f7cff7baf95c3b918764f0de6804e082069c",
      provenance: "Recorte preservado da folha de variações de personagem anexada, preparado em canvas OBJ 48×48 com matte medido e redução adaptativa",
      license: "Project-owned",
      generatedBy: "exemplo-gba-menu-inicial-v3-reset-candidate",
      role: "gender-selection-player-male",
      sceneRoles: ["gender-selection"],
      profile: "free",
      frameWidth: 48,
      frameHeight: 48,
      frameCount: 1,
      visibleColors: 15,
      hardwareObjectsPerFrame: 1,
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium",
      storageFormat: "rgba-4bpp-compatible",
      transparentIndex: 0,
      preparedBy: "exemplo-gba-menu-inicial-v3-reset-candidate",
      reviewStatus: "candidate"
    }
  },
  {
    id: "gender-player-female-32x64", kind: "Sprite", name: "gender-player-female-32x64.png", systemImage: "figure.walk",
    metadata: {
      source: "Assets/sprites/gender-player-female-32x64.png",
      sourceSha256: "a1950a0897e1cfc1b6e955cb39bdb6dc1cdc9eb7bac6702438f632fed4ae5a5f",
      preparedSha256: "505fe2fd1fc40e290d9cf3747d69a6b947c5d378360082518597cfe2bfd75bd5",
      provenance: "Recorte preservado da folha de variações de personagem anexada, preparado em canvas OBJ 48×48 com matte medido e redução adaptativa",
      license: "Project-owned",
      generatedBy: "exemplo-gba-menu-inicial-v3-reset-candidate",
      role: "gender-selection-player-female",
      sceneRoles: ["gender-selection"],
      profile: "free",
      frameWidth: 48,
      frameHeight: 48,
      frameCount: 1,
      visibleColors: 15,
      hardwareObjectsPerFrame: 1,
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium",
      storageFormat: "rgba-4bpp-compatible",
      transparentIndex: 0,
      preparedBy: "exemplo-gba-menu-inicial-v3-reset-candidate",
      reviewStatus: "candidate"
    }
  },
  ...[
    ["male", "name-player-male-32x32.png", "a3046be7258336bdcd089efd7623313e08b6e9d7da1cc1ab2cbd98cdb9370f31"],
    ["female", "name-player-female-32x32.png", "f8de4acb14473fb8cbbba2a28a94a70eb37b59cbbb7e332c1e947450f7d4eb39"]
  ].map(([gender, name, preparedSha256]) => ({
    id: "name-player-" + gender + "-32x32",
    kind: "Sprite",
    name,
    systemImage: "figure.walk",
    metadata: {
      source: "Assets/sprites/" + name,
      sourceSha256: "a1950a0897e1cfc1b6e955cb39bdb6dc1cdc9eb7bac6702438f632fed4ae5a5f",
      preparedSha256,
      provenance: "Retrato reduzido da mesma folha de personagem anexada, preparado em canvas OBJ 32×32 para a tela Nome do jogador e revisado em nearest-only",
      license: "Project-owned",
      generatedBy: "menu-inicial-name-input-keyboard-alignment-v1",
      role: "name-input-player",
      sceneRoles: ["name-input"],
      profile: "free",
      frameWidth: 32,
      frameHeight: 32,
      frameCount: 1,
      visibleColors: 15,
      hardwareObjectsPerFrame: 1,
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_candidate",
      storageFormat: "rgba-4bpp-compatible",
      transparentIndex: 0,
      preparedBy: "menu-inicial-name-input-keyboard-alignment-v1",
      reviewStatus: "candidate",
      visualStatus: "candidate"
    }
  })),
  {
    id: "mechanic", kind: "Sprite", name: "mechanic.png", systemImage: "wrench.and.screwdriver",
    metadata: { source: "Assets/sprites/mechanic.png", sourceSha256: "6fbef7e6ad04f65298c93b387d7e171410524858319e7c3cee3bf3010c347cae", preparedSha256: "6fbef7e6ad04f65298c93b387d7e171410524858319e7c3cee3bf3010c347cae", provenance: "Fonte preservada no ator aprovado do Porto; preparo pelo gba-sprite-pack em canvas nativo 16×32 para respeitar a escala das portas do Porto, com seis células de animação", generatedBy: "porto-player-scale-v4-16x32-context", role: "mechanic", sceneRoles: ["mechanic", "port-npcs"], profile: "free", frameWidth: 16, frameHeight: 32, frameCount: 6, logicalSourceFrameCount: 6, visibleColors: 15, hardwareObjectsPerFrame: 1, colorMode: "4bpp", visualProfile: "gba_neutral_cohesive_pixel_art_medium", storageFormat: "rgba-4bpp-compatible", transparentIndex: 0, preparedBy: "porto-player-scale-v4-16x32-context" }
  },
  {
    id: "rival-cutscene", kind: "Sprite", name: "rival-cutscene.png", systemImage: "figure.2",
    metadata: { source: "Assets/sprites/rival-cutscene.png", provenance: "Sprite autoral do rival de Nara", generatedBy: "narrative-asset-library-v1", role: "rival-cutscene", sceneRoles: ["rival-cutscene"], profile: "cutscene", colorMode: "4bpp", visualProfile: "diesel-fantasy-v1" }
  },
  {
    id: "port-cargo", kind: "Sprite", name: "port-cargo.png", systemImage: "shippingbox",
    metadata: { source: "Assets/sprites/port-cargo.png", provenance: "PNG local aprovado de carga interativa de Porto de Lúmen", generatedBy: "port-lumen-approved-v3", role: "port-props", sceneRoles: ["port-props"], profile: "scenery", colorMode: "4bpp", visualProfile: "gba_neutral_cohesive_pixel_art" }
  },
  {
    id: "port-skiff", kind: "Sprite", name: "port-skiff.png", systemImage: "ferry",
    metadata: { source: "Assets/sprites/port-skiff.png", provenance: "PNG local aprovado da Lumen Skiff atracada", generatedBy: "port-lumen-approved-v3", role: "port-skiff", sceneRoles: ["port-skiff"], profile: "scenery", colorMode: "4bpp", visualProfile: "gba_neutral_cohesive_pixel_art" }
  },
  {
    id: "route-beacon", kind: "Sprite", name: "route-beacon.png", systemImage: "mappin.and.ellipse",
    metadata: { source: "Assets/sprites/route-beacon.png", provenance: "Marcador autoral de farol para mapa de rotas", generatedBy: "narrative-asset-library-v1", role: "route-marker", sceneRoles: ["route-marker"], profile: "ui", colorMode: "4bpp", visualProfile: "diesel-fantasy-v1" }
  },
]);

const VERTICE_PENEDOS_PLATFORMER_ASSETS = Object.freeze([
  {
    id: "penedos-platformer-background-v2",
    kind: "Background",
    name: "penedos-platformer-v2-gba.png",
    systemImage: "figure.run",
    metadata: {
      source: "Assets/backgrounds/penedos-platformer-v2-gba.png",
      sourceOriginal: "/Users/example/Pictures/Assets Exemplo/plataforma/sources/generated/porto-lume-plataforma-v2-source.png",
      sourceSha256: "2b7569e4c6350465458193a624d107a22b5a2a1b66851efe60cdfb59da443fe7",
      preparedSha256: "81ec1c2f97a89593da040dd3dc2674597062f8078221b9a22c91d8861b738ea9",
      provenance: "BG aprovado visualmente pelo usuário no pacote plataforma Porto Lume v2; preservado em 240×160 sem reamostragem adicional na integração",
      generatedBy: "porto-lume-platformer-v2-candidate",
      role: "platformer-full-scene",
      sceneRoles: ["platformer-full-scene", "platformer-surfaces", "cliff-platformer", "cliff-tiles"],
      profile: "platformer",
      colorMode: "4bpp",
      storageFormat: "rgba-4bpp-compatible",
      visualProfile: "gba_neutral_cohesive_pixel_art_porto_lume_platformer",
      width: 240,
      height: 160,
      tileCount: 600,
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      backgroundTileOptimizer: {
        enabled: true,
        tileBudget: 600
      },
      assetcStatus: "pending",
      assetcReviewed: false,
      reviewStatus: "approved-visual",
      sourcePreparation: "1536x1024 fonte preservada -> NEAREST aprovado em 240x160 -> validação assetc pendente"
    }
  },
  {
    id: "nara-penedos-platformer-64x64",
    kind: "Sprite",
    name: "nara-penedos-platformer-64x64.png",
    systemImage: "figure.run",
    metadata: {
      source: "Assets/sprites/nara-penedos-platformer-64x64.png",
      sourceOriginal: "/Users/example/Pictures/Assets Exemplo/plataforma/player/player-plataforma-porto-lume-sheet-v1.png",
      sourceSha256: "a8f37065d3249768234773378794704c359b2027fb3cdae2a82fcc970c945d36",
      preparedSha256: "6f0b745ae3525aea518577033ac96566a4e654cbd722c4bf74310d173472a477",
      provenance: "Folha aprovada visualmente de player Porto Lume; oito recortes uniformes 384x512, nearest-only em 64x64 e preparo OBJ 4bpp",
      license: "User-provided/generated",
      generatedBy: "porto-lume-platformer-v2-candidate",
      role: "platformer-player",
      sceneRoles: ["platformer-player", "penedos-platformer"],
      profile: "platformer-large",
      frameWidth: 64,
      frameHeight: 64,
      frameCount: 8,
      logicalSourceFrameCount: 8,
      anchor: "bottom-center",
      collisionWidth: 16,
      collisionHeight: 16,
      visibleColors: 15,
      hardwareObjectsPerFrame: 1,
      colorMode: "4bpp",
      storageFormat: "rgba-4bpp-compatible",
      transparentIndex: 0,
      visualProfile: "gba_neutral_cohesive_pixel_art_porto_lume_platformer",
      reviewStatus: "approved",
      assetcStatus: "pending"
    }
  },
  {
    id: "penedos-enemies-32x32",
    kind: "Sprite",
    name: "penedos-enemies-32x32.png",
    systemImage: "ant",
    metadata: {
      source: "Assets/sprites/penedos-enemies-32x32.png",
      sourceOriginal: "/Users/example/Pictures/Assets Exemplo/plataforma/enemies/enemies-plataforma-porto-lume-sheet-v1.png",
      sourceSha256: "c7cb76fc83fb288354d257369ab10a9a2aff33d5c375b439370f9fb289f2571b",
      preparedSha256: "95bb016808f4c1fca8cd1d5d42ff76151b7fcd2e64a7b90dfa8a17309524e0e4",
      provenance: "Folha aprovada visualmente de inimigos Porto Lume; crops de caranguejo, mariposa e gosma da composição, nearest-only em 32x32 e preparo OBJ 4bpp",
      license: "User-provided/generated",
      generatedBy: "porto-lume-platformer-v2-candidate",
      role: "platformer-enemies",
      sceneRoles: ["platformer-enemies", "penedos-platformer"],
      profile: "enemy",
      frameWidth: 32,
      frameHeight: 32,
      frameCount: 3,
      logicalSourceFrameCount: 3,
      anchor: "bottom-center",
      collisionWidth: 16,
      collisionHeight: 16,
      visibleColors: 15,
      hardwareObjectsPerFrame: 1,
      colorMode: "4bpp",
      storageFormat: "rgba-4bpp-compatible",
      transparentIndex: 0,
      visualProfile: "gba_neutral_cohesive_pixel_art_porto_lume_platformer",
      reviewStatus: "approved",
      assetcStatus: "pending"
    }
  }
]);

const VERTICE_PORT_LUMEN_ASSET_NAMES = new Set([
  "port-lumen-gba.png",
  "nara-topdown.png",
  "mechanic.png",
  "port-cargo.png",
  "port-skiff.png"
]);

const VERTICE_PORT_LUMEN_TOPDOWN_ASSETS = Object.freeze([
  {
    id: "porto-lume-exterior-topdown-background",
    kind: "Background",
    name: "porto-lume-exterior-topdown-gba.png",
    systemImage: "lighthouse",
    metadata: {
      source: "Assets/backgrounds/porto-lume-exterior-topdown-gba.png",
      sourceOriginal: "Assets Exemplo/topdown/backgrounds/porto-lume-exterior-v1.png",
      sourceCandidate: "/tmp/gba-studio-topdown-reset-v1.3O15O9/backgrounds/porto-lume-exterior-topdown-480x320-assetc-per-tile-candidate.png",
      sourceSha256: "f5351fa509bf07f23a1f35954d7776e8e3a5b2dea66ce0e615d187e217095697",
      preparedSha256: "02193f95986e003ee017fb9e7e28d719fbe0318557ce326873e74556b8f700c6",
      provenance: "Background aprovado pelo usuário para Porto de Lúmen exterior; candidato 480×320 fornecido no pacote de reset e promovido sem reamostragem adicional",
      generatedBy: "gba-studio-topdown-reset-v1.3O15O9",
      role: "port-lumen-exterior-topdown",
      sceneRoles: ["port-lumen-exterior-topdown", "port-tiles"],
      profile: "topdown",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium_large_map",
      paletteBankCount: 14,
      backgroundPaletteBankBudget: 14,
      width: 480,
      height: 320,
      tileCount: 2400,
      sourcePipeline: "candidate-provided-480x320-assetc-per-tile",
      backgroundTileOptimizer: { enabled: true, tileBudget: 895 },
      assetcStatus: "attention",
      assetcReviewed: true,
      reusableLibraryAsset: true,
      reviewStatus: "approved"
    }
  },
  {
    id: "farol-interior-topdown-background",
    kind: "Background",
    name: "farol-interior-topdown-gba.png",
    systemImage: "building.columns",
    metadata: {
      source: "Assets/backgrounds/farol-interior-topdown-gba.png",
      sourceOriginal: "Assets Exemplo/topdown/backgrounds/farol-interior-v1.png",
      sourceCandidate: "/tmp/gba-studio-topdown-reset-v1.3O15O9/backgrounds/farol-interior-topdown-480x320-assetc-per-tile-candidate.png",
      sourceSha256: "d9b90beb68df29417b101151250e287c170e7eaa24536f0f9ad0a5bcef44b9da",
      preparedSha256: "fca87f4510a4426ac2ae30e71c6c862541c9cc8285e00b98fff666f2fcaf7e23",
      provenance: "Background aprovado pelo usuário para o interior do farol; candidato 480×320 fornecido no pacote de reset e promovido sem reamostragem adicional",
      generatedBy: "gba-studio-topdown-reset-v1.3O15O9",
      role: "lighthouse-interior-topdown",
      sceneRoles: ["lighthouse-interior-topdown", "lighthouse-room"],
      profile: "topdown",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_medium_large_map",
      paletteBankCount: 14,
      backgroundPaletteBankBudget: 14,
      width: 480,
      height: 320,
      tileCount: 2400,
      sourcePipeline: "candidate-provided-480x320-assetc-per-tile",
      backgroundTileOptimizer: { enabled: true, tileBudget: 895 },
      assetcStatus: "attention",
      assetcReviewed: true,
      reusableLibraryAsset: true,
      reviewStatus: "approved"
    }
  },
  {
    id: "farol-interior-topdown-360x240-background",
    kind: "Background",
    name: "farol-interior-topdown-360x240-gba.png",
    systemImage: "building.columns.fill",
    metadata: {
      source: "Assets/backgrounds/farol-interior-topdown-360x240-gba.png",
      sourceOriginal: "Assets Exemplo/topdown/backgrounds/farol-interior-v1.png",
      sourceCandidate: "tools/gba-sprite-prep/production/farol-interior-topdown-360x240-candidate/staging/farol-interior-topdown-360x240-nearest-only-candidate.png",
      sourceSha256: "d9b90beb68df29417b101151250e287c170e7eaa24536f0f9ad0a5bcef44b9da",
      preparedSha256: "e8944a17ea51d4c2ca65432331a3cb36545fa7a2d4aefbd9b24d01f077924181",
      provenance: "Background aprovado visualmente pelo usuário para o interior do farol; origem 1448x1086 recortada centralmente para 360x240 e preparada em 4bpp sem reprocessar o background 480x320",
      generatedBy: "farol-interior-topdown-360x240-candidate",
      role: "lighthouse-interior-topdown-360x240",
      sceneRoles: ["lighthouse-interior-topdown", "lighthouse-room"],
      profile: "topdown",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_compact_room",
      paletteBankCount: 14,
      backgroundPaletteBankBudget: 14,
      width: 360,
      height: 240,
      tileCount: 1350,
      sourcePipeline: "nearest-cover-1448x1086-to-360x240-assetc-4bpp",
      backgroundTileOptimizer: { enabled: true, tileBudget: 895 },
      assetcStatus: "attention",
      assetcReviewed: true,
      reusableLibraryAsset: true,
      reviewStatus: "visual-approved"
    }
  }
]);

const VERTICE_EXPLORATION_ASSETS = Object.freeze([
  {
    id: "penedos-sky-background", kind: "Background", name: "penedos-sky-sea-bg3.png", systemImage: "cloud.sun",
    metadata: { source: "Assets/backgrounds/penedos-sky-sea-bg3.png", provenance: "PNG local aprovado do céu, mar e farol distante dos Penedos, preparado em 240×160 para BG3 de parallax", generatedBy: "penedos-layered-full-scene-v2", role: "cliff-parallax", sceneRoles: ["cliff-parallax"], profile: "platformer", colorMode: "4bpp", backgroundTileOptimizer: { enabled: true, tileBudget: 220 }, visualProfile: "gba_neutral_cohesive_pixel_art" }
  },
  {
    id: "penedos-terrain-background", kind: "Background", name: "penedos-terrain-bg2.png", systemImage: "mountain.2",
    metadata: { source: "Assets/backgrounds/penedos-terrain-bg2.png", provenance: "PNG local aprovado do terreno jogável dos Penedos", generatedBy: "penedos-layered-full-scene-v1", role: "cliff-tiles", sceneRoles: ["cliff-tiles"], profile: "platformer", colorMode: "4bpp", backgroundTileOptimizer: { enabled: true, tileBudget: 450 }, visualProfile: "gba_neutral_cohesive_pixel_art" }
  },
  {
    id: "penedos-foreground-background", kind: "Background", name: "penedos-foreground-bg1.png", systemImage: "leaf.arrow.triangle.circlepath",
    metadata: { source: "Assets/backgrounds/penedos-foreground-bg1.png", provenance: "PNG local aprovado de rochas e vegetação frontal dos Penedos, preparado em 240×160 com transparência binária", generatedBy: "penedos-layered-full-scene-v2", role: "cliff-foreground", sceneRoles: ["cliff-foreground"], profile: "platformer", colorMode: "4bpp", backgroundTileOptimizer: { enabled: true, tileBudget: 220 }, visualProfile: "gba_neutral_cohesive_pixel_art" }
  },
  {
    id: "market-suspenso-background-v2", kind: "Background", name: "mercado-suspenso-gba.png", systemImage: "storefront",
    metadata: {
      source: "Assets/backgrounds/mercado-suspenso-gba.png",
      sourceSha256: "3f7c23818683632a9dc208b715721b23007fd3fd92ffda965dd50146d1fe0e69",
      preparedSha256: "5b36e14225658dd38f510fc992e161506405f5764b239c0a336f1cec881f532c",
      provenance: "Candidato novo aprovado do Mercado Suspenso, gerado a partir das referências visuais aprovadas e preparado deterministicamente em 240×160 para BG autoral isométrico",
      generatedBy: "mercado-suspenso-background-v2",
      role: "market-isometric-tiles",
      sceneRoles: ["market-isometric-tiles"],
      profile: "isometric",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_mid_high_isometric_market",
      width: 240,
      height: 160,
      tileCount: 600,
      backgroundPaletteBankBudget: 16,
      backgroundTileOptimizer: { enabled: true, tileBudget: 600 },
      reusableLibraryAsset: true,
      reviewStatus: "approved"
    }
  },
  {
    id: "market-modules-v5", kind: "Tileset", name: "mercado-suspenso-modules-v5.png", systemImage: "square.grid.3x3.middle.filled",
    metadata: {
      source: "Assets/backgrounds/mercado-suspenso-modules-v5.png",
      sourceSha256: "cf78cebb93bb2a0bf5a9a87505fec0d712a5b7822cd4d08753a22695c508e9b8",
      preparedSha256: "228c5816801dc4412470a920a4ce3e1a6e71747be12c138d9e71f9a65adef3b4",
      provenance: "Atlas modular nativo revisado; composição do Mercado Suspenso aprovada para integração no runtime",
      generatedBy: "mercado-suspenso-modular-composition-v5",
      role: "market-isometric-tileset",
      sceneRoles: ["market-isometric-tiles", "market-isometric-world"],
      profile: "isometric",
        colorMode: "8bpp-indexed",
        kind: "indexed_bg",
      transparentIndex: 0,
      tileWidth: 32,
      tileHeight: 16,
      atlasTileWidth: 64,
      atlasTileHeight: 64,
      atlasColumns: 4,
      atlasRows: 4,
      atlasRenderOffsetY: -35,
      moduleGrid: { columns: 4, rows: 4 },
      moduleRoles: ["floor_light", "floor_moss", "floor_water_inlay", "floor_wood", "block_low", "block_tall", "stairs_right", "stairs_left", "stall_teal", "stall_ochre", "crates", "barrels", "rope_rail", "bridge", "lantern", "reserved"],
      visualProfile: "gba_isometric_market_tileset_modular_market_props",
      reusableLibraryAsset: true,
      reviewStatus: "approved",
      assetcStatus: "safe",
      sourceComposition: "mercado-suspenso/composition-candidate-v3/source/vertice-mercado-suspenso-composition-v3-source.png"
    }
  },
  {
    id: "usina-submersa-background-v2", kind: "Background", name: "usina-submersa-gba.png", systemImage: "rectangle.portrait.and.arrow.right",
    metadata: {
      source: "Assets/backgrounds/usina-submersa-gba.png",
      sourceSha256: "85916270ca766acfc14889a02d162d67a9fc7e3d7907c25fd5b596b72b028700",
      preparedSha256: "368ca0b781e4fa6273a11e62b42d1bdb221c6857863f4d151a645ad9f9cd73bd",
      provenance: "Composição v2 da Usina Submersa aprovada pelo usuário, limpa de HUD e preparada deterministicamente em 240×160 para o viewport frontal do Dungeon Crawler",
      generatedBy: "usina-submersa-background-v2",
      role: "usina-dungeon-bg",
      sceneRoles: ["usina-dungeon-bg", "usina-machinery", "dungeon-crawler-viewport"],
      profile: "dungeonCrawler",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_low_detail_dungeon_crawler_usina",
      width: 240,
      height: 160,
      tileCount: 600,
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      sourceDimensions: { width: 1536, height: 1024 },
      sourceResize: "area-average-box-1536x1024-to-240x160",
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "approved"
    }
  },
  {
    id: "usina-sentinel-v2", kind: "Sprite", name: "usina-sentinel-v2.png", systemImage: "shield.lefthalf.filled",
    metadata: {
      source: "Assets/sprites/usina-sentinel-v2.png",
      sourceSha256: "d8e50cff56c0b539a775fb5271c2c823e3787f386173edbbc89c0d863df18514",
      sourceSheetSha256: "c91302f79b06528239256d954a1794c78d13cef5b9068cc8d4b95069b8057aec",
      preparedSha256: "b23ee5d79a05434be18496ddd69fcec52a9328e9e9c72f9067c4974e79dffec2",
      provenance: "Sentinela nova da Usina aprovada pelo usuário, preparada deterministicamente em folha 192×64 com variantes FAR/MID/NEAR de 64×64",
      generatedBy: "usina-actors-v2",
      role: "dungeon-depth-actor",
      sceneRoles: ["usina-dungeon-sentinel", "dungeon-depth-actor"],
      profile: "dungeonCrawler",
      frameWidth: 64,
      frameHeight: 64,
      frameCount: 3,
      anchor: "center",
      maxVisibleColors: 15,
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_mid_high_dungeon_crawler_usina",
      reviewStatus: "approved",
      gbStudioResourceType: "sprite"
    }
  },
  {
    id: "usina-energy-cell-v2", kind: "Sprite", name: "usina-energy-cell-v2.png", systemImage: "battery.100percent",
    metadata: {
      source: "Assets/sprites/usina-energy-cell-v2.png",
      sourceSha256: "79ed852dedb0f6edce54d438ba88c87956d6e9f70c605e5e7dea34f4f3b44a91",
      sourceSheetSha256: "315994365dd74b56f98928134fe4a07601f17fa42908f3bb2d5038b8eaab5373",
      preparedSha256: "8512280031d70a88328d885b8544199cf8d2ca49e0136d5fa6a6b27a79879810",
      provenance: "Célula de energia nova da Usina aprovada pelo usuário, preparada deterministicamente em folha 32×16 com estados normal e foco de 16×16",
      generatedBy: "usina-actors-v2",
      role: "energy-cell",
      sceneRoles: ["usina-energy-cell", "energy-cell"],
      profile: "dungeonCrawler",
      frameWidth: 16,
      frameHeight: 16,
      frameCount: 2,
      anchor: "center",
      maxVisibleColors: 15,
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_mid_high_dungeon_crawler_usina",
      reviewStatus: "approved",
      gbStudioResourceType: "sprite"
    }
  },
  {
    id: "nara-platformer", kind: "Sprite", name: "nara-platformer.png", systemImage: "figure.run",
    metadata: { source: "Assets/sprites/nara-platformer.png", provenance: "PNG local aprovado do piloto de entidade controlável para plataforma", generatedBy: "controlled-entity-pilots-v2", role: "nara-platformer", profile: "platformer-wide", frameWidth: 32, frameHeight: 32, frameCount: 9, anchor: "bottom-center", maxVisibleColors: 11, colorMode: "4bpp", visualProfile: "gba_neutral_cohesive_pixel_art" }
  },
  {
    id: "nara-mercado-isometric-v2", kind: "Sprite", name: "nara-mercado-isometric-v2.png", systemImage: "figure.walk",
    metadata: {
      source: "Assets/sprites/nara-mercado-isometric-v2.png",
      sourceCandidate: "tools/gba-sprite-prep/production/mercado-suspenso-adventure-v5-candidate/packed-review-48-v3/nara/vertice-market-nara-v5-review-48.png",
      preparedSha256: "0305edfe85d6253f8eea6be3f9fb93dcc18bbe8d97e70e5be67fd49cf3068b29",
      provenance: "Candidato visual explicitamente aprovado pelo usuário em 2026-09-12; promovido sem reamostragem adicional, preservando o pack 48×48 de 16 quadros e 4 OBJs por frame.",
      generatedBy: "mercado-suspenso-adventure-v5-actors-48-pack",
      role: "nara-market-isometric",
      sceneRoles: ["market-player", "market-isometric-actors"],
      profile: "isometric",
      visualProfile: "gba_neutral_cohesive_pixel_art_mid_high_isometric_market",
      colorMode: "4bpp",
      transparentIndex: 0,
      width: 48,
      height: 48,
      packedWidth: 768,
      packedHeight: 48,
      frameWidth: 48,
      frameHeight: 48,
      frameCount: 16,
      logicalSourceFrameCount: 16,
      anchor: "bottom-center",
      maxVisibleColors: 15,
      hardwareObjectsPerFrame: 4,
      tilesPerFrame: 36,
      storageFormat: "indexed-4bpp",
      assetcReviewed: true,
      assetcStatus: "attention",
      technicalStatus: "within_declared_contract",
      reviewStatus: "approved",
      gbStudioResourceType: "sprite"
    }
  },
  {
    id: "nara-dungeon", kind: "Sprite", name: "nara-dungeon.png", systemImage: "flashlight.on.fill",
    metadata: { source: "Assets/sprites/nara-dungeon.png", provenance: "Sprite original de Nara para a usina", generatedBy: "exploration-asset-library-v1", role: "nara-dungeon", profile: "dungeonCrawler", colorMode: "4bpp", visualProfile: "diesel-fantasy-v1" }
  },
  {
    id: "cliff-prop", kind: "Sprite", name: "cliff-prop.png", systemImage: "gearshape.2",
    metadata: { source: "Assets/sprites/cliff-prop.png", provenance: "Drone e prop original dos Penedos", generatedBy: "exploration-asset-library-v1", role: "cliff-props", profile: "platformer", colorMode: "4bpp", visualProfile: "diesel-fantasy-v1" }
  },
  {
    id: "market-trader-v2-idle", kind: "Sprite", name: "market-trader-v2-idle.png", systemImage: "person.2",
    metadata: {
      source: "Assets/sprites/market-trader-v2-idle.png",
      sourceApprovedSheet: "tools/gba-sprite-prep/production/mercado-suspenso-isometrica-v1-approved/sources/market-trader-v2-approved-sheet.png",
      sourceAsset: "market-trader-v2-approved-sheet.png",
      sourceFrameIndex: 0,
      preparedSha256: "2ee9e546f95b8b12c67ccaeff9c2cf6f81b1cd25ba932a8d3000e11103391694",
      provenance: "Quadro 0 completo, recortado sem reamostragem da folha aprovada do mercador; corrige o idle anterior com o centro transparente. O NPC é imóvel e mantém 4 OBJs por frame.",
      generatedBy: "market-trader-v2-idle-crop-correction",
      role: "market-npc",
      sceneRoles: ["market-npc", "market-isometric-actors"],
      profile: "isometric",
      visualProfile: "gba_neutral_cohesive_pixel_art_mid_high_isometric_market",
      colorMode: "4bpp",
      transparentIndex: 0,
      width: 48,
      height: 48,
      packedWidth: 48,
      packedHeight: 48,
      frameWidth: 48,
      frameHeight: 48,
      frameCount: 1,
      logicalSourceFrameCount: 1,
      anchor: "bottom-center",
      maxVisibleColors: 15,
      hardwareObjectsPerFrame: 4,
      tilesPerFrame: 36,
      storageFormat: "indexed-4bpp",
      assetcReviewed: true,
      assetcStatus: "safe",
      technicalStatus: "resident-with-nara",
      reviewStatus: "approved",
      gbStudioResourceType: "sprite"
    }
  },
  {
    id: "plant-sentinel", kind: "Sprite", name: "plant-sentinel.png", systemImage: "shield.lefthalf.filled",
    metadata: { source: "Assets/sprites/plant-sentinel.png", provenance: "Sentinela original da Usina", generatedBy: "exploration-asset-library-v1", role: "plant-sentinel", profile: "dungeonCrawler", colorMode: "4bpp", visualProfile: "diesel-fantasy-v1" }
  },
  {
    id: "dungeon-sentinel-v1", kind: "Sprite", name: "dungeon-sentinel-v1.png", systemImage: "shield.lefthalf.filled",
    metadata: { source: "Assets/sprites/dungeon-sentinel-v1.png", provenance: "Sheet OBJ local aprovada da sentinela frontal com variantes FAR/MID/NEAR", generatedBy: "dungeon-crawler-sentinel-v1", role: "dungeon-depth-actor", sceneRoles: ["usina-dungeon-sentinel", "dungeon-depth-actor"], profile: "dungeonCrawler", frameWidth: 64, frameHeight: 64, frameCount: 3, anchor: "center", maxVisibleColors: 15, colorMode: "4bpp", visualProfile: "gba_neutral_cohesive_pixel_art" }
  },
  {
    id: "energy-cell", kind: "Sprite", name: "energy-cell.png", systemImage: "battery.100percent",
    metadata: { source: "Assets/sprites/energy-cell.png", provenance: "Célula de energia original da Usina", generatedBy: "exploration-asset-library-v1", role: "energy-cell", profile: "dungeonCrawler", colorMode: "4bpp", visualProfile: "diesel-fantasy-v1" }
  }
]);

const VERTICE_PENEDOS_LAYERED_ASSET_NAMES = new Set([
  "penedos-sky-sea-bg3.png",
  "penedos-terrain-bg2.png",
  "penedos-foreground-bg1.png"
]);

const VERTICE_PENEDOS_LAYERED_ASSETS = Object.freeze(
  VERTICE_EXPLORATION_ASSETS.filter((asset) => VERTICE_PENEDOS_LAYERED_ASSET_NAMES.has(asset.name))
);

const VERTICE_AFFINE_ASSETS = Object.freeze([
  {
    id: "affine-showcase-background",
    kind: "Background",
    name: "affine-showcase-gba.png",
    systemImage: "rotate.3d",
    metadata: {
      source: "Assets/backgrounds/affine-showcase-gba.png",
      provenance: "Arte original gerada para o showcase Affine, com composição diurna costeira coerente com a direção visual aprovada do projeto e normalizada para mapa quadrado 128×128.",
      generatedBy: "imagegen-affine-lab-v1",
      role: "affine-showcase-bg",
      sceneRoles: ["affine-showcase-bg"],
      profile: "affine",
      kind: "affine_bg",
      colorMode: "8bpp-affine",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      width: 128,
      height: 128,
      backgroundPaletteBankBudget: 1,
      affineTileOptimizer: { enabled: true, tileBudget: 256 },
      reviewStatus: "approved"
    }
  }
]);

function climaxAsset(id, kind, name, systemImage, role, sceneRoles, profile, provenance, metadataOverrides = {}) {
  return {
    id,
    kind,
    name,
    systemImage,
    metadata: {
      source: `Assets/${kind === "Background" ? "backgrounds" : "sprites"}/${name}`,
      provenance,
      generatedBy: "climax-asset-library-v1",
      role,
      sceneRoles,
      profile,
      colorMode: "4bpp",
      visualProfile: "diesel-fantasy-v1",
      ...metadataOverrides
    }
  };
}

const VERTICE_TEMPESTADE_V3_ASSETS = Object.freeze([
  climaxAsset(
    "tempestade-v3-regular-background",
    "Background",
    "porto-lume-shmup-wide-v3.png",
    "rectangle.3.group",
    "shmup-background-regular",
    ["shmup-background-regular"],
    "shmup",
    "Composição regular aprovada da Tempestade SHMUP v3",
    {
      generatedBy: "tempestade-shmup-integration-candidate-v2-quality",
      source: "Assets/backgrounds/porto-lume-shmup-wide-v3-local-banks.png",
      preparedSha256: "6e5825ee65d8781b0a6ee5854585c88f7a44d67264b6d78610e0d341b032e82a",
      width: 720,
      height: 160,
      tileWidth: 8,
      tileHeight: 8,
      bpp: 4,
      tileBudget: 895,
      backgroundTileOptimizer: { enabled: true, tileBudget: 895 },
      backgroundPaletteBankBudget: 14,
      assetcStatus: "attention",
      reviewStatus: "approved",
      approved: true,
      candidateStatus: "promoted",
      visualProfile: "gba_neutral_cohesive_pixel_art"
    }
  ),
  climaxAsset("tempestade-v3-player", "Sprite", "tempestade-v3-player.png", "airplane", "player-flight", ["player-flight"], "shmup", "Aeronave de Nara da composição Tempestade SHMUP v3", {
    generatedBy: "tempestade-shmup-integration-candidate-v2-quality",
    preparedSha256: "3eb41a92131ae9e71c384aea57457e6222ce298b64dc040549d5edb901802f8a",
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 1,
    anchor: "center",
    maxVisibleColors: 15,
    reviewStatus: "approved",
    approved: true,
    candidateStatus: "promoted"
  }),
  climaxAsset("tempestade-v3-drone-horizontal", "Sprite", "tempestade-v3-drone-horizontal.png", "sensor.tag.radiowaves.forward", "flight-enemy", ["flight-enemy"], "shmup", "Drone horizontal da composição Tempestade SHMUP v3", {
    generatedBy: "tempestade-shmup-integration-candidate-v2-quality",
    preparedSha256: "4159bf7a1515acf622602db5c00e40874b353006eb45aa3076781f5d203dec13",
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 1,
    anchor: "center",
    maxVisibleColors: 15,
    reviewStatus: "approved",
    approved: true,
    candidateStatus: "promoted"
  }),
  climaxAsset("tempestade-v3-drone-vertical", "Sprite", "tempestade-v3-drone-vertical.png", "sensor.tag.radiowaves.forward", "flight-enemy", ["flight-enemy"], "shmup", "Drone vertical da composição Tempestade SHMUP v3", {
    generatedBy: "tempestade-shmup-integration-candidate-v2-quality",
    preparedSha256: "33aa60167e8c32313525e0538ae569d760a9d47d12a38489656b0e32423ce511",
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 1,
    anchor: "center",
    maxVisibleColors: 15,
    reviewStatus: "approved",
    approved: true,
    candidateStatus: "promoted"
  }),
  climaxAsset("tempestade-v3-boss-lighthouse", "Sprite", "tempestade-v3-boss-lighthouse.png", "building.columns", "shmup-boss", ["shmup-boss"], "shmup", "Farol da Tempestade da composição SHMUP v3", {
    generatedBy: "tempestade-shmup-integration-candidate-v2-quality",
    preparedSha256: "7ae124c70c5f7668722416c747c50e6b3fc083a99211ea9e396df0e56d737898",
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 1,
    anchor: "center",
    maxVisibleColors: 15,
    reviewStatus: "approved",
    approved: true,
    candidateStatus: "promoted"
  })
]);

const VERTICE_CLIMAX_ASSETS = Object.freeze([
  climaxAsset(
    "council-background",
    "Background",
    "council-gba.png",
    "building.columns",
    "council-bg",
    ["council-bg"],
    "visualNovel",
    "Conselho da Guardiã v3 aprovado para BG",
    {
      generatedBy: "conselho-guardia-background-v3-runtime14",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      colorMode: "4bpp",
      /* BG palette banks 14 and 15 are reserved by the HUD and dialogue skins at runtime. */
      backgroundPaletteBankBudget: 14,
      width: 240,
      height: 160,
      tileCount: 600,
      backgroundTileOptimizer: { enabled: true, tileBudget: 600, maxSourcePixelErrorRatio: 0.008984375 },
      preparedSha256: "1715b670830125c0a39872fd30cf9dcf8f7dae001e4923c12d2e781caf30c34b",
      reviewStatus: "approved"
    }
  ),
  climaxAsset(
    "storm-background",
    "Background",
    "storm-gba.png",
    "cloud.bolt",
    "shmup-background-base",
    ["shmup-background-base"],
    "shmup",
    "Base larga aprovada da Tempestade dos Faróis",
    {
      generatedBy: "tempestade-base-v15",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      backgroundTileOptimizer: { enabled: true, tileBudget: 895 },
      backgroundPaletteBankBudget: 12
    }
  ),
  climaxAsset(
    "storm-affine-background",
    "Background",
    "shmup-background-affine-1024.png",
    "rotate.3d",
    "shmup-background-affine",
    ["shmup-background-affine"],
    "shmup",
    "Background Affine 8bpp aprovado pelo usuário para a Tempestade dos Faróis",
    {
      generatedBy: "shmup-affine-background-v1",
      source: "Assets/backgrounds/shmup-background-affine-1024.png",
      sourceSha256: "a49b373209ec95e508f2c36719c7332db537fbf18784c19621bca74adba1cc79",
      preparedSha256: "d5bbd7890561d3e335d80d0300473fa9102d044fd6dc21d5e32d9d0b13603d5b",
      kind: "affine_bg",
      colorMode: "8bpp-affine",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      width: 1024,
      height: 1024,
      mapWidthTiles: 128,
      mapHeightTiles: 128,
      tileCount: 16384,
      affineTileOptimizer: {
        enabled: true,
        tileBudget: 256,
        sourceTileCount: 325,
        optimizedTileCount: 256,
        mismatchPixels: 1104
      },
      backgroundPaletteBankBudget: 1,
      preparedBy: "shmup-affine-background-v1",
      reviewStatus: "approved",
      approved: true
    }
  ),
  ...VERTICE_TEMPESTADE_V3_ASSETS,
  climaxAsset(
    "relay-background",
    "Background",
    "battle-rpg-usina-nearest-review.png",
    "bolt.circle",
    "relay-arena",
    ["relay-arena"],
    "battleRpg",
    "Câmara do Guardião do Relé original aprovada para BG",
    {
      generatedBy: "guardiao-rele-background-v1",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16
    }
  ),
  climaxAsset("arena-background", "Background", "arena-gba.png", "figure.boxing", "arena-bg", ["arena-bg"], "luta", "Arena costeira aprovada de Arrancada", {
    generatedBy: "exemplo-gba-luta-cais-v2",
    width: 240,
    height: 160,
    tileCount: 600,
    backgroundTileOptimizer: {
      enabled: true,
      tileBudget: 1024,
      sourceTileCount: 595,
      optimizedTileCount: 595,
      totalMappingError: 0,
      maxSourcePixelErrorRatio: 0.498671875,
      maxFramebufferMismatchRatio: 0
    },
    backgroundPaletteBankBudget: 16,
    paletteBankCount: 16,
    maxVisibleColors: 173,
    sourcePipeline: "nearest-1536x1024-to-240x160-assetc-4bpp-16-banks",
    sourceSha256: "23648d413b9ce89490257f0abc983abe1b93b04c72f944ba02b6110475445239",
    preparedSha256: "16df2d3c529bdff6f9342aa2a71be958fe68fd0b80c5e1c05d2b916e5fb3129b",
    backgroundPaletteReferencePlan: VERTICE_LUTA_BACKGROUND_PALETTE_PLAN,
    assetcStatus: "attention",
    assetcReviewed: true,
    visualProfile: "gba_neutral_cohesive_pixel_art",
    reviewStatus: "attention",
    approved: false
  }),
  climaxAsset("nara-portrait", "Sprite", "nara-portrait.png", "person.crop.square", "nara-portrait", ["nara-portrait"], "visualNovel", "Retrato de Nara v4 aprovado e preparado para OBJ 4 BPP", {
    generatedBy: "conselho-guardia-portraits-v4",
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 2,
    anchor: "bottom-center",
    maxVisibleColors: 15,
    visibleColors: 15,
    preparedSha256: "e73e148e3c24f843f5c004520e2e262f05d36241edd2b88bc355caee8fca076c",
    visualProfile: "gba_neutral_cohesive_pixel_art",
    reviewStatus: "approved"
  }),
  climaxAsset("guardian-portrait", "Sprite", "guardian-portrait.png", "person.crop.rectangle", "guardian-portrait", ["guardian-portrait"], "visualNovel", "Retrato da Guardiã v4 aprovado e preparado para OBJ 4 BPP", {
    generatedBy: "conselho-guardia-portraits-v4",
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 2,
    anchor: "bottom-center",
    maxVisibleColors: 15,
    visibleColors: 15,
    preparedSha256: "c58fa8cf34751c70f82921017b4af9856e366482847aea51dfb000ed8075868e",
    visualProfile: "gba_neutral_cohesive_pixel_art",
    reviewStatus: "approved"
  }),
  climaxAsset("dialogue-sigil", "Sprite", "dialogue-sigil.png", "message", "dialogue-ui", ["dialogue-ui"], "visualNovel", "Sigilo de diálogo do farol v4 aprovado e preparado para OBJ 4 BPP", {
    generatedBy: "conselho-guardia-portraits-v4",
    frameWidth: 16,
    frameHeight: 16,
    frameCount: 1,
    anchor: "center",
    maxVisibleColors: 15,
    visibleColors: 15,
    preparedSha256: "b0c3a75b5da13acd702fcc573b9c70af589336667744024974fb97f215fdfdc7",
    visualProfile: "gba_neutral_cohesive_pixel_art",
    reviewStatus: "approved"
  }),
  climaxAsset("nara-flight", "Sprite", "nara-flight.png", "airplane", "player-flight", ["player-flight"], "shmup", "PNG local aprovado do piloto de entidade controlável shmup", {
    generatedBy: "tempestade-actors-v17",
    sourceSha256: "81648ad0917f5ceb708a71124e0ddb6292fb6712665729544bd94690084abdbe",
    preparedSha256: "c0e62e2f92c561283dbce914be6046de92b8852cf76ab474dedbbec48ca6ddc0",
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 4,
    anchor: "center",
    maxVisibleColors: 15,
    visibleColors: 15,
    colorMode: "4bpp",
    visualProfile: "gba_neutral_cohesive_pixel_art",
    reviewStatus: "approved"
  }),
  climaxAsset("storm-drone", "Sprite", "storm-drone.png", "sensor.tag.radiowaves.forward", "flight-enemy", ["flight-enemy"], "shmup", "Drone da tempestade aprovado e preparado em 4 BPP", {
    generatedBy: "tempestade-actors-v17",
    sourceSha256: "fc778c2f6095cfee73d67363ebcafcbe4c7e86e941dfb54aee72ce86730f4208",
    preparedSha256: "3d4b3bf446799117d55888ebaf7330504248e5ef78d265afd4bc4238334c81ce",
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 2,
    anchor: "center",
    maxVisibleColors: 15,
    visibleColors: 15,
    colorMode: "4bpp",
    visualProfile: "gba_neutral_cohesive_pixel_art",
    reviewStatus: "approved"
  }),
  climaxAsset("storm-shot", "Sprite", "storm-shot.png", "sparkle", "projectile", ["projectile"], "shmup", "Projétil da tempestade v3 aprovado e preparado em 4 BPP", {
    generatedBy: "tempestade-actors-v3",
    sourceSha256: "9bc868dd5bb0460f846f7132bf3313dd94ccc8233e9317f0293d6f9e7570e107",
    preparedSha256: "76b648e4f5109fc62b644d404e7cdf9620391ace67b54cf16d6ac4cfe3a9d900",
    frameWidth: 8,
    frameHeight: 8,
    frameCount: 2,
    anchor: "center",
    maxVisibleColors: 15,
    visibleColors: 4,
    colorMode: "4bpp",
    visualProfile: "gba_neutral_cohesive_pixel_art",
    reviewStatus: "approved"
  }),
  climaxAsset("storm-bolt", "Sprite", "storm-bolt.png", "bolt.fill", "storm-effect", ["storm-effect"], "shmup", "Relâmpago da tempestade v3 aprovado e preparado em 4 BPP", {
    generatedBy: "tempestade-actors-v3",
    sourceSha256: "85914e2f7746e5e3f4a44fbce8d691e3aa24fef231da8440204e0dbecbff8d62",
    preparedSha256: "b266f238b498cdf40d615eff711eaa28c3b2569f327b212aa2ea66a173f09b46",
    frameWidth: 16,
    frameHeight: 16,
    frameCount: 2,
    anchor: "center",
    maxVisibleColors: 15,
    visibleColors: 7,
    colorMode: "4bpp",
    visualProfile: "gba_neutral_cohesive_pixel_art",
    reviewStatus: "approved"
  }),
  climaxAsset("battle-rpg-party-mechanic", "Sprite", "battle-rpg-scene-party-mechanic-alpha128-v2.png", "figure.fencing", "nara-battle", ["nara-battle"], "battleRpg", "Atlas aprovado da mecânica da party para a batalha RPG", {
    generatedBy: "gba-sprite-prep-battle-rpg-v1-actor-families-v2",
    sourceSha256: "ee8742454d229cc45113cc91c5e5f9941bda9b8dbb82e58141f5553bdf51bdda",
    preparedSha256: "7cfffa6566c2a2b3790891c8b9d3ce9a189da204174fd00f620610e44caf0c10",
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 6,
    anchor: "bottom-center",
    maxVisibleColors: 15,
    visibleColors: 15,
    hardwareObjectsPerFrame: 1,
    sourceContract: "gba-native",
    storageFormat: "rgba-4bpp-compatible",
    transparentIndex: 0,
    visualProfile: "gba_neutral_cohesive_pixel_art_battle_rpg",
    reviewStatus: "approved",
    approved: true
  }),
  climaxAsset("battle-rpg-enemy-large-robot", "Sprite", "battle-rpg-scene-enemy-large-robot-alpha128-v2.png", "gearshape.2", "relay-guardian", ["relay-guardian"], "battleRpg", "Atlas aprovado do robô grande inimigo para a batalha RPG", {
    generatedBy: "gba-sprite-prep-battle-rpg-v1-actor-families-v2",
    sourceSha256: "ee8742454d229cc45113cc91c5e5f9941bda9b8db82e58141f5553bdf51bdda",
    preparedSha256: "fab7f224493e066a0ed2a5cc7a42c27a09df918b249810801b4d4be3e278f91c",
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 3,
    anchor: "bottom-center",
    maxVisibleColors: 15,
    visibleColors: 15,
    hardwareObjectsPerFrame: 1,
    sourceContract: "gba-native",
    storageFormat: "rgba-4bpp-compatible",
    transparentIndex: 0,
    visualProfile: "gba_neutral_cohesive_pixel_art_battle_rpg",
    reviewStatus: "approved",
    approved: true
  }),
  climaxAsset("companion", "Sprite", "companion.png", "sparkles", "companion-battle", ["companion-battle"], "battleRpg", "Companheiro luminoso de bordo"),
  climaxAsset("battle-ui", "Sprite", "battle-ui.png", "heart.text.square", "battle-ui", ["battle-ui"], "battleRpg", "Indicador original de batalha"),
  climaxAsset("nara-fighter", "Sprite", "nara-fighter.png", "figure.boxing", "fighter-player", ["fighter-player"], "luta", "PNG local aprovado do piloto de entidade controlável de luta", {
    generatedBy: "exemplo-gba-luta-cais-v2",
    sourceSha256: "0ef00d933ed398689846a94c080f296f42df80223d6858cbefbeb3978af58254",
    preparedSha256: "9cb22e4861725b9a6e74274c7c5756360b2d0204d2696724159b3e99bfe44bf5",
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 6,
    anchor: "bottom-center",
    collisionWidth: 16,
    collisionHeight: 16,
    maxVisibleColors: 15,
    visibleColors: 15,
    sourceContract: "gba-native",
    layout: { mode: "horizontal", columns: 6 },
    storageFormat: "indexed-4bpp",
    transparentIndex: 0,
    objectPaletteValues: VERTICE_LUTA_PLAYER_OBJECT_PALETTE,
    visualProfile: "gba_neutral_cohesive_pixel_art",
    reviewStatus: "attention",
    approved: false
  }),
  climaxAsset("rival-fighter", "Sprite", "rival-fighter.png", "figure.boxing", "fighter-rival", ["fighter-rival"], "luta", "Adversário da Arena v2 aprovado explicitamente pelo usuário", {
    generatedBy: "exemplo-gba-luta-cais-v2",
    sourceSha256: "0ef00d933ed398689846a94c080f296f42df80223d6858cbefbeb3978af58254",
    preparedSha256: "fcd446b1fb7c7bcba6549d545c62859e88fe91a292704af230993bf66cc43376",
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 6,
    anchor: "bottom-center",
    collisionWidth: 16,
    collisionHeight: 16,
    maxVisibleColors: 15,
    visibleColors: 15,
    colorMode: "4bpp",
    sourceContract: "gba-native",
    layout: { mode: "horizontal", columns: 6 },
    storageFormat: "indexed-4bpp",
    transparentIndex: 0,
    preparedBy: "gba-sprite-prep",
    objectPaletteValues: VERTICE_LUTA_RIVAL_OBJECT_PALETTE,
    visualProfile: "gba_neutral_cohesive_pixel_art",
    reviewStatus: "attention",
    approved: false
  }),
  climaxAsset("fight-hud", "Background", "fight-hud-v2-arena-bank-05.png", "rectangle.3.group", "fight-hud", ["fight-hud"], "luta", "HUD v2 aprovada para a arena de Arrancada", {
    generatedBy: "exemplo-gba-luta-cais-fight-hud-v2",
    width: 240,
    height: 160,
    tileCount: 600,
    backgroundPaletteBankBudget: 16,
    maxVisibleColors: 10,
    transparentPixels: 28533,
    sourceSha256: "7d19bc8e9582b5f650d0dcbdf5bad14bbfcee37d9c8182523cc90172f8138c90",
    preparedSha256: "dfda50c3c913a8e4e987cd971e82f34e749e3e416a8f87fc176c7ded783e3642",
    backgroundPaletteReferenceAssetName: "arena-gba.png",
    backgroundPaletteReferencePlan: VERTICE_LUTA_BACKGROUND_PALETTE_PLAN,
    visualProfile: "gba_neutral_cohesive_pixel_art",
    reviewStatus: "approved",
    approved: true,
    candidateStatus: "promoted",
    assetcReviewed: true,
    assetcStatus: "passed",
    assetcPackValidation: {
      packOk: true,
      sharedPaletteBankIndex: 5,
      sharedWith: "arena-gba-reference"
    }
  })
]);

const VERTICE_FARM_REFERENCE_ASSETS = Object.freeze([
  {
    id: "farm-arena-composition-reference-v2",
    kind: "Tileset",
    name: "farm-arena-composition-reference-v2.png",
    systemImage: "photo",
    metadata: {
      source: "Assets/backgrounds/farm-arena-composition-reference-v2.png",
      sourceOriginal: [
        "user-provided: Assets/Farm/Free ver.png",
        "user-provided: Assets/Farm/House.png",
        "user-provided: Assets/Farm/Objects.png"
      ],
      sourceOriginalSha256: {
        "Free ver.png": "e396c0c6b747ef89c5c6b0ed33ddc9f8601a2fc8db61b2f2f7d35491a3e55d49",
        "House.png": "836bef017edab303f73e995ce139c692b0e0611a23b4c6d4dd1a961d6c78f542",
        "Objects.png": "b978367fef8f8744f816f21b36dbf7ffddd457b643786c02890ab522bbfb835d"
      },
      preparedSha256: "c38c4f11a6eea4203862b6cb1be8de991db716dcc6af5ec87e23cd688aac06a3",
      generatedBy: "user-supplied-farm-isometric-reference-v2",
      provenance: "Fontes fornecidas pelo usuário; composição 480x320 nativa, montada sem reamostragem; piso contínuo derivado da paleta do tileset para remover a grade visual.",
      role: "tactical-isometric-static-composition",
      sceneRoles: ["tactical-background", "tactical-arena"],
      profile: "isometric",
      colorMode: "4bpp",
      transparentIndex: 0,
      tileWidth: 8,
      tileHeight: 8,
      width: 480,
      height: 320,
      tileCount: 2400,
      backgroundPaletteBankBudget: 14,
      backgroundTileOptimizer: {
        enabled: true,
        tileBudget: 900,
        sourceTileCount: 2400,
        optimizedTileCount: 459,
        maxSourcePixelErrorRatio: 0,
        maxFramebufferMismatchRatio: 0
      },
      assetcReviewed: true,
      assetcStatus: "safe",
      reviewStatus: "approved",
      visualProfile: "user_supplied_farm_isometric_static_composition"
    }
  },
  {
    id: "farm-player-female",
    kind: "Sprite",
    name: "farm-player-female.png",
    systemImage: "figure.walk",
    metadata: {
      source: "Assets/sprites/farm-player-female.png",
      sourceOriginal: [
        "user-provided: Assets/Player/FPlayer 1 idle.png",
        "user-provided: Assets/Player/FPlayer 1 walking.png"
      ],
      sourceSha256: {
        idle: "f828c5fee0a5e4a3e599bdae3e3136413e54ffdea5e34ee2472e13c80dfc3b53",
        walking: "a12a1081fcffb909974add70875c29504b7f84fb74b8c1b82774e5fee2a732be"
      },
      preparedSha256: "64d2d87f7b8d025e65eb157e065c20371062658b86ff96c98c17578885b66525",
      generatedBy: "user-supplied-farm-player-pack-v2",
      provenance: "Folhas fornecidas pelo usuário; linhas cardinais 0, 2, 4 e 6 selecionadas e frames copiados 1:1 para faixa 576x48, sem reamostragem; cada frame lógico permanece 48x48 e é composto por quatro OBJs.",
      license: "user-provided; no separate license supplied; project-owner approval recorded 2026-08-30",
      role: "player",
      sceneRoles: ["tactical-isometric", "player"],
      profile: "isometric",
      sourceLayout: "12x1_horizontal_direction_triplets",
      sourceSelection: "cada direção usa as linhas cardinais 0, 2, 4 e 6; idle da coluna 0 e walking das colunas 0-1, linearizados em três frames",
      sourceRows: [0, 2, 4, 6],
      packedWidth: 576,
      packedHeight: 48,
      frameWidth: 48,
      frameHeight: 48,
      frameCount: 12,
      logicalSourceFrameCount: 12,
      hardwareObjectsPerFrame: 4,
      colorMode: "4bpp",
      transparentIndex: 0,
      storageFormat: "indexed-4bpp",
      assetcReviewed: true,
      assetcStatus: "safe",
      reviewStatus: "approved",
      visualProfile: "user_supplied_farm_player_pixel_art"
    }
  },
  {
    id: "farm-player-male",
    kind: "Sprite",
    name: "farm-player-male.png",
    systemImage: "figure.walk",
    metadata: {
      source: "Assets/sprites/farm-player-male.png",
      sourceOriginal: [
        "user-provided: Assets/Player/MPlayer 1 idle.png",
        "user-provided: Assets/Player/MPlayer 1 walking.png"
      ],
      sourceSha256: {
        idle: "e574600cf5800afd60a609729b27d698dd62e56289990cf5bcc50956a38c47a2",
        walking: "311b9a334ba0b916a20def10c39c6a723d027ba805e97b134dc947c27ad565f5"
      },
      preparedSha256: "9d797ee052701190184b553c77cbf147d47bce727561f7243a4df44e48a91496",
      generatedBy: "user-supplied-farm-player-pack-v2",
      provenance: "Folhas fornecidas pelo usuário; linhas cardinais 0, 2, 4 e 6 selecionadas e frames copiados 1:1 para faixa 576x48, sem reamostragem; cada frame lógico permanece 48x48 e é composto por quatro OBJs.",
      license: "user-provided; no separate license supplied; project-owner approval recorded 2026-08-30",
      role: "actor",
      sceneRoles: ["tactical-isometric", "actor"],
      profile: "isometric",
      sourceLayout: "12x1_horizontal_direction_triplets",
      sourceSelection: "cada direção usa as linhas cardinais 0, 2, 4 e 6; idle da coluna 0 e walking das colunas 0-1, linearizados em três frames",
      sourceRows: [0, 2, 4, 6],
      packedWidth: 576,
      packedHeight: 48,
      frameWidth: 48,
      frameHeight: 48,
      frameCount: 12,
      logicalSourceFrameCount: 12,
      hardwareObjectsPerFrame: 4,
      colorMode: "4bpp",
      transparentIndex: 0,
      storageFormat: "indexed-4bpp",
      assetcReviewed: true,
      assetcStatus: "safe",
      reviewStatus: "approved",
      visualProfile: "user_supplied_farm_player_pixel_art"
    }
  }
]);

const VERTICE_RACING_ASSETS = Object.freeze([
  {
    id: "racing-topdown-background",
    kind: "Background",
    name: "circuit-topdown.png",
    systemImage: "map",
    metadata: {
      source: "Assets/backgrounds/circuit-topdown.png",
      sourceCandidate: "tools/gba-sprite-prep/production/exemplo-gba-racing-v2-candidate/prepared/vertice-circuit-topdown.png",
      sourceSha256: "7d8d764e8b2e6eccc2bfc1b68a77e3d61ce008899d65d8859dc147e871238c64",
      preparedSha256: "f2c7e9b6e4fb9b15706245ab319f3c8a5d6d2d6e6ac05d3b6bab6d1c9e1e32ff",
      provenance: "Recorte nearest-only do circuito da ilha para o viewport de corrida top-down GBA; a fonte 1536×1024 e a composição 240×160 permanecem preservadas no pacote de proveniência candidato",
      generatedBy: "exemplo-gba-racing-v2-candidate",
      role: "racing-topdown-track",
      sceneRoles: ["racing-topdown-track", "racing-background"],
      profile: "racing",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      backgroundTileOptimizer: {
        enabled: true,
        tileBudget: 895,
        maxSourcePixelErrorRatio: 0.5,
        maxFramebufferMismatchRatio: 0.01
      },
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      width: 480,
      height: 320,
      tileCount: 2400,
      optimizedTileCount: 895,
      assetcStatus: "attention",
      assetcReviewed: false,
      reviewStatus: "approved",
      candidateStatus: "canonical-integrated",
      visualStatus: "approved",
      sourcePreserving: true
    }
  },
  {
    id: "racing-sky",
    kind: "Background",
    name: "circuit-sky.png",
    isReusableLibraryAsset: true,
    systemImage: "photo",
    metadata: {
      source: "Assets/backgrounds/circuit-sky.png",
      archived: true,
      reusableLibraryAsset: true,
      provenance: "Arte original de Vértice gerada externamente, preparada localmente em 4 bpp e preservada como arquivo do panorama pseudo-3D de corrida GBA v7",
      generatedBy: "racing-backgrounds-v7",
      role: "pseudo3d-archive-bg1",
      profile: "racing",
      colorMode: "4bpp",
      visualProfile: "diesel-fantasy-v2"
    }
  },
  {
    id: "racing-floor",
    kind: "Background",
    name: "circuit-floor.png",
    isReusableLibraryAsset: true,
    systemImage: "square.grid.3x3",
    metadata: {
      source: "Assets/backgrounds/circuit-floor.png",
      archived: true,
      reusableLibraryAsset: true,
      provenance: "Arte original de Vértice gerada externamente, preparada localmente em 4 bpp e aprovada como mapa afim de corrida GBA v4",
      generatedBy: "racing-backgrounds-v4",
      role: "pseudo3d-archive-bg2",
      profile: "racing",
      colorMode: "4bpp",
      affineTileOptimizer: {
        enabled: true,
        tileBudget: 256
      },
      visualProfile: "diesel-fantasy-v2"
    }
  },
  {
    id: "racing-minimap",
    kind: "Background",
    name: "circuit-minimap.png",
    isReusableLibraryAsset: true,
    systemImage: "map",
    metadata: {
      source: "Assets/backgrounds/circuit-minimap.png",
      archived: true,
      reusableLibraryAsset: true,
      provenance: "Arte original de Vértice gerada externamente, preparada localmente em 4 bpp e aprovada como minimapa de corrida GBA v8",
      generatedBy: "racing-backgrounds-v8",
      role: "pseudo3d-archive-hud-bg0",
      profile: "racing",
      colorMode: "4bpp",
      visualProfile: "diesel-fantasy-v2"
    }
  },
  {
    id: "racing-nara",
    kind: "Sprite",
    name: "nara-racer.png",
    systemImage: "figure.outdoor.cycle",
    metadata: {
      source: "Assets/sprites/nara-racer.png",
      sourceCandidate: "tools/gba-sprite-prep/production/exemplo-gba-racing-v2-candidate/prepared/vertice-nara-racer.png",
      sourceSha256: "6495d125614d8ed1b2a5a459d9e73a1754db2e06b32114523ea2484de0b9e564",
      preparedSha256: "d933dc6a743c06312ea3c343079080430272e43ff0fe1bed0a5d5cc016446185",
      provenance: "Sheet v2 aprovado do carro de Nara, recortado da fonte de veículos da corrida e preparado em três frames de 32×32",
      generatedBy: "exemplo-gba-racing-v2-candidate",
      role: "racing-player",
      profile: "racing",
      frameWidth: 32,
      frameHeight: 32,
      frameCount: 3,
      anchor: "center",
      maxVisibleColors: 15,
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      reviewStatus: "approved",
      candidateStatus: "canonical-integrated",
      visualStatus: "approved",
      sourcePreserving: true
    }
  },
  {
    id: "racing-rival",
    kind: "Sprite",
    name: "rival-racer.png",
    systemImage: "figure.outdoor.cycle",
    metadata: {
      source: "Assets/sprites/rival-racer.png",
      sourceCandidate: "tools/gba-sprite-prep/production/exemplo-gba-racing-v2-candidate/prepared/vertice-rival-racer.png",
      sourceSha256: "6495d125614d8ed1b2a5a459d9e73a1754db2e06b32114523ea2484de0b9e564",
      preparedSha256: "e9245467a79a7c57dbefb1eacd1511ce3d5bf8148e184343166e74508431b6ce",
      provenance: "Sheet v2 aprovado dos rivais, recortado da fonte de veículos da corrida e preparado em três frames de 32×32",
      generatedBy: "exemplo-gba-racing-v2-candidate",
      role: "racing-rival",
      profile: "racing",
      frameWidth: 32,
      frameHeight: 32,
      frameCount: 3,
      anchor: "center",
      maxVisibleColors: 15,
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art",
      reviewStatus: "approved",
      candidateStatus: "canonical-integrated",
      visualStatus: "approved",
      sourcePreserving: true
    }
  }
]);

const VERTICE_SHOWCASE_SPRITE_SHEETS = new Set([
  ...VERTICE_IN_GAME_MENU_ASSETS,
  ...VERTICE_NARRATIVE_ASSETS,
  ...VERTICE_PENEDOS_PLATFORMER_ASSETS,
  ...VERTICE_EXPLORATION_ASSETS,
  ...VERTICE_CLIMAX_ASSETS,
  ...VERTICE_RACING_ASSETS
].filter((asset) => asset.kind === "Sprite").map((asset) => asset.name));

const VERTICE_PLAYER_ACTOR_NAMES = Object.freeze({
  titulo: "Cursor de Vértice",
  prologo: "Nara · Prólogo",
  porto_lumen: "Nara",
  farol_interior: "Nara · Farol",
  penedos_vento: "Nara · Penedos",
  armazem_das_mares: "Cursor do Armazém",
  observatorio_do_farol: "Cursor do Observatório",
  mercado_suspenso: "Aventureiro · Mercado",
  usina_submersa: "Nara · Usina",
  conselho_guardia: "Retrato de Nara",
  tempestade: "Aeronave de Nara",
  guardiao_rele: "Nara · Mecânica",
  arena_arrancada: "Nara · Arena",
  circuito_final: "Carro de Nara",
  arena_tatica: "Nara · Arena Tática"
});

function campaignEvent(id, name, roomName, commands, category = "Cena") {
  return {
    id,
    name,
    roomName,
    category,
    detail: "Campanha canônica O Último Farol",
    command: "noop",
    steps: commands.map((command, index) => ({
      id: name === "menu_inicial_novo_jogo"
        && command === `set_variable ${VERTICE_INTERFACE_VARIABLES.characterGender} 0`
        ? `${id}-gender-reset`
        : `${id}-step-${name === "menu_inicial_novo_jogo" && index > 0 ? index : index + 1}`,
      command,
      isEnabled: true
    }))
  };
}

function dialogue(key, character, text, choices = [], portrait = "", portraitSlot = "") {
  return {
    character,
    choiceTranslations: choices.length > 0 ? { "pt-BR": choices, es: choices } : {},
    choices,
    confirmSound: "",
    emote: "",
    key,
    portrait,
    ...(portraitSlot ? { portraitSlot } : {}),
    text,
    textSound: "",
    translations: { "pt-BR": text, es: text },
    translationStatus: { "pt-BR": "approved", es: "approved" }
  };
}

function verticeDialogues() {
  return [
    dialogue("prologo_frame_1", "Narrador", "Os faróis da costa se apagam um a um. O último clarão ainda recorta o cais."),
    dialogue("prologo_frame_2", "Narrador", "A rota aérea desaparece sobre a tempestade. Nara encontra a aeronave antes que a noite feche o porto."),
    dialogue("prologo_frame_3", "Nara", "Se o farol não pode guiar o caminho, eu vou acendê-lo de novo.", [], "nara-portrait.png", "Esquerda"),
    dialogue("porto_objetivo", "Nara", "A estrutura da aeronave está no cais leste."),
    dialogue("farol_interior_objetivo", "Nara", "A lente ainda responde, mas o mecanismo precisa de manutenção. Vou falar com o guardião."),
    dialogue("farol_guardiao", "Guardião do farol", "A maré trouxe sal para os encaixes. Examine a lente e depois volte ao cais; o sinal precisa de uma rota livre."),
    dialogue("farol_lente", "Nara", "A lente está intacta. O farol pode voltar a guiar Porto de Lúmen."),
    dialogue("mercado_objetivo", "Nara", "As pontes de carga estão desalinhadas. Vou falar com o mercador e abrir o atalho para a usina."),
    dialogue("mercado_mercador", "Mercador", "A ponte norte travou no nível alto. Reposicione a carga e o caminho subterrâneo ficará livre."),
    dialogue("mercado_guarda", "Guarda", "Registre a carga na ponte para acessar a usina. Para treinar contra a sentinela, feche esta fala e pressione R. Na Arena, L traz você de volta."),
    dialogue("mercado_ponte_organizada", "Nara", "A ponte de carga encaixou. O atalho subterrâneo para a usina está aberto."),
    dialogue("mercado_ponte_ja_organizada", "Mercador", "A ponte já está alinhada. Siga pelo deck superior até a passagem da usina."),
    dialogue("mercado_saida_bloqueada", "Nara", "A passagem continua fechada. Ainda falta organizar a ponte de carga."),
    dialogue("usina_objetivo", "Nara", "A água tomou o núcleo. Vou avançar pelo corredor central e localizar a porta da sentinela."),
    dialogue("usina_combate_objetivo", "Nara", "A sentinela fechou o núcleo. Vou derrotá-la para abrir o compartimento de energia."),
    dialogue("usina_sentinela", "Sentinela", "O núcleo está protegido. A passagem só responde depois que a célula de energia for retirada."),
    dialogue("usina_celula_recuperada", "Nara", "Célula recuperada. A porta da antecâmara foi energizada; agora posso retornar pelo corredor."),
    dialogue("usina_celula_ja_recuperada", "Nara", "A célula já está no compartimento da aeronave. A antecâmara permanece liberada."),
    dialogue("usina_saida_bloqueada", "Nara", "A porta não responde. O núcleo ainda precisa da célula de energia."),
    dialogue("usina_saida_objetivo", "Nara", "O corredor está livre. Vou recuperar a célula e alcançar a antecâmara da guardiã."),
    dialogue("conselho", "Guardiã", "A rota exige coragem e precisão. Você aceita o pacto?", ["Aceitar a aliança"], "guardian-portrait.png", "Direita"),
    dialogue("arena_tatica_controles", "Sentinela", "Selecione Nara com A. No menu, use o direcional e A: Mover, Atacar ou Esperar. Após mover, escolha Atacar. B volta. O inimigo joga sozinho. L volta ao Mercado."),
    dialogue("arena_derrota", "Rival", "A pista não perdoa hesitação. Tente outra vez."),
    dialogue("circuito_derrota", "Rival", "Você ficou para trás nesta volta. O circuito reinicia no último farol."),
    dialogue("missao_rota_ativa", "Missão", "Rota dos Faróis está ativa. O próximo destino é Porto de Lúmen."),
    dialogue("missao_proximo_passo", "Missão", "Próximo passo: Porto de Lúmen. A rota continua a partir do cais."),
    dialogue("inventario_modulos", "Inventário", "Módulos da aeronave: estrutura, energia e estabilização. Consulte esta tela para acompanhar os componentes coletados."),
    dialogue("mapa_menu_atual", "Mapa", "Porto de Lúmen: base atual e ponto de manutenção da aeronave."),
    dialogue("mapa_menu_penedos", "Mapa", "Penedos do Vento: rota liberada. A viagem só acontece no mapa jogável."),
    dialogue("creditos_projeto", "Projeto", "Exemplo GBA: uma campanha de estudo para validar cenas, menus, atores, backgrounds e eventos no hardware do Game Boy Advance."),
    dialogue("creditos_engine", "Engine", "GBA Studio Engine: runtime e exportador usados pelo projeto, com arquitetura própria orientada às capacidades do GBA."),
    dialogue("epilogo", "Narrador", "Os faróis voltam a acender e a rota de Lúmen permanece livre.")
  ];
}

function setProgress(key, value = 1) {
  return `set_variable ${VERTICE_PROGRESS_VARIABLES[key]} ${value}`;
}

function saveProgress() {
  return "save_game 0";
}

function verticeCampaignEvents() {
  const resetCommands = [
    `set_variable ${VERTICE_INTERFACE_VARIABLES.characterGender} 0`,
    ...Object.values(VERTICE_PROGRESS_VARIABLES).map((variable) => (
      `set_variable ${variable} 0`
    ))
  ];
  const explicitSupportEntryEvents = new Set([
    "escolha_genero_ao_entrar",
    "nome_jogador_ao_entrar",
    "carregar_jogo_ao_entrar",
    "configuracoes_ao_entrar",
    "farol_interior_ao_entrar"
  ]);
  return [
    campaignEvent("event-title-enter", "titulo_ao_entrar", "titulo", []),
    campaignEvent("event-title-open-menu", "titulo_abrir_menu", "titulo", [
      "change_scene menu_inicial 0 0 down"
    ]),
    campaignEvent("event-opening-complete", "abertura_concluir", "abertura", [
      "change_scene titulo 0 0 down"
    ]),
    campaignEvent("event-menu-initial-enter", "menu_inicial_ao_entrar", "menu_inicial", []),
    campaignEvent("event-menu-initial-back", "menu_inicial_voltar_titulo", "menu_inicial", [
      "change_scene titulo 0 0 down"
    ]),
    campaignEvent("event-menu-initial-new", "menu_inicial_novo_jogo", "menu_inicial", [
      "remove_save_game 0",
      ...resetCommands,
    ]),
    campaignEvent("event-menu-initial-load-route", "menu_inicial_carregar_jogo", "menu_inicial", [], "Menu"),
    campaignEvent("event-menu-initial-settings-route", "menu_inicial_configuracoes", "menu_inicial", [], "Menu"),
    campaignEvent("event-menu-initial-credits-route", "menu_inicial_creditos", "menu_inicial", [], "Menu"),
    campaignEvent("event-market-guard", "mercado_falar_guarda", "mercado_suspenso", [
      "attach_button r mercado_entrar_arena true",
      "show_dialogue mercado_guarda"
    ], "Ator"),
    campaignEvent("event-market-enter-arena", "mercado_entrar_arena", "mercado_suspenso", [
      "change_scene arena_tatica 1 4 right"
    ], "Ator"),
    campaignEvent("event-tactical-arena-enter", "arena_tatica_ao_entrar", "arena_tatica", [
      "remove_button r",
      "attach_button l arena_tatica_sair true",
      "show_dialogue arena_tatica_controles"
    ]),
    campaignEvent("event-tactical-arena-exit", "arena_tatica_sair", "arena_tatica", [
      "remove_button l",
      "change_scene mercado_suspenso 25 13 down"
    ], "Menu"),
    campaignEvent("event-gender-enter", "escolha_genero_ao_entrar", "escolha_genero", []),
    campaignEvent("event-gender-male", "escolha_genero_homem", "escolha_genero", [
      `set_variable ${VERTICE_INTERFACE_VARIABLES.characterGender} 0`
    ], "Menu"),
    campaignEvent("event-gender-female", "escolha_genero_mulher", "escolha_genero", [
      `set_variable ${VERTICE_INTERFACE_VARIABLES.characterGender} 1`
    ], "Menu"),
    campaignEvent("event-player-profile-apply", "aplicar_perfil_jogador", "porto_lumen", [
      "if_scene porto_lumen",
      "call_event aplicar_perfil_jogador_base"
    ], "Gameplay"),
    campaignEvent("event-player-profile-apply-base", "aplicar_perfil_jogador_base", "porto_lumen", [
      "change_player_sprite player-pilot-32x32.png",
      "set_actor_animation Player idle_down"
    ], "Gameplay"),
    campaignEvent("event-gender-confirm", "escolha_genero_confirmar", "escolha_genero", [
      "change_scene nome_jogador 21 17 right"
    ], "Menu"),
    campaignEvent("event-name-enter", "nome_jogador_ao_entrar", "nome_jogador", []),
    campaignEvent("event-name-input", "nome_jogador_nome", "nome_jogador", [
      `open_text_input ${VERTICE_INTERFACE_VARIABLES.characterName} 8 0`
    ], "Menu"),
    campaignEvent("event-name-confirm", "nome_jogador_confirmar", "nome_jogador", [
      setProgress("chapter", 1),
      "change_scene prologo 21 17 right"
    ], "Menu"),
    campaignEvent("event-load-game-enter", "carregar_jogo_ao_entrar", "carregar_jogo", []),
    campaignEvent("event-load-game-slot-1", "carregar_jogo_slot_1", "carregar_jogo", [
      "if_save_game 0",
      "load_game 0",
      "call_event aplicar_perfil_jogador",
      "else",
      "condition_end"
    ], "Menu"),
    campaignEvent("event-missions-detail-active", "missoes_detalhar_ativa", "missoes", [
      "show_dialogue missao_rota_ativa"
    ], "Menu"),
    campaignEvent("event-missions-detail-next", "missoes_detalhar_proximo", "missoes", [
      "show_dialogue missao_proximo_passo"
    ], "Menu"),
    campaignEvent("event-inventory-detail-modules", "inventario_detalhar_modulos", "inventario", [
      "show_dialogue inventario_modulos"
    ], "Menu"),
    campaignEvent("event-map-menu-detail-current", "mapa_menu_detalhar_atual", "mapa_menu", [
      "show_dialogue mapa_menu_atual"
    ], "Menu"),
    campaignEvent("event-map-menu-detail-penedos", "mapa_menu_detalhar_penedos", "mapa_menu", [
      "show_dialogue mapa_menu_penedos"
    ], "Menu"),
    campaignEvent("event-prologue-enter", "prologo_ao_entrar", "prologo", [
      "call_event aplicar_perfil_jogador",
      "save_game 0"
    ]),
    campaignEvent("event-prologue-next", "prologo_partir", "prologo", [
      setProgress("chapter", 2),
      "advance_campaign"
    ]),
    campaignEvent("event-port-enter", "porto_ao_entrar", "porto_lumen", [
      "call_event aplicar_perfil_jogador",
      "if_variable z_feature_quest_state 0",
      "set_variable z_feature_quest_state 1",
      "add_item currency_gold 3",
      "set_variable z_feature_shop_stock 0",
      "condition_end"
    ]),
    campaignEvent("event-port-frame", "porto_recuperar_estrutura", "porto_lumen", [
      setProgress("farolParts.frame"),
      "add_item quest_fragment 1",
      saveProgress()
    ], "Ator"),
    campaignEvent("event-port-exit", "porto_abrir_mapa", "porto_lumen", [
      `if_variable ${VERTICE_PROGRESS_VARIABLES["farolParts.frame"]} 1`,
      "advance_campaign",
      "else",
      "show_dialogue porto_objetivo",
      "condition_end"
    ]),
    campaignEvent("event-port-lighthouse", "porto_entrar_farol", "porto_lumen", [
      "change_scene farol_interior 22 24 up"
    ], "Hotspot"),
    campaignEvent("event-lighthouse-enter", "farol_interior_ao_entrar", "farol_interior", [
      "show_dialogue farol_interior_objetivo"
    ]),
    campaignEvent("event-lighthouse-keeper", "farol_falar_guardiao", "farol_interior", [
      "show_dialogue farol_guardiao"
    ], "Ator"),
    campaignEvent("event-lighthouse-lens", "farol_examinar_lente", "farol_interior", [
      "show_dialogue farol_lente"
    ], "Hotspot"),
    campaignEvent("event-lighthouse-exit", "farol_sair_porto", "farol_interior", [
      "change_scene porto_lumen 15 14 down"
    ], "Hotspot"),
    campaignEvent("event-map-select", "mapa_escolher_penedos", "mapa_rota", [
      setProgress("routeFlags.activeRoute"),
      saveProgress(),
      "change_scene_by_variable map-routes"
    ]),
    campaignEvent("event-cliff-enter", "penedos_ao_entrar", "penedos_vento", [
      "call_event aplicar_perfil_jogador"
    ]),
    campaignEvent("event-cliff-reward", "penedos_recolher_aderencia", "penedos_vento", [
      setProgress("vehicleModules.grip"),
      saveProgress(),
      "advance_campaign"
    ]),
    campaignEvent("event-cliff-exit", "penedos_retornar_armazem", "penedos_vento", [
      setProgress("vehicleModules.grip"),
      saveProgress(),
      "advance_campaign"
    ]),
    campaignEvent("event-warehouse-enter", "armazem_das_mares_ao_entrar", "armazem_das_mares", [saveProgress()]),
    campaignEvent("event-observatory-enter", "observatorio_do_farol_ao_entrar", "observatorio_do_farol", [saveProgress()]),
    campaignEvent("event-market-enter", "mercado_ao_entrar", "mercado_suspenso", [
      "play_music farol_falesias",
      "set_camera_property pan_y 0",
      "remove_button l",
      "remove_button r",
      `if_variable ${VERTICE_PROGRESS_VARIABLES["routeFlags.marketShortcut"]} 1`,
      "set_actor_position market-guard-v1 25 12",
      "else",
      "set_actor_position market-guard-v1 26 12",
      "condition_end"
    ]),
    campaignEvent("event-market-trader", "mercado_falar_mercador", "mercado_suspenso", [
      "show_dialogue mercado_objetivo",
      "show_dialogue mercado_mercador"
    ], "Ator"),
    campaignEvent("event-market-bridge", "mercado_abrir_atalho", "mercado_suspenso", [
      `if_variable ${VERTICE_PROGRESS_VARIABLES["routeFlags.marketShortcut"]} 0`,
      setProgress("routeFlags.marketShortcut"),
      "set_actor_position market-guard-v1 25 12",
      "play_sfx farol_sfx_dialogo",
      saveProgress(),
      "show_dialogue mercado_ponte_organizada",
      "else",
      "show_dialogue mercado_ponte_ja_organizada",
      "condition_end"
    ], "Hotspot"),
    campaignEvent("event-market-exit", "mercado_abrir_usina", "mercado_suspenso", [
      `if_variable ${VERTICE_PROGRESS_VARIABLES["routeFlags.marketShortcut"]} 1`,
      "advance_campaign",
      "else",
      "show_dialogue mercado_saida_bloqueada",
      "condition_end"
    ]),
    campaignEvent("event-plant-enter", "usina_ao_entrar", "usina_submersa", [
      "call_event aplicar_perfil_jogador",
      "show_dialogue usina_objetivo",
      `if_variable ${VERTICE_PROGRESS_VARIABLES["usina.combatCleared"]} 1`,
      "change_scene usina_saida 17 5 up",
      "condition_end"
    ]),
    campaignEvent("event-plant-combat-gate", "usina_abrir_combate", "usina_submersa", [
      `if_variable ${VERTICE_PROGRESS_VARIABLES["usina.combatCleared"]} 0`,
      "change_scene usina_combate 14 6 up",
      "else",
      "change_scene usina_saida 17 5 up",
      "condition_end"
    ], "Hotspot"),
    campaignEvent("event-plant-combat-enter", "usina_combate_ao_entrar", "usina_combate", [
      "call_event aplicar_perfil_jogador",
      "show_dialogue usina_combate_objetivo",
      `if_variable ${VERTICE_PROGRESS_VARIABLES["usina.combatCleared"]} 1`,
      "change_scene usina_saida 17 5 up",
      "condition_end"
    ]),
    campaignEvent("event-plant-sentinel", "usina_sentinela", "usina_combate", [
      "show_dialogue usina_sentinela"
    ], "Ator"),
    campaignEvent("event-plant-combat-reward", "usina_vencer_combate", "usina_combate", [
      `if_variable ${VERTICE_PROGRESS_VARIABLES["usina.combatCleared"]} 0`,
      setProgress("usina.combatCleared"),
      saveProgress(),
      "change_scene usina_saida 17 5 up",
      "else",
      "change_scene usina_saida 17 5 up",
      "condition_end"
    ], "Gameplay"),
    campaignEvent("event-plant-exit-enter", "usina_saida_ao_entrar", "usina_saida", [
      "call_event aplicar_perfil_jogador",
      "show_dialogue usina_saida_objetivo",
      `if_variable ${VERTICE_PROGRESS_VARIABLES["farolParts.energyCell"]} 1`,
      "set_actor_visible usina-energy-cell-v2 false",
      "condition_end"
    ]),
    campaignEvent("event-plant-reward", "usina_coletar_celula", "usina_saida", [
      `if_variable ${VERTICE_PROGRESS_VARIABLES["farolParts.energyCell"]} 0`,
      setProgress("farolParts.energyCell"),
      "set_actor_visible usina-energy-cell-v2 false",
      saveProgress(),
      "show_dialogue usina_celula_recuperada",
      "else",
      "show_dialogue usina_celula_ja_recuperada",
      "condition_end"
    ], "Ator"),
    campaignEvent("event-plant-exit", "usina_encontrar_guardia", "usina_saida", [
      `if_variable ${VERTICE_PROGRESS_VARIABLES["farolParts.energyCell"]} 1`,
      "advance_campaign",
      "else",
      "show_dialogue usina_saida_bloqueada",
      "condition_end"
    ]),
    campaignEvent("event-council-enter", "conselho_ao_entrar", "conselho_guardia", [
      "choice_event conselho 0 conselho_confirmar_alianca"
    ]),
    campaignEvent("event-council-choice", "conselho_confirmar_alianca", "conselho_guardia", [
      setProgress("bond.guardian"),
      saveProgress(),
      "advance_campaign"
    ]),
    campaignEvent("event-storm-enter", "tempestade_ao_entrar", "tempestade", []),
    campaignEvent("event-storm-drone-fire", "tempestade_drone_disparar", "tempestade", [
      "launch_projectile Drone left 2 storm-bolt.png"
    ], "Ator"),
    campaignEvent("event-storm-reward", "tempestade_concluir", "tempestade", [
      setProgress("vehicleModules.shield"),
      saveProgress(),
      "advance_campaign"
    ]),
    campaignEvent("event-storm-exit", "tempestade_alcancar_rele", "tempestade", [
      setProgress("vehicleModules.shield"),
      saveProgress(),
      "advance_campaign"
    ]),
    campaignEvent("event-guardian-enter", "guardiao_ao_entrar", "guardiao_rele", []),
    campaignEvent("event-guardian-win", "guardiao_vitoria", "guardiao_rele", [
      setProgress("routeFlags.relayCleared"),
      saveProgress(),
      "advance_campaign"
    ]),
    campaignEvent("event-guardian-lose", "guardiao_derrota", "guardiao_rele", [
      "change_scene guardiao_rele 7 14 down"
    ]),
    campaignEvent("event-arena-enter", "arena_ao_entrar", "arena_arrancada", []),
    campaignEvent("event-arena-win", "arena_vencer_rival", "arena_arrancada", [
      setProgress("vehicleModules.boost"),
      saveProgress(),
      "advance_campaign"
    ]),
    campaignEvent("event-circuit-enter", "circuito_ao_entrar", "circuito_final", [
      "play_music farol_corrida_final",
      "play_sfx farol_sfx_motor"
    ]),
    campaignEvent("event-circuit-finish", "circuito_concluir", "circuito_final", [
      setProgress("campaignFinished"),
      saveProgress(),
      "show_dialogue epilogo",
      "advance_campaign"
    ]),
    campaignEvent("event-circuit-defeat", "circuito_reiniciar", "circuito_final", [
      "show_dialogue circuito_derrota",
      "change_scene circuito_final 28 10 right"
    ]),
    ...VERTICE_SUPPORT_SCENES
      .filter((definition) => (
        definition.name !== VERTICE_INITIAL_MENU_SCENE
        && !explicitSupportEntryEvents.has(definition.transitionEvent)
      ))
      .map((definition) => campaignEvent(
      `event-${definition.name}-enter`,
      definition.transitionEvent,
      definition.name,
      []
      )),
    campaignEvent("event-settings-enter", "configuracoes_ao_entrar", "configuracoes", [
      `if_variable ${VERTICE_INTERFACE_VARIABLES.audioInitialized} 0`,
      `set_variable ${VERTICE_INTERFACE_VARIABLES.audioMasterVolume} 100`,
      `set_variable ${VERTICE_INTERFACE_VARIABLES.audioMusicVolume} 80`,
      `set_variable ${VERTICE_INTERFACE_VARIABLES.audioSfxVolume} 90`,
      `set_variable ${VERTICE_INTERFACE_VARIABLES.audioEnabled} 1`,
      "set_audio_volume all 100",
      "set_audio_volume music 80",
      "set_audio_volume sfx 90",
      `set_variable ${VERTICE_INTERFACE_VARIABLES.audioInitialized} 1`,
      "condition_end",
      `read_rtc hour ${VERTICE_INTERFACE_VARIABLES.rtcHour}`,
      `read_rtc minute ${VERTICE_INTERFACE_VARIABLES.rtcMinute}`
    ], "Menu"),
    campaignEvent("event-settings-rtc", "configuracoes_rtc", "configuracoes", [
      `read_rtc hour ${VERTICE_INTERFACE_VARIABLES.rtcHour}`,
      `read_rtc minute ${VERTICE_INTERFACE_VARIABLES.rtcMinute}`
    ], "Menu"),
    campaignEvent("event-credits-project", "creditos_detalhar_projeto", "creditos", [
      "show_dialogue creditos_projeto"
    ], "Menu"),
    campaignEvent("event-credits-engine", "creditos_detalhar_engine", "creditos", [
      "show_dialogue creditos_engine"
    ], "Menu"),
    campaignEvent("event-save-slot-1", "menu_salvar_slot_1", "salvar", [
      "save_game 0"
    ], "Menu"),
    campaignEvent("event-save-slot-2", "menu_salvar_slot_2", "salvar", [
      "save_game 1"
    ], "Menu"),
    campaignEvent("event-save-slot-3", "menu_salvar_slot_3", "salvar", [
      "save_game 2"
    ], "Menu")
  ];
}

function verticeMenuRuntime(runtime) {
  const config = runtime?.config && typeof runtime.config === "object" ? runtime.config : {};
  const startItem = {
    id: "start",
    label: "PRESS START",
    action: "select",
    targetScreenID: "",
    eventName: "titulo_abrir_menu",
    clickBox: { x: 56, y: 112, width: 128, height: 32 }
  };
  return {
    type: "menu",
    config: {
      ...config,
      role: "title",
      menuProfile: "initial",
      screenType: "title",
      title: "O Último Farol",
      titleOverlayAssetName: "",
      backgroundAnimation: {
        frameAssetNames: [VERTICE_TITLE_BACKGROUND],
        frameDuration: 1,
        loop: false
      },
      titleFadeFrames: 45,
      screens: [
        {
          id: "title",
          menuProfile: "initial",
          screenType: "title",
          title: "O Último Farol",
          titleOverlayAssetName: "",
          backgroundAnimation: {
            frameAssetNames: [VERTICE_TITLE_BACKGROUND],
            frameDuration: 1,
            loop: false
          },
          titleFadeFrames: 45,
          autoAdvanceFrames: 0,
          allowSkip: true,
          nextScreenID: "",
          onEnterEventName: "titulo_ao_entrar",
          items: [startItem]
        }
      ]
    }
  };
}

function menuProfileForRole(role) {
  return ["start", "mission_board", "inventory", "map", "profile", "save"].includes(role)
    ? "in_game"
    : "initial";
}

function verticeInitialMenuRuntime(runtime) {
  const config = runtime?.config && typeof runtime.config === "object" ? runtime.config : {};
  const items = [
    { id: "new-game", label: "Novo jogo", action: "push_screen", targetScreenID: "escolha_genero", eventName: "menu_inicial_novo_jogo", clickBox: { x: 52, y: 58, width: 136, height: 18 } },
    { id: "load-game", label: "Carregar jogo", action: "push_screen", targetScreenID: "carregar_jogo", eventName: "", clickBox: { x: 52, y: 78, width: 136, height: 18 }, requiresSave: true },
    { id: "language", label: "Idioma", action: "push_screen", targetScreenID: "configuracoes", eventName: "", clickBox: { x: 52, y: 98, width: 136, height: 18 } },
    { id: "settings", label: "Configurações", action: "push_screen", targetScreenID: "configuracoes", eventName: "", clickBox: { x: 52, y: 118, width: 136, height: 18 } },
    { id: "credits", label: "Créditos", action: "push_screen", targetScreenID: "creditos", eventName: "", clickBox: { x: 52, y: 138, width: 136, height: 18 } }
  ];
  return {
    type: "menu",
    config: {
      ...config,
      role: "initial",
      menuProfile: "initial",
      screenType: "menu",
      title: "Menu Inicial",
      titleOverlayAssetName: "",
      titleFadeFrames: 0,
      autoAdvanceFrames: 0,
      allowSkip: true,
      nextScreenID: "",
      onBackEventName: "menu_inicial_voltar_titulo",
      items,
      screens: [{
        id: "initial",
        menuProfile: "initial",
        screenType: "menu",
        title: "Menu Inicial",
        titleOverlayAssetName: "",
        titleFadeFrames: 0,
        autoAdvanceFrames: 0,
        allowSkip: true,
        nextScreenID: "",
        onEnterEventName: "menu_inicial_ao_entrar",
        onBackEventName: "menu_inicial_voltar_titulo",
        items
      }]
    }
  };
}

function verticeLogoCutsceneRuntime(runtime) {
  const config = runtime?.config && typeof runtime.config === "object" ? runtime.config : {};
  const totalDurationFrames = VERTICE_STARTUP_LOGO_FRAMES.reduce((total, frame) => total + frame.durationFrames, 0);
  return {
    type: "cutscene",
    config: {
      ...config,
      stepDurationFrames: totalDurationFrames,
      autoAdvance: true,
      nextSceneIndex: -1,
      backgroundIndex: -1,
      steps: VERTICE_STARTUP_LOGO_FRAMES.map((frame, index) => ({
        id: frame.id,
        durationFrames: frame.durationFrames,
        autoAdvance: true,
        skippable: true,
        backgroundAssetName: frame.name,
        targetSceneIndex: index === VERTICE_STARTUP_LOGO_FRAMES.length - 1 ? 1 : -1
      }))
    }
  };
}

function verticeOpeningCutsceneRuntime(runtime) {
  const config = runtime?.config && typeof runtime.config === "object" ? runtime.config : {};
  return {
    type: "cutscene",
    config: {
      ...config,
      stepDurationFrames: 150,
      autoAdvance: true,
      nextSceneIndex: -1,
      backgroundIndex: -1,
      steps: [
        {
          id: "opening-animation",
          durationFrames: 150,
          autoAdvance: true,
          skippable: true,
          actorMotions: [{
            actorIndex: 0,
            fromPosition: { x: 248, y: 48 },
            toPosition: { x: 88, y: 64 },
            durationFrames: 150
          }],
          onSkipEventName: "abertura_concluir"
        },
        {
          id: "opening-complete",
          durationFrames: 0,
          autoAdvance: false,
          skippable: false,
          eventName: "abertura_concluir"
        }
      ]
    }
  };
}

function verticeStartMenuRuntime(runtime) {
  const config = runtime?.config && typeof runtime.config === "object" ? runtime.config : {};
  const items = [
    { id: "missions", label: "Missões", action: "push_screen", targetScreenID: "missoes", eventName: "", binding: { source: "variable", index: 0, format: "number" }, clickBox: { x: 82, y: 36, width: 97, height: 13 } },
    { id: "inventory", label: "Inventário", action: "push_screen", targetScreenID: "inventario", eventName: "", binding: { source: "inventory", index: 0, format: "count" }, clickBox: { x: 82, y: 51, width: 97, height: 13 } },
    { id: "map", label: "Mapa", action: "push_screen", targetScreenID: "mapa_menu", eventName: "", binding: { source: "variable", index: 9, format: "number" }, clickBox: { x: 82, y: 65, width: 97, height: 13 } },
    { id: "profile", label: "Perfil/equipe", action: "push_screen", targetScreenID: "perfil_equipe", eventName: "", binding: { source: "equipped", index: 0, format: "number" }, clickBox: { x: 82, y: 80, width: 97, height: 13 } },
    { id: "save", label: "Salvar", action: "push_screen", targetScreenID: "salvar", eventName: "", clickBox: { x: 82, y: 94, width: 97, height: 13 } },
    { id: "settings", label: "Configurações", action: "push_screen", targetScreenID: "configuracoes", eventName: "", clickBox: { x: 82, y: 109, width: 97, height: 13 } },
    { id: "back", label: "Voltar", action: "pop_screen", targetScreenID: "", eventName: "", clickBox: { x: 82, y: 123, width: 97, height: 14 } }
  ];
  return {
    type: "menu",
    config: {
      ...config,
      role: "start",
      menuProfile: "in_game",
      presentationMode: "scene",
      screenType: "menu",
      title: "Menu Start",
      titleOverlayAssetName: "",
      titleFadeFrames: 0,
      autoAdvanceFrames: 0,
      allowSkip: true,
      nextScreenID: "",
      entryPolicy: "gameplay",
      returnPolicy: "resume",
      suspendsGameplay: true,
      items,
      screens: [{
        id: "start",
        menuProfile: "in_game",
        presentationMode: "scene",
        screenType: "menu",
        title: "Menu Start",
        titleOverlayAssetName: "",
        titleFadeFrames: 0,
        autoAdvanceFrames: 0,
        allowSkip: true,
        nextScreenID: "",
        onEnterEventName: "menu_start_ao_entrar",
        items
      }]
    }
  };
}

const VERTICE_ROUTE_MAP_NODES = Object.freeze([
  Object.freeze({ id: "porto", name: "Porto de Lúmen", x: 72, y: 160, connections: Object.freeze(["penedos"]), eventName: "", targetLevel: -1 }),
  Object.freeze({ id: "penedos", name: "Penedos do Vento", x: 136, y: 104, connections: Object.freeze(["porto", "usina"]), eventName: "mapa_escolher_penedos", targetLevel: 0 }),
  Object.freeze({ id: "usina", name: "Usina Submersa", x: 188, y: 56, connections: Object.freeze(["penedos"]), eventName: "", targetLevel: -1 })
]);

function cloneVerticeRouteMapNodes() {
  return VERTICE_ROUTE_MAP_NODES.map((node) => ({
    ...node,
    connections: [...node.connections]
  }));
}

function verticeSupportMenuRuntime(scene, runtime) {
  const config = runtime?.config && typeof runtime.config === "object" ? runtime.config : {};
  const itemsByScene = {
    logo: [],
    abertura: [],
    menu_inicial: [],
    escolha_genero: [
      { id: "male", label: "Homem", action: "select", targetScreenID: "", eventName: "escolha_genero_homem", clickBox: { x: 40, y: 98, width: 80, height: 18 } },
      { id: "female", label: "Mulher", action: "select", targetScreenID: "", eventName: "escolha_genero_mulher", clickBox: { x: 120, y: 98, width: 80, height: 18 } },
      { id: "confirm", label: "Confirmar", action: "select", targetScreenID: "", eventName: "escolha_genero_confirmar", clickBox: { x: 64, y: 130, width: 112, height: 18 } }
    ],
    nome_jogador: [
      { id: "name", label: "Nome do jogador", action: "select", targetScreenID: "", eventName: "nome_jogador_nome", clickBox: { x: 48, y: 48, width: 160, height: 18 } },
      { id: "confirm", label: "Confirmar", action: "select", targetScreenID: "", eventName: "nome_jogador_confirmar", clickBox: { x: 48, y: 128, width: 80, height: 18 } }
    ],
    carregar_jogo: [
      { id: "load-slot-1", label: "Slot 1", action: "select", targetScreenID: "", eventName: "carregar_jogo_slot_1", clickBox: { x: 64, y: 72, width: 112, height: 18 }, requiresSave: true }
    ],
    configuracoes: [
      { id: "audio-master", label: "Volume geral", action: "adjust_variable", variableIndex: VERTICE_INTERFACE_VARIABLE_INDEX.audioMasterVolume, minValue: 0, maxValue: 100, step: 10, audioChannel: "all", clickBox: { x: 24, y: 32, width: 192, height: 16 } },
      { id: "audio-music", label: "Música", action: "adjust_variable", variableIndex: VERTICE_INTERFACE_VARIABLE_INDEX.audioMusicVolume, minValue: 0, maxValue: 100, step: 10, audioChannel: "music", clickBox: { x: 24, y: 48, width: 192, height: 16 } },
      { id: "audio-sfx", label: "Efeitos", action: "adjust_variable", variableIndex: VERTICE_INTERFACE_VARIABLE_INDEX.audioSfxVolume, minValue: 0, maxValue: 100, step: 10, audioChannel: "sfx", clickBox: { x: 24, y: 64, width: 192, height: 16 } },
      { id: "audio-enabled", label: "Som ligado", action: "toggle_variable", variableIndex: VERTICE_INTERFACE_VARIABLE_INDEX.audioEnabled, minValue: 0, maxValue: 1, step: 1, checkedValue: 1, audioChannel: "all", clickBox: { x: 24, y: 80, width: 192, height: 16 } },
      { id: "language", label: "Idioma", action: "adjust_variable", variableIndex: VERTICE_INTERFACE_VARIABLE_INDEX.language, minValue: 0, maxValue: 2, step: 1, clickBox: { x: 24, y: 96, width: 192, height: 16 } },
      { id: "controls", label: "Controles · GBA clássico", action: "select", targetScreenID: "", eventName: "", clickBox: { x: 24, y: 112, width: 192, height: 16 } },
      { id: "rtc", label: "Relógio RTC", action: "select", targetScreenID: "", eventName: "configuracoes_rtc", binding: { source: "variable", index: VERTICE_INTERFACE_VARIABLE_INDEX.rtcHour, format: "number" }, clickBox: { x: 24, y: 128, width: 192, height: 16 } },
      { id: "back", label: "Voltar", action: "pop_screen", targetScreenID: "", eventName: "", clickBox: { x: 24, y: 144, width: 192, height: 12 } }
    ],
    creditos: [
      { id: "credits-project", label: "Projeto · GBA Studio", action: "select", targetScreenID: "", eventName: "creditos_detalhar_projeto", clickBox: { x: 48, y: 58, width: 160, height: 16 } },
      { id: "credits-engine", label: "Engine · GBA Studio", action: "select", targetScreenID: "", eventName: "creditos_detalhar_engine", clickBox: { x: 48, y: 78, width: 160, height: 16 } }
    ],
    missoes: [
      { id: "mission-active", label: "Rota dos Faróis · Ativa", action: "select", targetScreenID: "", eventName: "missoes_detalhar_ativa", clickBox: { x: 36, y: 58, width: 168, height: 16 } },
      { id: "mission-next", label: "Próximo passo · Porto de Lúmen", action: "select", targetScreenID: "", eventName: "missoes_detalhar_proximo", clickBox: { x: 36, y: 78, width: 168, height: 16 } },
      { id: "back", label: "Voltar", action: "pop_screen", targetScreenID: "", eventName: "", clickBox: { x: 36, y: 128, width: 168, height: 16 } }
    ],
    inventario: [
      { id: "inventory-modules", label: "Módulos da aeronave", action: "select", targetScreenID: "", eventName: "inventario_detalhar_modulos", clickBox: { x: 36, y: 58, width: 168, height: 16 } },
      { id: "inventory-empty", label: "Nenhum item consumível", action: "select", targetScreenID: "", eventName: "", enabled: false, clickBox: { x: 36, y: 78, width: 168, height: 16 } },
      { id: "back", label: "Voltar", action: "pop_screen", targetScreenID: "", eventName: "", clickBox: { x: 36, y: 128, width: 168, height: 16 } }
    ],
    mapa_menu: [
      { id: "map-current", label: "Porto de Lúmen · Rota atual", action: "select", targetScreenID: "", eventName: "mapa_menu_detalhar_atual", clickBox: { x: 36, y: 58, width: 168, height: 16 } },
      { id: "map-penedos", label: "Penedos do Vento · Rota liberada", action: "select", targetScreenID: "", eventName: "mapa_menu_detalhar_penedos", clickBox: { x: 36, y: 78, width: 168, height: 16 } },
      { id: "back", label: "Voltar", action: "pop_screen", targetScreenID: "", eventName: "", clickBox: { x: 36, y: 128, width: 168, height: 16 } }
    ],
    perfil_equipe: [
      { id: "profile-male", label: "Tripulante · Masculino", action: "select", targetScreenID: "", eventName: "", clickBox: { x: 32, y: 24, width: 56, height: 56 } },
      { id: "profile-female", label: "Tripulante · Feminino", action: "select", targetScreenID: "", eventName: "", clickBox: { x: 94, y: 24, width: 56, height: 56 } },
      { id: "profile-elder", label: "Tripulante · Veterano", action: "select", targetScreenID: "", eventName: "", clickBox: { x: 158, y: 24, width: 56, height: 56 } },
      { id: "back", label: "Voltar", action: "pop_screen", targetScreenID: "", eventName: "", clickBox: { x: 36, y: 128, width: 168, height: 16 } }
    ],
    salvar: [
      { id: "slot-1", label: "Slot 1 · Salvar agora", action: "pop_screen", targetScreenID: "", eventName: "menu_salvar_slot_1", clickBox: { x: 36, y: 68, width: 168, height: 18 } },
      { id: "slot-2", label: "Slot 2 · Salvar agora", action: "pop_screen", targetScreenID: "", eventName: "menu_salvar_slot_2", clickBox: { x: 36, y: 92, width: 168, height: 18 } },
      { id: "slot-3", label: "Slot 3 · Salvar agora", action: "pop_screen", targetScreenID: "", eventName: "menu_salvar_slot_3", clickBox: { x: 36, y: 116, width: 168, height: 18 } },
      { id: "back", label: "Voltar", action: "pop_screen", targetScreenID: "", eventName: "", clickBox: { x: 36, y: 128, width: 168, height: 16 } }
    ]
  };
  const items = itemsByScene[scene.name] ?? [];
  const screenType = "menu";
  const autoAdvanceFrames = 0;
  return {
    type: "menu",
    config: {
      ...config,
      role: scene.role,
      menuProfile: menuProfileForRole(scene.role),
      screenType,
      title: scene.title,
      titleOverlayAssetName: "",
      titleFadeFrames: 0,
      autoAdvanceFrames,
      allowSkip: true,
      nextScreenID: scene.nextScene ?? "",
      ...(scene.name === "configuracoes" ? {
        presentationMode: "hud",
        hudPresetId: "hud-menu-settings"
      } : {}),
      ...(menuProfileForRole(scene.role) === "in_game" ? {
        presentationMode: "scene",
        entryPolicy: "gameplay",
        returnPolicy: "resume",
        suspendsGameplay: true
      } : {}),
      items,
      ...(scene.name === "mapa_menu" ? {
        presentation: "hybrid-world-map",
        mapMode: "inspect",
        nodes: cloneVerticeRouteMapNodes()
      } : {}),
      ...(scene.name === "nome_jogador" ? {
        textInput: {
          variableName: VERTICE_INTERFACE_VARIABLES.characterName,
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
            surface: "runtime",
            controlLayout: "side",
            controlsX: 25,
            controlsY: 11,
            controlsWidth: 6,
            controlsHeight: 6
          }
        }
      } : {})
    }
  };
}

const VERTICE_TEMPESTADE_AFFINE_BUDGET = Object.freeze({
  bgTiles: 256,
  objTiles: 0,
  oam: 0,
  paletteColors: 256,
  vramBytes: 32768,
  eventBytes: 0,
  audioBytes: 0,
  dmaBytes: 32768,
  vblankTicks: 160,
  cpuWorkTicks: 220
});

function verticeTempestadeAffineRuntime(runtime) {
  return {
    type: "shmup",
    config: {
      playerSpeed: 2,
      fireCooldown: 8,
      scrollSpeed: 1,
      modules: [
        { id: "movement", enabled: true, settings: {} },
        {
          id: "score",
          enabled: true,
          settings: { initialScore: 0, initialLives: 3, persistHighScore: true }
        },
        { id: "waves", enabled: true, settings: { maxWaves: 1, loop: true } },
        { id: "camera", enabled: true, settings: {} }
      ],
      capabilities: [{
        id: "affine_background",
        enabled: true,
        required: true,
        settings: {
          logicalWidthPixels: 720,
          logicalHeightPixels: 160,
          physicalMapTiles: 128
        }
      }],
      composition: {
        schema: 1,
        enabled: true,
        mode: "affine",
        layers: [{
          id: "shmup-affine-background",
          kind: "affine_bg",
          role: "decorative",
          layer: "BG2",
          enabled: true,
          priority: 2,
          assetId: "shmup-background-affine-1024.png",
          parallax: { x256: 256, y256: 256 },
          scroll: { x: 0, y: 0 },
          affine: {
            rotationDegrees: 0,
            scaleX: 1,
            scaleY: 1,
            pivotX: 120,
            pivotY: 80,
            wrap: true
          },
          bitmapPage: 0
        }],
        effects: {
          blend: { enabled: false, mode: "none", firstTargets: [], secondTargets: [], eva: 8, evb: 8, intensity: 0 },
          mosaic: { enabled: false, bgX: 0, bgY: 0, objX: 0, objY: 0 },
          window0: { enabled: false, left: 0, right: 240, top: 0, bottom: 160, insideTargets: [], outsideTargets: [] },
          window1: { enabled: false, left: 0, right: 240, top: 0, bottom: 160, insideTargets: [], outsideTargets: [] },
          hblank: { enabled: false, layer: "BG2", hdma: false, scrollOffsets: [] }
        },
        fallback: "error",
        budget: { ...VERTICE_TEMPESTADE_AFFINE_BUDGET }
      },
      resources: {
        schema: 1,
        dependencies: [],
        resources: [{
          id: "shmup-affine-background",
          assetId: "shmup-background-affine-1024.png",
          kind: "affine_bg",
          enabled: true,
          required: true,
          bpp: 8,
          palette: { id: "shmup-affine-palette", slot: "background", colors: 16 },
          compression: "none",
          tileLimit: 256,
          resourceGroup: "shmup",
          prefetch: "scene",
          cache: "resident",
          evictionPriority: 0,
          dependencies: [],
          fallback: { mode: "error" },
          budget: { ...VERTICE_TEMPESTADE_AFFINE_BUDGET }
        }]
      },
      ...(runtime?.config && typeof runtime.config === "object" && runtime.config.hudAssetName
        ? { hudAssetName: runtime.config.hudAssetName }
        : {})
    }
  };
}

const VERTICE_TEMPESTADE_REGULAR_BUDGET = Object.freeze({
  bgTiles: 1024,
  objTiles: 0,
  oam: 0,
  paletteColors: 256,
  vramBytes: 32768,
  eventBytes: 0,
  audioBytes: 0,
  dmaBytes: 32768,
  vblankTicks: 160,
  cpuWorkTicks: 220
});

function verticeTempestadeShmupRuntime(runtime) {
  return {
    type: "shmup",
    config: {
      playerSpeed: 2,
      fireCooldown: 8,
      scrollSpeed: 1,
      modules: [
        { id: "movement", enabled: true, settings: {} },
        {
          id: "score",
          enabled: true,
          settings: { initialScore: 0, initialLives: 3, persistHighScore: true }
        },
        { id: "waves", enabled: true, settings: { maxWaves: 1, loop: true } },
        { id: "camera", enabled: true, settings: {} }
      ],
      capabilities: [],
      wavePlan: [{ name: "tempestade_inicial", startFrame: 0, playerSpeed: 2, fireCooldown: 8, scrollSpeed: 1 }],
      composition: {
        schema: 1,
        enabled: true,
        mode: "tilemap",
        layers: [{
          id: "shmup-regular-background",
          kind: "regular_bg",
          role: "decorative",
          layer: "BG2",
          enabled: true,
          priority: 2,
          assetId: "porto-lume-shmup-wide-v3.png",
          parallax: { x256: 256, y256: 256 },
          scroll: { x: 0, y: 0 },
          bitmapPage: 0
        }],
        effects: {
          blend: { enabled: false, mode: "none", firstTargets: [], secondTargets: [], eva: 8, evb: 8, intensity: 0 },
          mosaic: { enabled: false, bgX: 0, bgY: 0, objX: 0, objY: 0 },
          window0: { enabled: false, left: 0, right: 240, top: 0, bottom: 160, insideTargets: [], outsideTargets: [] },
          window1: { enabled: false, left: 0, right: 240, top: 0, bottom: 160, insideTargets: [], outsideTargets: [] },
          hblank: { enabled: false, layer: "BG2", hdma: false, scrollOffsets: [] }
        },
        fallback: "error",
        budget: { ...VERTICE_TEMPESTADE_REGULAR_BUDGET }
      },
      resources: {
        schema: 1,
        dependencies: [],
        resources: [{
          id: "shmup-regular-background",
          assetId: "porto-lume-shmup-wide-v3.png",
          kind: "regular_bg",
          enabled: true,
          required: true,
          bpp: 4,
          palette: { id: "shmup-regular-palette", slot: "background", colors: 16 },
          compression: "none",
          tileLimit: 1024,
          resourceGroup: "shmup",
          prefetch: "scene",
          cache: "resident",
          evictionPriority: 0,
          dependencies: [],
          fallback: { mode: "error" },
          budget: { ...VERTICE_TEMPESTADE_REGULAR_BUDGET }
        }]
      },
      ...(runtime?.config && typeof runtime.config === "object" && runtime.config.hudAssetName
        ? { hudAssetName: runtime.config.hudAssetName }
        : {})
    }
  };
}

function verticeRuntime(scene, runtime) {
  if (scene.name === "logo") return verticeLogoCutsceneRuntime(runtime);
  if (scene.name === VERTICE_OPENING_SCENE) return verticeOpeningCutsceneRuntime(runtime);
  if (scene.name === VERTICE_INITIAL_MENU_SCENE) return verticeInitialMenuRuntime(runtime);
  if (scene.name === "farol_interior") {
    return {
      type: "topdown",
      config: {
        ...(runtime?.config ?? {}),
        presentation: "topdown",
        profile: "lighthouse-interior"
      }
    };
  }
  if (scene.name === "affine_lab") {
    return {
      type: "topdown",
      config: {
        ...(runtime?.config ?? {}),
        presentation: "topdown",
        profile: "affine-showcase",
        affine: {
          enabled: true,
          assetId: "affine-showcase-gba.png",
          layer: "BG2",
          scaleX: 1.25,
          scaleY: 1.25,
          rotationDegrees: 12,
          pivotX: 120,
          pivotY: 80,
          wrap: true,
          role: "decorative"
        }
      }
    };
  }
  if (scene.name === "arena_tatica") {
    const tacticalConfig = runtime?.config && typeof runtime.config === "object" ? runtime.config : {};
    return {
      type: "isometric",
      config: {
        tileWidth: 32,
        tileHeight: 16,
        heightStep: 8,
        originX: 120,
        originY: 24,
        presentationZoom: 100,
        profile: "diamond-2to1",
        projection: "diamond",
        movement: "tile",
        heightMode: "levels",
        worldMode: "static_composition",
        gameplayMode: "tactical",
        ...tacticalConfig,
        tactical: {
          ...(tacticalConfig.tactical && typeof tacticalConfig.tactical === "object" ? tacticalConfig.tactical : {}),
          enabled: true,
          activeTeam: "player",
          activeUnitIndex: 0,
          units: [
            { actorIndex: 0, team: "player", moveRange: 2, attackRange: 1, maxHp: 5, attackPower: 2 },
            { actorIndex: 1, team: "enemy", moveRange: 2, attackRange: 1, maxHp: 4, attackPower: 1 }
          ]
        }
      }
    };
  }
  if (POINT_CLICK_SCENE_NAMES.includes(scene.name)) {
    return {
      type: "pointAndClick",
      config: {
        ...(runtime?.config ?? {}),
        cursorSpeed: 2,
        hotspotPadding: 0,
        profile: "source-preserving-candidate"
      }
    };
  }
  if (VERTICE_SUPPORT_SCENES.some((definition) => definition.name === scene.name && scene.name !== "menu_start")) {
    const definition = VERTICE_SUPPORT_SCENES.find((candidate) => candidate.name === scene.name);
    return verticeSupportMenuRuntime(definition, runtime);
  }
  if (scene.name === "titulo") return verticeMenuRuntime(runtime);
  if (scene.name === "menu_start") return verticeStartMenuRuntime(runtime);
  if (scene.name === "prologo") {
    return {
      type: "cutscene",
      config: {
        stepDurationFrames: 150,
        autoAdvance: false,
        nextSceneIndex: -1,
        backgroundIndex: -1,
        steps: [
          {
            id: "prologo-frame-1",
            dialogueKey: "prologo_frame_1",
            backgroundAssetName: "prologue-frame-1-gba.png",
            durationFrames: 150,
            autoAdvance: false,
            skippable: true,
            waitForDialogue: false,
            onSkipEventName: "prologo_partir",
            targetSceneIndex: -1
          },
          {
            id: "prologo-frame-2",
            dialogueKey: "prologo_frame_2",
            backgroundAssetName: "prologue-frame-2-gba.png",
            durationFrames: 150,
            autoAdvance: false,
            skippable: true,
            waitForDialogue: false,
            onSkipEventName: "prologo_partir",
            targetSceneIndex: -1
          },
          {
            id: "prologo-frame-3",
            dialogueKey: "prologo_frame_3",
            backgroundAssetName: "prologue-frame-3-gba.png",
            durationFrames: 150,
            autoAdvance: false,
            skippable: true,
            waitForDialogue: false,
            onSkipEventName: "prologo_partir",
            targetSceneIndex: -1
          },
          {
            id: "prologo-complete",
            dialogueKey: "",
            eventName: "prologo_partir",
            backgroundAssetName: "prologue-frame-3-gba.png",
            durationFrames: 0,
            autoAdvance: false,
            skippable: false,
            waitForDialogue: false,
            onSkipEventName: "",
            targetSceneIndex: -1
          }
        ]
      }
    };
  }
  if (scene.name === "conselho_guardia") {
    return {
      type: "visualNovel",
      config: { ...(runtime?.config ?? {}), autoAdvance: false, nextSceneIndex: -1, backgroundIndex: -1, dialogueKey: "conselho" }
    };
  }
  if (scene.name === "mapa_rota") {
    return {
      type: "worldMap",
      config: {
        unlocked: true,
        hideWhenLocked: false,
        requiredVariable: -1,
        requiredValue: 0,
        targetLevel: -1,
        presentation: "world-map",
        mapMode: "travel",
        nodes: cloneVerticeRouteMapNodes()
      }
    };
  }
  if (scene.name === "guardiao_rele") {
    return { ...runtime, type: "battleRpg", config: { ...(runtime?.config ?? {}), escapeEnabled: false } };
  }
  if (scene.name === "tempestade") {
    return verticeTempestadeShmupRuntime(runtime);
  }
  if (scene.name === "arena_arrancada") {
    return {
      type: "luta",
      config: {
        roundTime: 99,
        roundsToWin: 2,
        maxSuperGauge: 100,
        superGaugeGainOnHit: 8,
        superGaugeGainOnReceive: 4,
        guardPowerRecovery: 2,
        chipDamageEnabled: true,
        airBlockingEnabled: true,
        alphaCounterEnabled: true,
        throwEscapeWindow: 8,
        parryWindow: 4,
        hitstunDecay: 0.85,
        comboLimit: 60,
        vismCustomComboGauge: 100,
        defaultStyle: "a-ism",
        stageId: "arena_arrancada",
        player1StartX: 80,
        player2StartX: 200
      }
    };
  }
  if (scene.name === "circuito_final") {
    const previousConfig = runtime?.config && typeof runtime.config === "object"
      ? runtime.config
      : {};
    const { pseudo3dVisuals: _pseudo3dVisuals, ...topdownConfig } = previousConfig;
    return {
      type: "racing",
      config: {
        ...topdownConfig,
        presentation: "topdown",
        lapsToWin: 3,
        checkpointsPerLap: 3,
        pickupsPerLap: 2,
        rivalSpeed: 3.5,
        roadCurve: 14,
        showMinimap: false,
        topdownTrack: {
          // Keep the three 32x32 racers inside the 240x160 viewport while the
          // compact HUD occupies the upper and lower safe areas of the frame.
          cameraDeadZoneX: 56,
          cameraDeadZoneY: 40,
          checkpoints: [
            { id: "ilha-largada", x: 208, y: 48, width: 64, height: 80 },
            { id: "ilha-ponte", x: 176, y: 144, width: 160, height: 64 },
            { id: "ilha-retorno", x: 352, y: 48, width: 128, height: 96 }
          ]
        },
        trackSegments: [
          { lengthPixels: 128, curve: 0, halfWidth: 48 },
          { lengthPixels: 80, curve: 18, halfWidth: 40 },
          { lengthPixels: 64, curve: 0, halfWidth: 36 },
          { lengthPixels: 48, curve: -18, halfWidth: 40 }
        ],
      }
    };
  }
  return { ...runtime, type: scene.runtime };
}

function verticeRacerAnimation(id, spriteSheet) {
  return {
    id,
    name: "racing",
    spriteSheet,
    frameWidth: 32,
    frameHeight: 32,
    fps: 8,
    loops: true,
    frameCount: 3,
    state: "idle",
    direction: "none",
    colorMode: "4bpp",
    originX: 0,
    originY: 0,
    hitboxX: -8,
    hitboxY: -8,
    hitboxWidth: 16,
    hitboxHeight: 16,
    sourceColorMode: "4bpp",
    frames: [0, 1, 2].map((frameIndex) => ({
      id: `${id}-frame-${frameIndex}`,
      frameIndex,
      sourceFrameIndex: frameIndex,
      width: 32,
      height: 32,
      originX: 0,
      originY: 0,
      tiles: [{
        id: `${id}-frame-${frameIndex}-tile-0`,
        x: -8,
        y: 0,
        sliceX: frameIndex * 32,
        sliceY: 0,
        sourceSheet: spriteSheet,
        tileWidth: 32,
        tileHeight: 32,
        flipX: false,
        flipY: false,
        objPalette: "OBP0",
        paletteIndex: 0,
        priority: false
      }]
    }))
  };
}

function verticeRacerState(id, spriteSheet, animationID) {
  return {
    id,
    name: "default",
    spriteSheet,
    animationType: "fixed",
    mirrorLeftFromRight: false,
    animationIDs: [animationID]
  };
}

// RGB555 union of the 12 approved logo PNGs; index 0 is OBJ transparency.
const VERTICE_TITLE_LOGO_PALETTE = Object.freeze([
  0, 4160, 6242, 6711, 7264, 8958, 10047, 10434,
  11626, 12095, 16021, 21341, 22431, 23254, 26525, 27615
]);

function replaceVerticeShowcaseAssets(projectAssets) {
  const declaredAssets = Array.isArray(projectAssets) ? projectAssets : [];
  const declaredNames = new Set(declaredAssets
    .map((asset) => asset?.name)
    .filter((name) => typeof name === "string"));
  const showcaseAssets = [
    ...VERTICE_IN_GAME_MENU_ASSETS,
    ...VERTICE_NARRATIVE_ASSETS,
    ...VERTICE_PORT_LUMEN_TOPDOWN_ASSETS,
    ...VERTICE_PENEDOS_PLATFORMER_ASSETS,
    ...VERTICE_EXPLORATION_ASSETS,
    ...VERTICE_OFICINA_POINT_CLICK_ASSETS,
    ...VERTICE_CLIMAX_ASSETS,
    ...VERTICE_FARM_REFERENCE_ASSETS,
    ...VERTICE_RACING_ASSETS,
    ...VERTICE_AFFINE_ASSETS
  ].filter((asset) => declaredNames.has(asset.name));
  const preparedShowcaseAssets = showcaseAssets.map((asset) => asset.kind === "Sprite"
    ? {
      ...asset,
      metadata: {
        ...(asset.metadata ?? {}),
        colorMode: "4bpp",
        storageFormat: String(asset.metadata?.generatedBy ?? "").startsWith("porto-player-scale-v") ? "rgba-4bpp-compatible" : "indexed-4bpp",
        transparentIndex: asset.metadata?.transparentIndex ?? 0,
        preparedBy: String(asset.metadata?.generatedBy ?? "").startsWith("porto-player-scale-v") ? asset.metadata.generatedBy : "sprite-library-4bpp-v1"
      }
    }
    : asset);
  const preparedByName = new Map(preparedShowcaseAssets.map((asset) => [asset.name, asset]));
  return declaredAssets.map((asset) => {
    const prepared = preparedByName.get(asset?.name);
    if (!prepared) return asset;
    return {
      ...prepared,
      ...asset,
      metadata: {
        ...(prepared.metadata ?? {}),
        ...(asset.metadata ?? {})
      }
    };
  });
}

function replaceRecordsByKey(records, replacements, key, removedKeys = new Set()) {
  const replacementByKey = new Map(replacements.map((record) => [record[key], record]));
  const applied = new Set();
  const result = [];
  for (const record of records) {
    const recordKey = record?.[key];
    if (removedKeys.has(recordKey)) continue;
    const replacement = replacementByKey.get(recordKey);
    if (replacement) {
      result.push(replacement);
      applied.add(recordKey);
    } else {
      result.push(record);
    }
  }
  return [
    ...result,
    ...replacements.filter((record) => !applied.has(record[key]))
  ];
}

const VERTICE_MARKET_SUSPENSO_CANDIDATE_ACTOR_ASSETS = Object.freeze([
  ["merchant", "6b6277d93963316b7bb2b7ef5dce6827c89c3cb102c5e9d1742ab75e2bac6ceb", "b059452680c51baff42e6ad0619a790bbcb9aa1b657ada5560f0ce780509684c"],
  ["guard", "a170eccdb58837901ab764f1e66040cd3e5a39f13b92d70e0599e3360bedd525", "ad60c2078b9f408871b16f8fd426095c79bc3ca8790d430949ad3a312c0abc34"]
].map(([role, sourceSha256, preparedSha256]) => ({
  id: `market-${role}-isometric-v1-idle`, kind: "Sprite", name: `market-${role}-isometric-v1-idle.png`, systemImage: "person.2",
  metadata: {
    source: `Assets/sprites/market-${role}-isometric-v1-idle.png`,
    sourceApprovedSheet: `tools/gba-sprite-prep/production/mercado-suspenso-isometrica-v1-approved/sources/market-${role}-48x64-8views-4bpp-candidate.png`,
    sourceSha256, preparedSha256, sourceFrameIndex: 0,
    provenance: "Vista 01 da folha de oito vistas enviada para a composição isométrica do Mercado Suspenso; NPC estático.",
    generatedBy: "market-isometric-v1-view-01-promotion",
    preparedBy: "market-isometric-v1-view-01-promotion", role: "market-npc",
    sceneRoles: ["market-npc", "market-isometric-actors"], profile: "isometric",
    visualProfile: "gba_neutral_cohesive_pixel_art_mid_high_isometric_market",
    colorMode: "4bpp", storageFormat: "indexed-4bpp", transparentIndex: 0,
    width: 48, height: 64, packedWidth: 48, packedHeight: 64,
    frameWidth: 48, frameHeight: 64, frameCount: 1, logicalSourceFrameCount: 1,
    anchor: "bottom-center", maxVisibleColors: 15,
    hardwareObjectsPerFrame: 3, tilesPerFrame: 48,
    reviewStatus: "approved", assetcReviewed: true, assetcStatus: "safe",
    technicalStatus: "resident-with-nara-and-market-npcs", gbStudioResourceType: "sprite"
  }
})));

const VERTICE_MARKET_SUSPENSO_PLAYER_ASSET = Object.freeze({
  id: "market-adventurer-isometric-v1-idle", kind: "Sprite",
  name: "market-adventurer-isometric-v1-idle.png", systemImage: "figure.walk",
  metadata: {
    source: "Assets/sprites/market-adventurer-isometric-v1-idle.png",
    sourceApprovedSheet: "tools/gba-sprite-prep/production/mercado-suspenso-isometrica-v1-approved/sources/market-adventurer-48x64-8views-4bpp-candidate.png",
    sourceSha256: "fc6276d73c37464d7da28df888b37d168e166f75eaa5d2fb4b9bf194d699af37",
    preparedSha256: "e91f77ea1d6d72ff4b80d339c357d31f63fe6f567f2c82237b007b8281928579",
    sourceFrameIndex: 0,
    provenance: "Vista 01 exata da folha de oito vistas fornecida para o player do Mercado; movimento sem ciclo de caminhada novo.",
    generatedBy: "market-isometric-v1-view-01-promotion",
    preparedBy: "market-isometric-v1-view-01-promotion",
    role: "market-player", sceneRoles: ["market-player", "market-isometric-actors"],
    profile: "isometric", visualProfile: "gba_neutral_cohesive_pixel_art_mid_high_isometric_market",
    colorMode: "4bpp", storageFormat: "indexed-4bpp", transparentIndex: 0,
    width: 48, height: 64, packedWidth: 48, packedHeight: 64,
    frameWidth: 48, frameHeight: 64, frameCount: 1, logicalSourceFrameCount: 1,
    anchor: "bottom-center", maxVisibleColors: 15,
    hardwareObjectsPerFrame: 3, tilesPerFrame: 48,
    reviewStatus: "approved", assetcReviewed: true, assetcStatus: "safe",
    technicalStatus: "resident-with-market-npcs", gbStudioResourceType: "sprite"
  }
});

export function promoteApprovedMarketSuspensoActors(project) {
  return promoteMarketAdventure(project);
}

export function promoteApprovedPortLumenAssets(project) {
  return {
    ...project,
    assets: (project?.assets ?? []).filter((asset) => !VERTICE_PORT_LUMEN_ASSET_NAMES.has(asset?.name)),
    animations: (project?.animations ?? []).filter((animation) => (
      !VERTICE_PORT_LUMEN_ASSET_NAMES.has(animation?.spriteSheet)
      && !VERTICE_REPLACED_NARRATIVE_ANIMATION_IDS.has(animation?.id)
    )),
    animationStates: (project?.animationStates ?? []).filter((state) => !VERTICE_PORT_LUMEN_ASSET_NAMES.has(state?.spriteSheet)),
    actors: (project?.actors ?? []).filter((actor) => actor?.roomName !== "porto_lumen")
  };
}

function approvedPortLumenScene(scene) {
  const width = 60;
  const height = 40;
  const tileCount = width * height;
  const collisionTypes = portLumenCollisionTypes(width, height);
  return {
    ...scene,
    width,
    height,
    backgroundAssetName: "porto-lume-exterior-topdown-gba.png",
    backgroundRenderMode: "tilemap",
    gbStudioUseBackgroundLayout: true,
    cameraMode: "follow_player",
    cameraBounds: { x: 0, y: 0, width, height },
    playerActorName: "Nara",
    runtime: {
      ...(scene?.runtime && typeof scene.runtime === "object" ? scene.runtime : {}),
      type: "topdown",
      config: {
        ...(scene?.runtime?.config && typeof scene.runtime.config === "object" ? scene.runtime.config : {}),
        presentation: "topdown",
        profile: "port-lumen-topdown-v1"
      }
    },
    tilemap: Array.from({ length: tileCount }, () => 0),
    collisionTypes,
    collisions: [...collisionTypes]
  };
}

function approvedTempestadeShmupScene(scene) {
  const width = 90;
  const height = 20;
  const collisionTypes = Array.from({ length: width * height }, () => "free");
  return {
    ...scene,
    width,
    height,
    backgroundAssetName: "porto-lume-shmup-wide-v3.png",
    backgroundRenderMode: "tilemap",
    gbStudioUseBackgroundLayout: true,
    cameraMode: "follow_player",
    cameraBounds: { x: 0, y: 0, width, height },
    parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
    tilemap: Array.from({ length: width * height }, () => 0),
    collisionTypes,
    collisions: [...collisionTypes],
    tileLayers: []
  };
}

function portLumenCollisionTypes(width = 60, height = 40) {
  const collisionTypes = Array.from({ length: width * height }, () => "solid");
  const cellIndex = (x, y) => y * width + x;
  const set = (x, y, type) => {
    if (x >= 0 && x < width && y >= 0 && y < height) collisionTypes[cellIndex(x, y)] = type;
  };
  const fill = (x0, y0, x1, y1, type = "free") => {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) set(x, y, type);
    }
  };

  // Áreas de terra e caminhos da composição exterior 480×320.
  fill(5, 8, 20, 13);
  fill(14, 10, 55, 28);
  fill(8, 22, 55, 30);
  fill(22, 30, 37, 38);
  fill(39, 8, 56, 15);

  // Torre, casas e objetos estruturais permanecem sólidos.
  fill(7, 2, 15, 7, "solid");
  fill(40, 13, 52, 20, "solid");
  fill(10, 8, 13, 10, "free");
  fill(46, 20, 48, 22, "free");
  for (let x = 0; x < width; x += 1) {
    set(x, 0, "solid");
    set(x, height - 1, "solid");
  }
  for (let y = 0; y < height; y += 1) {
    set(0, y, "solid");
    set(width - 1, y, "solid");
  }

  // Água identificada no candidato 480×320; a faixa do píer é reaberta logo
  // abaixo para continuar sendo a passagem jogável até a saída.
  const visualWaterSpans = [
    [1, [[17, 17]]], [2, [[18, 18]]], [3, [[4, 6]]], [4, [[4, 5]]],
    [10, [[2, 3]]], [12, [[4, 4]]], [13, [[5, 5]]], [14, [[5, 5]]],
    [15, [[2, 2], [4, 5]]], [16, [[2, 4], [6, 8]]], [17, [[10, 10]]],
    [22, [[7, 7]]], [23, [[1, 1], [6, 6]]], [24, [[2, 3], [5, 5]]],
    [27, [[6, 10]]], [28, [[28, 29], [31, 32]]], [29, [[28, 28]]],
    [30, [[27, 27]]], [31, [[21, 22], [27, 27]]],
    [32, [[9, 9], [27, 27], [38, 38]]],
    [33, [[9, 9], [27, 27], [31, 31], [37, 37], [44, 45], [57, 58]]],
    [34, [[2, 5], [7, 8], [31, 31], [44, 45], [56, 56]]],
    [35, [[4, 7], [55, 55]]], [36, [[49, 50], [55, 55]]],
    [37, [[10, 10], [18, 18], [31, 31], [50, 54], [56, 58]]],
    [38, [[11, 17], [23, 23], [25, 26], [28, 29], [31, 31], [46, 46], [52, 52]]],
    [39, [[12, 13], [15, 16], [21, 22], [24, 24], [27, 30], [44, 44], [51, 51]]]
  ];
  for (const [y, spans] of visualWaterSpans) {
    for (const [x0, x1] of spans) fill(x0, y, x1, y, "solid");
  }

  // Os pontos dos atores aprovados e a saída permanecem acessíveis.
  for (const [x, y] of [
    [25, 18], [19, 19], [42, 12], [48, 9], [22, 21], [18, 25], [7, 10]
  ]) set(x, y, "free");
  fill(22, 35, 24, 37, "free");
  set(30, 35, "free");
  return collisionTypes;
}

function farolInteriorCollisionTypes(width = 45, height = 30) {
  const collisionTypes = Array.from({ length: width * height }, () => "solid");
  const cellIndex = (x, y) => y * width + x;
  const set = (x, y, type) => {
    if (x >= 0 && x < width && y >= 0 && y < height) collisionTypes[cellIndex(x, y)] = type;
  };
  const fill = (x0, y0, x1, y1, type = "free") => {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) set(x, y, type);
    }
  };

  // Piso circular da sala, com margem estrutural de duas células.
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2) - 1;
  const radiusX = Math.floor(width * 0.4);
  const radiusY = Math.floor(height * 0.43);
  for (let y = 2; y < height - 2; y += 1) {
    const normalized = (y - centerY) / radiusY;
    const half = Math.floor(radiusX * Math.sqrt(Math.max(0, 1 - normalized * normalized)));
    fill(centerX - half + 2, y, centerX + half - 2, y, "free");
  }
  fill(centerX - 2, height - 5, centerX + 2, height - 1, "free");

  // Lente, escada e bancadas ocupam o centro e o perímetro da sala.
  fill(19, 3, 25, 8, "solid");
  fill(18, 13, 26, 21, "solid");
  fill(7, 14, 14, 19, "solid");
  fill(31, 6, 38, 13, "solid");

  // Células de atores e aproximação da lente.
  set(11, 9, "free");
  fill(19, 8, 25, 10, "free");
  fill(20, 25, 24, 29, "free");
  for (let x = 0; x < width; x += 1) {
    set(x, 0, "solid");
    set(x, height - 1, "solid");
  }
  for (let y = 0; y < height; y += 1) {
    set(0, y, "solid");
    set(width - 1, y, "solid");
  }
  fill(20, 26, 24, 29, "free");
  return collisionTypes;
}

function approvedRouteMapScene(scene) {
  return {
    ...scene,
    backgroundAssetName: "route-map-gba.png",
    backgroundRenderMode: "tilemap",
    gbStudioUseBackgroundLayout: true,
    runtime: {
      ...(scene?.runtime && typeof scene.runtime === "object" ? scene.runtime : {}),
      type: "worldMap",
      config: {
        ...(scene?.runtime?.config && typeof scene.runtime.config === "object" ? scene.runtime.config : {}),
        presentation: "world-map",
        profile: "route-map-v6-approved"
      }
    }
  };
}

const VERTICE_PENEDOS_LAYER_ASSETS = Object.freeze({
  BG3: "penedos-sky-sea-bg3.png",
  BG2: "penedos-terrain-bg2.png",
  BG1: "penedos-foreground-bg1.png",
  BG0: ""
});

const VERTICE_PENEDOS_PLATFORMER_LAYER_ASSETS = Object.freeze({
  BG2: "penedos-platformer-v2-gba.png",
  RUNTIME_COMPOSITE: "penedos-platformer-v2-gba.png"
});

function penedosPlatformerCollisionTypes(width = 30, height = 20) {
  const collisionTypes = Array.from({ length: width * height }, () => "free");
  const cellIndex = (x, y) => y * width + x;
  const set = (x, y, type) => {
    if (x >= 0 && x < width && y >= 0 && y < height) collisionTypes[cellIndex(x, y)] = type;
  };
  const fill = (x0, y0, x1, y1, type) => {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) set(x, y, type);
    }
  };

  // The approved v2 composition is a single 240×160 screen. The bottom row
  // is a safety floor outside the authored silhouette; visible ledges use the
  // same 8px grid as the background and keep the player on-screen.
  fill(0, 19, 29, 19, "solid");
  fill(0, 14, 8, 14, "solid");
  fill(0, 15, 8, 15, "solid");
  fill(10, 10, 18, 10, "down");
  fill(10, 11, 18, 11, "solid");
  fill(17, 9, 24, 9, "down");
  fill(17, 10, 24, 10, "solid");
  fill(21, 14, 29, 14, "solid");
  fill(21, 15, 29, 15, "solid");
  // The module trigger remains part of the campaign flow, now placed on the
  // right ledge of the new composition.
  set(25, 13, "event");
  return collisionTypes;
}

function approvedPenedosPlatformerScene(scene) {
  const width = 30;
  const height = 20;
  const tileCount = width * height;
  const collisionTypes = penedosPlatformerCollisionTypes(width, height);
  const { paletteFamilyID: _legacyPaletteFamilyID, ...sceneWithoutPaletteOverride } = scene;
  return {
    ...sceneWithoutPaletteOverride,
    width,
    height,
    cameraBounds: { x: 0, y: 0, width, height },
    backgroundAssetName: VERTICE_PENEDOS_PLATFORMER_LAYER_ASSETS.BG2,
    runtimeBaseBackgroundAssetName: VERTICE_PENEDOS_PLATFORMER_LAYER_ASSETS.RUNTIME_COMPOSITE,
    runtimeCompositeBackgroundAssetName: VERTICE_PENEDOS_PLATFORMER_LAYER_ASSETS.RUNTIME_COMPOSITE,
    backgroundRenderMode: "tilemap",
    gbStudioUseBackgroundLayout: true,
    cameraMode: "follow_player",
    playerActorName: "Nara · Penedos",
    parallax: { mode: "none", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
    tilemap: Array.from({ length: tileCount }, () => 0),
    collisionTypes,
    collisions: [...collisionTypes],
    tileLayers: [{
      mapping: "BG2",
      tilemap: Array.from({ length: tileCount }, () => 0),
      tileSourceAssetNames: Array.from({ length: tileCount }, () => VERTICE_PENEDOS_PLATFORMER_LAYER_ASSETS.BG2)
    }]
  };
}

function approvedPenedosLayeredScene(scene) {
  const width = Math.max(1, Number(scene?.width) || 1);
  const height = Math.max(1, Number(scene?.height) || 1);
  const tileCount = width * height;
  return {
    ...scene,
    backgroundAssetName: VERTICE_PENEDOS_LAYER_ASSETS.BG2,
    backgroundRenderMode: "tilemap",
    gbStudioUseBackgroundLayout: true,
    parallax: { mode: "bg3", offsetX: 0, offsetY: 0, speedX: 128, speedY: 256 },
    tileLayers: ["BG3", "BG2", "BG1", "BG0"].map((mapping) => ({
      mapping,
      tilemap: Array.from({ length: tileCount }, () => mapping === "BG0" ? -1 : 0),
      tileSourceAssetNames: Array.from({ length: tileCount }, () => VERTICE_PENEDOS_LAYER_ASSETS[mapping])
    }))
  };
}

export function promoteApprovedPenedosLayeredAssets(project) {
  const promoteCollection = (records) => Array.isArray(records)
    ? records.map((record) => record?.name === "penedos_vento" ? approvedPenedosLayeredScene(record) : record)
    : records;
  return {
    ...project,
    assets: replaceRecordsByKey(
      project?.assets ?? [],
      VERTICE_PENEDOS_LAYERED_ASSETS,
      "name",
      new Set(["cliffs-gba.png"])
    ),
    scenas: promoteCollection(project?.scenas),
    rooms: promoteCollection(project?.rooms)
  };
}

const VERTICE_OFICINA_POINT_CLICK_ASSETS = Object.freeze([
  {
    id: "oficina-background", kind: "Background", name: "oficina-gba.png", systemImage: "wrench.and.screwdriver",
    metadata: {
      source: "Assets/backgrounds/oficina-gba.png",
      provenance: "Background point-and-click aprovado da Oficina, com gaveteiro aberto à esquerda, estabilizador na bancada central, porta à direita e piso livre para o cursor",
      generatedBy: "oficina-point-click-background-v5",
      role: "workshop-point-click-bg",
      sceneRoles: ["workshop-point-click-bg", "point-click-hotspot-art"],
      profile: "pointAndClick",
      colorMode: "4bpp",
      visualProfile: "gba_neutral_cohesive_pixel_art_low_detail_point_click",
      width: 240,
      height: 160,
      reviewStatus: "approved"
    }
  },
  {
    id: "oficina-cursor", kind: "Sprite", name: "oficina-cursor.png", systemImage: "cursorarrow",
    metadata: {
      source: "Assets/sprites/oficina-cursor.png",
      provenance: "Cursor de seta com estados idle e hover para hotspots da Oficina",
      generatedBy: "oficina-point-click-cursor-v2",
      role: "workshop-cursor",
      sceneRoles: ["workshop-cursor", "point-click-player"],
      profile: "pointAndClick",
      frameWidth: 16,
      frameHeight: 16,
      frameCount: 2,
      colorMode: "4bpp",
      storageFormat: "indexed-4bpp",
      transparentIndex: 0,
      visibleColorBudget: 15,
      visualProfile: "gba_neutral_cohesive_pixel_art_mid_high_point_click",
      reviewStatus: "approved"
    }
  },
  {
    id: "oficina-mechanic", kind: "Sprite", name: "oficina-mechanic.png", systemImage: "person.crop.circle",
    metadata: {
      source: "Assets/sprites/oficina-mechanic.png",
      provenance: "Mecânica de Lúmen reutilizada do ator aprovado do Porto, em folha 96x32 com seis poses 16x32",
      generatedBy: "port-lumen-mechanic-approved",
      role: "workshop-mechanic",
      sceneRoles: ["workshop-mechanic", "point-click-hotspot-actor"],
      profile: "pointAndClick",
      frameWidth: 16,
      frameHeight: 32,
      frameCount: 6,
      colorMode: "4bpp",
      storageFormat: "rgba-4bpp-compatible",
      transparentIndex: 0,
      visibleColorBudget: 15,
      visualProfile: "gba_neutral_cohesive_pixel_art_low_detail_point_click",
      reviewStatus: "approved"
    }
  },
  {
    id: "oficina-stabilizer", kind: "Sprite", name: "oficina-stabilizer.png", systemImage: "wrench.and.screwdriver.fill",
    metadata: {
      source: "Assets/sprites/oficina-stabilizer.png",
      provenance: "Estabilizador instalado aprovado em OBJ único 32x32, com transparência binária e paleta reduzida",
      generatedBy: "oficina-stabilizer-approved-v1",
      role: "workshop-stabilizer",
      sceneRoles: ["workshop-stabilizer", "point-click-state-actor"],
      profile: "pointAndClick",
      frameWidth: 32,
      frameHeight: 32,
      frameCount: 1,
      colorMode: "4bpp",
      storageFormat: "rgba-4bpp-compatible",
      transparentIndex: 0,
      visibleColorBudget: 15,
      visualProfile: "gba_neutral_cohesive_pixel_art_low_detail_point_click",
      reviewStatus: "approved"
    }
  }
]);

function oficinaPointClickCollisionTypes(width = 30, height = 20) {
  // Point-and-click usa hotspots independentes da pintura de colisão. Deixar
  // a grade livre evita pintar móveis como paredes no editor e mantém o cursor
  // governado pela área de navegação do runtime.
  return Array.from({ length: width * height }, () => "free");
}

function approvedOficinaPointClickScene(scene) {
  const width = 30;
  const height = 20;
  const collisionTypes = oficinaPointClickCollisionTypes(width, height);
  return {
    ...scene,
    width,
    height,
    backgroundAssetName: "oficina-gba.png",
    backgroundRenderMode: "tilemap",
    gbStudioUseBackgroundLayout: true,
    tilemap: Array.from({ length: width * height }, () => 0),
    collisionTypes,
    collisions: [...collisionTypes],
    tileLayers: [],
    playerActorName: "Cursor da Oficina"
  };
}

function marketSuspensoCollisionTypes(width = 40, height = 30) {
  const collisionTypes = Array.from({ length: width * height }, () => "solid");
  const cellIndex = (x, y) => y * width + x;
  const set = (x, y, type = "free") => {
    if (x >= 0 && x < width && y >= 0 && y < height) collisionTypes[cellIndex(x, y)] = type;
  };
  const fill = (x0, y0, x1, y1, type = "free") => {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) set(x, y, type);
    }
  };

  // Main market deck. The outer cells remain solid so the modular atlas can
  // show a readable limestone drop around the walkable surface.
  fill(8, 6, 31, 24);
  fill(24, 2, 35, 10);
  fill(12, 7, 18, 10);
  fill(16, 14, 19, 16);

  // A narrow cargo bridge connects the lower deck to the upper route.
  fill(20, 12, 28, 15);
  set(24, 14, "event");

  // A small raised market platform gives the initial viewport a readable
  // height transition instead of presenting only one uninterrupted deck.
  set(19, 17, "slope_up_right");

  // The upper route is a two-step ascent: lower deck -> intermediate ramp ->
  // level-two deck. A slope must live on the higher destination cell, in the
  // same direction used by move_iso_actor_by_free_delta.
  set(24, 10, "slope_up_right");
  set(25, 10, "slope_up_right");

  // The trader's level-two platform follows the same explicit 0 -> 1 -> 2
  // contract. This keeps the authored grid, free movement and Play aligned.
  set(11, 9, "slope_up_right");
  set(12, 9, "slope_up_right");
  // The smaller central platform remains accessible from both natural
  // approaches instead of displaying decorative but unusable stairs.
  set(16, 14, "slope_up_right");
  set(19, 14, "slope_up_left");
  set(31, 1, "event");
  set(32, 1, "event");
  set(31, 2, "event");
  set(32, 2, "event");
  // Props occupy cells on top of the deck, not the water around it.
  for (const [x, y] of [
    [12, 10], [27, 8], [14, 20], [27, 20], [24, 6], [10, 6], [29, 10]
  ]) set(x, y, "solid");
  return collisionTypes;
}

function marketSuspensoHeightLevels(width = 40, height = 30) {
  const heightLevels = Array.from({ length: width * height }, () => 0);
  const set = (x, y, level) => {
    if (x >= 0 && x < width && y >= 0 && y < height) heightLevels[y * width + x] = level;
  };
  for (let y = 2; y <= 10; y += 1) {
    for (let x = 24; x <= 35; x += 1) set(x, y, 2);
  }
  for (let y = 7; y <= 10; y += 1) {
    for (let x = 12; x <= 18; x += 1) set(x, y, 2);
  }
  for (let y = 14; y <= 16; y += 1) {
    for (let x = 16; x <= 19; x += 1) set(x, y, 1);
  }
  set(11, 9, 1);
  set(12, 9, 2);
  set(16, 14, 1);
  set(19, 14, 1);
  // Keep the ramp destinations explicit at the height they reach.
  set(24, 10, 1);
  set(25, 10, 2);
  set(19, 17, 1);
  return heightLevels;
}

const MARKET_SUSPENSO_TILE = Object.freeze({
  floorLight: 1,
  floorMoss: 2,
  water: 3,
  wood: 4,
  blockLow: 5,
  blockTall: 6,
  stairsRight: 7,
  stairsLeft: 8,
  bridge: 14
});

const MARKET_SUSPENSO_PROP_TILE = Object.freeze({
  // O runtime trata os IDs do mapa como 1-based: ID 1 aponta para o slot 0
  // do atlas. Os props ocupam os slots 8..14 do atlas aprovado.
  stallTeal: 9,
  stallOchre: 10,
  crates: 11,
  barrels: 12,
  ropeRail: 13,
  lantern: 15
});

function marketSuspensoVisualTiles(width = 40, height = 30) {
  const collisionTypes = marketSuspensoCollisionTypes(width, height);
  const heightLevels = marketSuspensoHeightLevels(width, height);
  const tiles = Array.from({ length: width * height }, () => MARKET_SUSPENSO_TILE.water);
  const index = (x, y) => y * width + x;
  const isInBounds = (x, y) => x >= 0 && x < width && y >= 0 && y < height;
  const isWalkable = (x, y) => {
    if (!isInBounds(x, y)) return false;
    const type = collisionTypes[index(x, y)];
    return type === "free" || type === "event" || type === "slope_up_right" || type === "slope_up_left";
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = index(x, y);
      const collisionType = collisionTypes[cell];
      const adjacentWalkable = isWalkable(x + 1, y)
        || isWalkable(x - 1, y)
        || isWalkable(x, y + 1)
        || isWalkable(x, y - 1);
      if (collisionType === "slope_up_right") {
        tiles[cell] = MARKET_SUSPENSO_TILE.stairsRight;
      } else if (collisionType === "slope_up_left") {
        tiles[cell] = MARKET_SUSPENSO_TILE.stairsLeft;
      } else if (x >= 20 && x <= 28 && y >= 12 && y <= 15) {
        tiles[cell] = MARKET_SUSPENSO_TILE.bridge;
      } else if (collisionType === "solid" && adjacentWalkable) {
        tiles[cell] = heightLevels[cell] > 0
          ? MARKET_SUSPENSO_TILE.blockTall
          : MARKET_SUSPENSO_TILE.blockLow;
      } else if (x >= 16 && x <= 19 && y >= 14 && y <= 16 && isWalkable(x, y)) {
        tiles[cell] = MARKET_SUSPENSO_TILE.wood;
      } else if (isWalkable(x, y)) {
        tiles[cell] = heightLevels[cell] >= 2
          ? MARKET_SUSPENSO_TILE.floorMoss
          : (x * 3 + y * 5) % 5 === 0
            ? MARKET_SUSPENSO_TILE.floorMoss
            : MARKET_SUSPENSO_TILE.floorLight;
      } else if (
        isWalkable(x + 1, y) || isWalkable(x - 1, y) || isWalkable(x, y + 1) || isWalkable(x, y - 1)
      ) {
        tiles[cell] = MARKET_SUSPENSO_TILE.blockLow;
      }
    }
  }
  return tiles;
}

function marketSuspensoTileLayers(width = 40, height = 30) {
  const tileCount = width * height;
  const visualTiles = marketSuspensoVisualTiles(width, height);
  const heightLevels = marketSuspensoHeightLevels(width, height);
  const emptyLayer = Array.from({ length: tileCount }, () => -1);
  const overlayTiles = visualTiles.map((tile, index) => {
    const elevated = heightLevels[index] > 0;
    const detailCell = (index % width + Math.floor(index / width)) % 7 === 0;
    return elevated && detailCell ? tile : -1;
  });
  const props = new Map([
    [10 * width + 12, MARKET_SUSPENSO_PROP_TILE.stallTeal],
    [8 * width + 27, MARKET_SUSPENSO_PROP_TILE.stallOchre],
    [20 * width + 14, MARKET_SUSPENSO_PROP_TILE.crates],
    [20 * width + 27, MARKET_SUSPENSO_PROP_TILE.barrels],
    [6 * width + 24, MARKET_SUSPENSO_PROP_TILE.ropeRail],
    [6 * width + 25, MARKET_SUSPENSO_PROP_TILE.ropeRail],
    [6 * width + 26, MARKET_SUSPENSO_PROP_TILE.ropeRail],
    [6 * width + 29, MARKET_SUSPENSO_PROP_TILE.lantern],
    [7 * width + 30, MARKET_SUSPENSO_PROP_TILE.ropeRail],
    [9 * width + 30, MARKET_SUSPENSO_PROP_TILE.ropeRail]
  ]);
  for (const [index, tile] of props) {
    if (index >= 0 && index < overlayTiles.length) overlayTiles[index] = tile;
  }
  const tileSourceAssetNames = Array.from(
    { length: tileCount },
    () => "mercado-suspenso-tileset-v4-gba.png"
  );
  return [
    { mapping: "BG3", tilemap: emptyLayer, tileSourceAssetNames },
    { mapping: "BG2", tilemap: visualTiles, tileSourceAssetNames },
    { mapping: "BG1", tilemap: overlayTiles, tileSourceAssetNames },
    { mapping: "BG0", tilemap: emptyLayer, tileSourceAssetNames }
  ];
}

function usinaDungeonCollisionTypes(width = 30, height = 20) {
  const collisionTypes = Array.from({ length: width * height }, () => "solid");
  const open = (x, y) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      collisionTypes[y * width + x] = "free";
    }
  };

  // Corredor central, galeria transversal e antecamara superior.
  for (let y = 3; y <= 18; y += 1) {
    for (let x = 12; x <= 18; x += 1) open(x, y);
  }
  for (let y = 8; y <= 11; y += 1) {
    for (let x = 9; x <= 20; x += 1) open(x, y);
  }
  for (let x = 13; x <= 17; x += 1) open(x, 19);
  return collisionTypes;
}

const USINA_PLAYER_START_BY_PHASE = Object.freeze({
  exploration: Object.freeze({ x: 14, y: 6, direction: "up" }),
  combat: Object.freeze({ x: 14, y: 6, direction: "up" }),
  exit: Object.freeze({ x: 17, y: 5, direction: "up" })
});

function approvedUsinaBackgroundScene(scene, phase = "exploration") {
  const width = 30;
  const height = 20;
  const collisionTypes = usinaDungeonCollisionTypes(width, height);
  const modules = phase === "combat"
    ? [
      { id: "movement", enabled: true, settings: { depthSprites: true } },
      { id: "dialogue", enabled: true, settings: {} },
      {
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
      },
      { id: "compass", enabled: true, settings: {} },
      { id: "camera", enabled: true, settings: {} }
    ]
    : phase === "exit"
      ? [
        { id: "movement", enabled: true, settings: { depthSprites: true } },
        { id: "dialogue", enabled: true, settings: {} },
        { id: "inventory", enabled: true, settings: { item: 2, label: "CÉLULA", initialQuantity: 0, healAmount: 1 } },
        { id: "compass", enabled: true, settings: {} },
        { id: "map", enabled: true, settings: {} },
        { id: "camera", enabled: true, settings: {} }
      ]
      : [
        { id: "movement", enabled: true, settings: { depthSprites: true } },
        { id: "dialogue", enabled: true, settings: {} },
        { id: "compass", enabled: true, settings: {} },
        { id: "map", enabled: true, settings: {} },
        { id: "camera", enabled: true, settings: {} }
      ];
  return {
    ...scene,
    width,
    height,
    backgroundAssetName: "usina-submersa-gba.png",
    backgroundRenderMode: "tilemap",
    gbStudioUseBackgroundLayout: true,
    cameraMode: "fixed_center",
    cameraZoom: 100,
    cameraBounds: { x: 0, y: 0, width, height },
    tilemap: Array.from({ length: width * height }, () => 0),
    collisions: [...collisionTypes],
    collisionTypes,
    tileLayers: [],
    playerActorName: "",
    runtime: {
      ...(scene?.runtime && typeof scene.runtime === "object" ? scene.runtime : {}),
      type: "dungeonCrawler",
      config: {
        ...(scene?.runtime?.config && typeof scene.runtime.config === "object" ? scene.runtime.config : {}),
        profile: `usina-submersa-${phase}-v2`,
        playerStart: USINA_PLAYER_START_BY_PHASE[phase] ?? USINA_PLAYER_START_BY_PHASE.exploration,
        modules
      }
    }
  };
}

function approvedMarketSuspensoScene(scene) {
  const width = 40;
  const height = 30;
  const collisionTypes = marketSuspensoCollisionTypes(width, height);
  const sceneWithoutLegacyBackgroundReference = Object.fromEntries(
    Object.entries(scene).filter(([key]) => key !== "backgroundReferenceAssetName")
  );
  return {
    ...sceneWithoutLegacyBackgroundReference,
    width,
    height,
    // A cena é montada pelo atlas modular. O PNG 240×160 permanece no projeto
    // como referência visual separada, mas não participa do render do runtime.
    backgroundAssetName: "mercado-suspenso-tileset-v4-gba.png",
    tilesetAssetName: "mercado-suspenso-tileset-v4-gba.png",
    backgroundRenderMode: "tilemap",
    gbStudioUseBackgroundLayout: false,
    cameraMode: "follow_player",
    playerActorName: "Aventureiro · Mercado",
    tilemap: marketSuspensoVisualTiles(width, height),
    collisionTypes,
    collisions: [...collisionTypes],
    tileLayers: marketSuspensoTileLayers(width, height),
    heightLevels: marketSuspensoHeightLevels(width, height),
    // Cada trecho do mapa mantém o viewport dentro do conjunto de plataformas
    // que o jogador está explorando. O zoom continua fixo no perfil isométrico;
    // estas zonas só trocam os limites de câmera entre deck, ponte e níveis altos.
    cameraZones: [
      {
        area: { x: 24, y: 12, width: 9, height: 4 },
        bounds: { x: 176, y: 256, width: 224, height: 160 },
        offset: { x: 0, y: 0 },
        lockX: false,
        lockY: false
      },
      {
        area: { x: 24, y: 1, width: 12, height: 10 },
        bounds: { x: 320, y: 192, width: 368, height: 216 },
        offset: { x: 0, y: 0 },
        lockX: false,
        lockY: false
      },
      {
        area: { x: 12, y: 7, width: 4, height: 4 },
        bounds: { x: 120, y: 128, width: 160, height: 120 },
        offset: { x: 0, y: 0 },
        lockX: false,
        lockY: false
      },
      {
        area: { x: 16, y: 14, width: 4, height: 3 },
        bounds: { x: 88, y: 224, width: 144, height: 128 },
        offset: { x: 0, y: 0 },
        lockX: false,
        lockY: false
      },
      {
        area: { x: 8, y: 6, width: 24, height: 19 },
        bounds: { x: -168, y: 112, width: 720, height: 392 },
        offset: { x: 0, y: 0 },
        lockX: false,
        lockY: false
      }
    ],
    runtime: {
      ...(scene?.runtime && typeof scene.runtime === "object" ? scene.runtime : {}),
      type: "isometric",
      config: {
        ...(scene?.runtime?.config && typeof scene.runtime.config === "object" ? scene.runtime.config : {}),
        tileWidth: 32,
        tileHeight: 16,
        heightStep: 8,
        originX: 120,
        originY: 24,
        presentationZoom: 100,
        profile: "market-suspenso-isometric-world-v1",
        projection: "diamond",
        movement: "tile",
        heightMode: "levels",
        worldMode: "scrollable_tiled_world",
        gameplayMode: "adventure"
      }
    }
  };
}

function oficinaPointClickCursorActor() {
  return {
    id: "oficina-cursor",
    name: "Cursor da Oficina",
    roomName: "oficina",
    x: 8,
    y: 12,
    z: 0,
    spriteSheet: "oficina-cursor.png",
    animationName: "idle",
    animationStateID: "oficina-cursor-state",
    eventBindings: {}
  };
}

function oficinaMechanicActor() {
  return {
    id: "oficina-mechanic",
    name: "Mecânica de Lúmen",
    roomName: "oficina",
    x: 22,
    y: 15,
    z: 0,
    spriteSheet: "oficina-mechanic.png",
    animationName: "idle_down",
    animationStateID: "oficina-mechanic-state",
    eventName: "oficina_mara",
    scriptName: "oficina_mara",
    eventBindings: { onInteract: "oficina_mara" }
  };
}

function oficinaStabilizerActor() {
  return {
    id: "oficina-stabilizer",
    name: "Estabilizador instalado",
    roomName: "oficina",
    x: 15,
    y: 9,
    z: 1,
    spriteSheet: "oficina-stabilizer.png",
    animationName: "installed",
    animationStateID: "oficina-stabilizer-state",
    visibleVariable: VERTICE_PROGRESS_VARIABLES["vehicleModules.stabilizer"],
    visibleValue: 1,
    eventBindings: {}
  };
}

const VERTICE_OFICINA_CURSOR_ANIMATIONS = Object.freeze([
  verticeSpriteAnimation({ id: "oficina-cursor-idle", name: "idle", spriteSheet: "oficina-cursor.png", frameWidth: 16, frameHeight: 16, frameCount: 1, state: "idle", sourceFrameIndexes: [0] }),
  verticeSpriteAnimation({ id: "oficina-cursor-hover", name: "hover", spriteSheet: "oficina-cursor.png", frameWidth: 16, frameHeight: 16, frameCount: 1, state: "hover", sourceFrameIndexes: [1] })
]);

const VERTICE_OFICINA_CURSOR_STATE = verticeSpriteState(
  "oficina-cursor-state",
  "oficina-cursor.png",
  VERTICE_OFICINA_CURSOR_ANIMATIONS.map((animation) => animation.id),
  "cursor"
);

const VERTICE_OFICINA_STABILIZER_ANIMATIONS = Object.freeze([
  verticeSpriteAnimation({
    id: "oficina-stabilizer-installed",
    name: "installed",
    spriteSheet: "oficina-stabilizer.png",
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 1,
    state: "idle",
    fps: 1,
    sourceFrameIndexes: [0]
  })
]);

const VERTICE_OFICINA_STABILIZER_STATE = verticeSpriteState(
  "oficina-stabilizer-state",
  "oficina-stabilizer.png",
  VERTICE_OFICINA_STABILIZER_ANIMATIONS.map((animation) => animation.id),
  "fixed"
);

export function promoteApprovedOficinaPointClickAssets(project) {
  const promoteCollection = (records) => Array.isArray(records)
    ? records.map((record) => record?.name === "oficina" ? approvedOficinaPointClickScene(record) : record)
    : records;
  const animations = [
    ...(project?.animations ?? []).filter((animation) => !new Set([
      "oficina-cursor.png",
      "oficina-stabilizer.png"
    ]).has(animation?.spriteSheet)),
    ...VERTICE_OFICINA_CURSOR_ANIMATIONS,
    ...VERTICE_OFICINA_STABILIZER_ANIMATIONS
  ];
  const animationStates = [
    ...(project?.animationStates ?? []).filter((state) => !new Set([
      "oficina-cursor.png",
      "oficina-stabilizer.png"
    ]).has(state?.spriteSheet)),
    VERTICE_OFICINA_CURSOR_STATE,
    VERTICE_OFICINA_STABILIZER_STATE
  ];
  return {
    ...project,
    assets: replaceRecordsByKey(
      project?.assets ?? [],
      VERTICE_OFICINA_POINT_CLICK_ASSETS,
      "name",
      new Set([
        "workshop-gba.png",
        "oficina-bg3-harbor-wall.png",
        "oficina-bg2-workbench.png",
        "oficina-bg1-foreground.png"
      ])
    ),
    animations,
    animationStates,
    actors: [
      ...(project?.actors ?? []).filter((actor) => actor?.roomName !== "oficina"),
      oficinaPointClickCursorActor(),
      oficinaMechanicActor(),
      oficinaStabilizerActor()
    ],
    scenas: promoteCollection(project?.scenas),
    rooms: promoteCollection(project?.rooms)
  };
}

function verticeSpriteAnimation({ id, name, spriteSheet, frameWidth, frameHeight, frameCount, state = "idle", direction = "none", fps = 6, loops = true, sourceFrameIndexes = [], sourceSliceIndexes = sourceFrameIndexes, flipX = false, hitboxX = 0, hitboxY, hitboxWidth = frameWidth, hitboxHeight = Math.min(16, frameHeight), frameOriginX = 0, frameOriginY = 0, frameTiles = null }) {
  const resolvedHitboxY = hitboxY ?? -Math.min(8, frameHeight / 2);
  return {
    id,
    name,
    spriteSheet,
    frameWidth,
    frameHeight,
    fps,
    loops,
    frameCount,
    state,
    direction,
    colorMode: "4bpp",
    originX: 0,
    originY: 0,
    hitboxX,
    hitboxY: resolvedHitboxY,
    hitboxWidth,
    hitboxHeight,
    sourceColorMode: "4bpp",
    frames: Array.from({ length: frameCount }, (_, frameIndex) => {
      const sourceFrameIndex = sourceFrameIndexes[frameIndex] ?? frameIndex;
      const sourceSliceIndex = sourceSliceIndexes[frameIndex] ?? sourceFrameIndex;
      return ({
      id: `${id}-frame-${frameIndex}`,
      frameIndex,
      sourceFrameIndex,
      width: frameWidth,
      height: frameHeight,
      originX: frameOriginX,
      originY: frameOriginY,
      tiles: (frameTiles ?? [{
        x: 0,
        y: 0,
        sliceXOffset: 0,
        sliceYOffset: 0,
        tileWidth: frameWidth,
        tileHeight: frameHeight
      }]).map((tile, tileIndex) => ({
        id: `${id}-frame-${frameIndex}-tile-${tileIndex}`,
        x: tile.x,
        y: tile.y,
        sliceX: sourceSliceIndex * frameWidth + tile.sliceXOffset,
        sliceY: tile.sliceYOffset,
        sourceSheet: spriteSheet,
        tileWidth: tile.tileWidth,
        tileHeight: tile.tileHeight,
        flipX: tile.flipX ?? flipX,
        flipY: tile.flipY ?? false,
        objPalette: tile.objPalette ?? "OBP0",
        paletteIndex: tile.paletteIndex ?? 0,
        priority: tile.priority ?? false
      }))
    });
    })
  };
}

function verticeSpriteState(id, spriteSheet, animationIDs, animationType = "fixed", mirrorLeftFromRight = animationType === "four_direction") {
  return { id, name: "default", spriteSheet, animationType, mirrorLeftFromRight, animationIDs };
}

function farmNativeFrameTiles(spriteSheet, animationID, sourceFrameIndex, frameIndex) {
  const tile = {
    sourceSheet: spriteSheet,
    objPalette: "OBP0",
    paletteIndex: 0,
    priority: false,
    flipX: false,
    flipY: false
  };
  return [
    {
      ...tile,
      id: `${animationID}-frame-${frameIndex}-top-left`,
      x: 0,
      y: 16,
      sliceX: sourceFrameIndex * 48,
      sliceY: 0,
      tileWidth: 32,
      tileHeight: 32
    },
    {
      ...tile,
      id: `${animationID}-frame-${frameIndex}-top-right`,
      x: 32,
      y: 16,
      sliceX: sourceFrameIndex * 48 + 32,
      sliceY: 0,
      tileWidth: 16,
      tileHeight: 32
    },
    {
      ...tile,
      id: `${animationID}-frame-${frameIndex}-bottom-left`,
      x: 0,
      y: 0,
      sliceX: sourceFrameIndex * 48,
      sliceY: 32,
      tileWidth: 32,
      tileHeight: 16
    },
    {
      ...tile,
      id: `${animationID}-frame-${frameIndex}-bottom-right`,
      x: 32,
      y: 0,
      sliceX: sourceFrameIndex * 48 + 32,
      sliceY: 32,
      tileWidth: 16,
      tileHeight: 16
    }
  ];
}

function farmSpriteAnimation({ id, name, state, direction, spriteSheet, sourceFrameIndexes }) {
  return {
    id,
    name,
    state,
    direction,
    fps: state === "walk" ? 8 : 6,
    loops: true,
    frameCount: sourceFrameIndexes.length,
    frameWidth: 48,
    frameHeight: 48,
    originX: -16,
    originY: 0,
    hitboxX: 0,
    hitboxY: -8,
    hitboxWidth: 16,
    hitboxHeight: 16,
    colorMode: "4bpp",
    sourceColorMode: "4bpp",
    spriteSheet,
    frames: sourceFrameIndexes.map((sourceFrameIndex, frameIndex) => ({
      id: `${id}-frame-${frameIndex}`,
      frameIndex,
      sourceFrameIndex,
      width: 48,
      height: 48,
      originX: -16,
      originY: 0,
      tiles: farmNativeFrameTiles(spriteSheet, id, sourceFrameIndex, frameIndex)
    }))
  };
}

function farmReferenceAnimations(spriteSheet, prefix) {
  return [
    ["down", 0],
    ["up", 1],
    ["left", 2],
    ["right", 3]
  ].flatMap(([direction, row]) => [
    farmSpriteAnimation({
      id: `${prefix}-idle-${direction}`,
      name: `idle_${direction}`,
      state: "idle",
      direction,
      spriteSheet,
      sourceFrameIndexes: [row * 3]
    }),
    farmSpriteAnimation({
      id: `${prefix}-walk-${direction}`,
      name: `walk_${direction}`,
      state: "walk",
      direction,
      spriteSheet,
      sourceFrameIndexes: [row * 3 + 1, row * 3 + 2]
    })
  ]);
}

const VERTICE_FARM_REFERENCE_ANIMATIONS = Object.freeze([
  ...farmReferenceAnimations("farm-player-female.png", "farm-player-female"),
  ...farmReferenceAnimations("farm-player-male.png", "farm-player-male")
]);

const VERTICE_FARM_REFERENCE_STATES = Object.freeze([
  verticeSpriteState(
    "farm-player-female-state",
    "farm-player-female.png",
    VERTICE_FARM_REFERENCE_ANIMATIONS
      .filter((animation) => animation.spriteSheet === "farm-player-female.png")
      .map((animation) => animation.id),
    "four_direction_movement",
    false
  ),
  verticeSpriteState(
    "farm-player-male-state",
    "farm-player-male.png",
    VERTICE_FARM_REFERENCE_ANIMATIONS
      .filter((animation) => animation.spriteSheet === "farm-player-male.png")
      .map((animation) => animation.id),
    "four_direction_movement",
    false
  )
]);

const VERTICE_NARA_TOPDOWN_ANIMATIONS = Object.freeze([
  verticeSpriteAnimation({ id: "nara-topdown-idle-down", name: "idle_down", spriteSheet: "nara-topdown.png", frameWidth: 32, frameHeight: 64, frameCount: 1, direction: "down", fps: 8, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [0] }),
  verticeSpriteAnimation({ id: "nara-topdown-idle-up", name: "idle_up", spriteSheet: "nara-topdown.png", frameWidth: 32, frameHeight: 64, frameCount: 1, direction: "up", fps: 8, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [2], sourceSliceIndexes: [1] }),
  verticeSpriteAnimation({ id: "nara-topdown-idle-right", name: "idle_right", spriteSheet: "nara-topdown.png", frameWidth: 32, frameHeight: 64, frameCount: 1, direction: "right", fps: 8, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [1], sourceSliceIndexes: [2] }),
  verticeSpriteAnimation({ id: "nara-topdown-idle-left", name: "idle_left", spriteSheet: "nara-topdown.png", frameWidth: 32, frameHeight: 64, frameCount: 1, direction: "left", fps: 8, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [1], sourceSliceIndexes: [2], flipX: true }),
  verticeSpriteAnimation({ id: "nara-topdown-walk-down", name: "walk_down", spriteSheet: "nara-topdown.png", frameWidth: 32, frameHeight: 64, frameCount: 2, state: "walk", direction: "down", fps: 10, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [0, 3], sourceSliceIndexes: [3, 4] }),
  verticeSpriteAnimation({ id: "nara-topdown-walk-up", name: "walk_up", spriteSheet: "nara-topdown.png", frameWidth: 32, frameHeight: 64, frameCount: 2, state: "walk", direction: "up", fps: 10, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [2, 4], sourceSliceIndexes: [5, 6] }),
  verticeSpriteAnimation({ id: "nara-topdown-walk-right", name: "walk_right", spriteSheet: "nara-topdown.png", frameWidth: 32, frameHeight: 64, frameCount: 2, state: "walk", direction: "right", fps: 10, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [1, 5], sourceSliceIndexes: [7, 8] }),
  verticeSpriteAnimation({ id: "nara-topdown-walk-left", name: "walk_left", spriteSheet: "nara-topdown.png", frameWidth: 32, frameHeight: 64, frameCount: 2, state: "walk", direction: "left", fps: 10, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [1, 5], sourceSliceIndexes: [7, 8], flipX: true })
]);

function verticePlayerProfileAnimations(spriteSheet, idPrefix) {
  return [
    verticeSpriteAnimation({ id: `${idPrefix}-idle-down`, name: "idle_down", spriteSheet, frameWidth: 16, frameHeight: 32, frameCount: 1, direction: "down", fps: 8, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [0] }),
    verticeSpriteAnimation({ id: `${idPrefix}-idle-right`, name: "idle_right", spriteSheet, frameWidth: 16, frameHeight: 32, frameCount: 1, direction: "right", fps: 8, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [1] }),
    verticeSpriteAnimation({ id: `${idPrefix}-idle-up`, name: "idle_up", spriteSheet, frameWidth: 16, frameHeight: 32, frameCount: 1, direction: "up", fps: 8, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [2] }),
    verticeSpriteAnimation({ id: `${idPrefix}-idle-left`, name: "idle_left", spriteSheet, frameWidth: 16, frameHeight: 32, frameCount: 1, direction: "left", fps: 8, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [1], flipX: true }),
    verticeSpriteAnimation({ id: `${idPrefix}-walk-down`, name: "walk_down", spriteSheet, frameWidth: 16, frameHeight: 32, frameCount: 2, state: "walk", direction: "down", fps: 10, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [3, 4] }),
    verticeSpriteAnimation({ id: `${idPrefix}-walk-up`, name: "walk_up", spriteSheet, frameWidth: 16, frameHeight: 32, frameCount: 2, state: "walk", direction: "up", fps: 10, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [5, 6] }),
    verticeSpriteAnimation({ id: `${idPrefix}-walk-right`, name: "walk_right", spriteSheet, frameWidth: 16, frameHeight: 32, frameCount: 2, state: "walk", direction: "right", fps: 10, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [7, 8] }),
    verticeSpriteAnimation({ id: `${idPrefix}-walk-left`, name: "walk_left", spriteSheet, frameWidth: 16, frameHeight: 32, frameCount: 2, state: "walk", direction: "left", fps: 10, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [7, 8], flipX: true })
  ];
}

const VERTICE_PLAYER_MALE_ANIMATIONS = Object.freeze(
  verticePlayerProfileAnimations("player-male.png", "player-male")
);
const VERTICE_PLAYER_FEMALE_ANIMATIONS = Object.freeze(
  verticePlayerProfileAnimations("player-female.png", "player-female")
);
const VERTICE_PLAYER_PROFILE_ANIMATIONS = Object.freeze([
  ...VERTICE_PLAYER_MALE_ANIMATIONS,
  ...VERTICE_PLAYER_FEMALE_ANIMATIONS
]);

const VERTICE_GENDER_SELECTION_PLAYER_ANIMATIONS = Object.freeze([
  verticeSpriteAnimation({ id: "gender-player-male-32x64-idle-down", name: "idle_down", spriteSheet: "gender-player-male-32x64.png", frameWidth: 48, frameHeight: 48, frameCount: 1, direction: "down", fps: 8, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [0] }),
  verticeSpriteAnimation({ id: "gender-player-female-32x64-idle-down", name: "idle_down", spriteSheet: "gender-player-female-32x64.png", frameWidth: 48, frameHeight: 48, frameCount: 1, direction: "down", fps: 8, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [0] })
]);

const VERTICE_NAME_INPUT_PLAYER_ANIMATIONS = Object.freeze([
  verticeSpriteAnimation({ id: "name-player-male-32x32-idle-down", name: "idle_down", spriteSheet: "name-player-male-32x32.png", frameWidth: 32, frameHeight: 32, frameCount: 1, direction: "down", fps: 8, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [0] }),
  verticeSpriteAnimation({ id: "name-player-female-32x32-idle-down", name: "idle_down", spriteSheet: "name-player-female-32x32.png", frameWidth: 32, frameHeight: 32, frameCount: 1, direction: "down", fps: 8, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [0] })
]);

const VERTICE_PORT_LUMEN_ANIMATIONS = Object.freeze([
  ...VERTICE_NARA_TOPDOWN_ANIMATIONS,
  verticeSpriteAnimation({ id: "mechanic-idle-down", name: "idle_down", spriteSheet: "mechanic.png", frameWidth: 16, frameHeight: 32, frameCount: 1, direction: "down", fps: 4, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [0] }),
  verticeSpriteAnimation({ id: "mechanic-idle-right", name: "idle_right", spriteSheet: "mechanic.png", frameWidth: 16, frameHeight: 32, frameCount: 1, direction: "right", fps: 4, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [1] }),
  verticeSpriteAnimation({ id: "mechanic-idle-left", name: "idle_left", spriteSheet: "mechanic.png", frameWidth: 16, frameHeight: 32, frameCount: 1, direction: "left", fps: 4, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [1], flipX: true }),
  verticeSpriteAnimation({ id: "mechanic-idle-up", name: "idle_up", spriteSheet: "mechanic.png", frameWidth: 16, frameHeight: 32, frameCount: 1, direction: "up", fps: 4, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [2] }),
  verticeSpriteAnimation({ id: "mechanic-work-down", name: "work_down", spriteSheet: "mechanic.png", frameWidth: 16, frameHeight: 32, frameCount: 1, state: "attack", direction: "down", fps: 8, loops: false, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [3] }),
  verticeSpriteAnimation({ id: "mechanic-work-right", name: "work_right", spriteSheet: "mechanic.png", frameWidth: 16, frameHeight: 32, frameCount: 1, state: "attack", direction: "right", fps: 8, loops: false, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [4] }),
  verticeSpriteAnimation({ id: "mechanic-work-up", name: "work_up", spriteSheet: "mechanic.png", frameWidth: 16, frameHeight: 32, frameCount: 1, state: "attack", direction: "up", fps: 8, loops: false, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [5] }),
  verticeSpriteAnimation({ id: "mechanic-work-left", name: "work_left", spriteSheet: "mechanic.png", frameWidth: 16, frameHeight: 32, frameCount: 1, state: "attack", direction: "left", fps: 8, loops: false, hitboxWidth: 16, hitboxHeight: 16, sourceFrameIndexes: [5], flipX: true })
]);

const VERTICE_OFICINA_MECHANIC_ANIMATIONS = Object.freeze(
  VERTICE_PORT_LUMEN_ANIMATIONS
    .filter((animation) => animation.spriteSheet === "mechanic.png")
    .map((animation) => ({
      ...animation,
      id: animation.id.replace("mechanic-", "oficina-mechanic-"),
      spriteSheet: "oficina-mechanic.png"
    }))
);

const VERTICE_MARKET_SUSPENSO_FRAME_TILES = Object.freeze([
  { x: -16, y: 16, sliceXOffset: 0, sliceYOffset: 0, tileWidth: 32, tileHeight: 32 },
  { x: -16, y: 0, sliceXOffset: 0, sliceYOffset: 32, tileWidth: 32, tileHeight: 16 },
  { x: 16, y: 16, sliceXOffset: 32, sliceYOffset: 0, tileWidth: 16, tileHeight: 32 },
  { x: 16, y: 0, sliceXOffset: 32, sliceYOffset: 32, tileWidth: 16, tileHeight: 16 }
]);

const VERTICE_MARKET_SUSPENSO_TALL_FRAME_TILES = Object.freeze([
  { x: -16, y: 0, sliceXOffset: 0, sliceYOffset: 0, tileWidth: 32, tileHeight: 64 },
  { x: 16, y: 32, sliceXOffset: 32, sliceYOffset: 0, tileWidth: 16, tileHeight: 32 },
  { x: 16, y: 0, sliceXOffset: 32, sliceYOffset: 32, tileWidth: 16, tileHeight: 32 }
]);

function verticeMarketSuspensoActorAnimations(prefix, spriteSheet) {
  const directions = [
    ["down-left", 4, [5, 6, 7]],
    ["down-right", 0, [1, 2, 3]],
    ["up-left", 12, [13, 14, 15]],
    ["up-right", 8, [9, 10, 11]]
  ];
  return directions.flatMap(([direction, idleFrame, walkFrames]) => [
    verticeSpriteAnimation({
      id: `${prefix}-idle-${direction}`,
      name: `idle_${direction.replace("-", "_")}`,
      spriteSheet,
      frameWidth: 48,
      frameHeight: 48,
      frameCount: 1,
      direction,
      fps: 8,
      hitboxX: 16,
      hitboxY: -8,
      hitboxWidth: 16,
      hitboxHeight: 16,
      frameOriginX: 0,
      frameOriginY: 0,
      frameTiles: VERTICE_MARKET_SUSPENSO_FRAME_TILES,
      sourceFrameIndexes: [idleFrame]
    }),
    verticeSpriteAnimation({
      id: `${prefix}-walk-${direction}`,
      name: `walk_${direction.replace("-", "_")}`,
      spriteSheet,
      frameWidth: 48,
      frameHeight: 48,
      frameCount: 3,
      state: "walk",
      direction,
      fps: 8,
      hitboxX: 16,
      hitboxY: -8,
      hitboxWidth: 16,
      hitboxHeight: 16,
      frameOriginX: 0,
      frameOriginY: 0,
      frameTiles: VERTICE_MARKET_SUSPENSO_FRAME_TILES,
      sourceFrameIndexes: walkFrames
    })
  ]);
}

const VERTICE_MARKET_SUSPENSO_NARA_ANIMATIONS = Object.freeze(
  verticeMarketSuspensoActorAnimations("nara-mercado-isometric-v2", "nara-mercado-isometric-v2.png")
);

function verticeMarketSuspensoCandidateIdle(role) {
  return verticeSpriteAnimation({
    id: `market-${role}-isometric-v1-idle`,
    name: "idle_view_01",
    spriteSheet: `market-${role}-isometric-v1-idle.png`,
    frameWidth: 48,
    frameHeight: 64,
    frameCount: 1,
    direction: "none",
    fps: 1,
    hitboxX: 16,
    hitboxY: -8,
    hitboxWidth: 16,
    hitboxHeight: 16,
    frameOriginX: 0,
    frameOriginY: 0,
    frameTiles: VERTICE_MARKET_SUSPENSO_TALL_FRAME_TILES,
    sourceFrameIndexes: [0]
  });
}

const VERTICE_MARKET_SUSPENSO_ANIMATIONS = Object.freeze([
  ...VERTICE_MARKET_SUSPENSO_NARA_ANIMATIONS,
  verticeMarketSuspensoCandidateIdle("adventurer"),
  verticeMarketSuspensoCandidateIdle("merchant"),
  verticeMarketSuspensoCandidateIdle("guard")
]);

const VERTICE_NARRATIVE_ANIMATIONS = Object.freeze([
  ...VERTICE_PORT_LUMEN_ANIMATIONS,
  ...VERTICE_OFICINA_MECHANIC_ANIMATIONS,
  ...VERTICE_MARKET_SUSPENSO_ANIMATIONS,
  verticeSpriteAnimation({ id: "usina-sentinel-v2-far", name: "sentinel_far", spriteSheet: "usina-sentinel-v2.png", frameWidth: 64, frameHeight: 64, frameCount: 1, fps: 1, sourceFrameIndexes: [0] }),
  verticeSpriteAnimation({ id: "usina-sentinel-v2-mid", name: "sentinel_mid", spriteSheet: "usina-sentinel-v2.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "walk", fps: 1, sourceFrameIndexes: [1] }),
  verticeSpriteAnimation({ id: "usina-sentinel-v2-near", name: "sentinel_near", spriteSheet: "usina-sentinel-v2.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "attack", fps: 1, loops: false, sourceFrameIndexes: [2] }),
  verticeSpriteAnimation({ id: "usina-energy-cell-v2-idle", name: "energy_cell_idle", spriteSheet: "usina-energy-cell-v2.png", frameWidth: 16, frameHeight: 16, frameCount: 1, sourceFrameIndexes: [0] }),
  verticeSpriteAnimation({ id: "usina-energy-cell-v2-focus", name: "energy_cell_focus", spriteSheet: "usina-energy-cell-v2.png", frameWidth: 16, frameHeight: 16, frameCount: 1, state: "focus", sourceFrameIndexes: [1] }),
  verticeSpriteAnimation({ id: "rival-cutscene-animation", name: "rival-cutscene", spriteSheet: "rival-cutscene.png", frameWidth: 16, frameHeight: 32, frameCount: 2, direction: "down" }),
  verticeSpriteAnimation({ id: "airship-animation", name: "airship", spriteSheet: "airship.png", frameWidth: 16, frameHeight: 16, frameCount: 2, fps: 5 }),
  verticeSpriteAnimation({ id: "opening-airship-animation", name: "opening_fly", spriteSheet: "opening-airship.png", frameWidth: 64, frameHeight: 32, frameCount: 1, fps: 5, sourceFrameIndexes: [0] }),
  verticeSpriteAnimation({ id: "route-beacon-animation", name: "route-beacon", spriteSheet: "route-beacon.png", frameWidth: 16, frameHeight: 16, frameCount: 1 }),
  verticeSpriteAnimation({ id: "title-emblem-animation", name: "title-emblem", spriteSheet: "title-emblem.png", frameWidth: 16, frameHeight: 16, frameCount: 1 }),
  verticeSpriteAnimation({ id: "title-logo-animation", name: "title-logo", spriteSheet: "title-logo.png", frameWidth: 96, frameHeight: 32, frameCount: 1, fps: 6 }),
  ...TITLE_LOGO_RUNTIME_SEGMENTS.map((segment) => verticeSpriteAnimation({
    id: `title-logo-emblem-${segment.id}-animation`,
    name: `title-logo-emblem-${segment.id}`,
    spriteSheet: `title-logo-emblem-${segment.id}.png`,
    frameWidth: segment.width,
    frameHeight: segment.height,
    frameCount: 1,
    fps: 6
  })),
  verticeSpriteAnimation({ id: "press-start-animation", name: "press-start", spriteSheet: "press-start.png", frameWidth: 128, frameHeight: 32, frameCount: 1, fps: 6 }),
  verticeSpriteAnimation({ id: "press-start-actor-animation", name: "press-start-actor", spriteSheet: "press-start-actor-88x32.png", frameWidth: 88, frameHeight: 32, frameCount: 1, fps: 6 }),
  verticeSpriteAnimation({ id: "title-logo-actor-96x64-animation", name: "title-logo-actor-96x64", spriteSheet: "title-logo-actor-96x64.png", frameWidth: 96, frameHeight: 64, frameCount: 1, fps: 6 }),
  verticeSpriteAnimation({
    id: "title-logo-actor-128x88-animation", name: "title-logo-actor-128x88", spriteSheet: "title-logo-actor-128x88.png",
    frameWidth: 128, frameHeight: 88, frameCount: 1, fps: 6,
    frameTiles: [
      { x: 0, y: 0, sliceXOffset: 0, sliceYOffset: 0, tileWidth: 64, tileHeight: 64 },
      { x: 64, y: 0, sliceXOffset: 64, sliceYOffset: 0, tileWidth: 64, tileHeight: 64 },
      ...[0, 32, 64, 96].flatMap((x) => [
        { x, y: 64, sliceXOffset: x, sliceYOffset: 64, tileWidth: 32, tileHeight: 16 },
        { x, y: 80, sliceXOffset: x, sliceYOffset: 80, tileWidth: 32, tileHeight: 8 }
      ])
    ]
  }),
  ...VERTICE_OFICINA_CURSOR_ANIMATIONS,
  ...VERTICE_OFICINA_STABILIZER_ANIMATIONS,
  verticeSpriteAnimation({ id: "menu-new-game-animation", name: "menu-new-game", spriteSheet: "menu-inicial-new-game.png", frameWidth: 64, frameHeight: 24, frameCount: 1, fps: 6 }),
  verticeSpriteAnimation({ id: "menu-load-game-animation", name: "menu-load-game", spriteSheet: "menu-inicial-load-game.png", frameWidth: 64, frameHeight: 24, frameCount: 1, fps: 6 }),
  verticeSpriteAnimation({ id: "menu-language-animation", name: "menu-language", spriteSheet: "menu-inicial-language.png", frameWidth: 64, frameHeight: 24, frameCount: 1, fps: 6 }),
  verticeSpriteAnimation({ id: "menu-settings-animation", name: "menu-settings", spriteSheet: "menu-inicial-settings.png", frameWidth: 64, frameHeight: 32, frameCount: 1, fps: 6 }),
  verticeSpriteAnimation({ id: "menu-credits-animation", name: "menu-credits", spriteSheet: "menu-inicial-credits.png", frameWidth: 64, frameHeight: 24, frameCount: 1, fps: 6 }),
  verticeSpriteAnimation({ id: "menu-cursor-animation", name: "menu-cursor", spriteSheet: "menu-inicial-cursor.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 6 }),
  verticeSpriteAnimation({ id: "menu-gender-title-animation", name: "menu-gender-title", spriteSheet: "menu-gender-title.png", frameWidth: 64, frameHeight: 32, frameCount: 1, fps: 6 }),
  verticeSpriteAnimation({ id: "menu-player-name-title-animation", name: "menu-player-name-title", spriteSheet: "menu-player-name-title.png", frameWidth: 64, frameHeight: 32, frameCount: 1, fps: 6 }),
  verticeSpriteAnimation({ id: "menu-entry-cursor-animation", name: "menu-entry-cursor", spriteSheet: "menu-entry-cursor.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 6 }),
  ...[
    ["start-title", "menu-start-title.png", "MENU START", 88],
    ["missions", "menu-missoes.png", "MISSÕES", 64],
    ["inventory", "menu-inventario.png", "INVENTÁRIO", 88],
    ["map", "menu-mapa.png", "MAPA", 40],
    ["profile", "menu-perfil-equipe.png", "PERFIL/EQUIPE", 112],
    ["save", "menu-salvar.png", "SALVAR", 56],
    ["settings", "menu-configuracoes.png", "CONFIGURAÇÕES", 112],
    ["tactical", "menu-tactical.png", "ARENA TÁTICA", 104]
  ].map(([id, spriteSheet, _text, frameWidth]) => verticeSpriteAnimation({
    id: `menu-start-${id}-animation`,
    name: `menu-start-${id}`,
    spriteSheet,
    frameWidth,
    frameHeight: 16,
    frameCount: 1,
    fps: 6
  })),
  ...[
    ["missions-active", "missoes-active.png"],
    ["missions-next", "missoes-next.png"]
  ].map(([id, spriteSheet]) => verticeSpriteAnimation({
    id: `menu-${id}-animation`,
    name: `menu-${id}`,
    spriteSheet,
    frameWidth: 128,
    frameHeight: 32,
    frameCount: 1,
    fps: 6
  })),
  ...[
    ["inventory-modules", "inventario-modules.png"],
    ["inventory-empty", "inventario-empty.png"]
  ].map(([id, spriteSheet]) => verticeSpriteAnimation({
    id: `menu-${id}-animation`,
    name: `menu-${id}`,
    spriteSheet,
    frameWidth: 128,
    frameHeight: 32,
    frameCount: 1,
    fps: 6
  })),
  ...[
    ["crate", 0],
    ["satchel", 1],
    ["module", 2],
    ["beacon", 3],
    ["gear", 4],
    ["map", 5],
    ["key", 6],
    ["token", 7]
  ].map(([id, sourceFrameIndex]) => verticeSpriteAnimation({
    id: `menu-icon-${id}-animation`,
    name: `menu-icon-${id}`,
    spriteSheet: "menu-in-game-icons-v2.png",
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 1,
    fps: 6,
    sourceFrameIndexes: [sourceFrameIndex]
  })),
  verticeSpriteAnimation({ id: "nara-portrait-v3-animation", name: "nara-portrait-v3", spriteSheet: "nara-portrait-v3.png", frameWidth: 48, frameHeight: 48, frameCount: 1, fps: 6, sourceFrameIndexes: [0] }),
  verticeSpriteAnimation({ id: "guardian-portrait-v3-animation", name: "guardian-portrait-v3", spriteSheet: "guardian-portrait-v3.png", frameWidth: 48, frameHeight: 48, frameCount: 1, fps: 6, sourceFrameIndexes: [0] }),
  verticeSpriteAnimation({ id: "menu-back-v3-animation", name: "menu-back-v3", spriteSheet: "menu-back-v3.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 6, sourceFrameIndexes: [0] }),
  verticeSpriteAnimation({ id: "menu-start-cursor-lighthouse-animation", name: "menu-start-cursor-lighthouse", spriteSheet: "menu-start-cursor-lighthouse-16x32-4bpp.png", frameWidth: 16, frameHeight: 16, frameCount: 2, fps: 4, sourceFrameIndexes: [0, 1] }),
  ...[
    ["male-neutral", "profile-team-male-neutral-48x48-4bpp.png"],
    ["female-neutral", "profile-team-female-neutral-48x48-4bpp.png"],
    ["elder-neutral", "profile-team-elder-neutral-48x48-4bpp.png"]
  ].map(([id, spriteSheet]) => verticeSpriteAnimation({
    id: `profile-team-${id}-animation`,
    name: `profile-team-${id}`,
    spriteSheet,
    frameWidth: 48,
    frameHeight: 48,
    frameCount: 1,
    fps: 6,
    sourceFrameIndexes: [0]
  })),
  ...[
    ["map-detail-current", "mapa-detail-current.png"],
    ["map-detail-penedos", "mapa-detail-penedos.png"]
  ].map(([id, spriteSheet]) => verticeSpriteAnimation({
    id: `menu-${id}-animation`,
    name: `menu-${id}`,
    spriteSheet,
    frameWidth: 208,
    frameHeight: 32,
    frameCount: 1,
    fps: 6
  })),
  ...[
    ["profile-nara", "profile-nara.png"],
    ["profile-guardian", "profile-guardian.png"]
  ].map(([id, spriteSheet]) => verticeSpriteAnimation({
    id: `menu-${id}-animation`,
    name: `menu-${id}`,
    spriteSheet,
    frameWidth: 112,
    frameHeight: 16,
    frameCount: 1,
    fps: 6
  })),
  ...[
    ["name-label", "menu-name-label.png", "NOME", 64, 32],
    ["male", "menu-male.png", "HOMEM", 64, 24],
    ["female", "menu-female.png", "MULHER", 64, 24],
    ["confirm", "menu-confirm.png", "CONFIRMAR", 64, 32],
    ["entry-back", "menu-entry-back.png", "VOLTAR", 64, 24],
    ["back", "menu-back.png", "VOLTAR", 56, 16],
    ["slot-1", "menu-slot-1.png", "SLOT 1", 56, 16],
    ["portuguese", "menu-portuguese.png", "PORTUGUES", 80, 16],
    ["spanish", "menu-spanish.png", "ESPANOL", 64, 16],
    ["english", "menu-english.png", "ENGLISH", 64, 16],
    ["audio", "menu-audio.png", "AUDIO", 48, 16],
    ["controls", "menu-controls.png", "CONTROLES", 80, 16],
    ["project", "menu-project.png", "GBA STUDIO", 88, 16],
    ["engine", "menu-engine.png", "ENGINE", 56, 16]
  ].map(([id, spriteSheet, _text, frameWidth, frameHeight]) => verticeSpriteAnimation({
    id: `menu-${id}-animation`,
    name: `menu-${id}`,
    spriteSheet,
    frameWidth,
    frameHeight,
    frameCount: 1,
    fps: 6
  })),
  ...[
    ["slot-1-left-focus", "menu-save-slot-1-left-focus.png", 128],
    ["slot-1-right-focus", "menu-save-slot-1-right-focus.png", 32],
    ["slot-1-bottom-left-focus", "menu-save-slot-1-bottom-left-focus.png", 128, 8],
    ["slot-1-bottom-right-focus", "menu-save-slot-1-bottom-right-focus.png", 32, 8],
    ["slot-2-left-focus", "menu-save-slot-2-left-focus.png", 128],
    ["slot-2-right-focus", "menu-save-slot-2-right-focus.png", 32],
    ["slot-2-bottom-left-focus", "menu-save-slot-2-bottom-left-focus.png", 128, 8],
    ["slot-2-bottom-right-focus", "menu-save-slot-2-bottom-right-focus.png", 32, 8],
    ["slot-3-left-focus", "menu-save-slot-3-left-focus.png", 128],
    ["slot-3-right-focus", "menu-save-slot-3-right-focus.png", 32],
    ["slot-3-bottom-left-focus", "menu-save-slot-3-bottom-left-focus.png", 128, 8],
    ["slot-3-bottom-right-focus", "menu-save-slot-3-bottom-right-focus.png", 32, 8]
  ].flatMap(([id, spriteSheet, frameWidth, frameHeight = 32]) => [
    verticeSpriteAnimation({
      id: `menu-${id}-normal-animation`,
      name: `menu-${id}-normal`,
      spriteSheet,
      frameWidth,
      frameHeight,
      frameCount: 1,
      fps: 6,
      sourceFrameIndexes: [0]
    }),
    verticeSpriteAnimation({
      id: `menu-${id}-selected-animation`,
      name: `menu-${id}-selected`,
      spriteSheet,
      frameWidth,
      frameHeight,
      frameCount: 1,
      fps: 6,
      sourceFrameIndexes: [1]
    })
  ])
]);

const VERTICE_PORT_LUMEN_STATES = Object.freeze([
  verticeSpriteState("nara-topdown-state", "nara-topdown.png", VERTICE_NARA_TOPDOWN_ANIMATIONS.map((animation) => animation.id), "four_direction_movement", true),
  verticeSpriteState("mechanic-state", "mechanic.png", ["mechanic-idle-down", "mechanic-idle-right", "mechanic-idle-up", "mechanic-idle-left", "mechanic-work-down", "mechanic-work-right", "mechanic-work-up", "mechanic-work-left"])
]);

const VERTICE_PLAYER_PROFILE_STATES = Object.freeze([
  verticeSpriteState("player-male-state", "player-male.png", VERTICE_PLAYER_MALE_ANIMATIONS.map((animation) => animation.id), "four_direction_movement"),
  verticeSpriteState("player-female-state", "player-female.png", VERTICE_PLAYER_FEMALE_ANIMATIONS.map((animation) => animation.id), "four_direction_movement")
]);

const VERTICE_GENDER_SELECTION_PLAYER_STATES = Object.freeze([
  verticeSpriteState("gender-player-male-32x64-state", "gender-player-male-32x64.png", ["gender-player-male-32x64-idle-down"], "fixed"),
  verticeSpriteState("gender-player-female-32x64-state", "gender-player-female-32x64.png", ["gender-player-female-32x64-idle-down"], "fixed")
]);

const VERTICE_NAME_INPUT_PLAYER_STATES = Object.freeze([
  verticeSpriteState("name-player-male-32x32-state", "name-player-male-32x32.png", ["name-player-male-32x32-idle-down"], "fixed"),
  verticeSpriteState("name-player-female-32x32-state", "name-player-female-32x32.png", ["name-player-female-32x32-idle-down"], "fixed")
]);

const VERTICE_OFICINA_STATES = Object.freeze([
  verticeSpriteState(
    "oficina-mechanic-state",
    "oficina-mechanic.png",
    VERTICE_OFICINA_MECHANIC_ANIMATIONS.map((animation) => animation.id)
  )
]);

const VERTICE_MARKET_SUSPENSO_STATES = Object.freeze([
  verticeSpriteState("nara-mercado-isometric-v2-state", "nara-mercado-isometric-v2.png", [
    "nara-mercado-isometric-v2-idle-down-left", "nara-mercado-isometric-v2-walk-down-left",
    "nara-mercado-isometric-v2-idle-down-right", "nara-mercado-isometric-v2-walk-down-right",
    "nara-mercado-isometric-v2-idle-up-left", "nara-mercado-isometric-v2-walk-up-left",
    "nara-mercado-isometric-v2-idle-up-right", "nara-mercado-isometric-v2-walk-up-right"
  ], "directional_view"),
  verticeSpriteState("market-adventurer-isometric-v1-idle-state", "market-adventurer-isometric-v1-idle.png", ["market-adventurer-isometric-v1-idle"]),
  verticeSpriteState("market-merchant-isometric-v1-idle-state", "market-merchant-isometric-v1-idle.png", ["market-merchant-isometric-v1-idle"]),
  verticeSpriteState("market-guard-isometric-v1-idle-state", "market-guard-isometric-v1-idle.png", ["market-guard-isometric-v1-idle"])
]);

const VERTICE_NARRATIVE_STATES = Object.freeze([
  ...VERTICE_PORT_LUMEN_STATES,
  ...VERTICE_OFICINA_STATES,
  ...VERTICE_MARKET_SUSPENSO_STATES,
  verticeSpriteState("usina-sentinel-v2-state", "usina-sentinel-v2.png", [
    "usina-sentinel-v2-far",
    "usina-sentinel-v2-mid",
    "usina-sentinel-v2-near"
  ]),
  verticeSpriteState("usina-energy-cell-v2-state", "usina-energy-cell-v2.png", [
    "usina-energy-cell-v2-idle",
    "usina-energy-cell-v2-focus"
  ]),
  verticeSpriteState("rival-cutscene-state", "rival-cutscene.png", ["rival-cutscene-animation"]),
  verticeSpriteState("airship-state", "airship.png", ["airship-animation"]),
  verticeSpriteState("opening-airship-state", "opening-airship.png", ["opening-airship-animation"]),
  verticeSpriteState("route-beacon-state", "route-beacon.png", ["route-beacon-animation"]),
  verticeSpriteState("title-emblem-state", "title-emblem.png", ["title-emblem-animation"]),
  verticeSpriteState("title-logo-state", "title-logo.png", ["title-logo-animation"]),
  ...TITLE_LOGO_RUNTIME_SEGMENTS.map((segment) => verticeSpriteState(
    `title-logo-emblem-${segment.id}-state`,
    `title-logo-emblem-${segment.id}.png`,
    [`title-logo-emblem-${segment.id}-animation`]
  )),
  verticeSpriteState("press-start-state", "press-start.png", ["press-start-animation"]),
  verticeSpriteState("press-start-actor-state", "press-start-actor-88x32.png", ["press-start-actor-animation"], "fixed"),
  verticeSpriteState("title-logo-actor-96x64-state", "title-logo-actor-96x64.png", ["title-logo-actor-96x64-animation"], "fixed"),
  verticeSpriteState("title-logo-actor-128x88-state", "title-logo-actor-128x88.png", ["title-logo-actor-128x88-animation"], "fixed"),
  VERTICE_OFICINA_CURSOR_STATE,
  VERTICE_OFICINA_STABILIZER_STATE,
  verticeSpriteState("menu-new-game-state", "menu-inicial-new-game.png", ["menu-new-game-animation"]),
  verticeSpriteState("menu-load-game-state", "menu-inicial-load-game.png", ["menu-load-game-animation"]),
  verticeSpriteState("menu-language-state", "menu-inicial-language.png", ["menu-language-animation"]),
  verticeSpriteState("menu-settings-state", "menu-inicial-settings.png", ["menu-settings-animation"]),
  verticeSpriteState("menu-credits-state", "menu-inicial-credits.png", ["menu-credits-animation"]),
  verticeSpriteState("menu-cursor-state", "menu-inicial-cursor.png", ["menu-cursor-animation"]),
  verticeSpriteState("menu-gender-title-state", "menu-gender-title.png", ["menu-gender-title-animation"]),
  verticeSpriteState("menu-player-name-title-state", "menu-player-name-title.png", ["menu-player-name-title-animation"]),
  verticeSpriteState("menu-entry-cursor-state", "menu-entry-cursor.png", ["menu-entry-cursor-animation"]),
  ...[
    ["start-title", "menu-start-title.png"],
    ["missions", "menu-missoes.png"],
    ["inventory", "menu-inventario.png"],
    ["map", "menu-mapa.png"],
    ["profile", "menu-perfil-equipe.png"],
    ["save", "menu-salvar.png"],
    ["settings", "menu-configuracoes.png"],
    ["tactical", "menu-tactical.png"]
  ].map(([id, spriteSheet]) => verticeSpriteState(
    `menu-start-${id}-state`,
    spriteSheet,
    [`menu-start-${id}-animation`]
  )),
  ...[
    ["missions-active", "missoes-active.png"],
    ["missions-next", "missoes-next.png"]
  ].map(([id, spriteSheet]) => verticeSpriteState(
    `menu-${id}-state`,
    spriteSheet,
    [`menu-${id}-animation`]
  )),
  verticeSpriteState("menu-in-game-icons-v2-state", "menu-in-game-icons-v2.png", [
    "menu-icon-crate-animation",
    "menu-icon-satchel-animation",
    "menu-icon-module-animation",
    "menu-icon-beacon-animation",
    "menu-icon-gear-animation",
    "menu-icon-map-animation",
    "menu-icon-key-animation",
    "menu-icon-token-animation"
  ], "fixed"),
  verticeSpriteState("nara-portrait-v3-state", "nara-portrait-v3.png", ["nara-portrait-v3-animation"], "fixed"),
  verticeSpriteState("guardian-portrait-v3-state", "guardian-portrait-v3.png", ["guardian-portrait-v3-animation"], "fixed"),
  verticeSpriteState("menu-back-v3-state", "menu-back-v3.png", ["menu-back-v3-animation"], "fixed"),
  verticeSpriteState("menu-start-cursor-lighthouse-state", "menu-start-cursor-lighthouse-16x32-4bpp.png", ["menu-start-cursor-lighthouse-animation"], "fixed"),
  ...[
    ["male-neutral", "profile-team-male-neutral-48x48-4bpp.png"],
    ["female-neutral", "profile-team-female-neutral-48x48-4bpp.png"],
    ["elder-neutral", "profile-team-elder-neutral-48x48-4bpp.png"]
  ].map(([id, spriteSheet]) => verticeSpriteState(
    `profile-team-${id}-state`,
    spriteSheet,
    [`profile-team-${id}-animation`],
    "fixed"
  )),
  ...[
    ["inventory-modules", "inventario-modules.png"],
    ["inventory-empty", "inventario-empty.png"]
  ].map(([id, spriteSheet]) => verticeSpriteState(
    `menu-${id}-state`,
    spriteSheet,
    [`menu-${id}-animation`]
  )),
  ...[
    ["map-detail-current", "mapa-detail-current.png"],
    ["map-detail-penedos", "mapa-detail-penedos.png"]
  ].map(([id, spriteSheet]) => verticeSpriteState(
    `menu-${id}-state`,
    spriteSheet,
    [`menu-${id}-animation`]
  )),
  ...[
    ["profile-nara", "profile-nara.png"],
    ["profile-guardian", "profile-guardian.png"]
  ].map(([id, spriteSheet]) => verticeSpriteState(
    `menu-${id}-state`,
    spriteSheet,
    [`menu-${id}-animation`]
  )),
  ...[
    "name-label",
    "male",
    "female",
    "confirm",
    "entry-back",
    "back",
    "slot-1",
    "portuguese",
    "spanish",
    "english",
    "audio",
    "controls",
    "project",
    "engine"
  ].map((id) => verticeSpriteState(
    `menu-${id}-state`,
    `menu-${id === "name-label" ? "name-label" : id}.png`,
    [`menu-${id}-animation`]
  )),
  ...[
    ["slot-1-left-focus", "menu-save-slot-1-left-focus.png"],
    ["slot-1-right-focus", "menu-save-slot-1-right-focus.png"],
    ["slot-1-bottom-left-focus", "menu-save-slot-1-bottom-left-focus.png"],
    ["slot-1-bottom-right-focus", "menu-save-slot-1-bottom-right-focus.png"],
    ["slot-2-left-focus", "menu-save-slot-2-left-focus.png"],
    ["slot-2-right-focus", "menu-save-slot-2-right-focus.png"],
    ["slot-2-bottom-left-focus", "menu-save-slot-2-bottom-left-focus.png"],
    ["slot-2-bottom-right-focus", "menu-save-slot-2-bottom-right-focus.png"],
    ["slot-3-left-focus", "menu-save-slot-3-left-focus.png"],
    ["slot-3-right-focus", "menu-save-slot-3-right-focus.png"],
    ["slot-3-bottom-left-focus", "menu-save-slot-3-bottom-left-focus.png"],
    ["slot-3-bottom-right-focus", "menu-save-slot-3-bottom-right-focus.png"]
  ].map(([id, spriteSheet]) => verticeSpriteState(
    `menu-${id}-state`,
    spriteSheet,
    [`menu-${id}-normal-animation`, `menu-${id}-selected-animation`]
  ))
]);

const VERTICE_PENEDOS_PLATFORMER_ANIMATIONS = Object.freeze([
  verticeSpriteAnimation({ id: "nara-penedos-platformer-idle", name: "idle_right", spriteSheet: "nara-penedos-platformer-64x64.png", frameWidth: 64, frameHeight: 64, frameCount: 1, direction: "right", fps: 8, sourceFrameIndexes: [0], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "nara-penedos-platformer-walk", name: "walk_right", spriteSheet: "nara-penedos-platformer-64x64.png", frameWidth: 64, frameHeight: 64, frameCount: 2, state: "walk", direction: "right", fps: 10, sourceFrameIndexes: [1, 2], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "nara-penedos-platformer-jump", name: "jump_right", spriteSheet: "nara-penedos-platformer-64x64.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "jump", direction: "right", fps: 8, loops: false, sourceFrameIndexes: [3], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "nara-penedos-platformer-fall", name: "fall_right", spriteSheet: "nara-penedos-platformer-64x64.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "fall", direction: "right", fps: 8, sourceFrameIndexes: [4], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "nara-penedos-platformer-climb", name: "climb_up", spriteSheet: "nara-penedos-platformer-64x64.png", frameWidth: 64, frameHeight: 64, frameCount: 2, state: "walk", direction: "up", fps: 8, sourceFrameIndexes: [5, 6], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "nara-penedos-platformer-hurt", name: "hurt_right", spriteSheet: "nara-penedos-platformer-64x64.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "hurt", direction: "right", fps: 6, loops: false, sourceFrameIndexes: [7], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 })
]);

const VERTICE_PENEDOS_PLATFORMER_ENEMY_ANIMATIONS = Object.freeze([
  verticeSpriteAnimation({ id: "penedos-crab-idle", name: "crab_idle", spriteSheet: "penedos-enemies-32x32.png", frameWidth: 32, frameHeight: 32, frameCount: 1, fps: 4, sourceFrameIndexes: [0], hitboxX: 8, hitboxY: -12, hitboxWidth: 16, hitboxHeight: 12 }),
  verticeSpriteAnimation({ id: "penedos-moth-idle", name: "moth_idle", spriteSheet: "penedos-enemies-32x32.png", frameWidth: 32, frameHeight: 32, frameCount: 1, fps: 4, sourceFrameIndexes: [1], hitboxX: 8, hitboxY: -12, hitboxWidth: 16, hitboxHeight: 12 }),
  verticeSpriteAnimation({ id: "penedos-slime-idle", name: "slime_idle", spriteSheet: "penedos-enemies-32x32.png", frameWidth: 32, frameHeight: 32, frameCount: 1, fps: 4, sourceFrameIndexes: [2], hitboxX: 8, hitboxY: -12, hitboxWidth: 16, hitboxHeight: 12 })
]);

const VERTICE_EXPLORATION_ANIMATIONS = Object.freeze([
  ...VERTICE_PENEDOS_PLATFORMER_ANIMATIONS,
  ...VERTICE_PENEDOS_PLATFORMER_ENEMY_ANIMATIONS,
  verticeSpriteAnimation({ id: "nara-platformer-idle", name: "idle", spriteSheet: "nara-platformer.png", frameWidth: 32, frameHeight: 32, frameCount: 2, sourceFrameIndexes: [0, 7] }),
  verticeSpriteAnimation({ id: "nara-platformer-walk", name: "walk", spriteSheet: "nara-platformer.png", frameWidth: 32, frameHeight: 32, frameCount: 2, state: "walk", sourceFrameIndexes: [1, 2] }),
  verticeSpriteAnimation({ id: "nara-platformer-jump", name: "jump", spriteSheet: "nara-platformer.png", frameWidth: 32, frameHeight: 32, frameCount: 1, state: "jump", sourceFrameIndexes: [3] }),
  verticeSpriteAnimation({ id: "nara-platformer-fall", name: "fall", spriteSheet: "nara-platformer.png", frameWidth: 32, frameHeight: 32, frameCount: 1, state: "fall", sourceFrameIndexes: [4] }),
  verticeSpriteAnimation({ id: "nara-platformer-attack", name: "attack", spriteSheet: "nara-platformer.png", frameWidth: 32, frameHeight: 32, frameCount: 2, state: "attack", loops: false, sourceFrameIndexes: [0, 5] }),
  verticeSpriteAnimation({ id: "nara-platformer-hurt", name: "hurt", spriteSheet: "nara-platformer.png", frameWidth: 32, frameHeight: 32, frameCount: 1, state: "hurt", loops: false, sourceFrameIndexes: [6] }),
  ...VERTICE_MARKET_SUSPENSO_ANIMATIONS,
  verticeSpriteAnimation({ id: "nara-dungeon-animation", name: "nara-dungeon", spriteSheet: "nara-dungeon.png", frameWidth: 16, frameHeight: 32, frameCount: 4, direction: "down" }),
  verticeSpriteAnimation({ id: "cliff-prop-animation", name: "cliff-prop", spriteSheet: "cliff-prop.png", frameWidth: 16, frameHeight: 16, frameCount: 2 }),
  verticeSpriteAnimation({ id: "plant-sentinel-animation", name: "plant-sentinel", spriteSheet: "plant-sentinel.png", frameWidth: 16, frameHeight: 16, frameCount: 2 }),
  verticeSpriteAnimation({ id: "dungeon-sentinel-far", name: "sentinel_far", spriteSheet: "dungeon-sentinel-v1.png", frameWidth: 64, frameHeight: 64, frameCount: 1, fps: 1, sourceFrameIndexes: [0] }),
  verticeSpriteAnimation({ id: "dungeon-sentinel-mid", name: "sentinel_mid", spriteSheet: "dungeon-sentinel-v1.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "walk", fps: 1, sourceFrameIndexes: [1] }),
  verticeSpriteAnimation({ id: "dungeon-sentinel-near", name: "sentinel_near", spriteSheet: "dungeon-sentinel-v1.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "attack", fps: 1, loops: false, sourceFrameIndexes: [2] }),
  verticeSpriteAnimation({ id: "energy-cell-animation", name: "energy-cell", spriteSheet: "energy-cell.png", frameWidth: 16, frameHeight: 16, frameCount: 1 })
]);

const VERTICE_EXPLORATION_STATES = Object.freeze([
  verticeSpriteState("nara-penedos-platformer-state", "nara-penedos-platformer-64x64.png", VERTICE_PENEDOS_PLATFORMER_ANIMATIONS.map((animation) => animation.id), "platform_player"),
  verticeSpriteState("penedos-enemies-state", "penedos-enemies-32x32.png", VERTICE_PENEDOS_PLATFORMER_ENEMY_ANIMATIONS.map((animation) => animation.id), "fixed"),
  verticeSpriteState("nara-platformer-state", "nara-platformer.png", ["nara-platformer-idle", "nara-platformer-walk", "nara-platformer-jump", "nara-platformer-fall", "nara-platformer-attack", "nara-platformer-hurt"], "platform_player"),
  verticeSpriteState("nara-mercado-isometric-v2-state", "nara-mercado-isometric-v2.png", [
    "nara-mercado-isometric-v2-idle-down-left", "nara-mercado-isometric-v2-walk-down-left",
    "nara-mercado-isometric-v2-idle-down-right", "nara-mercado-isometric-v2-walk-down-right",
    "nara-mercado-isometric-v2-idle-up-left", "nara-mercado-isometric-v2-walk-up-left",
    "nara-mercado-isometric-v2-idle-up-right", "nara-mercado-isometric-v2-walk-up-right"
  ], "directional_view"),
  verticeSpriteState("nara-dungeon-state", "nara-dungeon.png", ["nara-dungeon-animation"]),
  verticeSpriteState("cliff-prop-state", "cliff-prop.png", ["cliff-prop-animation"]),
  verticeSpriteState("market-merchant-isometric-v1-idle-state", "market-merchant-isometric-v1-idle.png", ["market-merchant-isometric-v1-idle"]),
  verticeSpriteState("market-guard-isometric-v1-idle-state", "market-guard-isometric-v1-idle.png", ["market-guard-isometric-v1-idle"]),
  verticeSpriteState("plant-sentinel-state", "plant-sentinel.png", ["plant-sentinel-animation"]),
  verticeSpriteState("dungeon-sentinel-state", "dungeon-sentinel-v1.png", ["dungeon-sentinel-far"]),
  verticeSpriteState("energy-cell-state", "energy-cell.png", ["energy-cell-animation"])
]);

const VERTICE_TEMPESTADE_V3_ANIMATIONS = Object.freeze([
  verticeSpriteAnimation({ id: "tempestade-v3-player-fly", name: "fly", spriteSheet: "tempestade-v3-player.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "walk", fps: 8, hitboxWidth: 32, hitboxHeight: 32 }),
  verticeSpriteAnimation({ id: "tempestade-v3-drone-horizontal-idle", name: "idle", spriteSheet: "tempestade-v3-drone-horizontal.png", frameWidth: 32, frameHeight: 32, frameCount: 1, hitboxWidth: 24, hitboxHeight: 24 }),
  verticeSpriteAnimation({ id: "tempestade-v3-drone-vertical-idle", name: "idle", spriteSheet: "tempestade-v3-drone-vertical.png", frameWidth: 32, frameHeight: 32, frameCount: 1, hitboxWidth: 24, hitboxHeight: 24 }),
  verticeSpriteAnimation({ id: "tempestade-v3-boss-lighthouse-idle", name: "idle", spriteSheet: "tempestade-v3-boss-lighthouse.png", frameWidth: 64, frameHeight: 64, frameCount: 1, hitboxWidth: 48, hitboxHeight: 32 })
]);

const VERTICE_CLIMAX_ANIMATIONS = Object.freeze([
  ...VERTICE_TEMPESTADE_V3_ANIMATIONS,
  verticeSpriteAnimation({ id: "nara-portrait-animation", name: "nara-portrait", spriteSheet: "nara-portrait.png", frameWidth: 32, frameHeight: 32, frameCount: 2 }),
  verticeSpriteAnimation({ id: "guardian-portrait-animation", name: "guardian-portrait", spriteSheet: "guardian-portrait.png", frameWidth: 32, frameHeight: 32, frameCount: 2 }),
  verticeSpriteAnimation({ id: "dialogue-sigil-animation", name: "dialogue-sigil", spriteSheet: "dialogue-sigil.png", frameWidth: 16, frameHeight: 16, frameCount: 1 }),
  verticeSpriteAnimation({ id: "nara-flight-fly", name: "fly", spriteSheet: "nara-flight.png", frameWidth: 64, frameHeight: 64, frameCount: 4, state: "walk", fps: 8, hitboxWidth: 32, hitboxHeight: 32, sourceFrameIndexes: [0, 1, 2, 3] }),
  verticeSpriteAnimation({ id: "nara-flight-bank-right", name: "bank_right", spriteSheet: "nara-flight.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "walk", direction: "right", hitboxWidth: 32, hitboxHeight: 32, sourceFrameIndexes: [1] }),
  verticeSpriteAnimation({ id: "nara-flight-bank-left", name: "bank_left", spriteSheet: "nara-flight.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "walk", direction: "left", hitboxWidth: 32, hitboxHeight: 32, sourceFrameIndexes: [2] }),
  verticeSpriteAnimation({ id: "nara-flight-hurt", name: "hurt", spriteSheet: "nara-flight.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "hurt", loops: false, hitboxWidth: 32, hitboxHeight: 32, sourceFrameIndexes: [3] }),
  verticeSpriteAnimation({ id: "storm-drone-idle", name: "idle", spriteSheet: "storm-drone.png", frameWidth: 32, frameHeight: 32, frameCount: 1, hitboxWidth: 24, hitboxHeight: 24, sourceFrameIndexes: [0] }),
  verticeSpriteAnimation({ id: "storm-drone-attack", name: "attack", spriteSheet: "storm-drone.png", frameWidth: 32, frameHeight: 32, frameCount: 1, state: "attack", loops: false, hitboxWidth: 24, hitboxHeight: 24, sourceFrameIndexes: [1] }),
  verticeSpriteAnimation({ id: "storm-shot-animation", name: "storm-shot", spriteSheet: "storm-shot.png", frameWidth: 8, frameHeight: 8, frameCount: 2 }),
  verticeSpriteAnimation({ id: "storm-bolt-animation", name: "storm-bolt", spriteSheet: "storm-bolt.png", frameWidth: 16, frameHeight: 16, frameCount: 2 }),
  verticeSpriteAnimation({ id: "animation-battle-party-mechanic-idle-v2", name: "battle_party_mechanic_idle_v2", spriteSheet: "battle-rpg-scene-party-mechanic-alpha128-v2.png", frameWidth: 64, frameHeight: 64, frameCount: 1, sourceFrameIndexes: [0], originX: 32, originY: 64, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "animation-battle-party-mechanic-walk-v2", name: "battle_party_mechanic_walk_v2", spriteSheet: "battle-rpg-scene-party-mechanic-alpha128-v2.png", frameWidth: 64, frameHeight: 64, frameCount: 2, state: "walk", fps: 8, sourceFrameIndexes: [1, 4], originX: 32, originY: 64, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "animation-battle-party-mechanic-attack-v2", name: "battle_party_mechanic_attack_v2", spriteSheet: "battle-rpg-scene-party-mechanic-alpha128-v2.png", frameWidth: 64, frameHeight: 64, frameCount: 2, state: "attack", fps: 10, loops: false, sourceFrameIndexes: [2, 3], originX: 32, originY: 64, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "animation-battle-party-mechanic-hurt-v2", name: "battle_party_mechanic_hurt_v2", spriteSheet: "battle-rpg-scene-party-mechanic-alpha128-v2.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "hurt", loops: false, sourceFrameIndexes: [0], originX: 32, originY: 64, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "animation-battle-enemy-large-robot-idle-v2", name: "battle_enemy_large_robot_idle_v2", spriteSheet: "battle-rpg-scene-enemy-large-robot-alpha128-v2.png", frameWidth: 64, frameHeight: 64, frameCount: 1, sourceFrameIndexes: [0], originX: 32, originY: 64, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "animation-battle-enemy-large-robot-attack-v2", name: "battle_enemy_large_robot_attack_v2", spriteSheet: "battle-rpg-scene-enemy-large-robot-alpha128-v2.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "attack", fps: 10, loops: false, sourceFrameIndexes: [1], originX: 32, originY: 64, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "animation-battle-enemy-large-robot-hurt-v2", name: "battle_enemy_large_robot_hurt_v2", spriteSheet: "battle-rpg-scene-enemy-large-robot-alpha128-v2.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "hurt", loops: false, sourceFrameIndexes: [2], originX: 32, originY: 64, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "companion-animation", name: "companion", spriteSheet: "companion.png", frameWidth: 16, frameHeight: 16, frameCount: 2 }),
  verticeSpriteAnimation({ id: "battle-ui-animation", name: "battle-ui", spriteSheet: "battle-ui.png", frameWidth: 16, frameHeight: 16, frameCount: 1 }),
  verticeSpriteAnimation({ id: "nara-fighter-idle", name: "idle", spriteSheet: "nara-fighter.png", frameWidth: 64, frameHeight: 64, frameCount: 1, sourceFrameIndexes: [0], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "nara-fighter-walk", name: "walk", spriteSheet: "nara-fighter.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "walk", sourceFrameIndexes: [1], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "nara-fighter-jump", name: "jump", spriteSheet: "nara-fighter.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "jump", sourceFrameIndexes: [4], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "nara-fighter-fall", name: "fall", spriteSheet: "nara-fighter.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "fall", sourceFrameIndexes: [3], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "nara-fighter-attack", name: "attack", spriteSheet: "nara-fighter.png", frameWidth: 64, frameHeight: 64, frameCount: 2, state: "attack", loops: false, sourceFrameIndexes: [2, 3], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "nara-fighter-hurt", name: "hurt", spriteSheet: "nara-fighter.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "hurt", loops: false, sourceFrameIndexes: [5], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "rival-arena-idle", name: "arena_rival_idle_left", spriteSheet: "rival-fighter.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "idle", direction: "left", fps: 8, loops: true, sourceFrameIndexes: [0], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "rival-arena-attack", name: "arena_rival_attack_left", spriteSheet: "rival-fighter.png", frameWidth: 64, frameHeight: 64, frameCount: 2, state: "attack", direction: "left", fps: 12, loops: false, sourceFrameIndexes: [2, 3], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "rival-arena-special", name: "arena_rival_special_left", spriteSheet: "rival-fighter.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "special", direction: "left", fps: 10, loops: false, sourceFrameIndexes: [4], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "rival-arena-guard", name: "arena_rival_guard_left", spriteSheet: "rival-fighter.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "guard", direction: "left", fps: 8, loops: true, sourceFrameIndexes: [1], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 }),
  verticeSpriteAnimation({ id: "rival-arena-hurt", name: "arena_rival_hurt_left", spriteSheet: "rival-fighter.png", frameWidth: 64, frameHeight: 64, frameCount: 1, state: "hurt", direction: "left", fps: 8, loops: false, sourceFrameIndexes: [5], hitboxX: 24, hitboxY: -16, hitboxWidth: 16, hitboxHeight: 16 })
]);

const VERTICE_TEMPESTADE_V3_STATES = Object.freeze([
  verticeSpriteState("tempestade-v3-player-state", "tempestade-v3-player.png", ["tempestade-v3-player-fly"]),
  verticeSpriteState("tempestade-v3-drone-horizontal-state", "tempestade-v3-drone-horizontal.png", ["tempestade-v3-drone-horizontal-idle"]),
  verticeSpriteState("tempestade-v3-drone-vertical-state", "tempestade-v3-drone-vertical.png", ["tempestade-v3-drone-vertical-idle"]),
  verticeSpriteState("tempestade-v3-boss-lighthouse-state", "tempestade-v3-boss-lighthouse.png", ["tempestade-v3-boss-lighthouse-idle"])
]);

const VERTICE_CLIMAX_STATES = Object.freeze([
  ...VERTICE_TEMPESTADE_V3_STATES,
  verticeSpriteState("nara-portrait-state", "nara-portrait.png", ["nara-portrait-animation"]),
  verticeSpriteState("guardian-portrait-state", "guardian-portrait.png", ["guardian-portrait-animation"]),
  verticeSpriteState("dialogue-sigil-state", "dialogue-sigil.png", ["dialogue-sigil-animation"]),
  verticeSpriteState("nara-flight-state", "nara-flight.png", ["nara-flight-fly", "nara-flight-bank-right", "nara-flight-bank-left", "nara-flight-hurt"]),
  verticeSpriteState("storm-drone-state", "storm-drone.png", ["storm-drone-idle", "storm-drone-attack"]),
  verticeSpriteState("storm-shot-state", "storm-shot.png", ["storm-shot-animation"]),
  verticeSpriteState("storm-bolt-state", "storm-bolt.png", ["storm-bolt-animation"]),
  verticeSpriteState("nara-battle-state", "battle-rpg-scene-party-mechanic-alpha128-v2.png", ["animation-battle-party-mechanic-idle-v2", "animation-battle-party-mechanic-walk-v2", "animation-battle-party-mechanic-attack-v2", "animation-battle-party-mechanic-hurt-v2"]),
  verticeSpriteState("relay-guardian-state", "battle-rpg-scene-enemy-large-robot-alpha128-v2.png", ["animation-battle-enemy-large-robot-idle-v2", "animation-battle-enemy-large-robot-attack-v2", "animation-battle-enemy-large-robot-hurt-v2"]),
  verticeSpriteState("companion-state", "companion.png", ["companion-animation"]),
  verticeSpriteState("battle-ui-state", "battle-ui.png", ["battle-ui-animation"]),
  verticeSpriteState("nara-fighter-state", "nara-fighter.png", ["nara-fighter-idle", "nara-fighter-walk", "nara-fighter-jump", "nara-fighter-fall", "nara-fighter-attack", "nara-fighter-hurt"]),
  verticeSpriteState("rival-fighter-state", "rival-fighter.png", [
    "rival-arena-idle",
    "rival-arena-attack",
    "rival-arena-special",
    "rival-arena-guard",
    "rival-arena-hurt"
  ])
]);

const VERTICE_RACING_ANIMATIONS = Object.freeze([
  verticeRacerAnimation("racing-nara-animation", "nara-racer.png"),
  verticeRacerAnimation("racing-rival-animation", "rival-racer.png")
]);

const VERTICE_RACING_STATES = Object.freeze([
  verticeRacerState("racing-nara-state", "nara-racer.png", "racing-nara-animation"),
  verticeRacerState("racing-rival-state", "rival-racer.png", "racing-rival-animation")
]);

function replaceSceneReference(value, sceneNames) {
  if (Array.isArray(value)) return value.map((child) => replaceSceneReference(child, sceneNames));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, replaceSceneReference(child, sceneNames)])
    );
  }
  if (typeof value !== "string") return value;
  return sceneNames.get(value) ?? value;
}

function verticeVariables() {
  return [...Object.entries(VERTICE_PROGRESS_VARIABLES), ...Object.entries(VERTICE_INTERFACE_VARIABLES)].map(([key, name]) => ({
    id: `vertice-variable-${key.replaceAll(/[^a-zA-Z0-9]+/g, "-")}`,
    gbStudioVariableID: `vertice-variable-${key.replaceAll(/[^a-zA-Z0-9]+/g, "-")}`,
    name,
    displayName: key,
    initialValue: key === "audioMasterVolume" ? 100
      : key === "audioMusicVolume" ? 80
        : key === "audioSfxVolume" ? 90
          : key === "audioEnabled" ? 1
            : 0,
    ...(key === "characterName" ? { valueType: "text", maxLength: 8 } : {})
  }));
}

function verticeLutaActors() {
  return [
    {
      id: "nara-fighter", name: "Nara · Arena", roomName: "arena_arrancada", x: 3, y: 6, spriteSheet: "nara-fighter.png", animationName: "idle", animationStateID: "nara-fighter-state",
      lutaAnimations: { fallback: "idle_animation", idle: "idle", attack: "attack", special: "jump", guard: "walk", hurt: "hurt" },
      battle: { side: "player1", maxHp: 100, attack: 14, defense: 10, speed: 12, weight: 70, guardPower: 48, throwRange: 16, superLevel: 2, abilities: ["attack", "special"] }
    },
    {
      id: "rival-fighter", name: "Rival · Arena", roomName: "arena_arrancada", x: 12, y: 6, spriteSheet: "rival-fighter.png", animationName: "arena_rival_idle_left", animationStateID: "rival-fighter-state",
      lutaAnimations: {
        fallback: "idle_animation",
        idle: "arena_rival_idle_left",
        attack: "arena_rival_attack_left",
        special: "arena_rival_special_left",
        guard: "arena_rival_guard_left",
        hurt: "arena_rival_hurt_left"
      },
      battle: { side: "player2", maxHp: 96, attack: 13, defense: 9, speed: 13, weight: 65, guardPower: 48, throwRange: 16, superLevel: 1, abilities: ["attack", "special"] }
    }
  ];
}

function verticeRacingCollisionTypes(width = 60, height = 40) {
  const collisionTypes = Array.from({ length: width * height }, () => "solid");
  const trackSpans = [
    [5, [[0, 59]]],
    [6, [[0, 59]]],
    [7, [[0, 59]]],
    [8, [[0, 59]]],
    [9, [[0, 59]]],
    [10, [[0, 59]]],
    [11, [[0, 59]]],
    [12, [[0, 59]]],
    [13, [[0, 59]]],
    [14, [[0, 59]]],
    [15, [[0, 59]]],
    [16, [[0, 59]]],
    [17, [[0, 59]]],
    [18, [[20, 55]]],
    [19, [[20, 50]]],
    [20, [[20, 49]]],
    [21, [[20, 48]]],
    [22, [[20, 47]]],
    [23, [[20, 46]]],
    [24, [[20, 45]]],
    [25, [[21, 45]]],
    [26, [[21, 44]]],
    [27, [[22, 44]]],
    [28, [[22, 43]]],
    [29, [[24, 42]]]
  ];
  for (const [y, spans] of trackSpans) {
    for (const [x0, x1] of spans) {
      for (let x = x0; x <= x1; x += 1) {
        if (x >= 0 && x < width && y >= 0 && y < height) collisionTypes[y * width + x] = "free";
      }
    }
  }
  return collisionTypes;
}

function verticeRacingActors() {
  return [
    {
      id: "racing-nara",
      name: "Carro de Nara",
      roomName: "circuito_final",
      x: 28,
      y: 10,
      z: 0,
      spriteSheet: "nara-racer.png",
      animationName: "racing",
      animationStateID: "racing-nara-state",
      eventBindings: {}
    },
    {
      id: "racing-rival",
      name: "Rival de Nara",
      roomName: "circuito_final",
      x: 18,
      y: 11,
      z: 0,
      spriteSheet: "rival-racer.png",
      animationName: "racing",
      animationStateID: "racing-rival-state",
      eventBindings: {}
    },
    {
      id: "racing-rival-2",
      name: "Rival da Ilha",
      roomName: "circuito_final",
      x: 38,
      y: 11,
      z: 0,
      spriteSheet: "rival-racer.png",
      animationName: "racing",
      animationStateID: "racing-rival-state",
      eventBindings: {}
    }
  ];
}

function verticeTacticalArenaActors() {
  return [
    {
      id: "tactical-nara",
      name: "Nara · Arena Tática",
      roomName: "arena_tatica",
      x: 2,
      y: 4,
      z: 0,
      spriteSheet: "tactical-nara-v2.png",
      animationName: "idle_down",
      animationStateID: "tactical-nara-v2-state",
      eventBindings: {}
    },
    {
      id: "tactical-sentinel",
      name: "Sentinela · Arena Tática",
      roomName: "arena_tatica",
      x: 8,
      y: 3,
      z: 0,
      spriteSheet: "tactical-sentinel-v2.png",
      animationName: "idle_down",
      animationStateID: "tactical-sentinel-v2-state",
      eventBindings: {}
    }
  ];
}

function verticeTempestadeActors() {
  return [
    {
      id: "tempestade-v3-player",
      name: "Aeronave de Nara",
      roomName: "tempestade",
      x: 11,
      y: 8,
      spriteSheet: "tempestade-v3-player.png",
      animationName: "fly",
      animationStateID: "tempestade-v3-player-state"
    },
    ...[
      ["tempestade-v3-drone-horizontal", 46, 5, "tempestade-v3-drone-horizontal.png", "tempestade-v3-drone-horizontal-state"],
      ["tempestade-v3-drone-vertical", 64, 13, "tempestade-v3-drone-vertical.png", "tempestade-v3-drone-vertical-state"]
    ].map(([id, x, y, spriteSheet, animationStateID]) => ({
      id,
      name: "Drone",
      roomName: "tempestade",
      x,
      y,
      spriteSheet,
      animationName: "idle",
      animationStateID,
      eventName: "tempestade_drone_disparar",
      scriptName: "tempestade_drone_disparar",
      eventBindings: { onInteract: "tempestade_drone_disparar" }
    })),
    {
      id: "tempestade-v3-boss-lighthouse",
      name: "Farol da Tempestade",
      roomName: "tempestade",
      x: 79,
      y: 11,
      spriteSheet: "tempestade-v3-boss-lighthouse.png",
      animationName: "idle",
      animationStateID: "tempestade-v3-boss-lighthouse-state"
    }
  ];
}

function verticePenedosActors() {
  return [
    {
      id: "penedos-player",
      name: "Nara · Penedos",
      roomName: "penedos_vento",
      x: 6,
      y: 13,
      z: 0,
      spriteSheet: "nara-penedos-platformer-64x64.png",
      animationName: "idle_right",
      animationStateID: "nara-penedos-platformer-state",
      gbStudioPlayerRuntime: "PLATFORM",
      eventBindings: {}
    },
    {
      id: "penedos-crab",
      name: "Caranguejo · Penedos",
      roomName: "penedos_vento",
      x: 27,
      y: 12,
      z: 0,
      spriteSheet: "penedos-enemies-32x32.png",
      animationName: "crab_idle",
      animationStateID: "penedos-enemies-state",
      eventBindings: {}
    },
    {
      id: "penedos-moth",
      name: "Mariposa · Penedos",
      roomName: "penedos_vento",
      x: 14,
      y: 8,
      z: 0,
      spriteSheet: "penedos-enemies-32x32.png",
      animationName: "moth_idle",
      animationStateID: "penedos-enemies-state",
      eventBindings: {}
    },
    {
      id: "penedos-slime",
      name: "Gosma · Penedos",
      roomName: "penedos_vento",
      x: 23,
      y: 13,
      z: 0,
      spriteSheet: "penedos-enemies-32x32.png",
      animationName: "slime_idle",
      animationStateID: "penedos-enemies-state",
      eventBindings: {}
    }
  ];
}

function verticeUsinaActors() {
  return [
    {
      id: "usina-combat-gate",
      name: "Porta da sentinela",
      roomName: "usina_submersa",
      x: 14,
      y: 5,
      z: 0,
      width: 1,
      height: 1,
      spriteSheet: "usina-sentinel-v2.png",
      animationName: "sentinel_far",
      animationStateID: "usina-sentinel-v2-state",
      eventName: "usina_abrir_combate",
      scriptName: "usina_abrir_combate",
      eventBindings: { onInteract: "usina_abrir_combate" }
    },
    {
      id: "usina-sentinel-v2",
      name: "Sentinela da Usina",
      roomName: "usina_combate",
      x: 14,
      y: 5,
      z: 0,
      width: 1,
      height: 1,
      spriteSheet: "usina-sentinel-v2.png",
      animationName: "sentinel_far",
      animationStateID: "usina-sentinel-v2-state",
      eventName: "usina_sentinela",
      scriptName: "usina_sentinela",
      eventBindings: { onInteract: "usina_sentinela" }
    },
    {
      id: "usina-energy-cell-v2",
      name: "Célula de energia",
      roomName: "usina_saida",
      x: 17,
      y: 4,
      z: 0,
      spriteSheet: "usina-energy-cell-v2.png",
      animationName: "energy_cell_idle",
      animationStateID: "usina-energy-cell-v2-state",
      eventName: "usina_coletar_celula",
      scriptName: "usina_coletar_celula",
      eventBindings: { onInteract: "usina_coletar_celula" }
    }
  ];
}

function verticeBattleRpgActors() {
  return [
    {
      id: "nara-guardian", name: "Nara · Mecânica", roomName: "guardiao_rele", x: 7, y: 14,
      spriteSheet: "battle-rpg-scene-party-mechanic-alpha128-v2.png", animationName: "battle_party_mechanic_idle_v2", animationStateID: "nara-battle-state",
      battle: { side: "party", maxHp: 96, attack: 12, defense: 10, speed: 11, abilities: ["attack", "magic"] }
    },
    {
      id: "relay-guardian", name: "Guardião do Relé", roomName: "guardiao_rele", x: 20, y: 13,
      spriteSheet: "battle-rpg-scene-enemy-large-robot-alpha128-v2.png", animationName: "battle_enemy_large_robot_idle_v2", animationStateID: "relay-guardian-state",
      battle: { side: "enemy", maxHp: 112, attack: 13, defense: 11, speed: 8, abilities: ["attack", "defend"] }
    }
  ];
}

function verticeCouncilActors() {
  return [
    {
      id: "council-nara",
      name: "Retrato de Nara",
      roomName: "conselho_guardia",
      x: 7,
      y: 15,
      z: 0,
      spriteSheet: "nara-portrait.png",
      animationName: "nara-portrait",
      animationStateID: "nara-portrait-state",
      eventName: "conselho_confirmar_alianca",
      scriptName: "conselho_confirmar_alianca",
      eventBindings: { onInteract: "conselho_confirmar_alianca" }
    },
    {
      id: "council-guardian",
      name: "Retrato da Guardiã",
      roomName: "conselho_guardia",
      x: 22,
      y: 15,
      z: 0,
      spriteSheet: "guardian-portrait.png",
      animationName: "guardian-portrait",
      animationStateID: "guardian-portrait-state",
      eventName: "conselho_confirmar_alianca",
      scriptName: "conselho_confirmar_alianca",
      eventBindings: { onInteract: "conselho_confirmar_alianca" }
    }
  ];
}

function verticeTriggers() {
  const scene = (name) => VERTICE_CAMPAIGN_SCENES.find((candidate) => candidate.name === name);
  const support = (name) => VERTICE_SUPPORT_SCENES.find((candidate) => candidate.name === name);
  const port = scene("porto_lumen");
  const lighthouse = support("farol_interior");
  const penedos = scene("penedos_vento");
  const market = scene("mercado_suspenso");
  const usina = scene("usina_submersa");
  const usinaCombat = scene("usina_combate");
  const usinaExit = scene("usina_saida");
  return [
    {
      id: "trigger-porto-exit",
      name: "Saída para a rota dos faróis",
      roomName: port.name,
      x: port.exit.x,
      y: port.exit.y,
      width: port.exit.width,
      height: port.exit.height,
      eventName: "porto_abrir_mapa",
      eventBindings: { onEnter: "porto_abrir_mapa" }
    },
    {
      id: "trigger-porto-lighthouse",
      name: "Entrada do farol",
      roomName: port.name,
      x: 9,
      y: 9,
      width: 4,
      height: 3,
      eventName: "porto_entrar_farol",
      eventBindings: { onInteract: "porto_entrar_farol" }
    },
    {
      id: "trigger-lighthouse-lens",
      name: "Lente do farol",
      roomName: lighthouse.name,
      x: 19,
      y: 8,
      width: 7,
      height: 3,
      eventName: "farol_examinar_lente",
      eventBindings: { onInteract: "farol_examinar_lente" }
    },
    {
      id: "trigger-lighthouse-exit",
      name: "Saída para Porto de Lúmen",
      roomName: lighthouse.name,
      x: 20,
      y: 26,
      width: 5,
      height: 4,
      eventName: "farol_sair_porto",
      eventBindings: { onEnter: "farol_sair_porto" }
    },
    {
      id: "trigger-penedos-grip-module",
      name: "Módulo de aderência",
      roomName: penedos.name,
      x: 25,
      y: 13,
      width: 1,
      height: 1,
      eventName: "penedos_recolher_aderencia",
      eventBindings: { onEnter: "penedos_recolher_aderencia" }
    },
    {
      id: "trigger-market-bridge",
      name: "Ponte de carga",
      roomName: market.name,
      x: 24,
      y: 14,
      width: 1,
      height: 1,
      eventBindings: { onInteract: "mercado_abrir_atalho" }
    },
    {
      id: "trigger-market-exit",
      name: "Saída para a Usina Submersa",
      roomName: market.name,
      x: 31,
      y: 2,
      width: 2,
      height: 1,
      eventBindings: { onInteract: "mercado_abrir_usina" }
    },
    {
      id: "trigger-usina-combat-door",
      name: "Porta da sentinela",
      roomName: usina.name,
      x: usina.exit.x,
      y: usina.exit.y,
      width: usina.exit.width,
      height: usina.exit.height,
      eventName: "usina_abrir_combate",
      eventBindings: { onEnter: "usina_abrir_combate" }
    },
    {
      id: "trigger-usina-combat-exit",
      name: "Saída do combate",
      roomName: usinaCombat.name,
      x: usinaCombat.exit.x,
      y: usinaCombat.exit.y,
      width: usinaCombat.exit.width,
      height: usinaCombat.exit.height,
      eventName: "usina_vencer_combate",
      eventBindings: { onEnter: "usina_vencer_combate" }
    },
    {
      id: "trigger-usina-exit",
      name: "Antecâmara da Guardiã",
      roomName: usinaExit.name,
      x: usinaExit.exit.x,
      y: usinaExit.exit.y,
      width: usinaExit.exit.width,
      height: usinaExit.exit.height,
      eventName: "usina_encontrar_guardia",
      eventBindings: { onEnter: "usina_encontrar_guardia" }
    }
  ];
}

function finalizeVerticeProject(project) {
  const sourceToVertice = new Map(
    Object.entries(VERTICE_SOURCE_SCENES).map(([verticeName, sourceName]) => [sourceName, verticeName])
  );
  const finalizedScenes = project.scenas.map((scene) => {
    const definition = VERTICE_CAMPAIGN_SCENES.find((candidate) => candidate.name === scene.name);
    const hudPresetId = VERTICE_SCENE_HUD_PRESET_BY_SCENE[scene.name];
    const authoredRuntime = definition ? verticeRuntime(definition, scene.runtime) : scene.runtime;
    const runtime = authoredRuntime?.type === "menu"
      ? {
        ...authoredRuntime,
        config: {
          ...(authoredRuntime.config && typeof authoredRuntime.config === "object" ? authoredRuntime.config : {}),
          ...(scene.name === "configuracoes"
            ? { hudMode: undefined, presentationMode: "hud", hudPresetId: "hud-menu-settings" }
            : { hudMode: "none", hudPresetId: undefined })
        }
      }
      : authoredRuntime;
    const eventBindings = scene.eventBindings && typeof scene.eventBindings === "object"
      ? scene.eventBindings
      : {};
    const finalized = {
      ...scene,
      showcase: verticeShowcaseSceneClassification(scene),
      music: VERTICE_MUSIC_BY_SCENE[scene.name] ?? "",
      ...(definition ? {
        runtime,
        playerActorName: VERTICE_ACTIVE_ACTOR_SCENES.has(scene.name) && scene.name !== VERTICE_TITLE_SCENE && scene.name !== "mapa_rota"
          ? (VERTICE_PLAYER_ACTOR_NAMES[scene.name] ?? scene.playerActorName)
          : ""
      } : authoredRuntime?.type === "menu" ? { runtime } : {}),
      ...(runtime?.type === "menu"
        ? scene.name === "configuracoes"
          ? { hudPresetId: "hud-menu-settings" }
          : { hudPresetId: undefined }
        : hudPresetId ? { hudPresetId } : {}),
      eventBindings: {
        ...eventBindings,
        ...(scene.name === "tempestade" ? {
          onClear: "tempestade_concluir"
        } : {}),
        ...(scene.name === "circuito_final" ? {
          onVictory: "circuito_concluir",
          onDefeat: "circuito_reiniciar"
        } : {})
      }
    };
    if (VERTICE_NON_COLLISION_RUNTIME_TYPES.has(finalized.runtime?.type)) {
      const cellCount = Math.max(1, Number(finalized.width) * Number(finalized.height));
      finalized.collisionTypes = Array.from({ length: cellCount }, () => "free");
      finalized.collisions = [...finalized.collisionTypes];
    }
    if (scene.name === "tempestade") {
      return approvedTempestadeShmupScene(finalized);
    }
    if (VERTICE_NARRATIVE_BACKGROUND_BY_SCENE[scene.name]) {
      return {
        ...finalized,
        backgroundAssetName: VERTICE_NARRATIVE_BACKGROUND_BY_SCENE[scene.name],
        tileLayers: []
      };
    }
    if (scene.name === "porto_lumen") {
      return approvedPortLumenScene(finalized);
    }
    if (scene.name === "mapa_rota") {
      return approvedRouteMapScene(finalized);
    }
    if (scene.name === "penedos_vento") {
      return approvedPenedosPlatformerScene(finalized);
    }
    if (scene.name === "mercado_suspenso") {
      return approvedMarketSuspensoScene(finalized);
    }
    if (scene.name === "usina_submersa") {
      return approvedUsinaBackgroundScene(finalized, "exploration");
    }
    if (scene.name === "usina_combate") {
      return approvedUsinaBackgroundScene(finalized, "combat");
    }
    if (scene.name === "usina_saida") {
      return approvedUsinaBackgroundScene(finalized, "exit");
    }
    if (scene.name === "arena_arrancada") {
      return {
        ...finalized,
        runtime: {
          ...finalized.runtime,
          config: {
            ...(finalized.runtime?.config ?? {}),
            hudAssetName: "fight-hud-v2-arena-bank-05.png"
          }
        },
        backgroundAssetName: "arena-gba.png",
        tileLayers: []
      };
    }
    if (scene.name === "circuito_final") {
      const raceWidth = 60;
      const raceHeight = 40;
      const raceCollisionTypes = verticeRacingCollisionTypes(raceWidth, raceHeight);
      return {
        ...finalized,
        width: raceWidth,
        height: raceHeight,
        cameraBounds: { x: 0, y: 0, width: raceWidth, height: raceHeight },
        tilemap: Array(raceWidth * raceHeight).fill(0),
        collisions: raceCollisionTypes,
        heightLevels: Array(raceWidth * raceHeight).fill(0),
        backgroundAssetName: "circuit-topdown.png",
        backgroundRenderMode: "tilemap",
        gbStudioUseBackgroundLayout: true,
        collisionTypes: raceCollisionTypes,
        tileLayers: []
      };
    }
    if (VERTICE_ACTIVE_ART_SCENES.has(scene.name) || VERTICE_SUPPORT_SCENES.some((candidate) => candidate.name === scene.name)) {
      return finalized;
    }
    return {
      ...finalized,
      backgroundAssetName: "",
      tileLayers: []
    };
  });
  const eventAudioCommands = new Map([
    ["titulo_ao_entrar", "play_music farol_tema_principal"],
    ["titulo_abrir_menu", "play_sfx farol_sfx_cursor"],
    ["menu_inicial_novo_jogo", "play_sfx farol_sfx_confirmar"],
    ["abertura_concluir", "play_sfx farol_sfx_sinal"],
    ["penedos_recolher_aderencia", "play_sfx farol_sfx_salto"],
    ["usina_vencer_combate", "play_sfx farol_sfx_impacto"],
    ["usina_coletar_celula", "play_sfx farol_sfx_item"],
    ["usina_encontrar_guardia", "play_sfx farol_sfx_porta"],
    ["porto_entrar_farol", "play_sfx farol_sfx_porta"],
    ["farol_interior_ao_entrar", "play_sfx farol_sfx_porta"],
    ["farol_examinar_lente", "play_sfx farol_sfx_sinal"],
    ["farol_sair_porto", "play_sfx farol_sfx_porta"],
    ["circuito_ao_entrar", "play_sfx farol_sfx_motor"],
    ["tempestade_alcancar_rele", "play_sfx farol_sfx_alarme"],
    ["circuito_concluir", "play_sfx farol_sfx_vitoria"]
  ]);
  const finalizedEvents = project.events.map((event) => {
    const steps = Array.isArray(event.steps) ? event.steps : [];
    const audioCommand = eventAudioCommands.get(event.name);
    const hasAudioCommand = steps.some((step) => /^(play_music|play_sfx|set_text_sfx)\s/.test(String(step?.command ?? "")));
    return {
      ...event,
      steps: audioCommand && !hasAudioCommand
        ? [{ id: `${event.id ?? event.name}-audio`, command: audioCommand, isEnabled: true }, ...steps]
        : steps
    };
  });
  const finalizedActors = project.actors
    .filter((actor) => VERTICE_ACTIVE_ACTOR_SCENES.has(actor.roomName))
    .filter((actor) => !actor.spriteSheet || CANONICAL_EXAMPLE_ASSET_NAMES.has(actor.spriteSheet))
    .filter((actor) => actor.roomName !== "configuracoes")
    .filter((actor) => actor.name !== "VOLTAR" && actor.spriteSheet !== "menu-back.png")
    .filter((actor) => actor.roomName !== "titulo" || VERTICE_TITLE_SCREEN_ACTOR_IDS.has(actor.id))
    .filter((actor) => actor.roomName !== "menu_inicial" || VERTICE_INITIAL_MENU_ACTOR_IDS.has(actor.id))
    .filter((actor) => !(
      actor.roomName === "menu_start" &&
      ["settings", "tactical"].includes(actor.menuItemID)
    ))
    .filter((actor) => !(
      actor.roomName === "inventario" &&
      ["Seta de seleção", "Ícone de módulos"].includes(actor.name)
    ))
    .filter((actor) => !(
      actor.roomName === "mapa_menu" &&
      ["Aeronave no mapa", "Farol de rota", "Seta de seleção"].includes(actor.name)
    ))
    .filter((actor) => !(
      actor.roomName === "salvar" &&
      ["VOLTAR", "Seta de seleção"].includes(actor.name)
    ))
    .filter((actor) => !(
      actor.roomName === "salvar" &&
      String(actor.id ?? "").startsWith("menu-salvar-slot-")
    ))
    .filter((actor) => !(
      actor.roomName === "configuracoes" &&
      actor.name === "Seta de seleção"
    ))
    .filter((actor) => actor.roomName !== "perfil_equipe" || String(actor.spriteSheet ?? "").startsWith("profile-team-"))
    .filter((actor) => !(
      actor.roomName === "arena_arrancada" &&
      (actor.battle?.side === "party" || actor.battle?.side === "enemy")
    ))
    .map((actor) => {
      const sourceScene = project.scenas.find((scene) => scene.name === actor.roomName);
      const isScenePlayer = sourceScene?.playerActorName === actor.name
        || (actor.roomName === "circuito_final" && actor.name === VERTICE_PLAYER_ACTOR_NAMES.circuito_final);
      const isRacingRival = actor.roomName === "circuito_final" && !isScenePlayer;
      if (actor.roomName === "titulo") {
        if (actor.id === "title-logo-v2") {
          return {
            ...actor,
            name: "TITLE LOGO · O Último Farol",
            x: 7,
            y: 0,
            spriteSheet: "title-logo-actor-128x88.png",
            animationName: "title-logo-actor-128x88",
            animationStateID: "title-logo-actor-128x88-state"
          };
        }
        const titleLogoSegment = TITLE_LOGO_RUNTIME_SEGMENTS.find((segment) => actor.id === `title-game-logo-${segment.id}`)
          ?? (actor.id === "title-game-logo" ? TITLE_LOGO_RUNTIME_SEGMENTS[0] : null);
        if (titleLogoSegment) {
          return {
            ...actor,
            id: `title-game-logo-${titleLogoSegment.id}`,
            name: `Título · ${titleLogoSegment.id}`,
            x: titleLogoSegment.x,
            y: titleLogoSegment.y,
            spriteSheet: `title-logo-emblem-${titleLogoSegment.id}.png`,
            animationName: `title-logo-emblem-${titleLogoSegment.id}`,
            animationStateID: `title-logo-emblem-${titleLogoSegment.id}-state`,
            menuEntryAnimation: "slide_down",
            menuEntryOffsetY: 16,
            menuEntryAnimationFrames: 20
          };
        }
        if (actor.id === "title-press-start") {
          return {
            ...actor,
            name: "PRESS START",
            x: 10,
            y: 13,
            spriteSheet: "press-start-actor-88x32.png",
            animationName: "press-start-actor",
            animationStateID: "press-start-actor-state",
            eventName: "titulo_abrir_menu",
            inputBinding: "Start"
          };
        }
        const isEmblem = actor.name.includes("Emblema");
        return {
          ...actor,
          name: isEmblem ? "Emblema de Vértice" : "Cursor de Vértice",
          spriteSheet: isEmblem ? "title-emblem.png" : "airship.png",
          animationName: isEmblem ? "title-emblem" : "airship",
          animationStateID: isEmblem ? "title-emblem-state" : "airship-state"
        };
      }
      if (actor.roomName === "prologo") {
        const isRival = actor.id === "prologue-rival" || actor.name.includes("Rival");
        const isNara = actor.name.includes("Nara");
        return {
          ...actor,
          name: isRival ? "Rival · Prólogo" : isNara ? "Nara · Prólogo" : "Aeronave danificada",
          spriteSheet: isRival ? "rival-cutscene.png" : isNara ? "nara-topdown.png" : "airship.png",
          animationName: isRival ? "rival-cutscene" : isNara ? "idle_down" : "airship",
          animationStateID: isRival ? "rival-cutscene-state" : isNara ? "nara-topdown-state" : "airship-state"
        };
      }
      if (actor.roomName === "porto_lumen") {
        const isApprovedPortActor = [
          "player-pilot-32x32.png",
          "npc-captain-pilot-32x32.png",
          "traveler-pilot-32x32.png",
          "mechanic-pilot-32x32.png",
          "cartographer-pilot-32x32.png",
          "fisherchild-pilot-32x32.png",
          "lighthousekeeper-pilot-32x32.png"
        ].includes(actor.spriteSheet);
        if (isApprovedPortActor) return actor;
        const isMechanic = actor.id === "port-mechanic" || actor.name.includes("Mecânica");
        const isNara = actor.name === "Nara";
        return {
          ...actor,
          name: isMechanic ? "Mecânica de Lúmen" : "Nara",
          spriteSheet: isMechanic ? "mechanic.png" : "nara-topdown.png",
          animationName: isMechanic ? "idle_down" : "idle_down",
          animationStateID: isMechanic ? "mechanic-state" : "nara-topdown-state"
        };
      }
      if (actor.roomName === "mapa_rota") {
        const isCursor = actor.worldMapRole === "cursor";
        return {
          ...actor,
          name: isCursor ? "Aeronave no mapa" : "Farol de rota",
          spriteSheet: isCursor ? "airship.png" : "route-beacon.png",
          animationName: isCursor ? "airship" : "route-beacon",
          animationStateID: isCursor ? "airship-state" : "route-beacon-state"
        };
      }
      if (actor.roomName === "penedos_vento") {
        if (actor.spriteSheet === "penedos-enemies-32x32.png") return actor;
        const isNara = isScenePlayer || actor.id === "penedos-player" || actor.name.includes("Nara");
        const isPenedosPlayer = isNara && (isScenePlayer || actor.id === "penedos-player");
        return {
          ...actor,
          name: isNara ? "Nara · Penedos" : "Drone dos Penedos",
          ...(isNara ? { x: 6, y: 13 } : {}),
          spriteSheet: isPenedosPlayer ? "nara-penedos-platformer-64x64.png" : isNara ? "nara-topdown.png" : "cliff-prop.png",
          animationName: isNara ? "idle_right" : "cliff-prop",
          animationStateID: isPenedosPlayer ? "nara-penedos-platformer-state" : isNara ? "nara-topdown-state" : "cliff-prop-state"
        };
      }
      if (actor.roomName === "mercado_suspenso") {
        if (actor.id === "market-nara" || isScenePlayer) return {
          ...actor,
          name: "Aventureiro · Mercado",
          spriteSheet: "tactical-nara-v5.png",
          animationName: "idle_down",
          animationStateID: "market-adventure-player-state"
        };
        if (actor.id === "market-trader-v2") return {
          ...actor,
          name: "Mercador suspenso",
          spriteSheet: "market-adventure-merchant.png",
          animationName: "idle",
          animationStateID: "market-adventure-merchant-state"
        };
        if (actor.id === "market-guard-v1") return {
          ...actor,
          name: "Guarda do mercado",
          spriteSheet: "market-adventure-guard.png",
          animationName: "idle",
          animationStateID: "market-adventure-guard-state"
        };
        return {
          ...actor,
          spriteSheet: "market-adventure-merchant.png",
          animationName: "idle",
          animationStateID: "market-adventure-merchant-state"
        };
      }
      if (["usina_submersa", "usina_combate", "usina_saida"].includes(actor.roomName)) {
        const isEnergyCell = actor.id === "usina-energy-cell-v2" || actor.name.includes("célula");
        return {
          ...actor,
          name: isEnergyCell ? "Célula de energia" : actor.id === "usina-combat-gate" ? "Porta da sentinela" : "Sentinela da Usina",
          spriteSheet: isEnergyCell ? "usina-energy-cell-v2.png" : "usina-sentinel-v2.png",
          animationName: isEnergyCell ? "energy_cell_idle" : "sentinel_far",
          animationStateID: isEnergyCell ? "usina-energy-cell-v2-state" : "usina-sentinel-v2-state"
        };
      }
      if (actor.roomName === "conselho_guardia") {
        const isNara = isScenePlayer || actor.name.includes("Nara");
        return {
          ...actor,
          name: isNara ? "Retrato de Nara" : "Retrato da Guardiã",
          spriteSheet: isNara ? "nara-portrait.png" : "guardian-portrait.png",
          animationName: isNara ? "nara-portrait" : "guardian-portrait",
          animationStateID: isNara ? "nara-portrait-state" : "guardian-portrait-state"
        };
      }
      if (actor.roomName === "tempestade") {
        if (actor.id?.startsWith("tempestade-v3-")) return actor;
        const isNara = isScenePlayer || actor.name.includes("Nara");
        return {
          ...actor,
          name: isNara ? "Aeronave de Nara" : "Drone",
          spriteSheet: isNara ? "nara-flight.png" : "storm-drone.png",
          animationName: isNara ? "fly" : "idle",
          animationStateID: isNara ? "nara-flight-state" : "storm-drone-state"
        };
      }
      if (actor.roomName === "guardiao_rele") {
        const isNara = actor.battle?.side === "party" || isScenePlayer || actor.name.includes("Nara");
        return {
          ...actor,
          name: isNara ? "Nara · Mecânica" : "Guardião do Relé",
          spriteSheet: isNara ? "battle-rpg-scene-party-mechanic-alpha128-v2.png" : "battle-rpg-scene-enemy-large-robot-alpha128-v2.png",
          animationName: isNara ? "battle_party_mechanic_idle_v2" : "battle_enemy_large_robot_idle_v2",
          animationStateID: isNara ? "nara-battle-state" : "relay-guardian-state"
        };
      }
      if (actor.id === "nara-fighter" || actor.id === "rival-fighter") {
        const isNaraFighter = actor.id === "nara-fighter";
        return {
          ...actor,
          spriteSheet: isNaraFighter ? "nara-fighter.png" : "rival-fighter.png",
          animationName: isNaraFighter ? "idle" : "arena_rival_idle_left",
          animationStateID: isNaraFighter ? "nara-fighter-state" : "rival-fighter-state",
          lutaAnimations: isNaraFighter
            ? { fallback: "idle_animation", idle: "idle", attack: "attack", special: "jump", guard: "walk", hurt: "hurt" }
            : {
                fallback: "idle_animation",
                idle: "arena_rival_idle_left",
                attack: "arena_rival_attack_left",
                special: "arena_rival_special_left",
                guard: "arena_rival_guard_left",
                hurt: "arena_rival_hurt_left"
              }
        };
      }
      if (isRacingRival) {
        const { eventName: _eventName, scriptName: _scriptName, ...rival } = actor;
        return {
          ...rival,
          name: actor.id === "racing-rival-2" ? "Rival da Ilha" : "Rival de Nara",
          spriteSheet: "rival-racer.png",
          animationName: "racing",
          animationStateID: "racing-rival-state",
          eventBindings: {}
        };
      }
      if (actor.roomName === "circuito_final" && isScenePlayer) {
        return {
          ...actor,
          name: "Carro de Nara",
          spriteSheet: "nara-racer.png",
          animationName: "racing",
          animationStateID: "racing-nara-state"
        };
      }
      return isScenePlayer
        ? { ...actor, name: VERTICE_PLAYER_ACTOR_NAMES[actor.roomName] ?? actor.name }
        : actor;
  });
  const portLumenActors = [
    {
      id: "port-nara",
      name: "Nara",
      roomName: "porto_lumen",
      x: 30,
      y: 21,
      z: 0,
      spriteSheet: "nara-topdown.png",
      animationName: "idle_down",
      animationStateID: "nara-topdown-state",
      eventBindings: {}
    },
    {
      id: "port-mechanic",
      name: "Mecânica de Lúmen",
      roomName: "porto_lumen",
      x: 15,
      y: 29,
      z: 0,
      spriteSheet: "mechanic.png",
      animationName: "idle_down",
      animationStateID: "mechanic-state",
      eventName: "porto_recuperar_estrutura",
      scriptName: "porto_recuperar_estrutura",
      eventBindings: { onInteract: "porto_recuperar_estrutura" }
    }
  ];
  for (const actor of portLumenActors) {
    if (!finalizedActors.some((candidate) => candidate.id === actor.id)) finalizedActors.push(actor);
  }
  const farolInteriorActors = [
    {
      id: "farol-nara",
      name: "Nara · Farol",
      roomName: "farol_interior",
      x: 22,
      y: 24,
      z: 0,
      spriteSheet: "player-pilot-32x32.png",
      animationName: "idle_down",
      animationStateID: "nara-topdown-state",
      eventBindings: {}
    },
    {
      id: "farol-keeper",
      name: "Guardião do farol",
      roomName: "farol_interior",
      x: 11,
      y: 9,
      z: 0,
      spriteSheet: "lighthousekeeper-pilot-32x32.png",
      animationName: "idle_down",
      animationStateID: "porto-lume-lighthousekeeper-state",
      eventName: "farol_falar_guardiao",
      scriptName: "farol_falar_guardiao",
      eventBindings: { onInteract: "farol_falar_guardiao" }
    }
  ];
  for (const actor of farolInteriorActors) {
    const existingIndex = finalizedActors.findIndex((candidate) => candidate.id === actor.id);
    if (existingIndex === -1) finalizedActors.push(actor);
    else finalizedActors[existingIndex] = { ...finalizedActors[existingIndex], ...actor };
  }
  const routeMapActors = [
    {
      id: "map-cursor",
      name: "Aeronave no mapa",
      roomName: "mapa_rota",
      x: 9,
      y: 13,
      spriteSheet: "airship.png",
      animationName: "airship",
      animationStateID: "airship-state",
      worldMapRole: "cursor"
    },
    {
      id: "map-beacon",
      name: "Farol de rota",
      roomName: "mapa_rota",
      x: 17,
      y: 13,
      spriteSheet: "route-beacon.png",
      animationName: "route-beacon",
      animationStateID: "route-beacon-state",
      worldMapRole: "marker"
    }
  ];
  for (const actor of routeMapActors) {
    if (!finalizedActors.some((candidate) => candidate.id === actor.id)) finalizedActors.push(actor);
  }
  const marketSuspensoActors = [
    {
      id: "market-nara",
      name: "Aventureiro · Mercado",
      roomName: "mercado_suspenso",
      x: 16,
      y: 20,
      spriteSheet: "tactical-nara-v5.png",
      animationName: "idle_down",
      animationStateID: "market-adventure-player-state"
    },
    {
      id: "market-trader-v2",
      name: "Mercador suspenso",
      roomName: "mercado_suspenso",
      x: 15,
      y: 16,
      spriteSheet: "market-adventure-merchant.png",
      animationName: "idle",
      animationStateID: "market-adventure-merchant-state",
      followPlayer: false,
      eventName: "mercado_falar_mercador",
      scriptName: "mercado_falar_mercador",
      eventBindings: { onInteract: "mercado_falar_mercador" }
    },
    {
      id: "market-guard-v1",
      name: "Guarda do mercado",
      roomName: "mercado_suspenso",
      x: 26,
      y: 12,
      spriteSheet: "market-adventure-guard.png",
      animationName: "idle",
      animationStateID: "market-adventure-guard-state",
      followPlayer: false,
      eventBindings: { onInteract: "mercado_falar_guarda" }
    }
  ];
  for (const actor of marketSuspensoActors) {
    const existingIndex = finalizedActors.findIndex((candidate) => candidate.id === actor.id);
    if (existingIndex === -1) {
      finalizedActors.push(actor);
    } else {
      finalizedActors[existingIndex] = { ...finalizedActors[existingIndex], ...actor };
    }
  }
  if (!finalizedActors.some((actor) => actor.id === "opening-airship")) {
    finalizedActors.push({
      id: "opening-airship", name: "Aeronave · Abertura", roomName: "abertura", x: 11, y: 8,
      spriteSheet: "opening-airship.png", animationName: "opening_fly", animationStateID: "opening-airship-state"
    });
  }
  const titleLogoActor = {
    id: "title-logo-v2",
    name: "TITLE LOGO · O Último Farol",
    roomName: "titulo",
    x: 7,
    y: 0,
    spriteSheet: "title-logo-actor-128x88.png",
    animationName: "title-logo-actor-128x88",
    animationStateID: "title-logo-actor-128x88-state",
    menuEntryAnimation: "slide_down",
    menuEntryOffsetY: 16,
    menuEntryAnimationFrames: 20
  };
  if (!finalizedActors.some((actor) => actor.id === titleLogoActor.id)) {
    const pressStartIndex = finalizedActors.findIndex((actor) => actor.id === "title-press-start");
    if (pressStartIndex >= 0) finalizedActors.splice(pressStartIndex, 0, titleLogoActor);
    else finalizedActors.push(titleLogoActor);
  }
  if (!finalizedActors.some((actor) => actor.id === "title-press-start")) {
    finalizedActors.push({
      id: "title-press-start",
      name: "PRESS START",
      roomName: "titulo",
      x: 10,
      y: 13,
      spriteSheet: "press-start-actor-88x32.png",
      animationName: "press-start-actor",
      animationStateID: "press-start-actor-state",
      eventName: "titulo_abrir_menu",
      inputBinding: "Start"
    });
  }
  const initialMenuActors = [
    ["menu-new-game", "NOVO JOGO", "menu-inicial-new-game.png", "menu-new-game", "menu-new-game-state", "new-game", 6, 5],
    ["menu-load-game", "CARREGAR JOGO", "menu-inicial-load-game.png", "menu-load-game", "menu-load-game-state", "load-game", 6, 7],
    ["menu-language", "IDIOMA", "menu-inicial-language.png", "menu-language", "menu-language-state", "language", 6, 9],
    ["menu-settings", "CONFIGURAÇÕES", "menu-inicial-settings.png", "menu-settings", "menu-settings-state", "settings", 6, 11],
    ["menu-credits", "CRÉDITOS", "menu-inicial-credits.png", "menu-credits", "menu-credits-state", "credits", 6, 13]
  ];
  for (const [id, name, spriteSheet, animationName, animationStateID, menuItemID, x, y] of initialMenuActors) {
    if (finalizedActors.some((actor) => actor.id === id)) continue;
    finalizedActors.push({
      id,
      name,
      roomName: "menu_inicial",
      x,
      y,
      spriteSheet,
      animationName,
      animationStateID,
      menuActorRole: "option",
      menuItemID,
      menuEntryAnimation: "slide_down",
      menuEntryOffsetY: 16,
      menuEntryAnimationFrames: 20
    });
  }
  if (!finalizedActors.some((actor) => actor.id === "menu-logo")) {
    finalizedActors.push({
      id: "menu-logo",
      name: "O ÚLTIMO FAROL",
      roomName: "menu_inicial",
      x: 9,
      y: 1,
      spriteSheet: "title-logo-actor-96x64.png",
      animationName: "title-logo-actor-96x64",
      animationStateID: "title-logo-actor-96x64-state",
      menuActorRole: "decorative",
      menuEntryAnimation: "slide_down",
      menuEntryOffsetY: 16,
      menuEntryAnimationFrames: 20,
      menuVisualProfile: "initial-harbor"
    });
  }
  if (!finalizedActors.some((actor) => actor.id === "menu-cursor")) {
    finalizedActors.push({
      id: "menu-cursor",
      name: "Seta de seleção",
      roomName: "menu_inicial",
      x: 4,
      y: 5,
      spriteSheet: "menu-inicial-cursor.png",
      animationName: "menu-cursor",
      animationStateID: "menu-cursor-state",
      menuActorRole: "cursor",
      cursorForMenu: "initial",
      menuEntryAnimation: "slide_down",
      menuEntryOffsetY: 16,
      menuEntryAnimationFrames: 20
    });
  }
  const linkedMenuActorDefinitions = [
    [
      "menu_start",
      [
        ["title", "MENU START", "menu-start-title.png", "menu-start-start-title", "menu-start-start-title-state", "decorative", "", 9, 2],
        ["missions", "MISSÕES", "menu-missoes.png", "menu-start-missions", "menu-start-missions-state", "option", "missions", 12, 4],
        ["inventory", "INVENTÁRIO", "menu-inventario.png", "menu-start-inventory", "menu-start-inventory-state", "option", "inventory", 12, 6],
        ["map", "MAPA", "menu-mapa.png", "menu-start-map", "menu-start-map-state", "option", "map", 12, 8],
        ["profile", "PERFIL/EQUIPE", "menu-perfil-equipe.png", "menu-start-profile", "menu-start-profile-state", "option", "profile", 12, 10],
        ["save", "SALVAR", "menu-salvar.png", "menu-start-save", "menu-start-save-state", "option", "save", 12, 12],
        ["settings", "CONFIGURAÇÕES", "menu-configuracoes.png", "menu-start-settings", "menu-start-settings-state", "option", "settings", 12, 14],
        ["back", "VOLTAR", "menu-back.png", "menu-back", "menu-back-state", "back", "back", 12, 15],
        ["cursor", "Foco · Farol", "menu-start-cursor-lighthouse-16x32-4bpp.png", "menu-start-cursor-lighthouse", "menu-start-cursor-lighthouse-state", "cursor", "", 8, 3]
      ]
    ],
    [
      "missoes",
      [
        ["title", "MISSÕES", "menu-missoes.png", "menu-start-missions", "menu-start-missions-state", "decorative", "", 9, 2],
        ["active", "ROTA DOS FARÓIS · ATIVA", "missoes-active.png", "menu-missions-active", "menu-missions-active-state", "option", "mission-active", 7, 5],
        ["next", "PRÓXIMO PASSO · PORTO DE LÚMEN", "missoes-next.png", "menu-missions-next", "menu-missions-next-state", "option", "mission-next", 7, 9],
        ["cursor", "Foco · Farol", "menu-start-cursor-lighthouse-16x32-4bpp.png", "menu-start-cursor-lighthouse", "menu-start-cursor-lighthouse-state", "cursor", "", 1, 5]
      ]
    ],
    [
      "inventario",
      [
        ["title", "INVENTÁRIO", "menu-inventario.png", "menu-start-inventory", "menu-start-inventory-state", "decorative", "", 9, 2],
        ["modules", "MÓDULOS DA AERONAVE", "inventario-modules.png", "menu-inventory-modules", "menu-inventory-modules-state", "item_icon", "inventory-modules", 7, 5],
        ["empty", "NENHUM ITEM CONSUMÍVEL", "inventario-empty.png", "menu-inventory-empty", "menu-inventory-empty-state", "item_icon", "inventory-empty", 7, 9]
      ]
    ],
    [
      "mapa_menu",
      [
        ["title", "MAPA", "menu-mapa.png", "menu-start-map", "menu-start-map-state", "decorative", "", 1, 1]
      ]
    ],
    [
      "escolha_genero",
      [
        ["title", "ESCOLHA SEU PERSONAGEM", "menu-gender-title.png", "menu-gender-title", "menu-gender-title-state", "decorative", "", 8, 2],
        ["male-actor", "PERSONAGEM HOMEM", "gender-player-male-32x64.png", "idle_down", "gender-player-male-32x64-state", "option", "male", 6, 4],
        ["female-actor", "PERSONAGEM MULHER", "gender-player-female-32x64.png", "idle_down", "gender-player-female-32x64-state", "option", "female", 18, 4],
        ["male", "HOMEM", "menu-male.png", "menu-male", "menu-male-state", "option", "male", 5, 12],
        ["female", "MULHER", "menu-female.png", "menu-female", "menu-female-state", "option", "female", 17, 12],
        ["back", "VOLTAR", "menu-entry-back.png", "menu-entry-back", "menu-entry-back-state", "decorative", "", 19, 16],
        ["confirm", "CONFIRMAR", "menu-confirm.png", "menu-confirm", "menu-confirm-state", "option", "confirm", 11, 16],
        ["cursor", "Seta de seleção", "menu-entry-cursor.png", "menu-entry-cursor", "menu-entry-cursor-state", "cursor", "", 3, 12]
      ]
    ],
    [
      "nome_jogador",
      [
        ["title", "NOME DO JOGADOR", "menu-player-name-title.png", "menu-player-name-title", "menu-player-name-title-state", "decorative", "", 11, 2],
      ]
    ],
    [
      "carregar_jogo",
      [
        ["title", "CARREGAR JOGO", "menu-inicial-load-game.png", "menu-load-game", "menu-load-game-state", "decorative", "", 8, 2],
        ["slot-1", "SLOT 1", "menu-slot-1.png", "menu-slot-1", "menu-slot-1-state", "option", "load-slot-1", 8, 7],
        ["cursor", "Seta de seleção", "menu-inicial-cursor.png", "menu-cursor", "menu-cursor-state", "cursor", "", 4, 7]
      ]
    ],
    [
      "salvar",
      [
        ["title", "SALVAR", "menu-salvar.png", "menu-start-save", "menu-start-save-state", "decorative", "", 8, 2],
        ["slot-1-left", "SLOT 1 · esquerda", "menu-save-slot-1-left-focus.png", "menu-slot-1-left-focus-normal", "menu-slot-1-left-focus-state", "option", "slot-1", 5, 4, { x: 42, y: 31 }],
        ["slot-1-right", "SLOT 1 · direita", "menu-save-slot-1-right-focus.png", "menu-slot-1-right-focus-normal", "menu-slot-1-right-focus-state", "option", "slot-1", 21, 4, { x: 170, y: 31 }],
        ["slot-1-bottom-left", "SLOT 1 · inferior esquerda", "menu-save-slot-1-bottom-left-focus.png", "menu-slot-1-bottom-left-focus-normal", "menu-slot-1-bottom-left-focus-state", "option", "slot-1", 5, 8, { x: 42, y: 63 }],
        ["slot-1-bottom-right", "SLOT 1 · inferior direita", "menu-save-slot-1-bottom-right-focus.png", "menu-slot-1-bottom-right-focus-normal", "menu-slot-1-bottom-right-focus-state", "option", "slot-1", 21, 8, { x: 170, y: 63 }],
        ["slot-2-left", "SLOT 2 · esquerda", "menu-save-slot-2-left-focus.png", "menu-slot-2-left-focus-normal", "menu-slot-2-left-focus-state", "option", "slot-2", 5, 8, { x: 42, y: 65 }],
        ["slot-2-right", "SLOT 2 · direita", "menu-save-slot-2-right-focus.png", "menu-slot-2-right-focus-normal", "menu-slot-2-right-focus-state", "option", "slot-2", 21, 8, { x: 170, y: 65 }],
        ["slot-2-bottom-left", "SLOT 2 · inferior esquerda", "menu-save-slot-2-bottom-left-focus.png", "menu-slot-2-bottom-left-focus-normal", "menu-slot-2-bottom-left-focus-state", "option", "slot-2", 5, 12, { x: 42, y: 97 }],
        ["slot-2-bottom-right", "SLOT 2 · inferior direita", "menu-save-slot-2-bottom-right-focus.png", "menu-slot-2-bottom-right-focus-normal", "menu-slot-2-bottom-right-focus-state", "option", "slot-2", 21, 12, { x: 170, y: 97 }],
        ["slot-3-left", "SLOT 3 · esquerda", "menu-save-slot-3-left-focus.png", "menu-slot-3-left-focus-normal", "menu-slot-3-left-focus-state", "option", "slot-3", 5, 12, { x: 42, y: 98 }],
        ["slot-3-right", "SLOT 3 · direita", "menu-save-slot-3-right-focus.png", "menu-slot-3-right-focus-normal", "menu-slot-3-right-focus-state", "option", "slot-3", 21, 12, { x: 170, y: 98 }],
        ["slot-3-bottom-left", "SLOT 3 · inferior esquerda", "menu-save-slot-3-bottom-left-focus.png", "menu-slot-3-bottom-left-focus-normal", "menu-slot-3-bottom-left-focus-state", "option", "slot-3", 5, 16, { x: 42, y: 130 }],
        ["slot-3-bottom-right", "SLOT 3 · inferior direita", "menu-save-slot-3-bottom-right-focus.png", "menu-slot-3-bottom-right-focus-normal", "menu-slot-3-bottom-right-focus-state", "option", "slot-3", 21, 16, { x: 170, y: 130 }]
      ]
    ],
    [
      "configuracoes",
      []
    ],
    [
      "creditos",
      [
        ["title", "CRÉDITOS", "menu-inicial-credits.png", "menu-credits", "menu-credits-state", "decorative", "", 8, 2],
        ["project", "GBA STUDIO", "menu-project.png", "menu-project", "menu-project-state", "option", "credits-project", 4, 6],
        ["engine", "ENGINE", "menu-engine.png", "menu-engine", "menu-engine-state", "option", "credits-engine", 4, 8],
        ["cursor", "Seta de seleção", "menu-inicial-cursor.png", "menu-cursor", "menu-cursor-state", "cursor", "", 4, 6]
      ]
    ]
  ];
  for (const [roomName, actors] of linkedMenuActorDefinitions) {
    for (const [suffix, name, spriteSheet, animationName, animationStateID, role, menuItemID, x, y, menuPositionPixels] of actors) {
      const id = `menu-${roomName.replace("", "")}-${suffix}`;
      const hyphenatedId = `menu-${roomName.replace("", "").replaceAll("_", "-")}-${suffix}`;
      const linkedActor = {
        id,
        name,
        roomName,
        x,
        y,
        ...(menuPositionPixels ? { menuPositionPixels } : {}),
        spriteSheet,
        animationName,
        animationStateID,
        menuActorRole: role,
        ...(menuItemID ? { menuItemID } : {}),
        ...(menuItemID === "male" || menuItemID === "female" ? { menuCharacterVariant: menuItemID } : {}),
        ...(role === "cursor" ? { cursorForMenu: roomName.replace("", "") } : {}),
        menuEntryAnimation: "slide_down",
        menuEntryOffsetY: 16,
        menuEntryAnimationFrames: 20
      };
      const existingActorIndex = finalizedActors.findIndex((actor) => actor.id === id || actor.id === hyphenatedId);
      if (existingActorIndex >= 0) {
        linkedActor.id = finalizedActors[existingActorIndex].id;
        finalizedActors[existingActorIndex] = { ...finalizedActors[existingActorIndex], ...linkedActor };
      } else {
        finalizedActors.push(linkedActor);
      }
    }
  }
  const entryActorOverrides = new Map([
    ["menu-escolha-genero-title", { spriteSheet: "menu-gender-title.png", animationName: "menu-gender-title", animationStateID: "menu-gender-title-state" }],
    ["menu-escolha-genero-cursor", { spriteSheet: "menu-entry-cursor.png", animationName: "menu-entry-cursor", animationStateID: "menu-entry-cursor-state" }],
    ["menu-nome-jogador-title", { spriteSheet: "menu-player-name-title.png", animationName: "menu-player-name-title", animationStateID: "menu-player-name-title-state" }],
    ["menu-nome-jogador-cursor", { spriteSheet: "menu-entry-cursor.png", animationName: "menu-entry-cursor", animationStateID: "menu-entry-cursor-state" }],
    ["menu-menu_start-tactical", { spriteSheet: "menu-tactical.png", animationName: "menu-start-tactical", animationStateID: "menu-start-tactical-state" }]
  ]);
  for (const actor of finalizedActors) {
    const override = entryActorOverrides.get(actor.id);
    if (override) Object.assign(actor, override);
  }
  const saveActorVariants = new Map([
    ["menu-salvar-slot-1-left", "menu-slot-1-left-focus-selected"],
    ["menu-salvar-slot-1-right", "menu-slot-1-right-focus-selected"],
    ["menu-salvar-slot-1-bottom-left", "menu-slot-1-bottom-left-focus-selected"],
    ["menu-salvar-slot-1-bottom-right", "menu-slot-1-bottom-right-focus-selected"],
    ["menu-salvar-slot-2-left", "menu-slot-2-left-focus-selected"],
    ["menu-salvar-slot-2-right", "menu-slot-2-right-focus-selected"],
    ["menu-salvar-slot-2-bottom-left", "menu-slot-2-bottom-left-focus-selected"],
    ["menu-salvar-slot-2-bottom-right", "menu-slot-2-bottom-right-focus-selected"],
    ["menu-salvar-slot-3-left", "menu-slot-3-left-focus-selected"],
    ["menu-salvar-slot-3-right", "menu-slot-3-right-focus-selected"],
    ["menu-salvar-slot-3-bottom-left", "menu-slot-3-bottom-left-focus-selected"],
    ["menu-salvar-slot-3-bottom-right", "menu-slot-3-bottom-right-focus-selected"]
  ]);
  for (const actor of finalizedActors) {
    const selectedAnimationName = saveActorVariants.get(actor.id);
    if (actor.roomName === "salvar" && selectedAnimationName) {
      actor.menuSelectedSpriteSheet = actor.spriteSheet;
      actor.menuSelectedAnimationName = selectedAnimationName;
    }
  }
  const genderActorPositions = new Map([
    ["menu-escolha-genero-title", { x: 8, y: 2 }],
    ["menu-escolha-genero-male-actor", { x: 6, y: 4 }],
    ["menu-escolha-genero-female-actor", { x: 18, y: 4 }],
    ["menu-escolha-genero-male", { x: 5, y: 12 }],
    ["menu-escolha-genero-female", { x: 17, y: 12 }],
    ["menu-escolha_genero-back", { x: 19, y: 16 }],
    ["menu-escolha-genero-back", { x: 19, y: 16 }],
    ["menu-escolha-genero-confirm", { x: 11, y: 16 }],
    ["menu-escolha-genero-cursor", { x: 3, y: 12 }]
  ]);
  const nameActorPositions = new Map([
    ["menu-nome_jogador-title", { x: 11, y: 2 }],
    ["menu-nome-jogador-title", { x: 11, y: 2 }]
  ]);
  const loadGameActorPositions = new Map([
    ["menu-carregar_jogo-title", { x: 8, y: 2 }],
    ["menu-carregar_jogo-slot-1", { x: 11, y: 7 }],
    ["menu-carregar_jogo-cursor", { x: 7, y: 7 }],
    ["menu-carregar-jogo-title", { x: 8, y: 2 }],
    ["menu-carregar-jogo-slot-1", { x: 11, y: 7 }],
    ["menu-carregar-jogo-cursor", { x: 7, y: 7 }]
  ]);
  const startMenuActorPositions = new Map([
    ["menu-menu_start-title", { x: 9, y: 2 }],
    ["menu-menu_start-missions", { x: 12, y: 4 }],
    ["menu-menu_start-inventory", { x: 12, y: 6 }],
    ["menu-menu_start-map", { x: 12, y: 8 }],
    ["menu-menu_start-profile", { x: 12, y: 10 }],
    ["menu-menu_start-save", { x: 12, y: 12 }],
    ["menu-menu_start-settings", { x: 12, y: 14 }],
    ["menu-menu_start-back", { x: 12, y: 15 }],
    ["menu-menu_start-cursor", { x: 8, y: 3 }]
  ]);
  const missionsActorPositions = new Map([
    ["menu-missoes-title", { x: 9, y: 2 }],
    ["menu-missoes-active", { x: 7, y: 5 }],
    ["menu-missoes-next", { x: 7, y: 9 }],
    ["menu-missoes-cursor", { x: 1, y: 5 }]
  ]);
  const inventoryActorPositions = new Map([
    ["menu-inventario-title", { x: 9, y: 2 }],
    ["menu-inventario-modules", { x: 7, y: 5 }],
    ["menu-inventario-empty", { x: 7, y: 9 }]
  ]);
  const creditsActorPositions = new Map([
    ["menu-creditos-title", { x: 8, y: 2 }],
    ["menu-creditos-project", { x: 4, y: 6 }],
    ["menu-creditos-engine", { x: 4, y: 8 }],
    ["menu-creditos-cursor", { x: 4, y: 6 }]
  ]);
  const mapHybridActorPositions = new Map([
    ["menu-mapa_menu-title", { x: 1, y: 1 }]
  ]);
  const profileActorPositions = new Map([
    ["menu-perfil_equipe-title", { x: 9, y: 2 }],
    ["menu-perfil_equipe-portrait-nara", { x: 3, y: 4 }],
    ["menu-perfil_equipe-nara", { x: 10, y: 5 }],
    ["menu-perfil_equipe-portrait-guardian", { x: 3, y: 10 }],
    ["menu-perfil_equipe-guardian", { x: 10, y: 11 }],
    ["menu-perfil_equipe-back", { x: 9, y: 16 }],
    ["menu-perfil_equipe-cursor", { x: 1, y: 5 }]
  ]);
  const saveActorPositions = new Map([
    ["menu-salvar-title", { x: 8, y: 2 }],
    ["menu-salvar-slot-1", { x: 11, y: 7 }],
    ["menu-salvar-slot-2", { x: 11, y: 11 }],
    ["menu-salvar-slot-3", { x: 11, y: 15 }]
  ]);
  for (const actor of finalizedActors) {
    const position = genderActorPositions.get(actor.id);
    if (actor.roomName === "escolha_genero" && position) {
      actor.x = position.x;
      actor.y = position.y;
    }
    if (actor.id === "menu-escolha_genero-back") actor.menuVisualProfile = "initial-harbor";
    const namePosition = nameActorPositions.get(actor.id);
    if (actor.roomName === "nome_jogador" && namePosition) {
      actor.x = namePosition.x;
      actor.y = namePosition.y;
    }
    if (actor.roomName === "nome_jogador" && actor.id === "menu-nome_jogador-male-portrait") {
      actor.animationName = "idle_down";
      actor.menuVisibilityVariable = VERTICE_INTERFACE_VARIABLES.characterGender;
      actor.menuVisibilityValue = 0;
    }
    if (actor.roomName === "nome_jogador" && actor.id === "menu-nome_jogador-female-portrait") {
      actor.animationName = "idle_down";
      actor.menuVisibilityVariable = VERTICE_INTERFACE_VARIABLES.characterGender;
      actor.menuVisibilityValue = 1;
    }
    const loadGamePosition = loadGameActorPositions.get(actor.id);
    if (actor.roomName === "carregar_jogo" && loadGamePosition) {
      actor.x = loadGamePosition.x;
      actor.y = loadGamePosition.y;
    }
    const startMenuPosition = startMenuActorPositions.get(actor.id);
    if (actor.roomName === "menu_start" && startMenuPosition) {
      actor.x = startMenuPosition.x;
      actor.y = startMenuPosition.y;
    }
    const missionsPosition = missionsActorPositions.get(actor.id);
    if (actor.roomName === "missoes" && missionsPosition) {
      actor.x = missionsPosition.x;
      actor.y = missionsPosition.y;
    }
    const inventoryPosition = inventoryActorPositions.get(actor.id);
    if (actor.roomName === "inventario" && inventoryPosition) {
      actor.x = inventoryPosition.x;
      actor.y = inventoryPosition.y;
    }
    const creditsPosition = creditsActorPositions.get(actor.id);
    if (actor.roomName === "creditos" && creditsPosition) {
      actor.x = creditsPosition.x;
      actor.y = creditsPosition.y;
    }
    const mapHybridPosition = mapHybridActorPositions.get(actor.id);
    if (actor.roomName === "mapa_menu" && mapHybridPosition) {
      actor.x = mapHybridPosition.x;
      actor.y = mapHybridPosition.y;
    }
    const profilePosition = profileActorPositions.get(actor.id);
    if (actor.roomName === "perfil_equipe" && profilePosition) {
      actor.x = profilePosition.x;
      actor.y = profilePosition.y;
    }
    const savePosition = saveActorPositions.get(actor.id);
    if (actor.roomName === "salvar" && savePosition) {
      actor.x = savePosition.x;
      actor.y = savePosition.y;
    }
  }
  const sceneTypes = project.settings?.sceneTypes && typeof project.settings.sceneTypes === "object"
    ? project.settings.sceneTypes
    : {};
  const defaultPlayerSprites = sceneTypes.defaultPlayerSprites && typeof sceneTypes.defaultPlayerSprites === "object"
    ? sceneTypes.defaultPlayerSprites
    : {};
  const racingSettings = project.settings?.racing && typeof project.settings.racing === "object"
    ? project.settings.racing
    : {};
  const shmupSettings = project.settings?.shmup && typeof project.settings.shmup === "object"
    ? project.settings.shmup
    : {};
  const builtAnimations = [
    ...VERTICE_NARRATIVE_ANIMATIONS,
    ...VERTICE_EXPLORATION_ANIMATIONS,
    ...VERTICE_PLAYER_PROFILE_ANIMATIONS,
    ...VERTICE_GENDER_SELECTION_PLAYER_ANIMATIONS,
    ...VERTICE_NAME_INPUT_PLAYER_ANIMATIONS,
    ...VERTICE_CLIMAX_ANIMATIONS,
    ...VERTICE_RACING_ANIMATIONS,
    ...VERTICE_FARM_REFERENCE_ANIMATIONS
  ];
  const preservedTacticalAnimations = Array.isArray(project.animations)
    ? project.animations.filter((animation) => VERTICE_APPROVED_TACTICAL_SPRITE_SHEETS.has(animation?.spriteSheet))
    : [];
  const preservedTopdownAnimations = Array.isArray(project.animations)
    ? project.animations.filter((animation) => VERTICE_APPROVED_TOPDOWN_SPRITE_SHEETS.has(animation?.spriteSheet))
    : [];
  const animationsById = new Map();
  for (const animation of [...builtAnimations, ...preservedTacticalAnimations, ...preservedTopdownAnimations]) {
    if (!animation?.id || animationsById.has(animation.id)) continue;
    if (VERTICE_ACTIVE_SPRITE_SHEETS.has(animation.spriteSheet)) animationsById.set(animation.id, animation);
  }
  const builtAnimationStates = [
    ...VERTICE_NARRATIVE_STATES,
    ...VERTICE_EXPLORATION_STATES,
    ...VERTICE_PLAYER_PROFILE_STATES,
    ...VERTICE_GENDER_SELECTION_PLAYER_STATES,
    ...VERTICE_NAME_INPUT_PLAYER_STATES,
    ...VERTICE_CLIMAX_STATES,
    ...VERTICE_RACING_STATES,
    ...VERTICE_FARM_REFERENCE_STATES
  ];
  const preservedTacticalAnimationStates = Array.isArray(project.animationStates)
    ? project.animationStates.filter((state) => VERTICE_APPROVED_TACTICAL_SPRITE_SHEETS.has(state?.spriteSheet))
    : [];
  const preservedTopdownAnimationStates = Array.isArray(project.animationStates)
    ? project.animationStates.filter((state) => VERTICE_APPROVED_TOPDOWN_SPRITE_SHEETS.has(state?.spriteSheet))
    : [];
  const animationStatesById = new Map();
  for (const state of [...builtAnimationStates, ...preservedTacticalAnimationStates, ...preservedTopdownAnimationStates]) {
    if (!state?.id || animationStatesById.has(state.id)) continue;
    if (VERTICE_ACTIVE_SPRITE_SHEETS.has(state.spriteSheet)) animationStatesById.set(state.id, state);
  }
  return {
    ...project,
    name: "O Último Farol",
    assets: replaceVerticeShowcaseAssets(project.assets).map((asset) => asset.name.startsWith("title-logo-emblem-")
      ? { ...asset, metadata: { ...asset.metadata, objectPaletteValues: [...VERTICE_TITLE_LOGO_PALETTE] } }
      : asset),
    animations: [...animationsById.values()],
    animationStates: [...animationStatesById.values()],
    actors: applyVerticeInitialMenuActorPattern(finalizedActors),
    audioItems: Array.isArray(project.audioItems)
      ? project.audioItems.map((audio) => ({
          ...audio,
          assignedScene: sourceToVertice.get(audio.assignedScene) ?? audio.assignedScene
        }))
      : [],
    dialogues: project.dialogues.map((item) => ({
      ...item,
      textSound: "farol_sfx_texto",
      confirmSound: "farol_sfx_dialogo"
    })),
    events: finalizedEvents,
    rooms: structuredClone(finalizedScenes),
    scenas: finalizedScenes,
    settings: {
      ...mergeVerticeHudPresets(project.settings),
      save: { ...(project.settings?.save ?? {}), autoSave: true, manualSave: true, slots: 3 },
      sceneTypes: {
        ...sceneTypes,
        defaultPlayerSprites: {}
      },
      racing: { ...racingSettings, playerSprite: "" },
      shmup: {
        ...shmupSettings,
        playerSprite: "tempestade-v3-player.png",
        enemySprite: "tempestade-v3-drone-horizontal.png",
        projectileSprite: "storm-shot.png",
        enemyProjectileSprite: "storm-bolt.png"
      },
      controls: {
        ...(project.settings?.controls && typeof project.settings.controls === "object" ? project.settings.controls : {}),
        aButton: "X",
        bButton: "Z",
        lButton: "Q",
        rButton: "E",
        startButton: "Enter",
        selectButton: "Shift",
        dpad: "Setas",
        preset: "GBA clássico"
      }
    },
    triggers: verticeTriggers()
  };
}

export function projectAssetCoverage(project) {
  const assets = Array.isArray(project?.assets) ? project.assets : [];
  const actors = Array.isArray(project?.actors) ? project.actors : [];
  const scenes = Array.isArray(project?.scenas) ? project.scenas : [];
  const assetRoles = new Map();
  for (const asset of assets) {
    const metadata = asset?.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
    const roles = [metadata.role, ...(Array.isArray(metadata.sceneRoles) ? metadata.sceneRoles : [])]
      .filter((role) => typeof role === "string" && role.length > 0);
    for (const role of roles) {
      const entries = assetRoles.get(role) ?? [];
      entries.push(asset.name);
      assetRoles.set(role, entries);
    }
  }
  return {
    scenes: VERTICE_CAMPAIGN_SCENES.map(({ name }) => {
      const definition = VERTICE_SCENE_PACKAGES[name];
      const requiredRoles = name === "prologo"
        ? ["prologue-frame-1", "prologue-frame-2", "prologue-frame-3"]
        : VERTICE_ACTIVE_ART_SCENES.has(name) && Array.isArray(definition?.assetRoles)
          ? definition.assetRoles
          : [];
      const scene = scenes.find((candidate) => candidate?.name === name);
      const runtimeConfig = scene?.runtime?.config && typeof scene.runtime.config === "object"
        ? scene.runtime.config
        : {};
      const referencedAssets = [
        scene?.backgroundAssetName,
        scene?.runtimeCompositeBackgroundAssetName,
        ...(Array.isArray(runtimeConfig.steps)
          ? runtimeConfig.steps.map((step) => step?.backgroundAssetName)
          : []),
        ...actors.filter((actor) => actor?.roomName === name).map((actor) => actor?.spriteSheet)
      ].filter((assetName) => typeof assetName === "string");
      return {
        scene: name,
        requiredRoles,
        missingRequiredRoles: requiredRoles.filter((role) => !assetRoles.has(role)),
        legacyDemoAssets: referencedAssets.filter((assetName) => (
          assetName.startsWith("canonical-") || VERTICE_UNUSED_LEGACY_ASSETS.has(assetName)
        ))
      };
    })
  };
}

function isVerticeSceneSequence(sceneNames, expectedScenes) {
  return sceneNames.length === expectedScenes.length
    && sceneNames.every((name, index) => name === (expectedScenes[index]?.name ?? expectedScenes[index]));
}

function verticeCampaignConnections() {
  const definitions = [...VERTICE_CAMPAIGN_SCENES, ...VERTICE_SUPPORT_SCENES];
  return VERTICE_CAMPAIGN_SCENES.map((scene) => {
    const next = definitions.find((candidate) => candidate.name === scene.nextScene);
    return {
      from: scene.name,
      to: scene.nextScene,
      eventName: scene.transitionEvent,
      exit: { ...scene.exit },
      entry: { x: next?.entry.x ?? 0, y: next?.entry.y ?? 0, width: 1, height: 1 }
    };
  });
}

function verticeSceneDisplayName(name, fallback) {
  if (name === "logo") return "Logo";
  if (name === VERTICE_OPENING_SCENE) return "Abertura";
  if (name === VERTICE_TITLE_SCENE) return "Title Screen";
  if (name === VERTICE_INITIAL_MENU_SCENE) return "Menu Inicial";
  if (name === VERTICE_GAME_SCENE) return "Jogo · Porto de Lúmen";
  return fallback;
}

function verticeCanvasPositions(scenes, mainPositions = {}) {
  const mainFlow = [
    "logo",
    VERTICE_OPENING_SCENE,
    VERTICE_TITLE_SCENE,
    VERTICE_INITIAL_MENU_SCENE,
    "escolha_genero",
    "nome_jogador",
    "prologo",
    VERTICE_GAME_SCENE
  ];
  const positions = {};
  const gap = 48;
  const verticalGap = 52;
  const roomSize = (scene) => {
    const isometricMinimum = scene?.sceneType === "isometric";
    const minimumWidth = isometricMinimum ? 30 : 1;
    const minimumHeight = isometricMinimum ? 20 : 1;
    let width = Math.max(minimumWidth, Number(scene?.width) || 1) * 8;
    let height = Math.max(minimumHeight, Number(scene?.height) || 1) * 8;
    if (isometricMinimum) {
      const config = scene.runtime?.config ?? {};
      const bounds = (config.tacticalPresentation?.surfacePages ?? []).reduce((size, page) => ({
        minX: Math.min(size.minX, page.world.x),
        minY: Math.min(size.minY, page.world.y),
        maxX: Math.max(size.maxX, page.world.x + page.world.width),
        maxY: Math.max(size.maxY, page.world.y + page.world.height)
      }), { minX: 0, minY: 0, maxX: 0, maxY: 0 });
      const surface = config.pagedSurface ?? (bounds.maxX > bounds.minX && bounds.maxY > bounds.minY
        ? { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY }
        : null);
      const tileWidth = Number(config.tileWidth) || 32;
      const tileHeight = tileWidth / 2;
      const span = Math.max(1, Number(scene.width) || 1) + Math.max(1, Number(scene.height) || 1);
      width = surface?.width ?? span * tileWidth / 2;
      height = surface?.height ?? span * tileHeight / 2
        + Math.max(0, (Number(scene.backgroundAtlasTileHeight) || tileHeight) - tileHeight);
    }
    // Match sceneMapPreviewContentSize: bound huge maps and preserve aspect ratio.
    const scale = Math.min(960 / Math.max(1, width), 640 / Math.max(1, height), Math.max(1, 240 / Math.max(1, width)));
    return {
      width: width * scale,
      height: height * scale + 54 + 36
    };
  };
  let mainX = 36;
  let mainRowHeight = 0;
  for (const name of mainFlow) {
    const scene = scenes.find((candidate) => candidate.name === name);
    if (!scene) continue;
    const size = roomSize(scene);
    positions[name] = mainPositions[name] ?? { x: mainX, y: 36 };
    mainX += size.width + gap;
    mainRowHeight = Math.max(mainRowHeight, size.height);
  }
  let secondaryY = 36 + mainRowHeight + verticalGap;
  const secondaryScenes = scenes.filter((scene) => !mainFlow.includes(scene.name));
  for (let rowStart = 0; rowStart < secondaryScenes.length; rowStart += 4) {
    const rowScenes = secondaryScenes.slice(rowStart, rowStart + 4);
    let secondaryX = 36;
    let rowHeight = 0;
    for (const scene of rowScenes) {
      const size = roomSize(scene);
      positions[scene.name] = { x: secondaryX, y: secondaryY };
      secondaryX += size.width + gap;
      rowHeight = Math.max(rowHeight, size.height);
    }
    secondaryY += rowHeight + verticalGap;
  }
  return positions;
}

function verticePresentationConnections() {
  const titleConnection = verticeCampaignConnections().find((connection) => connection.from === VERTICE_TITLE_SCENE);
  const initialMenuDefinition = VERTICE_SUPPORT_SCENES.find((scene) => scene.name === VERTICE_INITIAL_MENU_SCENE);
  const genderDefinition = VERTICE_SUPPORT_SCENES.find((scene) => scene.name === "escolha_genero");
  const nameDefinition = VERTICE_SUPPORT_SCENES.find((scene) => scene.name === "nome_jogador");
  const loadGameDefinition = VERTICE_SUPPORT_SCENES.find((scene) => scene.name === "carregar_jogo");
  const settingsDefinition = VERTICE_SUPPORT_SCENES.find((scene) => scene.name === "configuracoes");
  const creditsDefinition = VERTICE_SUPPORT_SCENES.find((scene) => scene.name === "creditos");
  const prologueDefinition = VERTICE_CAMPAIGN_SCENES.find((scene) => scene.name === "prologo");
  const menuBranch = (to, eventName, definition) => ({
    from: VERTICE_INITIAL_MENU_SCENE,
    to,
    eventName,
    exit: { ...(initialMenuDefinition?.exit ?? { x: 0, y: 0, width: 0, height: 0 }) },
    entry: { x: definition?.entry.x ?? 0, y: definition?.entry.y ?? 0, width: 1, height: 1 }
  });
  return [
    {
      from: "logo",
      to: VERTICE_OPENING_SCENE,
      eventName: "logo_ao_entrar",
      exit: { x: 0, y: 0, width: 0, height: 0 },
      entry: { x: 0, y: 0, width: 1, height: 1 }
    },
    {
      from: VERTICE_OPENING_SCENE,
      to: VERTICE_TITLE_SCENE,
      eventName: "abertura_concluir",
      exit: { x: 0, y: 0, width: 0, height: 0 },
      entry: { x: 0, y: 0, width: 1, height: 1 }
    },
    titleConnection,
    menuBranch("escolha_genero", "menu_inicial_novo_jogo", genderDefinition),
    {
      from: "escolha_genero",
      to: "nome_jogador",
      eventName: "escolha_genero_confirmar",
      exit: { ...(genderDefinition?.exit ?? { x: 0, y: 0, width: 0, height: 0 }) },
      entry: { x: nameDefinition?.entry.x ?? 0, y: nameDefinition?.entry.y ?? 0, width: 1, height: 1 }
    },
    {
      from: "nome_jogador",
      to: "prologo",
      eventName: "nome_jogador_confirmar",
      exit: { ...(nameDefinition?.exit ?? { x: 0, y: 0, width: 0, height: 0 }) },
      entry: { x: prologueDefinition?.entry.x ?? 0, y: prologueDefinition?.entry.y ?? 0, width: 1, height: 1 }
    },
    menuBranch("carregar_jogo", "menu_inicial_carregar_jogo", loadGameDefinition),
    menuBranch("configuracoes", "menu_inicial_configuracoes", settingsDefinition),
    menuBranch("creditos", "menu_inicial_creditos", creditsDefinition),
    {
      from: "arena_tatica",
      to: "mercado_suspenso",
      eventName: "arena_tatica_sair",
      exit: { x: 1, y: 6, width: 1, height: 1 },
      entry: { x: 25, y: 13, width: 1, height: 1 }
    },
    {
      from: "porto_lumen",
      to: "farol_interior",
      eventName: "porto_entrar_farol",
      exit: { x: 9, y: 9, width: 4, height: 3 },
      entry: { x: 22, y: 24, width: 1, height: 1 }
    },
    {
      from: "farol_interior",
      to: "porto_lumen",
      eventName: "farol_sair_porto",
      exit: { x: 20, y: 26, width: 5, height: 4 },
      entry: { x: 15, y: 14, width: 1, height: 1 }
    },
    ...verticeCampaignConnections().filter((connection) => connection.from !== VERTICE_TITLE_SCENE),
    {
      from: "mercado_suspenso",
      to: "arena_tatica",
      eventName: "mercado_entrar_arena",
      exit: { x: 0, y: 0, width: 0, height: 0 },
      entry: { x: 1, y: 4, width: 1, height: 1 }
    }
  ].filter(Boolean);
}

function verticeEditorState(editorState, scenes) {
  return {
    ...(editorState && typeof editorState === "object" ? editorState : {}),
    scenaConnections: verticePresentationConnections(),
    sceneMapPositions: verticeCanvasPositions(scenes),
    sceneMapZoom: 0.75
  };
}

function applyVerticeInitialMenuActorPattern(actors) {
  return actors.map((actor) => {
    if (!VERTICE_INITIAL_MENU_PAGE_SCENES.has(actor?.roomName)) return actor;
    return {
      ...actor,
      menuEntryAnimation: "slide_down",
      menuEntryOffsetY: 16,
      menuEntryAnimationFrames: 20,
      menuVisualProfile: "initial-harbor"
    };
  });
}

function isApprovedTacticalScene(scene) {
  const assets = scene?.runtime?.config?.tacticalPresentation?.assets;
  const visualAssets = Array.isArray(assets) ? assets.filter((asset) => asset.consumer !== "audio") : [];
  const names = new Set(visualAssets.map((asset) => asset.path));
  const approvedBase = [
    ["tactical-v3-coastal-surface.png", "tactical-v3-hud.png", "tactical-nara-v3.png", "tactical-sentinel-v3.png"],
    ["tactical-v5-surface.png", "tactical-v5-hud.png", "tactical-nara-v5.png", "tactical-sentinel-v5.png"]
  ].some(([surface, ...rest]) => scene?.backgroundAssetName === surface && names.has(surface) && rest.every(name => names.has(name)));
  const approvedMarker = names.has("tactical-feedback-v3.png")
    || ["cursor", "range", "target"].every((state) => names.has(`tactical-${state}-diamond-32x16-v1.png`));
  return scene?.name === "arena_tatica"
    && approvedBase
    && approvedMarker
    && visualAssets.every((asset) => asset.status === "approved");
}

function materializeVerticeSupportScenes(scenes, existingSupportScenes = []) {
  const titleScene = scenes.find((scene) => scene.name === VERTICE_START_SCENE);
  if (!titleScene) throw new Error(`Cena inicial ausente para o Menu Start: ${VERTICE_START_SCENE}.`);
  const existingSupportByName = new Map(
    existingSupportScenes
      .filter((scene) => VERTICE_SUPPORT_SCENES.some((definition) => definition.name === scene?.name))
      .map((scene) => [scene.name, scene])
  );
  return VERTICE_SUPPORT_SCENES.map((definition) => {
    const existingSupport = existingSupportByName.get(definition.name);
    if (isApprovedTacticalScene(existingSupport)) return structuredClone(existingSupport);
    const support = structuredClone(titleScene);
    delete support.campaign;
    delete support.playerActorName;
    const backgroundAssetName = definition.name === "escolha_genero"
      ? "gender-selection-gba.png"
      : definition.name === "nome_jogador"
      ? "name-input-bg-gba.png"
      : definition.name === "logo"
      ? VERTICE_STARTUP_LOGO_FRAMES[0].name
      : definition.name === "abertura"
        ? "opening-v4-per-tile-14-banks.png"
        : definition.name === "farol_interior"
          ? "farol-interior-topdown-360x240-gba.png"
        : ["escolha_genero", "nome_jogador"].includes(definition.name)
          ? "new-game-gba.png"
        : ["salvar", "menu_start", "missoes", "inventario", "mapa_menu"].includes(definition.name)
          ? VERTICE_INITIAL_MENU_SHARED_BACKGROUND
        : definition.name === "configuracoes"
          ? ""
        : definition.name === "creditos"
          ? "creditos-gba.png"
        : VERTICE_INITIAL_MENU_PAGE_SCENES.has(definition.name)
          ? VERTICE_INITIAL_MENU_SHARED_BACKGROUND
        : existingSupport?.backgroundAssetName ?? titleScene.backgroundAssetName;
    const base = {
      ...support,
      id: `scene-${definition.name}`,
      name: definition.name,
      sceneType: definition.runtime,
      displayName: verticeSceneDisplayName(definition.name, definition.title),
      backgroundAssetName,
      runtime: verticeRuntime(definition, existingSupport?.runtime ?? {}),
      showcase: verticeShowcaseSceneClassification(definition),
      eventBindings: { onInit: definition.transitionEvent },
      onEnterEventName: definition.transitionEvent
    };
    const pointClickSpec = POINT_CLICK_SCENE_SPECS.find((candidate) => candidate.name === definition.name);
    if (pointClickSpec) {
      const width = 30;
      const height = 20;
      const collisionTypes = Array(width * height).fill("free");
      return {
        ...base,
        width,
        height,
        backgroundAssetName: pointClickSpec.background,
        backgroundRenderMode: "tilemap",
        gbStudioUseBackgroundLayout: true,
        cameraMode: "fixed_center",
        cameraBounds: { x: 0, y: 0, width, height },
        playerActorName: pointClickSpec.cursorName,
        tilemap: Array(width * height).fill(0),
        collisions: [...collisionTypes],
        collisionTypes,
        tileLayers: [],
        heightLevels: Array(width * height).fill(0),
        music: VERTICE_MUSIC_BY_SCENE[definition.name] ?? "farol_enseada",
        runtime: { type: "pointAndClick", config: { cursorSpeed: 2, hotspotPadding: 0, profile: "source-preserving-candidate" } },
        supportBriefing: {
          title: pointClickSpec.title,
          objective: pointClickSpec.objective,
          controls: pointClickSpec.controls,
          success: pointClickSpec.success,
          failureRecovery: pointClickSpec.failureRecovery
        }
      };
    }
    if (definition.name === "farol_interior") {
      const width = 45;
      const height = 30;
      const collisionTypes = farolInteriorCollisionTypes(width, height);
      return {
        ...base,
        width,
        height,
        backgroundAssetName: "farol-interior-topdown-360x240-gba.png",
        tilesetAssetName: "farol-interior-topdown-360x240-gba.png",
        backgroundRenderMode: "tilemap",
        gbStudioUseBackgroundLayout: true,
        cameraMode: "follow_player",
        cameraBounds: { x: 0, y: 0, width, height },
        playerActorName: VERTICE_PLAYER_ACTOR_NAMES.farol_interior,
        tilemap: Array(width * height).fill(0),
        collisions: [...collisionTypes],
        collisionTypes,
        tileLayers: [],
        heightLevels: Array(width * height).fill(0),
        music: "farol_memorias",
        supportBriefing: {
          title: definition.title,
          objective: definition.objective,
          controls: definition.controls,
          success: definition.success,
          failureRecovery: definition.failureRecovery
        }
      };
    }
    if (definition.name === "affine_lab") {
      const width = 30;
      const height = 20;
      const collisionTypes = Array(width * height).fill("free");
      return {
        ...base,
        width,
        height,
        backgroundAssetName: "",
        tilesetAssetName: "",
        backgroundRenderMode: "affine",
        gbStudioUseBackgroundLayout: false,
        cameraMode: "fixed",
        cameraBounds: { x: 0, y: 0, width, height },
        playerActorName: "",
        tilemap: Array(width * height).fill(0),
        collisions: [...collisionTypes],
        collisionTypes,
        tileLayers: [],
        heightLevels: Array(width * height).fill(0),
        music: "farol_falesias",
        supportBriefing: {
          title: definition.title,
          objective: definition.objective,
          controls: definition.controls,
          success: definition.success,
          failureRecovery: definition.failureRecovery
        }
      };
    }
    if (definition.name !== "arena_tatica") return base;

    const width = 12;
    const height = 8;
    const tilemap = Array(width * height).fill(0);
    const collisionTypes = tilemap.map((_, index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return x === 0 || y === 0 || x === width - 1 || y === height - 1 ? "solid" : "free";
    });
    return {
      ...base,
      width,
      height,
      backgroundAssetName: "farm-arena-composition-reference-v2.png",
      tilesetAssetName: "farm-arena-composition-reference-v2.png",
      backgroundRenderMode: "tilemap",
      gbStudioUseBackgroundLayout: true,
      paletteFamilyID: null,
      cameraMode: "fixed_center",
      cameraBounds: { x: 0, y: 0, width: 480, height: 320 },
      playerActorName: "",
      tilemap,
      collisions: [...collisionTypes],
      collisionTypes,
      tileLayers: [],
      heightLevels: Array.from({ length: width * height }, (_, index) => {
        const x = index % width;
        const y = Math.floor(index / width);
        return x >= 4 && x <= 7 && y >= 2 && y <= 3 ? 1 : 0;
      }),
      music: "farol_falesias",
      supportBriefing: {
        title: definition.title,
        objective: definition.objective,
        controls: definition.controls,
        success: definition.success,
        failureRecovery: definition.failureRecovery
      }
    };
  });
}

function verticeOrderedScenes(campaignScenes, supportScenes) {
  const byName = new Map([...campaignScenes, ...supportScenes].map((scene) => [scene.name, scene]));
  const presentation = [
    "logo",
    VERTICE_OPENING_SCENE,
    VERTICE_TITLE_SCENE,
    VERTICE_INITIAL_MENU_SCENE,
    "prologo",
    VERTICE_GAME_SCENE
  ];
  const orderedNames = [
    ...presentation,
    ...VERTICE_CAMPAIGN_SCENES.map((scene) => scene.name),
    ...VERTICE_SUPPORT_SCENES.map((scene) => scene.name)
  ];
  const uniqueNames = [...new Set(orderedNames)];
  return uniqueNames
    .map((name) => byName.get(name))
    .filter(Boolean)
    .concat([...byName.entries()]
      .filter(([name]) => !uniqueNames.includes(name))
      .map(([, scene]) => scene));
}

export function isVerticeShowcaseProject(data) {
  const legacySupportSceneNames = new Set([
    "perfil_equipe",
    "idioma",
    "configuracoes_audio",
    "configuracoes_controles"
  ]);
  const sceneNames = Array.isArray(data?.scenas)
    ? data.scenas.map((scene) => scene?.name)
    : [];
  const expectedSceneNames = [
    ...VERTICE_CAMPAIGN_SCENES,
    ...VERTICE_SUPPORT_SCENES
  ].map((scene) => scene.name);
  const expectedSceneNameSet = new Set(expectedSceneNames);
  const requiredCampaignNames = VERTICE_CAMPAIGN_SCENES.map((scene) => scene.name);
  return sceneNames.length > 0
    && sceneNames[0] === "logo"
    && requiredCampaignNames.every((name) => sceneNames.includes(name))
    && new Set(sceneNames).size === sceneNames.length
    && sceneNames.every((name) => expectedSceneNameSet.has(name) || legacySupportSceneNames.has(name) || name === "oficina");
}

export function promoteExemploGBAVerticeCampaign(data) {
  if (isVerticeShowcaseProject(data)) {
    const existing = structuredClone(data);
    const existingScenes = Array.isArray(existing.scenas) ? existing.scenas : [];
    const campaignScenes = existingScenes
      .filter((scene) => VERTICE_CAMPAIGN_SCENES.some((definition) => definition.name === scene.name))
      .map((scene, chapter) => {
        const definition = VERTICE_CAMPAIGN_SCENES.find((candidate) => candidate.name === scene.name);
        return {
          ...scene,
          id: scene.id || `scene-${definition.name}`,
          sceneType: definition.runtime,
          ...(definition.name === "guardiao_rele" ? {
            backgroundAssetName: "battle-rpg-usina-nearest-review.png",
            backgroundRenderMode: "tilemap",
            gbStudioUseBackgroundLayout: true
          } : {}),
          displayName: verticeSceneDisplayName(definition.name, definition.title),
          campaign: {
            ...(scene.campaign && typeof scene.campaign === "object" ? scene.campaign : {}),
            chapter,
            title: definition.title,
            objective: definition.objective,
            nextScene: definition.nextScene,
            completionVariable: definition.completionVariable ?? "",
            completedValue: definition.completedValue ?? 1,
            controls: definition.controls,
            success: definition.success,
            failureRecovery: definition.failureRecovery,
            tutorialDialogue: ""
          },
          eventBindings: {
            ...(scene.eventBindings && typeof scene.eventBindings === "object" ? scene.eventBindings : {}),
            onInit: VERTICE_INTRO_EVENTS[definition.name]
          },
          onEnterEventName: VERTICE_INTRO_EVENTS[definition.name],
          runtime: verticeRuntime(definition, scene.runtime)
        };
      });
    const supportScenes = materializeVerticeSupportScenes(campaignScenes, existingScenes);
    const allScenes = verticeOrderedScenes(campaignScenes, supportScenes);
    let promoted = finalizeVerticeProject({
      ...existing,
      actors: applyVerticeInitialMenuActorPattern([
        ...(Array.isArray(existing.actors) ? existing.actors : [])
          .filter((actor) => !["penedos_vento", "usina_submersa", "usina_combate", "usina_saida", "tempestade", "guardiao_rele", "circuito_final", "arena_tatica"].includes(actor?.roomName))
          .filter((actor) => !["nara-fighter", "rival-fighter"].includes(actor?.id)),
        ...((existing.actors ?? []).some((actor) => actor?.roomName === "conselho_guardia")
          ? []
          : verticeCouncilActors()),
        ...verticePenedosActors(),
        ...verticeBattleRpgActors(),
        ...verticeUsinaActors(),
        ...verticeTempestadeActors(),
        ...verticeLutaActors(),
        ...verticeRacingActors(),
        ...(isApprovedTacticalScene(existingScenes.find((scene) => scene.name === "arena_tatica"))
          ? existing.actors.filter((actor) => actor?.roomName === "arena_tatica")
          : verticeTacticalArenaActors())
      ]),
      rooms: structuredClone(allScenes),
      scenas: structuredClone(allScenes),
      editorState: verticeEditorState(existing.editorState, allScenes),
      settings: {
        ...(existing.settings && typeof existing.settings === "object" ? existing.settings : {}),
        general: {
          ...(existing.settings?.general && typeof existing.settings.general === "object" ? existing.settings.general : {}),
          startScene: VERTICE_ENTRY_SCENE,
          startSceneType: "cutscene"
        }
      },
      dialogues: verticeDialogues(),
      events: preserveReferencedSceneEvents(verticeCampaignEvents(), existing.events ?? [], allScenes),
      sceneRouteTables: VERTICE_SCENE_ROUTE_TABLES,
      variables: verticeVariables(),
      triggers: verticeTriggers()
    });
    promoted = promotePointClickSceneCandidates(promoted);
    promoted = promoteApprovedMarketSuspensoActors(promoted);
    promoted = promoteApprovedUsinaV3(promoted);
    promoted = promoteApprovedOpeningV2(promoted);
    promoted = promoteApprovedOpeningV3(promoted);
    promoted = promoteApprovedOpeningV4(promoted);
    promoted = promoteApprovedCircuitLoopV2(promoted);
    return promoteApprovedCharacterSelection(finalizeApprovedMenusAndRoute(promoted));
  }
  const farolProject = promoteExemploGBAFarolCampaign(data);
  const sourceScenes = new Map(farolProject.scenas.map((scene) => [scene.name, scene]));
  const sourceNameToVerticeName = new Map(
    Object.entries(VERTICE_SOURCE_SCENES).map(([verticeName, sourceName]) => [sourceName, verticeName])
  );
  const scenes = VERTICE_CAMPAIGN_SCENES.map((definition, chapter) => {
    const source = sourceScenes.get(VERTICE_SOURCE_SCENES[definition.name]);
    if (!source) throw new Error(`Cena-fonte ausente para Vértice: ${definition.name}.`);
    return {
          ...replaceSceneReference(structuredClone(source), sourceNameToVerticeName),
          id: `scene-${definition.name}`,
          name: definition.name,
          sceneType: definition.runtime,
          ...(definition.name === "guardiao_rele" ? {
            backgroundAssetName: "battle-rpg-usina-nearest-review.png",
            backgroundRenderMode: "tilemap",
            gbStudioUseBackgroundLayout: true
          } : {}),
          music: "",
      displayName: verticeSceneDisplayName(definition.name, definition.title),
      campaign: {
        chapter,
        title: definition.title,
        objective: definition.objective,
        nextScene: definition.nextScene,
        completionVariable: definition.completionVariable ?? "",
        completedValue: definition.completedValue ?? 1,
        controls: definition.controls,
        success: definition.success,
        failureRecovery: definition.failureRecovery,
        tutorialDialogue: ""
      },
      eventBindings: {
        onInit: VERTICE_INTRO_EVENTS[definition.name],
        ...(definition.name === "guardiao_rele" ? {
          onVictory: "guardiao_vitoria",
          onDefeat: "guardiao_derrota"
        } : {}),
        ...(definition.name === "arena_arrancada" ? {
          onVictory: "arena_vencer_rival",
          onDefeat: "arena_derrota"
        } : {}),
        ...(definition.name === "circuito_final" ? {
          onVictory: "circuito_concluir",
          onDefeat: "circuito_reiniciar"
        } : {})
      },
      onEnterEventName: VERTICE_INTRO_EVENTS[definition.name],
      runtime: verticeRuntime(definition, source.runtime)
    };
  });
  const supportScenes = materializeVerticeSupportScenes(scenes);
  const allScenes = verticeOrderedScenes(scenes, supportScenes);
  const actors = applyVerticeInitialMenuActorPattern(farolProject.actors
    .map((actor) => replaceSceneReference(structuredClone(actor), sourceNameToVerticeName))
    .filter((actor) => VERTICE_CAMPAIGN_SCENES.some((scene) => scene.name === actor.roomName))
    .filter((actor) => !["usina_submersa", "usina_combate", "usina_saida", "tempestade"].includes(actor.roomName))
    .map((actor) => {
      const interactionEvent = VERTICE_INTERACTION_EVENTS[actor.roomName];
      const {
        eventBindings: _eventBindings,
        eventName: _eventName,
        scriptName: _scriptName,
        ...actorWithoutLegacyBindings
      } = actor;
      if (!interactionEvent) return actorWithoutLegacyBindings;
      return {
        ...actorWithoutLegacyBindings,
        eventName: interactionEvent,
        scriptName: interactionEvent,
        eventBindings: { onInteract: interactionEvent }
      };
    })
    .concat(verticePenedosActors(), verticeBattleRpgActors(), verticeCouncilActors(), verticeUsinaActors(), verticeTempestadeActors(), verticeLutaActors(), verticeRacingActors(), verticeTacticalArenaActors()));
  const triggers = [];
  const editorState = farolProject.editorState && typeof farolProject.editorState === "object"
    ? farolProject.editorState
    : {};
  const settings = farolProject.settings && typeof farolProject.settings === "object" ? farolProject.settings : {};
  const general = settings.general && typeof settings.general === "object" ? settings.general : {};

  let promoted = finalizeVerticeProject({
    ...farolProject,
    actors,
    advancedTools: { ...(farolProject.advancedTools ?? {}), inputReplays: [] },
    dialogues: verticeDialogues(),
    editorState: verticeEditorState(editorState, allScenes),
    events: verticeCampaignEvents(),
    rooms: structuredClone(allScenes),
    scenas: allScenes,
    settings: {
      ...settings,
      general: {
        ...general,
        gameTitle: "O Último Farol",
        startPlayer: "",
        startScene: VERTICE_ENTRY_SCENE,
        startSceneType: "cutscene",
        version: "1.0.0"
      },
      save: { ...(settings.save ?? {}), autoSave: true, manualSave: true, slots: 3 },
      controls: {
        ...(settings.controls && typeof settings.controls === "object" ? settings.controls : {}),
        aButton: "X",
        bButton: "Z",
        lButton: "Q",
        rButton: "E",
        startButton: "Enter",
        selectButton: "Shift",
        dpad: "Setas",
        preset: "GBA clássico"
      },
      uiDialogs: { ...(settings.uiDialogs ?? {}), startMenuTitle: "O Último Farol", startMenuShowInventory: false, startMenuShowMap: false }
    },
    triggers: triggers.length > 0 ? triggers : verticeTriggers(),
    sceneRouteTables: VERTICE_SCENE_ROUTE_TABLES,
    variables: verticeVariables()
  });
  promoted = promotePointClickSceneCandidates(promoted);
  promoted = promoteApprovedMarketSuspensoActors(promoted);
  promoted = promoteApprovedUsinaV3(promoted);
  promoted = promoteApprovedOpeningV2(promoted);
  promoted = promoteApprovedOpeningV3(promoted);
  promoted = promoteApprovedOpeningV4(promoted);
  promoted = promoteApprovedCircuitLoopV2(promoted);
  return fitProjectSpriteFrames(promoteApprovedCharacterSelection(finalizeApprovedMenusAndRoute(promoted)));
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invokedPath) {
  const projectPaths = process.argv.slice(2);
  if (projectPaths.length === 0) {
    throw new Error("Uso: node showcase-project.mjs <projeto.gba-project> [...]");
  }
  for (const projectPath of projectPaths) {
    const project = JSON.parse(await readFile(projectPath, "utf8"));
    await writeFile(
      projectPath,
      `${JSON.stringify(promoteExemploGBAVerticeCampaign(project), null, 2)}\n`,
      "utf8"
    );
  }
}
