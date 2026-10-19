# O Último Farol: guia de autoria

Biblioteca: 55 prefabs de atores e 19 de gatilhos. Abra **Editor > Pré-fabricados** para consultar a cena de origem e instanciar um modelo.

As imagens, animações, músicas e configurações nativas aprovadas são preservadas. Os cinco NPCs de Porto Lumen que estavam sem conversa agora têm eventos de orientação. Variáveis de campanha e destinos de portas são compartilhados de propósito; revise-os ao reutilizar o modelo em outro contexto.

## Como estudar e reutilizar

1. Selecione a cena e abra Eventos. A nota de autoria explica a configuração nativa e os fluxos customizados.
2. Selecione um ator ou gatilho para ver Ao iniciar, Ao atualizar, Ao interagir ou os estados disponíveis para esse runtime.
3. Na biblioteca de pré-fabricados, escolha o modelo pela cena de origem e instancie na cena ativa. A posição e a cena de destino pertencem à instância.
4. Scripts que endereçam o ator original são copiados para a nova instância e seus alvos são retargetados. Os scripts e variáveis de campanha compartilhados continuam compartilhados.
5. As quatro patrulhas de Penedos têm limites, variáveis e colisões específicos do mapa. Suas cadeias estão montadas na cena; não são anunciadas como inimigos genéricos. Adapte essas ligações ao copiar a lógica.

Um Ao iniciar vazio pode ser intencional: menus e cutscenes já executam as ações nativas da timeline. Não adicione um noop ou uma espera apenas para preencher o painel.

## logo · cutscene

Em Eventos > Ao iniciar, abra os quadros da sequência: fundo, poses, movimento, duração e avanço. O evento inicial pode ficar vazio; os quadros já executam a encenação nativa.

Sequência nativa: 56 quadros.

| Evento | Passos |
| --- | --- |
| logo_ao_entrar | 0 |
| logo_concluir | 1 |

## abertura · cutscene

Em Eventos > Ao iniciar, abra os quadros da sequência: fundo, poses, movimento, duração e avanço. O evento inicial pode ficar vazio; os quadros já executam a encenação nativa.

Sequência nativa: 18 quadros.

| Evento | Passos |
| --- | --- |
| abertura_concluir | 1 |
| abertura_ao_entrar | 0 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Nara e mecânica · Expressões e gesto | example-actor-opening-approved-local-animation-actor | Apresentação ou controle nativo |

## titulo · menu

Objetivo: Iniciar uma nova rota ou continuar a última viagem. Em Eventos, selecione uma opção da tela para editar sua ação e o script ligado. Abrir tela, voltar, seleção e ajustes de valores são ações nativas; não precisam de comandos duplicados em Ao iniciar. Controles: Start abre as opções; esquerda/direita seleciona; A confirma; B retorna.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| titulo_ao_entrar | 1 |
| titulo_abrir_menu | 2 |
| titulo_novo_jogo | 18 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| TITLE LOGO · O Último Farol | example-actor-title-logo-v2 | Apresentação ou controle nativo |
| PRESS START | example-actor-title-press-start | onInteract: titulo_abrir_menu |
| NOVO JOGO | example-actor-title-carousel-new-game | Apresentação ou controle nativo |
| CARREGAR JOGO | Lógica específica da cena | Apresentação ou controle nativo |
| IDIOMA | Lógica específica da cena | Apresentação ou controle nativo |
| CONFIGURAÇÕES | Lógica específica da cena | Apresentação ou controle nativo |
| CRÉDITOS | Lógica específica da cena | Apresentação ou controle nativo |

## prologo · cutscene

Objetivo: Entender por que os faróis da costa deixaram de responder. Em Eventos > Ao iniciar, abra os quadros da sequência: fundo, poses, movimento, duração e avanço. O evento inicial pode ficar vazio; os quadros já executam a encenação nativa. Controles: A avança a narrativa; B pula a cena após a confirmação.

Sequência nativa: 4 quadros.

| Evento | Passos |
| --- | --- |
| prologo_ao_entrar | 2 |
| prologo_partir | 2 |

