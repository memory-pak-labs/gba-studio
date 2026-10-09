# Roadmap

## Estado Atual Do Engine Pack

Status: v2.25.0 com runtimes nativos exportaveis para top-down, plataforma, isometrico, point-and-click, shoot-em-up, visual novel, menu/UI, cutscene e world map. O runtime mixed agora expoe `RuntimeServices` e `RuntimeFrameContext` como contrato compartilhado de projeto, e o sistema de save aceita backends explicitos com geometria e callbacks injetaveis sem habilitar probe fisico automatico. Resource/VRAM Banking inclui streaming por grupo, upload por fila DMA de VBlank, cache com promocao para ativo, prune preventivo por idade/prioridade/pool, previews nao mutantes de range/banco/lote/grupo/cache, contagem de blocos livres por pool, prefetch por camera, janela de area/metatile e orçamento por frame para reservas/uploads ja usado pelos templates top-down/platformer/isometrico. O asset pack schema 11 adiciona resumo de producao, `production_profile` com limites por genero, gates de pressao e `ui_actions`, relatorios por asset/pool/room/template, recomendacoes de split, candidatos de compressao, fallback seguro para assets opcionais e falha clara para obrigatorios. `schemas/asset_pack_report.schema.json` torna esse relatorio um contrato publico validavel por `gbsdoctor --validate-public-schema auto`, e `gbsdoctor` agora publica readiness por pool de recurso exigindo esse contrato de perfil para a rodada beta. Point-and-click v5 inclui HUD nativo de cena/item selecionado. Visual Novel v5 inclui HUD nativo de cena/historico. Shoot-em-up v4 inclui `ShmupSaveData`, `shmup_project.save`, autosave no slot 0, persistencia de score/high score, vidas, wave, frame, cooldowns e variaveis, alem de HUD nativo de score/high score/vidas/wave. World Map v4 inclui `WorldMapNodeStatus` e HUD nativo de nome/status do no focado. Menu/UI v4 inclui `MenuSaveData`, `menu_project.save`, autosave no slot 0 e HUD nativo de tela/item/stack. Cutscene v4 inclui `CutsceneSaveData`, `cutscene_project.save`, autosave de cena/step/variaveis e HUD nativo de cena/step/frame.

## Marco 0: Fundacao

Status: implementado.

- Pacote do monorepo GBA Studio com fronteira logica e ciclo de versao proprio.
- Makefile, scripts de build/test/package e licença MIT.
- Runtime minimo sem Butano.
- ROM `.gba` gerada com devkitARM.

## Marco 1: Hardware Core

Status: implementado para v4 inicial com DMA VBlank queue, stats de pico/reset e debug/profile v2.

- Boot proprio, linker script e entrada `gbs_start`.
- Registradores de video, VBlank, input, palette, BG0 tiled e OAM.
- DMA publico imediato para copias 16/32-bit e fila fixa de VBlank com flush automatico em `wait_vblank`, incluindo stats de pico e reset de contadores sem descartar a fila.
- Timers publicos basicos com reload, frequencia, cascade e flag de IRQ.
- Callbacks configuraveis para VBlank e keypad via dispatcher leve da engine.
- Dispatcher de IRQ instalado em `0x03007FFC`, usando bits reais de `IE/IF/IME` para VBlank, timers e keypad.
- `wait_vblank` ainda preserva fallback de callback quando VBlank IRQ nao esta habilitada.
- `RuntimeServices` inicializa uma vez e recebe `RuntimeFrameContext` por frame, mantendo audio, recursos, save e diagnosticos como servicos do projeto mixed sem duplicar runtime por cena.
- Debug/Profile Core v2 adiciona asserts leves, budget de frame, counters nomeados e overlay visual opt-in para builds de validacao sem heap.
- Falta validar manualmente no mGBA/hardware real com callbacks assincronos mais agressivos e carga DMA intensa.

## Marco 2: Render 2D

Status: v16 com parallax, affine BG2/BG3 com tilemap 8bpp, modos bitmap 3/4/5, prioridades BG/OBJ, compressao RLE/LZ77/Huffman para tilemaps, Huffman/LZ77 opcional para tiles 4bpp/OBJ 8bpp e paletas, collision flags, blending, mosaic com enable por BG/OBJ, window0/window1, OBJ window e diagnostico publico de custo de render.

