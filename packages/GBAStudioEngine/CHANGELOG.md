# Changelog

## 2.25.0

- O core passa a inicializar audio junto com hardware/render e a executar `audio_update()` uma vez por `wait_vblank()`, garantindo progressao de PSG, tracker, fades e streaming PCM em todos os runtimes exportados.
- O top-down e o dispatcher mixed removem inicializacao/atualizacao manual duplicada de audio; o teste host valida a ordem `audio -> VBlank -> DMA` e o contrato de export confirma que a coordenacao pertence ao core.
- `FrameContext` centraliza um unico snapshot de input por frame, expoe callback de atualizacao e mede trabalho de CPU/espera de VBlank com Timer2+Timer3 em cascata, incluindo frames perdidos e politica explicita de frame skip adaptativo.
- A propriedade dos timers fica explicita: Timer0 e do jogo, Timer1 do audio e Timer2+Timer3 da telemetria, evitando conflitos silenciosos entre PCM, scripts e medicao de frame.
- O renderer adiciona affine OBJ, HDMA de HBlank para scroll por scanline, ciclo/blend dinamico de paleta e atualizacao parcial correta dos modos bitmap 3/4/5; writes de Mode 4 preservam o acesso halfword exigido pela VRAM do GBA.
- `ResourceBankLease` e `ResourceBankGroupLease` oferecem ciclo de reserva/liberacao automatico, idempotente, sem heap e com buffers fornecidos pelo chamador.
- A matriz de stress sobe de seis para onze ROMs, adicionando SHMUP, point-and-click, dungeon crawler, corrida e contencao combinada de audio/IRQ/HDMA/VRAM/OAM.

## 2.24.0

- Corrige cortes horizontais em sprites grandes ao montar OAM em shadow RAM e publicar os 128 registros por DMA somente durante VBlank.
- `assetc` aceita frames logicos de sprite alinhados entre 8x8 e 128x128 e os decompoe no menor conjunto de OBJ nativos, preservando tiles contiguos por parte e dimensoes reais no `MetaSpritePart`.
- O export de projeto aplica as alocacoes reais de `obj_tiles`, `bg_tiles` e paletas nos argumentos e headers gerados, eliminando colisoes de tile/paleta entre assets do mesmo pack.
- `assetc --pack-json` sobe o `GBAStudioAssetPackReport` para schema 11 com `production_summary`, `production_profile`, `asset_reports`, `pool_reports`, `room_pressure_report`, `template_pressure_report`, `split_recommendations` e `compression_candidates`.
- `production_profile` publica limites por genero/template, gates de pressao por room/template/grupo, `ui_actions`, politica `parallel_until_manual_promotion` e gates manuais obrigatorios antes de promover a engine como backend principal.
- `schemas/asset_pack_report.schema.json` passa a documentar o relatorio publico do `assetc --pack-json`; `gbsdoctor --validate-public-schema auto` agora detecta e valida `GBAStudioAssetPackReport`, e o catalogo publico sobe para 10 schemas.
- Overflows agora carregam motivo acionavel, maior bloco livre, quantidade de blocos livres, grupo, room, template e modo de alocacao; assets opcionais continuam recebendo fallback seguro por omissao e assets obrigatorios continuam bloqueando o build.
- `gbsdoctor --json` passa a expor `diagnostics.resource_pool_readiness` exigindo o contrato `assetc_production_profile_report`, permitindo que app/CI validem readiness por BG tiles, OBJ tiles, paletas, OAM e PCM antes da rodada beta.
- `scripts/smoke_mgba.sh --stress --manual-pass --write-readiness-evidence` escreve evidencia parcial validavel de `manual_mgba_stress_smoke`, mantendo `hardware_or_ci_validation` e `gba_studio_engine_primary_rollout` pendentes para evitar promocao principal acidental.
- `tools/verify_cross_platform --hardware-ci-pass --write-readiness-evidence` escreve evidencia parcial validavel de `hardware_or_ci_validation` somente apos confirmacao explicita e execucao verde, mantendo smoke mGBA e rollout privado da engine primaria pendentes.
- `tools/production_smoke --engine-primary-rollout-pass --write-readiness-evidence` escreve evidencia parcial validavel de `gba_studio_engine_primary_rollout` somente apos smoke verde e confirmacao explicita, mantendo smoke mGBA e hardware/CI pendentes.
- `gbsdoctor --merge-readiness-evidence` combina evidencias parciais validadas em um `readiness_evidence.json` unico, sem o app/CI editar JSON manualmente.
- `gbsdoctor --write-promotion-bundle` passa a arquivar `readiness_evidence.json` real e integridade SHA-256 quando a geracao recebe `--readiness-evidence`.
- `readiness_evidence` agora exige proveniencia para gates `ok=true` via `evidence_type`, `source` e `checked_at`; dry-run local e CI parcial podem ser arquivados, mas nao promovem `primary_ready` sem escopo compatível.
- `assetc --lz77-tiles` gera `Lz77TileAsset` opcional ao lado do `TileAsset` bruto; `render.load_tiles(Lz77TileAsset)` decodifica em buffer fixo e carrega tiles BG/OBJ sem heap.
- `assetc --lz77-palette` gera `Lz77PaletteAsset` opcional ao lado do `PaletteAsset` bruto; `render.load_palette(Lz77PaletteAsset)` decodifica em buffer fixo e carrega paletas BG/OBJ sem heap.
- Versao publica sincronizada para `2.24.0` em `VERSION`, `enginepack.json`, `assetc`, `gbsbuild` e `gbsdoctor`; o app pode manter `gbastudio_engine` como backend primario privado, com Butano apenas como legado/manual ate a promocao final ficar provada.

## 2.18.0

- Templates `exported_menu`, `exported_cutscene` e `exported_world_map` passam a inicializar `EngineResourceManager` e streamar `ResourceBankGroup` por tela, cena ou no focado.
- O fluxo preserva fallback para projetos sem `resource_bank_groups`, mantendo a carga direta anterior.
- Engine Pack declara `template_menu_screen_resource_bank_streaming`, `template_cutscene_scene_resource_bank_streaming` e `template_world_map_node_resource_bank_streaming`.

## 2.17.0

- `make verify-production-smoke` passa a compilar os projetos smoke em vez de rodar apenas em modo `--skip-build`.
- `make verify-stress` agora exige `group_pressure_report` no relatorio dos stress projects.
- A validação final do Engine Pack cobre melhor templates multi-genero, ROMs geradas e diagnosticos de pressão por grupo.

## 2.16.0

- Templates `exported_point_click` e `exported_visual_novel` passam a inicializar `EngineResourceManager` e streamar o `ResourceBankGroup` da cena antes de carregar o background.
- Projetos sem `resource_bank_groups` preservam o caminho antigo de carga direta de paletas/tiles/tilemap.
- Engine Pack declara `template_point_click_scene_resource_bank_streaming` e `template_visual_novel_scene_resource_bank_streaming`.

## 2.15.0

- `assetc --pack-json` sobe o relatorio `GBAStudioAssetPackReport` para schema 10 com `group_pressure_report`.
- O novo relatorio mostra, por grupo de banco/room, recursos solicitados, capacidade do pool, percentual usado e saldo restante para facilitar diagnostico em projetos grandes.
- Engine Pack declara `asset-pack-group-pressure-report` e `assetc_group_pressure_report` para exportadores, Electron, `gbsdoctor`, stress readiness e CI.

## 2.14.0

- `gbs/resource_manager.hpp` adiciona `preview_resource_bank_group` para prever um `ResourceBankGroup` nomeado sem mutar o manager real.
- A previa reutiliza `preview_resource_banks`, preserva `group_name` no sucesso e limpa a reserva quando a entrada e invalida ou algum banco do grupo conflita.
- Engine Pack declara `resource_bank_group_preview` para exportadores, Electron, `gbsdoctor`, stress readiness e CI.

## 2.13.0

- `gbs/resource_manager.hpp` adiciona `preview_resource_banks` para prever um lote transacional de `ResourceBank` sem mutar o manager real.
- A prévia usa um manager local de probe para detectar conflitos internos do lote e preencher o buffer de reservas com os ranges que caberiam.
- Engine Pack declara `resource_bank_batch_preview` para exportadores, Electron, `gbsdoctor` e CI.

## 2.12.0

- `gbs/resource_manager.hpp` adiciona `preview_resource_bank_reservation` para prever reserva de `ResourceBank` sem mutar o `EngineResourceManager`.
- `reserve_resource_bank` passa a reutilizar a mesma logica de preview antes de marcar o range, mantendo diagnostico e reserva real alinhados.
- Engine Pack declara `resource_bank_reservation_preview` para exportadores, Electron, `gbsdoctor` e CI.

## 2.11.0

- `gbs/resource_manager.hpp` adiciona `find_next_resource_range` para prever o proximo range alinhado disponivel sem reservar.
- `reserve_next_resource_range` passa a reutilizar a mesma logica de preview, reduzindo divergencia entre diagnostico e reserva real.
- Engine Pack declara `resource_next_range_preview` para exportadores, Electron, `gbsdoctor` e CI.

## 2.10.0

- `gbs/resource_manager.hpp` adiciona `resource_pool_free_block_count` e `ResourcePoolUsage::free_block_count`.
- Diagnosticos de resource/VRAM agora conseguem reportar quantos blocos livres existem em cada pool, melhorando a leitura de fragmentacao alem de `largest_free_block`.
- Engine Pack declara `resource_free_block_count` para exportadores, Electron, `gbsdoctor` e CI.

## 2.9.0

- `gbs/resource_manager.hpp` adiciona `ResourceBankCachePrunePreview` e `preview_resource_bank_cache_prune`.
- Exportadores e runtimes agora conseguem estimar quantas entradas do cache seriam podadas, quantas estao travadas e quantas unidades seriam liberadas sem mutar VRAM/cache.
- Engine Pack declara `resource_bank_cache_prune_preview` para exportadores, Electron, `gbsdoctor` e CI.

## 2.8.0

- `gbs/resource_manager.hpp` adiciona `ResourceBankCachePrunePolicy`, `ResourceBankCachePruneResult` e `prune_resource_bank_cache`.
- O cache de bancos agora pode liberar preventivamente entradas antigas/despriorizadas por idade, prioridade e pool, preservando entradas travadas e usando rollback se alguma liberacao falhar.
- Engine Pack declara `resource_bank_cache_prune_policy` para exportadores, Electron, `gbsdoctor` e CI.

## 2.7.0

- Templates top-down, platformer e isometrico agora usam `ResourceBankPrefetchPolicy` no prefetch periodico de grupos de room.
- O prefetch dos templates fica limitado a dois bancos novos/uploads por chamada, preservando streaming progressivo por frame e evitando saturar a fila DMA em projetos grandes.
- Engine Pack declara `template_room_resource_bank_prefetch_budget` para exportadores, Electron, `gbsdoctor` e CI.

## 2.6.0

- `gbs/resource_manager.hpp` adiciona `ResourceBankPrefetchPolicy`, helpers de permissao por orçamento e variantes `*_policy` para prefetch de bancos com e sem upload.
- Exportadores podem limitar quantos bancos novos e quantos uploads DMA entram em uma chamada de prefetch, mantendo reuso de bancos ja carregados e pulando o restante como trabalho futuro.
- Engine Pack declara `resource_bank_prefetch_budget_policy` para exportadores, Electron, `gbsdoctor` e CI.

## 2.5.0

- `gbs/resource_manager.hpp` adiciona `ResourceBankPrefetchWindow`, `resource_bank_prefetch_area_overlaps_window`, `prefetch_resource_banks_for_camera_window` e `prefetch_resource_banks_for_camera_window_with_uploads`.
- O prefetch agora pode filtrar bancos por janela de area expandida antes de reservar ou enfileirar upload, permitindo que exportadores façam streaming por metatile/area sem exigir fonte de upload para bancos fora da janela util.
- Engine Pack declara `resource_bank_area_window_prefetch` para exportadores, Electron, `gbsdoctor` e CI.

## 2.4.0

- Os templates top-down, platformer e isometrico agora mantem `ResourceBankCache` estatico, fazem prefetch periodico dos grupos de outras rooms quando ha `ResourceBankUploadSource[]` e tentam promover o grupo prefetched antes do streaming normal.
- O caminho preserva fallback seguro para projetos sem upload sources ou sem grupos multi-room, mantendo o comportamento antigo quando o cache nao contem o grupo alvo.
- Engine Pack declara `template_room_resource_bank_prefetch_promotion` para exportadores, Electron, `gbsdoctor` e CI.

## 2.3.0

- `gbs/resource_manager.hpp` adiciona `resource_bank_cache_contains_group`, `promote_resource_bank_group_from_cache` e `hot_swap_resource_bank_group_from_cache`.
- Grupos prefetched agora podem virar o grupo ativo sem reservar nem reenfileirar upload de novo, transferindo a posse das reservas do cache para o runtime.
- Engine Pack declara `resource_bank_cache_group_promotion` e `resource_bank_cache_group_hot_swap` para exportadores, Electron, `gbsdoctor` e CI.

## 2.2.0

- `gbs/resource_manager.hpp` adiciona `prefetch_resource_banks_for_camera_with_uploads` para reservar bancos proximos da camera e enfileirar uploads por `ResourceBankUploadSource`.
- O prefetch com upload rejeita fontes ausentes ou fila DMA cheia antes de mutar cache/VRAM, e nao reenfileira DMA para bancos ja carregados.
- Engine Pack declara `resource_bank_camera_prefetch_uploads` para exportadores, Electron, `gbsdoctor` e CI.

## 2.1.0

- `gbs/resource_manager.hpp` adiciona `resource_bank_prefetch_priority_for_area` e `prefetch_resource_banks_for_camera`.
- O prefetch prioriza bancos de recurso por distancia da camera, reutiliza entradas ja carregadas e respeita entradas travadas no cache.
- Engine Pack declara `resource_bank_camera_prefetch` para exportadores, Electron, `gbsdoctor` e CI.

## 2.0.0

- `gbs/isometric.hpp` adiciona `find_iso_path_step_astar`, um A* limitado por orçamento fixo de ate 64 nos e sem heap.
- O template `isometric_basic` usa A* para o ator seguidor contornar bloqueios com melhor prioridade que o greedy simples.
- Engine Pack declara `isometric_runtime.iso_astar_path_step`.

## 1.99.0

- `gbs/platformer.hpp` adiciona `update_platformer_enemy_patrol` para patrulha de inimigo consciente de tiles.
- Inimigos de plataforma agora podem virar ao bater em parede ou antes de cair de borda, preservando o helper simples baseado em bounds.
- `platformer_basic` usa a nova API e o Engine Pack declara `platformer_runtime.enemy_tile_patrol`.

## 1.98.0

- `gbs/platformer.hpp` adiciona `snap_platformer_actor_to_moving_platforms`.
- O template `platformer_basic` agora encaixa o player no topo de plataformas moveis quando ele aterrissa vindo de cima e dispara o script da plataforma.
- Engine Pack declara `platformer_runtime.moving_platform_landing_snap`.

## 1.97.0

- `gbs/platformer.hpp` adiciona `PlatformerEnemyContactResult` e `resolve_platformer_enemy_contact`.
- O runtime platformer agora diferencia contato lateral de stomp: stomp desativa o inimigo e aplica bounce; contato lateral continua reportando dano.
- `platformer_basic` usa a nova API e o Engine Pack declara `platformer_runtime.enemy_stomp_contact`.