## porto_lumen · topdown

Objetivo: Encontrar a estrutura da aeronave e falar com a mecânica. O runtime move o player e segue a câmera. Selecione um NPC ou gatilho e abra Eventos para estudar a conversa, coleta ou troca de cena. Controles: Direcional move Nara; A conversa e examina objetos.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| aplicar_perfil_jogador | 2 |
| aplicar_perfil_jogador_base | 2 |
| porto_ao_entrar | 8 |
| porto_recuperar_estrutura | 3 |
| porto_abrir_mapa | 5 |
| porto_entrar_farol | 2 |
| porto_conversar_captain | 1 |
| porto_conversar_traveler | 1 |
| porto_conversar_cartographer | 1 |
| porto_conversar_fisherchild | 1 |
| porto_conversar_lighthousekeeper | 1 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Nara | example-actor-port-nara | Apresentação ou controle nativo |
| Mecânica de Lúmen | example-actor-port-mechanic | onInteract: porto_recuperar_estrutura |
| Capitão · Porto de Lúmen | example-actor-porto-lume-captain-pilot | onInteract: porto_conversar_captain |
| Viajante · Porto de Lúmen | example-actor-porto-lume-traveler-pilot | onInteract: porto_conversar_traveler |
| Cartógrafo · Porto de Lúmen | example-actor-porto-lume-cartographer-pilot | onInteract: porto_conversar_cartographer |
| Pescador mirim · Porto de Lúmen | example-actor-porto-lume-fisherchild-pilot | onInteract: porto_conversar_fisherchild |
| Guardião do farol | example-actor-porto-lume-lighthousekeeper-pilot | onInteract: porto_conversar_lighthousekeeper |
| Saída para a rota dos faróis | example-trigger-trigger-porto-exit | onEnter: porto_abrir_mapa |
| Entrada do farol | example-trigger-trigger-porto-lighthouse | onInteract: porto_entrar_farol; onEnter: porto_entrar_farol |

## mapa_rota · worldMap

Objetivo: Escolher uma regiao liberada e viajar com a aeronave. Destinos e disponibilidade ficam na configuração do mapa e nas ações Viajar da timeline. Os eventos ligados aos destinos executam as transições da campanha. Controles: Direcional: destino. A: viajar. B: Porto. Start: pausa.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| mapa_ao_entrar | 1 |
| mapa_viajar_porto | 2 |
| mapa_viajar_penedos | 2 |
| mapa_viajar_armazem | 2 |
| mapa_viajar_observatorio | 2 |
| mapa_viajar_mercado | 2 |
| mapa_viajar_usina | 2 |
| mapa_viajar_conselho | 2 |
| mapa_viajar_circuito | 2 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Dirigível Lumen | example-actor-map-cursor | Apresentação ou controle nativo |

## penedos_vento · platformer