- BG0 tiled 4bpp, tilemap visivel e sprite 16x16.
- `assetc` v1 converte PNG 8-bit indexed/RGBA ate 16 cores para header de paleta, tiles 4bpp deduplicados e tilemap.
- API publica de assets com paleta, tiles, tilemap e metasprite.
- Carga de paletas/tiles/tilemap via DMA.
- Exemplo top-down usa `load_palette`, `load_tiles` e `set_metasprite`.
- Suporte inicial a BG0-BG3 com screenblocks separados e scroll por camada.
- Tilemaps text/tiled `32x32`, `64x32`, `32x64` e `64x64` com selecao automatica de tamanho.
- Metasprites propagam flip horizontal/vertical para OAM.
- `assetc` aceita `--destination-tile`, `--palette-bank` e `--object-tiles`.
- `assetc` gera spritesheets nos 12 formatos OBJ nativos do GBA entre 8x8 e 64x64, com um OBJ por frame e animacao simples.
- `assetc --rle-tilemap` gera `Rle16TileMapAsset` opcional ao lado do `TileMapAsset` normal.
- `assetc --bitmap-mode 3|4|5` gera `Bitmap16Asset`/`Bitmap8Asset` para modos graficos bitmap.
- `assetc --affine-tilemap` gera `AffineTileAsset`/`AffineTileMapAsset` 8bpp para mapas affine 16x16, 32x32, 64x64 ou 128x128.
- `assetc --pack-json` gera relatorio global de packing/overflow para tiles, paletas, OAM e PCM antes do build, com comparacao incremental opcional via `--previous-pack-report` e `export_plan` deterministico para headers/simbolos/argumentos do assetc.
- `assetc --collision-color-index` gera flags de colisao por tile e `gbs::TileMap` pronto para rooms top-down.
- `assetc --slope-color-indexes` gera `TileSlope` por tile para slopes diagonais no runtime top-down.
- Parallax runtime por background com fatores 8.8.
- Compressao inicial RLE 16-bit, LZ77 e Huffman estilo GBA para tilemaps, mais LZ77/Huffman opcional para tiles 4bpp/OBJ 8bpp via `assetc --lz77-tiles`/`assetc --huffman-tiles` e paletas via `assetc --lz77-palette`/`assetc --huffman-palette`, com decode sem heap antes da carga em VRAM/paleta.
- Controle de modo de video 0/1/2/3/4/5, matriz/ref point affine para BG2/BG3 e carga de mapas affine.
- Modos bitmap 3/4/5 com carga de bitmap 16-bit/8-bit e page flip basico.
- Blending alpha/brightness, mosaic global mais enable por BG/OBJ, window0/window1 e OBJ window basicos via API publica de render.
- Prioridades BG0-BG3 e OBJ por API publica.
- `RenderAssetCost` estima custo de paletas, tiles BG/OBJ, tiles affine, tilemaps text/affine, bitmaps e metasprites sem tocar VRAM, permitindo que templates/exportadores validem orcamento de projeto grande antes do load.
- Keyframes affine OBJ e amostragem temporal sem `float` agora estao disponiveis no contrato top-down; ainda falta validar cenas maiores e calibrar manualmente o carregador dinamico automatico de bancos por prioridade.
- Resource/VRAM Banking v24 reserva/libera ranges, bancos e grupos estaticos de tiles BG/OBJ, paletas e OAM, com deteccao de overflow, alinhamento, reserva por asset, batch transacional de assets, release transacional de batch, snapshots/rollback, alocacao automatica alinhada, preview de proximo range alinhado, preview de reserva de banco e preview transacional de lote e grupo de bancos sem mutar manager, hot-swap transacional de bancos/grupos, cache estatico por prioridade/recencia com eviction, prune preventivo por idade/prioridade/pool, preview nao mutante de entradas podaveis e contagem de blocos livres por pool, streaming de grupo com upload automatico por fontes nomeadas via fila DMA de VBlank, prefetch por distancia da camera com upload por fontes nomeadas, prefetch filtrado por janela de area/metatile, orçamento por chamada para reservas novas/uploads, templates top-down/platformer/isometrico usando orçamento progressivo por frame, promocao/hot-swap de grupo prefetched para ativo e templates usando esse caminho antes do streaming normal, bancos planejados vindos de `topdown_project.resource_banks`, `platformer_project.resource_banks`, `isometric_project.resource_banks` ou `resource_banks: "asset_pack"` derivado de `asset_pack_report.resource_bank_plan`, grupos materializados no `ProjectData`, fontes de upload geradas automaticamente pelo `assetc`, lookup por nome e vinculo opcional de room para streaming por room/grupo, alem de `ResourceStreamResult` com relatorio de uso/fragmentacao para streaming seguro.
- Asset pipeline agora tem pre-flight global de recursos, consumivel por Electron/GBA Studio via JSON, com budgets, uso por bancos, pressao por grupo, fingerprints, status incremental, motivo de mudanca, plano de exportacao, plano de bancos de recurso agrupado por room/grupo e validacao de ids unicos por asset para cache/import incremental.
- Falta integrar heuristicas de metatile/area diretamente no exportador final do GBA Studio e calibrar politicas padrao por genero/projeto.

