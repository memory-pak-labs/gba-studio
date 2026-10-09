export const VERTICE_TITLE_SCENE = "titulo";
export const VERTICE_INITIAL_MENU_SCENE = "menu_inicial";
export const VERTICE_OPENING_SCENE = "abertura";
export const VERTICE_GAME_SCENE = "porto_lumen";
export const VERTICE_START_SCENE = VERTICE_TITLE_SCENE;
export const VERTICE_ENTRY_SCENE = "logo";

export const VERTICE_PROGRESS_KEYS = Object.freeze([
  "chapter",
  "farolParts.frame",
  "farolParts.energyCell",
  "usina.combatCleared",
  "vehicleModules.grip",
  "vehicleModules.stabilizer",
  "vehicleModules.shield",
  "vehicleModules.boost",
  "bond.guardian",
  "routeFlags.activeRoute",
  "routeFlags.warehouseInspected",
  "routeFlags.observatoryRead",
  "routeFlags.marketShortcut",
  "routeFlags.relayCleared",
  "campaignFinished"
]);

export const VERTICE_CAMPAIGN_SCENES = Object.freeze([
  Object.freeze({
    name: "titulo",
    runtime: "menu",
    title: "O Último Farol",
    objective: "Iniciar uma nova rota ou continuar a última viagem.",
    controls: "Direcional seleciona; A confirma; B retorna.",
    success: "Iniciar ou continuar a campanha.",
    failureRecovery: "Continuar sem save mantém o menu aberto e explica como começar.",
    nextScene: VERTICE_INITIAL_MENU_SCENE,
    transitionEvent: "titulo_abrir_menu",
    entry: Object.freeze({ x: 10, y: 13 }),
    exit: Object.freeze({ x: 13, y: 16, width: 4, height: 4 })
  }),
  Object.freeze({
    name: "prologo",
    runtime: "cutscene",
    title: "Prólogo · A rota apagada",
    objective: "Entender por que os faróis da costa deixaram de responder.",
    controls: "A avança a narrativa; B pula a cena após a confirmação.",
    success: "Aceitar a missão de reativar a rota aérea.",
    failureRecovery: "Cena narrativa sem condição de falha.",
    nextScene: "porto_lumen",
    transitionEvent: "prologo_partir",
    completionVariable: "chapter",
    completedValue: 2,
    entry: Object.freeze({ x: 21, y: 17 }),
    exit: Object.freeze({ x: 27, y: 14, width: 3, height: 5 })
  }),
  Object.freeze({
    name: "porto_lumen",
    runtime: "topdown",
    title: "Capítulo 1 · Porto de Lúmen",
    objective: "Encontrar a estrutura da aeronave e falar com a mecânica.",
    controls: "Direcional move Nara; A conversa e examina objetos.",
    success: "Recuperar a estrutura e abrir a rota das falésias.",
    failureRecovery: "A saída mostra o objetivo pendente sem remover o progresso.",
    nextScene: "mapa_rota",
    transitionEvent: "porto_abrir_mapa",
    completionVariable: "farolParts.frame",
    entry: Object.freeze({ x: 30, y: 21 }),
    exit: Object.freeze({ x: 22, y: 35, width: 3, height: 3 })
  }),
  Object.freeze({
    name: "mapa_rota",
    runtime: "worldMap",
    title: "Capítulo 1 · Rota dos Faróis",
    objective: "Escolher uma regiao liberada e viajar com a aeronave.",
    controls: "Direcional seleciona o destino; A inicia o voo; B cancela ou retorna ao Porto; Start pausa.",
    success: "Selecionar os Penedos do Vento.",
    failureRecovery: "Destinos bloqueados explicam qual peça ou vínculo falta.",
    nextScene: "penedos_vento",
    transitionEvent: "mapa_viajar_penedos",
    completionVariable: "routeFlags.activeRoute",
    entry: Object.freeze({ x: 20, y: 15 }),
    exit: Object.freeze({ x: 18, y: 24, width: 4, height: 6 })
  }),
  Object.freeze({
    name: "penedos_vento",
    runtime: "platformer",
    title: "Capítulo 2 · Penedos do Vento",
    objective: "Alcançar o módulo de aderência no alto das falésias.",
    controls: "Direcional move; A pula e interage; B usa o impulso curto.",
    success: "Coletar o módulo de aderência e alcançar o Armazém das Marés.",
    failureRecovery: "Checkpoints retomam a travessia sem apagar a campanha.",
    nextScene: "armazem_das_mares",
    transitionEvent: "penedos_retornar_armazem",
    completionVariable: "vehicleModules.grip",
    entry: Object.freeze({ x: 4, y: 10 }),
    exit: Object.freeze({ x: 76, y: 9, width: 3, height: 8 })
  }),
  Object.freeze({
    name: "armazem_das_mares",
    runtime: "pointAndClick",
    title: "Capítulo 2 · Armazém das Marés",
    objective: "Examinar a carta, o baú e a saída que leva ao observatório.",
    controls: "Direcional move o cursor; A examina o hotspot; B cancela.",
    success: "Reconhecer a rota que liga o armazém ao observatório.",
    failureRecovery: "Os hotspots permanecem disponíveis depois de cada diálogo.",
    nextScene: "observatorio_do_farol",
    transitionEvent: "armazem_das_mares_saida",
    completionVariable: "routeFlags.warehouseInspected",
    completedValue: 1,
    entry: Object.freeze({ x: 7, y: 8 }),
    exit: Object.freeze({ x: 13, y: 17, width: 4, height: 3 })
  }),
  Object.freeze({
    name: "observatorio_do_farol",
    runtime: "pointAndClick",
    title: "Capítulo 2 · Observatório do Farol",
    objective: "Examinar o telescópio, o mapa da maré e a saída do observatório.",
    controls: "Direcional move o cursor; A examina o hotspot; B cancela.",
    success: "Confirmar a leitura do farol antes de seguir para o Mercado Suspenso.",
    failureRecovery: "Os hotspots permanecem disponíveis depois de cada diálogo.",
    nextScene: "mercado_suspenso",
    transitionEvent: "observatorio_do_farol_saida",
    completionVariable: "routeFlags.observatoryRead",
    completedValue: 1,
    entry: Object.freeze({ x: 16, y: 13 }),
    exit: Object.freeze({ x: 13, y: 17, width: 4, height: 3 })
  }),
  Object.freeze({
    name: "mercado_suspenso",
    runtime: "isometric",
    title: "Capítulo 3 · Mercado Suspenso",
    objective: "Registrar a entrega no posto da ponte e liberar o acesso à usina.",
    controls: "Direcional move Nara; A interage; B alterna o alvo próximo.",
    success: "Registro confirmado e guarda fora da passagem.",
    failureRecovery: "O guarda orienta como registrar a carga.",
    nextScene: "usina_submersa",
    transitionEvent: "mercado_abrir_usina",
    completionVariable: "routeFlags.marketShortcut",
    entry: Object.freeze({ x: 19, y: 18 }),
    exit: Object.freeze({ x: 19, y: 6, width: 1, height: 1 })
  }),
  Object.freeze({
    name: "usina_submersa",
    runtime: "dungeonCrawler",
    title: "Capítulo 4 · Usina Submersa · Exploração",
    objective: "Atravessar o corredor inundado e localizar a porta do núcleo.",
    controls: "Esquerda e direita giram; cima avança; baixo recua; A interage.",
    success: "Encontrar a passagem para o confronto da usina.",
    failureRecovery: "Portas fechadas indicam o núcleo que ainda precisa ser ativado.",
    nextScene: "usina_combate",
    transitionEvent: "usina_abrir_combate",
    entry: Object.freeze({ x: 15, y: 15 }),
    exit: Object.freeze({ x: 14, y: 3, width: 3, height: 3 })
  }),
  Object.freeze({
    name: "usina_combate",
    runtime: "dungeonCrawler",
    title: "Capítulo 4 · Usina Submersa · Combate",
    objective: "Vencer a sentinela que bloqueia o núcleo inundado.",
    controls: "Esquerda e direita giram; cima avança; A ataca ou interage.",
    success: "Liberar a saída para o compartimento de energia.",
    failureRecovery: "A sentinela retorna ao corredor e o combate pode ser reiniciado.",
    nextScene: "usina_saida",
    transitionEvent: "usina_vencer_combate",
    entry: Object.freeze({ x: 15, y: 15 }),
    exit: Object.freeze({ x: 14, y: 3, width: 3, height: 3 })
  }),
  Object.freeze({
    name: "usina_saida",
    runtime: "dungeonCrawler",
    title: "Capítulo 4 · Usina Submersa · Saída",
    objective: "Recuperar a célula de energia e alcançar a antecâmara da guardiã.",
    controls: "Esquerda e direita giram; cima avança; A interage.",
    success: "Energizar a aeronave e seguir para o conselho da guardiã.",
    failureRecovery: "A porta permanece fechada até a célula ser coletada.",
    nextScene: "conselho_guardia",
    transitionEvent: "usina_encontrar_guardia",
    completionVariable: "farolParts.energyCell",
    entry: Object.freeze({ x: 15, y: 15 }),
    exit: Object.freeze({ x: 14, y: 3, width: 3, height: 3 })
  }),
  Object.freeze({
    name: "conselho_guardia",
    runtime: "visualNovel",
    title: "Capítulo 4 · Conselho da Guardiã",
    objective: "Convencer a guardiã a revelar a passagem pela tempestade.",
    controls: "A avança o texto; direcional escolhe respostas.",
    success: "Firmar a aliança e revelar a rota da tempestade.",
    failureRecovery: "A escolha pode ser revista antes da confirmação final.",
    nextScene: "tempestade",
    transitionEvent: "conselho_confirmar_alianca",
    completionVariable: "bond.guardian",
    entry: Object.freeze({ x: 7, y: 15 }),
    exit: Object.freeze({ x: 25, y: 7, width: 4, height: 7 })
  }),
  Object.freeze({
    name: "tempestade",
    runtime: "shmup",
    title: "Capítulo 5 · Voo na Tempestade",
    objective: "Cruzar as nuvens hostis e proteger a célula de energia.",
    controls: "Direcional pilota; A dispara; B ativa o freio aéreo.",
    success: "Atravessar a frente de nuvens e ganhar o módulo de escudo.",
    failureRecovery: "A tentativa reinicia na entrada da tempestade com o save preservado.",
    nextScene: "guardiao_rele",
    transitionEvent: "tempestade_alcancar_rele",
    completionVariable: "vehicleModules.shield",
    entry: Object.freeze({ x: 8, y: 10 }),
    exit: Object.freeze({ x: 88, y: 7, width: 2, height: 6 })
  }),
  Object.freeze({
    name: "guardiao_rele",
    runtime: "battleRpg",
    title: "Capítulo 5 · Guardião do Relé",
    objective: "Vencer o autômato que mantém o último farol sob bloqueio.",
    controls: "Direcional escolhe comandos; A confirma; B retorna.",
    success: "Reativar o relé e recrutar o companheiro de bordo.",
    failureRecovery: "Derrota oferece orientação e reinicia o encontro.",
    nextScene: "arena_arrancada",
    transitionEvent: "guardiao_vitoria",
    completionVariable: "routeFlags.relayCleared",
    entry: Object.freeze({ x: 7, y: 14 }),
    exit: Object.freeze({ x: 13, y: 17, width: 4, height: 3 })
  }),
  Object.freeze({
    name: "arena_arrancada",
    runtime: "luta",
    title: "Capítulo 6 · Arena de Arrancada",
    objective: "Superar o rival na prova que libera o propulsor final.",
    controls: "Direcional move e defende; A e B atacam; gatilhos ativam técnicas.",
    success: "Vencer duas rodadas e instalar o propulsor.",
    failureRecovery: "A revanche recomeça a luta sem reiniciar a rota.",
    nextScene: "circuito_final",
    transitionEvent: "arena_vencer_rival",
    completionVariable: "vehicleModules.boost",
    entry: Object.freeze({ x: 9, y: 15 }),
    exit: Object.freeze({ x: 25, y: 7, width: 4, height: 7 })
  }),
  Object.freeze({
    name: "circuito_final",
    runtime: "racing",
    title: "Final · Circuito dos Faróis",
    objective: "Acender a rota vencendo a corrida entre os faróis da costa.",
    controls: "Cima ou A acelera; baixo ou B freia; esquerda e direita conduzem.",
    success: "Cruzar a chegada, reativar a rota e concluir a campanha.",
    failureRecovery: "A corrida reinicia no último checkpoint com módulos e save preservados.",
    nextScene: "titulo",
    transitionEvent: "circuito_concluir",
    completionVariable: "campaignFinished",
    entry: Object.freeze({ x: 32, y: 30 }),
    exit: Object.freeze({ x: 30, y: 30, width: 5, height: 4 })
  })
]);