Objetivo: Alcançar o módulo de aderência no alto das falésias. O runtime aplica movimento, salto e colisões. Os scripts dos atores montam patrulhas, conversa e checkpoint. As patrulhas usam limites e variáveis específicos deste mapa; copie-as pela timeline e ajuste esses parâmetros. Controles: Direcional move; A pula e interage; B usa o impulso curto.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| penedos_player_jump | 1 |
| penedos_player_ground | 1 |
| penedos_player_dash | 1 |
| penedos_ao_entrar | 9 |
| penedos_teste_queda | 11 |
| penedos_teste_contato_inimigo | 13 |
| penedos_crab_iniciar | 7 |
| penedos_crab_patrulhar | 21 |
| penedos_moth_iniciar | 7 |
| penedos_moth_patrulhar | 21 |
| penedos_crab-east_iniciar | 7 |
| penedos_crab-east_patrulhar | 21 |
| penedos_moth-east_iniciar | 7 |
| penedos_moth-east_patrulhar | 21 |
| penedos_player_attack | 85 |
| penedos_teste_npc_iniciar | 3 |
| penedos_teste_npc_interagir | 4 |
| penedos_teste_checkpoint_iniciar | 7 |
| penedos_teste_checkpoint_interagir | 8 |
| penedos_recolher_aderencia | 4 |
| penedos_retornar_armazem | 4 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Nara · Penedos | example-actor-penedos-player | Apresentação ou controle nativo |
| Trabalhador · Penedos | example-actor-penedos-npc | onInit: penedos_teste_npc_iniciar; onInteract: penedos_teste_npc_interagir |
| Caranguejo · Penedos | Lógica específica da cena | onInit: penedos_crab_iniciar; onUpdate: penedos_crab_patrulhar |
| Mariposa · Penedos | Lógica específica da cena | onInit: penedos_moth_iniciar; onUpdate: penedos_moth_patrulhar |
| Farol · Penedos | example-actor-penedos-checkpoint | onInit: penedos_teste_checkpoint_iniciar; onInteract: penedos_teste_checkpoint_interagir |
| Caranguejo · Ponte do Vento | Lógica específica da cena | onInit: penedos_crab-east_iniciar; onUpdate: penedos_crab-east_patrulhar |
| Mariposa · Ponte do Vento | Lógica específica da cena | onInit: penedos_moth-east_iniciar; onUpdate: penedos_moth-east_patrulhar |
| Módulo de aderência · saída | example-trigger-trigger-penedos-grip-module | onEnter: penedos_recolher_aderencia |
| Queda no vão 1 | example-trigger-trigger-penedos-fall-1 | onEnter: penedos_teste_queda |
| Queda no vão 2 | example-trigger-trigger-penedos-fall-2 | onEnter: penedos_teste_queda |
| Queda no vão 3 | example-trigger-trigger-penedos-fall-3 | onEnter: penedos_teste_queda |

## armazem_das_mares · pointAndClick

Objetivo: Examinar a carta, o baú e a saída que leva ao observatório. O player é o cursor. Cada gatilho é um hotspot: selecione-o e abra Ao interagir para editar exame, coleta ou saída. A imagem frontal não é uma grade de colisões top-down. Controles: Direcional move o cursor; A examina o hotspot; B cancela.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| armazem_das_mares_ao_entrar | 2 |
| armazem_das_mares_carta | 1 |
| armazem_das_mares_bau | 1 |
| armazem_das_mares_saida | 1 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Cursor do Armazém | example-actor-armazem-das-mares-cursor | Apresentação ou controle nativo |
| Carta Náutica | example-trigger-armazem-das-mares-carta-trigger | onInteract: armazem_das_mares_carta; onEnter: armazem_das_mares_carta |
| Baú Vermelho | example-trigger-armazem-das-mares-bau-trigger | onInteract: armazem_das_mares_bau; onEnter: armazem_das_mares_bau |
| Saída do Armazém | example-trigger-armazem-das-mares-saida-trigger | onInteract: armazem_das_mares_saida; onEnter: armazem_das_mares_saida |

## observatorio_do_farol · pointAndClick

Objetivo: Examinar o telescópio, o mapa da maré e a saída do observatório. O player é o cursor. Cada gatilho é um hotspot: selecione-o e abra Ao interagir para editar exame, coleta ou saída. A imagem frontal não é uma grade de colisões top-down. Controles: Direcional move o cursor; A examina o hotspot; B cancela.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| observatorio_do_farol_ao_entrar | 2 |
| observatorio_do_farol_telescopio | 1 |
| observatorio_do_farol_mapa | 1 |
| observatorio_do_farol_saida | 1 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Cursor do Observatório | example-actor-observatorio-do-farol-cursor | Apresentação ou controle nativo |
| Telescópio | example-trigger-observatorio-do-farol-telescopio-trigger | onInteract: observatorio_do_farol_telescopio; onEnter: observatorio_do_farol_telescopio |
| Mesa da Maré | example-trigger-observatorio-do-farol-mapa-trigger | onInteract: observatorio_do_farol_mapa; onEnter: observatorio_do_farol_mapa |
| Saída do Observatório | example-trigger-observatorio-do-farol-saida-trigger | onInteract: observatorio_do_farol_saida; onEnter: observatorio_do_farol_saida |