## Marco 3: Top-down Runtime

Status: v0.95 com asset pipeline para slopes, slopes diagonais opcionais, budgets/fingerprints/status incremental/plano de rebuild/motivo de mudanca/validacao de ids unicos/uso por bancos/diagnosticos estruturados de asset pack, lookup estavel por nome para rooms/NPCs/scripts, dialogo paginado/choices rolaveis com script por opcao, hotspots, NPCs interativos, triggers, eventos condicionais, colisao direcional, colisao ator-ator com grupos/mascaras, pathfinding com blockers/fallback de alvo alcancavel, eventos por efeito de tile, fila de scripts com prioridade/cancelamento, runner progressivo de eventos no template top-down, camera bounds, actor runtime, consumo em lote de comandos de ator, room metadata, room streaming iniciado, movimento data-driven de NPC, reserva de assets por batch no template, UI/HUD v2, save/load multi-slot com metadata, tempo formatado e counters de debug no template.

- Player, colisao por tile, camera follow/fixed e portal.
- Contrato publico inicial em `gbs/project.hpp`.
- Exemplo top-down consome `gbastudio_project_data.hpp` com dados de room, assets, player, camera e portais.
- Bytecode v2 para dialogo, warp, variaveis, SFX real via PSG, add/clear de variavel e branches simples.
- Dialogo visual v2 em BG0, textos por indice, paginacao automatica e avanco por botao.
- Eventos ligados a entrada/saida de room, portal e interacao.
- Hotspots retangulares de interacao por room, com fallback para `on_interact`.
- NPCs/atores estaticos por room com metasprite, animacao opcional e script de interacao.
- Template top-down reserva tiles, paletas e OAM via `reserve_resource_batch` antes de carregar assets, usando arrays fixos sem heap.
- Eventos condicionais por variavel igual/diferente, flag setada, jump relativo e `show_dialogue_if`.
- Audio PSG v1 com SFX em square/noise channel e musica simples em loop por steps.
- Asset pipeline de audio PSG/PCM via `assetc --audio-json`, gerando `SfxAsset`, `MusicAsset` e `PcmAsset`.
- Importacao WAV PCM mono/stereo 8/16-bit para `PcmAsset` 8-bit assinado, com resample simples opcional.
- Audio v2 com Direct Sound PCM 8-bit assinado para SFX e musica simples em loop via FIFO A/DMA/timer.
- Audio v3 com mixer PCM multi-voz em software, ate 4 SFX simultaneos, prioridade/volume por SFX e musica PCM mixada.
- Audio v4 com streaming PCM por blocos, mantendo timer/FIFO ativos entre blocos sucessivos do mixer.
- Audio v5 com tracker PSG v1 por patterns/order table e `TrackerAsset` gerado por `assetc --audio-json`.
- Audio v6 com importacao MOD ProTracker 4 canais subset para `TrackerAsset`.
- Audio v7 com volumes de sample e efeitos MOD basicos `Cxx`/`Fxx` no conversor.
- Audio v8 com importacao S3M subset para `TrackerAsset`, incluindo notas, order table, volume column e comando `Axx` de speed.
- Audio v9 com importacao VGM SN76489 subset para `TrackerAsset`, incluindo writes PSG e waits basicos.
- Audio v10 com extracao de sample MOD para `PcmAsset` via `pcm[].mod_sample`.
- Audio v11 com extracao de sample S3M 8-bit mono nao comprimido para `PcmAsset` via `pcm[].s3m_sample`.
- Audio v12 com conversao de samples S3M 16-bit e stereo para `PcmAsset` 8-bit assinado, com downmix stereo para mono.
- Audio v13 com efeitos MOD `0xy` arpeggio, `1xx` slide up, `2xx` slide down e `Axy` volume slide convertidos para steps aproximados.
- Audio v14 com efeitos S3M `Dxy` volume slide, `Exx` slide down e `Fxx` slide up convertidos para steps aproximados.
- Audio v15 com VGM SN76489 convertendo mudancas de volume e noise channel para `TrackerAsset`.
- Audio v16 com VGM ignorando Game Gear stereo byte e data blocks auxiliares com validacao de tamanho.
- Audio v17 com `PcmAsset` aceitando loop points e `assetc` extraindo loops nativos de samples MOD/S3M.
- Audio v18 com finetune de sample MOD e volume de instrumento S3M aplicados no conversor de tracker.
- Audio v19 com BPM/tempo aproximado em MOD `Fxx > 32` e S3M `Txx`.
- Audio v20 com tone portamento aproximado em MOD `3xx` e S3M `Gxx`.
- Audio v21 com vibrato aproximado em MOD `4xy` e S3M `Hxy`.
- Audio v22 com tremolo aproximado em MOD `7xy` e S3M `Rxy`.
- Audio v23 com pattern jump/break basico em MOD `Bxx`/`Dxx` e S3M `Bxx`/`Cxx`.
- Audio v24 com `AudioMixCost` para estimar PSG, tracker, PCM, frames de mixer e vozes antes do playback, alem de smoke de custo no template top-down.
- Room streaming v1 com duas rooms, portais ida/volta, colisao e eventos por room.
- Room metadata v1 com modo/posicao de camera, player start, musica e backdrop por room.
- Room metadata v2 com bounds de camera em pixels derivados do contrato futuro do app.
- Triggers v1 com enter/leave, run-once, cooldown e tipos reservados standard/water/damage.
- Eventos v3 com `play_music`, `stop_music`, `close_dialogue`, `wait`, `set_camera_position`, `follow_camera` e `lock_camera`.
- Event Runner v3 executa bytecode progressivamente, pausa em `Wait`, suporta cancelamento e o template top-down usa fila fixa com prioridade simples para encadear scripts.
- Dados de actor/NPC preservam nome, direcao, grupo de colisao, velocidade/animacao normalizadas e scripts por slot.
- Helpers de lookup por nome resolvem rooms, NPCs e scripts nomeados para exportadores que precisam de IDs estaveis.
- Actor runtime v1 com visibilidade, ativo/inativo, posicao mutavel, direcao, velocidade, indice de animacao e comandos por evento.
- Actor runtime v2 aplica e limpa a fila de comandos de ator em lote via `consume_actor_event_commands`, facilitando templates gerados.
- NPC Movement v1 adiciona patrulha horizontal/vertical, wander em caixa, follow player e path-to-point com pathfinding BFS limitado a 64 nos fixos, sem heap.
- NPC Pathfinding v2 adiciona BFS com listas fixas de atores bloqueadores e fallback para mover ate o tile alcançavel mais proximo quando o alvo exato esta bloqueado.
- Actor Collision v2 adiciona overlap/rect helpers e movimento de player/NPC com listas fixas de atores bloqueadores filtradas por grupos/mascaras, cobrindo player-NPC e NPC-NPC no template top-down.
- Save System v3 adiciona bancos de slots fixos em SRAM 32 KB, lookup do save mais recente por sequence, clear por slot/banco, records com metadata de titulo/tempo/room e menu de save/load com labels informativas no template top-down.
- Save Metadata v2 adiciona formatacao publica de tempo de jogo (`MM:SS`/`H:MM:SS`) para labels de load/save sem heap.
- Save Payloads v3 adiciona `PlatformerSaveData` e `IsometricSaveData` para persistir runtime multi-genero com arrays fixos e sem heap, alem de `project.save` exportavel em top-down/platformer/isometrico para gerar `save_enabled` e `gbs::SaveBank`.
- Save Backend v1 adiciona `SaveBackend` configuravel para SRAM, Flash e EEPROM com capacidade, granularidade, leitura, escrita e erase injetaveis; suporte fisico de Flash/EEPROM continua explicitamente bloqueado ate existir protocolo validado em hardware.
- UI v1 adiciona HUD bar, menu simples com itens desabilitados/cancelamento/valor aceito e menu de pausa com save/load manual no template top-down.
- UI v2 adiciona helpers de paginacao, indicadores de pagina e salto de pagina por L/R para menus maiores sem heap.
- Debug/Profile v2 instrumenta o template top-down com asserts de reserva de recursos, counters de entidades/eventos, budget de frame simples e overlay visual por Select.
- `CallScript` v1 permite scripts reutilizaveis em `TopDownProjectData`.
- Choices v3 com prompt, janela de duas opcoes visiveis, rolagem por grupos maiores, escrita do resultado em variavel e script opcional por opcao.
- Collision v6 com solido, bloqueios direcionais, slopes diagonais geraveis pelo asset pipeline, consulta de efeitos de agua/dano/escada e scripts enter/leave por mascara de efeito.
- Falta IA mais rica de NPC, resolucao/push/camadas avancadas de colisao ator-ator, save com screenshots/nomes editaveis/tempo formatado, UI de save/load dedicada para platformer/isometrico/shmup, HUD/menus mais personalizaveis, playback sincronizado de samples MOD/S3M no tracker, samples S3M comprimidos, efeitos finos, chips YM/AY/DAC e reproducao real de data blocks VGM, projetos grandes com bancos dinamicos, layouts de choice mais sofisticados e integracao com dados exportados do GBA Studio.

