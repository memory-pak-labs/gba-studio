/** Authoring metadata only. Never rewrites a command or its serialized arguments. */
const parameterLabels: Record<string, string[]> = {
  draw_text: ["X (tiles)", "Y (tiles)", "Destino", "Texto"],
  start_segment: ["Segmento (0–31)", "Script"], stop_segment: ["Segmento (0–31)"],
  set_adventure_state: ["Estado"], push_actor: ["Ator", "Continuar até colisão"],
  open_menu: ["Diálogo de opções", "Variável de resposta"], open_shop: ["Ator"],
  open_code_lock: ["Variável de resposta", "Dígitos (1–4)", "Código"], open_equip_menu: ["Slots (1–8)", "Pausar o mundo"],
  cancel_actor_movement: ["Ator"], set_actor_animation_state: ["Ator", "Estado de animação"],
  projectile_load_slot: ["Slot", "Sprite", "Dano", "Velocidade (centésimos de pixel/quadro)"], launch_projectile_slot: ["Ator", "Slot", "Direção"],
  actor_effects: ["Ator", "Efeito", "Duração (quadros)", "Intensidade"],
  start_game_clock: ["Minutos por avanço", "Quadros por avanço", "Apresentação"], advance_time: ["Minutos"],
  luta_start_match: ["Cena de Luta"], luta_end_match: ["Vencedor"],
  luta_set_super_gauge: ["Lutador", "Medidor"], luta_add_super_gauge: ["Lutador", "Quantidade"],
  luta_set_guard_power: ["Lutador", "Poder de guarda"], luta_set_ism_style: ["Lutador", "Estilo"],
  luta_trigger_super: ["Lutador", "Golpe"], luta_enable_alpha_counter: ["Lutador", "Habilitado"],
  luta_set_round_timer: ["Duração (segundos, 1–546)"], luta_set_rounds_to_win: ["Vitórias necessárias"],
  change_scene: ["Cena", "X (tiles)", "Y (tiles)", "Direção"],
  change_scene_by_variable: ["Tabela de destinos", "Variável"],
  set_background: ["Background"],
  set_variable: ["Variável", "Valor"], add_variable: ["Variável", "Valor"],
  random_variable: ["Variável", "Mínimo", "Máximo"], multiply_variable: ["Variável", "Valor"],
  if_variable: ["Variável", "Valor"], if_variable_greater_than: ["Variável", "Valor mínimo"],
  if_variable_less_than: ["Variável", "Valor máximo"], if_variable_variable: ["Variável", "Comparar com"],
  copy_variable: ["Variável de destino", "Variável de origem"],
  add_item: ["Item", "Quantidade"], remove_item: ["Item", "Quantidade"], has_item: ["Item", "Quantidade"],
  wait: ["Duração (quadros)"], wait_frames: ["Duração (quadros)"],
  idle: ["Duração (quadros)"],
  store_engine_field: ["Campo", "Variável de destino"], store_save_variable: ["Slot do save", "Variável de destino"],
  attach_adventure_callback: ["Callback", "Evento"], remove_adventure_callback: ["Callback"],
  remove_platform_callback: ["Callback"], set_platform_state: ["Estado"],
  pause_scene_type: ["Lógica da cena"], resume_scene_type: ["Lógica da cena"], run_audio_routine: ["Música tracker"],
  fade_in: ["Duração (quadros)"], fade_out: ["Duração (quadros)"],
  play_music: ["Música"], play_sfx: ["Efeito sonoro"], set_music_volume: ["Volume"],
  show_dialogue: ["Diálogo"], show_choice: ["Diálogo de escolhas", "Variável de resposta"],
  call_event: ["Script"], call_procedure: ["Rotina"], if_button: ["Botão"],
  set_actor_position: ["Ator", "X", "Y"], set_actor_relative_position: ["Ator", "Deslocamento X", "Deslocamento Y"],
  move_actor_to: ["Ator", "X", "Y"], move_actor_relative: ["Ator", "Deslocamento X", "Deslocamento Y"],
  set_actor_direction: ["Ator", "Direção"], if_actor_direction: ["Ator", "Direção"],
  if_actor_at_position: ["Ator", "X", "Y"], if_actor_distance: ["Ator", "Outro ator", "Distância"],
  set_actor_animation: ["Ator", "Animação"], set_actor_sprite: ["Ator", "Sprite"],
  set_camera_position: ["X", "Y"], camera_move_to: ["X", "Y", "Duração (quadros)"],
  set_engine_field: ["Campo", "Valor"], set_engine_field_variable: ["Campo", "Variável"],
  if_engine_field: ["Campo", "Valor"], if_engine_field_variable: ["Campo", "Variável"],
  set_flag: ["Flag", "Valor"], if_flag: ["Flag"],
  rate_limit: ["Duração (quadros)", "Slot"], comment: ["Texto"]
};

