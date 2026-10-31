# Eventos persistentes nas cenas da costa

As extensões opcionais do projeto exemplo são montadas por
`apps/desktop-electron/scripts/coast-depth-project.mjs`. A transformação é pura:
recebe o projeto e o manifesto dos novos sprites, preserva os cenários e produz
um projeto de revisão. A regeneração canônica exige aprovação visual dos assets.

## Relógio do jogo

`start_game_clock 1 60 hidden var_coast_minute` liga o relógio de software a uma
variável normal do save. O último argumento é opcional. A variável restaura os
minutos de 0 a 1439; os avanços do relógio e `advance_time` atualizam essa mesma
variável. Isso não depende de RTC no cartucho. A cena reaplica a rotina e seus
indicadores em `onRestore`.

O exemplo usa `var_coast_clock_ready` para distinguir uma execução isolada com
variáveis zeradas de um save válido em 00:00. A inicialização ocorre por eventos;
restaurar o minuto zero não reinicia o expediente.

## Preferência de volume

`fade_audio_volume music 70 45 var_audio_music_volume var_audio_master_volume` usa o volume da cena como
proporção da preferência salva, limitada a 0–100. Os dois argumentos finais são opcionais: preferência do canal e volume geral.
Quando presentes, as duas proporções se multiplicam; sem elas, o comando mantém seu comportamento absoluto. Zero permanece silencioso,
inclusive no início da transição. O teto da preferência também limita o volume
inicial de uma transição após carregar o save.

O motor reinicia as vozes durante uma troca de runtime, mas preserva volumes,
mutes e envelopes de mixagem quando existe um handoff. Uma inicialização fria
continua restaurando os valores padrão. Os consumidores de eventos usam o mesmo
teto em todas as famílias de runtime.

## Restauração de cena

Topdown, Platformer, Isometric e Dungeon aceitam `on_restore` no contrato
exportado. O exportador inclui novamente o atalho do menu após a restauração.
Dungeon mantém Start para seu mapa e usa R para o menu de pausa quando o mapa
está habilitado. Eventos de restauração são síncronos; não podem aguardar,
mostrar diálogos ou trocar de cena.

Os painéis da Usina usam atores com `dungeonWallMounted`, exposto como
“Fixado à parede” no inspector. O contrato nativo é `wall_mounted`. A parede
da própria célula não oculta o painel; uma parede entre a câmera e o painel
continua ocultando-o. A colisão do labirinto permanece independente do sprite.

## Atores de plataforma e exploração isométrica

Um NPC do grupo configurado em `platformActorCollisionGroup` pode mover uma
plataforma por eventos. O transporte aplica o mesmo deslocamento ao jogador
apoiado, respeitando paredes e teto. A posição, direção e visibilidade dos NPCs
entram no envelope de save da cena, junto com o estado físico do jogador.
Elementos sem evento de interação não interceptam um NPC interativo sobreposto.

Na exploração isométrica, `move_actor_relative` interpola o passo de um NPC.
Na Arena, qualquer aliado vivo pode ser selecionado antes de mover no turno;
depois de mover, a seleção fica na unidade ativa. Os turnos inimigos alternam
entre as unidades vivas. HP, turno, seleção e movimento usam a persistência
tática existente.

## Verificação

Os testes de regressão cobrem exportação, projeção, variável do relógio,
preferência de áudio, transporte físico e persistência. Os roteiros compartilhados
em `scripts/lib/coast-depth-playthrough.mjs` conduzem as seis frentes pelos
controles reais no Play e na ROM. Salvamentos são feitos pelos menus do jogo e
lidos depois de reiniciar o core; diagnósticos ELF apenas consultam o estado.
Capturas e logs de QA ficam fora do repositório.

O smoke de cadência do Mercado mede atualizações do jogo contra os quadros de
vídeo reais da ROM. A cópia de um mapa integral de 32 × 32 tiles usa um caminho
linear no backend de hardware, preservando o staging e a publicação no VBlank.
Mapas parciais continuam zerando as células não utilizadas. A regressão verifica
o conteúdo, as quatro camadas e as flags de publicação; a comparação de
framebuffers usa o mesmo número de atualizações do jogo para alinhar animações.