## mercado_suspenso · isometric

Objetivo: Registrar a entrega no posto da ponte e liberar o acesso à usina. Movimento, projeção e alturas são nativos. A configuração distingue aventura e arena tática; as interações e saídas ficam nos eventos da cena, atores e gatilhos. Controles: Direcional move em oito direções; A interage; B seleciona os alvos próximos. Combine duas setas para seguir as bordas dos losangos nas escadas.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| mercado_falar_mercador | 2 |
| mercado_abrir_usina | 5 |
| mercado_ao_entrar | 9 |
| mercado_abrir_atalho | 9 |
| mercado_falar_guarda | 2 |
| mercado_entrar_arena | 1 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Aventureiro · Mercado | example-actor-market-nara | Apresentação ou controle nativo |
| Mercador suspenso | example-actor-market-trader-v2 | onInteract: mercado_falar_mercador |
| Guarda do mercado | example-actor-market-guard-v1 | onInteract: mercado_falar_guarda |
| Registro de carga | example-trigger-trigger-market-bridge | onInteract: mercado_abrir_atalho |
| Saída para a Usina Submersa | example-trigger-trigger-market-exit | onInteract: mercado_abrir_usina |

## usina_submersa · dungeonCrawler

Objetivo: Atravessar o corredor inundado e localizar a porta do núcleo. Mapa edita células; Tela ampliada mostra a câmera frontal. Movimento, projeção e combate são nativos. Atores usam escalas por distância; eventos executam interação, coleta e passagem entre salas. Controles: Esquerda e direita giram; cima avança; baixo recua; A interage.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| usina_ao_entrar | 6 |
| usina_abrir_combate | 5 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Porta da sentinela | example-trigger-trigger-usina-combat-door | onEnter: usina_abrir_combate |

## usina_combate · dungeonCrawler

Objetivo: Vencer a sentinela que bloqueia o núcleo inundado. Mapa edita células; Tela ampliada mostra a câmera frontal. Movimento, projeção e combate são nativos. Atores usam escalas por distância; eventos executam interação, coleta e passagem entre salas. Controles: Esquerda e direita giram; cima avança; A ataca ou interage.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| usina_combate_ao_entrar | 6 |
| usina_sentinela | 1 |
| usina_vencer_combate | 8 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Sentinela da Usina | example-actor-usina-sentinel-v2 | onInteract: usina_sentinela |
| Saída do combate | example-trigger-trigger-usina-combat-exit | onEnter: usina_vencer_combate |

## usina_saida · dungeonCrawler

Objetivo: Recuperar a célula de energia e alcançar a antecâmara da guardiã. Mapa edita células; Tela ampliada mostra a câmera frontal. Movimento, projeção e combate são nativos. Atores usam escalas por distância; eventos executam interação, coleta e passagem entre salas. Controles: Esquerda e direita giram; cima avança; A interage.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| usina_saida_ao_entrar | 6 |
| usina_coletar_celula | 10 |
| usina_encontrar_guardia | 6 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Célula de energia | example-actor-usina-energy-cell-v2 | onInteract: usina_coletar_celula |
| Antecâmara da Guardiã | example-trigger-trigger-usina-exit | onEnter: usina_encontrar_guardia |

## conselho_guardia · visualNovel

Objetivo: Convencer a guardiã a revelar a passagem pela tempestade. O diálogo e suas escolhas conduzem esta cena. Edite a fala no workspace Diálogos e os eventos ligados à entrada e à continuação. Controles: A avança o texto; direcional escolhe respostas.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| conselho_ao_entrar | 2 |
| conselho_confirmar_alianca | 3 |

## tempestade · shmup