const descriptions: Record<string, string> = {
  draw_text: "Desenha uma linha sem caixa de diálogo. background usa coordenadas da cena na grade de tiles; overlay usa coordenadas fixas da tela.",
  start_segment: "Executa outro script em paralelo, com esperas independentes, e guarda seu identificador 0–31.",
  stop_segment: "Interrompe o script paralelo do segmento, incluindo as chamadas iniciadas por ele.",
  set_adventure_state: "Define o movimento do jogador: chão, dash, recuo, imobilização, corrida ou empurrão.",
  push_actor: "Empurra o ator na direção do jogador por um tile, ou desliza até uma colisão quando habilitado.",
  open_menu: "Exibe opções e aguarda a escolha do jogador. Guarda 1 para a primeira opção, 2 para a segunda, e -1 no cancelamento.",
  open_shop: "Abre a loja configurada na cena a partir do ator. As compras usam preço, moeda e estoque configurados.",
  open_code_lock: "Aguarda um código numérico: retorna 1 quando correto, 0 quando errado e -1 ao cancelar.",
  open_equip_menu: "Permite escolher o slot, equipar um item do inventário ou removê-lo. A pausa controla o avanço do mundo.",
  cancel_actor_movement: "Interrompe a trajetória automática do ator. No jogador, cancela o passo atual; uma nova entrada permite movimentar novamente.",
  set_actor_animation_state: "Troca o conjunto completo de animações do ator pelo estado cadastrado em Sprites.",
  projectile_load_slot: "Liga um sprite do projeto, dano e velocidade ao slot de projétil 0–7.",
  launch_projectile_slot: "Lança o projétil configurado no slot a partir do ator, com colisão e dano.",
  actor_effects: "Pisca (flash) ou desloca visualmente (shake) apenas o ator durante a duração configurada.",
  start_game_clock: "Inicia o relógio do jogo e avança a hora na cadência configurada. hud mostra HH:MM; hidden oculta a hora.",
  advance_time: "Adiciona ou retira minutos do relógio do jogo, com retorno ao início do dia após 24 horas.",
  luta_start_match: "Inicia uma partida na cena de Luta selecionada, restaurando os lutadores e os rounds.",
  luta_end_match: "Finaliza a partida com vitória de player1, player2 ou empate e executa o resultado da cena.",
  luta_set_super_gauge: "Define o medidor do lutador, limitado ao máximo configurado na cena.",
  luta_add_super_gauge: "Adiciona ou retira uma quantidade do medidor do lutador.",
  luta_set_guard_power: "Define a guarda atual e o máximo de recuperação do lutador.",
  luta_set_ism_style: "Troca o estilo ISM do lutador durante a partida.",
  luta_trigger_super: "Executa super ou ultra quando o medidor está cheio; causa dano conforme a guarda do adversário.",
  luta_enable_alpha_counter: "Habilita ou desabilita o Alpha Counter do lutador.",
  luta_set_round_timer: "Define a duração em segundos do round atual e dos próximos rounds.",
  luta_set_rounds_to_win: "Define quantas vitórias encerram a partida.",
  change_scene: "Abre uma cena e define a posição e a direção de chegada do jogador.",
  change_scene_by_variable: "Escolhe a cena de destino usando uma tabela de rotas e o valor de uma variável.",
  set_background: "Troca o fundo de uma cutscene durante a sequência.",
  show_dialogue: "Mostra o texto de um diálogo para o jogador.",
  show_choice: "Mostra opções de resposta e permite usar a escolha na lógica.",
  play_music: "Começa a reprodução da música selecionada.", play_sfx: "Reproduz um efeito sonoro.",
  stop_music: "Interrompe a música atual.", wait: "Aguarda uma duração em quadros antes de continuar.",
  set_variable: "Guarda um valor em uma variável do projeto.", if_variable: "Executa um dos caminhos conforme o valor da variável.",
  call_event: "Executa outro script do projeto.", call_procedure: "Chama uma rotina reutilizável com seus parâmetros.",
  add_item: "Adiciona uma quantidade de itens ao inventário.", remove_item: "Remove itens do inventário.",
  scene_stack_push: "Guarda a cena atual no histórico de cenas.", scene_stack_previous: "Retorna à cena anterior guardada no histórico.",
  scene_stack_first: "Retorna à primeira cena guardada no histórico.", scene_stack_clear: "Limpa o histórico de cenas.",
  move_actor_to: "Move um ator até a posição indicada.", set_actor_position: "Define a posição de um ator.",
  set_actor_direction: "Muda a direção para a qual o ator olha.",
  fade_in: "Revela a tela gradualmente.", fade_out: "Escurece a tela gradualmente.",
  save_game: "Grava o progresso do jogo no armazenamento do cartucho.", load_game: "Carrega um progresso salvo.",
  store_engine_field: "Lê um campo atual do motor e guarda o valor na variável de destino.",
  store_save_variable: "Guarda 1 se há save no slot, ou 0 se não há. Disponível em Aventura e Plataforma.",
  attach_adventure_callback: "Executa um evento ao interagir, entrar ou sair de uma sala de Aventura.",
  remove_adventure_callback: "Remove o evento de um callback de Aventura.",
  remove_platform_callback: "Remove o evento de um callback de Plataforma.",
  set_platform_state: "Solicita um estado nativo do jogador de Plataforma, como ground ou jump.",
  pause_scene_type: "Pausa a lógica de movimento de Aventura ou Plataforma. Os eventos continuam executando.",
  resume_scene_type: "Retoma a lógica de movimento de Aventura ou Plataforma.",
  idle: "Aguarda a duração em quadros antes de continuar o evento.",
  run_audio_routine: "Reproduz uma música tracker importada ou composta no editor.",
  comment: "Registra uma anotação no fluxo."
};

