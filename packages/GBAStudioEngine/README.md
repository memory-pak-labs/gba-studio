# GBAStudio Engine

Runtime em C/C++ sob licença MIT para jogos de Game Boy Advance gerados pelo GBA Studio.

## Estado atual

- Pacote versionado dentro do monorepo GBA Studio, com fronteira logica, versao, changelog, testes e Engine Pack proprios.
- Sem dependencia de Butano.
- Sem dependencia de libgba no codigo da engine.
- Toolchain alvo inicial: devkitARM.
- Engine Pack preparado para consumo futuro por app Electron em macOS, Windows e Linux.
- SDK multi-template independente com catalogo oficial de templates top-down, plataforma, isometrico, Point-and-click v5, Shoot-em-up v4, Visual Novel v5, Menu/UI v4, Cutscene v4 e World Map v4 em `enginepack.json`.
- Primeiro marco: `examples/topdown_basic`.
- Engine Pack v2.25.0 com `FrameContext`, snapshot unico de input, telemetria real de CPU/VBlank, politica de frame skip, affine OBJ, HDMA/HBlank, paletas dinamicas, atualizacoes parciais de bitmap, leases de recursos sem heap e onze ROMs de stress cobrindo runtimes especializados e contencao de hardware, alem dos contratos de runtime, streaming e diagnosticos anteriores.
- Hardware Core v4 inicial: DMA 16/32-bit imediato, fila DMA de VBlank com flush automatico, stats com pico/reset, timers basicos, IRQ real via `IE/IF/IME`, espera `VBlankIntrWait`, OAM shadow com dirty range e consumidor publico de IRQ de keypad.
- Debug/Profile Core v2: asserts leves, budget de frame, counters nomeados, picos de uso e overlay visual opt-in sem heap.
- Render 2D Assets v22: paletas, tiles deduplicados, bitmaps mode 3/4/5, tilemaps affine 8bpp, tilemaps BG0-BG3 ate 64x64, tilemap RLE/LZ77/Huffman opcional, collision/slope maps, spritesheets logicas alinhadas de 8x8 a 128x128 com decomposicao minima nos 12 formatos OBJ nativos, OBJ 4bpp/8bpp com stride fisico validado, relatorio global de packing/overflow com budgets, resumo de budget, diagnosticos estruturados, fingerprints, status incremental, plano de rebuild, plano de exportacao, plano de bancos de recurso agrupado por room/grupo, motivo de mudanca, ids unicos, uso por bancos, estimativa constexpr `RenderAssetCost`, animacoes simples, export de projeto externo por JSON e referencias semanticas por ID do `asset_pack`, incluindo arrays de audio SFX/musica/PCM/tracker.
- Render Runtime v13: parallax por background, affine BG2/BG3 com carga de tiles/mapas 8bpp, modos bitmap 3/4/5, prioridades BG/OBJ, tilemaps comprimidos em RLE 16-bit, LZ77 ou Huffman com decode estatico e fallback host, blending, mosaic com enable por BG/OBJ, window0/window1, OBJ window e aplicacao temporal de transformacoes affine por keyframes.
- Math Core v2: `Fixed` Q8.8 saturado sem float/libm, seno/cosseno por LUT, `atan2`, raiz quadrada inteira, construcao de matrizes affine com angulos na unidade nativa de 16 bits do GBA e amostragem de matrizes/anchors por keyframes com easing.
- BIOS/SWI Core v3: wrappers publicos para `Div`, `DivArm`, `Sqrt`, `IntrWait`, `VBlankIntrWait`, `BiosChecksum`, `SoundBiasChange`, `CpuSet`, `CpuFastSet`, `BitUnPack`, `LZ77UnCompWRAM/VRAM`, `HuffUnComp`, `RLUnComp` e `Diff8/16bitUnFilter`, com validacao de limites e fallback host testavel; os assets LZ77/Huffman emitidos sao alinhados para consumo seguro no GBA.
- Resource/VRAM Banking v18: reservas estaticas de tiles BG/OBJ, paletas e sprites OAM com deteccao de overflow, liberacao de ranges, reserva por asset, batch transacional de assets, release transacional de batch, snapshots/rollback, bancos fixos/automaticos, bancos derivados automaticamente do `asset_pack`, `ResourceBankGroup` exportado no `ProjectData`, previews nao mutantes de reserva de range/banco/lote, lookup por nome e vinculo opcional de room para streaming por room/grupo, hot-swap transacional de bancos/grupos, cache estatico por prioridade/recencia com eviction, prune preventivo, preview nao mutante de poda e contagem de blocos livres para diagnostico de fragmentacao, fontes de upload geradas pelo `assetc`, prefetch por camera com upload por DMA de VBlank, prefetch por janela de area/metatile, orçamento por chamada para reservas novas/uploads, promocao/hot-swap de grupos prefetched para reserva ativa sem recopia, templates top-down/platformer/isometrico com prefetch periodico orçado e fallback para streaming normal, streaming de grupo com upload automatico via fila DMA de VBlank e `ResourceStreamResult` com diagnostico de banco/pool/fragmentacao sem heap.
- Top-down Runtime v10 data-driven: `main.cpp` consome `gbastudio_project_data.hpp` com rooms, portais, hotspots, triggers, scripts nomeados, NPCs/atores com estado mutavel, movimento de NPC por dados, pathfinding com blockers, colisao ator-ator por listas fixas de bloqueadores com grupos/mascaras e reserva de assets por batch antes do load.
- Platformer Runtime v12: `gbs/platformer.hpp` adiciona `PlatformerProjectData` data-driven, ator com gravidade, corrida, pulo, coyote time, jump buffer, plataformas one-way, escadas, snap de chão em slopes diagonais, estado de animacao derivado (`Idle`/`Run`/`Jump`/`Fall`/`Climb`), colisao por eixo, camera lateral, hazards, checkpoints/respawn, camera zones, inimigos patrulheiros com visual/evento/stomp por dado, plataformas moveis com visual, carry e landing snap por dado, scripts de sala/hazard/checkpoint/zona/enemy, troca de room por `EventOp::Warp` e autosave SRAM por `PlatformerSaveData`; `examples/platformer_basic` compila uma ROM independente do top-down consumindo o objeto `project` e o `save_bank` exportado.
- Isometric Runtime v13: `gbs/isometric.hpp` adiciona `IsometricProjectData` data-driven, grid 2:1, conversao tile/screen, picking por diamond mask, cursor/seleção por tile com ponto inicial por room, interacao de ator pelo cursor, aplicacao publica de comandos de ator, camera follow/clamp, draw list, depth sorting, collision map, actor blockers, path step greedy, BFS limitado e A* limitado para pathfinding, scripts de room/ator/tile, triggers por area de tile, troca de room por `EventOp::Warp` e autosave SRAM por `IsometricSaveData`; `examples/isometric_basic` compila uma ROM independente consumindo o objeto `project` e o `save_bank` exportado.
- Isometric Tactical Core v1: uma room isométrica pode declarar `gameplay_mode: "tactical"` com unidades, equipe, ocupação, alcance, turnos, ataque e HP; o mesmo contrato é consumido pelo Preview, `assetc` e `examples/isometric_basic`, sem IA inimiga, custo de terreno ou habilidades nesta primeira fatia.
- Point-and-click Runtime v4: `gbs/point_click.hpp`, `PointClickProjectData`, `PointClickSaveData`, template `exported_point_click` e `assetc --export-project-json` geram cenas, hotspots, cursor, inventario por variaveis, selecao de item por `B`, hotspots condicionais por item, concessao de item, HUD nativo de cena/item selecionado, dialogo/script por hotspot, transicao pendente apos dialogo, save de progresso por `point_click_project.save`, backgrounds opcionais e `runtime_adapter.native = true` para `point_click_project`.
- Shoot-em-up Runtime v4: `gbs/shmup.hpp`, `ShmupProjectData`, `ShmupSaveData`, template `exported_shmup` e `assetc --export-project-json` geram player, projeteis do player, projeteis inimigos, dano com invulnerabilidade curta, waves encadeadas, score/high score persistido por `shmup_project.save`, HUD nativo com score/high score/vidas/wave, inimigos, dialogo, scripts e backgrounds opcionais com `runtime_adapter.native = true` para `shmup_project`.
- Visual Novel Runtime v4: `gbs/visual_novel.hpp`, `VisualNovelProjectData`, `VisualNovelSaveData`, template `exported_visual_novel` e `assetc --export-project-json` geram cenas, textos, choices condicionais por variavel, `on_select`, destino de cena por escolha, historico simples acessivel por `B`, HUD nativo de cena/historico, save de progresso por `visual_novel_project.save`, scripts de entrada/saida, backgrounds opcionais e `runtime_adapter.native = true` para `visual_novel_project`.
- Menu/UI Runtime v4: `gbs/menu.hpp`, `MenuProjectData`, `MenuSaveData`, template `exported_menu` e `assetc --export-project-json` geram telas, pilha de navegacao, itens selecionaveis, itens condicionais escondidos/bloqueados, toggle/slider por variavel, dialogo, scripts, HUD nativo de tela/item/stack, save de progresso por `menu_project.save`, backgrounds opcionais e `runtime_adapter.native = true` para `menu_project`.
- Cutscene Runtime v4: `gbs/cutscene.hpp`, `CutsceneProjectData`, `CutsceneSaveData`, template `exported_cutscene` e `assetc --export-project-json` geram cenas, passos temporizados, branch condicional por variavel, destino por step, skip controlado, script on-skip, wait por dialogo, scripts, HUD nativo de cena/step/frame, save de progresso por `cutscene_project.save`, backgrounds opcionais e `runtime_adapter.native = true` para `cutscene_project`.
- World Map Runtime v4: `gbs/world_map.hpp`, `WorldMapProjectData`, `WorldMapSaveData`, `WorldMapNodeStatus`, template `exported_world_map` e `assetc --export-project-json` geram nos conectados, navegacao direcional, selecao de fase, nos condicionais por variavel, feedback de bloqueio, nos escondidos ate desbloqueio, HUD nativo de nome/status do no, save de progresso por `world_map_project.save`, dialogo, scripts e backgrounds opcionais com `runtime_adapter.native = true` para `world_map_project`.
- Runtime Profiles v9: `assetc --export-project-json` aceita `point_click_project`, `shmup_project`, `visual_novel_project`, `menu_project`, `cutscene_project` e `world_map_project`, normaliza aliases como `pointAndClick`/`shootEmUp`/`visualNovel`/`worldMap` e gera contratos nativos para todos esses perfis.
- Room Streaming v1: troca entre multiplas rooms por portal, com colisao/eventos recarregados por room.
- Collision v5: solido, bloqueios direcionais, slopes diagonais opcionais, consulta de efeitos e scripts enter/leave para agua/dano/escada.
- Room Metadata v1: camera, player start, musica e cor de fundo configuraveis por room.
- Eventos e Dialogo Visual v11: scripts por entrada de room, portal, trigger, efeito de tile, interacao, NPC e escolha de dialogo, com caixa de texto paginada, choices rolaveis, variaveis, branches, chamada de script, fila de scripts com prioridade/cancelamento, runner progressivo com `wait` real no template top-down e comandos basicos de ator/camera.
- Audio v24: SFX PSG reais por evento, musica PSG simples, tracker PSG por patterns/order com panning discreto por rota esquerda/direita, importacao MOD/S3M/VGM subset com speed/tempo, metadados de instrumento, controle de patterns, portamento, vibrato e tremolo aproximados, extracao de samples MOD/S3M para PCM com loop points, Direct Sound PCM 8-bit assinado, WAV importado, mixer PCM com ate 4 SFX simultaneos mais musica, streaming PCM mono/estereo por blocos com panning e estimativa constexpr `AudioMixCost`.
- Runtime Utilities v1: `gbs/random.hpp`, `gbs/format.hpp` e `gbs/info.hpp` oferecem RNG sem heap, formatacao limitada, informacao do alvo GBA e capacidades explicitas do backend de save.
- NPC Movement v2: `TopDownNpcMovementData` suporta patrulha horizontal/vertical, wander em caixa, follow player e path-to-point usando pathfinding BFS limitado sem heap, com atores bloqueadores e fallback para tile alcançavel mais proximo.
- Save System v7: bancos de slots fixos em SRAM 32 KB com assinatura, versao, checksum, sequence, records com metadata de titulo/tempo/room, helper de tempo formatado, autosave e menu de save/load com tres slots no `topdown_basic`, status explicito de backend nao suportado, builders host-testaveis de sequencias Flash/framing EEPROM sem habilitar escrita fisica, payloads publicos sem heap para persistir runtime platformer/isometrico/point-click/shmup/visual-novel/menu/cutscene/world-map e geracao de `gbs::SaveBank` por `assetc --export-project-json` nos generos exportaveis.
- UI v2: `gbs/ui.hpp` adiciona HUD em BG0, menu com itens desabilitados/cancelamento, paginacao, salto por L/R e menu de pausa com save/load manual no `topdown_basic`.