## 1.96.0

- `gbs/platformer.hpp` adiciona `PlatformerActorAnimationState` para exportadores e templates derivarem animacoes do ator.
- `platformer_actor_animation_state` classifica `Idle`, `Run`, `Jump`, `Fall` e `Climb` a partir do estado fisico sem duplicar regra no template.
- Engine Pack declara `platformer_runtime.actor_animation_state` para Electron, stress readiness e CI.

## 1.95.0

- `gbs/platformer.hpp` expõe helpers de chão inclinado para plataforma.
- `update_platformer_actor` agora encaixa o ator em slopes `BlockBelowRising`/`BlockBelowFalling` quando o pé está próximo da superfície.
- Engine Pack declara `platformer_runtime.slope_floor_snap` para exportadores, Electron, stress readiness e CI.

## 1.94.0

- `gbs/isometric.hpp` expõe `apply_iso_actor_event_command`, `apply_iso_actor_event_commands` e `consume_iso_actor_event_commands`.
- `isometric_basic` usa a API pública da engine para aplicar comandos de evento em atores, removendo lógica local duplicada.
- Engine Pack declara `isometric_runtime.actor_command_apply` e atualiza o manifesto `exported_isometric`.

## 1.93.0

- `gbs/isometric.hpp` adiciona helpers para localizar atores pelo tile/cursor selecionado.
- O template `isometric_basic` agora tenta executar `on_interact` do ator sob o cursor antes de cair no evento de tile.
- Engine Pack declara `isometric_runtime.cursor_actor_interaction` para exportadores, Electron e CI.

## 1.92.0

- `IsoTileEventData` agora pode representar areas retangulares de tile com `width_tiles` e `height_tiles`.
- `iso_tile_event_script_for` passa a resolver scripts por area, mantendo compatibilidade com eventos de 1 tile.
- `assetc --export-project-json` aceita `isometric_project.rooms[].tile_events[].area`/`bounds` ou `width`/`height` para triggers isometricos maiores.

## 1.91.0

- `IsometricRoomData` agora pode declarar `cursor_start` data-driven por room.
- `assetc --export-project-json` aceita `isometric_project.rooms[].cursor_start` ou `selection_start`.
- O template `isometric_basic` usa o cursor inicial da room quando o jogador ativa o modo cursor com `B`.

## 1.90.0

- `gbs/isometric.hpp` adiciona `IsoCursorState`, helpers de cursor/seleção e persistência opcional do cursor em `IsometricSaveData`.
- O template `isometric_basic` usa `B` para alternar modo cursor, D-pad para mover a seleção e `A` para executar script do tile selecionado.
- Engine Pack declara `isometric_runtime.cursor_selection` para exportadores, Electron e CI.

## 1.89.0

- `IsometricRoomData` agora expõe `IsoTileEventData` e `iso_tile_event_script_for`.
- O template `isometric_basic` executa script de tile pelo botão A quando não há ator interativo adjacente.
- `assetc --export-project-json` aceita `isometric_project.rooms[].tile_events[]` ou `tile_interactions[]` com `on_interact`, `on_select`, `on_activate` ou `script`.

## 1.88.0

- `PlatformerRoomData` agora expõe `PlatformerMovingPlatformEventData` e `platformer_moving_platform_event_script_for`.
- O template `platformer_basic` executa script de plataforma móvel quando ela carrega o player.
- `assetc --export-project-json` aceita `rooms[].moving_platforms[].on_stand`, `on_contact`, `on_ride`, `on_touch` ou `script` e gera tabela estática de eventos por plataforma.

## 1.87.0

- `PlatformerRoomData` agora expõe `PlatformerEnemyEventData` e `platformer_enemy_event_script_for`.
- O template `platformer_basic` executa script de inimigo quando o player colide com um inimigo.
- `assetc --export-project-json` aceita `rooms[].enemies[].on_hit`, `on_touch`, `on_hit_player` ou `script` e gera tabela estática de eventos por inimigo.

## 1.86.0

- `PlatformerMovingPlatform` agora carrega `tile_index` e `palette` opcionais para o template desenhar plataformas moveis com visual por dado.
- `assetc --export-project-json` resolve `platformer_project.rooms[].moving_platforms[].metasprite/sprite/sprite_asset/asset` por ID do `asset_pack`.
- Engine Pack declara `asset_export_semantic_platformer_platform_refs` para descoberta por app, Electron e CI.

## 1.85.0

- `PlatformerEnemy` agora carrega `tile_index` e `palette` opcionais para o template desenhar inimigos com tiles/paletas por dado.
- `assetc --export-project-json` resolve `platformer_project.rooms[].enemies[].metasprite/sprite/sprite_asset/asset` por ID do `asset_pack`.
- Engine Pack declara `asset_export_semantic_platformer_enemy_refs` para descoberta por app, Electron e CI.

## 1.84.0

- `assetc --export-project-json` agora resolve atores de `isometric_project.rooms[].actors[]` por ID do `asset_pack`.
- Atores isometricos podem usar `metasprite`, `sprite`, `sprite_asset` ou `asset` para derivar `tile_index` e `palette` do primeiro part do metasprite gerado.
- Engine Pack declara `asset_export_semantic_isometric_actor_refs` para descoberta por app, Electron e CI.

## 1.83.0

- `assetc --export-project-json` agora resolve `topdown_project.player.metasprite`, `player.animation`, `rooms[].npcs[].metasprite` e `rooms[].npcs[].animation` por ID do `asset_pack`.
- Player/NPC podem usar `{ "asset": "player_sprite", "index": 1 }` para escolher um metasprite gerado e `{ "asset": "player_sprite" }` para usar a animacao gerada.
- Engine Pack declara `asset_export_semantic_actor_refs` para descoberta por app, Electron e CI.

## 1.82.0

- `assetc --export-project-json` agora resolve `assets.sfx_assets`, `music_assets`, `pcm_assets` e `tracker_assets` por ID do `asset_pack` quando o asset gera header de audio.
- Referencias de audio podem usar `{ "asset": "audio_pack", "index": 0 }`; referencias por string usam o item `0` do array gerado.
- Engine Pack declara `asset_export_semantic_audio_refs` para descoberta por app, Electron e CI.

## 1.81.0

- `gbsdoctor --validate-promotion-bundle` agora retorna `promotion_summary_summary` quando `promotion_summary.json` e valido.
- O schema publico `schemas/promotion_bundle_validation.schema.json` passa a exigir esse resumo nullable para UI/CI lerem o estado compacto sem abrir arquivos internos.
- Engine Pack declara `doctor_promotion_bundle_promotion_summary_summary` para descoberta por app, Electron e CI.

## 1.80.0

- Publica `schemas/promotion_summary.schema.json` como contrato JSON do `promotion_summary.json` gerado no promotion bundle.
- `gbsdoctor --validate-public-schema promotion_summary --schema-document <arquivo>` valida o resumo compacto; `auto` detecta `kind: promotion_summary`.
- Engine Pack declara `doctor_promotion_summary_schema` para descoberta por app, Electron e CI.

## 1.79.0

- `gbsdoctor --write-promotion-bundle` agora inclui `promotion_summary.json` como resumo compacto para UI/CI.
- `promotion_bundle.json` registra o resumo JSON em `files` e `file_integrity`, com validacao estrutural por `gbsdoctor --validate-promotion-bundle`.
- Engine Pack declara `doctor_promotion_bundle_json_summary` para descoberta por app, Electron e CI.

## 1.78.0

- `gbsdoctor --validate-promotion-bundle` agora retorna `public_schema_catalog_summary` com `schema_count`, `missing_schemas` e argumentos aceitos.
- A resposta publica `schemas/promotion_bundle_validation.schema.json` passa a exigir esse resumo para UI/CI exibirem readiness dos contratos sem abrir arquivos internos.
- Engine Pack declara `doctor_promotion_bundle_public_schema_summary` para descoberta por app, Electron e CI.

## 1.77.0

- `gbsdoctor --write-promotion-bundle` agora inclui `public_schema_catalog.json` dentro do bundle de promocao.
- `promotion_bundle.json` registra hash e tamanho do catalogo publico em `file_integrity`.
- `gbsdoctor --validate-promotion-bundle` valida o catalogo publico embutido e falha se ele listar schemas ausentes.
- Engine Pack declara `doctor_promotion_bundle_public_schema_catalog` para app, Electron e CI auditarem contratos publicos junto com a decisao de promocao.

## 1.76.0

- `gbsdoctor --verify-public-schema-catalog <arquivo> --json` compara um catalogo arquivado contra o Engine Pack atual.
- O verificador detecta diferencas de `schema_count`, schemas ausentes/desconhecidos, `schema_path`, `exists`, `size_bytes`, `sha256` e `validator`.
- Engine Pack declara `doctor_public_schema_catalog_verifier` para app, Electron e CI bloquearem artefatos antigos ou adulterados.

## 1.75.0

- `gbsdoctor --write-public-schema-catalog <arquivo> --json` grava o catalogo publico de schemas como artefato de release/CI.
- O writer retorna `public_schema_catalog_write` com `schema_count` e `missing_schemas`, preservando exit code diferente de zero quando o pacote esta incompleto.
- Engine Pack declara `doctor_public_schema_catalog_writer` para descoberta por app, Electron e CI.

## 1.74.0

- Publica `schemas/public_schema_catalog.schema.json` como contrato JSON da saida de `gbsdoctor --list-public-schemas`.
- `gbsdoctor --validate-public-schema public_schema_catalog --schema-document <arquivo>` valida catalogos arquivados; `auto` detecta `kind: public_schema_catalog`.
- Engine Pack declara `doctor_public_schema_catalog_schema` para descoberta por app, Electron e CI.

## 1.73.0

- `gbsdoctor --list-public-schemas --json` agora inclui `size_bytes`, `sha256` e `missing_schemas` para cada schema publico.
- O catalogo vira um inventario verificavel do Engine Pack, util para app, Electron e CI detectarem pacote incompleto ou adulterado.
- Engine Pack declara `doctor_public_schema_catalog_integrity` para descoberta via `enginepack.json`.

## 1.72.0

- `gbsdoctor --list-public-schemas --json` publica um catalogo dos schemas publicos aceitos pelo Engine Pack.
- O catalogo informa caminho relativo, caminho absoluto, existencia do arquivo e argumentos aceitos por `--validate-public-schema`.
- Engine Pack declara `doctor_public_schema_catalog` para descoberta por app, Electron e CI.

## 1.71.0

- `gbsdoctor --validate-public-schema` agora cobre tambem `gbastudio_project`, `export_project` e `asset_pack`.
- O modo `auto` detecta manifestos de projeto/export por `backend`, `template_dir` e `assets[]`, facilitando validacao unica por Swift, Electron e CI.
- Engine Pack declara `doctor_public_project_schema_validation` para descoberta via `enginepack.json`.

## 1.70.0

- `gbsdoctor --validate-public-schema auto --schema-document <arquivo>` detecta `readiness_report`, `promotion_bundle` e `promotion_bundle_validation` por `kind`.
- O modo `auto` tambem reconhece `readiness_evidence` pelo conjunto de gates obrigatorios.
- Engine Pack declara `doctor_public_schema_auto_detection` para descoberta via `enginepack.json`.

## 1.69.0

- `gbsdoctor --validate-public-schema <schema> --schema-document <arquivo>` valida artefatos publicos por uma interface unica para app, Electron e CI.
- O validador cobre `readiness_evidence`, `readiness_report`, `promotion_bundle` e `promotion_bundle_validation` sem exigir dependencia externa de JSON Schema.
- Engine Pack declara `doctor_public_schema_validation` para descoberta via `enginepack.json`.

## 1.68.0

- Publica `schemas/promotion_bundle_validation.schema.json` como contrato JSON do resultado de `gbsdoctor --validate-promotion-bundle`.
- `enginepack.json.schemas` declara `promotion_bundle_validation`, e `gbsdoctor` valida que o schema esta presente no Engine Pack.
- Engine Pack declara `doctor_promotion_bundle_validation_schema` para descoberta por app, Electron e CI.

## 1.67.0

- `gbsdoctor --validate-promotion-bundle` agora retorna `readiness_summary` com `stage`, `backend_policy`, `manual_primary_gates`, `missing_manual_gates`, `next_actions` e `blockers` extraidos do bundle arquivado.
- Apps, Electron e CI podem mostrar proximas acoes de promocao direto do resultado da validacao, sem abrir `readiness_decision.json` manualmente.
- Engine Pack declara `doctor_promotion_bundle_readiness_summary` para descoberta por app, Electron e CI.

## 1.66.0

- `gbsdoctor --validate-promotion-bundle <dir-or-json> --require-primary-ready` agora vira gate de CI para bundles arquivados e falha enquanto `ready_for_primary_backend` for falso.
- O resultado `promotion_bundle_validation` expõe `primary_ready_required` para apps/CI distinguirem validacao estrutural de gate de promocao principal.
- Engine Pack declara `doctor_promotion_bundle_primary_gate` para descoberta por app, Electron e CI.

## 1.65.0

- `promotion_bundle.json` agora inclui `file_integrity` com SHA-256 e tamanho dos artefatos de decisao, validacao, evidencias, relatorio completo e resumo.
- `gbsdoctor --validate-promotion-bundle` recalcula os hashes e falha quando algum artefato interno do bundle foi alterado depois da geracao.
- Engine Pack declara `doctor_promotion_bundle_file_integrity` para descoberta por app, Electron e CI.

## 1.64.0

- `gbsdoctor --write-promotion-bundle <dir>` agora inclui `gbsdoctor_report.json` com o relatorio completo de checks, diagnostics e `engine_manifest`.
- `schemas/promotion_bundle.schema.json` exige `files.gbsdoctor_report`, e `gbsdoctor --validate-promotion-bundle` valida que o relatorio completo contem `version`, `engine_manifest`, `checks` e `diagnostics`.
- Engine Pack declara `doctor_promotion_bundle_audit_report` para descoberta por app, Electron e CI.

## 1.63.0

- Publica `schemas/promotion_bundle.schema.json` como contrato JSON do manifest `promotion_bundle.json`.
- `gbsdoctor --validate-promotion-bundle <dir-or-json>` valida o bundle gerado, arquivos declarados, readiness decision e readiness validation.
- Engine Pack declara `doctor_promotion_bundle_schema` e `doctor_promotion_bundle_validator` para descoberta por app, Electron e CI.

## 1.62.0

- `gbsdoctor --write-promotion-bundle <dir>` cria um diretorio de promocao com decisao, validacao, template de evidencia e resumo em texto.
- O bundle inclui `promotion_bundle.json`, `readiness_decision.json`, `readiness_validation.json`, `readiness_evidence_template.json` e `promotion_summary.txt`.
- Engine Pack declara `doctor_promotion_bundle_writer` para descoberta via `enginepack.json`.

## 1.61.0

- `gbsdoctor --validate-readiness-report <path>` valida o artefato arquivado de readiness report sem exigir que app/CI reimplemente o contrato.
- O validador retorna `readiness_report_validation` em JSON com `errors[]`, `stage` e `ready_for_primary_backend`.
- Engine Pack declara `doctor_readiness_report_validator` para descoberta via `enginepack.json`.

## 1.60.0