Objetivo: Cruzar as nuvens hostis e proteger a célula de energia. Ondas, inimigos, tiros e rolagem são configurados nos recursos da cena e dos atores. Ao concluir e Ao perder ligam o resultado à campanha. Controles: Direcional pilota; A dispara; B ativa o freio aéreo.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| tempestade_ao_entrar | 1 |
| tempestade_drone_disparar | 3 |
| tempestade_concluir | 5 |
| tempestade_alcancar_rele | 4 |
| tempestade_farol_entrar | 2 |
| tempestade_disparar | 1 |
| tempestade_dano | 1 |
| tempestade_destruir | 1 |
| tempestade_reiniciar | 2 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Aeronave de Nara | example-actor-tempestade-approved-actor-player | onInteract: tempestade_disparar; onHit1: tempestade_dano |
| Drone de patrulha | example-actor-tempestade-approved-actor-drone-a | onInteract: tempestade_dano; onHit1: tempestade_destruir |
| Drone de carga | example-actor-tempestade-approved-actor-drone-b | onInteract: tempestade_dano; onHit1: tempestade_destruir |
| Farol da Tempestade | example-actor-tempestade-approved-actor-boss | onInit: tempestade_farol_entrar; onInteract: tempestade_dano; onHit1: tempestade_destruir |

## guardiao_rele · battleRpg

Objetivo: Vencer o autômato que mantém o último farol sob bloqueio. O runtime executa turnos, habilidades e animações. Edite atributos nos atores; Ao vencer e Ao perder ligam recompensa, save, avanço ou reinício à campanha. Controles: Direcional escolhe comandos; A confirma; B retorna.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| guardiao_ao_entrar | 1 |
| guardiao_vitoria | 3 |
| guardiao_derrota | 1 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Nara · Mecânica | example-actor-nara-guardian | Apresentação ou controle nativo |
| Guardião do Relé | example-actor-relay-guardian | Apresentação ou controle nativo |
| Efeitos do Relé | example-actor-relay-approved-effects-actor | Apresentação ou controle nativo |

## arena_arrancada · luta

Objetivo: Superar o rival na prova que libera o propulsor final. O runtime executa caminhada, salto, golpes, gauges e rodadas. Os atores definem lutadores e animações; Ao vencer e Ao perder conduzem a campanha. Controles: Direcional move e defende; A e B atacam; gatilhos ativam técnicas.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| arena_ao_entrar | 1 |
| arena_vencer_rival | 3 |
| arena_derrota | 2 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Nara · Arena | example-actor-nara-fighter | Apresentação ou controle nativo |
| Rival · Arena | example-actor-rival-fighter | Apresentação ou controle nativo |

## circuito_final · racing

Objetivo: Acender a rota vencendo a corrida entre os faróis da costa. A configuração seleciona visão top-down ou pseudo-3D, pista, voltas e rivais. O runtime pilota e calcula a prova; os eventos de vitória e derrota concluem ou reiniciam a cena. Controles: Cima ou A acelera; baixo ou B freia; esquerda e direita conduzem.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| circuito_concluir | 7 |
| circuito_final_ao_entrar | 9 |
| circuito_final_alternar | 1 |
| circuito_final_reiniciar | 3 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Player · Nara | example-actor-racing-approved-overhead-nara | Apresentação ou controle nativo |
| Rival · Coral | example-actor-racing-approved-overhead-rival | Apresentação ou controle nativo |
| Rival · Ilha | example-actor-racing-approved-overhead-rival-2 | Apresentação ou controle nativo |

## escolha_genero · menu

Em Eventos, selecione uma opção da tela para editar sua ação e o script ligado. Abrir tela, voltar, seleção e ajustes de valores são ações nativas; não precisam de comandos duplicados em Ao iniciar.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| escolha_genero_ao_entrar | 0 |
| escolha_genero_homem | 2 |
| escolha_genero_mulher | 2 |
| escolha_genero_confirmar | 1 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| gender-portrait-male-gba | example-actor-gender-portrait-male-gba | Apresentação ou controle nativo |
| gender-portrait-female-gba | Lógica específica da cena | Apresentação ou controle nativo |
| Moldura de seleção | example-actor-gender-gold-frame-male-gba | Apresentação ou controle nativo |
| Canto de seleção 2 | Lógica específica da cena | Apresentação ou controle nativo |
| Canto de seleção 3 | Lógica específica da cena | Apresentação ou controle nativo |
| Canto de seleção 4 | Lógica específica da cena | Apresentação ou controle nativo |
| Homem · rótulo | example-actor-traveler-entry-label-male | Apresentação ou controle nativo |
| Mulher · rótulo | Lógica específica da cena | Apresentação ou controle nativo |