## Comandos

```sh
make test
make topdown_basic.gba
make platformer_basic.gba
make isometric_basic.gba
make package
make verify-package
make verify-export-fixture
make verify-stress
make verify-mgba-check
make verify-cross-platform-local
```

`make verify-cross-platform-local` arquiva somente uma evidencia `local_cross_platform_dry_run` da plataforma atual. Esse alvo e util para pacote local e bundle privado, mas nao libera `ready_for_primary_backend`; a promocao principal ainda exige stress manual mGBA, CI/hardware real cobrindo macOS/Windows/Linux e rollout privado da engine primaria validado.

O `assetc` gera headers C++ a partir de PNG indexed/RGBA 4bpp:

```sh
tools/assetc/assetc.py room.png -o room.hpp -n room --destination-tile 32 --palette-bank 1
```

O header contem `PaletteAsset`, `TileAsset` e `TileMapAsset` prontos para a API publica da engine.

Tilemaps gerados pelo exportador futuro tambem podem usar `Rle16TileMapAsset` para reduzir dados estaticos repetitivos antes da carga em VRAM.

```sh
tools/assetc/assetc.py room.png -o room.hpp -n room --destination-tile 32 --palette-bank 1 --rle-tilemap
```

Ou `Lz77TileMapAsset` estilo GBA para mapas com repeticao local mais variada:

```sh
tools/assetc/assetc.py room.png -o room.hpp -n room --destination-tile 32 --palette-bank 1 --lz77-tilemap
```

Para imagens bitmap dos modos 3/4/5:

```sh
tools/assetc/assetc.py splash.png -o splash.hpp -n splash --bitmap-mode 3
tools/assetc/assetc.py splash_indexed.png -o splash4.hpp -n splash4 --bitmap-mode 4 --palette-bank 0
```

Para backgrounds affine BG2/BG3 em 8bpp, gere um mapa quadrado de 16x16, 32x32, 64x64 ou 128x128 tiles:

```sh
tools/assetc/assetc.py affine_room.png -o affine_room.hpp -n affine_room --destination-tile 0 --affine-tilemap
```

Para collision flags top-down por tile, use uma cor/indice solido no PNG:

```sh
tools/assetc/assetc.py collision.png -o collision.hpp -n room_collision --collision-color-index 3
```

Para spritesheets com frame logico alinhado em 8 pixels, entre 8x8 e 128x128, o `assetc` gera uma `SpriteAnimation`. Os 12 formatos OBJ nativos permanecem como uma parte; os demais canvases sao decompostos automaticamente no menor conjunto de OBJ nativos, com tiles contiguos por parte:

```sh
tools/assetc/assetc.py player.png -o player.hpp -n player --destination-tile 0 --palette-bank 0 --sprite-width 16 --sprite-height 16 --frame-duration 8
```

Para um spritesheet OBJ com 256 cores, use 8bpp. O destino deve ser par porque cada tile logico ocupa dois tiles fisicos na VRAM de OBJ, e a paleta usa o banco OBJ global (palette 0):

```sh
tools/assetc/assetc.py player_256.png -o player_256.hpp -n player_256 --object-tiles --sprite-bpp 8 --destination-tile 0 --sprite-width 16 --sprite-height 16
```

No fluxo `--export-project-json`, os `destination_tile` e `palette_bank` gravados nos headers sao
derivados das alocacoes reais do `asset_pack`, evitando colisao entre assets simultaneos.

Para materializar um projeto externo completo a partir de um manifesto de export:

```sh
tools/assetc/assetc.py export_project.json -o build/exported_project --export-project-json
```

Os blocos `topdown_project`, `platformer_project` e `isometric_project` podem referenciar assets compilados por `assetc` usando includes e simbolos C++:

```json
{
  "includes": ["generated_room_bg.hpp", "player_sprite.hpp"],
  "assets": {
    "bg_palettes": ["generated_room_bg_palette_asset"],
    "obj_palettes": ["player_sprite_palette_asset"],
    "tile_assets": ["generated_room_bg_tile_asset", "player_sprite_tile_asset"]
  }
}
```

No top-down, `assets` tambem aceita `sfx_assets`, `music_assets`, `pcm_assets` e `tracker_assets`. Quando esses campos apontam para um asset de audio vindo do `asset_pack`, use a string do ID para o item `0` ou `{ "asset": "audio_pack", "index": 1 }` para escolher outro item do array gerado pelo header. Player e NPCs tambem podem referenciar sprites gerados pelo pack usando `metasprite: { "asset": "player_sprite", "index": 0 }` e `animation: { "asset": "player_sprite" }`. Em `platformer_project`, inimigos e plataformas moveis podem usar `metasprite`, `sprite`, `sprite_asset` ou `asset` para derivar `tile_index` e `palette`; em `isometric_project`, atores usam o mesmo formato para derivar o visual do metasprite gerado.

O top-down exportado tambem pode declarar `backgrounds`, conectando tilemaps gerados a BG0-BG3 com scroll/parallax. Nos tres generos, `resource_banks` reserva tiles, paletas e OAM por plano antes do carregamento:

```json
{
  "backgrounds": [
    {
      "layer": "bg1",
      "tilemap": "generated_room_bg_tilemap_asset",
      "scroll": { "x": 0, "y": 0 },
      "parallax": { "x": 128, "y": 128 }
    }
  ],
  "resource_banks": [
    { "kind": "bg_tiles", "start": 0, "count": 128, "alignment": 16, "name": "room_bg_tiles" },
    { "kind": "oam_sprites", "start": "auto", "count": 24, "alignment": 4, "name": "actors_oam" }
  ]
}
```

Quando o manifesto tambem declara `asset_pack`, `resource_banks` pode usar o atalho `"asset_pack"`. Nesse modo o `assetc --export-project-json` le `asset_pack_report.resource_bank_plan` e gera os `gbs::ResourceBank` a partir das alocacoes reais de tiles, paletas e OAM:

```json
{
  "topdown_project": {
    "resource_banks": "asset_pack"
  },
  "asset_pack": {
    "assets": [
      { "id": "room_bg", "kind": "bg", "png": "room_bg.png", "header": "room_bg.hpp" }
    ]
  }
}
```

Assets do pack podem declarar `bank_group` para agrupar bancos por room, area ou cena. O relatorio inclui `resource_bank_groups[]`; quando `resource_banks` usa `"asset_pack"`, o header exportado tambem recebe `constexpr gbs::ResourceBankGroup resource_bank_groups[]` e `project.resource_bank_group_count` para streaming por grupo sem reconstruir as alocacoes:

```json
{
  "assets": [
    { "id": "room_0_bg", "bank_group": "room_0", "kind": "bg", "png": "room_0.png" },
    { "id": "npc_sheet", "bank_group": "actors", "kind": "obj", "png": "npc.png" }
  ]
}
```

Os templates top-down, platformer e isometrico empacotados usam `rooms[].resource_bank_group` ou o fallback pelo nome da room para trocar automaticamente o grupo ativo quando a room muda, inclusive em restore de save. A troca usa `gbs::stream_resource_bank_group` com scratch buffer estatico, preservando rollback se a proxima room nao couber nos bancos planejados.

Quando `assetc --export-project-json` recebe um `asset_pack` com bancos derivados, o header gerado inclui `gbs::ResourceBankUploadSource[]` mapeando `bank_name` para os simbolos C++ de tiles/paletas. Os templates usam `stream_resource_bank_group_with_uploads` para trocar o grupo da room e enfileirar os uploads por DMA de VBlank em uma unica chamada; se faltar fonte, se a fila DMA estiver cheia ou se um banco nao couber, a engine retorna `ResourceStreamResult` com o banco afetado e o uso/fragmentacao do pool.

Para top-down, platformer, isometrico e runtimes nativos exportaveis como point-click, shmup, visual novel, menu, cutscene e world map, o bloco de projeto pode declarar o layout de save que o template exportado deve usar:

```json
{
  "save": {
    "enabled": true,
    "signature": "GBPF",
    "offset": 0,
    "slot_capacity": 1024,
    "slot_count": 1,
    "version": 1
  }
}
```

O header gerado expoe `constexpr bool save_enabled` e `constexpr gbs::SaveBank save_bank`; os templates empacotados consultam esses simbolos antes de restaurar, autosalvar ou habilitar opcoes de save/load.

Para top-down, o manifesto tambem pode declarar `topdown_project`; nesse caso o `assetc` gera um `gbastudio_project_data.hpp` minimo em vez de exigir que o app escreva o header manualmente:

```json
{
  "schema": 1,
  "backend": "gbastudio_engine",
  "kind": "topdown",
  "template_dir": "dist/GBAStudioEnginePack/templates/exported_topdown",
  "entry": "main.cpp",
  "project_data": "gbastudio_project_data.hpp",
  "generated_assets": [],
  "topdown_project": {
    "rooms": [
      {
        "name": "room_1",
        "width_tiles": 2,
        "height_tiles": 2,
        "visual_tiles": [0, 1, 1, 0],
        "collision_flags": [0, 0, 1, 1],
        "metadata": {
          "camera_mode": "fixed",
          "camera_position": { "x": 0, "y": 0 },
          "player_start": { "x": 8, "y": 8 },
          "backdrop_color": 31
        },
        "on_enter": [{ "op": "show_dialogue", "line": 0 }],
        "interactions": [
          {
            "area": { "x": 0, "y": 0, "width": 8, "height": 8 },
            "script": [{ "op": "set_variable", "variable": 1, "value": 4 }]
          }
        ],
        "npcs": [
          {
            "name": "guide",
            "position": { "x": 8, "y": 8 },
            "size": { "x": 16, "y": 16 },
            "on_interact": [{ "op": "show_dialogue", "line": 0 }]
          }
        ],
        "triggers": [
          {
            "area": { "x": 0, "y": 8, "width": 8, "height": 8 },
            "on_enter": [{ "op": "set_variable", "variable": 2, "value": 1 }]
          }
        ],
        "portals": [
          {
            "area": { "x": 8, "y": 0, "width": 8, "height": 8 },
            "target_room": 0,
            "target_position": { "x": 8, "y": 8 },
            "script": [{ "op": "play_sfx", "index": 0 }, { "op": "warp", "room": 0, "x": 8, "y": 8 }]
          }
        ]
      }
    ],
    "dialogue_lines": ["Hello from export"],
    "choice_groups": [
      {
        "line": 0,
        "variable": 4,
        "choices": [
          { "text": "YES", "value": 1, "script": [{ "op": "set_variable", "variable": 5, "value": 1 }] },
          { "text": "NO", "value": 2 }
        ]
      }
    ],
    "player": { "position": { "x": 8, "y": 8 }, "size": { "x": 16, "y": 16 }, "speed": 1 }
  }
}
```

Para plataforma, `platformer_project` gera `platformer_project_data.hpp` com salas, colisao, configuracao fisica, hazards, checkpoints, camera zones e scripts opcionais:

```json
{
  "schema": 1,
  "backend": "gbastudio_engine",
  "kind": "platformer",
  "template_dir": "dist/GBAStudioEnginePack/templates/exported_platformer",
  "entry": "main.cpp",
  "project_data": "platformer_project_data.hpp",
  "generated_assets": [],
  "platformer_project": {
    "initial_room": 0,
    "backdrop_color": 99,
    "config": { "gravity_x256": 56, "jump_speed_x256": 1280 },
    "rooms": [
      {
        "name": "stage_1",
        "width_tiles": 4,
        "height_tiles": 3,
        "visual_tiles": [0, 0, 0, 0, 0, 1, 0, 0, 2, 2, 2, 2],
        "collision_flags": [0, 0, 0, 0, 0, 4, 0, 0, 1, 1, 1, 1],
        "player_start": { "x": 8, "y": 8, "width": 16, "height": 16 },
        "camera": { "position": { "x": 0, "y": 0 }, "follow_player": true },
        "on_enter": [{ "op": "set_variable", "variable": 1, "value": 7 }],
        "hazards": [{ "area": { "x": 16, "y": 16, "width": 8, "height": 8 }, "damage": 1, "respawn": true, "on_hit": [{ "op": "play_sfx", "index": 0 }] }],
        "checkpoints": [{ "area": { "x": 8, "y": 8, "width": 16, "height": 16 }, "respawn_position": { "x": 8, "y": 8 }, "id": 1, "on_activate": [{ "op": "set_variable", "variable": 2, "value": 1 }] }],
        "camera_zones": [{ "area": { "x": 0, "y": 0, "width": 32, "height": 24 }, "bounds": { "x": 0, "y": 0, "width": 64, "height": 48 }, "on_enter": [{ "op": "set_camera_position", "x": 0, "y": 0 }] }]
      }
    ]
  }
}
```

Para isometrico, `isometric_project` gera `isometric_project_data.hpp` com grid, camera, colisao e atores iniciais:

```json
{
  "schema": 1,
  "backend": "gbastudio_engine",
  "kind": "isometric",
  "template_dir": "dist/GBAStudioEnginePack/templates/exported_isometric",
  "entry": "main.cpp",
  "project_data": "isometric_project_data.hpp",
  "generated_assets": [],
  "isometric_project": {
    "initial_room": 0,
    "backdrop_color": 123,
    "grid": { "tile_width_pixels": 32, "tile_height_pixels": 16, "origin": { "x": 120, "y": 24 } },
    "rooms": [
      {
        "name": "iso_room",
        "width_tiles": 3,
        "height_tiles": 3,
        "visual_tiles": [1, 1, 1, 1, 2, 1, 1, 1, 1],
        "collision_flags": [1, 1, 1, 1, 0, 1, 1, 1, 1],
        "camera": { "position": { "x": 0, "y": 0 }, "bounds": { "x": 0, "y": 0, "width": 96, "height": 48 }, "bounds_enabled": true },
        "actors": [
          { "tile": { "x": 1, "y": 1, "z": 0 }, "screen_offset": { "x": -8, "y": -16 }, "metasprite": { "asset": "iso_actor", "index": 0 }, "visible": true }
        ]
      }
    ]
  }
}
```

Para audio PSG programatico, tracker PSG e PCM 8-bit assinado, o `assetc` aceita JSON:

```sh
tools/assetc/assetc.py audio.json -o audio.hpp -n audio --audio-json
```

Antes de gerar headers finais, o exportador pode pedir um relatorio global de recursos com alocacao automatica e diagnostico de overflow:

```sh
tools/assetc/assetc.py asset_pack.json -o asset_pack_report.json --pack-json
```