- Publica `schemas/readiness_report.schema.json` como contrato JSON do artefato gerado por `gbsdoctor --write-readiness-report`.
- `enginepack.json.schemas` declara `readiness_report`, e `gbsdoctor` valida que o schema esta presente no Engine Pack.
- Engine Pack declara `doctor_readiness_report_schema` para descoberta por app, Electron e CI.

## 1.59.0

- `gbsdoctor --write-readiness-report <path>` grava um JSON compacto e arquivavel com a decisao de promocao `butano_replacement_readiness`.
- O writer pode ser combinado com `--require-primary-ready` para arquivar a decisao e ainda bloquear CI/release quando a engine nao puder virar backend principal.
- Engine Pack declara `doctor_readiness_report_writer` para descoberta via `enginepack.json`.

## 1.58.0

- `gbsdoctor --require-primary-ready` vira gate de CI/release: retorna o relatorio compacto de readiness e falha enquanto `ready_for_primary_backend` nao for verdadeiro.
- Engine Pack declara `doctor_require_primary_ready` para descoberta via `enginepack.json`.

## 1.57.0

- `gbsdoctor --readiness-only` emite apenas o bloco compacto de promocao `butano_replacement_readiness`, em JSON ou texto, para Settings/Export/UI consumirem sem parsear o relatorio completo.
- Engine Pack declara `doctor_readiness_only` para descoberta via `enginepack.json`.

## 1.56.0

- `diagnostics.butano_replacement_readiness` passa a expor `missing_manual_gates[]` e `next_actions[]`, com comandos sugeridos para concluir gates e promocao.
- Engine Pack declara `doctor_readiness_next_actions` para descoberta via `enginepack.json`.

## 1.55.0

- `gbsdoctor --update-readiness-evidence <path>` atualiza um gate especifico de `readiness_evidence.json` sem o app/CI editar JSON manualmente.
- A CLI valida nomes de gate, aceita `--readiness-gate-ok`, `--readiness-gate-source`, `--readiness-gate-checked-at` e `--readiness-gate-message`, e retorna erro JSON acionavel para gate desconhecido.
- Engine Pack declara `doctor_readiness_evidence_update` para descoberta via `enginepack.json`.

## 1.54.0

- `gbsdoctor --write-readiness-evidence-template <path>` cria `readiness_evidence.json` diretamente em disco, incluindo diretorios intermediarios e relatorio JSON opcional para app/CI.
- Engine Pack declara `doctor_readiness_evidence_template_writer` para descoberta via `enginepack.json`.

## 1.53.0

- `gbsdoctor --print-readiness-evidence-template` gera um JSON inicial para `readiness_evidence.json`, permitindo que app/CI criem o arquivo de promocao sem hardcode.
- Engine Pack declara `doctor_readiness_evidence_template` para descoberta via `enginepack.json`.

## 1.52.0

- `gbsdoctor --readiness-evidence` passa a validar semanticamente os gates obrigatorios do arquivo de evidencia.
- Evidencias incompletas, gates desconhecidos ou gates sem `ok` booleano agora falham com checks `readiness_evidence_*` e mensagens acionaveis.

## 1.51.0

- Publica `schemas/readiness_evidence.schema.json` como contrato JSON para evidencias de promocao do backend proprio.
- `enginepack.json.schemas` declara `readiness_evidence`, e `gbsdoctor` valida que o schema esta presente no Engine Pack.
- Testes de `gbsdoctor` passam a exigir o schema junto dos schemas de projeto, asset pack e export.

## 1.50.0

- `gbsdoctor --json` aceita `--readiness-evidence`/`GBS_READINESS_EVIDENCE` para anexar evidencias externas de smoke mGBA, hardware/CI e rollout privado da engine primaria.
- `diagnostics.butano_replacement_readiness.manual_primary_gates` passa a carregar `source`/`checked_at` da evidencia e so promove `stage` para `primary_ready` quando todos os gates manuais tambem estao verdes.
- Engine Pack declara `doctor_readiness_evidence` e adiciona `make verify-beta-readiness` como preflight local para UI/CI.

## 1.49.0

- Adiciona helpers publicos `cutscene_scene_name` e `cutscene_scene_number` ao contrato Cutscene.
- Template `exported_cutscene` passa a inicializar e desenhar `HudState`, exibindo cena atual, step e contador de frame.
- Engine Pack declara `cutscene_hud_scene_step`; smokes/export profiles passam a exigir essa capability para cutscenes exportaveis.
- `gbsdoctor --json` passa a expor `diagnostics.butano_replacement_readiness`, com stage, politica de backend paralelo, blockers e checklist obrigatorio antes de tornar `gbastudio_engine` o backend principal.
- Engine Pack declara `doctor_butano_replacement_readiness` para apps Swift/Electron consumirem esse gate sem reimplementar a matriz de promocao.

## 1.47.0

- Adiciona helpers publicos `menu_screen_name` e `menu_stack_depth` ao contrato Menu/UI.
- Template `exported_menu` passa a inicializar e desenhar `HudState`, exibindo tela atual, item selecionado e profundidade da stack.
- Engine Pack declara `menu_hud_screen_stack`; smokes/export profiles passam a exigir essa capability para projetos Menu/UI exportaveis.

## 1.46.0

- Adiciona helpers publicos `visual_novel_scene_name` e `visual_novel_scene_number` ao contrato Visual Novel.
- Template `exported_visual_novel` passa a inicializar e desenhar `HudState`, exibindo cena atual, numero da cena e tamanho do historico.
- Engine Pack declara `visual_novel_hud_scene_history`; smokes/export profiles passam a exigir essa capability e tambem registram `visual_novel_autosave_slot0`.

## 1.45.0

- Adiciona helpers publicos `point_click_item_for`, `point_click_scene_name` e `point_click_selected_item_name` ao contrato Point-and-click.
- Template `exported_point_click` passa a inicializar e desenhar `HudState`, exibindo cena atual e item selecionado.
- Ao coletar o primeiro item, o runtime seleciona o item automaticamente para dar feedback imediato no HUD.
- Engine Pack declara `point_click_hud_scene_item` e os smokes/export profiles passam a exigir essa capability.

## 1.44.0

- Adiciona `WorldMapNodeStatus` e helpers `world_map_node_status`/`world_map_node_status_label` ao contrato publico de World Map.
- Template `exported_world_map` passa a inicializar e desenhar `HudState`, exibindo nome do no focado e estado `OPEN`/`LOCKED`/`HIDDEN` ou destino `LV n`.
- Engine Pack declara `world_map_hud_node_status` para o runtime World Map e os smokes/export profiles passam a exigir essa capability.

## 1.43.0

- Template `exported_shmup` passa a inicializar e desenhar `HudState`, exibindo score, high score, vidas e wave atual durante o gameplay.
- HUD do shoot-em-up e atualizado apos restore de save, dano, destruicao de inimigo, troca de wave e a cada frame desenhado.
- Engine Pack declara `shmup_hud_score_lives_high_score` para o runtime Shoot-em-up e os smokes/export profiles passam a exigir essa capability.

## 1.42.0

- Adiciona `ShmupSaveData` com helpers `capture_shmup_save_data` e `apply_shmup_save_data` para persistir posicao do player, wave, frame, score, high score, vidas, cooldowns, variaveis, tempo e flags.
- Template `exported_shmup` passa a restaurar o ultimo slot de save no boot e gravar automaticamente progresso no slot 0 durante score, dano, troca de wave e checkpoints temporizados.
- `assetc --export-project-json` passa a aceitar `shmup_project.save`, emitindo `save_enabled` e `gbs::SaveBank` com assinatura padrao `GBSH`.
- Engine Pack declara `shmup_save_data`, `shmup_autosave_slot0` e `save.export_project_config` para o runtime Shoot-em-up.

## 1.41.0

- Adiciona `CutsceneSaveData` com helpers `capture_cutscene_save_data` e `apply_cutscene_save_data` para persistir cena, step, contador de frame, variaveis, tempo e flags.
- Template `exported_cutscene` passa a restaurar o ultimo slot de save no boot sem reexecutar o script do step restaurado e grava automaticamente progresso no slot 0 durante steps temporizados, transicoes e skips.
- `assetc --export-project-json` passa a aceitar `cutscene_project.save`, emitindo `save_enabled` e `gbs::SaveBank` com assinatura padrao `GBCS`.
- Engine Pack declara `cutscene_save_data`, `cutscene_autosave_slot0` e `save.export_project_config` para o runtime Cutscene.

## 1.40.0

- Adiciona `MenuSaveData` com helpers `capture_menu_save_data` e `apply_menu_save_data` para persistir tela atual, item selecionado, stack de telas, variaveis, tempo e flags.
- Template `exported_menu` passa a restaurar o ultimo slot de save no boot e gravar automaticamente progresso no slot 0 ao navegar, trocar tela, alternar toggle, ajustar slider ou executar item.
- `assetc --export-project-json` passa a aceitar `menu_project.save`, emitindo `save_enabled` e `gbs::SaveBank` com assinatura padrao `GBMN`.
- Engine Pack declara `menu_save_data`, `menu_autosave_slot0` e `save.export_project_config` para o runtime Menu/UI.

## 1.39.0

- Adiciona `PointClickSaveData` com helpers `capture_point_click_save_data` e `apply_point_click_save_data` para persistir cena, cursor, item selecionado, variaveis, tempo e flags.
- Template `exported_point_click` passa a restaurar o ultimo slot de save no boot e gravar automaticamente progresso no slot 0 ao coletar item, trocar item selecionado ou mudar de cena.
- `assetc --export-project-json` passa a aceitar `point_click_project.save`, emitindo `save_enabled` e `gbs::SaveBank` com assinatura padrao `GBPC`.
- Engine Pack declara `point_click_save_data`, `point_click_autosave_slot0` e `save.export_project_config` para o runtime Point-and-click.

## 1.38.0

- Adiciona `VisualNovelSaveData` com helpers `capture_visual_novel_save_data` e `apply_visual_novel_save_data` para persistir cena, historico, variaveis, tempo e flags.
- Template `exported_visual_novel` passa a restaurar o ultimo slot de save no boot e gravar automaticamente progresso no slot 0 apos escolhas/transicoes de cena.
- `assetc --export-project-json` passa a aceitar `visual_novel_project.save`, emitindo `save_enabled` e `gbs::SaveBank` com assinatura padrao `GBVN`.
- Engine Pack declara `visual_novel_save_data`, `visual_novel_autosave_slot0` e `save.export_project_config` para o runtime de Visual Novel.

## 1.37.0

- Adiciona `WorldMapSaveData` com helpers `capture_world_map_save_data` e `apply_world_map_save_data` para persistir no atual, selecao, variaveis, tempo e flags.
- Template `exported_world_map` passa a restaurar o ultimo slot de save no boot e gravar automaticamente o progresso apos selecionar um no.
- `assetc --export-project-json` passa a aceitar `world_map_project.save`, emitindo `save_enabled` e `gbs::SaveBank` com assinatura padrao `GBWM`.
- Engine Pack declara `world_map_save_data`, `world_map_autosave_slot0` e `save.export_project_config` para o runtime de mapa mundial.

## 1.36.0

- Evolui o World Map nativo com nos condicionais por variavel, nos bloqueados com feedback proprio e nos escondidos ate desbloqueio.
- Template `exported_world_map` passa a diferenciar foco visivel/bloqueado de selecao liberada, disparando `on_locked` ou `locked_line` quando o jogador tenta selecionar um no bloqueado.
- `assetc --export-project-json` aceita `required_variable`, `required_value`, `unlock_variable`, `unlock_value`, `hide_when_locked`, `locked_line` e `on_locked` em `world_map_project.nodes[]`.
- `production_smoke`, `enginepack.json` e docs registram o contrato World Map v2.

## 1.35.0

- Evolui o Cutscene nativo com `CutsceneBranchData`, branch condicional por variavel, destino por step/cena, skip controlado por step, `on_skip` e espera opcional pelo fechamento do dialogo.
- Template `exported_cutscene` passa a respeitar steps nao pulaveis, executar script ao pular e resolver branch antes de avancar para o proximo step/cena.
- `assetc --export-project-json` aceita `branch`, `branch_variable`, `branch_target_scene`, `branch_target_step`, `skippable`, `on_skip` e `wait_for_dialogue` em `cutscene_project`.
- `production_smoke`, `enginepack.json` e docs registram o contrato Cutscene v2.

## 1.34.0

- Evolui o Menu/UI nativo com `MenuItemAction`, condicoes por variavel, itens escondidos quando indisponiveis, stack de telas, `PushScreen`/`PopScreen`, toggle e ajuste de valor por variavel.
- Template `exported_menu` passa a navegar com `B` para voltar, `Left/Right` para sliders e `A` para toggle/acao, preservando scripts por item e transicoes de tela.
- `assetc --export-project-json` aceita `action`, `required_variable`, `required_value`, `hide_when_unavailable`, `toggle_variable`, `adjust_variable`, `min`, `max` e `step` em `menu_project`.
- `production_smoke`, `enginepack.json` e docs registram o contrato Menu/UI v2.

## 1.33.0

- Evolui o Visual Novel nativo com `VisualNovelChoiceOptionData`, choices condicionais por variavel, `next_scene` por escolha, `on_select` por escolha e historico simples de linhas.
- Template `exported_visual_novel` passa a adiar o conteudo principal ate o `on_enter` fechar dialogo, filtrar choices indisponiveis e permitir rever a fala anterior com `B`.
- `assetc --export-project-json` aceita `choices[].next_scene`, `choices[].required_variable`, `choices[].required_value`, `choices[].hide_when_unavailable` e `choices[].on_select` em `visual_novel_project`.
- `schemas/export_project.schema.json`, `production_smoke` e `enginepack.json` registram o contrato Visual Novel v2.

## 1.32.0

- Evolui o Point-and-click nativo com `PointClickInventoryItemData`, selecao de item no cursor, hotspots que exigem item, hotspots que concedem item e fala de bloqueio quando o item requerido nao esta selecionado.
- Template `exported_point_click` passa a alternar itens com `B`, exibir indicador simples de item selecionado e adiar a troca de cena ate o dialogo atual fechar.
- `assetc --export-project-json` aceita `inventory_items`, `give_item`, `required_item`, `unavailable_line` e `on_use_item` em `point_click_project`.
- `schemas/export_project.schema.json`, `production_smoke` e o manifesto do Engine Pack registram o contrato Point-and-click v2.

## 1.31.0

- Evolui o Shmup nativo com `ShmupEnemyProjectileData`, projeteis inimigos configuraveis, dano no player, invulnerabilidade curta e transicao por `next_wave_index`.
- `assetc --export-project-json` aceita `enemy_projectile`, `enemies[].fire_interval` e `enemies[].projectile_offset` em `shmup_project`.
- Template `exported_shmup` agora executa tiros inimigos, colisao contra player, perda de vidas, piscar de invulnerabilidade e `on_clear`/proxima wave.
- `production_smoke` passa a exercitar Shmup com duas waves e projeteis inimigos.

## 1.30.0