export function normalizeEventSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function eventCommandParameterLabel(verb: string, tokenIndex: number, fallback: string): string {
  return parameterLabels[verb]?.[tokenIndex - 1] ?? (/^Argumento \d+$/.test(fallback) ? `Parâmetro ${tokenIndex}` : fallback);
}

export function eventCommandParameterChoices(verb: string, tokenIndex: number): string[] | null {
  if(verb==="set_adventure_state" && tokenIndex===1) return ["ground","dash","knockback","blank","run","push"];
  if(verb==="actor_effects" && tokenIndex===2) return ["flash","shake"];
  if((verb==="push_actor" && tokenIndex===2) || (verb==="open_equip_menu" && tokenIndex===2)) return ["true","false"];
  if(verb==="draw_text" && tokenIndex===3) return ["background","overlay"];
  if (verb === "start_game_clock" && tokenIndex === 3) return ["hud", "hidden"];
  if (verb === "luta_end_match" && tokenIndex === 1) return ["player1", "player2", "draw"];
  if (verb === "luta_set_ism_style" && tokenIndex === 2) return ["a-ism", "x-ism", "v-ism"];
  if (verb === "luta_trigger_super" && tokenIndex === 2) return ["super", "ultra"];
  if (verb === "luta_enable_alpha_counter" && tokenIndex === 2) return ["true", "false"];
  if (tokenIndex === 1 && ["pause_scene_type", "resume_scene_type"].includes(verb)) return ["topdown", "platformer"];
  if (tokenIndex === 1 && verb === "set_platform_state") return ["fall", "ground", "jump", "dash", "ladder", "wall", "knockback", "blank", "run", "float"];
  if (tokenIndex === 1 && ["attach_adventure_callback", "remove_adventure_callback"].includes(verb)) return ["on_interact", "on_room_enter", "on_room_exit"];
  return parameterLabels[verb]?.[tokenIndex - 1] === "Direção" ? ["up", "down", "left", "right"] : null;
}

export function eventCommandDescription(verb: string): string | null { return descriptions[verb] ?? null; }

export function eventCommandCategory(category: string): string {
  const aliases: Record<string, string> = {
    "audio": "Música e efeitos sonoros", "musica": "Música e efeitos sonoros",
    "musica e efeitos sonoros": "Música e efeitos sonoros",
    "dialogo e menu": "Diálogo e menus", "dialogo e menus": "Diálogo e menus", "dialogos e menus": "Diálogo e menus",
    "camera": "Câmera", "tela": "Tela", "cores": "Cores",
    "entrada de controle": "Entrada de controle", "controle": "Entrada de controle",
    "fluxo de controle": "Fluxo de controle", "variavel": "Variáveis", "variaveis": "Variáveis", "matematica": "Matemática",
    "temporizador": "Temporizador", "campos do motor": "Campos do motor",
    "movimento": "Ator", "ator": "Ator", "visual effects": "Efeitos visuais"
  };
  return aliases[normalizeEventSearch(category)] ?? (category || "Outros");
}