## nome_jogador · menu

Em Eventos, selecione uma opção da tela para editar sua ação e o script ligado. Abrir tela, voltar, seleção e ajustes de valores são ações nativas; não precisam de comandos duplicados em Ao iniciar.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| nome_jogador_ao_entrar | 1 |
| nome_jogador_nome | 1 |
| nome_jogador_confirmar | 2 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| name-portrait-male-gba | example-actor-name-portrait-male-gba | Apresentação ou controle nativo |
| name-portrait-female-gba | Lógica específica da cena | Apresentação ou controle nativo |

## carregar_jogo · menu

Em Eventos, selecione uma opção da tela para editar sua ação e o script ligado. Abrir tela, voltar, seleção e ajustes de valores são ações nativas; não precisam de comandos duplicados em Ao iniciar.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| carregar_jogo_ao_entrar | 0 |
| carregar_jogo_slot_1 | 3 |
| carregar_jogo_slot_2 | 3 |
| carregar_jogo_slot_3 | 3 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Selection load-slot-1 | example-actor-book-entry-carregar-jogo-selection-load-slot-1 | Apresentação ou controle nativo |
| Selection load-slot-2 | Lógica específica da cena | Apresentação ou controle nativo |
| Selection load-slot-3 | Lógica específica da cena | Apresentação ou controle nativo |
| Selection back | Lógica específica da cena | Apresentação ou controle nativo |

## configuracoes · menu

Em Eventos, selecione uma opção da tela para editar sua ação e o script ligado. Abrir tela, voltar, seleção e ajustes de valores são ações nativas; não precisam de comandos duplicados em Ao iniciar.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| configuracoes_ao_entrar | 12 |
| configuracoes_rtc | 2 |
| ingame-controls | 1 |
| configuracoes_idioma | 9 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Selection audio-master | example-actor-book-menu-configuracoes-selection-audio-master | Apresentação ou controle nativo |
| Page audio-master | Lógica específica da cena | Apresentação ou controle nativo |
| Selection audio-music | Lógica específica da cena | Apresentação ou controle nativo |
| Page audio-music | Lógica específica da cena | Apresentação ou controle nativo |
| Selection audio-sfx | Lógica específica da cena | Apresentação ou controle nativo |
| Page audio-sfx | Lógica específica da cena | Apresentação ou controle nativo |
| Selection audio-enabled | Lógica específica da cena | Apresentação ou controle nativo |
| Page audio-enabled | Lógica específica da cena | Apresentação ou controle nativo |
| Selection language | Lógica específica da cena | Apresentação ou controle nativo |
| Page language | Lógica específica da cena | Apresentação ou controle nativo |
| Selection controls | Lógica específica da cena | Apresentação ou controle nativo |
| Page controls | Lógica específica da cena | Apresentação ou controle nativo |
| Selection rtc | Lógica específica da cena | Apresentação ou controle nativo |
| Page rtc | Lógica específica da cena | Apresentação ou controle nativo |
| Selection back | Lógica específica da cena | Apresentação ou controle nativo |
| Page back | Lógica específica da cena | Apresentação ou controle nativo |

## creditos · menu

Em Eventos, selecione uma opção da tela para editar sua ação e o script ligado. Abrir tela, voltar, seleção e ajustes de valores são ações nativas; não precisam de comandos duplicados em Ao iniciar.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| creditos_ao_entrar | 0 |
| creditos_detalhar_projeto | 1 |
| creditos_detalhar_engine | 1 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Selection credits-project | example-actor-book-entry-creditos-selection-credits-project | Apresentação ou controle nativo |
| Selection credits-engine | Lógica específica da cena | Apresentação ou controle nativo |