- Adiciona `gbs/shmup.hpp` com `ShmupProjectData`, player, projeteis, waves, inimigos, score, scripts por wave/inimigo e helpers constexpr de validacao/lookup.
- `assetc --export-project-json` passa a gerar `shmup_project_data.hpp` nativo para `shmup_project`.
- Adiciona template `templates/exported_shmup` compilavel com player por D-pad, tiro por `A`, inimigos, colisao de projetil, score e dialogo visual.
- `production_smoke` passa a validar `shmup` com template nativo, `runtime_adapter.native = true` e capability `runtime_profiles.shmup_native_contract`.
- Engine Pack publica `shmup_runtime`, `engine_sdk.shmup_project_data_contract` e template `shmup_basic`.
- `make test` cobre validacao host de Shmup e compile test do header gerado pelo `assetc`.

## 1.29.0

- Adiciona `gbs/world_map.hpp` com `WorldMapProjectData`, nos conectados, navegacao direcional por conexao, selecao de level, scripts por foco/selecao e helpers constexpr de validacao/lookup.
- `assetc --export-project-json` passa a gerar `world_map_project_data.hpp` nativo para `world_map_project`, aceitando conexoes por indice ou nome de node.
- Adiciona template `templates/exported_world_map` compilavel com marcadores OBJ, cursor por D-pad, dialogo visual e selecao por `A`.
- `production_smoke` passa a validar `world_map` com template nativo, `runtime_adapter.native = true` e capability `runtime_profiles.world_map_native_contract`.
- Engine Pack publica `world_map_runtime`, `engine_sdk.world_map_project_data_contract` e template `world_map_basic`.
- `make test` cobre validacao host de World Map e compile test do header gerado pelo `assetc`.

## 1.28.0

- Adiciona `gbs/cutscene.hpp` com `CutsceneProjectData`, cenas, passos temporizados, scripts por passo/entrada/saida e helpers constexpr de validacao/lookup.
- `assetc --export-project-json` passa a gerar `cutscene_project_data.hpp` nativo para `cutscene_project`.
- Adiciona template `templates/exported_cutscene` compilavel com avanco por `A`/`Start`, auto-advance por frames, dialogo visual e transicao simples entre cenas.
- `production_smoke` passa a validar `cutscene` com template nativo, `runtime_adapter.native = true` e capability `runtime_profiles.cutscene_native_contract`.
- Engine Pack publica `cutscene_runtime`, `engine_sdk.cutscene_project_data_contract` e template `cutscene_basic`.
- `make test` cobre validacao host de Cutscene e compile test do header gerado pelo `assetc`.

## 1.27.0

- Adiciona `gbs/menu.hpp` com `MenuProjectData`, telas, itens selecionaveis, scripts por item e helpers constexpr de validacao/lookup.
- `assetc --export-project-json` passa a gerar `menu_project_data.hpp` nativo para `menu_project`.
- Adiciona template `templates/exported_menu` compilavel com selecao por `Up/Down`, confirmacao por `A`, mensagem temporaria e transicao simples de tela.
- `production_smoke` passa a validar `menu` com template nativo, `runtime_adapter.native = true` e capability `runtime_profiles.menu_native_contract`.
- Engine Pack publica `menu_runtime`, `engine_sdk.menu_project_data_contract` e template `menu_basic`.
- `make test` cobre validacao host de Menu/UI e compile test do header gerado pelo `assetc`.

## 1.26.0

- Adiciona `gbs/point_click.hpp` com `PointClickProjectData`, cenas, backgrounds, hotspots clicaveis, cursor, scripts e helpers constexpr de validacao/lookup.
- `assetc --export-project-json` passa a gerar `point_click_project_data.hpp` nativo para `point_click_project`.
- Adiciona template `templates/exported_point_click` compilavel com cursor por D-pad, clique por `A`, dialogo/script por hotspot e transicao simples de cena.
- `production_smoke` passa a validar `point_click` com template nativo, `runtime_adapter.native = true` e capability `runtime_profiles.point_click_native_contract`.
- Engine Pack publica `point_click_runtime`, `engine_sdk.point_click_project_data_contract` e template `point_click_basic`.
- `make test` cobre validacao host de Point-and-click e compile test do header gerado pelo `assetc`.

## 1.25.0

- Adiciona `gbs/visual_novel.hpp` com `VisualNovelProjectData`, cenas, backgrounds, choice groups, scripts de entrada/saida e helpers constexpr de validacao/lookup.
- `assetc --export-project-json` passa a gerar `visual_novel_project_data.hpp` nativo para `visual_novel_project`, mantendo os demais runtime profiles extras como adaptadores top-down.
- Adiciona template `templates/exported_visual_novel` compilavel com `main.cpp`, manifesto e fixture de dados nativo.
- `production_smoke` passa a validar `visual_novel` com template nativo, `runtime_adapter.native = true` e capability `runtime_profiles.visual_novel_native_contract`.
- Engine Pack publica `visual_novel_runtime`, `engine_sdk.visual_novel_project_data_contract` e template `visual_novel_basic`.
- `make test` cobre validacao host de Visual Novel e compile test do header gerado pelo `assetc`.

## 1.24.0

- `assetc --export-project-json` passa a aceitar contratos de runtime adicionais: `point_click_project`, `shmup_project`, `visual_novel_project`, `menu_project`, `cutscene_project` e `world_map_project`.
- `kind`/`runtime_profile` aceitam aliases vindos do app, como `pointAndClick`, `visualNovel`, `worldMap` e `shootEmUp`, normalizando a saida para IDs estaveis.
- O manifesto gerado agora inclui `runtime_profile` e `runtime_adapter`, deixando claro quando um genero roda por adaptador top-down em vez de runtime nativo.
- `enginepack.json` publica templates/capabilities de runtime profile para apontar e clicar, shoot-em-up, visual novel, menu/UI, cutscene e mapa mundial.
- `gbsdoctor` reconhece aliases de genero em manifestos exportados e evita falso negativo quando o Engine Pack ja publica o perfil canonico.
- `production_smoke` adiciona alvos para os seis runtime profiles adaptados, todos gerados por `assetc` antes do smoke de `gbsdoctor`/`gbsbuild`.
- `make assetc-test` cobre a geracao desses seis contratos novos via `tests/host/export_runtime_profile_tests.py`.

## 1.23.0

- Adiciona `docs/BUTANO_PARITY_MATRIX.md` para medir paridade com Butano por render, sprites/OAM, BGs, audio, input, timers, DMA, IRQ, assets, memoria, build, templates, exemplos e integracao.
- Adiciona `tools/stress_projects`, CLI JSON para gerar e validar stress projects top-down, platformer, isometrico, sprites/OAM, tilesets/VRAM e audio pesado usando `assetc`, `gbsdoctor` e `gbsbuild`.
- `assetc --pack-json` agora emite `stress_profile`, `bank_usage_by_group`, `fragmentation_report`, `overflow_report` e `fallback_applied`; assets opcionais com overflow sao omitidos sem reservar recursos.
- `gbsdoctor --json` adiciona `diagnostics.stress_readiness` para expor prontidao de stress por genero/pool para Electron e GBA Studio.
- Engine Pack declara `stress_projects_cli`, `stress_projects_json_report` e `butano_parity_matrix`; `make verify-stress` valida a suite empacotada.

## 1.22.0

- Adiciona `tools/production_smoke`, CLI JSON para smoke production de top-down, platformer, isometrico e projeto exportado por `assetc --export-project-json`.
- O smoke production roda `gbsdoctor`, `gbsbuild --dry-run` e build real por projeto, com `--skip-build` para CI/preflight rapido.
- Engine Pack declara capacidades `production_smoke_cli`, `production_smoke_json_report` e `production_smoke_export_project`.

## 1.21.0

- `gbsdoctor --json` adiciona bloco `diagnostics` com resumo por genero, validacao de templates SDK, asset banking, render cost, audio cost e toolchain.
- `gbsdoctor --json` adiciona `actionable_messages[]` com codigo, severidade, mensagem e acao recomendada para consumo direto por Electron/GBA Studio.
- Engine Pack e CLIs atualizados para `1.21.0`.

## 1.20.0

- `gbs/assets.hpp` adiciona `RenderAssetCost` e helpers constexpr para estimar bytes de tiles, tilemaps, paletas, bitmaps, screenblocks e OAM de assets de render.
- `gbs/audio.hpp` adiciona `AudioMixCost` e helpers constexpr para estimar passos PSG/tracker, bytes PCM, frames aproximados do mixer e vozes simultaneas.
- `topdown_basic` valida custos de render/audio no boot e expõe counters temporarios de bytes para smoke de producao.
- `enginepack.json` publica capacidades `render_asset_cost_diagnostics`, `audio_mix_cost_diagnostics` e `template_production_cost_smoke`.

## 1.19.0

- `gbs/resource_manager.hpp` adiciona `stream_resource_bank_group_with_uploads`, que combina streaming transacional de `ResourceBankGroup` com upload por fontes nomeadas via fila DMA de VBlank.
- A nova API retorna `ResourceStreamResult` com status, banco falho, uso/fragmentacao do pool e quantidade de uploads enfileirados para diagnostico de projetos grandes.
- Templates top-down, platformer e isometrico passam a usar o helper automatico; projetos sem `resource_bank_upload_sources` preservam o fallback sem upload automatico.
- Testes host cobrem upload enfileirado, fonte ausente sem mutacao, fila DMA cheia antes do swap e overflow reportado por banco/pool.

## 1.18.0

- `gbs/platformer.hpp` adiciona inimigos patrulheiros e plataformas moveis com runtime host-testavel, sem heap.
- `assetc --export-project-json` emite `PlatformerEnemy[]` e `PlatformerMovingPlatform[]` por room em `platformer_project`.
- `gbs/isometric.hpp` adiciona `find_iso_path_step_bfs`, um pathfinding BFS limitado por orcamento para contornar bloqueios de tile/ator.
- `platformer_basic` passa a carregar objetos de room em arrays fixos e atualizar/desenhar enemies/platforms simples.

## 1.17.0

- `assetc --export-project-json` agora resolve assets semanticos do `asset_pack` por ID em `assets.bg_palettes`, `assets.obj_palettes` e `assets.tile_assets`.
- Backgrounds top-down podem declarar `tilemap` por ID do asset pack, como `"room_bg"`, e o exportador materializa o simbolo C++ gerado.
- Headers gerados pelo `asset_pack` sao incluidos automaticamente quando usados por referencias semanticas no projeto exportado.

## 1.16.0

- `assetc --export-project-json` agora emite `ResourceBankUploadSource[]` a partir do `asset_pack.resource_bank_plan`.
- As fontes geradas ligam nomes de bancos de tiles/paletas aos simbolos C++ dos assets exportados, sem depender da ordem das reservas no template.
- `assetc-test` e `verify-package` validam que o projeto top-down exportado compila com as tabelas de upload geradas.

## 1.15.0

- `gbs/resource_manager.hpp` adiciona `ResourceBankUploadSource` e lookup constexpr por nome de banco.
- Nova API `enqueue_resource_bank_upload_sources_vblank` agenda uploads de um batch/grupo ativo combinando `ResourceBankReservation.name` com fontes geradas pelo exportador.
- Testes host cobrem ordenacao de fontes por nome e rejeicao sem upload parcial quando uma fonte nomeada esta ausente.

## 1.14.0

- `gbs/resource_manager.hpp` adiciona `stream_resource_bank_group`, combinando reserva inicial, no-op para grupo ativo e hot-swap transacional com scratch buffer.
- Templates top-down, platformer e isometrico agora streamam automaticamente o `ResourceBankGroup` da room inicial, do save restaurado e das trocas de room.
- Testes host cobrem reserva inicial, troca para o mesmo grupo, hot-swap entre grupos e rollback quando o grupo seguinte nao cabe.

## 1.13.0

- Rooms top-down, platformer e isometricas agora podem declarar `resource_bank_group_name` no contrato C++.
- `assetc --export-project-json` aceita `resource_bank_group`/`bank_group` por room e materializa o vinculo no header gerado.
- Helpers publicos resolvem o `ResourceBankGroup` de uma room com fallback pelo nome da room, preparando streaming automatico por room/grupo.

## 1.12.0

- `gbs/resource_manager.hpp` adiciona lookup generico de `ResourceBankGroup` por nome.
- Contratos top-down, platformer e isometrico adicionam helpers `find_*_resource_bank_group_index` e overloads `resource_bank_group_from_*_project(project, name)`.
- Testes host cobrem lookup estavel por nome para grupos de bancos nos tres generos e na camada generica de resource manager.

## 1.11.0

- `TopDownProjectData`, `PlatformerProjectData` e `IsometricProjectData` agora expoem `resource_bank_groups` e `resource_bank_group_count`.
- `assetc --export-project-json` gera `gbs::ResourceBankGroup` a partir de `resource_bank_groups` explicito ou de `asset_pack_report.resource_bank_groups[]` quando `resource_banks` usa `"asset_pack"`.
- `schemas/export_project.schema.json` aceita `resource_bank_groups`, e testes host validam helpers/contratos de grupos nos tres generos.

## 1.10.0

- `gbs/resource_manager.hpp` adiciona `ResourceBankGroup` como unidade publica de streaming por room/grupo.
- Novas APIs `reserve_resource_bank_group`, `release_resource_bank_group` e `hot_swap_resource_bank_group` aplicam reserva, liberacao e troca transacional preservando `group_name`.
- Testes host cobrem reserva/liberacao de grupo, rollback quando um banco falha e hot-swap entre grupos.

## 1.9.0

- `assetc --pack-json` agora preserva `asset.bank_group` em cada allocation e em cada entrada de `resource_bank_plan`.
- O relatorio global passa a emitir `resource_bank_groups[]`, agrupando bancos por room/grupo para streaming futuro de rooms e assets grandes.
- `schemas/asset_pack.schema.json`, `enginepack.json`, docs e smoke tests documentam o uso de grupos de bancos pelo exportador Electron/GBA Studio.

## 1.8.0

- `assetc --pack-json` agora emite `resource_bank_plan` derivado das alocacoes reais de BG tiles, OBJ tiles, paletas BG/OBJ e OAM.
- `assetc --export-project-json` aceita `resource_banks: "asset_pack"` em top-down, platformer e isometrico para gerar `gbs::ResourceBank` automaticamente a partir do `asset_pack`.
- `schemas/export_project.schema.json`, `enginepack.json` e os smoke tests do Engine Pack documentam a nova ponte para Electron/GBA Studio gerar bancos sem arrays manuais.

## 1.7.0

- Resource/VRAM Banking v5 adiciona helpers publicos para transformar `ResourceBankReservation` em `DmaTransfer` de upload para VRAM/paleta/OAM.
- `enqueue_resource_bank_upload_vblank` agenda uploads de bancos na fila DMA de VBlank usando os enderecos reais de BG tiles, OBJ tiles, BG palette, OBJ palette e OAM.
- `enqueue_resource_bank_uploads_vblank` valida um batch inteiro antes de enfileirar, rejeitando fontes ausentes ou falta de capacidade na fila DMA sem aplicar uploads parciais.

## 1.6.0

- Resource/VRAM Banking v4 adiciona `ResourceBankCache`, um cache estatico de bancos sem heap para streaming maior.
- `reserve_resource_bank_cached` tenta reservar o banco solicitado, escolhe vitimas por menor prioridade e uso mais antigo quando falta espaco, e preserva rollback completo por snapshot se a troca nao couber.
- Bancos travados com `set_resource_bank_cache_locked` nao sao candidatos a eviction, permitindo manter tiles/paletas/OAM criticos durante transicoes de room.
- `touch_resource_bank_cache_entry` atualiza recencia de uso para o exportador/runtime priorizar assets recentes em projetos grandes.