export const VERTICE_SUPPORT_SCENES = Object.freeze([
  Object.freeze({
    name: "logo",
    runtime: "cutscene",
    role: "logo",
    title: "GBA Studio",
    objective: "Apresentar a identidade do projeto antes da abertura.",
    controls: "A ou Start avança; B pula a apresentação.",
    success: "Avançar para a abertura.",
    failureRecovery: "A apresentação pode ser pulada sem alterar o progresso.",
    nextScene: "abertura",
    transitionEvent: "logo_ao_entrar",
    entry: Object.freeze({ x: 0, y: 0 }),
    exit: Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  }),
  Object.freeze({
    name: VERTICE_OPENING_SCENE,
    runtime: "cutscene",
    role: "opening",
    title: "Abertura · Circuito dos Faróis",
    objective: "Apresentar o mundo, a rota e o tom da campanha.",
    controls: "A ou Start avança; B pula a abertura.",
    success: "Chegar ao Menu Título.",
    failureRecovery: "A abertura pode ser pulada sem alterar o progresso.",
    nextScene: VERTICE_START_SCENE,
    transitionEvent: "abertura_ao_entrar",
    entry: Object.freeze({ x: 0, y: 0 }),
    exit: Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  }),
  Object.freeze({
    name: VERTICE_INITIAL_MENU_SCENE,
    runtime: "menu",
    role: "initial",
    title: "Menu Inicial",
    objective: "Escolher entre iniciar, carregar e configurar a campanha.",
    controls: "Direcional seleciona; A confirma; B retorna.",
    success: "Iniciar ou carregar a campanha.",
    failureRecovery: "Sem save, Carregar jogo explica como começar uma nova rota.",
    nextScene: "prologo",
    transitionEvent: "menu_inicial_ao_entrar",
    entry: Object.freeze({ x: 0, y: 0 }),
    exit: Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  }),
  Object.freeze({
    name: "escolha_genero",
    runtime: "menu",
    role: "gender_select",
    title: "Escolha de gênero",
    objective: "Escolher a apresentação do personagem antes de definir seu nome.",
    controls: "Direcional seleciona; A confirma; B retorna.",
    success: "Confirmar o gênero e avançar para o nome do jogador.",
    failureRecovery: "Voltar retorna ao Menu Inicial sem apagar a campanha anterior.",
    nextScene: "nome_jogador",
    transitionEvent: "escolha_genero_ao_entrar",
    entry: Object.freeze({ x: 0, y: 0 }),
    exit: Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  }),
  Object.freeze({
    name: "nome_jogador",
    runtime: "menu",
    role: "name_input",
    title: "Nome do jogador",
    objective: "Digitar e confirmar o nome que será salvo na campanha.",
    controls: "Direcional edita; A confirma; B retorna.",
    success: "Salvar o nome e iniciar o prólogo.",
    failureRecovery: "Voltar retorna à escolha de gênero sem apagar o nome anterior.",
    nextScene: "prologo",
    transitionEvent: "nome_jogador_ao_entrar",
    entry: Object.freeze({ x: 0, y: 0 }),
    exit: Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  }),
  Object.freeze({
    name: "carregar_jogo",
    runtime: "menu",
    role: "load_game",
    title: "Carregar Jogo",
    objective: "Escolher um ponto de retorno salvo para a campanha.",
    controls: "Direcional seleciona; A confirma; B retorna.",
    success: "Restaurar o save selecionado.",
    failureRecovery: "Slots sem save permanecem indisponíveis e não alteram a campanha.",
    nextScene: "",
    transitionEvent: "carregar_jogo_ao_entrar",
    entry: Object.freeze({ x: 0, y: 0 }),
    exit: Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  }),
  Object.freeze({
    name: "configuracoes",
    runtime: "menu",
    role: "settings",
    title: "Configurações",
    objective: "Ajustar idioma, áudio, controles e relógio RTC em uma única tela reutilizável.",
    controls: "Direcional seleciona; esquerda/direita ajusta; A confirma; B retorna.",
    success: "Aplicar a preferência escolhida.",
    failureRecovery: "As preferências anteriores permanecem ativas ao retornar.",
    nextScene: "",
    transitionEvent: "configuracoes_ao_entrar",
    entry: Object.freeze({ x: 0, y: 0 }),
    exit: Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  }),
  Object.freeze({
    name: "creditos",
    runtime: "menu",
    role: "credits",
    title: "Créditos",
    objective: "Informar autoria, ferramentas e contribuições do projeto.",
    controls: "A confirma; B retorna.",
    success: "Retornar ao menu que abriu os créditos.",
    failureRecovery: "A tela é informativa e não altera o progresso.",
    nextScene: "",
    transitionEvent: "creditos_ao_entrar",
    entry: Object.freeze({ x: 0, y: 0 }),
    exit: Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  }),
  Object.freeze({
    name: "missoes",
    runtime: "menu",
    role: "mission_board",
    title: "Missões",
    objective: "Consultar objetivos ativos, concluídos e próximos passos.",
    controls: "Direcional seleciona; A confirma; B retorna.",
    success: "Retornar à partida preservando o estado da campanha.",
    failureRecovery: "Missões bloqueadas explicam o requisito pendente.",
    nextScene: "",
    transitionEvent: "missoes_ao_entrar",
    entry: Object.freeze({ x: 0, y: 0 }),
    exit: Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  }),
  Object.freeze({
    name: "inventario",
    runtime: "menu",
    role: "inventory",
    title: "Inventário",
    objective: "Consultar itens, módulos e recursos coletados.",
    controls: "Direcional seleciona; A examina; B retorna.",
    success: "Retornar à partida sem alterar itens.",
    failureRecovery: "Itens indisponíveis aparecem como não equipáveis.",
    nextScene: "",
    transitionEvent: "inventario_ao_entrar",
    entry: Object.freeze({ x: 0, y: 0 }),
    exit: Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  }),
  Object.freeze({
    name: "mapa_menu",
    runtime: "menu",
    role: "map",
    title: "Mapa",
    objective: "Consultar a rota atual e os destinos liberados.",
    controls: "Direcional seleciona um destino; A examina; B retorna.",
    success: "Retornar à partida sem viajar por engano.",
    failureRecovery: "Destinos bloqueados exibem o requisito correspondente.",
    nextScene: "",
    transitionEvent: "mapa_menu_ao_entrar",
    entry: Object.freeze({ x: 0, y: 0 }),
    exit: Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  }),
  Object.freeze({
    name: "salvar",
    runtime: "menu",
    role: "save",
    title: "Salvar",
    objective: "Criar um ponto de retorno manual da campanha.",
    controls: "Direcional seleciona; A salva; B retorna.",
    success: "Confirmar o save no slot selecionado.",
    failureRecovery: "Falhas de gravação mantêm a partida atual aberta.",
    nextScene: "",
    transitionEvent: "salvar_ao_entrar",
    entry: Object.freeze({ x: 0, y: 0 }),
    exit: Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  }),
  Object.freeze({
    name: "menu_start",
    runtime: "menu",
    role: "start",
    title: "Menu Start",
    objective: "Consultar a rota, salvar o progresso e retornar à partida.",
    controls: "Direcional seleciona; A confirma; B retorna ao jogo.",
    success: "Retomar a partida sem perder a cena atual.",
    failureRecovery: "A opção Voltar fecha o menu e preserva o estado da partida.",
    nextScene: "",
    transitionEvent: "menu_start_ao_entrar",
    entry: Object.freeze({ x: 0, y: 0 }),
    exit: Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  }),
  Object.freeze({
    name: "arena_tatica",
    runtime: "isometric",
    role: "tactical",
    title: "Arena Tática",
    objective: "Demonstrar grade, turnos, alcance, ataque e ocupação.",
    controls: "Direcional move o cursor; A seleciona, move ou ataca; B cancela; Select encerra o turno.",
    success: "Derrotar a sentinela da arena.",
    failureRecovery: "A arena reinicia o estado tático ao ser reaberta.",
    nextScene: "",
    transitionEvent: "arena_tatica_ao_entrar",
    entry: Object.freeze({ x: 0, y: 0 }),
    exit: Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  }),
  Object.freeze({
    name: "farol_interior",
    runtime: "topdown",
    role: "topdown_interior",
    title: "Interior do Farol",
    objective: "Examinar a lente e falar com o guardião antes de retornar ao cais.",
    controls: "Direcional move Nara; A conversa e examina a lente; B retorna.",
    success: "Entender o estado da lente e voltar para Porto de Lúmen.",
    failureRecovery: "A sala permanece aberta e o retorno pelo portal inferior continua disponível.",
    nextScene: "porto_lumen",
    transitionEvent: "farol_interior_ao_entrar",
    entry: Object.freeze({ x: 22, y: 24 }),
    exit: Object.freeze({ x: 20, y: 26, width: 5, height: 4 })
  }),
]);