O relatorio `GBAStudioAssetPackReport` cobre tiles BG/OBJ, tiles affine, paletas BG/OBJ, OAM e PCM bytes, inclui budgets, `budget_summary`, uso por bancos, `group_pressure_report`, `resource_bank_plan`, `resource_bank_groups`, `diagnostics[]` com severidade/codigo estavel, fingerprints por asset para cache/import incremental e `export_plan` com headers, simbolos, inputs e argumentos sugeridos do `assetc`. Uso a partir de 80% gera warning `GBS_ASSET_PACK_BUDGET_NEAR_LIMIT`; overflow retorna exit code diferente de zero e erro estruturado `GBS_ASSET_PACK_RESOURCE_OVERFLOW`. Para builds incrementais, passe o relatorio anterior e leia `rebuild_plan.assets.generate`, `rebuild_plan.assets.skip`, `rebuild_plan.assets.remove`, `export_plan.headers[].generate`, `export_plan.removed_headers`, `allocations[].status`, `allocations[].change_reason` e `incremental.assets.removed`:

No runtime/headers publicos, `RenderAssetCost` e `AudioMixCost` permitem que templates e exportadores estimem custo de assets sem carregar VRAM ou iniciar audio. O top-down empacotado valida esses custos no boot e publica counters temporarios para smoke/debug.

```sh
tools/assetc/assetc.py asset_pack.json -o asset_pack_report.json --pack-json --previous-pack-report previous_asset_pack_report.json
```

Entradas `pcm[]` podem usar `samples` assinados manualmente, `wav` relativo ao JSON, `mod_sample` apontando para um MOD ProTracker com `sample_index` de 1 a 31 ou `s3m_sample` apontando para um S3M com `instrument_index`. WAV PCM mono/stereo 8/16-bit, samples MOD e samples S3M 8/16-bit mono/stereo sao convertidos para `PcmAsset` 8-bit assinado; S3M stereo e downmixado para mono. `loop_start_sample`/`loop_end_sample` podem ser declarados no JSON e tambem sao extraidos de samples MOD/S3M quando o modulo tem loop nativo. No runtime, `play_pcm_sfx` pode tocar ate 4 SFX simultaneos com prioridade/volume, mixados com `play_pcm_music` em um stream PCM por blocos.
Entradas `tracker[]` geram `TrackerAsset` com patterns, steps e order table. Cada step pode declarar `pan` entre -127 e 127; SFX e musica tambem aceitam o mesmo campo, que roteia canais PSG discretamente para esquerda, direita ou ambas. Elas podem ser declaradas manualmente, apontar `mod` para um MOD ProTracker 4 canais, apontar `s3m` para um S3M subset ou apontar `vgm` para um VGM SN76489 subset. O conversor MOD aproveita notas/order, volume e finetune de sample, `0xy` arpeggio, `1xx`/`2xx` slides aproximados, `3xx` portamento aproximado, `4xy` vibrato aproximado, `7xy` tremolo aproximado, `Axy` volume slide, `Bxx` pattern jump, `Dxx` pattern break e efeitos basicos `Cxx`/`Fxx`, incluindo `Fxx > 32` como BPM aproximado; o conversor S3M aproveita notas/order, volume de instrumento, volume column, `Axx` speed, `Bxx` pattern jump, `Cxx` pattern break, `Txx` tempo, `Dxy` volume slide, `Exx`/`Fxx` slides aproximados, `Gxx` portamento aproximado, `Hxy` vibrato aproximado e `Rxy` tremolo aproximado; o conversor VGM aproveita writes PSG, waits basicos, mudancas de volume e noise SN76489, ignorando com seguranca stereo byte e data blocks auxiliares. Samples PCM dos modulos, chips VGM avancados e efeitos finos ainda nao sao reproduzidos como nos trackers originais.

O `gbsbuild` encapsula o build do Engine Pack para apps desktop chamarem por processo externo:

```sh
tools/gbsbuild/gbsbuild.py --engine-pack dist/GBAStudioEnginePack --project-dir /path/to/exported/project --target game
```

O `gbsdoctor` valida o pacote, projeto exportado e toolchain com saida amigavel para Electron:

```sh
tools/gbsdoctor/gbsdoctor.py --engine-pack dist/GBAStudioEnginePack --project-dir /path/to/exported/project --json
```

O JSON inclui plataforma, variaveis de ambiente relevantes, candidatos de executavel, resumo do `enginepack.json`, `engine_manifest.schemas`, `engine_manifest.sdk_templates`, capacidades achatadas e `diagnostics` com resumo por genero, templates SDK, asset banking, render cost, audio cost, stress readiness, `butano_replacement_readiness`, toolchain e `actionable_messages[]` para UI do Electron/GBA Studio, incluindo `.exe` para Windows/MSYS2. Quando `gbastudio_project.json` existe, o `gbsdoctor` tambem valida backend, genero (`kind`), entrada, dados do projeto, assets gerados, build config e requisitos de versao/features do Engine Pack.