## 1.5.0

- `topdown_project.backgrounds` em `assetc --export-project-json` agora gera `TopDownBackgroundData` com layer, tilemap normal ou comprimido, scroll inicial e parallax 8.8.
- `topdown_project.resource_banks` agora gera bancos planejados de tiles/paletas/OAM (`ResourceBank`) para templates reservarem recursos por plano exportado antes do load.
- `TopDownProjectData` valida backgrounds e bancos de recurso, e o template top-down usa `reserve_resource_banks` quando o exportador fornece um plano de bancos.
- `platformer_project.resource_banks` e `isometric_project.resource_banks` agora geram o mesmo plano de `ResourceBank`; `PlatformerProjectData` e `IsometricProjectData` validam esses bancos e seus templates usam `reserve_resource_banks` com fallback para `reserve_resource_batch`.
- `platformer_project` agora aceita scripts de sala, hazard, checkpoint e camera zone; o runtime platformer executa esses scripts em `platformer_basic` via `EventState`.
- `isometric_project` agora aceita scripts de sala e ator; o runtime isometrico executa eventos de start/update/interacao e comandos basicos de ator no template.
- `platformer_basic` e `isometric_basic` agora aplicam `EventOp::Warp` para trocar de room e recarregar dados de runtime sem depender do GBA Studio.
- Fixtures simuladas de export platformer/isometrico agora cobrem projetos multi-room com `EventOp::Warp` em `assetc-test` e `verify-package`.
- APIs publicas platformer/isometrica agora incluem payloads de save sem heap para room, player/atores, camera, variaveis e tempo de jogo.
- `platformer_basic` agora usa `PlatformerSaveData` em SRAM para restaurar o save mais recente no boot e autosalvar em checkpoint/warp.
- `isometric_basic` agora usa `IsometricSaveData` em SRAM para restaurar o save mais recente no boot e autosalvar apos interacao/warp.
- `topdown_project.save`, `platformer_project.save` e `isometric_project.save` agora geram `save_enabled` e `gbs::SaveBank save_bank` no header exportado, permitindo que o app defina assinatura, versao, offset e slots sem editar `main.cpp`.
- Validation Tooling v1: `scripts/smoke_mgba.sh` agora cobre top-down, platformer, isometric e projeto gerado, com modo `--check-only` e relatorio Markdown.
- Adiciona `scripts/verify_cross_platform.py` para validar localmente `gbsdoctor` e `gbsbuild --dry-run --json`, marcando Windows/Linux como pendentes ate rodarem em ambiente real.
- Engine Pack agora empacota `tools/smoke_mgba` e `tools/verify_cross_platform`.
- `make verify-mgba-check` e `make verify-cross-platform-local` viram alvos reproduziveis de validacao.
- Engine Pack agora inclui fixtures exportados simulados para `topdown`, `platformer` e `isometric`, todos cobertos por `make verify-export-fixture`.
- `gbsdoctor` valida `gbastudio_project.json.kind` contra os generos declarados em `engine_manifest.sdk_templates`.
- Engine Pack agora publica schemas JSON para `gbastudio_project.json` e `asset_pack`, e `gbsbuild` usa `gbastudio_project.json.build.target` como target padrao quando o app nao passa `--target`.
- `gbs/platformer.hpp` e `gbs/isometric.hpp` agora expõem `PlatformerProjectData` e `IsometricProjectData`, alinhando os templates exportados ao contrato data-driven usado pelo top-down.
- `make verify-export-fixture` agora compila fixtures exportados usando `gbastudio_project.json.build.target` sem precisar passar `--target`, cobrindo melhor o fluxo futuro do app desktop.
- `assetc --export-project-json` agora aceita `topdown_project` e gera um `gbastudio_project_data.hpp` minimo com rooms, colisao, portais, metadata de room, NPCs, triggers, choice groups, scripts simples de room/portal/interacao/NPC/trigger/escolha, player, camera e dialogos simples, validado por build externo do Engine Pack.
- `assetc --export-project-json` tambem aceita `platformer_project` e gera `platformer_project_data.hpp` com rooms, colisao, player start, camera, config fisica, hazards, checkpoints e camera zones.
- `assetc --export-project-json` tambem aceita `isometric_project` e gera `isometric_project_data.hpp` com rooms, grid 2:1, camera, colisao e atores iniciais.
- Os blocos `topdown_project`, `platformer_project` e `isometric_project` aceitam `includes` e `assets` para referenciar headers/simbolos de assets compilados sem escrever C++ manualmente.

## 1.4.0

- Asset Pipeline Production v2: adiciona `assetc --export-project-json` para materializar uma pasta de projeto externo a partir de um manifesto JSON.
- O export copia o template informado, gera headers do `asset_pack`, escreve `asset_pack_report.json` e produz `gbastudio_project.json` com assets gerados e requisitos.
- `make verify-package` agora usa o `assetc` empacotado para gerar e compilar um projeto externo completo pelo Engine Pack.
- Engine Pack declara capacidades `asset-export-project-json`, `asset-export-project-manifest` e `asset-export-project-generated-headers`.

## 1.3.0

- Resource/VRAM Hot-swap v1: adiciona `hot_swap_resource_banks` para trocar bancos ativos por um novo conjunto de bancos em uma operacao transacional.
- O hot-swap libera temporariamente os bancos ativos, tenta reservar os proximos e restaura snapshot se qualquer etapa falhar.
- Host tests cobrem troca bem-sucedida e rollback quando o proximo banco excede a capacidade.
- Engine Pack declara capacidades `resource_bank_hot_swap` e `resource_bank_hot_swap_rollback`.

## 1.2.0

- Isometric Advanced Runtime v1: adiciona `IsoTileMap`, flags de colisao, picking por diamond mask, bloqueio por atores e passo greedy de caminho sem heap.
- `isometric_basic` agora usa collision map, move o player respeitando tiles/atores bloqueadores e faz um ator seguir o player periodicamente.
- Host tests cobrem picking, bloqueio por mapa/atores, movimento bloqueado e fallback de path step.
- Engine Pack declara capacidades `iso_tilemap_collision`, `iso_diamond_picking`, `iso_actor_blockers`, `iso_greedy_path_step` e `isometric_basic_advanced_template`.

## 1.1.0

- Platformer Advanced Runtime v1: adiciona hazards, checkpoints/respawn e camera zones ao `gbs/platformer.hpp`.
- `PlatformerRuntimeState` guarda checkpoint ativo, dano acumulado, flag de hazard e camera zone ativa sem heap.
- `platformer_basic` agora consome hazards, checkpoints e camera zones em runtime real, mantendo build externo pelo Engine Pack.
- Host tests cobrem checkpoint one-shot, hazard com respawn, hazard sem respawn e camera zone com bounds/lock.
- Engine Pack declara capacidades `hazard_regions`, `checkpoint_respawn`, `platformer_camera_zones` e `platformer_basic_advanced_template`.

## 1.0.0

- Engine SDK Multi-template: `enginepack.json` agora declara um bloco `sdk` com catalogo oficial de templates top-down, platformer e isometric.
- Cada template expõe `id`, nome, genero, entrypoint, project data, suporte a fixture exportado e features requeridas para validação por app desktop.
- `gbsdoctor --json` inclui `engine_manifest.sdk` e `engine_manifest.sdk_templates`, permitindo que Swift/Electron descubram templates sem parse customizado do pacote.
- Engine Pack declara capability `engine_sdk` com catalogo de generos, features por template e templates top-down/platformer/isometric.
- Esta versao fecha o SDK independente; a integracao real com GBA Studio continua como fase separada para manter Butano lado a lado.

## 0.99.0

- Asset Pipeline Production v1: `assetc --pack-json` sobe para schema 8 e adiciona `export_plan` com headers, simbolos, inputs, recursos, alocacoes e argumentos sugeridos do `assetc` por asset.
- O plano diferencia `generate`, `skip` e `remove` com contagens prontas para Electron/GBA Studio orquestrarem import/build incremental sem inferir paths por fora.
- `asset.header` e `asset.symbol` podem sobrescrever nomes gerados; quando omitidos, o pipeline cria identificadores C++ seguros a partir do `asset.id`.
- Host tests cobrem `export_plan`, `header_count`, `assetc_args` e contagens incrementais de generate/skip/remove.
- Engine Pack declara capacidades `asset-pack-export-plan`, `asset-pack-header-plan`, `asset-pack-assetc-args` e `asset-pack-generate-skip-remove-counts`.

## 0.98.0

- Resource/VRAM Banking v2: adiciona `ResourcePoolKind`, `ResourceBank` e reservas transacionais de bancos para tiles BG/OBJ, paletas e OAM.
- `capture_resource_pool_usage` e `capture_engine_resource_usage` reportam capacidade, uso, restante e maior bloco livre para diagnosticar fragmentacao antes do load de rooms/templates.
- Bancos podem ser reservados com posicao fixa ou `start = 0xFFFF` para alocacao automatica alinhada, mantendo rollback por snapshot em lotes.
- Host tests cobrem relatorio de uso, reserva fixa/automatica, rejeicao por alinhamento, rollback de lote e release transacional.
- Engine Pack declara capacidades `resource_bank_*`, `resource_pool_usage_report` e `resource_largest_free_block`.

## 0.97.0

- Isometric Runtime v1: adiciona `gbs/isometric.hpp` com grid 2:1, conversao tile/screen, picking aproximado, camera follow/clamp, draw list e ordenacao estavel por profundidade.
- `isometric_basic.gba` adiciona o terceiro template de genero, com atores isometricos ordenados e build proprio sem depender do top-down/platformer.
- Engine Pack inclui `templates/isometric_basic/main.cpp` e `templates/isometric_basic/isometric_project_data.hpp`, e `make verify-package` compila o template externo `verify_isometric.gba`.
- Host tests cobrem projecao, inversao de tile center, depth key, camera, draw list e sort.
- Engine Pack declara capacidades `isometric_runtime` e `isometric_basic_template`.

## 0.96.0

- Platformer Runtime v1: adiciona `gbs/platformer.hpp` e runtime host-testavel com gravidade, corrida, colisao por eixo, pulo, coyote time, jump buffer, plataformas one-way, escadas e camera lateral.
- `platformer_basic.gba` estreia o primeiro exemplo/template fora do top-down, usando tilemap visual, collision flags, player sprite simples e reserva de recursos por batch.
- Engine Pack agora inclui `templates/platformer_basic/main.cpp` e `templates/platformer_basic/platformer_project_data.hpp`, com build externo coberto por `make verify-package`.
- Host tests cobrem queda/pouso, parede, pulo, coyote jump, one-way platform, ladder e camera.
- Engine Pack declara capacidades `platformer_runtime` e `platformer_basic_template`.

## 0.95.0

- Top-down template v10: `topdown_basic` agora usa `reserve_resource_batch` para validar tiles, paletas e OAM em uma unica operacao antes de carregar assets.
- O exemplo/export fixture mantem indices OAM estaveis para player e NPCs reservando um bloco unico compativel com o layout atual.
- O template declara capacidades fixas para arrays de reservas, preparando exportadores GBA Studio/Electron para pre-flight sem heap.
- Engine Pack declara capacidade `topdown_resource_batch_reservation`.

## 0.94.0

- Resource Managers v5: adiciona `release_resource_batch` para liberar tiles, paletas e OAM de uma room/export em uma operacao transacional.
- A liberacao em lote usa o `ResourceBatch` original para distinguir tiles BG/OBJ e restaura snapshot se qualquer reserva estiver invalida ou stale.
- Reservas de batch sao limpas apos release bem sucedido, evitando double-free acidental no runtime de streaming.
- Host tests cobrem release completo, rollback em falha parcial e rejeicao de contagens divergentes.
- Engine Pack declara capacidades `asset_batch_release` e `asset_batch_release_rollback`.

## 0.93.0

- Resource Managers v4: adiciona `ResourceBatch` e `ResourceBatchReservation` para reservar tiles, paletas e OAM de uma room/export em uma operacao transacional.
- `reserve_resource_batch` usa snapshot/rollback do manager: se qualquer asset falhar, nenhuma reserva parcial fica aplicada.
- Host tests cobrem batch valido, rollback em conflito e rejeicao de buffers de saida pequenos.
- Engine Pack declara capacidades `asset_batch_reservation` e `asset_batch_rollback`.

## 0.92.0

- Asset Pack Report v7: `assetc --pack-json` agora emite `rebuild_plan` com contagens e listas de assets para `generate`, `skip` e `remove`.
- O plano de rebuild deriva de `allocations[].status` e `incremental.assets`, oferecendo uma superficie direta para cache/import incremental no Electron/GBA Studio.
- Host tests cobrem assets novos, inalterados e removidos no plano incremental.
- Engine Pack declara capacidades `asset-pack-rebuild-plan` e `assetc_rebuild_plan`.

## 0.91.0

- Asset Pack Report v6: `assetc --pack-json` agora emite `budget_summary` e `diagnostics[]` com severidade, codigo estavel, recurso, uso, capacidade e percentual.
- Uso de recurso a partir de 80% gera warning `GBS_ASSET_PACK_BUDGET_NEAR_LIMIT` sem falhar o build; overflow continua falhando com erro estruturado `GBS_ASSET_PACK_RESOURCE_OVERFLOW`.
- Host tests cobrem warning de budget, erro estruturado de overflow e schema 6.
- Engine Pack declara capacidades `asset-pack-budget-summary`, `asset-pack-diagnostics`, `assetc_budget_summary` e `assetc_structured_diagnostics`.

## 0.90.0

- Diagnostics v6: `gbsdoctor --json` agora inclui `engine_manifest` resumido com schema, nome, versao, grupos de capacidades, lista achatada de capacidades, contagem, ferramentas e templates.
- O Electron pode descobrir capacidades do Engine Pack pelo JSON do `gbsdoctor`, sem reabrir `enginepack.json` separadamente.
- `gbsdoctor-test` cobre o novo resumo de manifest e uma capability conhecida.
- Engine Pack declara capacidade `engine_manifest_summary`.

## 0.89.0

- Asset Pack Report v5: `assetc --pack-json` valida `asset.id` unico no pack antes de gerar relatorio incremental.
- Packs com ids duplicados falham cedo com erro claro, evitando cache incremental ambiguo no Electron/GBA Studio.
- Host tests cobrem rejeicao de ids duplicados.
- Engine Pack declara capacidade `asset-pack-duplicate-id-validation`.

## 0.88.0

- Asset Pack Report v4: `assetc --pack-json` adiciona `allocations[].change_reason` para explicar `new_asset`, `fingerprint_match`, `resources_changed`, `source_changed` ou `metadata_changed`.
- Testes de host agora cobrem asset realmente `changed` usando `--previous-pack-report`, alem de assets novos, inalterados e removidos.
- Engine Pack declara capacidade `asset-pack-change-reasons`.

## 0.87.0

- Asset Pack Report v3: `assetc --pack-json` agora emite `schema: 3`, status incremental por asset e resumo de assets removidos quando recebe `--previous-pack-report`.
- Relatorio de packing agora inclui `banks` para tiles BG/OBJ/affine e bancos de paleta, facilitando diagnostico visual de uso por banco no Electron.
- Host tests cobrem assets `new`, `unchanged`, removidos, resumo incremental e bancos no relatorio.
- Engine Pack declara capacidades `asset-pack-incremental-status`, `asset-pack-removed-assets` e `asset-pack-bank-usage`.