## missoes · menu

Em Eventos, selecione uma opção da tela para editar sua ação e o script ligado. Abrir tela, voltar, seleção e ajustes de valores são ações nativas; não precisam de comandos duplicados em Ao iniciar.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| missoes_ao_entrar | 0 |
| missoes_detalhar_proximo | 49 |
| ingame-mission-frame | 1 |
| ingame-mission-cell | 1 |
| ingame-mission-bond | 1 |
| ingame-mission-final | 1 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Selection next | example-actor-book-menu-missoes-selection-next | Apresentação ou controle nativo |
| Page next | Lógica específica da cena | Apresentação ou controle nativo |
| Selection frame | Lógica específica da cena | Apresentação ou controle nativo |
| Page frame | Lógica específica da cena | Apresentação ou controle nativo |
| Selection cell | Lógica específica da cena | Apresentação ou controle nativo |
| Page cell | Lógica específica da cena | Apresentação ou controle nativo |
| Selection bond | Lógica específica da cena | Apresentação ou controle nativo |
| Page bond | Lógica específica da cena | Apresentação ou controle nativo |
| Selection final | Lógica específica da cena | Apresentação ou controle nativo |
| Page final | Lógica específica da cena | Apresentação ou controle nativo |
| Selection back | Lógica específica da cena | Apresentação ou controle nativo |
| Page back | Lógica específica da cena | Apresentação ou controle nativo |

## inventario · menu

Em Eventos, selecione uma opção da tela para editar sua ação e o script ligado. Abrir tela, voltar, seleção e ajustes de valores são ações nativas; não precisam de comandos duplicados em Ao iniciar.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| inventario_ao_entrar | 0 |
| ingame-item-frame | 1 |
| ingame-item-grip | 1 |
| ingame-item-cell | 1 |
| ingame-item-shield | 1 |
| ingame-item-boost | 1 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Selection frame | example-actor-book-menu-inventario-selection-frame | Apresentação ou controle nativo |
| Selection grip | Lógica específica da cena | Apresentação ou controle nativo |
| Selection cell | Lógica específica da cena | Apresentação ou controle nativo |
| Selection shield | Lógica específica da cena | Apresentação ou controle nativo |
| Selection boost | Lógica específica da cena | Apresentação ou controle nativo |
| Selection back | Lógica específica da cena | Apresentação ou controle nativo |
| Item frame | example-actor-book-menu-inventario-item-frame | Apresentação ou controle nativo |
| Item grip | Lógica específica da cena | Apresentação ou controle nativo |
| Item cell | Lógica específica da cena | Apresentação ou controle nativo |
| Item shield | Lógica específica da cena | Apresentação ou controle nativo |
| Item boost | Lógica específica da cena | Apresentação ou controle nativo |
| Compact commands | Lógica específica da cena | Apresentação ou controle nativo |

## mapa_menu · menu

Em Eventos, selecione uma opção da tela para editar sua ação e o script ligado. Abrir tela, voltar, seleção e ajustes de valores são ações nativas; não precisam de comandos duplicados em Ao iniciar.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| mapa_menu_ao_entrar | 0 |
| ingame-map-porto | 1 |
| ingame-map-penedos | 1 |
| ingame-map-armazem | 1 |
| ingame-map-observatorio | 1 |
| ingame-map-mercado | 1 |
| ingame-map-usina | 1 |
| ingame-map-conselho | 1 |
| ingame-map-circuito | 1 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Selection porto | example-actor-book-menu-mapa-menu-selection-porto | Apresentação ou controle nativo |
| Selection penedos | Lógica específica da cena | Apresentação ou controle nativo |
| Selection armazem | Lógica específica da cena | Apresentação ou controle nativo |
| Selection observatorio | Lógica específica da cena | Apresentação ou controle nativo |
| Selection mercado | Lógica específica da cena | Apresentação ou controle nativo |
| Selection usina | Lógica específica da cena | Apresentação ou controle nativo |
| Selection conselho | Lógica específica da cena | Apresentação ou controle nativo |
| Selection circuito | Lógica específica da cena | Apresentação ou controle nativo |
| Selection back | Lógica específica da cena | Apresentação ou controle nativo |