## Marco 3.5: Platformer Runtime

Status: v1.5 com contrato data-driven publico.

- API publica `gbs/platformer.hpp`.
- `PlatformerProjectData` e `PlatformerRoomData` padronizam o que o exportador gera para paletas, tiles, rooms, player start, camera, config, hazards, checkpoints, camera zones, inimigos, plataformas moveis e scripts de sala/hazard/checkpoint/zona/enemy.
- `IsometricProjectData` e `IsometricRoomData` padronizam scripts de room e ator para start/update/interacao, alem de grid, camera, colisao e atores iniciais.
- Templates platformer/isometrico agora recarregam dados de room quando scripts executam `warp`, mantendo o fluxo multi-room validavel sem integrar o app.
- `PlatformerActor` com bounds em pixels, velocidade 8.8, facing, estado de chao/escada/teto/parede, coyote timer, jump buffer e helper publico para derivar estado de animacao.
- `PlatformerConfig` controla corrida, aceleracao, friccao, gravidade, queda maxima, velocidade de pulo, coyote time, jump buffer e escadas.
- Colisao por eixo com tiles solidos, bloqueios direcionais, plataformas one-way via `TileBlockTop` e escadas via `TileLadder`.
- Camera lateral com follow/clamp usando a infraestrutura comum de `Camera`.
- Hazards retangulares opcionais com dano e respawn em checkpoint.
- Checkpoints retangulares atualizam `PlatformerRuntimeState::respawn_position_pixels` sem heap.
- Camera zones retangulares podem aplicar bounds, offsets e lock X/Y por trecho.
- Exemplo/template `platformer_basic` compila ROM propria e projeto externo pelo Engine Pack consumindo `const gbs::PlatformerProjectData project`, incluindo inimigos e plataformas moveis com `tile_index/palette` por dado e evento por inimigo.
- Inimigos de plataforma podem usar patrulha por tiles para virar em paredes e bordas sem heap.
- Falta runtime de plataforma avancado com animacoes por estado mais integradas ao asset pipeline, eventos data-driven mais ricos por inimigo/plataforma e camera zones mais sofisticadas; slopes de chão 45 graus, contato stomp/dano em inimigos, patrulha por tiles e landing snap em plataformas moveis ja possuem suporte inicial em plataforma.