## 0.86.0

- Save Metadata v2: adiciona `format_save_play_time` para labels `MM:SS` ou `H:MM:SS` sem heap.
- `topdown_basic` usa o helper nos labels de `LOAD`, substituindo segundos crus por tempo legivel.
- Host tests cobrem tempo zero, minutos, horas e buffer pequeno.
- Engine Pack declara capacidades `save_play_time_format` e `topdown_save_time_labels`.

## 0.85.0

- UI/Menu v2: menus agora expoem helpers de paginacao (`menu_first_visible_index`, `menu_visible_item_count`, `menu_has_previous_page`, `menu_has_next_page`).
- `advance_menu` aceita L/R para pular paginas de `menu_max_visible_items` sem heap e preservando itens desabilitados.
- `draw_menu` sinaliza pagina anterior/proxima no titulo com `^`/`v`.
- Host tests cobrem paginacao, salto por shoulder buttons e texto renderizado.
- Engine Pack declara capacidades `menu_pagination`, `menu_page_jump` e `menu_page_helpers`.

## 0.84.0

- DMA VBlank Queue v2: `DmaQueueStats` agora expõe `peak_queued` para diagnosticar picos de uso da fila.
- API publica adiciona `dma_reset_vblank_queue_stats`, permitindo zerar contadores sem descartar transferencias ja enfileiradas.
- Host tests cobrem pico da fila, reset de stats e preservacao da fila durante o reset.
- Engine Pack declara capacidades `vblank_dma_peak_stats` e `vblank_dma_stats_reset`.

## 0.83.0

- Asset Pack Report v2: `assetc --pack-json` agora emite `schema: 2`, `budgets` globais e fingerprints CRC32 por asset.
- Fingerprints incluem recursos calculados e CRC/tamanho de fonte PNG, oferecendo base simples para cache/import incremental no Electron.
- Host tests verificam schema, budgets e fingerprints no relatorio de packing.
- Engine Pack declara capacidades `asset-pack-budgets` e `asset-pack-fingerprints`.

## 0.82.0

- NPC Pathfinding v2: adiciona `find_actor_path_step_with_actor_collisions` para BFS sem heap que respeita listas fixas de atores bloqueadores.
- `move_actor_towards_with_actor_collisions` agora pode aproximar do tile alcançavel mais proximo quando o alvo exato esta bloqueado.
- Host tests cobrem desvio de ator bloqueador e fallback para alvo proximo alcançavel.
- Engine Pack declara capacidades `topdown_pathfinding_actor_blockers` e `topdown_pathfinding_nearest_reachable`.

## 0.81.0

- Actor Collision v2: adiciona `collision_mask` em `Actor`, `TopDownNpcData` e `TopDownActorData`.
- Colisao ator-ator agora respeita grupo e mascara nos helpers `*_with_actor_collisions`, preservando compatibilidade com mascara padrao `0xFFFF`.
- API publica adiciona `actor_collision_group_bit`, `actor_collision_groups_overlap` e `rect_hits_any_blocking_actor`.
- Host tests cobrem filtros de grupo/mascara e passagem por atores que nao bloqueiam o mover.
- Engine Pack declara capacidades `actor_collision_mask` e `actor_collision_group_filter`.

## 0.80.0

- Resource Managers v3: adiciona snapshots de pools e do manager inteiro para checkpoint/rollback sem heap.
- API publica adiciona `capture_resource_pool_snapshot`, `restore_resource_pool_snapshot`, `capture_resource_manager_snapshot` e `restore_resource_manager_snapshot`.
- Restore do manager e transacional: so aplica quando todos os pools do snapshot sao validos.
- Host tests cobrem rollback de pool, rejeicao de snapshot invalido e rollback de multiplos pools.
- Engine Pack declara capacidades `pool_snapshot`, `manager_snapshot` e `resource_rollback`.

## 0.79.0

- Debug Overlay v1: adiciona `debug_overlay_text` e `draw_debug_overlay` para expor frame stats, asserts e counters na tela.
- `topdown_basic` mostra o overlay ao segurar Select, sem alterar o fluxo normal de HUD/dialogo/menu.
- Host tests cobrem texto resumido do overlay e chamada para a text box de hardware.
- Engine Pack declara capacidades `debug_overlay_text`, `debug_overlay_runtime_draw` e `topdown_select_debug_overlay`.

## 0.78.0

- Render Mosaic v2: adiciona `set_bg_mosaic` para habilitar/desabilitar o bit mosaic por BG0-BG3.
- `Sprite` agora possui flag `mosaic`, propagada para OAM attr0 junto com prioridade e modo OBJ alpha/window.
- Host tests novos verificam chamadas de render runtime contra stubs de hardware e rejeicao de parametros invalidos.
- Engine Pack declara capacidades `bg_mosaic_enable` e `obj_mosaic_enable`.

## 0.77.0

- DMA VBlank Queue v1: adiciona fila fixa de ate 8 transferencias DMA para execucao segura no VBlank.
- API publica adiciona `dma_enqueue_vblank`, wrappers 16/32-bit, contagem, estatisticas, reset e flush manual por canal.
- `wait_vblank` agora drena automaticamente a fila usando DMA channel 3, preservando chamadas imediatas `dma_copy*`.
- Host tests cobrem validacao, flush em ordem, stats, rejeicao de transferencia invalida e overflow da fila.
- Engine Pack declara capacidades `vblank_dma_queue`, `vblank_dma_auto_flush`, `vblank_dma_stats` e `vblank_dma_overflow_detection`.

## 0.76.0

- Debug/Profile Core v1: adiciona `gbs/debug.hpp` com asserts leves, budget de frame, estatisticas de pico e counters nomeados.
- Runtime privado guarda o ultimo assert, contagem de frames medidos, ultimo/maior custo e quantidade de frames acima do budget.
- `topdown_basic` usa asserts em reservas de recurso e counters para NPCs, triggers, tile effects, BG/OBJ tiles e OAM.
- Host tests cobrem asserts, budget/over-budget, counters, picos e indices invalidos.
- Engine Pack declara capacidades `runtime_assertions`, `frame_budget_stats`, `named_counters`, `peak_counters` e `topdown_debug_counters`.

## 0.75.0

- Save Metadata v1: adiciona `SaveMetadata`, `SaveMetadataInfo` e records de save com titulo, tempo de jogo, timestamp, room e flags.
- API publica adiciona `make_save_metadata`, `inspect_save_metadata`, `read_save_record`, `write_save_record` e variantes por `SaveBank`.
- Records sao serializados manualmente dentro do payload do slot, sem heap e sem depender de padding de struct.
- `topdown_basic` grava saves com metadata, restaura tempo de jogo e mostra labels `LOAD` com room/tempo resumidos.
- Host tests cobrem roundtrip de metadata, rejeicao de raw save como record, destino pequeno e records em banco multi-slot.
- Engine Pack declara capacidades `save_record_metadata`, `save_record_title`, `save_record_play_time` e `topdown_save_metadata_labels`.

## 0.74.0

- Save System v2: adiciona `SaveBank`, `save_slot_at` e helpers publicos para ler/gravar/inspecionar/limpar slots indexados.
- API publica consegue contar saves validos e encontrar o slot mais recente por `sequence` sem heap.
- `topdown_basic` usa tres slots fixos de save/load no menu de pausa, com itens `LOAD` desabilitados quando o slot esta vazio.
- Autosave apos warp continua funcionando no slot atual, preservando o comportamento anterior para jogo simples.
- Host tests cobrem banco valido/invalido, escrita por slot, latest slot, clear slot e clear bank.
- Engine Pack declara capacidades `save_bank_slots`, `save_slot_latest_sequence`, `save_slot_count`, `save_slot_clear` e `topdown_pause_save_load_slots`.

## 0.73.0

- Actor Collision v1: adiciona helpers publicos para overlap de atores, retangulos contra atores e listas fixas de bloqueadores.
- Movimento do player e de NPCs pode respeitar colisao ator-ator sem heap, preservando wrappers antigos para projetos simples.
- `topdown_basic` bloqueia sobreposicao player/NPC e NPC/NPC ao atualizar movimento e IA por dados.
- Host tests cobrem overlap, bloqueio de player, bloqueio de ator e IA de NPC respeitando atores bloqueadores.
- Engine Pack declara capacidades `actor_actor_overlap`, `actor_blocker_lists`, `player_actor_collision` e `npc_actor_collision`.

## 0.72.0

- UI v1: adiciona `gbs/ui.hpp` com `HudState`, `MenuState`, HUD bar e menu simples sem heap.
- Hardware reutiliza a fonte tiled do dialogo para desenhar caixas de texto retangulares, HUD no topo e menu de pausa.
- `topdown_basic` mostra HUD de room/save sequence e abre menu com Start, incluindo acao de save manual.
- Host tests cobrem estado do HUD, selecao inicial, navegacao circular, itens desabilitados, aceitar e cancelar menu.
- Engine Pack declara capacidades `hud_bar`, `pause_menu`, `menu_disabled_items`, `menu_cancel`, `menu_accept_value` e `topdown_pause_save`.

## 0.71.0

- Save System v1: adiciona `gbs/save.hpp` com slots fixos em SRAM 32 KB, assinatura, versao, checksum e sequence.
- Runtime privado grava/le diretamente da SRAM no GBA e usa buffer host em memoria para testes.
- `topdown_basic` restaura room/player/variaveis no boot quando ha save valido e faz autosave apos warp.
- Host tests cobrem validacao de slot, write/read, destino pequeno, mismatch de versao, clear e limites de capacidade.
- Engine Pack declara capacidades `sram_32kb`, `fixed_save_slots`, `save_signature_version`, `save_checksum` e `topdown_autosave_on_warp`.

## 0.70.0

- Runtime top-down adiciona `TopDownNpcMovementData` para movimento data-driven de NPCs.
- NPCs podem usar patrulha horizontal/vertical, wander em caixa, follow player e path-to-point com pathfinding BFS limitado sem heap.
- API publica adiciona `find_actor_path_step`, `move_actor_by_delta` e `move_actor_towards` para atores respeitando colisao top-down.
- `topdown_basic` atualiza NPCs por room e valida um NPC patrulhando e outro seguindo o player.
- Host tests cobrem pathfinding em obstaculo, orçamento de busca, movimento com colisao e AI de NPC por dados.

## 0.69.0

- Asset Pipeline Pack Report v1: `assetc --pack-json` gera `GBAStudioAssetPackReport` deterministico para pre-flight do exportador/Electron.
- O relatorio mede PNGs reais para BG 4bpp, OBJ spritesheet, affine BG e bitmap modes, alem de aceitar `resources` manuais para assets incrementais.
- Alocacao automatica cobre tiles BG/OBJ, tiles affine, paletas BG/OBJ, OAM sprites e bytes PCM, com suporte a `placement.start` e `placement.alignment`.
- Overflows retornam exit code diferente de zero e ainda gravam JSON com `ok: false` e mensagens acionaveis.
- `assetc-test` valida relatorio valido e falha esperada de overflow.

## 0.68.0

- Asset Pipeline Affine BG v1: `assetc --affine-tilemap` gera `AffineTileAsset` e `AffineTileMapAsset` 8bpp para BG2/BG3.
- API publica adiciona validação de tiles/mapas affine e helpers de tamanho `16x16`, `32x32`, `64x64` e `128x128`.
- Runtime adiciona `load_affine_tiles` e `load_affine_tilemap`, com carga linear de mapas affine em screenblocks GBA.
- Corrige o controle de modo de video no hardware para aceitar tambem modos 3/4/5.
- `assetc-test` compila header affine gerado pelo pipeline.

## 0.67.0

- Asset Pipeline Bitmap v1: `assetc --bitmap-mode 3|4|5` gera assets prontos para os modos bitmap do runtime.
- Mode 3/5 geram `Bitmap16Asset` com pixels RGB15; mode 4 gera `Bitmap8Asset` indexed mais `PaletteAsset`.
- O leitor PNG agora aceita limites de cor diferentes por modo: 16 cores para tiles/sprites, ate 256 para mode 4 e mais cores para mode 3/5.
- `assetc-test` compila headers gerados para bitmap modes 3, 4 e 5.

## 0.66.0

- Compression v2: adiciona `Lz77Asset`, `Lz77TileMapAsset` e decoder LZ77 estilo GBA `0x10` sem heap.
- Render aceita `load_tilemap(BackgroundLayer, Lz77TileMapAsset)` e converte bytes little-endian para tilemap 16-bit antes de carregar em VRAM.
- `assetc --lz77-tilemap` gera tilemaps comprimidos em LZ77 junto dos assets normais.
- Host tests cobrem decode LZ77, referencias invalidas, validação de tilemap LZ77 e compilacao do header gerado pelo asset pipeline.

## 0.65.0

- Resource Managers v2: pools estaticos agora podem liberar ranges reservados com validacao defensiva.
- API publica adiciona helpers `reserve_next_*`, `reserve_tile_asset`, `reserve_palette_asset` e `release_*` para tiles, paletas e OAM.
- Reservas por asset seguem `destination_tile`/`start_index`, preparando multiplos tilesets/palette banks sem heap obrigatorio.
- Host tests cobrem liberacao, rejeicao de ranges invalidos, reservas automaticas alinhadas e reservas por asset.

## 0.64.0

- Bitmap Modes v1: `DisplayMode` agora cobre modos 3/4/5 alem dos modos text/affine.
- API publica adiciona `Bitmap16Asset`, `Bitmap8Asset`, `load_bitmap16`, `load_bitmap8`, `fill_bitmap16` e `set_display_frame_page`.
- Hardware carrega bitmaps 16-bit em mode 3/5, bitmaps indexed 8-bit em mode 4 e controla page flip pelos bits de `DISPCNT`.
- Host tests cobrem dimensoes maximas, paginas validas e compatibilidade de assets por modo.

## 0.63.0

- Render Affine BG v1: API publica adiciona `DisplayMode`, `set_display_mode` e `set_affine_bg_transform`.
- Affine backgrounds sao limitados corretamente a BG2/BG3 por `is_valid_affine_background_layer`.
- Hardware escreve modo 0/1/2 em `DISPCNT` preservando enables existentes e configura matriz/ref point affine nos registradores de BG2/BG3.
- Engine Pack declara capacidades `display_mode_control` e `affine_bg_transform`.

## 0.62.0

- Render Window v2: API publica adiciona `set_window1`, `disable_window1`, `set_obj_window_masks` e `disable_obj_window`.
- Sprites agora aceitam `SpriteRenderMode::Window` para gerar OBJ window via OAM, alem de `Normal` e `Alpha`.
- Hardware escreve `WIN1H/WIN1V`, bytes corretos de `WININ/WINOUT` e bits de enable de WIN1/OBJWIN em `DISPCNT`.
- Engine Pack declara capacidades `window1`, `obj_window` e `obj_window_sprite_mode`.

## 0.61.0

- API publica de render adiciona prioridade `0..3` em `Sprite` e validação `is_valid_render_priority`.
- Runtime expõe `set_bg_priority(BackgroundLayer, uint8_t)` para controlar prioridade de BG0-BG3.
- OAM agora grava prioridade de OBJ nos bits corretos de attr2, preservando prioridade default `0`.
- Hardware core atualiza os bits de prioridade de `BGxCNT` sem alterar screenblock/map size existentes.
- Host tests cobrem prioridades validas e invalidas.