## salvar · menu

Em Eventos, selecione uma opção da tela para editar sua ação e o script ligado. Abrir tela, voltar, seleção e ajustes de valores são ações nativas; não precisam de comandos duplicados em Ao iniciar.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| salvar_ao_entrar | 0 |
| menu_salvar_slot_1 | 1 |
| menu_salvar_slot_2 | 1 |
| menu_salvar_slot_3 | 1 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Selection slot-1 | example-actor-book-menu-salvar-selection-slot-1 | Apresentação ou controle nativo |
| Selection slot-2 | Lógica específica da cena | Apresentação ou controle nativo |
| Selection slot-3 | Lógica específica da cena | Apresentação ou controle nativo |
| Selection back | Lógica específica da cena | Apresentação ou controle nativo |

## menu_start · menu

Em Eventos, selecione uma opção da tela para editar sua ação e o script ligado. Abrir tela, voltar, seleção e ajustes de valores são ações nativas; não precisam de comandos duplicados em Ao iniciar.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| menu_start_ao_entrar | 0 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Nara | example-actor-book-menu-menu-start-nara | Apresentação ou controle nativo |
| Player female variant | Lógica específica da cena | Apresentação ou controle nativo |
| Selection missions | example-actor-book-menu-menu-start-selection-missions | Apresentação ou controle nativo |
| Selection inventory | Lógica específica da cena | Apresentação ou controle nativo |
| Selection map | Lógica específica da cena | Apresentação ou controle nativo |
| Selection save | Lógica específica da cena | Apresentação ou controle nativo |
| Selection settings | Lógica específica da cena | Apresentação ou controle nativo |
| Selection back | Lógica específica da cena | Apresentação ou controle nativo |

## arena_tatica · isometric

Movimento, projeção e alturas são nativos. A configuração distingue aventura e arena tática; as interações e saídas ficam nos eventos da cena, atores e gatilhos.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| arena_tatica_ao_entrar | 3 |
| arena_tatica_sair | 2 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Nara · Arena Tática | example-actor-tactical-nara | Apresentação ou controle nativo |
| Sentinela · Arena Tática | example-actor-tactical-sentinel | Apresentação ou controle nativo |

## farol_interior · topdown

O runtime move o player e segue a câmera. Selecione um NPC ou gatilho e abra Eventos para estudar a conversa, coleta ou troca de cena.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| farol_interior_ao_entrar | 5 |
| farol_falar_guardiao | 1 |
| farol_examinar_lente | 2 |
| farol_sair_porto | 2 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Nara · Farol | example-actor-farol-nara | Apresentação ou controle nativo |
| Guardião do farol | example-actor-farol-keeper | onInteract: farol_falar_guardiao |
| Lente do farol | example-trigger-trigger-lighthouse-lens | onInteract: farol_examinar_lente; onEnter: farol_examinar_lente |
| Saída para Porto de Lúmen | example-trigger-trigger-lighthouse-exit | onEnter: farol_sair_porto |

## circuito_perspectiva · racing

A configuração seleciona visão top-down ou pseudo-3D, pista, voltas e rivais. O runtime pilota e calcula a prova; os eventos de vitória e derrota concluem ou reiniciam a cena.

Sequência nativa: 0 quadros.

| Evento | Passos |
| --- | --- |
| circuito_perspectiva_ao_entrar | 9 |
| circuito_perspectiva_alternar | 1 |
| circuito_perspectiva_reiniciar | 3 |
| circuito_perspectiva_concluir | 3 |

| Entidade | Pré-fabricado | Eventos ligados |
| --- | --- | --- |
| Player · Nara | example-actor-racing-approved-rear-nara | Apresentação ou controle nativo |
| Rival · Coral | example-actor-racing-approved-rear-rival | Apresentação ou controle nativo |
| Rival · Ilha | example-actor-racing-approved-rear-rival-2 | Apresentação ou controle nativo |