## Marco 3.6: Isometric Runtime

Status: v1.5 com contrato data-driven publico.

- API publica `gbs/isometric.hpp`.
- `IsometricProjectData` e `IsometricRoomData` padronizam o que o exportador gera para paletas, tiles, rooms, atores iniciais, grid, camera e colisao.
- Grid isometrico 2:1 com `IsoGridConfig` e `IsoCoord`.
- Conversao `iso_tile_to_screen` e picking aproximado `iso_screen_to_tile`.
- `IsoCamera` com follow/clamp em bounds de mundo.
- `IsoActor`, `IsoDrawItem`, build de draw list e `sort_iso_draw_list` estavel por depth/source.
- `draw_iso_sprites` envia itens ordenados para OAM usando a API publica de render.
- `IsoTileMap` com flags de colisao, bounds e bloqueio por tile.
- Picking por diamond mask com `iso_pick_tile`.
- Movimento de ator respeitando collision map e blockers.
- `find_iso_path_step_greedy` oferece primeiro passo simples em direcao ao alvo, sem heap.
- `find_iso_path_step_bfs` e `find_iso_path_step_astar` adicionam pathfinding limitado por orcamento para contornar bloqueios em projetos isometricos maiores.
- Exemplo/template `isometric_basic` compila ROM propria e projeto externo pelo Engine Pack consumindo `const gbs::IsometricProjectData project`.
- Falta elevacao/altura visual mais rica e tiles isometricos reais; eventos por ator/tile, selecao de cursor com ponto inicial por room e pathfinding BFS/A* limitado ja tem contrato data-driven inicial.

## Marco 3.7: Resource/VRAM Banking