## 0.60.0

- API publica de render adiciona `BlendConfig`, `MosaicConfig` e `WindowConfig` para efeitos nativos do GBA.
- Runtime expõe `set_blending`, `disable_blending`, `set_mosaic`, `disable_mosaic`, `set_window0` e `disable_window0`.
- Hardware core configura `BLDCNT`, `BLDALPHA`, `BLDY`, `MOSAIC`, `WIN0H`, `WIN0V`, `WININ` e `WINOUT` sem depender de Butano/libgba.
- `render_init`/hardware init mantém blending, mosaic e window desativados por padrão para preservar o visual atual.
- Host tests cobrem validação de masks, blend factors, mosaic sizes e retângulo/window config.

## 0.59.0

- Conversor `tracker[].mod` agora reconhece `Bxx` pattern jump e `Dxx` pattern break.
- Conversor `tracker[].s3m` agora reconhece `Bxx` pattern jump e `Cxx` pattern break.
- `assetc` resolve uma order table efetiva para `TrackerAsset`, evitando depender de controle de fluxo no runtime GBA.
- Patterns com break/jump sao truncados no row de controle para evitar tocar cauda indevida.
- Fixtures MOD/S3M cobrem salto que pula um pattern e break que encerra o pattern atual.

## 0.58.0

- Conversor `tracker[].mod` agora expande efeito `7xy` tremolo em micro-steps de volume aproximados.
- Conversor `tracker[].s3m` agora expande comando `Rxy` tremolo em micro-steps de volume aproximados.
- Fixtures MOD/S3M passam a ter terceiro pattern dedicado a tremolo, preservando vibrato e portamento.
- Host asset test valida os volumes alto/baixo emitidos pelo tremolo convertido.
- `enginepack.json` declara `assetc_mod_effect_7_tremolo` e `assetc_s3m_effect_r_tremolo`.

## 0.57.0

- Conversor `tracker[].mod` agora expande efeito `4xy` vibrato em micro-steps de frequencia aproximados.
- Conversor `tracker[].s3m` agora expande comando `Hxy` vibrato em micro-steps de frequencia aproximados.
- Fixtures MOD/S3M passam a ter segundo pattern dedicado a vibrato, preservando a cobertura de portamento anterior.
- Host asset test valida os steps de frequencia baixa/alta emitidos pelo vibrato convertido.
- `enginepack.json` declara `assetc_mod_effect_4_vibrato` e `assetc_s3m_effect_h_vibrato`.

## 0.56.0

- Conversor `tracker[].mod` agora expande efeito `3xx` tone portamento em micro-steps aproximados.
- Conversor `tracker[].s3m` agora expande efeito `Gxx` tone portamento em micro-steps aproximados.
- Parser mantém a última frequência por canal para interpolar até a nota alvo.
- Fixtures MOD/S3M cobrem portamento e asserem início/meio/fim da curva gerada.
- `enginepack.json` declara `assetc_mod_effect_3_portamento` e `assetc_s3m_effect_g_portamento`.

## 0.55.0

- Conversor `tracker[].mod` agora trata `Fxx > 32` como BPM/tempo e ajusta a duracao de linhas por speed atual.
- Conversor `tracker[].s3m` agora trata comando `Txx` como BPM/tempo e combina com speed `Axx`.
- Fixture MOD cobre `F06` seguido de `F75`, provando duracao final mais longa por BPM reduzido.
- Fixture S3M cobre `A02` seguido de `T75`, provando duracao final derivada de speed + tempo.
- `enginepack.json` declara `assetc_mod_effect_f_tempo` e `assetc_s3m_effect_t_tempo`.

## 0.54.0

- Conversor `tracker[].mod` passa a aplicar finetune do sample MOD na frequencia das notas convertidas.
- Conversor `tracker[].s3m` usa volume padrao do instrumento S3M quando a nota nao traz volume column.
- Fixture MOD de host cobre finetune positivo e assercoes de frequencia ajustada.
- Fixture S3M de host cobre nota sem volume column usando volume de instrumento.
- `enginepack.json` declara `assetc_mod_sample_finetune` e `assetc_s3m_instrument_volume`.

## 0.53.0

- `PcmAsset` agora aceita `loop_start_sample` e `loop_end_sample` opcionais, preservando inicializadores antigos.
- Mixer PCM respeita loops parciais: toca a intro uma vez e repete apenas o intervalo configurado.
- `assetc --audio-json` extrai loop points de samples MOD ProTracker e instrumentos S3M quando presentes.
- JSON PCM manual/WAV tambem pode declarar `loop_start_sample` e `loop_end_sample`.
- Host tests cobrem validacao de loop parcial, playback PCM com loop parcial e headers gerados a partir de fixtures MOD/S3M com loops reais.

## 0.52.0

- Conversor `tracker[].vgm` aceita e ignora com seguranca o comando Game Gear stereo `0x4F`.
- Data blocks VGM `0x67 0x66` sao validados e pulados, evitando abortar em VGMs SN76489 com blocos auxiliares.
- Fixture VGM de host passa a incluir stereo byte e data block sem alterar os steps PSG esperados.
- `enginepack.json` declara `assetc_vgm_gg_stereo_skip` e `assetc_vgm_data_block_skip`.
- Data blocks continuam nao sendo reproduzidos como DAC/PCM; chips YM/AY e comandos avancados seguem fora do subset atual.

## 0.51.0

- Conversor `tracker[].vgm` agora emite steps quando writes SN76489 mudam volume de um tone ativo.
- Canal noise SN76489 passa a ser convertido para `TrackerStep` no canal 3, usando a API de noise PSG existente do runtime.
- Fixture VGM de host cobre tone, volume change, waits e noise no mesmo arquivo binario minimo.
- `enginepack.json` declara `assetc_vgm_volume_changes` e `assetc_vgm_sn76489_noise`.
- VGM com chips YM/AY, DAC/PCM e comandos avancados continua fora do subset atual.

## 0.50.0

- Conversor `tracker[].s3m` agora aplica `Dxy` como volume slide simples no `TrackerAsset`.
- Comandos S3M `Exx` e `Fxx` sao convertidos em slides aproximados por steps de frequencia descendente/ascendente.
- Fixture S3M de host cobre `Axx`, `Dxy`, `Exx` e `Fxx`, mantendo tambem samples 8-bit mono e 16-bit stereo para PCM.
- `enginepack.json` declara `assetc_s3m_effect_d_volume_slide`, `assetc_s3m_effect_e_slide_down` e `assetc_s3m_effect_f_slide_up`.
- Playback fiel tick-a-tick, vibrato/tremor e sample playback sincronizado ao tracker ainda ficam para etapas futuras.

## 0.49.0

- Conversor `tracker[].mod` agora expande efeito MOD `0xy` em arpeggio por micro-steps no `TrackerAsset`.
- Efeitos MOD `1xx` e `2xx` sao convertidos em slides aproximados por steps de frequencia ascendente/descendente.
- Efeito MOD `Axy` aplica volume slide simples ao step gerado.
- Host asset test cobre arpeggio, slide up, slide down e volume slide em MOD binario minimo, com assercoes C++ legiveis em `tests/host/assetc_audio_compile.cpp`.
- Playback fiel tick-a-tick, porta-to-note, vibrato e efeitos finos ainda ficam para conversores/player futuros.

## 0.48.0

- `assetc --audio-json` agora converte samples S3M 16-bit e stereo para `PcmAsset` 8-bit assinado.
- Samples S3M stereo sao downmixados para mono por media dos canais antes da emissao do header C++.
- Fixture S3M de host passa a conter dois instrumentos: 8-bit mono e 16-bit stereo, ambos importados por `pcm[].s3m_sample`.
- Engine Pack declara as capacidades `assetc_s3m_sample_16bit` e `assetc_s3m_sample_stereo_downmix`.
- Samples S3M comprimidos, resampling por nota e playback sincronizado de samples no tracker ainda ficam para etapa futura.

## 0.47.0

- `assetc --audio-json` aceita `pcm[].s3m_sample` para extrair samples PCM 8-bit mono nao comprimidos de S3M.
- Campo `instrument_index` seleciona o instrumento S3M de 1 a N; `sample_rate_hz` opcional pode sobrescrever o C2 speed do instrumento.
- Leitor S3M comum valida header, order table, instrument parapointers e pattern parapointers.
- Host asset test gera S3M com instrumento/sample real, importa como `PcmAsset` e valida bytes assinados no header C++.
- Playback sincronizado de samples no tracker, samples S3M 16-bit/stereo/comprimidos e resampling por nota ainda ficam para etapa futura.

## 0.46.0

- `assetc --audio-json` aceita `pcm[].mod_sample` para extrair samples PCM 8-bit assinados de MOD ProTracker.
- Campo `sample_index` seleciona o sample MOD de 1 a 31; `sample_rate_hz` continua opcional e padrao passa a ser 8363 Hz para esse caminho.
- Leitor MOD comum valida header, order table, pattern data e offsets de sample antes de emitir `PcmAsset`.
- Host asset test gera MOD com sample real, importa como `PcmAsset` e valida bytes assinados no header C++.
- Playback de samples sincronizado ao tracker, instrumentos S3M e resampling por nota ainda ficam para etapa futura.

## 0.45.0

- `assetc --audio-json` aceita `tracker[].vgm` para importar VGM subset como `TrackerAsset`.
- Parser VGM v1 le header, clock SN76489, writes PSG `0x50`, waits `0x61/0x62/0x63/0x7n` e end `0x66`.
- Tons SN76489 sao convertidos para steps PSG com volume e duracao em frames.
- Host asset test gera um VGM binario minimo e valida o header C++ resultante.
- Chips YM/AY, DAC/PCM, data blocks e comandos VGM avancados ainda ficam para conversores futuros.

## 0.44.0

- `assetc --audio-json` aceita `tracker[].s3m` para importar S3M subset como `TrackerAsset`.
- Parser S3M v1 le assinatura `SCRM`, order table, pattern parapointers e pattern data compactado.
- Notas S3M, volume column e comando `Axx` de speed sao convertidos para steps PSG.
- Host asset test gera um S3M binario minimo e valida o header C++ resultante.
- Samples PCM reais de S3M, instrumentos, efeitos avancados e VGM ainda ficam para conversores futuros.

## 0.43.0

- Import MOD passa a ler volume dos sample headers e aplicar esse valor como volume PSG padrao da nota.
- Efeito MOD `Cxx` e convertido para volume por nota no `TrackerAsset`.
- Efeito MOD `Fxx` com `xx <= 32` ajusta a duracao base das linhas seguintes no conversor.
- Host asset test cobre sample volume, `Cxx` e `Fxx` em MOD binario minimo.
- Samples PCM reais de MOD, arpeggio, slides e efeitos avancados ainda ficam para conversores futuros.

## 0.42.0

- `assetc --audio-json` aceita `tracker[].mod` para importar MOD ProTracker 4 canais como `TrackerAsset`.
- Parser MOD v1 le header, assinatura, order table e patterns de 64 rows.
- Periodos de nota MOD sao convertidos para frequencia PSG e emitidos em patterns/order do tracker intermediario.
- `tracker[].row_duration_frames`, `volume` e `duty` controlam a conversao inicial.
- Host asset tests geram um MOD binario minimo e validam o header C++ resultante.
- Efeitos MOD, samples PCM do modulo, S3M e VGM ainda ficam para conversores futuros.

## 0.41.0

- API publica adiciona `TrackerStep`, `TrackerPattern`, `TrackerAsset` e `play_tracker_music`.
- Runtime PSG toca tracker v1 por patterns + order table, com canais square 1/2 e noise.
- `assetc --audio-json` gera `TrackerAsset` a partir de `tracker[]`, `patterns[]`, `steps[]` e `order[]`.
- `TopDownProjectData` passa a aceitar tabela opcional de `tracker_assets` para exportadores futuros.
- Host tests cobrem validacao, loop por order/pattern, canal noise, fim sem loop e troca entre musica simples e tracker.
- Engine Pack declara capacidades `audio-json-tracker`, `psg_tracker_pattern_order` e `assetc_tracker_json`.

## 0.40.0

- Mixer PCM passa a usar streaming por blocos: o hardware inicia Direct Sound/FIFO A uma vez e recebe blocos sucessivos sem reinicializar timer/FIFO a cada frame.
- Camada privada de hardware adiciona `start_pcm8_stream`, `submit_pcm8_stream_block` e `stop_pcm8_stream`.
- API publica adiciona `audio_is_pcm_streaming` e `audio_pcm_submitted_block_count` para diagnostico e testes.
- Host tests cobrem stream aberto uma vez, submissao de blocos por frame e parada segura quando SFX/musica acabam.
- Engine Pack declara capacidades `pcm_block_streaming` e `pcm_stream_status`.

## 0.39.0

- Runtime PCM agora usa mixer Direct Sound em software com taxa fixa de 16384 Hz.
- Ate 4 SFX PCM podem tocar simultaneamente junto com uma trilha PCM de musica.
- `play_pcm_sfx` aceita prioridade e volume; quando o mixer esta cheio, SFX de menor prioridade pode ser rejeitado ou substituido.
- `play_pcm_music` aceita volume e passa a ser mixado com SFX, em vez de ser interrompido por eles.
- API publica adiciona contagem/capacidade do mixer e `stop_all_pcm_sfx`.
- Host tests cobrem mixer multi-voz, saturacao, prioridade, volume e musica+SFX mixados.

## 0.38.0

- `assetc --audio-json` importa WAV PCM mono/stereo 8/16-bit via campo `pcm[].wav`.
- WAVs sao convertidos para `PcmAsset` 8-bit assinado, com downmix stereo para mono.
- `pcm[].sample_rate_hz` pode resamplear o WAV para uma taxa aceita pela engine.
- Host asset tests geram WAVs reais e validam o header C++ resultante.
- Engine Pack declara capacidades `wav-pcm-import` e `assetc_wav_pcm_import`.

## 0.37.0

- `gbs/audio.hpp` adiciona `PcmAsset`, validacao de sample rate e APIs `play_pcm_sfx`/`play_pcm_music`.
- Runtime de audio toca PCM 8-bit assinado por Direct Sound/FIFO A via DMA/timer no GBA.
- Musica PCM em loop pode ser retomada apos SFX PCM curto no mesmo canal Direct Sound.
- `assetc --audio-json` gera `PcmAsset` a partir de arrays `pcm[].samples`.
- `TopDownProjectData` passa a aceitar tabela opcional de `pcm_assets` para exportadores futuros.
- Engine Pack declara capacidades `direct_sound_pcm8`, `pcm_sfx`, `pcm_music_loop` e `audio-json-pcm8`.
- MOD/S3M/VGM/WAV importado completo e mixer multi-canal PCM ainda ficam para etapa futura.

## 0.36.0

- API publica adiciona `consume_actor_event_commands` para aplicar e limpar a fila de comandos de ator em uma chamada.
- `reset_event_actor_commands` fica disponivel em header para consumidores que validam contrato sem linkar o runtime completo.
- Template top-down usa o helper de consumo em lote para comandos de NPC/ator.
- Engine Pack declara capacidade `actor_command_batch_apply` e o fixture exportado passa a exigir `>=0.36.0`.
- Host tests cobrem consumo em lote, indices invalidos e saturacao segura da fila de comandos de ator.