`diagnostics.butano_replacement_readiness` e o gate de promocao: `stage == "beta_candidate"` indica que o pacote ainda e candidato privado; `ready_for_primary_backend == true` so deve acontecer depois de smokes manuais mGBA, hardware real ou CI e rollout privado da engine primaria com rollback legado validado.
O bloco tambem inclui `missing_manual_gates[]` e `next_actions[]`, com comandos sugeridos para app/CI guiar a promocao sem hardcode.
Para telas que so precisam do estado de promocao, use `gbsdoctor --readiness-only --json` em vez de parsear o relatorio completo.
Para CI/release que deve bloquear promocao acidental, use `gbsdoctor --require-primary-ready --json`; o comando falha enquanto `ready_for_primary_backend` for falso.
Para arquivar a decisao em um artefato de release/CI, use `gbsdoctor --write-readiness-report readiness_decision.json --json`. O contrato publico desse arquivo fica em `engine_manifest.schemas.readiness_report`; para validar um artefato arquivado, use `gbsdoctor --validate-readiness-report readiness_decision.json --json`. Para gerar um pacote completo de promocao para app/CI, use `gbsdoctor --write-promotion-bundle promotion_bundle --json`; o bundle inclui `gbsdoctor_report.json` com checks, diagnostics e manifest completo para auditoria, `public_schema_catalog.json` com os contratos publicos auditados, `promotion_summary.json` com resumo compacto para UI/CI, alem de `file_integrity` com SHA-256 dos artefatos internos. Quando `--readiness-evidence` tambem e usado, o bundle arquiva o `readiness_evidence.json` real e seu hash, alem do template inicial. Para validar o bundle depois, use `gbsdoctor --validate-promotion-bundle promotion_bundle --json`; a resposta inclui `readiness_summary` com gates faltantes, `public_schema_catalog_summary` com status dos contratos publicos, `promotion_summary_summary` com o estado compacto validado e usa o contrato publico `engine_manifest.schemas.promotion_bundle_validation`. Para bloquear CI/release ate o backend poder virar principal, combine com `--require-primary-ready`. Quando o app/CI precisar validar qualquer artefato publico sem duplicar regra, use `gbsdoctor --validate-public-schema <schema> --schema-document <arquivo> --json`; os schemas aceitos incluem `gbastudio_project`, `export_project`, `asset_pack`, `asset_pack_report`, `readiness_evidence`, `readiness_report`, `promotion_bundle`, `promotion_bundle_validation`, `promotion_summary` e `public_schema_catalog`. O valor especial `auto` detecta o schema pelo `backend`/`template_dir`/`kind` do JSON, por `assets[]` ou pelo formato de `readiness_evidence`. Para descobrir a lista suportada sem hardcode no app, use `gbsdoctor --list-public-schemas --json`; para arquivar esse catalogo em disco, use `gbsdoctor --write-public-schema-catalog public_schema_catalog.json --json`; para comparar um catalogo arquivado contra o Engine Pack atual, use `gbsdoctor --verify-public-schema-catalog public_schema_catalog.json --json`. O catalogo inclui `size_bytes`, `sha256` e `missing_schemas` para verificacao de integridade do pacote, e pode ser validado pelo schema publico `public_schema_catalog`.

Evidencias externas podem ser anexadas com `--readiness-evidence` ou `GBS_READINESS_EVIDENCE`. O arquivo deve declarar `manual_mgba_stress_smoke`, `hardware_or_ci_validation` e `gba_studio_engine_primary_rollout`. Gates `ok: true` precisam ser objetos com `evidence_type`, `source` e `checked_at`; sem isso, a evidencia e rejeitada como incompleta. Tipos aceitos: `manual_mgba_stress_smoke`, `hardware_real`, `cross_platform_ci`, `local_cross_platform_dry_run` e `gba_studio_engine_primary_rollout`. `local_cross_platform_dry_run` e evidenciavel, mas nao promove backend principal; `cross_platform_ci` so promove quando `validated_platforms` cobre `macos`, `windows` e `linux`. Sem esse arquivo, o pacote permanece em `beta_candidate`.

Depois de abrir e confirmar manualmente as stress ROMs no mGBA, `scripts/smoke_mgba.sh` pode gravar uma evidencia parcial do gate visual. Esse comando exige `--stress` e `--manual-pass`, nao funciona em `--check-only`, e deixa `hardware_or_ci_validation` e `gba_studio_engine_primary_rollout` pendentes para impedir promocao principal acidental:

```sh
scripts/smoke_mgba.sh --stress --manual-pass --write-readiness-evidence readiness_evidence.json --evidence-source build/smoke/mgba_stress_manual_report.md
tools/gbsdoctor/gbsdoctor.py --validate-public-schema readiness_evidence --schema-document readiness_evidence.json --json
```

Depois de uma execucao real em CI ou hardware validado, `tools/verify_cross_platform` pode gravar a evidencia parcial do gate `hardware_or_ci_validation`. Esse comando exige `--hardware-ci-pass`, nao aceita `--skip-toolchain` nesse modo, e mantem smoke mGBA e rollout privado da engine primaria pendentes:

```sh
tools/verify_cross_platform --engine-pack dist/GBAStudioEnginePack --project-dir build/verify-package/generated_project --output build/cross-platform-report.json --hardware-ci-pass --write-readiness-evidence readiness_evidence.json --evidence-source build/cross-platform-report.json
tools/gbsdoctor/gbsdoctor.py --validate-public-schema readiness_evidence --schema-document readiness_evidence.json --json
```

Para validacao local de release, `make verify-cross-platform-local` usa o mesmo contrato publico, mas grava `evidence_type: "local_cross_platform_dry_run"` com apenas a plataforma atual em `validated_platforms`. O `gbsdoctor` aceita esse artefato como evidencia auditavel e continua bloqueando `--require-primary-ready`.

Depois de um rollout privado da engine primaria/export smoke validado com rollback legado preservado, `production_smoke` pode gravar a evidencia parcial do gate `gba_studio_engine_primary_rollout`. Esse comando exige `--engine-primary-rollout-pass`, nao aceita `--skip-build` nesse modo, e mantem smoke mGBA e hardware/CI pendentes:

```sh
dist/GBAStudioEnginePack/tools/production_smoke --engine-pack dist/GBAStudioEnginePack --build-root build/production-smoke-rollout --json --engine-primary-rollout-pass --write-readiness-evidence readiness_evidence.json --evidence-source build/production-smoke-report.json
tools/gbsdoctor/gbsdoctor.py --validate-public-schema readiness_evidence --schema-document readiness_evidence.json --json
```