Status: v1.16 com hot-swap transacional de bancos e grupos, cache estatico por prioridade/recencia, uploads por fila DMA de VBlank, fontes de upload nomeadas para bancos, base comum para templates maiores, multi-genero, bancos planejados nos exports top-down/plataforma/isometrico, `resource_bank_groups` materializados em `ProjectData`, `ResourceBankUploadSource[]` gerado pelo `assetc`, rooms ligadas a grupos de banco por nome e streaming automatico do grupo ativo nos templates.

- API publica expande `gbs/resource_manager.hpp` com `ResourcePoolKind`, `ResourceBank`, `ResourceBankGroup`, `ResourceBankReservation` e batch/grupo transacional de bancos.
- Bancos podem ser fixos por `start` ou automaticos usando `start = 0xFFFF` com alinhamento.
- Relatorios `ResourcePoolUsage`/`EngineResourceUsage` indicam capacidade, usado, restante e maior bloco livre para diagnostico de fragmentacao.
- `reserve_resource_banks` e `release_resource_banks` preservam rollback por snapshot, sem heap obrigatorio.
- `hot_swap_resource_banks` troca bancos ativos por proximos bancos com rollback completo se a nova reserva falhar.
- `reserve_resource_bank_group`, `release_resource_bank_group` e `hot_swap_resource_bank_group` usam a mesma base transacional preservando o nome do grupo ativo para streaming por room/area.
- `stream_resource_bank_group` cobre reserva inicial, no-op para grupo ja ativo e hot-swap com scratch buffer estatico e rollback completo.
- `TopDownProjectData`, `PlatformerProjectData` e `IsometricProjectData` expoem `resource_bank_groups`, permitindo que templates escolham um grupo planejado sem ler JSON em runtime.
- `TopDownRoomData`, `PlatformerRoomData` e `IsometricRoomData` aceitam `resource_bank_group_name`; helpers publicos resolvem o grupo da room por nome explicito ou fallback em `room.name`.
- `ResourceBankCache` permite reservar bancos sob demanda, evictando candidatos desbloqueados de menor prioridade e uso mais antigo quando falta espaco.
- `set_resource_bank_cache_locked` e `touch_resource_bank_cache_entry` permitem proteger recursos criticos e atualizar recencia de uso em streaming sem heap.
- `prefetch_resource_banks_for_camera` calcula prioridade por distancia da camera, reutiliza bancos ja carregados e respeita entradas travadas para prefetch seguro de salas/areas proximas.
- `prefetch_resource_banks_for_camera_with_uploads` tambem valida fontes nomeadas, confere capacidade da fila DMA antes de reservar e enfileira upload apenas para bancos novos.
- `resource_bank_upload_transfer`, `enqueue_resource_bank_upload_vblank` e `enqueue_resource_bank_uploads_vblank` ligam bancos reservados a uploads pequenos pela fila DMA de VBlank.
- `ResourceBankUploadSource` e `enqueue_resource_bank_upload_sources_vblank` permitem que o exportador gere fontes em qualquer ordem e o runtime combine por `ResourceBankReservation.name`.
- `assetc --export-project-json` materializa `resource_bank_upload_sources[]` a partir do `asset_pack`, ligando cada banco de tiles/paletas ao simbolo gerado do asset correspondente.
- Exports `topdown_project`, `platformer_project` e `isometric_project` podem declarar `resource_banks` manualmente ou usar `"asset_pack"`; os templates usam grupos de room quando `resource_bank_groups` existe, usam `reserve_resource_banks` quando so ha plano global e mantem fallback por `reserve_resource_batch`.
- `assetc --pack-json` emite `resource_bank_plan` e `resource_bank_groups[]`; `assetc --export-project-json` materializa grupos em C++ quando o projeto declara `resource_bank_groups` ou usa `resource_banks: "asset_pack"`.
- `assetc --export-project-json` aceita `resource_bank_group` ou `bank_group` em cada room, preparando o template para streaming automatico por room sem depender da ordem dos arrays.

## Marco 3.8: Asset Pipeline Production

Status: v1.4 com export de projeto materializado para app desktop.