## 0.35.0

- `gbsdoctor` valida `requires.engine_pack` e `requires.features` declarados em `gbastudio_project.json`.
- Capacidades de `enginepack.json` agora sao normalizadas para checks por categoria e por item, como `dialogue` e `tilemap-slope-flags`.
- Fixture exportado passa a declarar requisito minimo de Engine Pack e suporte a slopes de tilemap.
- CLIs `assetc`, `gbsbuild` e `gbsdoctor` reportam versao `0.35.0`.
- `make gbsdoctor-test` cobre projeto suportado e rejeicao de feature ausente antes do build.

## 0.34.0

- `assetc` adiciona `--slope-color-indexes a,b,c,d` para gerar `TileSlope` por tile.
- Headers gerados incluem `*_slope_tiles` e `*_collision_map` apontando para a tabela de slopes.
- Quando slopes sao gerados sem `--collision-color-index`, o pipeline cria flags vazias compativeis com `TileMap`.
- Host asset tests cobrem header de slopes e compilacao externa do resultado.

## 0.33.0

- `TileMap` aceita uma tabela opcional de `TileSlope` para colisao diagonal por tile.
- API publica adiciona `TileSlope`, `tile_slope_at` e `tile_slope_blocks_pixel`.
- `rect_hits_blocking_tile` e `update_player` passam a respeitar metade solida em slopes diagonais.
- `TopDownRoomData` pode apontar para `slope_tiles` sem quebrar mapas antigos baseados so em flags.

## 0.32.0

- `TopDownRoomData` adiciona `name` opcional para lookup estavel de rooms exportadas.
- `TopDownNamedScriptData` e `TopDownProjectData::named_scripts` adicionam scripts resolviveis por nome.
- Helpers publicos resolvem room, NPC e script por nome sem heap e com fallback defensivo.
- `topdown_basic` corrige contagens de scripts/dialogos e passa a declarar nomes de rooms e scripts.

## 0.31.0

- `DialogueChoice` adiciona `script_index` opcional para executar consequencias por opcao escolhida.
- `DialogueState` passa a expor `last_choice_index` e `last_choice_script` apos confirmacao.
- `topdown_basic` enfileira o script da escolha confirmada e demonstra quatro respostas diferentes.
- Host tests cobrem output de script opcional em escolhas sem quebrar choices antigas.

## 0.30.0

- Choices de dialogo agora navegam por todas as opcoes do grupo, nao apenas pelas visiveis na caixa.
- A caixa mantem prompt + duas opcoes visiveis e rola a janela conforme a selecao.
- `topdown_basic` passa a expor quatro opcoes para validar choices maiores no runtime.
- Host tests cobrem selecao de opcao fora da janela inicial.

## 0.29.0

- `EventRunner` adiciona `stop_event_runner` para cancelar execucao ativa.
- `EventScriptQueue` adiciona `enqueue_event_script_front` para prioridade simples.
- Fila de scripts adiciona `clear_event_script_queue` para descartar eventos pendentes sem heap.
- Host tests cobrem prioridade, limpeza da fila e cancelamento de runner ativo.

## 0.28.0

- `gbs/event.hpp` adiciona fila fixa `EventScriptQueue` para scripts encadeados sem heap.
- `topdown_basic` passa a enfileirar scripts e executa-los pelo `EventRunner` progressivo.
- `Wait` agora pausa comandos seguintes no runtime jogavel, preservando a ordem `on_exit -> portal -> on_enter`.
- Host tests cobrem ordem, flags e capacidade da fila de scripts.

## 0.27.0

- `gbs/event.hpp` adiciona `EventRunner` para execucao progressiva de bytecode frame-a-frame.
- `update_event_runner` pausa em `Wait` e retoma comandos seguintes em chamadas posteriores.
- `run_event_script` permanece como execucao instantanea para compatibilidade com scripts e testes existentes.
- Host tests cobrem pausa/retomada de `Wait` e branches com o runner progressivo.

## 0.26.0

- `TopDownRoomData` adiciona eventos opcionais por efeito de tile, com mascara, enter/leave, run-once e cooldown.
- Helpers `update_tile_effect_state` e `tile_effect_event_script_for_result` conectam flags ativas a scripts data-driven.
- `topdown_basic` executa dialogo/SFX ao entrar em areas de agua, dano e escada.
- Host tests cobrem estado de eventos de efeito com enter, leave, cooldown e run-once.

## 0.25.0

- API publica de colisao adiciona `tile_flags_in_rect`, `tile_effects_in_rect` e `tile_effects_for_actor`.
- `tile_flags_at` agora trata mapas nulos ou fora dos limites como solidos de forma defensiva.
- `topdown_basic` inclui areas de agua, dano e escada que mudam a cor de fundo quando o player pisa nelas.
- Host tests cobrem coleta de multiplos efeitos sob o ator e lookup defensivo de tiles.

## 0.24.0

- Colisao top-down adiciona flags direcionais: topo, fundo, esquerda e direita.
- Movimento do player passa a avaliar bloqueio por eixo usando a direcao real de deslocamento.
- Flags de efeito `water`, `damage` e `ladder` foram reservadas e podem ser consultadas sem bloquear movimento por padrao.
- API publica adiciona `rect_hits_blocking_tile`, `tile_flags_at`, `tile_flags_block_movement` e `tile_flags_have_effect`.
- Host tests cobrem colisao direcional vertical/horizontal e flags de efeito.

## 0.23.0

- `gbs/dialogue.hpp` adiciona `DialogueChoice` e `show_dialogue_choices` para escolhas visuais simples sem heap.
- Caixa de dialogo suporta prompt com ate duas opcoes visiveis, navegacao por direcional e confirmacao/cancelamento por botao.
- Bytecode adiciona `ShowChoice` e `TopDownProjectData` aceita `TopDownDialogueChoiceData` com variavel de destino.
- `topdown_basic` abre uma escolha na interacao da primeira room e grava o resultado em variavel.
- Host tests cobrem selecao/cancelamento de escolhas, output `ShowChoice` e validacao de choice groups no projeto.

## 0.22.0

- Eventos agora enfileiram comandos de ator: visibilidade, ativo/inativo, posicao absoluta, movimento relativo, direcao, velocidade e indice de animacao.
- `TopDownActorRuntime` adiciona estado mutavel para NPCs/atores em runtime sem alterar dados estaticos do projeto.
- `topdown_basic` renderiza/interage com NPCs via runtime mutavel, incluindo um NPC que se move por evento.
- Bytecode adiciona `CallScript` e `TopDownProjectData` aceita tabela estatica de scripts reutilizaveis.
- Host tests cobrem fila de comandos de ator, aplicacao no runtime, lookup de interacao mutavel e validacao de scripts do projeto.

## 0.21.0

- `TopDownRoomMetadata` agora aceita bounds de camera em pixels e `update_camera` respeita esses limites em modo follow/fixed.
- `TopDownNpcData` e `TopDownActorData` preservam nome, direcao, collision group, presets normalizados de velocidade/animacao e scripts por slot.
- Adicionado contrato de `TopDownTriggerData` com enter/leave, run-once, cooldown, condicao reservada e tipos standard/water/damage.
- Bytecode de eventos aceita `play_music`, `stop_music`, `close_dialogue`, `wait`, `set_camera_position`, `follow_camera` e `lock_camera`.
- `topdown_basic` executa um trigger enter real e consome novas saidas de evento sem depender do GBA Studio.
- Host tests cobrem triggers, bounds de camera, metadata ampliada de ator e novos outputs de evento.

## 0.20.0

- `gbsdoctor` valida semanticamente `gbastudio_project.json` quando presente.
- Diagnostico cobre backend `gbastudio_engine`, `entry`, `project_data` e assets gerados listados no manifesto.
- `make gbsdoctor-test` e `make verify-export-fixture` validam os novos checks de manifesto.
- Engine Pack declara capacidade `project_manifest_validation`.

## 0.19.0

- Engine Pack inclui template `templates/exported_topdown` com manifesto `gbastudio_project.json` para simular a saida futura do GBA Studio.
- Novo alvo `make verify-export-fixture` compila o fixture exportado usando somente `dist/GBAStudioEnginePack`, `gbsdoctor` e `gbsbuild`.
- `gbsdoctor --json` reporta `project_manifest` quando um projeto exportado inclui `gbastudio_project.json`.
- Manifest do pacote declara o fixture exportado e a capacidade de diagnostico `project_manifest`.

## 0.18.0

- `gbsdoctor --json` inclui bloco de plataforma, versao do Python, separadores de path e variaveis relevantes do ambiente.
- Diagnostico de ferramentas agora aceita candidatos sem extensao e `.exe`, melhorando compatibilidade com Windows/MSYS2.
- Checks de toolchain reportam lista de candidatos avaliados para `gbafix` e `arm-none-eabi-*`.
- Host test do `gbsdoctor` valida os novos campos JSON.

## 0.17.0

- Hardware Core v2 inicial instala dispatcher de IRQ em `0x03007FFC` e usa `IE/IF/IME` para VBlank/timer/keypad.
- `enable_interrupt`/`disable_interrupt` agora sincronizam a mascara publica com os bits reais de hardware.
- `wait_vblank` mantem fallback de callback quando IRQ real de VBlank nao esta habilitada, preservando compatibilidade.
- Host tests cobrem mapeamento de bits reais e dispatch por mascara de hardware.

## 0.16.0

- API publica `gbs/resource_manager.hpp` com pools estaticos para tiles BG/OBJ, paletas e sprites OAM.
- Reservas podem ser feitas por range fixo ou proximo range alinhado, com falha segura em overlap/overflow.
- `topdown_basic` reserva recursos usados por assets e OAM antes de carregar VRAM/paletas.
- Host tests cobrem reserva, alinhamento, reset, overflow e defaults do manager.

## 0.15.0

- `assetc --audio-json` gera headers C++ com `SfxAsset` e `MusicAsset` PSG a partir de JSON pequeno.
- Valida frequencia, duracao, volume e duty antes de gerar assets.
- `make assetc-test` compila e valida assets de SFX/musica gerados.
- Engine Pack declara suporte `audio-json-psg` para exportadores desktop futuros.

## 0.14.0

- `assetc` adiciona `--collision-color-index` para gerar flags de colisao por tile a partir de PNG.
- Headers de tilemap podem exportar `*_collision_flags` e `gbs::TileMap *_collision_map` prontos para `TopDownRoomData`.
- `make assetc-test` compila e valida o header de colisao gerado.
- Engine Pack declara o formato `tilemap-collision-flags` para exportadores futuros.

## 0.13.0

- `TopDownRoomData` agora inclui metadata opcional por room: modo/posicao de camera, player start, musica e cor de fundo.
- Helpers publicos aplicam fallback para dados simples e validam musica por indice.
- `topdown_basic` aplica metadata no boot e em warps, incluindo camera fixa na segunda room e backdrop por room.
- Host tests cobrem camera, player start, musica e backdrop vindos da metadata.

## 0.12.0

- Eventos v2 adicionam `clear_variable`, `add_variable`, `jump`, branches por variavel igual/diferente, branch por flag setada e `show_dialogue_if`.
- Interpretador de bytecode agora usa contador de programa com limite defensivo de passos para evitar loops acidentais.
- `topdown_basic` usa comandos v2 em hotspots/NPCs sem quebrar scripts antigos.
- Host tests cobrem variaveis, dialogo condicional e branches.

## 0.11.0

- `TopDownRoomData` aceita NPCs/atores estaticos por room com metasprite, animacao opcional e script de interacao.
- Novo helper publico `npc_event_script_for` prioriza scripts de NPC quando o player intersecta o ator.
- `topdown_basic` renderiza um NPC animado por room e executa `set_variable`, `play_sfx` e `show_dialogue` ao interagir com A.
- Host tests cobrem conversao de NPC para actor e lookup de script por interacao.

## 0.10.0

- `TopDownRoomData` aceita hotspots retangulares de interacao por room.
- Novo helper publico `interaction_event_script_for` encontra o script de hotspot intersectando o player.
- `topdown_basic` usa hotspots em ambas as rooms e mantem `on_interact` como fallback.
- Host tests cobrem lookup de interacao por area.

## 0.9.0

- Dialogo visual v2 com paginacao automatica por linhas e wrap de texto.
- `DialogueState` acompanha pagina atual, ponteiro do texto visivel e existencia de proxima pagina.
- `advance_dialogue` agora avanca paginas antes de fechar textos longos, preservando o comportamento de textos curtos.
- `topdown_basic` inclui um texto inicial com multiplas paginas para smoke manual.

## 0.8.0

- `assetc --rle-tilemap` gera `Rle16TileMapAsset` junto com o `TileMapAsset` normal.
- Headers gerados mantem compatibilidade e so incluem `gbs/compression.hpp` quando RLE e solicitado.
- Host smoke do `assetc` compila e valida o header RLE gerado.
- Engine Pack declara formato `tilemap-rle16` para exportadores desktop futuros.

## 0.7.0

- API publica `gbs/compression.hpp` com RLE 16-bit e decode defensivo sem heap.
- `load_tilemap` aceita `Rle16TileMapAsset` e descomprime para buffer estatico antes de carregar VRAM.
- Parallax runtime por background com fatores 8.8 em `gbs/render.hpp`.
- `topdown_basic` usa BG1 comprimido por RLE e parallax seguindo a camera.
- Host tests cobrem validacao/decode RLE e calculo de parallax.

## 0.6.0

- `topdown_basic` agora possui duas rooms reais com visual, colisao e portais separados.
- Warp por evento recarrega `Room` a partir de `TopDownProjectData` e dispara evento de entrada da room destino.
- Host tests cobrem troca de room por portal ida/volta.
- Engine Pack declara suporte inicial a room streaming data-driven.

## 0.5.0

- `assetc` gera spritesheets 16x16 e 16x32 com metasprites e `SpriteAnimation`.
- API publica de animacao de sprites com `gbs/animation.hpp`.
- `topdown_basic` usa player gerado pelo pipeline de sprites em vez de blobs manuais.
- Engine Pack inclui o asset de player gerado no template top-down.

## 0.4.0

- API publica `gbs/audio.hpp` com SFX PSG e musica simples por steps.
- Runtime de audio para square channels e noise channel do GBA.
- `topdown_basic` toca musica em loop e executa `play_sfx` real pelo evento de portal.
- Engine Pack declara capacidades de audio PSG no `enginepack.json`.

## 0.3.0

- Dialogo visual v1 com caixa de texto em BG0 e fonte tiled simples.
- Eventos top-down ligados a entrada de room, saida de room, portal e interacao.
- `gbastudio_project_data.hpp` agora aceita scripts por room/portal e tabela de textos.
- `show_dialogue`, `warp`, `set_variable` e `play_sfx` stub afetam o runtime do exemplo.

## 0.2.0

- Engine Pack consolidado com manifest `enginepack.json`.
- CLIs `assetc`, `gbsbuild` e `gbsdoctor` alinhadas na versao `0.2.0`.
- Smoke unificado de pacote via `make verify-package`.
- Contrato inicial para projeto top-down data-driven em C++.

## 0.1.0-dev

- Baseline proprietaria sem Butano.
- Hardware Core v1, Render 2D v2, tilemaps ate `64x64` e Engine Pack inicial.