export const VERTICE_SCENE_PACKAGES = Object.freeze({
  titulo: Object.freeze({
    assetRoles: Object.freeze(["initial-menu-bg", "title-logo", "title-start-prompt"]),
    interactionRoles: Object.freeze(["menu-navigation", "title-audio"])
  }),
  prologo: Object.freeze({
    assetRoles: Object.freeze(["prologue-port", "prologue-storm", "nara-cutscene", "rival-cutscene", "airship-cutscene"]),
    interactionRoles: Object.freeze(["narrative-advance", "prologue-audio"])
  }),
  porto_lumen: Object.freeze({
    assetRoles: Object.freeze(["port-tiles", "nara-topdown", "mechanic"]),
    interactionRoles: Object.freeze(["dialogue", "shop", "footsteps", "hub-audio"])
  }),
  mapa_rota: Object.freeze({
    assetRoles: Object.freeze(["route-map", "route-islands", "route-marker", "route-airship"]),
    interactionRoles: Object.freeze(["route-selection", "route-lock-feedback", "route-audio", "affine-transform", "affine-runtime"])
  }),
  penedos_vento: Object.freeze({
    assetRoles: Object.freeze(["platformer-full-scene", "cliff-tiles", "platformer-surfaces"]),
    interactionRoles: Object.freeze(["checkpoint", "collectible", "wind-audio"])
  }),
  armazem_das_mares: Object.freeze({
    assetRoles: Object.freeze(["point-click-background", "point-click-cursor", "point-click-actor"]),
    interactionRoles: Object.freeze(["chart-hotspot", "chest-hotspot", "exit-hotspot", "point-click-dialogue"])
  }),
  observatorio_do_farol: Object.freeze({
    assetRoles: Object.freeze(["point-click-background", "point-click-cursor", "point-click-actor"]),
    interactionRoles: Object.freeze(["telescope-hotspot", "chart-hotspot", "exit-hotspot", "point-click-dialogue"])
  }),
  mercado_suspenso: Object.freeze({
    assetRoles: Object.freeze(["market-isometric-tiles"]),
    interactionRoles: Object.freeze(["bridge-route", "shortcut-feedback", "market-audio"])
  }),
  usina_submersa: Object.freeze({
    assetRoles: Object.freeze(["usina-dungeon-bg", "usina-machinery", "dungeon-depth-actor", "energy-cell"]),
    interactionRoles: Object.freeze(["door-key", "energy-feedback", "plant-audio"])
  }),
  usina_combate: Object.freeze({
    assetRoles: Object.freeze(["usina-dungeon-bg", "dungeon-depth-actor"]),
    interactionRoles: Object.freeze(["battle-entry", "combat-feedback", "plant-audio"])
  }),
  usina_saida: Object.freeze({
    assetRoles: Object.freeze(["usina-dungeon-bg", "energy-cell"]),
    interactionRoles: Object.freeze(["energy-feedback", "door-key", "plant-audio"])
  }),
  conselho_guardia: Object.freeze({
    assetRoles: Object.freeze(["council-bg", "nara-portrait", "guardian-portrait", "dialogue-ui"]),
    interactionRoles: Object.freeze(["narrative-choice", "bond-feedback", "council-audio"])
  }),
  tempestade: Object.freeze({
    assetRoles: Object.freeze(["shmup-background-regular", "player-flight", "flight-enemy", "shmup-boss", "projectile", "storm-effect"]),
    interactionRoles: Object.freeze(["shield-feedback", "storm-audio"])
  }),
  guardiao_rele: Object.freeze({
    assetRoles: Object.freeze(["relay-arena", "nara-battle", "relay-guardian"]),
    interactionRoles: Object.freeze(["turn-feedback", "victory-feedback", "battle-audio"])
  }),
  arena_arrancada: Object.freeze({
    assetRoles: Object.freeze(["arena-bg", "fighter-player", "fighter-rival", "fight-ui"]),
    interactionRoles: Object.freeze(["round-feedback", "arena-audio"])
  }),
  circuito_final: Object.freeze({
    assetRoles: Object.freeze(["racing-topdown-track", "racing-player", "racing-rival"]),
    interactionRoles: Object.freeze(["technical-map", "racing-hud", "racing-audio"])
  }),
  farol_interior: Object.freeze({
    assetRoles: Object.freeze(["lighthouse-interior-topdown", "lighthouse-keeper", "topdown-player"]),
    interactionRoles: Object.freeze(["lighthouse-door", "lighthouse-lens", "lighthouse-dialogue", "lighthouse-audio", "shared-emotes"])
  })
});