- `assetc --pack-json` usa schema 8 com `export_plan`, `resource_bank_plan` e `resource_bank_groups`.
- `export_plan.headers[]` descreve `id`, `kind`, header, simbolo C++, inputs, recursos, alocacoes e `assetc_args`.
- `generate_count`, `skip_count`, `remove_count` e `removed_headers` permitem import incremental sem inferencias externas.
- `asset.header` e `asset.symbol` permitem nomes estaveis gerados pelo app; sem esses campos, o pipeline cria nomes C++ seguros.
- `assetc --export-project-json` copia template, gera headers do `asset_pack`, escreve `asset_pack_report.json` com `resource_bank_plan` e produz `gbastudio_project.json`.
- `make verify-package` valida um projeto gerado pelo `assetc` empacotado e compila a ROM fora do repo privado.
- `assetc --export-project-json` ja produz `gbastudio_project_data.hpp` minimo a partir de `topdown_project` com rooms, colisao, portais, metadata de room, NPCs, triggers, choice groups, backgrounds/parallax, bancos planejados de recurso manuais ou derivados de `asset_pack`, scripts simples de room/portal/interacao/NPC/trigger/escolha, player e camera.
- `assetc --export-project-json` agora tambem gera `platformer_project_data.hpp` a partir de `platformer_project`, incluindo rooms, colisao, player start, camera, config fisica, hazards, checkpoints e camera zones.
- `assetc --export-project-json` agora tambem gera `isometric_project_data.hpp` a partir de `isometric_project`, incluindo rooms, grid, camera, colisao e atores iniciais.
- Os geradores alto nivel aceitam `includes` e `assets` para conectar headers/simbolos compilados de paletas, tiles e audio top-down ao `ProjectData`.
- `assetc --export-project-json` tambem aceita referencias semanticas por ID do `asset_pack` em `assets.bg_palettes`, `assets.obj_palettes`, `assets.tile_assets`, `assets.sfx_assets`, `assets.music_assets`, `assets.pcm_assets`, `assets.tracker_assets`, `topdown_project.backgrounds[].tilemap`, `topdown_project.player.metasprite`, `topdown_project.player.animation`, `topdown_project.rooms[].npcs[].metasprite` e `topdown_project.rooms[].npcs[].animation`, gerando includes automaticamente para os headers correspondentes.
- O gerador alto nivel ja resolve referencias semanticas de assets, audio, player/NPC top-down, inimigos/plataformas moveis de plataforma e atores isometricos; platformer ja cobre scripts de inimigos e plataformas moveis; isometric ja cobre scripts de ator, interação de ator pelo cursor, tile e areas de tile; falta expandir referencias semanticas equivalentes nos outros generos.

## Marco 4: Engine Pack Fechado

Status: implementado como SDK multi-template v1.75.