Para criar um arquivo inicial de evidencias:

```sh
tools/gbsdoctor/gbsdoctor.py --print-readiness-evidence-template > readiness_evidence.json
```

Ou, para uso direto por app/CI sem redirecionamento de shell:

```sh
tools/gbsdoctor/gbsdoctor.py --write-readiness-evidence-template readiness_evidence.json --json
```

Para marcar um gate como validado sem editar JSON manualmente:

```sh
tools/gbsdoctor/gbsdoctor.py --update-readiness-evidence readiness_evidence.json --readiness-gate manual_mgba_stress_smoke --readiness-gate-ok true --readiness-gate-evidence-type manual_mgba_stress_smoke --readiness-gate-source "mGBA smoke log" --readiness-gate-checked-at "2026-06-11T13:00:00Z" --json
```

Para combinar evidencias parciais geradas por `smoke_mgba`, `verify_cross_platform` e `production_smoke` em um arquivo unico:

```sh
tools/gbsdoctor/gbsdoctor.py --merge-readiness-evidence readiness_evidence.json --readiness-evidence-input readiness_evidence_mgba.json --readiness-evidence-input readiness_evidence_hardware.json --readiness-evidence-input readiness_evidence_rollout.json --json
```

Para gerar o relatorio de decisao local:

```sh
make verify-beta-readiness
```

O `production_smoke` roda um smoke automatizado do Engine Pack para os tres templates e para um projeto gerado por `assetc --export-project-json`:

```bash
dist/GBAStudioEnginePack/tools/production_smoke --engine-pack dist/GBAStudioEnginePack --json
dist/GBAStudioEnginePack/tools/production_smoke --engine-pack dist/GBAStudioEnginePack --skip-build --json
```

O `stress_projects` roda projetos sinteticos grandes para medir prontidao de producao antes de promover `gbastudio_engine` como backend beta:

```bash
make verify-stress
dist/GBAStudioEnginePack/tools/stress_projects --engine-pack dist/GBAStudioEnginePack --json
```

Os alvos sao `topdown_large`, `platformer_large`, `isometric_large`, `sprites_oam_heavy`, `tilesets_vram_heavy` e `audio_heavy`. O relatorio `stress_report.json` inclui status de `assetc`, `gbsdoctor`, `gbsbuild`, ROM gerada, `asset_pack_report`, uso por grupo e fragmentacao.

`engine_manifest.sdk_templates` lista `topdown_basic`, `platformer_basic` e `isometric_basic` com genero, entrypoint, project data e features requeridas. Esse e o ponto de descoberta recomendado para a UI futura escolher o tipo de projeto sem depender de arquivos privados.

O pacote tambem inclui `templates/exported_topdown`, `templates/exported_platformer`, `templates/exported_isometric`, `templates/exported_shmup` e os demais fixtures de runtime profile com `gbastudio_project.json`, `main.cpp` e headers de dados estaticos. Use `make verify-export-fixture` para validar que esses projetos compilam fora do repo privado usando apenas o Engine Pack.

Os schemas publicos ficam em `schemas/gbastudio_project.schema.json`, `schemas/asset_pack.schema.json`, `schemas/asset_pack_report.schema.json`, `schemas/export_project.schema.json`, `schemas/readiness_evidence.schema.json`, `schemas/readiness_report.schema.json`, `schemas/promotion_bundle.schema.json`, `schemas/promotion_bundle_validation.schema.json`, `schemas/promotion_summary.schema.json` e `schemas/public_schema_catalog.schema.json`. O campo `gbastudio_project.json.build.target` permite que `gbsbuild` escolha o nome da ROM quando o app nao passar `--target`. `gbsdoctor --validate-public-schema auto --schema-document <json>` valida esses contratos antes do build/export usando uma interface unica para Swift, Electron e CI.

Se `arm-none-eabi-*` nao estiver no `PATH`, o Makefile usa:

```sh
DEVKITPRO=/opt/devkitpro
DEVKITARM=/opt/devkitpro/devkitARM
```

## Estrutura

- `engine/include/gbs`: API publica.
- `engine/src`: runtime privado.
- `engine/startup`: boot, linker script e entrada GBA.
- `tools/assetc`: conversor de assets.
- `schemas`: contrato JSON publico para manifesto de projeto, asset pack, entrada de export, evidencias e relatorio de promocao do backend.
- `templates/exported_topdown`: fixture de projeto exportado top-down para o backend futuro.
- `templates/exported_shmup`: fixture de projeto exportado shoot-em-up nativo para o backend futuro.
- `templates/exported_platformer`: fixture de projeto exportado platformer para o backend futuro.
- `templates/exported_isometric`: fixture de projeto exportado isometrico para o backend futuro.
- `examples/topdown_basic`: primeiro jogo/demo jogavel.
- `tests/host`: testes que rodam no macOS.

## Contrato de integracao futura

O GBA Studio deve consumir futuramente apenas o pacote fechado:

- `include/`
- `lib/libgbastudio_engine.a`
- `templates/`
- `enginepack.json`
- `CHANGELOG.md`
- `assetc`
- `gbsbuild`
- `gbsdoctor`
- `production_smoke`
- `stress_projects`
- `enginepack.json`
- `VERSION`
- `LICENSE`

O codigo-fonte em `engine/src` nao faz parte da distribuicao publica.

O contrato cross-platform para Electron fica em `docs/ELECTRON_COMPATIBILITY.md`.
