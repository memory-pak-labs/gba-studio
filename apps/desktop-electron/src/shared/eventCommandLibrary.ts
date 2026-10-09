// Generated from the legacy Swift event command references. Keep edits deliberate; this is the Electron registry source of truth.
import { isNativeEventCommandAcceptedByRomExport } from "./eventCommandRegistry.js";
import { eventCommandAuthoring, type EventAuthoringCategory, type EventCommandReference } from "./eventCommandReference.js";

export interface EventCommandDefinition {
  id: string;
  title: string;
  category: string;
  section: string | null;
  isFavorite: boolean;
  commandTemplate: string;
  reference?: EventCommandReference | null;
  authoringCategories?: EventAuthoringCategory[];
  searchAliases?: string[];
  isExtension?: boolean;
  adaptation?: string | null;
}

/** Complete historical catalog, retained for diagnostics and explicit editing of saved events. */
const historicalEventCommandDefinitions: EventCommandDefinition[] = [
  { id: "scene.set_background", title: "Trocar fundo da cutscene", category: "Cena", section: "Fundo", isFavorite: false, commandTemplate: "set_background {background}" },
  {
    "id": "dialogue.show",
    "title": "Exibir dialogo",
    "category": "Diálogo e menus",
    "section": null,
    "isFavorite": true,
    "commandTemplate": "show_dialogue {dialogue}"
  },
  {
    "id": "scene.change",
    "title": "Trocar cena",
    "category": "Cena",
    "section": null,
    "isFavorite": true,
    "commandTemplate": "change_scene {room}"
  },
  {
    "id": "scene.advance_campaign",
    "title": "Avançar campanha",
    "category": "Cena",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "advance_campaign"
  },
  {
    "id": "actor.projectile_load_slot",
    "title": "Carregar projetil para espaco",
    "category": "Ator",
    "section": "Ações",
    "isFavorite": false,
    "commandTemplate": "projectile_load_slot 0 {sprite} 1 100"
  },
  {
    "id": "actor.show_gesture",
    "title": "Exibir balao de gesto",
    "category": "Ator",
    "section": "Ações",
    "isFavorite": false,
    "commandTemplate": "show_actor_gesture {actor} happy 60"
  },
  {
    "id": "actor.launch_projectile",
    "title": "Lancar projetil",
    "category": "Ator",
    "section": "Ações",
    "isFavorite": false,
    "commandTemplate": "launch_projectile {actor} down"
  },
  {
    "id": "actor.launch_projectile_slot",
    "title": "Lancar projetil de espaco",
    "category": "Ator",
    "section": "Ações",
    "isFavorite": false,
    "commandTemplate": "launch_projectile_slot {actor} 0 down"
  },
  {
    "id": "actor.if_distance",
    "title": "Se a distancia entre o ator e o ator",
    "category": "Ator",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "if_actor_distance {actor} player 1"
  },
  {
    "id": "actor.if_relative",
    "title": "Se o ator e relativo ao ator",
    "category": "Ator",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "if_actor_relative {actor} player left"
  },
  {
    "id": "actor.if_direction",
    "title": "Se o ator esta na direcao",
    "category": "Ator",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "if_actor_direction {actor} down"
  },
  {
    "id": "actor.if_position",
    "title": "Se o ator estiver na posicao",
    "category": "Ator",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "if_actor_at_position {actor} 1 1"
  },
  {
    "id": "actor.cancel_movement",
    "title": "Cancelar movimento do ator",
    "category": "Ator",
    "section": "Movimentação",
    "isFavorite": false,
    "commandTemplate": "cancel_actor_movement {actor}"
  },
  {
    "id": "actor.set_position",
    "title": "Definir posicao do ator",
    "category": "Ator",
    "section": "Movimentação",
    "isFavorite": false,
    "commandTemplate": "set_actor_position {actor} 1 1"
  },
  {
    "id": "actor.set_relative_position",
    "title": "Definir posicao relativa do ator",
    "category": "Ator",
    "section": "Movimentação",
    "isFavorite": false,
    "commandTemplate": "set_actor_relative_position {actor} 1 0"
  },
  {
    "id": "actor.push_away_player",
    "title": "Empurrar ator para longe do jogador",
    "category": "Ator",
    "section": "Movimentação",
    "isFavorite": false,
    "commandTemplate": "push_actor_away_from_player {actor} 1"
  },
  {
    "id": "actor.move_to",
    "title": "Mover ator para",
    "category": "Ator",
    "section": "Movimentação",
    "isFavorite": false,
    "commandTemplate": "move_actor_to {actor} 1 1"
  },
  {
    "id": "actor.move_relative",
    "title": "Mover ator relativo",
    "category": "Ator",
    "section": "Movimentação",
    "isFavorite": false,
    "commandTemplate": "move_actor_relative {actor} 1 0"
  },
  {
    "id": "actor.player_bounce",
    "title": "Ricochete do jogador",
    "category": "Ator",
    "section": "Plataforma",
    "isFavorite": false,
    "commandTemplate": "player_bounce 1 20"
  },
  {
    "id": "actor.active",
    "title": "Ativar ator",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_actor_active {actor} true"
  },
  {
    "id": "actor.collision_box",
    "title": "Definir caixa de colisao do ator",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_actor_collision_box {actor} 0 0 16 16"
  },
  {
    "id": "actor.set_direction",
    "title": "Definir direcao do ator",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_actor_direction {actor} down"
  },
  {
    "id": "actor.set_animation_state",
    "title": "Definir estado de animacao do ator",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_actor_animation_state {actor} {animationState}"
  },
  {
    "id": "actor.change_sprite",
    "title": "Definir folha de sprite do ator",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "change_actor_sprite {actor} {sprite}"
  },
  {
    "id": "actor.change_player_sprite",
    "title": "Definir folha de sprite do jogador",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "change_player_sprite {sprite}"
  },
  {
    "id": "actor.animation_frame",
    "title": "Definir quadro da animacao do ator",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_actor_animation_frame {actor} 0"
  },
  {
    "id": "actor.animation_speed",
    "title": "Definir velocidade da animacao do ator",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_actor_animation_speed {actor} 100"
  },
  {
    "id": "actor.movement_speed",
    "title": "Definir velocidade de movimento do ator",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_actor_movement_speed {actor} 100"
  },
  {
    "id": "actor.hide",
    "title": "Desativar ator",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_actor_active {actor} false"
  },
  {
    "id": "actor.disable_collision",
    "title": "Desativar colisao de atores",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_actor_collision_enabled {actor} false"
  },
  {
    "id": "actor.effects",
    "title": "Efeitos do ator",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "actor_effects {actor} flash 30 50"
  },
  {
    "id": "actor.enable_collision",
    "title": "Habilitar colisao de atores",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_actor_collision_enabled {actor} true"
  },
  {
    "id": "actor.store_direction",
    "title": "Armazenar direcao ator em variaveis",
    "category": "Ator",
    "section": "Variáveis",
    "isFavorite": false,
    "commandTemplate": "store_actor_direction {actor} actor.direction"
  },
  {
    "id": "actor.store_position",
    "title": "Armazenar posicao ator em variaveis",
    "category": "Ator",
    "section": "Variáveis",
    "isFavorite": false,
    "commandTemplate": "store_actor_position {actor} actor.x actor.y"
  },
  {
    "id": "actor.show",
    "title": "Exibir ator",
    "category": "Ator",
    "section": "Visibilidade",
    "isFavorite": false,
    "commandTemplate": "set_actor_visible {actor} true"
  },
  {
    "id": "actor.show_all_sprites",
    "title": "Exibir todos os sprites",
    "category": "Ator",
    "section": "Visibilidade",
    "isFavorite": false,
    "commandTemplate": "set_all_sprites_visible true"
  },
  {
    "id": "actor.hide_actor",
    "title": "Ocultar ator",
    "category": "Ator",
    "section": "Visibilidade",
    "isFavorite": false,
    "commandTemplate": "set_actor_visible {actor} false"
  },
  {
    "id": "actor.hide_all_sprites",
    "title": "Ocultar todos os sprites",
    "category": "Ator",
    "section": "Visibilidade",
    "isFavorite": false,
    "commandTemplate": "set_all_sprites_visible false"
  },
  {
    "id": "actor.move",
    "title": "Mover ator",
    "category": "Ator",
    "section": "Movimentação",
    "isFavorite": false,
    "commandTemplate": "move_actor {actor} 1 0"
  },
  {
    "id": "actor.teleport",
    "title": "Teleportar ator",
    "category": "Ator",
    "section": "Movimentação",
    "isFavorite": false,
    "commandTemplate": "teleport_actor {actor} 1 1"
  },
  {
    "id": "actor.turn",
    "title": "Virar ator",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "turn_actor {actor} down"
  },
  {
    "id": "actor.set_animation",
    "title": "Definir animacao do ator",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_actor_animation {actor} {animation}"
  },
  {
    "id": "actor.play_animation",
    "title": "Reproduzir animacao do ator",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "play_actor_animation {actor} {animation} true"
  },
  {
    "id": "actor.wait_animation",
    "title": "Aguardar animacao do ator",
    "category": "Ator",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "wait_actor_animation {actor}"
  },
  {
    "id": "actor.shop",
    "title": "Abrir dialogo de loja",
    "category": "Ator",
    "section": "Loja",
    "isFavorite": false,
    "commandTemplate": "open_shop {actor}"
  },
  {
    "id": "engine.store_field",
    "title": "Armazenar campo do motor em variavel",
    "category": "Campos do motor",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "store_engine_field player_x {variable}"
  },
  {
    "id": "engine.update_field",
    "title": "Atualizar campo do motor",
    "category": "Campos do motor",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "set_engine_field player_x 0"
  },
  {
    "id": "engine.attach_adventure_callback",
    "title": "Anexar script ao callback de Aventura",
    "category": "Campos do motor",
    "section": "Aventura",
    "isFavorite": false,
    "commandTemplate": "attach_adventure_callback on_interact {event}"
  },
  {
    "id": "engine.remove_adventure_callback",
    "title": "Remover script do callback de Aventura",
    "category": "Campos do motor",
    "section": "Aventura",
    "isFavorite": false,
    "commandTemplate": "remove_adventure_callback on_interact"
  },
  {
    "id": "engine.set_adventure_state",
    "title": "Set Adventure State",
    "category": "Campos do motor",
    "section": "Aventura",
    "isFavorite": false,
    "commandTemplate": "set_adventure_state ground"
  },
  {
    "id": "engine.if_field_value",
    "title": "Se o campo do motor for comparado com valor",
    "category": "Campos do motor",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "if_engine_field player_x 0"
  },
  {
    "id": "engine.if_field_variable",
    "title": "Se o campo do motor for comparado com variavel",
    "category": "Campos do motor",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "if_engine_field_variable player_x engine.target"
  },
  {
    "id": "engine.attach_platform_callback",
    "title": "Anexar script ao retorno de chamada de evento de plataforma",
    "category": "Campos do motor",
    "section": "Plataforma",
    "isFavorite": false,
    "commandTemplate": "attach_platform_callback on_land {event}"
  },
  {
    "id": "engine.set_platform_state",
    "title": "Definir estado da plataforma",
    "category": "Campos do motor",
    "section": "Plataforma",
    "isFavorite": false,
    "commandTemplate": "set_platform_state ground"
  },
  {
    "id": "engine.remove_platform_callback",
    "title": "Remover script ao retorno de chamada de evento de plataforma",
    "category": "Campos do motor",
    "section": "Plataforma",
    "isFavorite": false,
    "commandTemplate": "remove_platform_callback on_land"
  },
  {
    "id": "engine.player_speed_profile",
    "title": "Definir perfil de velocidade",
    "category": "Campos do motor",
    "section": "Movimento",
    "isFavorite": false,
    "commandTemplate": "set_player_speed_profile 100 160 a 0"
  },
  {
    "id": "engine.player_movement_state",
    "title": "Definir estado de movimento",
    "category": "Campos do motor",
    "section": "Movimento",
    "isFavorite": false,
    "commandTemplate": "set_player_movement_state swimming water"
  },
  {
    "id": "engine.push_actor",
    "title": "Empurrar ator",
    "category": "Campos do motor",
    "section": "Puzzle",
    "isFavorite": false,
    "commandTemplate": "push_actor {actor} false"
  },
  {
    "id": "engine.clock_start",
    "title": "Iniciar relogio do jogo",
    "category": "Campos do motor",
    "section": "Tempo",
    "isFavorite": false,
    "commandTemplate": "start_game_clock 10 180 hud"
  },
  {
    "id": "engine.clock_advance",
    "title": "Avancar tempo",
    "category": "Campos do motor",
    "section": "Tempo",
    "isFavorite": false,
    "commandTemplate": "advance_time 60"
  },
  {
    "id": "rtc.read_field",
    "title": "Ler campo do RTC",
    "category": "Hardware",
    "section": "Tempo real",
    "isFavorite": false,
    "commandTemplate": "read_rtc hour time.hour"
  },
  {
    "id": "rtc.if_field",
    "title": "Se o RTC corresponder",
    "category": "Hardware",
    "section": "Tempo real",
    "isFavorite": false,
    "commandTemplate": "if_rtc weekday 6"
  },
  {
    "id": "engine.equip_menu",
    "title": "Abrir menu de equipamento",
    "category": "Campos do motor",
    "section": "Inventário",
    "isFavorite": false,
    "commandTemplate": "open_equip_menu 5 true"
  },
  {
    "id": "engine.equip_item",
    "title": "Definir item equipado",
    "category": "Campos do motor",
    "section": "Inventário",
    "isFavorite": false,
    "commandTemplate": "set_equipped_item 0 sword"
  },
  {
    "id": "inventory.add_item",
    "title": "Adicionar item ao inventario",
    "category": "Campos do motor",
    "section": "Inventário",
    "isFavorite": false,
    "commandTemplate": "add_item potion 1"
  },
  {
    "id": "scene.if_current",
    "title": "Se cena atual e",
    "category": "Cena",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "if_scene {currentRoom}"
  },
  {
    "id": "scene.change_by_variable",
    "title": "Trocar cena por variavel",
    "category": "Cena",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "change_scene_by_variable {routeTable}"
  },
  {
    "id": "scene.stack_push",
    "title": "Armazenar cena atual na pilha",
    "category": "Cena",
    "section": "Pilha de cenas",
    "isFavorite": false,
    "commandTemplate": "scene_stack_push"
  },
  {
    "id": "scene.stack_clear",
    "title": "Remover tudo da pilha de cenas",
    "category": "Cena",
    "section": "Pilha de cenas",
    "isFavorite": false,
    "commandTemplate": "scene_stack_clear"
  },
  {
    "id": "scene.stack_previous",
    "title": "Restaurar cena anterior da pilha",
    "category": "Cena",
    "section": "Pilha de cenas",
    "isFavorite": false,
    "commandTemplate": "scene_stack_previous"
  },
  {
    "id": "scene.stack_first",
    "title": "Restaurar primeira cena da pilha",
    "category": "Cena",
    "section": "Pilha de cenas",
    "isFavorite": false,
    "commandTemplate": "scene_stack_first"
  },
  {
    "id": "scene.pause_type",
    "title": "Pausar logica para o tipo de cena",
    "category": "Cena",
    "section": "Segmentos",
    "isFavorite": false,
    "commandTemplate": "pause_scene_type topdown"
  },
  {
    "id": "scene.resume_type",
    "title": "Retomar logica para o tipo de cena",
    "category": "Cena",
    "section": "Segmentos",
    "isFavorite": false,
    "commandTemplate": "resume_scene_type topdown"
  },
  {
    "id": "scene.replace_tile",
    "title": "Substituir tile na posicao",
    "category": "Cena",
    "section": "Tiles",
    "isFavorite": false,
    "commandTemplate": "replace_tile 0 0 0 bg0"
  },
  {
    "id": "scene.replace_tile_sequence",
    "title": "Substituir tile na posicao da sequencia",
    "category": "Cena",
    "section": "Tiles",
    "isFavorite": false,
    "commandTemplate": "replace_tile_sequence 0 0 0 1 bg0"
  },
  {
    "id": "colors.restore",
    "title": "Restaurar cores padrao",
    "category": "Cores",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "restore_colors"
  },
  {
    "id": "camera.follow_player",
    "title": "Definir camera no jogador",
    "category": "Câmera",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "camera_follow_player"
  },
  {
    "id": "camera.bounds",
    "title": "Definir limite da camera",
    "category": "Câmera",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "camera_set_bounds -120 -80 120 80"
  },
  {
    "id": "camera.position",
    "title": "Definir posicao da camera",
    "category": "Câmera",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "camera_set_position 0 0"
  },
  {
    "id": "camera.move",
    "title": "Mover camera para",
    "category": "Câmera",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "camera_move 16 0"
  },
  {
    "id": "camera.lock_player",
    "title": "Travar camera no jogador",
    "category": "Câmera",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "camera_lock_player"
  },
  {
    "id": "camera.shake",
    "title": "Vibracao de camera",
    "category": "Câmera",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "shake_screen 20"
  },
  {
    "id": "camera.property",
    "title": "Definir propriedade da camera",
    "category": "Câmera",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_camera_property shake 0"
  },
  {
    "id": "camera.fade_out",
    "title": "Desaparecimento de tela gradual",
    "category": "Câmera",
    "section": "Tela",
    "isFavorite": false,
    "commandTemplate": "fade_out 30"
  },
  {
    "id": "camera.fade_in",
    "title": "Aparecimento de tela gradual",
    "category": "Câmera",
    "section": "Tela",
    "isFavorite": false,
    "commandTemplate": "fade_in 30"
  },
  {
    "id": "dialogue.draw_text",
    "title": "Desenhar texto",
    "category": "Diálogo e menus",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "draw_text 1 1 overlay Texto direto no jogo"
  },
  {
    "id": "dialogue.menu",
    "title": "Exibir menu",
    "category": "Diálogo e menus",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "open_menu {choiceDialogue} {variable}"
  },
  {
    "id": "menu.slider",
    "title": "Slider de opções",
    "category": "Diálogo e menus",
    "section": "Navegação",
    "isFavorite": false,
    "commandTemplate": "slider title_options"
  },
  {
    "id": "dialogue.choice",
    "title": "Exibir multipla escolha",
    "category": "Diálogo e menus",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "show_choice {choiceDialogue}"
  },
  {
    "id": "dialogue.choice_branch",
    "title": "Branch de escolha",
    "category": "Diálogo e menus",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "choice_event {choiceDialogue} 0 {event}"
  },
  {
    "id": "dialogue.text_sfx",
    "title": "Definir efeito sonoro do texto",
    "category": "Diálogo e menus",
    "section": "Música e efeitos sonoros",
    "isFavorite": false,
    "commandTemplate": "set_text_sfx {sfx}"
  },
  {
    "id": "dialogue.frame",
    "title": "Definir quadro de dialogo",
    "category": "Diálogo e menus",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_dialogue_frame default"
  },
  {
    "id": "dialogue.text_speed",
    "title": "Definir velocidade da animacao do texto",
    "category": "Diálogo e menus",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_dialogue_text_speed 2"
  },
  {
    "id": "dialogue.language",
    "title": "Definir idioma do jogo",
    "category": "Diálogo e menus",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "set_language pt-BR"
  },
  {
    "id": "dialogue.close_non_modal",
    "title": "Fechar o dialogo nao modal",
    "category": "Diálogo e menus",
    "section": "Propriedades",
    "isFavorite": false,
    "commandTemplate": "close_dialogue"
  },
  {
    "id": "dialogue.text_input",
    "title": "Abrir entrada de texto",
    "category": "Diálogo e menus",
    "section": "Sistemas prontos",
    "isFavorite": false,
    "commandTemplate": "open_text_input player.name 8 latin_upper"
  },
  {
    "id": "dialogue.code_lock",
    "title": "Abrir cadeado numerico",
    "category": "Diálogo e menus",
    "section": "Sistemas prontos",
    "isFavorite": false,
    "commandTemplate": "open_code_lock story.padlock 4 4321"
  },
  {
    "id": "dialogue.speaker",
    "title": "Mostrar dialogo com nome",
    "category": "Diálogo e menus",
    "section": "Sistemas prontos",
    "isFavorite": false,
    "commandTemplate": "show_dialogue_speaker intro_001 Narrador"
  },
  {
    "id": "hud.stat_set",
    "title": "Definir status",
    "category": "HUD",
    "section": "Stats",
    "isFavorite": false,
    "commandTemplate": "set_stat hp 16 16"
  },
  {
    "id": "hud.stat_modify",
    "title": "Modificar status",
    "category": "HUD",
    "section": "Stats",
    "isFavorite": false,
    "commandTemplate": "modify_stat hp -1"
  },
  {
    "id": "hud.stat_bar",
    "title": "Exibir barra de status",
    "category": "HUD",
    "section": "Stats",
    "isFavorite": false,
    "commandTemplate": "show_stat_bar hp 8 8 64 horizontal"
  },
  {
    "id": "hud.hearts",
    "title": "Exibir coracoes",
    "category": "HUD",
    "section": "Stats",
    "isFavorite": false,
    "commandTemplate": "show_hearts hp 4 4"
  },
  {
    "id": "hud.wallet_modify",
    "title": "Modificar carteira",
    "category": "HUD",
    "section": "Carteira",
    "isFavorite": false,
    "commandTemplate": "modify_wallet wallet.gold 25 999"
  },
  {
    "id": "hud.number",
    "title": "Exibir numero no HUD",
    "category": "HUD",
    "section": "Carteira",
    "isFavorite": false,
    "commandTemplate": "show_number_hud wallet.gold 200 8 3"
  },
  {
    "id": "input.attach_button",
    "title": "Anexar script ao botao",
    "category": "Entrada de controle",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "attach_button a {event}"
  },
  {
    "id": "input.wait_button",
    "title": "Pausar script ate pressionar botao",
    "category": "Entrada de controle",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "wait_button a"
  },
  {
    "id": "input.remove_button",
    "title": "Remover script do botao",
    "category": "Entrada de controle",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "remove_button a"
  },
  {
    "id": "input.if_button",
    "title": "Se o botao esta pressionado",
    "category": "Entrada de controle",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "if_button a"
  },
  {
    "id": "flow.call_event",
    "title": "Chamar evento",
    "category": "Fluxo de controle",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "call_event {event}"
  },
  {
    "id": "flow.if_flag",
    "title": "Se flag",
    "category": "Fluxo de controle",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "if_flag story.progress true"
  },
  {
    "id": "flow.if_variable",
    "title": "Se comparar variavel com valor",
    "category": "Fluxo de controle",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "if_variable {variable} 10"
  },
  {
    "id": "flow.else",
    "title": "Senao",
    "category": "Fluxo de controle",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "else"
  },
  {
    "id": "flow.switch_variable",
    "title": "Switch por variavel",
    "category": "Fluxo de controle",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "switch_variable story.route 0 {event} 1 {event}"
  },
  {
    "id": "flow.if_variable_greater",
    "title": "Se variavel maior que valor",
    "category": "Fluxo de controle",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "if_variable_greater_than {variable} 5"
  },
  {
    "id": "flow.if_variable_less",
    "title": "Se variavel menor que valor",
    "category": "Fluxo de controle",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "if_variable_less_than {variable} 100"
  },
  {
    "id": "flow.has_item",
    "title": "Se possuir item",
    "category": "Fluxo de controle",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "has_item potion 1"
  },
  {
    "id": "flow.stop",
    "title": "Parar evento",
    "category": "Fluxo de controle",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "stop_event"
  },
  {
    "id": "math.random_seed",
    "title": "Semente de gerador de numero aleatorio",
    "category": "Matemática",
    "section": "Aleatório",
    "isFavorite": false,
    "commandTemplate": "random_variable story.dice 1 6"
  },
  {
    "id": "math.repeat_expression",
    "title": "Repetir durante expressao matematica",
    "category": "Matemática",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "repeat_expression story.counter lt 10 {event} 8"
  },
  {
    "id": "math.if_expression",
    "title": "Se a expressao matematica",
    "category": "Matemática",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "if_variable_greater_than {variable} 5"
  },
  {
    "id": "math.evaluate",
    "title": "Avaliar expressao matematica",
    "category": "Matemática",
    "section": "Variáveis",
    "isFavorite": false,
    "commandTemplate": "set_variable {variable} 10"
  },
  {
    "id": "math.functions",
    "title": "Funcoes matematicas",
    "category": "Matemática",
    "section": "Variáveis",
    "isFavorite": false,
    "commandTemplate": "multiply_variable {variable} 2"
  },
  {
    "id": "audio.play_music",
    "title": "Reproduzir faixa de musica",
    "category": "Música e efeitos sonoros",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "play_music {music}"
  },
  {
    "id": "audio.play_sfx",
    "title": "Tocar efeito sonoro",
    "category": "Música e efeitos sonoros",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "play_sfx {sfx}"
  },
  {
    "id": "audio.text_sfx",
    "title": "Definir efeito sonoro do texto",
    "category": "Música e efeitos sonoros",
    "section": "Diálogo e menus",
    "isFavorite": false,
    "commandTemplate": "set_text_sfx {sfx}"
  },
  {
    "id": "audio.stop_music",
    "title": "Parar musica",
    "category": "Música e efeitos sonoros",
    "section": "Parar",
    "isFavorite": false,
    "commandTemplate": "stop_music"
  },
  {
    "id": "audio.mute_channel",
    "title": "Silenciar canal",
    "category": "Música e efeitos sonoros",
    "section": "Parar",
    "isFavorite": false,
    "commandTemplate": "mute_audio_channel music true"
  },
  {
    "id": "audio.set_volume",
    "title": "Definir volume do canal",
    "category": "Música e efeitos sonoros",
    "section": "Mixagem",
    "isFavorite": false,
    "commandTemplate": "set_audio_volume music 100"
  },
  {
    "id": "audio.fade_volume",
    "title": "Transicionar volume do canal",
    "category": "Música e efeitos sonoros",
    "section": "Mixagem",
    "isFavorite": false,
    "commandTemplate": "fade_audio_volume music 0 60"
  },
  {
    "id": "audio.routine",
    "title": "Executar rotina de música",
    "category": "Música e efeitos sonoros",
    "section": "Script",
    "isFavorite": false,
    "commandTemplate": "run_audio_routine {music}"
  },
  {
    "id": "save.load",
    "title": "Carregar dados do jogo",
    "category": "Salvar dados",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "load_game"
  },
  {
    "id": "save.remove",
    "title": "Remover dados do jogo",
    "category": "Salvar dados",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "remove_save_game"
  },
  {
    "id": "save.save",
    "title": "Salvar dados do jogo",
    "category": "Salvar dados",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "save_game"
  },
  {
    "id": "save.if_saved",
    "title": "Se salvar dados do jogo",
    "category": "Salvar dados",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "if_save_game"
  },
  {
    "id": "save.store_variable",
    "title": "Consultar presença do save em variável",
    "category": "Salvar dados",
    "section": "Variáveis",
    "isFavorite": false,
    "commandTemplate": "store_save_variable 0 {variable}"
  },
  {
    "id": "data.lookup",
    "title": "Data Table Lookup",
    "category": "Dados",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "data_table_lookup table_id index target"
  },
  {
    "id": "screen.fade_out",
    "title": "Desaparecimento de tela gradual",
    "category": "Tela",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "fade_out 30"
  },
  {
    "id": "screen.fade_in",
    "title": "Aparecimento de tela gradual",
    "category": "Tela",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "fade_in 30"
  },
  {
    "id": "visual.apply_effect",
    "title": "Aplicar efeito visual",
    "category": "Visual Effects",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "visual_effect water_ripple bg2 120 50"
  },
  {
    "id": "screen.overlay_line",
    "title": "Definir corte de linha da sobreposicao",
    "category": "Tela",
    "section": "Sobreposição",
    "isFavorite": false,
    "commandTemplate": "overlay_line 0"
  },
  {
    "id": "screen.overlay_show",
    "title": "Exibir sobreposicao",
    "category": "Tela",
    "section": "Sobreposição",
    "isFavorite": false,
    "commandTemplate": "overlay_show 0 0 160 40"
  },
  {
    "id": "screen.overlay_move",
    "title": "Mover sobreposicao para",
    "category": "Tela",
    "section": "Sobreposição",
    "isFavorite": false,
    "commandTemplate": "overlay_move 0 0 30"
  },
  {
    "id": "screen.overlay_hide",
    "title": "Ocultar sobreposicao",
    "category": "Tela",
    "section": "Sobreposição",
    "isFavorite": false,
    "commandTemplate": "overlay_hide 30"
  },
  {
    "id": "timer.wait",
    "title": "Aguardar",
    "category": "Temporizador",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "wait 30"
  },
  {
    "id": "timer.idle",
    "title": "Inativo",
    "category": "Temporizador",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "idle 1"
  },
  {
    "id": "timer.rate_limit",
    "title": "Rate Limit",
    "category": "Temporizador",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "rate_limit 30"
  },
  {
    "id": "timer.attach",
    "title": "Anexar script temporizador",
    "category": "Temporizador",
    "section": "Script",
    "isFavorite": false,
    "commandTemplate": "timer_attach 60 {event}"
  },
  {
    "id": "timer.restart",
    "title": "Reiniciar temporizador",
    "category": "Temporizador",
    "section": "Script",
    "isFavorite": false,
    "commandTemplate": "timer_restart {event}"
  },
  {
    "id": "timer.remove",
    "title": "Remover script temporizador",
    "category": "Temporizador",
    "section": "Script",
    "isFavorite": false,
    "commandTemplate": "timer_remove {event}"
  },
  {
    "id": "variables.set_value",
    "title": "Definir variavel para valor",
    "category": "Variáveis",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "set_variable {variable} 10"
  },
  {
    "id": "variables.random_seed",
    "title": "Semente de gerador de numero aleatorio",
    "category": "Variáveis",
    "section": "Aleatório",
    "isFavorite": false,
    "commandTemplate": "random_variable story.dice 1 6"
  },
  {
    "id": "variables.set_random_seed",
    "title": "Definir semente aleatoria",
    "category": "Variáveis",
    "section": "Aleatório",
    "isFavorite": false,
    "commandTemplate": "set_random_seed story.seed"
  },
  {
    "id": "variables.actor_direction",
    "title": "Armazenar direcao ator em variaveis",
    "category": "Variáveis",
    "section": "Ator",
    "isFavorite": false,
    "commandTemplate": "store_actor_direction {actor} actor.direction"
  },
  {
    "id": "variables.actor_position",
    "title": "Armazenar posicao ator em variaveis",
    "category": "Variáveis",
    "section": "Ator",
    "isFavorite": false,
    "commandTemplate": "store_actor_position {actor} actor.x actor.y"
  },
  {
    "id": "variables.false",
    "title": "Definir variavel para 'Falso'",
    "category": "Variáveis",
    "section": "Booleano",
    "isFavorite": false,
    "commandTemplate": "set_flag story.progress false"
  },
  {
    "id": "variables.true",
    "title": "Definir variavel para 'Verdadeiro'",
    "category": "Variáveis",
    "section": "Booleano",
    "isFavorite": false,
    "commandTemplate": "set_flag story.progress true"
  },
  {
    "id": "variables.engine_field",
    "title": "Armazenar campo do motor em variavel",
    "category": "Variáveis",
    "section": "Campos do motor",
    "isFavorite": false,
    "commandTemplate": "store_engine_field player_x {variable}"
  },
  {
    "id": "variables.decrement",
    "title": "Decrescimo de 1 a variavel",
    "category": "Variáveis",
    "section": "Contador",
    "isFavorite": false,
    "commandTemplate": "add_variable story.gold -1"
  },
  {
    "id": "variables.increment",
    "title": "Incremento de 1 a variavel",
    "category": "Variáveis",
    "section": "Contador",
    "isFavorite": false,
    "commandTemplate": "add_variable {variable} 1"
  },
  {
    "id": "variables.if_value",
    "title": "Se comparar variavel com valor",
    "category": "Variáveis",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "if_variable {variable} 10"
  },
  {
    "id": "variables.if_variable",
    "title": "Se comparar variavel com variavel",
    "category": "Variáveis",
    "section": "Fluxo de controle",
    "isFavorite": false,
    "commandTemplate": "if_variable_variable {variable} story.target"
  },
  {
    "id": "variables.add_flags",
    "title": "Adicionar marcadores a variavel",
    "category": "Variáveis",
    "section": "Marcadores",
    "isFavorite": false,
    "commandTemplate": "add_variable_flags story.flags 1"
  },
  {
    "id": "variables.set_flag",
    "title": "Definir marcador da variavel",
    "category": "Variáveis",
    "section": "Marcadores",
    "isFavorite": false,
    "commandTemplate": "set_variable_flags story.flags 1"
  },
  {
    "id": "variables.clear_flags",
    "title": "Limpar marcadores da variavel",
    "category": "Variáveis",
    "section": "Marcadores",
    "isFavorite": false,
    "commandTemplate": "clear_variable_flags story.flags 1"
  },
  {
    "id": "variables.evaluate_math",
    "title": "Avaliar expressao matematica",
    "category": "Variáveis",
    "section": "Matemática",
    "isFavorite": false,
    "commandTemplate": "set_variable {variable} 10"
  },
  {
    "id": "variables.math_functions",
    "title": "Funcoes matematicas",
    "category": "Variáveis",
    "section": "Matemática",
    "isFavorite": false,
    "commandTemplate": "multiply_variable {variable} 2"
  },
  {
    "id": "variables.reset_false",
    "title": "Redefinir todas as variaveis para 'Falso'",
    "category": "Variáveis",
    "section": "Reiniciar",
    "isFavorite": false,
    "commandTemplate": "reset_variables_false"
  },
  {
    "id": "variables.save_data",
    "title": "Consultar presença do save em variável",
    "category": "Variáveis",
    "section": "Salvar dados",
    "isFavorite": false,
    "commandTemplate": "store_save_variable 0 {variable}"
  },
  {
    "id": "misc.group",
    "title": "Agrupar evento",
    "category": "Diversos",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "group Grupo"
  },
  {
    "id": "misc.comment",
    "title": "Comentar",
    "category": "Diversos",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "comment Nota do evento"
  },
  {
    "id": "misc.gbvm",
    "title": "Script GBVM",
    "category": "Diversos",
    "section": null,
    "isFavorite": false,
    "commandTemplate": "gbvm_script script_1"
  },
  {
    "id": "misc.printer",
    "title": "Imprimir usando a impressora GB",
    "category": "Diversos",
    "section": "Impressora",
    "isFavorite": false,
    "commandTemplate": "printer {dialogue}"
  },
  {
    "id": "misc.multiplayer_join",
    "title": "Conexao: Entrar",
    "category": "Diversos",
    "section": "Multijogador",
    "isFavorite": false,
    "commandTemplate": "multiplayer_join {event} 120"
  },
  {
    "id": "misc.multiplayer_close",
    "title": "Conexao: Fechar",
    "category": "Diversos",
    "section": "Multijogador",
    "isFavorite": false,
    "commandTemplate": "multiplayer_close"
  },
  {
    "id": "misc.multiplayer_host",
    "title": "Conexao: Hospedar",
    "category": "Diversos",
    "section": "Multijogador",
    "isFavorite": false,
    "commandTemplate": "multiplayer_host {event} 120"
  },
  {
    "id": "misc.multiplayer_transfer",
    "title": "Conexao: Transferir",
    "category": "Diversos",
    "section": "Multijogador",
    "isFavorite": false,
    "commandTemplate": "multiplayer_transfer net.value 0 120"
  },
  {
    "id": "misc.rumble_on",
    "title": "Rumble: Ligar",
    "category": "Diversos",
    "section": "Multijogador",
    "isFavorite": false,
    "commandTemplate": "rumble_on"
  },
  {
    "id": "misc.rumble_on_for",
    "title": "Rumble: Vibrar por quadros",
    "category": "Diversos",
    "section": "Multijogador",
    "isFavorite": false,
    "commandTemplate": "rumble_on_for 60"
  },
  {
    "id": "misc.rumble_off",
    "title": "Rumble: Desligar",
    "category": "Diversos",
    "section": "Multijogador",
    "isFavorite": false,
    "commandTemplate": "rumble_off"
  },
  {
    "id": "misc.multiplayer4_open",
    "title": "Multijogador 4P: Abrir sessao",
    "category": "Diversos",
    "section": "Multijogador",
    "isFavorite": false,
    "commandTemplate": "multiplayer4_open 4"
  },
  {
    "id": "misc.multiplayer4_set",
    "title": "Multijogador 4P: Definir dado",
    "category": "Diversos",
    "section": "Multijogador",
    "isFavorite": false,
    "commandTemplate": "multiplayer4_set 0"
  },
  {
    "id": "misc.multiplayer4_sync",
    "title": "Multijogador 4P: Sincronizar",
    "category": "Diversos",
    "section": "Multijogador",
    "isFavorite": false,
    "commandTemplate": "multiplayer4_sync"
  },
  {
    "id": "misc.multiplayer4_read",
    "title": "Multijogador 4P: Ler dados",
    "category": "Diversos",
    "section": "Multijogador",
    "isFavorite": false,
    "commandTemplate": "multiplayer4_read net.var_player net.var_count net.var_data"
  },
  {
    "id": "misc.multiplayer4_close",
    "title": "Multijogador 4P: Fechar sessao",
    "category": "Diversos",
    "section": "Multijogador",
    "isFavorite": false,
    "commandTemplate": "multiplayer4_close"
  },
  {
    "id": "misc.lock_script",
    "title": "Bloquear script",
    "category": "Diversos",
    "section": "Segmentos",
    "isFavorite": false,
    "commandTemplate": "lock_script {event}"
  },
  {
    "id": "misc.unlock_script",
    "title": "Desbloquear script",
    "category": "Diversos",
    "section": "Segmentos",
    "isFavorite": false,
    "commandTemplate": "unlock_script {event}"
  },
  {
    "id": "misc.start_segment",
    "title": "Iniciar segmento",
    "category": "Diversos",
    "section": "Segmentos",
    "isFavorite": false,
    "commandTemplate": "start_segment 0 {event}"
  },
  {
    "id": "misc.stop_segment",
    "title": "Parar segmento",
    "category": "Diversos",
    "section": "Segmentos",
    "isFavorite": false,
    "commandTemplate": "stop_segment 0"
  },
  {
    "id": "misc.pause_scene_type",
    "title": "Pausar logica para o tipo de cena",
    "category": "Diversos",
    "section": "Segmentos",
    "isFavorite": false,
    "commandTemplate": "pause_scene_type topdown"
  },
  {
    "id": "misc.resume_scene_type",
    "title": "Retomar logica para o tipo de cena",
    "category": "Diversos",
    "section": "Segmentos",
    "isFavorite": false,
    "commandTemplate": "resume_scene_type topdown"
  },
  {
    "id": "luta.start_match",
    "title": "Iniciar partida de luta",
    "category": "Luta",
    "section": "Partida",
    "isFavorite": true,
    "commandTemplate": "luta_start_match {stage}"
  },
  {
    "id": "luta.end_match",
    "title": "Finalizar partida de luta",
    "category": "Luta",
    "section": "Partida",
    "isFavorite": true,
    "commandTemplate": "luta_end_match {winner}"
  },
  {
    "id": "luta.set_super_gauge",
    "title": "Definir medidor de super",
    "category": "Luta",
    "section": "Mecanicas",
    "isFavorite": false,
    "commandTemplate": "luta_set_super_gauge {actor} {amount}"
  },
  {
    "id": "luta.add_super_gauge",
    "title": "Adicionar ao medidor de super",
    "category": "Luta",
    "section": "Mecanicas",
    "isFavorite": false,
    "commandTemplate": "luta_add_super_gauge {actor} {amount}"
  },
  {
    "id": "luta.set_guard_power",
    "title": "Definir poder de guarda",
    "category": "Luta",
    "section": "Mecanicas",
    "isFavorite": false,
    "commandTemplate": "luta_set_guard_power {actor} {amount}"
  },
  {
    "id": "luta.set_ism_style",
    "title": "Definir estilo ISM",
    "category": "Luta",
    "section": "Mecanicas",
    "isFavorite": false,
    "commandTemplate": "luta_set_ism_style {actor} {style}"
  },
  {
    "id": "luta.trigger_super",
    "title": "Ativar super/ultra",
    "category": "Luta",
    "section": "Mecanicas",
    "isFavorite": false,
    "commandTemplate": "luta_trigger_super {actor} {move_id}"
  },
  {
    "id": "luta.enable_alpha_counter",
    "title": "Habilitar Alpha Counter",
    "category": "Luta",
    "section": "Mecanicas",
    "isFavorite": false,
    "commandTemplate": "luta_enable_alpha_counter {actor} {enabled}"
  },
  {
    "id": "luta.set_round_timer",
    "title": "Definir timer do round",
    "category": "Luta",
    "section": "Partida",
    "isFavorite": false,
    "commandTemplate": "luta_set_round_timer {seconds}"
  },
  {
    "id": "luta.set_rounds_to_win",
    "title": "Definir rounds para vitoria",
    "category": "Luta",
    "section": "Partida",
    "isFavorite": false,
    "commandTemplate": "luta_set_rounds_to_win {count}"
  }
];

/** Presentation follows the reviewed GB Studio vocabulary; stored commands retain their identity. */
export const eventCommandCatalog = historicalEventCommandDefinitions.map(definition => {
  const authoring = eventCommandAuthoring[definition.id];
  if (!authoring) return definition;
  return {
    ...definition,
    title: authoring.title,
    category: authoring.category,
    section: authoring.section,
    reference: authoring.reference,
    authoringCategories: authoring.groups,
    searchAliases: authoring.aliases,
    isExtension: !authoring.reference,
    adaptation: authoring.adaptation
  };
});

/** New events are authored only from definitions accepted by the current backend. */
export const eventCommandLibrary = eventCommandCatalog.filter(definition =>
  isNativeEventCommandAcceptedByRomExport(definition.commandTemplate.split(/\s+/)[0] ?? "noop"));
export const archivedEventCommandLibrary = eventCommandCatalog.filter(definition =>
  !isNativeEventCommandAcceptedByRomExport(definition.commandTemplate.split(/\s+/)[0] ?? "noop"));
// Recognition of a historical verb is not proof of an executable action.
export const eventCommandRuntimeVerbs = new Set(eventCommandCatalog.map(definition => definition.commandTemplate.split(/\s+/)[0] ?? "noop"));