- `include/`, `lib/libgbastudio_engine.a`, templates, `assetc`, `VERSION`, `LICENSE`.
- Versao semantica `2.24.0`, `CHANGELOG.md` e `enginepack.json`.
- Resource/VRAM Banking v14 adiciona promocao de grupos do `ResourceBankCache` para a reserva ativa e hot-swap a partir de grupo prefetched, evitando reserva/recopia redundante quando um exportador prepara assets proximos da camera.
- Resource/VRAM Banking v15 integra esse caminho aos templates top-down, platformer e isometrico: quando ha `ResourceBankUploadSource[]`, eles fazem prefetch periodico de grupos de outras rooms e tentam promover o grupo alvo antes do streaming/upload normal.
- Resource/VRAM Banking v16 adiciona `ResourceBankPrefetchWindow` para filtrar prefetch por janela de area/metatile antes de exigir reserva ou upload source.
- Resource/VRAM Banking v17 adiciona `ResourceBankPrefetchPolicy` para limitar reservas novas e uploads por chamada de prefetch, permitindo streaming progressivo por frame sem perder reuso de bancos ja carregados.
- Resource/VRAM Banking v18 aplica `ResourceBankPrefetchPolicy` nos templates top-down, platformer e isometrico, limitando prefetch periodico a dois bancos/uploads por chamada.
- Resource/VRAM Banking v19 adiciona `ResourceBankCachePrunePolicy` para liberar preventivamente bancos antigos/despriorizados sem tocar entradas travadas.
- Resource/VRAM Banking v20 adiciona `ResourceBankCachePrunePreview` para estimar entradas podaveis, travadas e unidades liberaveis sem mutar cache/VRAM.
- Resource/VRAM Banking v21 adiciona `resource_pool_free_block_count` e `ResourcePoolUsage::free_block_count` para diagnosticar fragmentacao por quantidade de blocos livres.
- Resource/VRAM Banking v22 adiciona `find_next_resource_range` para prever o proximo range alinhado que caberia sem mutar o pool.
- Resource/VRAM Banking v23 adiciona `preview_resource_bank_reservation` para prever bancos fixos/automaticos sem mutar o manager.
- Resource/VRAM Banking v24 adiciona `preview_resource_banks` para prever lotes transacionais de bancos sem mutar o manager real.
- Smoke unificado `make verify-package`.
- Projeto externo compila usando somente o pacote.
- Contrato de compatibilidade Electron/cross-platform registrado para macOS, Windows e Linux.
- CLI `gbsbuild` adicionada para apps desktop chamarem o build do Engine Pack por processo externo.
- CLI `gbsdoctor` e `enginepack.json` adicionados para diagnostico e descoberta do pacote.
- `gbsdoctor --json` reporta plataforma, ambiente, resumo do Engine Pack em `engine_manifest` e candidatos `.exe` para Electron em Windows/MSYS2.
- `gbsdoctor --json` reporta `diagnostics` com generos, templates SDK, asset banking, render cost, audio cost, toolchain e mensagens acionaveis para UI do app.
- `assetc --export-project-json` e `enginepack.json` agora reconhecem runtime profiles para apontar e clicar, shoot-em-up, visual novel, menu/UI, cutscene e mapa mundial, com runtimes nativos amadurecidos para point-click v4 com save/HUD de inventario, shoot-em-up v4 com save/high score/HUD, visual novel v4 com save/HUD de cena, menu/UI v4 com save/HUD de tela, cutscene v4 com save/HUD e world map v4 com save e HUD de status.
- `enginepack.json` declara `sdk.templates` para top-down, platformer e isometric, com genero, entrypoint, project data e features requeridas.
- `gbsdoctor --json` expoe `engine_manifest.sdk_templates`, permitindo descoberta de templates pelo app sem acessar codigo privado.
- Fixture `templates/exported_topdown` simula a saida futura do GBA Studio e compila fora do repo via `make verify-export-fixture`.
- `gbsdoctor` valida `gbastudio_project.json` quando presente, incluindo backend, entrypoint, project data e assets gerados.
- `gbsdoctor` tambem valida `requires.engine_pack` e `requires.features` contra `enginepack.json`, rejeitando exports que pedem capacidades ausentes.
- `gbsdoctor --validate-public-schema auto` valida artefatos publicos de projeto, export, asset pack, asset pack report, readiness/promocao e o proprio catalogo de schemas por uma interface unica para app nativo, Electron e CI, com deteccao por `backend`, `template_dir`, `assets[]` ou `kind` quando possivel. `gbsdoctor --list-public-schemas --json` publica o catalogo desses contratos para descoberta automatica, `--write-public-schema-catalog` grava o mesmo catalogo como artefato de release/CI, e `--verify-public-schema-catalog` compara esse artefato contra o Engine Pack atual, incluindo tamanho, SHA-256 e schemas ausentes.
- O projeto completo do GBA Studio e a regua principal de integracao: autoria, persistencia, export mixed, build de uma ROM e Play Window devem passar juntos antes da promocao do backend.
- `tools/production_smoke`, `tools/smoke_mgba`, `tools/verify_cross_platform` e `tools/stress_projects` sao ferramentas subsidiarias para isolar falhas, validar plataformas/hardware e produzir evidencias depois do gate completo.
- `docs/BUTANO_PARITY_MATRIX.md` mede maturidade observavel no projeto completo; paridade abstrata de APIs ou ROMs isoladas nao promovem o backend `gbastudio_engine`.
- Falta validar o pacote em Windows e Linux reais.

## Marco 4.1: Engine SDK Multi-template

Status: v1.0 implementado.

- Catalogo SDK no `enginepack.json` com templates `topdown_basic`, `platformer_basic` e `isometric_basic`.
- Cada template declara genero, entrypoint, project data, suporte a fixture exportado e features requeridas.
- `gbsdoctor --json` retorna `engine_manifest.sdk_templates` para consumo por Swift/Electron.
- O SDK independente compila templates externos para os tres generos pelo Engine Pack.
- Falta a integracao formal no GBA Studio para criar o backend `gbastudio_engine` ao lado do Butano.

## Marco 5: Pronto Para Integracao

Status: contrato e fixture preparados; integracao no app ainda planejada. Auditoria do app em 2026-06-02 registrada em `docs/GBA_STUDIO_APP_AUDIT.md`.

- O GBA Studio deve adicionar `gbastudio_engine` como backend paralelo.
- A integracao futura deve ser consumivel por Swift/macOS e por Electron via CLIs do Engine Pack.
- O backend Butano deve continuar funcional ate a engine própria atingir paridade suficiente.
- O exportador futuro deve gerar um projeto equivalente ao fixture `exported_topdown`: `main.cpp`, `gbastudio_project_data.hpp`, assets gerados e `gbastudio_project.json`.
- `RoomRuntimeSpec` deve ser a fonte intermediaria recomendada para gerar `gbastudio_project_data.hpp`.
- Antes de tocar no app, a engine ainda precisa implementar conversao real do `RoomRuntimeSpec`.
